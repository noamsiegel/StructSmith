import { expect, test } from "bun:test";
import type { ArchitectureBoundary, ArchitectureElement } from "@structsmith/contracts";
import { boundaryMemberIds, boundaryMoveEntries } from "../apps/web/src/features/canvas/graph";
import { createTestContext, createWorkspace } from "./helpers";

const members = new Set(["first", "second", "hidden"]);
const placements = [
  { elementId: "first", x: 10, y: 20, locked: false },
  { elementId: "second", x: 310, y: 90, locked: false },
  { elementId: "hidden", x: -50, y: 40, locked: false },
  { elementId: "outside", x: 10, y: 20, locked: false },
];

test("group translation preserves spacing, excludes neighbors, and returns to origin", () => {
  expect(boundaryMoveEntries(placements, members, { x: 64.2, y: -31.8 })).toEqual([
    { elementId: "first", x: 74, y: -12 },
    { elementId: "second", x: 374, y: 58 },
    { elementId: "hidden", x: 14, y: 8 },
  ]);
  expect(boundaryMoveEntries(placements, members, { x: 0, y: 0 })).toEqual(
    placements.slice(0, 3).map(({ elementId, x, y }) => ({ elementId, x, y })),
  );
  expect(boundaryMoveEntries(placements, new Set(), { x: 64, y: 32 })).toEqual([]);
  expect(boundaryMoveEntries(placements, members, { x: Number.NaN, y: 32 })).toEqual([]);
  expect(
    boundaryMoveEntries(
      placements.map((entry) => ({ ...entry, locked: entry.elementId === "hidden" })),
      members,
      { x: 64, y: 32 },
    ),
  ).toEqual([]);
});

test("boundary membership follows descendants and its active layer, never overlapping cards", () => {
  const elements = new Map(
    [
      { id: "group", parentId: null },
      { id: "first", parentId: "group" },
      { id: "nested", parentId: "group" },
      { id: "second", parentId: "nested" },
      { id: "hidden", parentId: null },
      { id: "outside", parentId: null },
    ].map((element) => [element.id, element as ArchitectureElement]),
  );
  const boundaries = [
    { id: "frame", parentBoundaryId: null, layer: "custom", elementIds: ["first"] },
    {
      id: "child",
      parentBoundaryId: "frame",
      layer: "custom",
      elementIds: ["second", "hidden", "first"],
    },
    { id: "other-layer", parentBoundaryId: "frame", layer: "security", elementIds: ["outside"] },
  ] as ArchitectureBoundary[];
  expect([...boundaryMemberIds({ boundaryId: "frame" }, elements, boundaries, "custom")]).toEqual([
    "first",
    "second",
    "hidden",
  ]);
  expect([...boundaryMemberIds({ elementId: "group" }, elements, boundaries, "custom")]).toEqual([
    "first",
    "nested",
    "second",
  ]);
  expect([...boundaryMemberIds({ boundaryId: "missing" }, elements, boundaries, "custom")]).toEqual(
    [],
  );
});

test("group layout batch is guarded, atomic, and restored in one snapshot", () => {
  const { services, close } = createTestContext();
  try {
    const workspace = createWorkspace(services);
    const first = services.elements.create(workspace.id, { kind: "action", name: "First" }).result;
    const second = services.elements.create(workspace.id, {
      kind: "action",
      name: "Second",
    }).result;
    const view = services.views.create(workspace.id, {
      kind: "workflow",
      name: "Flow",
      elementIds: [first.id, second.id],
    }).result;
    services.views.saveLayout(workspace.id, view.id, [
      { elementId: first.id, x: 10, y: 20 },
      { elementId: second.id, x: 310, y: 90, hidden: true },
    ]);
    const before = services.views.get(view.id);
    const revision = services.workspaces.get(workspace.id).revision;
    const entries = boundaryMoveEntries(before.elements, new Set([first.id, second.id]), {
      x: 64,
      y: 32,
    });
    const command = {
      expectedRevision: revision,
      operations: [{ op: "setLayout" as const, viewId: view.id, entries }],
    };
    const moved = services.model.applyOperations(workspace.id, command, "ui");
    expect(
      services.views
        .get(view.id)
        .elements.map(({ elementId, x, y, hidden }) => ({ elementId, x, y, hidden })),
    ).toEqual([
      { elementId: first.id, x: 74, y: 52, hidden: false },
      { elementId: second.id, x: 374, y: 122, hidden: true },
    ]);
    expect(() => services.model.applyOperations(workspace.id, command, "ui")).toThrow();
    expect(services.views.get(view.id).elements[0]?.x).toBe(74);
    services.snapshots.restore(moved.snapshotId as string);
    expect(services.views.get(view.id).elements).toEqual(before.elements);
    expect(
      services.elements.list(workspace.id).find((element) => element.id === first.id)?.parentId,
    ).toBeNull();
  } finally {
    close();
  }
});
