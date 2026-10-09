import { expect, test } from "bun:test";
import type { ControlPoint } from "@structsmith/contracts";
import { Position } from "@xyflow/react";
import { createTestContext, createWorkspace } from "../../../../../tests/helpers";
import { buildGraph } from "./graph";
import {
  closestRelationshipSegment,
  manualRelationshipPath,
  moveRelationshipSegment,
  orthogonalRelationshipBends,
  slidingRelationshipLabel,
} from "./relationshipGeometry";

test("saved orthogonal routes follow moved endpoints without diagonal legs or redundant handles", () => {
  const source = { x: 3838.5, y: 434 };
  const target = { x: 4123.5, y: 105 };
  const saved = [
    { x: 3876.8619669470845, y: 485 },
    { x: 3876.8619669470845, y: 82 },
  ];
  for (const sourceSide of Object.values(Position)) {
    for (const targetSide of Object.values(Position)) {
      const bends = orthogonalRelationshipBends(source, target, sourceSide, targetSide, saved);
      const points = [source, ...bends, target];
      for (let i = 1; i < points.length; i++) {
        const previous = points[i - 1] as ControlPoint;
        const next = points[i] as ControlPoint;
        expect(previous.x === next.x || previous.y === next.y).toBe(true);
        if (i > 1) {
          const before = points[i - 2] as ControlPoint;
          expect(
            (before.x === previous.x && previous.x === next.x) ||
              (before.y === previous.y && previous.y === next.y),
          ).toBe(false);
        }
      }
      expect(
        bends[0]?.[sourceSide === Position.Left || sourceSide === Position.Right ? "y" : "x"],
      ).toBe(source[sourceSide === Position.Left || sourceSide === Position.Right ? "y" : "x"]);
      expect(
        bends.at(-1)?.[targetSide === Position.Left || targetSide === Position.Right ? "y" : "x"],
      ).toBe(target[targetSide === Position.Left || targetSide === Position.Right ? "y" : "x"]);
      const moved = moveRelationshipSegment(points, 1, { x: 30, y: 50 });
      const rerouted = [
        source,
        ...orthogonalRelationshipBends(source, target, sourceSide, targetSide, moved),
        target,
      ];
      for (let i = 1; i < rerouted.length; i++) {
        expect(rerouted[i - 1]?.x === rerouted[i]?.x || rerouted[i - 1]?.y === rerouted[i]?.y).toBe(
          true,
        );
      }
    }
  }
  expect(saved).toEqual([
    { x: 3876.8619669470845, y: 485 },
    { x: 3876.8619669470845, y: 82 },
  ]);
});

test("labels slide horizontally on their leg and follow moved routes without vertical drift", () => {
  const points = [
    { x: 0, y: 20 },
    { x: 300, y: 20 },
  ] as const;
  expect(slidingRelationshipLabel(points, { x: 150, y: 20 }, 60)).toEqual({ x: 210, y: 20 });
  const [, anchorX, anchorY] = manualRelationshipPath(points[0], points[1], [], 0.25);
  expect(slidingRelationshipLabel(points, { x: anchorX, y: anchorY }, 60)).toEqual({
    x: 135,
    y: 20,
  });
  expect(slidingRelationshipLabel(points, { x: 150, y: 20 }, 500)).toEqual({ x: 300, y: 20 });
  const moved = points.map((point) => ({ ...point, y: 80 }));
  expect(
    slidingRelationshipLabel(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 200, y: 100 },
      ],
      { x: 100, y: 50 },
      0,
    ),
  ).toEqual({ x: 150, y: 100 });
  expect(slidingRelationshipLabel(moved, { x: 150, y: 80 }, 60)).toEqual({ x: 210, y: 80 });
  expect(
    slidingRelationshipLabel(
      [
        { x: 300, y: 20 },
        { x: 0, y: 20 },
      ],
      { x: 150, y: 20 },
      -60,
    ),
  ).toEqual({ x: 90, y: 20 });
  expect(
    slidingRelationshipLabel(
      [
        { x: 0, y: 0 },
        { x: 100, y: 100 },
      ],
      { x: 50, y: 50 },
      10,
    ),
  ).toEqual({ x: 60, y: 60 });
  expect(
    slidingRelationshipLabel(
      [
        { x: 0, y: 0 },
        { x: 0, y: 100 },
      ],
      { x: 0, y: 50 },
      10,
    ),
  ).toEqual({ x: 0, y: 50 });
});

test("dragged labels snap onto vertical and horizontal legs without leaving the route", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 200 },
    { x: 300, y: 200 },
  ];
  const anchor = { x: 100, y: 150 };
  expect(slidingRelationshipLabel(points, anchor, -100, false, -80)).toEqual({ x: 100, y: 120 });
  expect(slidingRelationshipLabel(points, anchor, -90, false, -80)).toEqual({ x: 100, y: 120 });
  expect(slidingRelationshipLabel(points, anchor, -160, false, -190)).toEqual({ x: 40, y: 0 });
  expect(slidingRelationshipLabel(points, anchor, 50, false, 0)).toEqual({ x: 250, y: 200 });
  const moved = [
    points[0] as ControlPoint,
    ...moveRelationshipSegment(points, 1, { x: 30, y: 0 }),
    points[3] as ControlPoint,
  ];
  expect(slidingRelationshipLabel(moved, anchor, -100, false, -80)).toEqual({ x: 130, y: 120 });
  expect(
    slidingRelationshipLabel(
      [
        { x: 0, y: 0 },
        { x: 0, y: 100 },
      ],
      { x: 0, y: 50 },
      40,
      false,
      20,
    ),
  ).toEqual({ x: 0, y: 70 });
  expect(
    slidingRelationshipLabel(
      [
        { x: 0, y: 0 },
        { x: 100, y: 100 },
      ],
      { x: 50, y: 50 },
      20,
      true,
      10,
    ),
  ).toEqual({ x: 65, y: 65 });
});

test("segment dragging keeps endpoints and right angles while moving the picked leg", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 150, y: 0 },
    { x: 150, y: 100 },
    { x: 300, y: 100 },
  ];
  const original = structuredClone(points);
  const leg = closestRelationshipSegment(points, { x: 155, y: 70 });
  expect(leg).toBe(1);
  const moved = moveRelationshipSegment(points, leg, { x: 40, y: 80 });
  expect(
    manualRelationshipPath(points[0] as ControlPoint, points[3] as ControlPoint, moved)[0],
  ).toBe("M 0,0 L 190,0 L 190,100 L 300,100");
  expect(points).toEqual(original);
  expect(moveRelationshipSegment(points, 0, { x: 50, y: 30 })).toEqual([
    { x: 0, y: 30 },
    { x: 150, y: 30 },
    { x: 150, y: 100 },
  ]);
  expect(moveRelationshipSegment(points, 2, { x: 50, y: -40 })).toEqual([
    { x: 150, y: 0 },
    { x: 150, y: 60 },
    { x: 300, y: 60 },
  ]);
  expect(moveRelationshipSegment(points, 1, { x: 0, y: 40 })).toEqual(points.slice(1, -1));
  expect(
    moveRelationshipSegment(
      [
        { x: 0, y: 0 },
        { x: 300, y: 0 },
      ],
      0,
      { x: 70, y: 20 },
    ),
  ).toEqual([
    { x: 0, y: 20 },
    { x: 300, y: 20 },
  ]);
  expect(
    closestRelationshipSegment(
      [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 100, y: 100 },
      ],
      { x: 60, y: 50 },
    ),
  ).toBe(1);
});

test("segment edits save authored bends and the edited leg without freezing automatic repairs", () => {
  const authored = [
    { x: 100, y: 0 },
    { x: 100, y: 200 },
    { x: 300, y: 200 },
  ];
  const rendered = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 50 },
    { x: 200, y: 50 },
    { x: 200, y: 150 },
    { x: 100, y: 150 },
    { x: 100, y: 200 },
    { x: 300, y: 200 },
    { x: 300, y: 300 },
  ];
  expect(moveRelationshipSegment(rendered, 6, { x: 0, y: 20 }, authored)).toEqual([
    { x: 100, y: 0 },
    { x: 100, y: 220 },
    { x: 300, y: 220 },
  ]);
  expect(moveRelationshipSegment(rendered, 3, { x: 40, y: 0 }, authored)).toEqual([
    { x: 100, y: 0 },
    { x: 240, y: 50 },
    { x: 240, y: 150 },
    { x: 100, y: 200 },
    { x: 300, y: 200 },
  ]);
  expect(moveRelationshipSegment(rendered, 3, { x: 40, y: 0 }, [])).toEqual([
    { x: 240, y: 50 },
    { x: 240, y: 150 },
  ]);
  expect(authored).toEqual([
    { x: 100, y: 0 },
    { x: 100, y: 200 },
    { x: 300, y: 200 },
  ]);
});

test("native orthogonal route seeds omit duplicate and redundant handles but retain backtracking", () => {
  expect(
    orthogonalRelationshipBends({ x: 0, y: 0 }, { x: 300, y: 100 }, Position.Right, Position.Left),
  ).toEqual([
    { x: 150, y: 0 },
    { x: 150, y: 100 },
  ]);
  const source = { x: -50.25, y: 0.5 };
  const target = { x: 200.75, y: 85.125 };
  expect(orthogonalRelationshipBends(source, target, Position.Right, Position.Left)).toEqual([
    { x: 75.25, y: 0.5 },
    { x: 75.25, y: 85.125 },
  ]);
  const backwards = orthogonalRelationshipBends(
    { x: 300, y: 0 },
    { x: 0, y: 100 },
    Position.Right,
    Position.Left,
  );
  expect(backwards[0]).toEqual({ x: 324, y: 0 });
});

test("one shared-route command persists merged connectors and undo restores every route without semantic changes", () => {
  const { services, close } = createTestContext();
  try {
    const workspace = createWorkspace(services);
    const source = services.elements.create(workspace.id, {
      kind: "custom",
      name: "Capture",
    }).result;
    const target = services.elements.create(workspace.id, {
      kind: "custom",
      name: "Evidence",
    }).result;
    const childA = services.elements.create(workspace.id, {
      kind: "custom",
      name: "Ledger",
      parentId: source.id,
    }).result;
    const childB = services.elements.create(workspace.id, {
      kind: "custom",
      name: "Documents",
      parentId: source.id,
    }).result;
    const destination = services.elements.create(workspace.id, {
      kind: "custom",
      name: "Store",
      parentId: target.id,
    }).result;
    const relationships = [childA, childB].map(
      (child) =>
        services.relationships.create(workspace.id, {
          sourceElementId: child.id,
          targetElementId: destination.id,
          description: child.name,
        }).result,
    );
    const elements = [source, target, childA, childB, destination];
    const view = services.views.create(workspace.id, {
      kind: "custom",
      name: "Home",
      elementIds: [source.id, target.id],
    }).result;
    const single = services.views.create(workspace.id, {
      kind: "custom",
      name: "Detail",
      elementIds: [childA.id, target.id],
    }).result;
    const graph = () =>
      buildGraph({ view: services.views.get(view.id), elements, relationships, records: [] });
    const edge = graph().edges[0];
    if (!edge?.data?.relationshipIds) throw new Error("Missing represented relationship IDs");
    expect(edge).toMatchObject({
      source: source.id,
      target: target.id,
      selectable: true,
      deletable: false,
      reconnectable: false,
      data: { count: 2, relationshipIds: relationships.map((item) => item.id) },
    });
    const bends = [
      { x: 120, y: 0 },
      { x: 120, y: 100 },
    ];
    services.model.applyOperations(
      workspace.id,
      {
        operations: [
          {
            op: "setViewRelationships",
            viewId: view.id,
            relationships: relationships.map((item) => ({
              relationshipId: item.id,
              controlPoints: bends,
              presentation: { color: "#123456" },
            })),
          },
        ],
      },
      "ui",
    );
    const before = services.views.get(view.id);
    const snapshots = services.snapshots.list(workspace.id).length;
    const moved = moveRelationshipSegment([{ x: 0, y: 0 }, ...bends, { x: 300, y: 100 }], 1, {
      x: 50,
      y: 0,
    });
    const command = services.model.applyOperations(
      workspace.id,
      {
        operations: [
          {
            op: "setViewRelationships",
            viewId: view.id,
            relationships: edge.data.relationshipIds.map((relationshipId) => ({
              relationshipId,
              controlPoints: moved,
            })),
          },
        ],
      },
      "ui",
    );
    expect(services.snapshots.list(workspace.id).length).toBe(snapshots + 1);
    expect(services.views.get(view.id).relationships.map((row) => row.controlPoints)).toEqual([
      moved,
      moved,
    ]);
    expect(services.views.get(view.id).relationships.map((row) => row.presentation)).toEqual([
      { color: "#123456" },
      { color: "#123456" },
    ]);
    expect(graph().edges[0]?.data?.placement?.controlPoints).toEqual(moved);
    expect(
      services.model.get(workspace.id).relationships.toSorted((a, b) => a.id.localeCompare(b.id)),
    ).toEqual(relationships.toSorted((a, b) => a.id.localeCompare(b.id)));
    expect(
      buildGraph({ view: services.views.get(single.id), elements, relationships, records: [] })
        .edges[0],
    ).toMatchObject({ selectable: true, reconnectable: true, data: { count: 1, implied: true } });
    if (!command.snapshotId) throw new Error("Missing route undo snapshot");
    services.snapshots.restore(command.snapshotId);
    expect(services.views.get(view.id)).toEqual(before);
    const firstRelationship = relationships[0];
    if (!firstRelationship) throw new Error("Missing first relationship");
    services.model.applyOperations(
      workspace.id,
      {
        operations: [
          {
            op: "setViewRelationships",
            viewId: view.id,
            relationships: [{ relationshipId: firstRelationship.id, controlPoints: moved }],
          },
        ],
      },
      "ui",
    );
    expect(graph().edges[0]?.data?.placement?.controlPoints).toEqual([]);
  } finally {
    close();
  }
});

test("close facing borders do not produce connector backtracking through the cards", () => {
  for (const [source, target, sourceSide, targetSide, axis] of [
    [{ x: 219, y: 48 }, { x: 237, y: 52 }, Position.Right, Position.Left, "x"],
    [{ x: 237, y: 52 }, { x: 219, y: 48 }, Position.Left, Position.Right, "x"],
    [{ x: 48, y: 219 }, { x: 52, y: 237 }, Position.Bottom, Position.Top, "y"],
    [{ x: 52, y: 237 }, { x: 48, y: 219 }, Position.Top, Position.Bottom, "y"],
  ] as const) {
    const points = [
      source,
      ...orthogonalRelationshipBends(source, target, sourceSide, targetSide),
      target,
    ];
    for (const point of points) {
      expect(point[axis]).toBeGreaterThanOrEqual(Math.min(source[axis], target[axis]));
      expect(point[axis]).toBeLessThanOrEqual(Math.max(source[axis], target[axis]));
    }
  }
});
