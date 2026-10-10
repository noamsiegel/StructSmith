import type { ControlPoint } from "@structsmith/contracts";
import type { EndpointSide } from "./endpointGeometry";
import type { LabelBox } from "./labelClearance";

export type RouteObstacle = LabelBox & { id: string };
export type RouteEndpoint = { point: ControlPoint; side: EndpointSide; elementId?: string };
const same = (a: ControlPoint, b: ControlPoint) => a.x === b.x && a.y === b.y;
const directions = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] } as const;

function inside(point: ControlPoint, box: LabelBox): boolean {
  return (
    point.x > box.x + 1e-6 &&
    point.x < box.x + box.width - 1e-6 &&
    point.y > box.y + 1e-6 &&
    point.y < box.y + box.height - 1e-6
  );
}

function clear(a: ControlPoint, b: ControlPoint, boxes: readonly LabelBox[]): boolean {
  if (a.x !== b.x && a.y !== b.y) return false;
  return boxes.every((box) =>
    a.y === b.y
      ? a.y <= box.y + 1e-6 ||
        a.y >= box.y + box.height - 1e-6 ||
        Math.max(a.x, b.x) <= box.x + 1e-6 ||
        Math.min(a.x, b.x) >= box.x + box.width - 1e-6
      : a.x <= box.x + 1e-6 ||
        a.x >= box.x + box.width - 1e-6 ||
        Math.max(a.y, b.y) <= box.y + 1e-6 ||
        Math.min(a.y, b.y) >= box.y + box.height - 1e-6,
  );
}

function outward(endpoint: RouteEndpoint, neighbour: ControlPoint): boolean {
  const [dx, dy] = directions[endpoint.side];
  return (
    !endpoint.elementId ||
    (neighbour.x - endpoint.point.x) * dx + (neighbour.y - endpoint.point.y) * dy > 0
  );
}

function compact(
  points: readonly ControlPoint[],
  source?: RouteEndpoint,
  target?: RouteEndpoint,
): ControlPoint[] {
  const result: ControlPoint[] = [];
  for (const point of points) {
    if (result.length && same(result[result.length - 1] as ControlPoint, point)) continue;
    while (result.length > 1) {
      const a = result[result.length - 2] as ControlPoint;
      const b = result[result.length - 1] as ControlPoint;
      if (
        !((a.x === b.x && b.x === point.x) || (a.y === b.y && b.y === point.y)) ||
        (source && result.length === 2 && !outward(source, point)) ||
        (target && same(point, target.point) && !outward(target, a))
      )
        break;
      result.pop();
    }
    if (!result.length || !same(result[result.length - 1] as ControlPoint, point))
      result.push(point);
  }
  return result;
}

/** Obstacle borders form the search grid. */
function detour(
  start: ControlPoint,
  end: ControlPoint,
  boxes: readonly LabelBox[],
): ControlPoint[] | null {
  const available = (a: ControlPoint, b: ControlPoint) => clear(a, b, boxes);
  for (const points of [
    [start, end],
    [start, { x: end.x, y: start.y }, end],
    [start, { x: start.x, y: end.y }, end],
  ]) {
    if (points.slice(1).every((point, index) => available(points[index] as ControlPoint, point)))
      return compact(points);
  }
  const xs = [...new Set([start.x, end.x, ...boxes.flatMap((b) => [b.x, b.x + b.width])])].sort(
    (a, b) => a - b,
  );
  const ys = [...new Set([start.y, end.y, ...boxes.flatMap((b) => [b.y, b.y + b.height])])].sort(
    (a, b) => a - b,
  );
  const point = (id: number): ControlPoint => ({
    x: xs[Math.floor(id / 3) % xs.length] as number,
    y: ys[Math.floor(id / (3 * xs.length))] as number,
  });
  const first = (ys.indexOf(start.y) * xs.length + xs.indexOf(start.x)) * 3;
  const last = ys.indexOf(end.y) * xs.length + xs.indexOf(end.x);
  const costs = new Map<number, number>([[first, 0]]);
  const previous = new Map<number, number>();
  const heap: { id: number; cost: number; score: number }[] = [];
  const push = (id: number, cost: number) => {
    const p = point(id);
    const entry = { id, cost, score: cost + Math.abs(p.x - end.x) + Math.abs(p.y - end.y) };
    heap.push(entry);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if ((heap[parent]?.score ?? Infinity) <= entry.score) break;
      heap[i] = heap[parent] as typeof entry;
      i = parent;
    }
    heap[i] = entry;
  };
  push(first, 0);
  while (heap.length) {
    const current = heap[0] as (typeof heap)[number];
    const tail = heap.pop() as typeof current;
    if (heap.length) {
      let i = 0;
      while (2 * i + 1 < heap.length) {
        let child = 2 * i + 1;
        if ((heap[child + 1]?.score ?? Infinity) < (heap[child]?.score ?? Infinity)) child++;
        if ((heap[child]?.score ?? Infinity) >= tail.score) break;
        heap[i] = heap[child] as typeof current;
        i = child;
      }
      heap[i] = tail;
    }
    if (current.cost !== costs.get(current.id)) continue;
    if (Math.floor(current.id / 3) === last) {
      const path = [end];
      let id = current.id;
      while (id !== first) {
        id = previous.get(id) as number;
        path.push(point(id));
      }
      return compact(path.reverse());
    }
    const a = point(current.id);
    const x = Math.floor(current.id / 3) % xs.length;
    const y = Math.floor(current.id / (3 * xs.length));
    for (const [nx, ny] of [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ]) {
      if (
        nx === undefined ||
        ny === undefined ||
        nx < 0 ||
        nx >= xs.length ||
        ny < 0 ||
        ny >= ys.length
      )
        continue;
      const direction = nx !== x ? 1 : 2;
      const id = (ny * xs.length + nx) * 3 + direction;
      const b = point(id);
      if (!available(a, b)) continue;
      const cost = current.cost + Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      if (cost >= (costs.get(id) ?? Infinity)) continue;
      costs.set(id, cost);
      previous.set(id, current.id);
      push(id, cost);
    }
  }
  return null;
}

/** Repair presentation only; saved bends remain intent, never authoritative through a card. */
export function safeOrthogonalRoute(
  source: RouteEndpoint,
  target: RouteEndpoint,
  points: readonly ControlPoint[],
  obstacles: readonly RouteObstacle[],
): { points: ControlPoint[]; blocked: boolean } {
  const boxes = obstacles.map((box) => ({
    ...box,
    x: box.x - 8,
    y: box.y - 8,
    width: box.width + 16,
    height: box.height + 16,
  }));
  const normalized = compact(points, source, target);
  const valid =
    normalized.length > 1 &&
    outward(source, normalized[1] as ControlPoint) &&
    outward(target, normalized[normalized.length - 2] as ControlPoint) &&
    normalized.slice(1).every((b, index) =>
      clear(
        normalized[index] as ControlPoint,
        b,
        boxes.filter(
          (box) =>
            !(index === 0 && box.id === source.elementId) &&
            !(index === normalized.length - 2 && box.id === target.elementId),
        ),
      ),
    );
  if (valid) return { points: normalized, blocked: false };
  const pin = (endpoint: RouteEndpoint) => {
    if (!endpoint.elementId) return endpoint.point;
    const [dx, dy] = directions[endpoint.side];
    const owner = boxes.find((box) => box.id === endpoint.elementId);
    let distance = 24;
    if (owner)
      distance = Math.max(
        distance,
        dx < 0
          ? endpoint.point.x - owner.x
          : dx > 0
            ? owner.x + owner.width - endpoint.point.x
            : dy < 0
              ? endpoint.point.y - owner.y
              : owner.y + owner.height - endpoint.point.y,
      );
    for (const box of boxes) {
      if (box.id === endpoint.elementId) continue;
      const crossing = dx
        ? endpoint.point.y > box.y && endpoint.point.y < box.y + box.height
        : endpoint.point.x > box.x && endpoint.point.x < box.x + box.width;
      const gap =
        dx < 0
          ? endpoint.point.x - box.x - box.width
          : dx > 0
            ? box.x - endpoint.point.x
            : dy < 0
              ? endpoint.point.y - box.y - box.height
              : box.y - endpoint.point.y;
      if (crossing && gap >= 0) distance = Math.min(distance, gap);
    }
    return { x: endpoint.point.x + dx * distance, y: endpoint.point.y + dy * distance };
  };
  const start = pin(source);
  const end = pin(target);
  // An endpoint enclosed by overlapping objects has no collision-free escape.
  if (
    boxes.some((box) => inside(start, box) || inside(end, box)) ||
    !clear(
      source.point,
      start,
      boxes.filter((box) => box.id !== source.elementId),
    ) ||
    !clear(
      end,
      target.point,
      boxes.filter((box) => box.id !== target.elementId),
    )
  )
    return { points: [...points], blocked: true };
  const hints = points
    .slice(
      outward(source, points[1] ?? target.point) ? 1 : 2,
      outward(target, points[points.length - 2] ?? source.point) ? -1 : -2,
    )
    .filter((p) => !boxes.some((box) => inside(p, box)));
  const route = [source.point, start];
  for (const next of [...hints, end]) {
    const part = detour(route[route.length - 1] as ControlPoint, next, boxes);
    if (!part) return { points: [...points], blocked: true };
    route.push(...part.slice(1));
  }
  route.push(target.point);
  return { points: compact(route, source, target), blocked: false };
}
