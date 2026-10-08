import { expect, test } from "bun:test";
import { ViewSettingsSchema } from "@structsmith/contracts";
import { computeCanvasBoundaries, type FlowNode } from "../apps/web/src/features/canvas/graph";
import {
  fitSectionFrame,
  sectionMembershipOperations,
  translateSectionFrames,
} from "../apps/web/src/features/canvas/sections";
import { createTestContext, createWorkspace } from "./helpers";

const rectangle = { x: 50, y: 60, width: 600, height: 400 };

test("section frames validate geometry and legacy settings preserve defaults", () => {
  expect(ViewSettingsSchema.parse({}).sectionFrames).toEqual({});
  for (const frame of [
    { ...rectangle, width: -1 },
    { ...rectangle, height: 0 },
    { ...rectangle, x: Number.POSITIVE_INFINITY },
  ])
    expect(
      ViewSettingsSchema.safeParse({ sectionFrames: { "boundary:example": frame } }).success,
    ).toBe(false);
});

test("sections keep manual bounds after objects move out and empty sections stay visible", () => {
  const { services, close } = createTestContext();
  try {
    const workspace = createWorkspace(services);
    const parent = services.elements.create(workspace.id, {
      kind: "custom",
      name: "Legacy section",
    }).result;
    const card = services.elements.create(workspace.id, {
      kind: "action",
      name: "Capture",
      parentId: parent.id,
    }).result;
    const view = services.views.create(workspace.id, {
      kind: "workflow",
      name: "Flow",
      elementIds: [card.id],
    }).result;
    const boundary = services.boundaries.create(workspace.id, {
      viewId: view.id,
      kind: "custom",
      name: "Section",
    }).result;
    const saved = {
      [`boundary:${boundary.id}`]: rectangle,
      [`boundary:${parent.id}`]: { ...rectangle, x: -600 },
    };
    services.views.update(workspace.id, view.id, { settings: { sectionFrames: saved } });
    const rendered = computeCanvasBoundaries(
      [{ id: card.id, x: 999, y: 999, width: 200, height: 100 }],
      new Map(services.elements.list(workspace.id).map((element) => [element.id, element])),
      [boundary],
      "deployment",
      true,
      saved,
    );
    expect(rendered.semanticBoundaries[0]).toMatchObject({
      position: { x: 50, y: 60 },
      width: 600,
      height: 400,
      data: { section: true },
      measured: { width: 600, height: 400 },
    });
    expect(rendered.parentBoundaries[0]?.position.x).toBe(-600);
    expect(rendered.parentBoundaries[0]?.measured).toEqual({ width: 600, height: 400 });
    services.elements.update(workspace.id, card.id, { parentId: null });
    const empty = computeCanvasBoundaries(
      [],
      new Map(services.elements.list(workspace.id).map((element) => [element.id, element])),
      [boundary],
      "deployment",
      true,
      saved,
    );
    expect(empty.parentBoundaries).toHaveLength(1);
    expect(empty.semanticBoundaries).toHaveLength(1);
    expect(
      translateSectionFrames(saved, `boundary:${boundary.id}`, { x: 100, y: -20 })[
        `boundary:${boundary.id}`
      ],
    ).toEqual({ ...rectangle, x: 150, y: 40 });
  } finally {
    close();
  }
});

test("dragging adds, removes and transfers section membership, including legacy custom parents", () => {
  const { services, close } = createTestContext();
  try {
    const workspace = createWorkspace(services);
    const legacy = services.elements.create(workspace.id, {
      kind: "custom",
      name: "Legacy",
    }).result;
    const card = services.elements.create(workspace.id, {
      kind: "action",
      name: "Card",
      parentId: legacy.id,
    }).result;
    const view = services.views.create(workspace.id, {
      kind: "workflow",
      name: "Flow",
      elementIds: [card.id],
    }).result;
    const first = services.boundaries.create(workspace.id, {
      viewId: view.id,
      kind: "custom",
      name: "First",
    }).result;
    const second = services.boundaries.create(workspace.id, {
      viewId: view.id,
      kind: "custom",
      name: "Second",
    }).result;
    const frames = [first, second].map((boundary, index) => ({
      id: `boundary:${boundary.id}`,
      type: "boundary",
      position: { x: index * 700, y: 0 },
      width: 600,
      height: 400,
      data: { section: true, boundaryId: boundary.id, name: boundary.name, classification: null },
    })) as FlowNode[];
    const moved = (x: number) =>
      [
        {
          id: card.id,
          type: "element",
          position: { x, y: 100 },
          width: 200,
          height: 100,
          data: {},
        },
      ] as FlowNode[];
    const apply = (x: number) =>
      services.model.applyOperations(
        workspace.id,
        {
          operations: sectionMembershipOperations(
            moved(x),
            frames,
            new Map(services.elements.list(workspace.id).map((element) => [element.id, element])),
            services.boundaries.list(view.id),
          ),
        },
        "ui",
      );
    const topEdge = moved(100);
    const topNode = topEdge[0];
    if (!topNode) throw new Error("Missing moved card");
    topNode.position.y = 10;
    expect(
      sectionMembershipOperations(
        topEdge,
        frames,
        new Map(services.elements.list(workspace.id).map((element) => [element.id, element])),
        services.boundaries.list(view.id),
      ),
    ).toContainEqual({
      op: "setBoundaryMembers",
      boundaryId: first.id,
      elementIds: [card.id],
      mode: "add",
    });
    apply(100);
    expect(
      services.boundaries.list(view.id).find((item) => item.id === first.id)?.elementIds,
    ).toEqual([card.id]);
    expect(
      services.elements.list(workspace.id).find((item) => item.id === card.id)?.parentId,
    ).toBeNull();
    apply(800);
    expect(
      services.boundaries.list(view.id).find((item) => item.id === first.id)?.elementIds,
    ).toEqual([]);
    expect(
      services.boundaries.list(view.id).find((item) => item.id === second.id)?.elementIds,
    ).toEqual([card.id]);
    const removed = apply(1400);
    expect(services.boundaries.list(view.id).every((item) => item.elementIds.length === 0)).toBe(
      true,
    );
    services.snapshots.restore(removed.snapshotId as string);
    expect(
      services.boundaries.list(view.id).find((item) => item.id === second.id)?.elementIds,
    ).toEqual([card.id]);
    const legacyFrame = {
      ...frames[0],
      data: { section: true, elementId: legacy.id, name: legacy.name, classification: null },
    } as FlowNode;
    const operations = sectionMembershipOperations(
      moved(100),
      [legacyFrame],
      new Map(services.elements.list(workspace.id).map((element) => [element.id, element])),
      services.boundaries.list(view.id),
    );
    services.model.applyOperations(workspace.id, { operations }, "ui");
    expect(services.elements.list(workspace.id).find((item) => item.id === card.id)?.parentId).toBe(
      legacy.id,
    );
  } finally {
    close();
  }
});

test("section geometry is view-scoped, revision guarded, undoable, importable and pruned on deletion", () => {
  const { services, close } = createTestContext();
  try {
    const workspace = createWorkspace(services);
    const card = services.elements.create(workspace.id, { kind: "action", name: "Card" }).result;
    const view = services.views.create(workspace.id, {
      kind: "workflow",
      name: "Flow",
      elementIds: [card.id],
    }).result;
    const otherView = services.views.create(workspace.id, {
      kind: "workflow",
      name: "Other",
    }).result;
    const unrelated = services.elements.create(workspace.id, {
      kind: "custom",
      name: "Unrelated",
    }).result;
    const section = services.boundaries.create(workspace.id, {
      viewId: view.id,
      kind: "custom",
      name: "Section",
    }).result;
    const remaining = services.boundaries.create(workspace.id, {
      viewId: view.id,
      kind: "custom",
      name: "Remaining",
    }).result;
    const frameKey = `boundary:${section.id}`;
    const remainingKey = `boundary:${remaining.id}`;
    expect(() =>
      services.views.update(workspace.id, otherView.id, {
        settings: { sectionFrames: { [frameKey]: rectangle } },
      }),
    ).toThrow();
    expect(() =>
      services.views.update(workspace.id, view.id, {
        settings: { sectionFrames: { [`boundary:${unrelated.id}`]: rectangle } },
      }),
    ).toThrow();
    const revision = services.workspaces.get(workspace.id).revision;
    const request = {
      expectedRevision: revision,
      operations: [
        {
          op: "updateView" as const,
          viewId: view.id,
          data: {
            settings: { sectionFrames: { [frameKey]: rectangle, [remainingKey]: rectangle } },
          },
        },
      ],
    };
    const saved = services.model.applyOperations(workspace.id, request, "ui");
    expect(() => services.model.applyOperations(workspace.id, request, "ui")).toThrow();
    expect(services.views.get(view.id).settings.sectionFrames[frameKey]).toEqual(rectangle);
    const exported = services.model.getDocument(workspace.id);
    const imported = services.imports.importDocument(exported, { name: "Copy" });
    const importedView = services.views
      .list(imported.id)
      .find((candidate) => candidate.name === view.name);
    if (!importedView) throw new Error("Missing imported view");
    const importedSection = services.boundaries
      .list(importedView.id)
      .find((candidate) => candidate.name === section.name);
    if (!importedSection) throw new Error("Missing imported section");
    expect(
      services.views.get(importedView.id).settings.sectionFrames[`boundary:${importedSection.id}`],
    ).toEqual(rectangle);
    expect(importedSection.id).not.toBe(section.id);
    services.snapshots.restore(saved.snapshotId as string);
    expect(services.views.get(view.id).settings.sectionFrames).toEqual({});
    services.views.update(workspace.id, view.id, {
      settings: { sectionFrames: { [frameKey]: rectangle, [remainingKey]: rectangle } },
    });
    services.boundaries.delete(workspace.id, section.id);
    expect(services.views.get(view.id).settings.sectionFrames[frameKey]).toBeUndefined();
    services.views.update(workspace.id, view.id, {
      settings: {
        sectionFrames: {
          ...services.views.get(view.id).settings.sectionFrames,
          [remainingKey]: { ...rectangle, width: 800 },
        },
      },
    });
    expect(services.views.get(view.id).settings.sectionFrames[remainingKey]?.width).toBe(800);
    services.views.autoLayout(workspace.id, view.id);
    expect(services.views.get(view.id).settings.sectionFrames[remainingKey]?.width).toBe(800);
    services.boundaries.update(workspace.id, remaining.id, { elementIds: [card.id] });
    services.views.autoLayout(workspace.id, view.id);
    expect(services.views.get(view.id).settings.sectionFrames).toEqual({});
  } finally {
    close();
  }
});

test("group translation moves explicit nested sections and leaves unrelated overlapping frames alone", () => {
  const frames = {
    "boundary:parent": rectangle,
    "boundary:nested": { ...rectangle, x: 100, y: 120, width: 200, height: 160 },
    "boundary:neighbor": { ...rectangle, x: 100, y: 120, width: 200, height: 160 },
  };
  const translated = translateSectionFrames(
    frames,
    "boundary:parent",
    { x: 40, y: -30 },
    new Set(["boundary:nested"]),
  );
  expect(translated["boundary:parent"]).toEqual({ ...rectangle, x: 90, y: 30 });
  expect(translated["boundary:nested"]).toMatchObject({ x: 140, y: 90 });
  expect(translated["boundary:neighbor"]).toEqual(frames["boundary:neighbor"]);
});

test("deleting a legacy section prunes only its view geometry and permits later saves", () => {
  const { services, close } = createTestContext();
  try {
    const workspace = createWorkspace(services);
    const parent = services.elements.create(workspace.id, {
      kind: "custom",
      name: "Legacy",
    }).result;
    const card = services.elements.create(workspace.id, {
      kind: "action",
      name: "Card",
      parentId: parent.id,
    }).result;
    const view = services.views.create(workspace.id, {
      kind: "workflow",
      name: "Flow",
      elementIds: [card.id],
    }).result;
    const section = services.boundaries.create(workspace.id, {
      viewId: view.id,
      kind: "custom",
      name: "Remaining",
    }).result;
    services.views.update(workspace.id, view.id, {
      settings: {
        sectionFrames: {
          [`boundary:${parent.id}`]: rectangle,
          [`boundary:${section.id}`]: rectangle,
        },
      },
    });
    services.elements.delete(workspace.id, parent.id, { cascade: false });
    expect(
      services.views.get(view.id).settings.sectionFrames[`boundary:${parent.id}`],
    ).toBeUndefined();
    expect(
      services.elements.list(workspace.id).find((element) => element.id === card.id)?.parentId,
    ).toBeNull();
    services.views.update(workspace.id, view.id, {
      settings: {
        sectionFrames: {
          ...services.views.get(view.id).settings.sectionFrames,
          [`boundary:${section.id}`]: { ...rectangle, height: 600 },
        },
      },
    });
    expect(
      services.views.get(view.id).settings.sectionFrames[`boundary:${section.id}`]?.height,
    ).toBe(600);
  } finally {
    close();
  }
});

test("fit section wraps only its member bounds without moving objects or reserving an inside title band", () => {
  const sources = [
    { id: "first", x: 100, y: 50, width: 220, height: 96 },
    { id: "second", x: 450, y: 210, width: 300, height: 180 },
    { id: "neighbor", x: -500, y: -900, width: 5000, height: 9000 },
  ];
  const before = structuredClone(sources);
  expect(fitSectionFrame(sources, new Set(["first", "second"]))).toEqual({
    x: 72,
    y: 22,
    width: 706,
    height: 396,
  });
  expect(sources).toEqual(before);
  expect(fitSectionFrame(sources, new Set(["missing"]))).toBeNull();
  expect(fitSectionFrame([], new Set())).toBeNull();
  expect(
    fitSectionFrame([{ id: "small", x: -200, y: -40, width: 1, height: 1 }], new Set(["small"])),
  ).toEqual({ x: -228, y: -68, width: 120, height: 80 });
  expect(
    fitSectionFrame(
      [{ id: "first", x: Number.NaN, y: 50, width: 220, height: 96 }],
      new Set(["first"]),
    ),
  ).toBeNull();
});
