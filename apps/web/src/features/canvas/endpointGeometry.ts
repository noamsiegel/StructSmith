import type { ControlPoint } from "@structsmith/contracts";
import type { NodeShape } from "@structsmith/domain";

export type EndpointSide = "left" | "right" | "top" | "bottom";
export interface EndpointBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  shape: NodeShape;
}

export function borderEndpoint(
  box: EndpointBox,
  side: EndpointSide,
  fraction: number,
): ControlPoint {
  const f = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0.5));
  const { width: w, height: h, shape } = box;
  const horizontal = side === "top" || side === "bottom";
  let x = horizontal ? 1 + (w - 2) * f : side === "left" ? 1 : w - 1;
  let y = horizontal ? (side === "top" ? 1 : h - 1) : 1 + (h - 2) * f;
  if (shape === "start" || shape === "end") {
    const r = shape === "start" ? 12 : 14;
    const angle =
      side === "left"
        ? (5 * Math.PI) / 4 - (f * Math.PI) / 2
        : side === "right"
          ? -Math.PI / 4 + (f * Math.PI) / 2
          : side === "top"
            ? (-3 * Math.PI) / 4 + (f * Math.PI) / 2
            : (3 * Math.PI) / 4 - (f * Math.PI) / 2;
    x = w / 2 + r * Math.cos(angle);
    y = 16 + r * Math.sin(angle);
  } else if (shape === "bar") {
    y = horizontal ? (side === "top" ? 10 : 22) : 10 + 12 * f;
  } else if (shape === "diamond") {
    if (horizontal)
      y =
        side === "top"
          ? 1 + (h / 2 - 1) * Math.abs(2 * f - 1)
          : h - 1 - (h / 2 - 1) * Math.abs(2 * f - 1);
    else
      x =
        side === "left"
          ? 1 + (w / 2 - 1) * Math.abs(2 * f - 1)
          : w - 1 - (w / 2 - 1) * Math.abs(2 * f - 1);
  } else if (shape === "data") {
    x = horizontal
      ? (side === "top" ? 25 : 1) + (w - 26) * f
      : (side === "left" ? 25 : w - 1) - 24 * f;
  } else if (shape === "document") {
    if (side === "top") {
      x = 1 + (w - 2) * f;
      y = Math.max(1, x - (w - 20));
    } else if (side === "right") x = w - 1 - Math.max(0, 19 - y);
  } else if (shape === "cylinder") {
    if (horizontal) {
      x = 1 + (w - 2) * (3 * f * f - 2 * f * f * f);
      y = side === "top" ? 12 - 42 * f * (1 - f) : h - 12 + 42 * f * (1 - f);
    } else y = 12 + (h - 24) * f;
  } else {
    const r = Math.min(shape === "terminal" ? 24 : 5, (w - 2) / 2, (h - 2) / 2);
    if (horizontal) {
      const inset = Math.max(0, 1 + r - x, x - (w - 1 - r));
      const rounding = r - Math.sqrt(Math.max(0, r * r - inset * inset));
      y += side === "top" ? rounding : -rounding;
    } else {
      const inset = Math.max(0, 1 + r - y, y - (h - 1 - r));
      const rounding = r - Math.sqrt(Math.max(0, r * r - inset * inset));
      x += side === "left" ? rounding : -rounding;
    }
  }
  return { x: box.x + x, y: box.y + y };
}

export function nearestBorderEndpoint(box: EndpointBox, point: ControlPoint) {
  let best = { side: "left" as EndpointSide, fraction: 0.5, point, distance: Infinity };
  for (const side of ["left", "right", "top", "bottom"] as const) {
    const distance = (f: number) => {
      const p = borderEndpoint(box, side, f);
      return Math.hypot(p.x - point.x, p.y - point.y);
    };
    let sample = 0;
    for (let index = 1; index <= 8; index += 1) {
      if (distance(index / 8) < distance(sample / 8)) sample = index;
    }
    let low = Math.max(0, (sample - 1) / 8);
    let high = Math.min(1, (sample + 1) / 8);
    for (let iteration = 0; iteration < 32; iteration += 1) {
      const left = low + (high - low) / 3;
      const right = high - (high - low) / 3;
      if (distance(left) < distance(right)) high = right;
      else low = left;
    }
    for (const fraction of [0, sample / 8, (low + high) / 2, 1]) {
      const next = distance(fraction);
      if (next < best.distance)
        best = { side, fraction, point: borderEndpoint(box, side, fraction), distance: next };
    }
  }
  return best;
}

function contains(box: EndpointBox, point: ControlPoint): boolean {
  const x = point.x - box.x;
  const y = point.y - box.y;
  const { width: w, height: h, shape } = box;
  if (shape === "start" || shape === "end")
    return Math.hypot(x - w / 2, y - 16) <= (shape === "start" ? 12 : 14);
  if (shape === "bar") return x >= 1 && x <= w - 1 && y >= 10 && y <= 22;
  if (x < 1 || x > w - 1 || y < 1 || y > h - 1) return false;
  if (shape === "diamond")
    return Math.abs(x - w / 2) / (w / 2 - 1) + Math.abs(y - h / 2) / (h / 2 - 1) <= 1;
  if (shape === "data") {
    const left = 25 - (24 * (y - 1)) / (h - 2);
    return x >= left && x <= left + w - 26;
  }
  if (shape === "document") return x <= w - 1 - Math.max(0, 19 - y);
  if (shape === "cylinder") {
    let low = 0;
    let high = 1;
    for (let iteration = 0; iteration < 32; iteration += 1) {
      const f = (low + high) / 2;
      if (borderEndpoint(box, "top", f).x < point.x) low = f;
      else high = f;
    }
    const f = (low + high) / 2;
    return (
      point.y >= borderEndpoint(box, "top", f).y && point.y <= borderEndpoint(box, "bottom", f).y
    );
  }
  const r = Math.min(shape === "terminal" ? 24 : 5, (w - 2) / 2, (h - 2) / 2);
  const cx = Math.max(1 + r, Math.min(w - 1 - r, x));
  const cy = Math.max(1 + r, Math.min(h - 1 - r, y));
  return Math.hypot(x - cx, y - cy) <= r;
}

export function snapConnectorEndpoint(
  boxes: readonly EndpointBox[],
  point: ControlPoint,
  tolerance: number,
): { elementId: string; side: EndpointSide; fraction: number; point: ControlPoint } | null {
  const candidates = boxes
    .filter(
      (box) =>
        point.x >= box.x - tolerance &&
        point.x <= box.x + box.width + tolerance &&
        point.y >= box.y - tolerance &&
        point.y <= box.y + box.height + tolerance,
    )
    .map((box) => ({ box, inside: contains(box, point), ...nearestBorderEndpoint(box, point) }))
    .filter((candidate) => candidate.inside || candidate.distance <= tolerance);
  candidates.sort(
    (a, b) =>
      Number(b.inside) - Number(a.inside) ||
      (a.inside && b.inside
        ? a.box.width * a.box.height - b.box.width * b.box.height
        : a.distance - b.distance),
  );
  const closest = candidates[0];
  return closest
    ? {
        elementId: closest.box.id,
        side: closest.side,
        fraction: closest.fraction,
        point: closest.point,
      }
    : null;
}
