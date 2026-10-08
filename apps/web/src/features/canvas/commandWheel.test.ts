import { expect, test } from "bun:test";
import { commandWheelViewport } from "./commandWheel";

test("Command wheel zooms in both directions around the pointer and stays within canvas limits", () => {
  const original = { x: 100, y: 50, zoom: 1 };
  const point = { x: 400, y: 300 };
  const closer = commandWheelViewport(original, point, -100, 0);
  expect(closer.zoom).toBeGreaterThan(1);
  expect((point.x - closer.x) / closer.zoom).toBe(300);
  expect((point.y - closer.y) / closer.zoom).toBe(250);
  const restored = commandWheelViewport(closer, point, 100, 0);
  expect(restored.zoom).toBeCloseTo(1);
  expect(restored.x).toBeCloseTo(original.x);
  expect(restored.y).toBeCloseTo(original.y);
  expect(commandWheelViewport(original, point, -1e6, 0).zoom).toBe(2.5);
  expect(commandWheelViewport(original, point, 1e6, 0).zoom).toBe(0.15);
  expect(commandWheelViewport(original, point, -4, 1).zoom).toBeCloseTo(closer.zoom);
  expect(commandWheelViewport(original, point, -0.2, 2).zoom).toBeCloseTo(closer.zoom);
});
