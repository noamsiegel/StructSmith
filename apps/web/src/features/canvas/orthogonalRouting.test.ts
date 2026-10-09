import { expect, test } from "bun:test";
import type { ControlPoint } from "@structsmith/contracts";
import { Position } from "@xyflow/react";
import { borderEndpoint, type EndpointSide } from "./endpointGeometry";
import { type RouteObstacle, safeOrthogonalRoute } from "./orthogonalRouting";
import { orthogonalRelationshipBends } from "./relationshipGeometry";

function assertClear(points: ControlPoint[], boxes: RouteObstacle[]) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as ControlPoint;
    const b = points[i] as ControlPoint;
    expect(a.x === b.x || a.y === b.y).toBe(true);
    for (const box of boxes) {
      if ((i === 1 && box.id === "source") || (i === points.length - 1 && box.id === "target"))
        continue;
      const x = box.x - 8,
        y = box.y - 8,
        right = box.x + box.width + 8,
        bottom = box.y + box.height + 8;
      const hit =
        a.y === b.y
          ? a.y > y + 1e-6 &&
            a.y < bottom - 1e-6 &&
            Math.max(a.x, b.x) > x + 1e-6 &&
            Math.min(a.x, b.x) < right - 1e-6
          : a.x > x + 1e-6 &&
            a.x < right - 1e-6 &&
            Math.max(a.y, b.y) > y + 1e-6 &&
            Math.min(a.y, b.y) < bottom - 1e-6;
      expect(hit).toBe(false);
    }
  }
}

test("repairs the Own return route using expanded card heights and outside right approaches", () => {
  const source = { point: { x: 3007, y: 492 }, side: "right" as const, elementId: "source" };
  const target = { point: { x: 2991, y: 108 }, side: "right" as const, elementId: "target" };
  const boxes = [
    { id: "source", x: 2768, y: 400, width: 240, height: 184 },
    { id: "target", x: 2752, y: -32, width: 240, height: 280 },
    { id: "review", x: 2100, y: 0, width: 240, height: 200 },
  ];
  const saved = [source.point, { x: 2447.5, y: 492 }, { x: 2447.5, y: 108 }, target.point];
  const result = safeOrthogonalRoute(source, target, saved, boxes);
  expect(result.blocked).toBe(false);
  const route = result.points;
  expect(route[1]?.x).toBeGreaterThan(source.point.x);
  expect(route.at(-2)?.x).toBeGreaterThan(target.point.x);
  assertClear(route, boxes);
  expect(saved[1]).toEqual({ x: 2447.5, y: 492 });
});

test("keeps a valid manual lane, repairs only a blocked segment and respects all border sides", () => {
  const boxes = [
    { id: "source", x: 0, y: 0, width: 100, height: 100 },
    { id: "target", x: 600, y: 300, width: 100, height: 100 },
    { id: "blocker", x: 280, y: 80, width: 150, height: 270 },
  ];
  for (const side of Object.values(Position))
    for (const targetSide of Object.values(Position)) {
      const source = {
        point: borderEndpoint({ ...(boxes[0] as RouteObstacle), shape: "rectangle" }, side, 0.5),
        side,
        elementId: "source",
      };
      const target = {
        point: borderEndpoint(
          { ...(boxes[1] as RouteObstacle), shape: "rectangle" },
          targetSide,
          0.5,
        ),
        side: targetSide,
        elementId: "target",
      };
      const saved = [
        source.point,
        ...orthogonalRelationshipBends(source.point, target.point, side, targetSide),
        target.point,
      ];
      const result = safeOrthogonalRoute(source, target, saved, boxes);
      expect(result.blocked).toBe(false);
      const route = result.points;
      assertClear(route, boxes);
      const outside = (endpoint: typeof source, neighbour: ControlPoint) =>
        endpoint.side === "right"
          ? neighbour.x > endpoint.point.x
          : endpoint.side === "left"
            ? neighbour.x < endpoint.point.x
            : endpoint.side === "top"
              ? neighbour.y < endpoint.point.y
              : neighbour.y > endpoint.point.y;
      expect(outside(source, route[1] as ControlPoint)).toBe(true);
      expect(outside(target, route.at(-2) as ControlPoint)).toBe(true);
    }
  const source = { point: { x: 99, y: 50 }, side: "right" as EndpointSide, elementId: "source" };
  const target = { point: { x: 601, y: 350 }, side: "left" as EndpointSide, elementId: "target" };
  const saved = [
    source.point,
    { x: 150, y: 50 },
    { x: 150, y: 450 },
    { x: 550, y: 450 },
    { x: 550, y: 350 },
    target.point,
  ];
  expect(safeOrthogonalRoute(source, target, saved, boxes)).toEqual({
    points: saved,
    blocked: false,
  });
  const blocked = { id: "new-card", x: 350, y: 420, width: 100, height: 100 };
  const repaired = safeOrthogonalRoute(source, target, saved, [...boxes, blocked]).points;
  expect(repaired).toContainEqual({ x: 150, y: 450 });
  expect(repaired).toContainEqual({ x: 550, y: 450 });
  assertClear(repaired, [...boxes, blocked]);
});

test("loose endpoints keep their locations and enclosing Section interiors are traversable", () => {
  const source = { point: { x: 0, y: 50 }, side: "left" as const };
  const target = { point: { x: 600, y: 50 }, side: "right" as const };
  const header = { id: "section-title", x: 100, y: -40, width: 400, height: 40 };
  const boxes = [header, { id: "note", x: 250, y: 20, width: 100, height: 100 }];
  const route = safeOrthogonalRoute(source, target, [source.point, target.point], boxes).points;
  expect(route[0]).toEqual(source.point);
  expect(route.at(-1)).toEqual(target.point);
  assertClear(route, boxes);
  expect(route.length).toBeGreaterThan(2);
});

test("overlapping objects have a finite fallback without changing saved intent", () => {
  const source = { point: { x: 99, y: 50 }, side: "right" as const, elementId: "source" };
  const target = { point: { x: 501, y: 50 }, side: "left" as const, elementId: "target" };
  const saved = [source.point, target.point];
  expect(
    safeOrthogonalRoute(source, target, saved, [
      { id: "cover", x: -50, y: -50, width: 300, height: 300 },
    ]),
  ).toEqual({ points: saved, blocked: true });
  expect(
    safeOrthogonalRoute(source, target, saved, [
      { id: "source", x: 0, y: 0, width: 100, height: 100 },
      { id: "target", x: 500, y: 0, width: 100, height: 100 },
      { id: "cover", x: 90, y: 20, width: 15, height: 60 },
    ]).blocked,
  ).toBe(true);
});
