import type { ControlPoint } from "@structsmith/contracts";
import type { EndpointSide } from "./endpointGeometry";

export interface ConnectionAlignment {
  sourceId: string;
  targetId: string;
  source: ControlPoint;
  target: ControlPoint;
  sourceOrigin: ControlPoint;
  targetOrigin: ControlPoint;
  sourceSide: EndpointSide;
  targetSide: EndpointSide;
}

export interface AlignmentGuide {
  source: ControlPoint;
  target: ControlPoint;
}

function movedEndpoints(
  connection: ConnectionAlignment,
  positions: ReadonlyMap<string, ControlPoint>,
) {
  const sourcePosition = positions.get(connection.sourceId);
  const targetPosition = positions.get(connection.targetId);
  const source = sourcePosition
    ? {
        x: connection.source.x + sourcePosition.x - connection.sourceOrigin.x,
        y: connection.source.y + sourcePosition.y - connection.sourceOrigin.y,
      }
    : connection.source;
  const target = targetPosition
    ? {
        x: connection.target.x + targetPosition.x - connection.targetOrigin.x,
        y: connection.target.y + targetPosition.y - connection.targetOrigin.y,
      }
    : connection.target;
  return { source, target };
}

function facingAxis(
  connection: ConnectionAlignment,
  source: ControlPoint,
  target: ControlPoint,
): "x" | "y" | null {
  const horizontal =
    (connection.sourceSide === "right" &&
      connection.targetSide === "left" &&
      source.x < target.x) ||
    (connection.sourceSide === "left" && connection.targetSide === "right" && target.x < source.x);
  const vertical =
    (connection.sourceSide === "bottom" &&
      connection.targetSide === "top" &&
      source.y < target.y) ||
    (connection.sourceSide === "top" && connection.targetSide === "bottom" && target.y < source.y);
  return horizontal ? "y" : vertical ? "x" : null;
}

/** Only a tiny derived jog may disappear; authored routes never reach this helper. */
export function straightenedAutomaticBends(
  connection: ConnectionAlignment | undefined,
  positions: ReadonlyMap<string, ControlPoint>,
  bends: readonly ControlPoint[],
): ControlPoint[] | null {
  if (!connection) return null;
  const { source, target } = movedEndpoints(connection, positions);
  const axis = facingAxis(connection, source, target);
  if (!axis || Math.abs(source[axis] - target[axis]) > 1e-6) return null;
  const along = axis === "y" ? "x" : "y";
  const low = Math.min(source[along], target[along]);
  const high = Math.max(source[along], target[along]);
  if (
    bends.some(
      (point) =>
        Math.abs(point[axis] - source[axis]) > 6 || point[along] < low || point[along] > high,
    )
  )
    return null;
  return [{ x: (source.x + target.x) / 2, y: (source.y + target.y) / 2 }];
}

/** Move the selected group together; only stationary connected objects are snap targets. */
export function connectionAlignmentSnap(
  connections: readonly ConnectionAlignment[],
  positions: ReadonlyMap<string, ControlPoint>,
  tolerance: number,
): { delta: ControlPoint; guides: AlignmentGuide[] } {
  const candidates: {
    axis: "x" | "y";
    offset: number;
    source: ControlPoint;
    target: ControlPoint;
    movingSource: boolean;
  }[] = [];
  for (const connection of connections) {
    const sourcePosition = positions.get(connection.sourceId);
    const targetPosition = positions.get(connection.targetId);
    if (!!sourcePosition === !!targetPosition) continue;
    const { source, target } = movedEndpoints(connection, positions);
    const axis = facingAxis(connection, source, target);
    if (!axis) continue;
    const offset = sourcePosition ? target[axis] - source[axis] : source[axis] - target[axis];
    if (Math.abs(offset) <= tolerance)
      candidates.push({ axis, offset, source, target, movingSource: !!sourcePosition });
  }
  const delta = { x: 0, y: 0 };
  const guides: AlignmentGuide[] = [];
  for (const axis of ["x", "y"] as const) {
    const closest = candidates
      .filter((candidate) => candidate.axis === axis)
      .sort((a, b) => Math.abs(a.offset) - Math.abs(b.offset))[0];
    if (!closest) continue;
    delta[axis] = closest.offset;
    const source = { ...closest.source };
    const target = { ...closest.target };
    const coordinate = closest.movingSource ? target[axis] : source[axis];
    source[axis] = coordinate;
    target[axis] = coordinate;
    guides.push({ source, target });
  }
  return { delta, guides };
}
