import type { ControlPoint, RelationshipPresentation } from "@structsmith/contracts";

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
  if (handle === "t" || handle === "source-t") return "top";
  if (handle === "b" || handle === "target-b") return "bottom";
  if (handle === "source-l") return "left";
  if (handle === "target-r") return "right";
  return endpoint === "source" ? "right" : "left";
}
