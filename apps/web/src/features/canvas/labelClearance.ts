import type { ControlPoint } from "@structsmith/contracts";

export type LabelBox = { x: number; y: number; width: number; height: number };

export function closestLabelRoutePoint(
  points: readonly ControlPoint[],
  desired: ControlPoint,
): ControlPoint {
  let best = points[0] ?? desired;
  let distance = Infinity;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index] as ControlPoint;
    const end = points[index + 1] as ControlPoint;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = dx * dx + dy * dy;
    const ratio =
      length === 0
        ? 0
        : Math.max(
            0,
            Math.min(1, ((desired.x - start.x) * dx + (desired.y - start.y) * dy) / length),
          );
    const point = { x: start.x + dx * ratio, y: start.y + dy * ratio };
    const next = (point.x - desired.x) ** 2 + (point.y - desired.y) ** 2;
    if (next < distance) {
      best = point;
      distance = next;
    }
  }
  return best;
}

/** Reserve the whole measured label, keeping saved cards and connector routes in place. */
export function clearRelationshipLabel(
  points: readonly ControlPoint[],
  desired: ControlPoint,
  size: { width: number; height: number },
  obstacles: readonly LabelBox[],
  padding = 8,
): ControlPoint {
  const boxes = obstacles.map((box) => ({
    left: box.x - size.width / 2 - padding,
    right: box.x + box.width + size.width / 2 + padding,
    top: box.y - size.height / 2 - padding,
    bottom: box.y + box.height + size.height / 2 + padding,
  }));
  const clear = (point: ControlPoint) =>
    boxes.every(
      (box) =>
        point.x <= box.left + 1e-7 ||
        point.x >= box.right - 1e-7 ||
        point.y <= box.top + 1e-7 ||
        point.y >= box.bottom - 1e-7,
    );
  let best: ControlPoint | undefined;
  let distance = Infinity;
  const consider = (point: ControlPoint) => {
    const next = (point.x - desired.x) ** 2 + (point.y - desired.y) ** 2;
    if (next < distance && clear(point)) {
      best = point;
      distance = next;
    }
  };

  for (let index = 0; index < Math.max(1, points.length - 1); index += 1) {
    const start = points[index];
    const end = points[index + 1] ?? start;
    if (!start || !end) break;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    let intervals: [number, number][] = [[0, 1]];
    for (const box of boxes) {
      let from = -Infinity;
      let to = Infinity;
      for (const [origin, delta, low, high] of [
        [start.x, dx, box.left, box.right],
        [start.y, dy, box.top, box.bottom],
      ] as const) {
        if (delta === 0) {
          if (origin <= low || origin >= high) to = -Infinity;
        } else {
          const first = (low - origin) / delta;
          const last = (high - origin) / delta;
          from = Math.max(from, Math.min(first, last));
          to = Math.min(to, Math.max(first, last));
        }
      }
      if (from >= to) continue;
      intervals = intervals.flatMap(([left, right]): [number, number][] => {
        if (to <= left || from >= right) return [[left, right]];
        const remaining: [number, number][] = [];
        if (from >= left) remaining.push([left, Math.min(from, right)]);
        if (to <= right) remaining.push([Math.max(to, left), right]);
        return remaining;
      });
    }
    for (const [from, to] of intervals) {
      consider(
        closestLabelRoutePoint(
          [
            { x: start.x + dx * from, y: start.y + dy * from },
            { x: start.x + dx * to, y: start.y + dy * to },
          ],
          desired,
        ),
      );
    }
  }
  if (best) return best;

  consider(desired);
  const xs = [...new Set(boxes.flatMap((box) => [box.left, box.right]))];
  const ys = [...new Set(boxes.flatMap((box) => [box.top, box.bottom]))];
  for (const x of xs) consider({ x, y: desired.y });
  for (const y of ys) consider({ x: desired.x, y });
  // A corner can reach a nearby pocket when both straight directions are blocked.
  for (const x of xs) {
    if ((x - desired.x) ** 2 >= distance || clear({ x, y: desired.y })) continue;
    for (const y of ys) {
      if ((y - desired.y) ** 2 >= distance || clear({ x: desired.x, y })) continue;
      consider({ x, y });
    }
  }
  return best ?? desired;
}
