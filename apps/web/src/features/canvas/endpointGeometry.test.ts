import { expect, test } from "bun:test";
import type { NodeShape } from "@structsmith/domain";
import {
  borderEndpoint,
  type EndpointBox,
  nearestBorderEndpoint,
  snapConnectorEndpoint,
} from "./endpointGeometry";

const box: EndpointBox = { id: "card", x: 30, y: 40, width: 220, height: 100, shape: "rectangle" };
const shapes: NodeShape[] = [
  "rectangle",
  "subprocess",
  "terminal",
  "diamond",
  "cylinder",
  "data",
  "document",
  "start",
  "end",
  "bar",
];

test("border attachments use the visible silhouette rather than the text bounding box", () => {
  const midpoint = (shape: NodeShape, side: "left" | "right" | "top" | "bottom") =>
    borderEndpoint({ ...box, shape }, side, 0.5);
  expect(midpoint("rectangle", "left")).toEqual({ x: 31, y: 90 });
  expect(midpoint("subprocess", "right")).toEqual({ x: 249, y: 90 });
  expect(midpoint("terminal", "top")).toEqual({ x: 140, y: 41 });
  expect(midpoint("diamond", "top")).toEqual({ x: 140, y: 41 });
  expect(borderEndpoint({ ...box, shape: "diamond" }, "left", 0.25)).toEqual({ x: 85.5, y: 65.5 });
  expect(midpoint("cylinder", "top")).toEqual({ x: 140, y: 41.5 });
  expect(midpoint("cylinder", "bottom")).toEqual({ x: 140, y: 138.5 });
  expect(midpoint("data", "left")).toEqual({ x: 43, y: 90 });
  expect(borderEndpoint({ ...box, shape: "document" }, "top", 1)).toEqual({ x: 249, y: 59 });
  expect(midpoint("start", "left").x).toBeCloseTo(128, 10);
  expect(midpoint("start", "bottom").y).toBeCloseTo(68, 10);
  expect(midpoint("end", "right").x).toBeCloseTo(154, 10);
  expect(midpoint("bar", "bottom")).toEqual({ x: 140, y: 62 });
});

test("arbitrary border fractions round trip across every side and shape", () => {
  for (const shape of shapes) {
    for (const side of ["left", "right", "top", "bottom"] as const) {
      for (const fraction of [0, 0.037, 0.291, 0.5, 0.713, 0.981, 1]) {
        const next = { ...box, shape };
        const point = borderEndpoint(next, side, fraction);
        const nearest = nearestBorderEndpoint(next, point);
        expect(nearest.distance).toBeLessThan(0.001);
        expect(Math.hypot(nearest.point.x - point.x, nearest.point.y - point.y)).toBeLessThan(
          0.001,
        );
      }
    }
  }
});

test("nearest attachments follow sloped, rounded and curved outlines", () => {
  expect(nearestBorderEndpoint({ ...box, shape: "diamond" }, { x: 10, y: 90 }).point.x).toBeCloseTo(
    31,
    3,
  );
  const terminal = nearestBorderEndpoint({ ...box, shape: "terminal" }, { x: 30, y: 40 });
  expect(terminal.point.x).toBeGreaterThan(31);
  expect(terminal.point.y).toBeGreaterThan(41);
  const cylinder = nearestBorderEndpoint({ ...box, shape: "cylinder" }, { x: 140, y: 20 });
  expect(cylinder.side).toBe("top");
  expect(cylinder.point.y).toBeCloseTo(41.5, 3);
  const document = nearestBorderEndpoint({ ...box, shape: "document" }, { x: 249, y: 41 });
  expect(document.point.x).toBeCloseTo(240, 3);
  expect(document.point.y).toBeCloseTo(50, 3);
});

test("fraction limits clamp without producing non-finite endpoints", () => {
  for (const shape of shapes) {
    const next = { ...box, shape };
    expect(borderEndpoint(next, "top", -1)).toEqual(borderEndpoint(next, "top", 0));
    expect(borderEndpoint(next, "bottom", 2)).toEqual(borderEndpoint(next, "bottom", 1));
    expect(borderEndpoint(next, "left", Number.NaN)).toEqual(borderEndpoint(next, "left", 0.5));
  }
});

test("dropping inside nested objects prefers the smallest containing object", () => {
  const outer: EndpointBox = { ...box, id: "outer", x: 0, y: 0, width: 800, height: 500 };
  expect(snapConnectorEndpoint([outer, box], { x: 140, y: 90 }, 5)?.elementId).toBe("card");
  expect(snapConnectorEndpoint([box, outer], { x: 140, y: 90 }, 5)?.elementId).toBe("card");
});

test("outside snapping honors border distance and empty canvas remains unattached", () => {
  const point = { x: 25, y: 90 };
  const snap = snapConnectorEndpoint([box], point, 6);
  expect(snap?.elementId).toBe("card");
  expect(snap?.side).toBe("left");
  expect(snap?.point.x).toBeCloseTo(31, 3);
  expect(snapConnectorEndpoint([box], point, 5.99)).toBeNull();
  expect(snapConnectorEndpoint([box], { x: 1000, y: 1000 }, 20)).toBeNull();
  expect(snapConnectorEndpoint([], point, 20)).toBeNull();
});

test("control titles and empty shape corners are not attachment interiors", () => {
  for (const shape of ["start", "end", "bar"] as const) {
    expect(snapConnectorEndpoint([{ ...box, shape }], { x: 140, y: 110 }, 5)).toBeNull();
  }
  for (const shape of ["diamond", "terminal", "cylinder", "document"] as const) {
    expect(snapConnectorEndpoint([{ ...box, shape }], { x: 249, y: 41 }, 0.01)).toBeNull();
  }
  expect(snapConnectorEndpoint([{ ...box, shape: "data" }], { x: 31, y: 41 }, 0.01)).toBeNull();
});

test("nearby objects use the closest border when none contains the drop", () => {
  const right = { ...box, id: "right", x: 265 };
  expect(snapConnectorEndpoint([box, right], { x: 260, y: 90 }, 20)?.elementId).toBe("right");
});

test("faraway objects do not alter nearby border attachment or empty canvas drops", () => {
  const far = Array.from({ length: 100 }, (_, index) => ({
    ...box,
    id: `far-${index}`,
    x: 1000 + index * 300,
    y: 1000,
  }));
  const point = { x: 25, y: 90 };
  expect(snapConnectorEndpoint([...far, box], point, 6)).toEqual(
    snapConnectorEndpoint([box], point, 6),
  );
  expect(snapConnectorEndpoint(far, { x: 500, y: 500 }, 20)).toBeNull();
});
