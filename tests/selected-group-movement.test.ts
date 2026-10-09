import { expect, test } from "bun:test";
import type { ViewAnnotation } from "@structsmith/contracts";
import {
  boundaryMoveEntries,
  buildGraph,
  computeCanvasBoundaries,
} from "../apps/web/src/features/canvas/graph";
import {
  selectedGroupMovement,
  translateSectionFrames,
} from "../apps/web/src/features/canvas/sections";
import { createTestContext, createWorkspace } from "./helpers";

test("selected nested Sections union shared members and annotations exactly once", () => {
  const { services, close } = createTestContext();
  try {
    const workspace = createWorkspace(services);
    const parent = services.elements.create(workspace.id, {
      kind: "workflowGroup",
      name: "Expanded",
    }).result;
    const child = services.elements.create(workspace.id, {
      kind: "action",
      name: "Capture",
      parentId: parent.id,
    }).result;
    const outside = services.elements.create(workspace.id, {
      kind: "action",
      name: "Outside",
    }).result;
    const otherMember = services.elements.create(workspace.id, {
      kind: "action",
      name: "Other member",
    }).result;
    const view = services.views.create(workspace.id, {
      name: "Groups",
      kind: "workflow",
      elementIds: [parent.id, child.id, outside.id, otherMember.id],
      settings: { boundaryLayer: "custom" },
    }).result;
    const outer = services.boundaries.create(workspace.id, {
      viewId: view.id,
      name: "Outer",
      kind: "custom",
      layer: "custom",
      elementIds: [parent.id],
    }).result;
    const inner = services.boundaries.create(workspace.id, {
      viewId: view.id,
      name: "Inner",
      kind: "custom",
      layer: "custom",
      parentBoundaryId: outer.id,
      elementIds: [child.id],
    }).result;
    const unrelated = services.boundaries.create(workspace.id, {
      viewId: view.id,
      name: "Other",
      kind: "custom",
      layer: "custom",
      elementIds: [otherMember.id],
    }).result;
    const annotations: ViewAnnotation[] = [
      {
        id: "nested",
        kind: "note",
        text: "Nested",
        x: 50,
        y: 50,
        width: 220,
        height: 100,
        sectionId: inner.id,
      },
      {
        id: "free",
        kind: "text",
        text: "Explicit selection",
        x: 1000,
        y: 1000,
        width: 220,
        height: 60,
      },
      {
        id: "other",
        kind: "note",
        text: "Leave alone",
        x: 0,
        y: 0,
        width: 220,
        height: 100,
        sectionId: unrelated.id,
      },
    ];
    services.views.update(workspace.id, view.id, {
      settings: {
        annotations,
        sectionFrames: Object.fromEntries(
          [outer, inner, unrelated].map((section) => [
            `boundary:${section.id}`,
            { x: 0, y: 0, width: 600, height: 400 },
          ]),
        ),
      },
    });
    const detail = services.views.get(view.id);
    const elements = new Map(
      services.elements.list(workspace.id).map((element) => [element.id, element]),
    );
    const boundaries = services.boundaries.list(view.id);
    const graph = buildGraph({
      view: detail,
      elements: [...elements.values()],
      relationships: [],
      records: [],
    });
    const sections = computeCanvasBoundaries(
      graph.nodes
        .filter((node) => node.type === "element")
        .map((node) => ({ id: node.id, ...node.position, width: 220, height: 100 })),
      elements,
      boundaries,
      "custom",
      true,
      detail.settings.sectionFrames,
    ).semanticBoundaries;
    const selected = [
      ...sections.filter(
        (node) => node.data.boundaryId === outer.id || node.data.boundaryId === inner.id,
      ),
      ...graph.nodes.filter(
        (node) =>
          node.id === child.id || node.id === "annotation:nested" || node.id === "annotation:free",
      ),
    ];
    const group = selectedGroupMovement(
      selected,
      sections,
      elements,
      boundaries,
      "custom",
      new Set([parent.id]),
      annotations,
    );
    expect([...group.members].sort()).toEqual([parent.id, child.id].sort());
    expect(group.annotations.map((annotation) => annotation.id)).toEqual(["nested", "free"]);
    expect([...group.frameIds].sort()).toEqual(
      [`boundary:${outer.id}`, `boundary:${inner.id}`].sort(),
    );
    const moved = boundaryMoveEntries(detail.elements, group.members, { x: 40, y: 20 });
    expect(moved.map((entry) => entry.elementId).sort()).toEqual([parent.id, child.id].sort());
    const before = detail.elements.find((entry) => entry.elementId === child.id);
    if (!before) throw new Error("Missing child placement");
    expect(moved.find((entry) => entry.elementId === child.id)).toMatchObject({
      x: before.x + 40,
      y: before.y + 20,
    });
    const frames = translateSectionFrames(
      detail.settings.sectionFrames,
      "none",
      { x: 40, y: 20 },
      group.frameIds,
    );
    expect(frames[`boundary:${inner.id}`]).toMatchObject({ x: 40, y: 20 });
    expect(frames[`boundary:${unrelated.id}`]).toMatchObject({ x: 0, y: 0 });
    const disjoint = selectedGroupMovement(
      [
        ...sections.filter(
          (node) => node.data.boundaryId === outer.id || node.data.boundaryId === unrelated.id,
        ),
        ...graph.nodes.filter((node) => node.id === outside.id),
      ],
      sections,
      elements,
      boundaries,
      "custom",
      new Set(),
      annotations,
    );
    expect([...disjoint.members].sort()).toEqual(
      [parent.id, child.id, otherMember.id, outside.id].sort(),
    );
    expect(disjoint.annotations.map((annotation) => annotation.id)).toEqual(["nested", "other"]);
    expect(disjoint.frameIds.size).toBe(3);
    expect(
      boundaryMoveEntries(
        detail.elements.map((entry) =>
          entry.elementId === child.id ? { ...entry, locked: true } : entry,
        ),
        group.members,
        { x: 40, y: 20 },
      ),
    ).toEqual([]);
  } finally {
    close();
  }
});
