import type { Viewport, XYPosition } from "@xyflow/react";

export function commandWheelViewport(
  viewport: Viewport,
  point: XYPosition,
  deltaY: number,
  deltaMode: number,
): Viewport {
  const units = deltaMode === 1 ? 0.05 : deltaMode === 2 ? 1 : 0.002;
  const zoom = Math.max(0.15, Math.min(2.5, viewport.zoom * 2 ** (-deltaY * units)));
  const ratio = zoom / viewport.zoom;
  return {
    x: point.x - (point.x - viewport.x) * ratio,
    y: point.y - (point.y - viewport.y) * ratio,
    zoom,
  };
}
