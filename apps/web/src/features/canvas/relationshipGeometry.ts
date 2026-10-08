import type { ControlPoint, RelationshipPresentation } from "@structsmith/contracts";
import { getSmoothStepPath, type Position } from "@xyflow/react";

/** Saved bend points describe a polyline in canvas coordinates. */
export function manualRelationshipPath(
  source: ControlPoint,
  target: ControlPoint,
  bends: readonly ControlPoint[],
  labelPosition = 0.5,
): [string, number, number] {
  const points = [source, ...bends, target];
  const lengths = points.slice(1).map((point, index) => {
    const previous = points[index] as ControlPoint;
    return Math.hypot(point.x - previous.x, point.y - previous.y);
  });
  let remaining = lengths.reduce((sum, length) => sum + length, 0) * labelPosition;
  let label = target;
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index] as number;
    const start = points[index] as ControlPoint;
    const end = points[index + 1] as ControlPoint;
    if (remaining <= length) {
      const ratio = length === 0 ? 0 : remaining / length;
      label = { x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio };
      break;
    }
    remaining -= length;
  }
  return [
    points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x},${point.y}`).join(" "),
    label.x,
    label.y,
  ];
}

export function relationshipDash(
  interactionStyle: string | undefined,
  override: RelationshipPresentation["strokeStyle"],
): string | undefined {
  if (override === "solid") return undefined;
  if (override === "dotted") return "1 4";
  if (override === "dashed" || ["async", "event", "dependency"].includes(interactionStyle ?? ""))
    return "5 4";
  return undefined;
}

export function sideFromHandle(
  handle: string | null | undefined,
  endpoint: "source" | "target",
): "left" | "right" | "top" | "bottom" {
  handle = handle?.replace(/-[02]$/, "");
  if (handle === "t" || handle === "source-t") return "top";
  if (handle === "b" || handle === "target-b") return "bottom";
  if (handle === "source-l") return "left";
  if (handle === "target-r") return "right";
  return endpoint === "source" ? "right" : "left";
}

export function slotFromHandle(handle: string | null | undefined): number {
  return handle?.endsWith("-0") ? 0 : handle?.endsWith("-2") ? 2 : 1;
}

export function orthogonalRelationshipBends(
  source: ControlPoint,
  target: ControlPoint,
  sourcePosition: Position,
  targetPosition: Position,
): ControlPoint[] {
  const [path] = getSmoothStepPath({
    sourceX: source.x,
    sourceY: source.y,
    targetX: target.x,
    targetY: target.y,
    sourcePosition,
    targetPosition,
    borderRadius: 0,
    offset: 24,
  });
  const coordinates = (path.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi) ?? []).map(Number);
  const points = coordinates
    .flatMap((x, index) => (index % 2 === 0 ? [{ x, y: coordinates[index + 1] as number }] : []))
    .filter(
      (point, index, all) =>
        index === 0 || point.x !== all[index - 1]?.x || point.y !== all[index - 1]?.y,
    );
  return points.slice(1, -1).filter((point, index) => {
    const previous = points[index] as ControlPoint;
    const next = points[index + 2] as ControlPoint;
    const straight =
      (previous.x === point.x && next.x === point.x) ||
      (previous.y === point.y && next.y === point.y);
    const continuation =
      (point.x - previous.x) * (next.x - point.x) + (point.y - previous.y) * (next.y - point.y);
    return !straight || continuation < 0;
  });
}

export function closestRelationshipSegment(
  points: readonly ControlPoint[],
  point: ControlPoint,
): number {
  let closest = 0;
  let distance = Infinity;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index] as ControlPoint;
    const end = points[index + 1] as ControlPoint;
    const x = end.x - start.x;
    const y = end.y - start.y;
    const length = x * x + y * y;
    const ratio =
      length === 0
        ? 0
        : Math.max(0, Math.min(1, ((point.x - start.x) * x + (point.y - start.y) * y) / length));
    const next = Math.hypot(point.x - start.x - ratio * x, point.y - start.y - ratio * y);
    if (next < distance) {
      closest = index;
      distance = next;
    }
  }
  return closest;
}

/** Defaults favor horizontal legs; dragged labels snap to the closest route segment. */
export function slidingRelationshipLabel(
  points: readonly ControlPoint[],
  anchor: ControlPoint,
  offsetX: number,
  curved = false,
  offsetY = 0,
): ControlPoint {
  if (offsetY !== 0 && points.length > 1) {
    const base = slidingRelationshipLabel(points, anchor, 0, curved);
    const desired = { x: base.x + offsetX, y: base.y + offsetY };
    const index = closestRelationshipSegment(points, desired);
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
    return { x: start.x + dx * ratio, y: start.y + dy * ratio };
  }
  const legs = points.slice(1).map((end, index) => ({ start: points[index] as ControlPoint, end }));
  const horizontal = legs.filter(({ start, end }) => start.y === end.y && start.x !== end.x);
  const candidates = !curved && horizontal.length > 0 ? horizontal : legs;
  const project = ({ start, end }: (typeof legs)[number], x: number): ControlPoint => {
    const ratio =
      end.x === start.x ? 0.5 : Math.max(0, Math.min(1, (x - start.x) / (end.x - start.x)));
    return { x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio };
  };
  const desired = { x: anchor.x + offsetX, y: anchor.y };
  const reference = curved ? desired : anchor;
  const leg = candidates.reduce<(typeof legs)[number] | undefined>((best, next) => {
    const distance = (candidate: (typeof legs)[number]) => {
      const point = project(candidate, reference.x);
      return Math.hypot(point.x - reference.x, point.y - reference.y);
    };
    return !best || distance(next) <= distance(best) + 0.01 ? next : best;
  }, undefined);
  return leg
    ? project(
        leg,
        !curved && leg.start.y === leg.end.y && Math.abs(anchor.y - leg.start.y) > 0.01
          ? (leg.start.x + leg.end.x) / 2 + offsetX
          : desired.x,
      )
    : anchor;
}

/** Move a segment perpendicular to its axis; endpoint anchors never move. */
export function moveRelationshipSegment(
  points: readonly ControlPoint[],
  index: number,
  delta: ControlPoint,
): ControlPoint[] {
  const start = points[index];
  const end = points[index + 1];
  if (!start || !end) return points.slice(1, -1);
  const x = start.x === end.x ? delta.x : start.y === end.y ? 0 : delta.x;
  const y = start.y === end.y ? delta.y : start.x === end.x ? 0 : delta.y;
  if (x === 0 && y === 0) return points.slice(1, -1);
  const moved = [
    ...points.slice(0, index),
    { x: start.x + x, y: start.y + y },
    { x: end.x + x, y: end.y + y },
    ...points.slice(index + 2),
  ];
  if (index === 0) moved.unshift(points[0] as ControlPoint);
  if (index === points.length - 2) moved.push(points[points.length - 1] as ControlPoint);
  return moved.slice(1, -1);
}
