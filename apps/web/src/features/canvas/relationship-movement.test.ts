import { expect, test } from "bun:test";
import type { ControlPoint } from "@structsmith/contracts";
import { Position } from "@xyflow/react";
import {
  captureRelationshipBends,
  movedRelationshipBends,
  orthogonalRelationshipBends,
} from "./relationshipGeometry";

const source = { x: 0, y: 0 };
const target = { x: 300, y: 100 };
const zero = { x: 0, y: 0 };

test("moving one endpoint keeps the visible automatic middle route fixed", () => {
  const captured = captureRelationshipBends(source, target, Position.Right, Position.Left);
  expect(captured).toEqual([
    { x: 150, y: 0 },
    { x: 150, y: 100 },
  ]);
  for (const [sourceDelta, targetDelta] of [
    [zero, { x: 100, y: 80 }],
    [{ x: -40, y: -50 }, zero],
    [
      { x: -40, y: -50 },
      { x: 100, y: 80 },
    ],
  ] as const) {
    const moved = movedRelationshipBends(captured, sourceDelta, targetDelta);
    expect(moved).toEqual(captured);
    const newSource = { x: source.x + sourceDelta.x, y: source.y + sourceDelta.y };
    const newTarget = { x: target.x + targetDelta.x, y: target.y + targetDelta.y };
    const rendered = orthogonalRelationshipBends(
      newSource,
      newTarget,
      Position.Right,
      Position.Left,
      moved ?? [],
    );
    const points = [newSource, ...rendered, newTarget];
    expect(
      points.some((point, index) => {
        const next = points[index + 1];
        return (
          next &&
          point.x === 150 &&
          next.x === 150 &&
          Math.min(point.y, next.y) <= 50 &&
          Math.max(point.y, next.y) >= 50
        );
      }),
    ).toBe(true);
    for (let index = 1; index < points.length; index++) {
      const before = points[index - 1] as ControlPoint;
      const point = points[index] as ControlPoint;
      expect(before.x === point.x || before.y === point.y).toBe(true);
    }
  }
});

test("moving both endpoints by the same delta translates every captured control", () => {
  const captured = captureRelationshipBends(source, target, Position.Right, Position.Left);
  for (const delta of [
    { x: 50, y: -25 },
    { x: 0, y: 100 },
    { x: -100, y: 0 },
    { x: 40.00000000000001, y: 35 },
  ]) {
    expect(movedRelationshipBends(captured, delta, delta)).toEqual([
      { x: 150 + delta.x, y: delta.y },
      { x: 150 + delta.x, y: 100 + delta.y },
    ]);
  }
  expect(captured).toEqual([
    { x: 150, y: 0 },
    { x: 150, y: 100 },
  ]);
  expect(
    movedRelationshipBends(captured, { x: 40.00000000000001, y: 35 }, { x: 40, y: 35 }),
  ).toEqual([
    { x: 190, y: 35 },
    { x: 190, y: 135 },
  ]);
});

test("straight orthogonal routes retain a middle anchor when an endpoint leaves the line", () => {
  for (const [end, sourcePosition, targetPosition, midpoint] of [
    [{ x: 300, y: 0 }, Position.Right, Position.Left, { x: 150, y: 0 }],
    [{ x: 0, y: 300 }, Position.Bottom, Position.Top, { x: 0, y: 150 }],
  ] as const) {
    const captured = captureRelationshipBends(source, end, sourcePosition, targetPosition);
    expect(captured).toEqual([midpoint]);
    expect(movedRelationshipBends(captured, zero, { x: 50, y: 50 })).toEqual([midpoint]);
    expect(movedRelationshipBends(captured, { x: 50, y: 50 }, { x: 50, y: 50 })).toEqual([
      { x: midpoint.x + 50, y: midpoint.y + 50 },
    ]);
  }
});

test("manual captures retain duplicate, collinear and backtracking controls without mutation", () => {
  const saved = [
    { x: 50, y: 0 },
    { x: 50, y: 0 },
    { x: 100, y: 0 },
    { x: 40, y: 0 },
    { x: 40, y: 100 },
  ];
  const original = structuredClone(saved);
  const captured = captureRelationshipBends(source, target, Position.Right, Position.Left, saved);
  expect(captured).toEqual(saved);
  expect(captured).not.toBe(saved);
  expect(captured[0]).not.toBe(saved[0]);
  const moved = movedRelationshipBends(captured, { x: 20, y: -10 }, { x: 20, y: -10 });
  expect(moved).toEqual(original.map((point) => ({ x: point.x + 20, y: point.y - 10 })));
  expect(saved).toEqual(original);
  expect(captured).toEqual(original);
  expect(moved?.[0]).not.toBe(captured[0]);
});

test("ending a drag without displacement signals no route write", () => {
  const captured = captureRelationshipBends(source, target, Position.Right, Position.Left);
  expect(movedRelationshipBends(captured, zero, zero)).toBeNull();
  expect(movedRelationshipBends([], zero, zero)).toBeNull();
});
