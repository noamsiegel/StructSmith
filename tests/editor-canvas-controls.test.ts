import { expect, test } from "bun:test";
import {
  buildGraph,
  sourceHandleFor,
  targetHandleFor,
} from "../apps/web/src/features/canvas/graph";
import { inlineFrames } from "../apps/web/src/features/canvas/inlineFrames";
import {
  sideFromHandle,
  slotFromHandle,
} from "../apps/web/src/features/canvas/relationshipGeometry";
import { focusGraphByTag } from "../apps/web/src/features/canvas/tagFocus";
import { createTestContext, createWorkspace } from "./helpers";

test("tag focus retains connected context, suppresses unrelated cards and highlights tagged edges", () => {
  const { services, close } = createTestContext();
  try {
    const workspace = createWorkspace(services);
    const source = services.elements.create(workspace.id, {
      name: "Source",
      kind: "action",
      tags: ["capture"],
    }).result;
    const neighbor = services.elements.create(workspace.id, {
      name: "Neighbor",
      kind: "action",
    }).result;
    const unrelated = services.elements.create(workspace.id, {
      name: "Unrelated",
      kind: "action",
    }).result;
    services.relationships.create(workspace.id, {
      sourceElementId: source.id,
      targetElementId: neighbor.id,
      tags: ["path"],
    });
    const view = services.views.create(workspace.id, {
      name: "Home",
      kind: "workflow",
      elementIds: [source.id, neighbor.id, unrelated.id],
    }).result;
    const model = services.model.get(workspace.id);
    const graph = buildGraph({
      view,
      elements: model.elements,
      relationships: model.relationships,
      records: [],
    });
    const focused = focusGraphByTag(graph.nodes, graph.edges, "capture");
    expect(focused.nodes.map((node) => node.id).sort()).toEqual([source.id, neighbor.id].sort());
    expect(focused.nodes.find((node) => node.id === source.id)?.style?.opacity).toBe(1);
    expect(focused.nodes.find((node) => node.id === neighbor.id)?.style?.opacity).toBe(0.5);
    expect(focused.edges).toHaveLength(1);
    expect(focusGraphByTag(graph.nodes, graph.edges, "path").edges[0]?.style?.opacity).toBe(1);
    expect(focusGraphByTag(graph.nodes, graph.edges, "missing").nodes).toEqual([]);
    expect(focusGraphByTag(graph.nodes, graph.edges, null).nodes).toBe(graph.nodes);
  } finally {
    close();
  }
});

test("saved connector slots reach named handles while new center connections allocate automatically", () => {
  for (const direction of ["LR", "TB"] as const)
    for (const side of ["left", "right", "top", "bottom"] as const)
      for (const slot of [0, 1, 2]) {
        const source = sourceHandleFor(side, direction, slot);
        const target = targetHandleFor(side, direction, slot);
        expect(sideFromHandle(source, "source")).toBe(side);
        expect(sideFromHandle(target, "target")).toBe(side);
        expect(slotFromHandle(source)).toBe(slot === 1 ? undefined : slot);
        expect(slotFromHandle(target)).toBe(slot === 1 ? undefined : slot);
      }
  const { services, close } = createTestContext();
  try {
    const workspace = createWorkspace(services);
    const source = services.elements.create(workspace.id, {
      name: "Source",
      kind: "action",
    }).result;
    const target = services.elements.create(workspace.id, {
      name: "Target",
      kind: "action",
    }).result;
    const relationship = services.relationships.create(workspace.id, {
      sourceElementId: source.id,
      targetElementId: target.id,
    }).result;
    const view = services.views.create(workspace.id, {
      name: "Home",
      kind: "workflow",
      elementIds: [source.id, target.id],
    }).result;
    services.views.saveLayout(
      workspace.id,
      view.id,
      [],
      [
        {
          relationshipId: relationship.id,
          presentation: { sourceSide: "right", targetSide: "left", sourceSlot: 0, targetSlot: 2 },
        },
      ],
    );
    const model = services.model.get(workspace.id);
    const graph = buildGraph({
      view: services.views.get(view.id),
      elements: model.elements,
      relationships: model.relationships,
      records: [],
    });
    expect(graph.edges[0]?.sourceHandle).toBe("source-r-0");
    expect(graph.edges[0]?.targetHandle).toBe("target-l-2");
  } finally {
    close();
  }
});

test("inline group frames reuse endpoint IDs and contain nested frames below separate title bands", () => {
  const { services, close } = createTestContext();
  try {
    const workspace = createWorkspace(services);
    const group = services.elements.create(workspace.id, {
      name: "Group",
      kind: "workflowGroup",
    }).result;
    const child = services.elements.create(workspace.id, {
      name: "Child",
      kind: "workflowGroup",
      parentId: group.id,
    }).result;
    const leaf = services.elements.create(workspace.id, {
      name: "Leaf",
      kind: "action",
      parentId: child.id,
    }).result;
    const elements = new Map([group, child, leaf].map((element) => [element.id, element]));
    const frames = inlineFrames(
      [group, child, leaf].map((element, index) => ({
        id: element.id,
        x: index * 350,
        y: 0,
        width: 250,
        height: 100,
      })),
      elements,
      new Set([group.id, child.id]),
    );
    const parentFrame = frames.find((frame) => frame.id === group.id);
    const childFrame = frames.find((frame) => frame.id === child.id);
    expect(frames).toHaveLength(2);
    expect(parentFrame?.type).toBe("boundary");
    expect(parentFrame?.draggable).toBe(false);
    expect(parentFrame?.measured).toEqual({
      width: parentFrame?.width,
      height: parentFrame?.height,
    });
    expect((childFrame?.position.y ?? 0) - (parentFrame?.position.y ?? 0)).toBeGreaterThanOrEqual(
      36,
    );
    expect((parentFrame?.position.x ?? 0) + (parentFrame?.width ?? 0)).toBeGreaterThan(950);
    expect(parentFrame?.data.elementId).toBe(group.id);
  } finally {
    close();
  }
});

test("tag focus includes every contributor of a merged implied connection", () => {
  const { services, close } = createTestContext();
  try {
    const workspace = createWorkspace(services);
    const group = services.elements.create(workspace.id, {
      kind: "workflowGroup",
      name: "Group",
    }).result;
    const first = services.elements.create(workspace.id, {
      kind: "action",
      parentId: group.id,
      name: "First",
    }).result;
    const second = services.elements.create(workspace.id, {
      kind: "action",
      parentId: group.id,
      name: "Second",
    }).result;
    const target = services.elements.create(workspace.id, {
      kind: "action",
      name: "Target",
    }).result;
    const ordinary = services.relationships.create(workspace.id, {
      sourceElementId: first.id,
      targetElementId: target.id,
    }).result;
    const tagged = services.relationships.create(workspace.id, {
      sourceElementId: second.id,
      targetElementId: target.id,
      tags: ["important"],
    }).result;
    const view = services.views.create(workspace.id, {
      kind: "workflow",
      name: "Overview",
      elementIds: [group.id, target.id],
    }).result;
    const graph = buildGraph({
      view: services.views.get(view.id),
      elements: services.elements.list(workspace.id),
      relationships: [ordinary, tagged],
      records: [],
    });
    expect(graph.edges[0]?.data?.count).toBe(2);
    expect(graph.edges[0]?.data?.relationship.tags).toEqual([]);
    const focused = focusGraphByTag(graph.nodes, graph.edges, "important");
    expect(new Set(focused.nodes.map((node) => node.id))).toEqual(new Set([group.id, target.id]));
    expect(focused.edges).toHaveLength(1);
    expect(focused.edges[0]?.style?.opacity).toBe(1);
  } finally {
    close();
  }
});
