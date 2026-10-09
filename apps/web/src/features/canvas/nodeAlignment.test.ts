import { expect, test } from "bun:test";
import { borderEndpoint } from "./endpointGeometry";
import {
  type ConnectionAlignment,
  connectionAlignmentSnap,
  straightenedAutomaticBends,
} from "./nodeAlignment";

const connection: ConnectionAlignment = {
  sourceId: "source",
  targetId: "target",
  source: { x: 199, y: 49 },
  target: { x: 401, y: 49 },
  sourceOrigin: { x: 0, y: 0 },
  targetOrigin: { x: 400, y: 0 },
  sourceSide: "right",
  targetSide: "left",
};

test("aligns real connection coordinates despite grid-snapped cards with different heights", () => {
  const sourceBox = {
    id: "source",
    x: 0,
    y: 16,
    width: 200,
    height: 99,
    shape: "rectangle" as const,
  };
  const targetBox = {
    id: "target",
    x: 400,
    y: 32,
    width: 200,
    height: 73,
    shape: "rectangle" as const,
  };
  const link = {
    ...connection,
    source: borderEndpoint(sourceBox, "right", 0.5),
    target: borderEndpoint(targetBox, "left", 0.5),
    sourceOrigin: { x: sourceBox.x, y: sourceBox.y },
    targetOrigin: { x: targetBox.x, y: targetBox.y },
  };
  const snap = connectionAlignmentSnap([link], new Map([["source", { x: 16, y: 16 }]]), 6);
  expect(snap.delta).toEqual({ x: 0, y: 3 });
  expect(snap.guides[0]?.source.y).toBe(link.target.y);
  expect(snap.guides[0]?.target.y).toBe(link.target.y);
});

test("does not snap when both connected nodes belong to the moving selection or section", () => {
  const snap = connectionAlignmentSnap(
    [connection],
    new Map([
      ["source", { x: 16, y: 3 }],
      ["target", { x: 416, y: 3 }],
    ]),
    6,
  );
  expect(snap).toEqual({ delta: { x: 0, y: 0 }, guides: [] });
});

test("moving a target snaps its endpoint, and unrelated moving objects share the group delta", () => {
  const positions = new Map([
    ["target", { x: 416, y: 4.25 }],
    ["companion", { x: 900, y: 4.25 }],
  ]);
  const snap = connectionAlignmentSnap([connection], positions, 6);
  expect(snap.delta).toEqual({ x: 0, y: -4.25 });
  expect(snap.guides[0]?.source.y).toBe(49);
  expect(snap.guides[0]?.target.y).toBe(49);
  expect(snap.guides[0]?.target.x).toBe(417);
  expect(positions.get("target")).toEqual({ x: 416, y: 4.25 });
});

test("uses screen-space tolerance and ignores close endpoints on wrong-facing sides", () => {
  const positions = new Map([["source", { x: 0, y: 4 }]]);
  expect(connectionAlignmentSnap([connection], positions, 6 / 2).guides).toEqual([]);
  expect(
    connectionAlignmentSnap([{ ...connection, targetSide: "right" }], positions, 6).guides,
  ).toEqual([]);
  expect(
    connectionAlignmentSnap([{ ...connection, source: { x: 450, y: 49 } }], positions, 6).guides,
  ).toEqual([]);
});

test("top and bottom attachments align horizontally with a nearest deterministic target", () => {
  const vertical: ConnectionAlignment = {
    ...connection,
    source: { x: 99, y: 99 },
    target: { x: 99, y: 401 },
    sourceSide: "bottom",
    targetSide: "top",
  };
  const positions = new Map([["source", { x: 4, y: 16 }]]);
  const snap = connectionAlignmentSnap(
    [{ ...vertical, target: { x: 104, y: 401 } }, vertical],
    positions,
    6,
  );
  expect(snap.delta).toEqual({ x: 1, y: 0 });
  expect(snap.guides).toEqual([{ source: { x: 104, y: 115 }, target: { x: 104, y: 401 } }]);
});

test("aligned automatic tiny jog collapses to the existing midpoint convention", () => {
  const link = { ...connection, source: { x: 199, y: 46 } };
  const positions = new Map([["source", { x: 0, y: 3 }]]);
  const bends = [
    { x: 300, y: 46 },
    { x: 300, y: 49 },
  ];
  expect(straightenedAutomaticBends(link, positions, bends)).toEqual([{ x: 300, y: 49 }]);
  expect(bends).toEqual([
    { x: 300, y: 46 },
    { x: 300, y: 49 },
  ]);
});

test("authored middle bends and automatic obstacle detours remain unchanged", () => {
  const positions = new Map([["source", { x: 0, y: 0 }]]);
  const manual = [
    { x: 250, y: 49 },
    { x: 275, y: 51 },
    { x: 350, y: 49 },
  ];
  expect(straightenedAutomaticBends(undefined, positions, manual)).toBeNull();
  expect(straightenedAutomaticBends(connection, positions, [{ x: 300, y: 58 }])).toBeNull();
  expect(straightenedAutomaticBends(connection, positions, [{ x: 450, y: 49 }])).toBeNull();
  expect(
    straightenedAutomaticBends(connection, new Map([["source", { x: 0, y: 1 }]]), manual),
  ).toBeNull();
});

test("automatic vertical tiny jog collapses only between facing top and bottom borders", () => {
  const link = {
    ...connection,
    source: { x: 100, y: 199 },
    target: { x: 103, y: 401 },
    sourceSide: "bottom" as const,
    targetSide: "top" as const,
  };
  const positions = new Map([["source", { x: 3, y: 0 }]]);
  const bends = [
    { x: 100, y: 300 },
    { x: 103, y: 300 },
  ];
  expect(straightenedAutomaticBends(link, positions, bends)).toEqual([{ x: 103, y: 300 }]);
  expect(
    straightenedAutomaticBends({ ...link, targetSide: "bottom" }, positions, bends),
  ).toBeNull();
});

test("translated card origins preserve actual attachment coordinates", () => {
  const link = {
    ...connection,
    source: { x: 199, y: 149 },
    target: { x: 401, y: 149 },
    sourceOrigin: { x: 100, y: 100 },
    targetOrigin: { x: 400, y: 100 },
  };
  expect(connectionAlignmentSnap([link], new Map([["source", { x: 116, y: 103 }]]), 6)).toEqual({
    delta: { x: 0, y: -3 },
    guides: [{ source: { x: 215, y: 149 }, target: { x: 401, y: 149 } }],
  });
  expect(connectionAlignmentSnap([link], new Map([["target", { x: 420, y: 97 }]]), 6)).toEqual({
    delta: { x: 0, y: 3 },
    guides: [{ source: { x: 199, y: 149 }, target: { x: 421, y: 149 } }],
  });
  expect(straightenedAutomaticBends(link, new Map(), [{ x: 150, y: 149 }])).toBeNull();
});

test("raw pointer alignment overrides only its guided axis despite the 16px grid phase", () => {
  const link = { ...connection, target: { x: 401, y: 57 } };
  const raw = new Map([["source", { x: 15, y: 8 }]]);
  const grid = new Map([["source", { x: 16, y: 16 }]]);
  const snap = connectionAlignmentSnap([link], raw, 6 / 2, grid);
  expect(snap.delta).toEqual({ x: 0, y: -8 });
  expect(snap.guides).toEqual([{ source: { x: 215, y: 57 }, target: { x: 401, y: 57 } }]);
  const outside = connectionAlignmentSnap(
    [link],
    new Map([["source", { x: 15, y: 4 }]]),
    6 / 2,
    grid,
  );
  expect(outside).toEqual({ delta: { x: 0, y: 0 }, guides: [] });
});

test("raw pointer movement keeps both-moving groups on the grid and cleans aligned automatic jogs", () => {
  const raw = new Map([
    ["source", { x: 15, y: 8 }],
    ["target", { x: 415, y: 8 }],
  ]);
  const grid = new Map([
    ["source", { x: 16, y: 16 }],
    ["target", { x: 416, y: 16 }],
  ]);
  expect(connectionAlignmentSnap([connection], raw, 6 / 2, grid)).toEqual({
    delta: { x: 0, y: 0 },
    guides: [],
  });
  const link = { ...connection, target: { x: 401, y: 53 } };
  const rawSource = new Map([["source", { x: 15, y: 4 }]]);
  const gridSource = new Map([["source", { x: 16, y: 0 }]]);
  const snap = connectionAlignmentSnap([link], rawSource, 6 / 2, gridSource);
  const adjusted = new Map([["source", { x: 16 + snap.delta.x, y: snap.delta.y }]]);
  expect(
    straightenedAutomaticBends(link, adjusted, [
      { x: 300, y: 49 },
      { x: 300, y: 53 },
    ]),
  ).toEqual([{ x: 308, y: 53 }]);
});

test("half-grid automatic jog cleans at exactly 8px while larger detours remain", () => {
  const link = { ...connection, target: { x: 401, y: 57 } };
  const positions = new Map([["source", { x: 0, y: 8 }]]);
  expect(
    straightenedAutomaticBends(link, positions, [
      { x: 300, y: 49 },
      { x: 300, y: 57 },
    ]),
  ).toEqual([{ x: 300, y: 57 }]);
  expect(
    straightenedAutomaticBends(link, positions, [
      { x: 300, y: 48.99 },
      { x: 300, y: 57 },
    ]),
  ).toBeNull();
  expect(
    straightenedAutomaticBends(undefined, positions, [
      { x: 300, y: 49 },
      { x: 300, y: 57 },
    ]),
  ).toBeNull();
});
