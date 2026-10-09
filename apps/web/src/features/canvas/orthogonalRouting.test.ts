import { expect, test } from "bun:test";
import type { ControlPoint } from "@structsmith/contracts";
import { Position } from "@xyflow/react";
import { borderEndpoint, type EndpointSide } from "./endpointGeometry";
import { spaceConnectorRoutes } from "./LabelPlacement";
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

test("removes immediate retraces from the Upload documents section-title detour", () => {
  const source = { point: { x: 1592, y: 1 }, side: "top" as const, elementId: "source" };
  const target = { point: { x: 1592, y: -271 }, side: "top" as const };
  const saved = [
    source.point,
    { x: 1592, y: -24 },
    { x: 1608, y: -24 },
    { x: 1608, y: -76 },
    { x: 1656, y: -76 },
    { x: 1656, y: -271 },
    target.point,
  ];
  const boxes = [
    { id: "source", x: 1472, y: 0, width: 240, height: 184 },
    { id: "header", x: 1088, y: -68, width: 656, height: 36 },
  ];
  const result = safeOrthogonalRoute(source, target, saved, boxes);
  expect(result.blocked).toBe(false);
  expect(result.points).toEqual([
    source.point,
    { x: 1592, y: -24 },
    { x: 1752, y: -24 },
    { x: 1752, y: -76 },
    { x: 1656, y: -76 },
    { x: 1656, y: -271 },
    target.point,
  ]);
  assertClear(result.points, boxes);
  expect(saved[3]).toEqual({ x: 1608, y: -76 });
});

test("normalizes retraces and duplicates on valid routes without flattening authored loops", () => {
  const source = { point: { x: 0, y: 0 }, side: "right" as const };
  const target = { point: { x: 200, y: 100 }, side: "left" as const };
  const loop = [
    source.point,
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 50, y: 100 },
    { x: 50, y: 50 },
    { x: 150, y: 50 },
    { x: 150, y: 100 },
    target.point,
  ];
  expect(safeOrthogonalRoute(source, target, loop, []).points).toEqual(loop);
  const saved = [
    source.point,
    source.point,
    { x: 50, y: 0 },
    { x: 50, y: 100 },
    { x: 150, y: 100 },
    { x: 50, y: 100 },
    { x: 150, y: 100 },
    target.point,
    target.point,
  ];
  expect(safeOrthogonalRoute(source, target, saved, [])).toEqual({
    points: [source.point, { x: 50, y: 0 }, { x: 50, y: 100 }, target.point],
    blocked: false,
  });
});

test("compaction preserves outward attached endpoint approaches", () => {
  const source = { point: { x: 0, y: 0 }, side: "right" as const, elementId: "source" };
  const target = { point: { x: -100, y: 100 }, side: "left" as const, elementId: "target" };
  const saved = [
    source.point,
    { x: 24, y: 0 },
    { x: -124, y: 0 },
    { x: -124, y: 100 },
    { x: -200, y: 100 },
    target.point,
  ];
  const result = safeOrthogonalRoute(source, target, saved, []);
  expect(result.blocked).toBe(false);
  expect(result.points[1]?.x).toBeGreaterThan(source.point.x);
  expect(result.points.at(-2)?.x).toBeLessThan(target.point.x);
  expect(result.points).not.toContainEqual({ x: -200, y: 100 });
});

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
  expect(repaired).toContainEqual({ x: 550, y: 350 });
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

test("separates parallel automatic lanes while allowing perpendicular crossings", () => {
  const source = { point: { x: 100, y: 25 }, side: "right" as const, elementId: "source" };
  const target = { point: { x: 600, y: 350 }, side: "left" as const, elementId: "target" };
  const boxes = [
    { id: "source", x: 0, y: 0, width: 100, height: 100 },
    { id: "target", x: 600, y: 300, width: 100, height: 100 },
  ];
  const first = [source.point, { x: 350, y: 25 }, { x: 350, y: 350 }, target.point];
  const nextSource = { ...source, point: { x: 100, y: 75 } };
  const nextTarget = { ...target, point: { x: 600, y: 375 } };
  const original = [nextSource.point, { x: 350, y: 75 }, { x: 350, y: 375 }, nextTarget.point];
  const result = safeOrthogonalRoute(nextSource, nextTarget, original, boxes, [first]);
  expect(result.blocked).toBe(false);
  expect(result.points).not.toEqual(original);
  expect(result.points[0]).toEqual(nextSource.point);
  expect(result.points.at(-1)).toEqual(nextTarget.point);
  assertClear(result.points, boxes);
  for (let i = 1; i < result.points.length; i++) {
    const a = result.points[i - 1] as ControlPoint,
      b = result.points[i] as ControlPoint;
    for (let j = 1; j < first.length; j++) {
      const c = first[j - 1] as ControlPoint,
        d = first[j] as ControlPoint;
      const horizontal = a.y === b.y && c.y === d.y;
      const vertical = a.x === b.x && c.x === d.x;
      if (!horizontal && !vertical) continue;
      const along = horizontal ? "x" : "y",
        axis = horizontal ? "y" : "x";
      const overlap =
        Math.min(Math.max(a[along], b[along]), Math.max(c[along], d[along])) -
        Math.max(Math.min(a[along], b[along]), Math.min(c[along], d[along]));
      if (overlap > 1e-6) expect(Math.abs(a[axis] - c[axis])).toBeGreaterThanOrEqual(12 - 1e-6);
    }
  }
  const crossing = [
    { x: 200, y: -100 },
    { x: 200, y: 200 },
  ];
  const straight = [source.point, { x: 600, y: 25 }];
  expect(
    safeOrthogonalRoute(
      source,
      { ...target, point: straight[1] as ControlPoint },
      straight,
      [],
      [crossing],
    ),
  ).toEqual({ points: straight, blocked: false });
  expect(first).toEqual([source.point, { x: 350, y: 25 }, { x: 350, y: 350 }, target.point]);
});

test("view lane allocation reserves manual paths and keeps older automatic routes stable", () => {
  const make = (y: number, manual: boolean, createdAt: string) => ({
    source: { point: { x: 100, y }, side: "right" as const, elementId: "source" },
    target: { point: { x: 600, y: y + 300 }, side: "left" as const, elementId: "target" },
    points: [
      { x: 100, y },
      { x: 350, y },
      { x: 350, y: y + 300 },
      { x: 600, y: y + 300 },
    ],
    obstacles: [],
    manual,
    createdAt,
  });
  const automatic = make(25, false, "2026-10-09T00:00:00Z");
  const manual = make(75, true, "2026-10-09T01:00:00Z");
  const initial = new Map([
    ["auto", automatic],
    ["manual", manual],
  ]);
  const first = spaceConnectorRoutes(initial);
  expect(first.get("manual")).toEqual(manual.points);
  const secondManual = make(85, true, "2026-10-09T03:00:00Z");
  expect(
    spaceConnectorRoutes(new Map([...initial, ["second-manual", secondManual]])).get(
      "second-manual",
    ),
  ).toEqual(secondManual.points);
  expect(first.get("auto")).not.toEqual(automatic.points);
  const appended = spaceConnectorRoutes(
    new Map([...initial, ["new", make(125, false, "2026-10-09T02:00:00Z")]]),
  );
  expect(appended.get("auto")).toEqual(first.get("auto"));
  expect(appended.get("manual")).toEqual(manual.points);
  const enclosed = {
    ...automatic,
    obstacles: [{ id: "cover", x: 0, y: 0, width: 1000, height: 1000 }],
  };
  expect(spaceConnectorRoutes(new Map([["enclosed", enclosed]])).get("enclosed")).toEqual(
    enclosed.points,
  );
});

test("overflow lanes avoid the many-turn staircase reproduced in the fan-out demo", () => {
  const source = { point: { x: 219, y: 380.625 }, side: "right" as const, elementId: "hub" };
  const target = { point: { x: 901, y: 952 }, side: "left" as const, elementId: "target-6" };
  const lanes = [
    [
      { x: 219, y: 400.5 },
      { x: 500, y: 400.5 },
      { x: 500, y: 1102 },
      { x: 901, y: 1102 },
    ],
    [
      { x: 219, y: 480 },
      { x: 560, y: 480 },
      { x: 560, y: 52 },
      { x: 901, y: 52 },
    ],
    [
      { x: 219, y: 559.5 },
      { x: 877, y: 559.5 },
      { x: 877, y: 202 },
      { x: 901, y: 202 },
    ],
    [
      { x: 219, y: 360.75 },
      { x: 243, y: 360.75 },
      { x: 243, y: 352 },
      { x: 901, y: 352 },
    ],
    [
      { x: 219, y: 440.25 },
      { x: 243, y: 440.25 },
      { x: 243, y: 502 },
      { x: 901, y: 502 },
    ],
    [
      { x: 219, y: 519.75 },
      { x: 560, y: 519.75 },
      { x: 560, y: 652 },
      { x: 901, y: 652 },
    ],
    [
      { x: 219, y: 599.25 },
      { x: 877, y: 599.25 },
      { x: 877, y: 802 },
      { x: 901, y: 802 },
    ],
  ];
  const obstacles = [
    { id: "hub", x: 0, y: 320, width: 220, height: 320 },
    ...Array.from({ length: 8 }, (_, i) => ({
      id: `target-${i}`,
      x: 900,
      y: i * 150,
      width: 220,
      height: 104,
    })),
  ];
  const result = safeOrthogonalRoute(
    source,
    target,
    [source.point, { x: 560, y: 380.625 }, { x: 560, y: 952 }, target.point],
    obstacles,
    lanes,
  );
  expect(result.blocked).toBe(false);
  expect(result.points.length).toBeLessThanOrEqual(4);
  assertClear(
    result.points,
    obstacles.map((box) => ({
      ...box,
      id: box.id === "hub" ? "source" : box.id === "target-6" ? "target" : box.id,
    })),
  );
});
