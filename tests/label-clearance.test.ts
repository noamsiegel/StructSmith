import { expect, test } from "bun:test";
import type { ControlPoint } from "@structsmith/contracts";
import type { FlowNode } from "../apps/web/src/features/canvas/graph";
import { labelObstacles } from "../apps/web/src/features/canvas/LabelPlacement";
import {
  clearRelationshipLabel,
  closestLabelRoutePoint,
  type LabelBox,
} from "../apps/web/src/features/canvas/labelClearance";

test("leader anchor projects onto the closest route segment including reversed and zero-length legs", () => {
  expect(
    closestLabelRoutePoint(
      [
        { x: 100, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 100 },
        { x: 0, y: 100 },
      ],
      { x: 20, y: 60 },
    ),
  ).toEqual({ x: 0, y: 60 });
  expect(closestLabelRoutePoint([], { x: -4, y: 7 })).toEqual({ x: -4, y: 7 });
  expect(closestLabelRoutePoint([{ x: 8, y: 9 }], { x: 0, y: 0 })).toEqual({ x: 8, y: 9 });
});

function expectClear(
  point: ControlPoint,
  size: { width: number; height: number },
  boxes: readonly LabelBox[],
  padding = 8,
) {
  for (const box of boxes) {
    expect(
      point.x + size.width / 2 + padding <= box.x + 1e-6 ||
        point.x - size.width / 2 - padding >= box.x + box.width - 1e-6 ||
        point.y + size.height / 2 + padding <= box.y + 1e-6 ||
        point.y - size.height / 2 - padding >= box.y + box.height - 1e-6,
    ).toBe(true);
  }
}

test("keeps the nearest route point when the full label fits", () => {
  const point = clearRelationshipLabel(
    [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
    ],
    { x: 70, y: 20 },
    { width: 80, height: 30 },
    [{ x: 140, y: -20, width: 60, height: 40 }],
  );
  expect(point).toEqual({ x: 70, y: 0 });
});

test("moves the entire label beyond a card with requested padding", () => {
  const size = { width: 80, height: 30 };
  const boxes = [{ x: 90, y: -20, width: 20, height: 40 }];
  const point = clearRelationshipLabel(
    [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
    ],
    { x: 100, y: 0 },
    size,
    boxes,
    12,
  );
  expect(point).toEqual({ x: 38, y: 0 });
  expectClear(point, size, boxes, 12);
});

test("uses a clear vertical leg if the horizontal leg cannot fit the label", () => {
  const size = { width: 60, height: 20 };
  const boxes = [{ x: -30, y: -20, width: 160, height: 40 }];
  const point = clearRelationshipLabel(
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 200 },
    ],
    { x: 50, y: 0 },
    size,
    boxes,
  );
  expect(point).toEqual({ x: 100, y: 38 });
  expectClear(point, size, boxes);
});

test("subtracts exact diagonal intervals rather than testing just the label center", () => {
  const size = { width: 40, height: 20 };
  const boxes = [{ x: 40, y: 40, width: 20, height: 20 }];
  const point = clearRelationshipLabel(
    [
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    ],
    { x: 50, y: 50 },
    size,
    boxes,
    10,
  );
  expect(point).toEqual({ x: 20, y: 20 });
  expectClear(point, size, boxes, 10);
});

test("sampled curves select the nearest clear segment regardless of route direction", () => {
  const size = { width: 20, height: 20 };
  const boxes = [{ x: 35, y: 5, width: 30, height: 30 }];
  const route = [
    { x: 0, y: 0 },
    { x: 25, y: 15 },
    { x: 50, y: 20 },
    { x: 75, y: 15 },
    { x: 100, y: 0 },
  ];
  const point = clearRelationshipLabel(route, { x: 60, y: 20 }, size, boxes, 5);
  expect(point.x).toBeCloseTo(80);
  expect(point.y).toBeCloseTo(12);
  expectClear(point, size, boxes, 5);
  expect(clearRelationshipLabel(route.toReversed(), { x: 60, y: 20 }, size, boxes, 5)).toEqual(
    point,
  );
});

test("a crowded short connector gets a clear nearby off-route position", () => {
  const size = { width: 80, height: 30 };
  const boxes = [
    { x: -80, y: -40, width: 80, height: 80 },
    { x: 20, y: -40, width: 80, height: 80 },
  ];
  const route = [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
  ];
  const desired = { x: 10, y: 0 };
  const point = clearRelationshipLabel(route, desired, size, boxes);
  expect(point).toEqual({ x: 10, y: -63 });
  expectClear(point, size, boxes);
  expect(route).toEqual([
    { x: 0, y: 0 },
    { x: 20, y: 0 },
  ]);
  expect(clearRelationshipLabel(route, desired, size, boxes)).toEqual(point);
});

test("finds a nearer corner pocket when both axes are obstructed", () => {
  const boxes = [
    { x: -10, y: -100, width: 20, height: 200 },
    { x: -100, y: -10, width: 200, height: 20 },
  ];
  const size = { width: 10, height: 10 };
  const point = clearRelationshipLabel([{ x: 0, y: 0 }], { x: 0, y: 0 }, size, boxes, 5);
  expect(point).toEqual({ x: -20, y: -20 });
  expectClear(point, size, boxes, 5);
});

test("negative coordinates, overlapping obstacles and zero-length routes terminate", () => {
  const boxes = [
    { x: -100, y: -100, width: 50, height: 50 },
    { x: -80, y: -80, width: 50, height: 50 },
  ];
  const size = { width: 30, height: 10 };
  const desired = { x: -70, y: -70 };
  for (const route of [[], [desired], [desired, desired]]) {
    const point = clearRelationshipLabel(route, desired, size, boxes);
    expectClear(point, size, boxes);
    expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
  }
  expect(clearRelationshipLabel([desired, desired], desired, size, [])).toEqual(desired);
});

test("route tangent to padded card bounds remains usable", () => {
  const size = { width: 40, height: 20 };
  const boxes = [{ x: 20, y: 18, width: 60, height: 50 }];
  const point = clearRelationshipLabel(
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    { x: 50, y: 0 },
    size,
    boxes,
  );
  expect(point).toEqual({ x: 50, y: 0 });
  expectClear(point, size, boxes);
});

test("obstacles include measured annotations and group headers but allow labels inside frames", () => {
  const boxes = labelObstacles([
    {
      id: "section",
      type: "boundary",
      position: { x: 10, y: 100 },
      width: 400,
      height: 300,
      data: { name: "Stage", section: true, classification: null },
    },
    {
      id: "workflow",
      type: "boundary",
      position: { x: 500, y: 100 },
      width: 400,
      height: 300,
      data: { name: "Subprocess", classification: null },
    },
    {
      id: "note",
      type: "annotation",
      position: { x: 40, y: 160 },
      width: 100,
      height: 80,
      measured: { width: 120, height: 90 },
      data: {
        annotation: {
          id: "note",
          kind: "note",
          text: "Note",
          x: 40,
          y: 160,
          width: 100,
          height: 80,
          color: null,
          sectionId: null,
        },
      },
    },
  ]);
  expect(boxes).toEqual([
    { x: 10, y: 64, width: 400, height: 36 },
    { x: 500, y: 100, width: 400, height: 36 },
    { x: 40, y: 160, width: 120, height: 90 },
  ]);
  const desired = { x: 200, y: 200 };
  expect(clearRelationshipLabel([desired], desired, { width: 60, height: 20 }, boxes)).toEqual(
    desired,
  );
});

test("measured multiline section headers reserve their full height outside the frame", () => {
  const nodes: FlowNode[] = [
    {
      id: "section",
      type: "boundary",
      position: { x: 10, y: 100 },
      width: 220,
      height: 300,
      data: { name: "First line\nSecond line", section: true, classification: null },
    },
    {
      id: "workflow",
      type: "boundary",
      position: { x: 400, y: 100 },
      width: 220,
      height: 300,
      data: { name: "Subprocess", classification: null },
    },
  ];
  const boxes = labelObstacles(
    nodes,
    new Map([
      ["section", 48],
      ["workflow", 44],
    ]),
  );
  expect(boxes).toEqual([
    { x: 10, y: 52, width: 220, height: 48 },
    { x: 400, y: 100, width: 220, height: 44 },
  ]);
  const desired = { x: 100, y: 51 };
  const size = { width: 40, height: 20 };
  const point = clearRelationshipLabel(
    [
      { x: 100, y: 0 },
      { x: 100, y: 200 },
    ],
    desired,
    size,
    boxes,
  );
  expect(point).toEqual({ x: 100, y: 34 });
  expectClear(point, size, boxes);
  expect(labelObstacles(nodes)[0]?.height).toBe(40);
});
