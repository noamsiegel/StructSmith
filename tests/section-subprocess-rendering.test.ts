import { expect, test } from "bun:test";
import { computeCanvasBoundaries } from "../apps/web/src/features/canvas/graph";
import { createTestContext, createWorkspace } from "./helpers";

test("saved parent Sections enclose nested Section frames and their outside titles", () => {
  const { services, close } = createTestContext();
  try {
    const workspace = createWorkspace(services);
    const view = services.views.create(workspace.id, { kind: "workflow", name: "Overview" }).result;
    const parent = services.boundaries.create(workspace.id, {
      viewId: view.id,
      kind: "custom",
      layer: "custom",
      name: "Capture",
    }).result;
    const child = services.boundaries.create(workspace.id, {
      viewId: view.id,
      kind: "custom",
      layer: "custom",
      name: "Replay",
      parentBoundaryId: parent.id,
    }).result;
    const frames = computeCanvasBoundaries([], new Map(), [parent, child], "custom", true, {
      [`boundary:${parent.id}`]: { x: 0, y: 180, width: 120, height: 80 },
      [`boundary:${child.id}`]: { x: 200, y: 200, width: 120, height: 80 },
    });
    expect(
      frames.semanticBoundaries.find((node) => node.data.boundaryId === parent.id),
    ).toMatchObject({
      position: { x: 0, y: 136 },
      width: 348,
      height: 172,
    });
    expect(
      frames.semanticBoundaries.find((node) => node.data.boundaryId === child.id),
    ).toMatchObject({
      position: { x: 200, y: 200 },
      width: 120,
      height: 80,
    });
  } finally {
    close();
  }
});

test("legacy custom model frames are not visual Sections", () => {
  const { services, close } = createTestContext();
  try {
    const workspace = createWorkspace(services);
    const parent = services.elements.create(workspace.id, {
      kind: "custom",
      name: "Legacy subprocess",
    }).result;
    const child = services.elements.create(workspace.id, {
      kind: "action",
      name: "Replay",
      parentId: parent.id,
    }).result;
    const frames = computeCanvasBoundaries(
      [{ id: child.id, x: 100, y: 100, width: 220, height: 96 }],
      new Map(services.elements.list(workspace.id).map((element) => [element.id, element])),
      [],
      "custom",
      true,
    );
    expect(frames.parentBoundaries[0]?.data).toMatchObject({
      elementId: parent.id,
      kind: "custom",
      section: false,
    });
  } finally {
    close();
  }
});

test("scoped details have root Sections and expanded Subprocesses remain inside them", () => {
  const { services, close } = createTestContext();
  try {
    const workspace = createWorkspace(services);
    const group = services.elements.create(workspace.id, {
      kind: "workflowGroup",
      name: "Capture",
    }).result;
    const step = services.elements.create(workspace.id, {
      kind: "action",
      name: "Replay",
      parentId: group.id,
    }).result;
    const detail = services.views.create(workspace.id, {
      kind: "workflow",
      name: "Capture detail",
      scopeElementId: group.id,
      elementIds: [step.id],
    }).result;
    const section = services.boundaries.create(workspace.id, {
      viewId: detail.id,
      kind: "custom",
      layer: "custom",
      name: "Execution",
      elementIds: [step.id],
    }).result;
    const elements = new Map(
      services.elements.list(workspace.id).map((element) => [element.id, element]),
    );
    const sources = [{ id: step.id, x: 100, y: 100, width: 220, height: 96 }];
    const scoped = computeCanvasBoundaries(
      sources,
      elements,
      [section],
      "custom",
      true,
      {},
      group.id,
    );
    expect(scoped.parentBoundaries).toEqual([]);
    expect(scoped.semanticBoundaries[0]?.data).toMatchObject({
      section: true,
      boundaryId: section.id,
    });
    const unscoped = computeCanvasBoundaries(sources, elements, [section], "custom", true);
    expect(unscoped.parentBoundaries).toEqual([]);
    const scopedWithoutSection = computeCanvasBoundaries(
      sources,
      elements,
      [],
      "custom",
      true,
      {},
      group.id,
    );
    expect(scopedWithoutSection.parentBoundaries).toEqual([]);
    const expandedFrame = {
      id: group.id,
      x: 50,
      y: 60,
      width: 500,
      height: 600,
      elementIds: [group.id, step.id],
    };
    const expanded = computeCanvasBoundaries(
      [{ id: group.id, x: 100, y: 100, width: 220, height: 96 }, ...sources],
      elements,
      [{ ...section, elementIds: [group.id] }],
      "custom",
      true,
      { [`boundary:${section.id}`]: { x: 80, y: 80, width: 280, height: 160 } },
      null,
      [expandedFrame],
    );
    expect(expanded.semanticBoundaries[0]).toMatchObject({
      position: { x: 22, y: 32 },
      width: 556,
      height: 656,
      connectable: false,
    });
    expect(expanded.parentBoundaries).toEqual([]);
    expect(services.views.get(detail.id).boundaries[0]?.elementIds).toEqual([step.id]);
  } finally {
    close();
  }
});
