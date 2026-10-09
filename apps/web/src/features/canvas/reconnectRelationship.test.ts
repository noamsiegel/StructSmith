import { expect, test } from "bun:test";
import { createTestContext, createWorkspace } from "../../../../../tests/helpers";
import { canvasFitBounds, type FlowEdge } from "./graph";
import { reconnectRelationshipOperations } from "./reconnectRelationship";

test("reconnecting changes only the dragged semantic endpoint, keeps the route, and undoes atomically", () => {
  const { services, close } = createTestContext();
  try {
    const workspace = createWorkspace(services);
    const elements = ["Source", "Target", "New target"].map(
      (name) => services.elements.create(workspace.id, { kind: "action", name }).result,
    );
    const [source, target, replacement] = elements;
    if (!source || !target || !replacement) throw new Error("Missing elements");
    const relationship = services.relationships.create(workspace.id, {
      sourceElementId: source.id,
      targetElementId: target.id,
    }).result;
    const view = services.views.create(workspace.id, {
      kind: "workflow",
      name: "Reconnection",
      elementIds: elements.map((element) => element.id),
    }).result;
    const controls = [
      { x: 300, y: 75 },
      { x: 300, y: 260 },
    ];
    services.views.saveLayout(
      workspace.id,
      view.id,
      [],
      [
        {
          relationshipId: relationship.id,
          controlPoints: controls,
          presentation: {
            sourceSide: "bottom",
            sourceFraction: 0.4,
            targetPoint: { x: 600, y: 260 },
          },
        },
      ],
    );
    const result = services.model.applyOperations(workspace.id, {
      operations: reconnectRelationshipOperations(view.id, relationship, target.id, "target", {
        elementId: replacement.id,
        side: "left",
        fraction: 0.71,
        point: { x: 400, y: 260 },
      }),
    });
    expect(services.model.get(workspace.id).relationships[0]).toMatchObject({
      sourceElementId: source.id,
      targetElementId: replacement.id,
    });
    expect(services.views.get(view.id).relationships[0]).toMatchObject({
      controlPoints: controls,
      presentation: {
        sourceSide: "bottom",
        sourceFraction: 0.4,
        targetSide: "left",
        targetFraction: 0.71,
        targetPoint: null,
      },
    });
    if (!result.snapshotId) throw new Error("Missing undo snapshot");
    services.snapshots.restore(result.snapshotId);
    expect(services.model.get(workspace.id).relationships[0]?.targetElementId).toBe(target.id);
    expect(services.views.get(view.id).relationships[0]?.presentation?.targetPoint).toEqual({
      x: 600,
      y: 260,
    });

    services.model.applyOperations(workspace.id, {
      operations: reconnectRelationshipOperations(view.id, relationship, source.id, "source", {
        elementId: replacement.id,
        side: "bottom",
        fraction: 0.28,
        point: { x: 500, y: 300 },
      }),
    });
    const sourceReconnected = services.model.get(workspace.id).relationships[0];
    expect(sourceReconnected).toMatchObject({
      sourceElementId: replacement.id,
      targetElementId: target.id,
    });
    if (!sourceReconnected) throw new Error("Missing relationship");
    services.model.applyOperations(workspace.id, {
      operations: reconnectRelationshipOperations(
        view.id,
        sourceReconnected,
        replacement.id,
        "source",
        { side: "right", point: { x: -150, y: 333 } },
      ),
    });
    expect(services.model.get(workspace.id).relationships[0]).toEqual(sourceReconnected);
    expect(services.views.get(view.id).relationships[0]?.presentation).toMatchObject({
      sourcePoint: { x: -150, y: 333 },
      sourceFraction: null,
    });
    services.views.autoLayout(workspace.id, view.id, "LR", "dagre");
    expect(services.views.get(view.id).relationships[0]?.presentation).toMatchObject({
      sourcePoint: { x: -150, y: 333 },
      sourceFraction: null,
      targetFraction: null,
    });
  } finally {
    close();
  }
});

test("a lifted endpoint can move in its view but cannot replace a hidden descendant", () => {
  const relationship = {
    id: "relation",
    sourceElementId: "hidden-source",
    targetElementId: "direct-target",
  } as Parameters<typeof reconnectRelationshipOperations>[1];
  expect(() =>
    reconnectRelationshipOperations("view", relationship, "parent-source", "source", {
      elementId: "replacement",
      side: "left",
      fraction: 0.3,
      point: { x: 20, y: 30 },
    }),
  ).toThrow("lifted-endpoint");
  expect(
    reconnectRelationshipOperations("view", relationship, "parent-source", "source", {
      elementId: "parent-source",
      side: "top",
      fraction: 0.6,
      point: { x: 40, y: 50 },
    }),
  ).toHaveLength(1);
  expect(
    reconnectRelationshipOperations("view", relationship, "parent-source", "source", {
      side: "top",
      point: { x: 100, y: 120 },
    }),
  ).toHaveLength(1);
  expect(
    reconnectRelationshipOperations("view", relationship, "direct-target", "target", {
      elementId: "replacement",
      side: "left",
      point: { x: 30, y: 45 },
      fraction: 0.2,
    })[0],
  ).toEqual({
    op: "updateRelationship",
    relationshipId: "relation",
    data: { targetElementId: "replacement" },
  });
});

test("dropping onto the opposite endpoint refuses a disappearing self-connection", () => {
  const relationship = {
    id: "relation",
    sourceElementId: "source",
    targetElementId: "target",
  } as Parameters<typeof reconnectRelationshipOperations>[1];
  for (const endpoint of ["source", "target"] as const) {
    expect(() =>
      reconnectRelationshipOperations("view", relationship, endpoint, endpoint, {
        elementId: endpoint === "source" ? "target" : "source",
        side: "left",
        fraction: 0.2,
        point: { x: 10, y: 30 },
      }),
    ).toThrow("self-endpoint");
  }
});

test("Fit includes detached endpoints and edited bends beyond every card", () => {
  const edge = {
    id: "edge",
    source: "source",
    target: "target",
    data: {
      placement: {
        presentation: { sourcePoint: { x: -500, y: 900 }, targetPoint: { x: 1200, y: -300 } },
        controlPoints: [{ x: 2000, y: 600 }],
      },
    },
  } as FlowEdge;
  expect(canvasFitBounds([], [edge])).toEqual({ x: -516, y: -316, width: 2532, height: 1232 });
});
