import { expect, test } from "bun:test";
import {
  boundaryHeaderHeight,
  canvasFitBounds,
  computeCanvasBoundaries,
} from "../apps/web/src/features/canvas/graph";
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

test("fit bounds include long top-level Section titles without changing saved geometry", () => {
  const { services, close } = createTestContext();
  try {
    const workspace = createWorkspace(services);
    const view = services.views.create(workspace.id, { kind: "workflow", name: "Overview" }).result;
    const section = services.boundaries.create(workspace.id, {
      viewId: view.id,
      kind: "custom",
      layer: "custom",
      name: "Portal login roster, complete sibling account captures, safe evidence persistence, and downstream charges",
    }).result;
    const nodes = computeCanvasBoundaries([], new Map(), [section], "custom", true, {
      [`boundary:${section.id}`]: { x: 120, y: 100, width: 160, height: 120 },
    }).semanticBoundaries;
    const before = structuredClone(nodes);
    const titleHeight = boundaryHeaderHeight(section.name, 160, true);
    expect(titleHeight).toBeGreaterThan(48);
    expect(canvasFitBounds(nodes)).toEqual({
      x: 120,
      y: 100 - titleHeight,
      width: 160,
      height: 120 + titleHeight,
    });
    expect(nodes).toEqual(before);
    expect(canvasFitBounds([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
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

test("long model-frame titles expand upward without changing member coordinates", () => {
  const { services, close } = createTestContext();
  try {
    const workspace = createWorkspace(services);
    const group = services.elements.create(workspace.id, {
      kind: "workflowGroup",
      name: "Capture",
    }).result;
    const member = services.elements.create(workspace.id, {
      kind: "action",
      name: "Replay",
      parentId: group.id,
    }).result;
    const sources = [{ id: member.id, x: 100, y: 200, width: 220, height: 96 }];
    const short = computeCanvasBoundaries(
      sources,
      new Map([
        [group.id, group],
        [member.id, member],
      ]),
      [],
      "custom",
      true,
    ).parentBoundaries[0];
    const long = computeCanvasBoundaries(
      sources,
      new Map([
        [
          group.id,
          {
            ...group,
            name: "Capture every account available to the portal login and withhold unsafe evidence before creating tasks and charges",
          },
        ],
        [member.id, member],
      ]),
      [],
      "custom",
      true,
    ).parentBoundaries[0];
    if (!short || !long || !short.height || !long.height || !long.width)
      throw new Error("Missing frames");
    const header = boundaryHeaderHeight(String(long.data.name), long.width);
    expect(header).toBeGreaterThan(36);
    expect(long.position.y).toBe(200 - 28 - header);
    expect(long.height).toBe(short.height + header - 36);
    expect(long.position.y + long.height).toBe(short.position.y + short.height);
    expect(sources).toEqual([{ id: member.id, x: 100, y: 200, width: 220, height: 96 }]);
  } finally {
    close();
  }
});

test("nested Sections enclose the entire wrapped outside title in saved and derived frames", () => {
  const { services, close } = createTestContext();
  try {
    const workspace = createWorkspace(services);
    const member = services.elements.create(workspace.id, {
      kind: "action",
      name: "Replay",
    }).result;
    const view = services.views.create(workspace.id, {
      kind: "workflow",
      name: "Overview",
      elementIds: [member.id],
    }).result;
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
      name: "Portal replay evidence, complete account coverage, and safe persistence for downstream charges",
      parentBoundaryId: parent.id,
      elementIds: [member.id],
    }).result;
    const sources = [{ id: member.id, x: 210, y: 310, width: 160, height: 96 }];
    for (const frames of [
      {
        [`boundary:${parent.id}`]: { x: 0, y: 300, width: 120, height: 80 },
        [`boundary:${child.id}`]: { x: 200, y: 300, width: 160, height: 120 },
      },
      {},
    ]) {
      const computed = computeCanvasBoundaries(
        sources,
        new Map([[member.id, member]]),
        [parent, child],
        "custom",
        true,
        frames,
      ).semanticBoundaries;
      const parentFrame = computed.find((node) => node.data.boundaryId === parent.id);
      const childFrame = computed.find((node) => node.data.boundaryId === child.id);
      if (!parentFrame || !childFrame?.width) throw new Error("Missing Section frames");
      const titleHeight = boundaryHeaderHeight(child.name, childFrame.width, true);
      expect(titleHeight).toBeGreaterThan(36);
      expect(parentFrame.position.y).toBeLessThanOrEqual(childFrame.position.y - titleHeight - 28);
      expect(parentFrame.height).toBeGreaterThan(childFrame.height ?? 0);
    }
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
