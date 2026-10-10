export interface ChromeRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * The selection toolbar sits top-centre like FigJam's. When canvas chrome such as the
 * scenario panel or the comments button would cover it, it moves beside or below that
 * chrome instead: the nearest free row first, then the free position closest to centre.
 */
export function selectionToolbarPosition(
  canvasWidth: number,
  toolbar: { width: number; height: number },
  top: number,
  chrome: readonly ChromeRect[],
  gap = 8,
): { left: number; top: number } {
  const centre = (canvasWidth - toolbar.width) / 2;
  const free = (left: number, y: number) =>
    left >= gap &&
    left + toolbar.width <= canvasWidth - gap &&
    chrome.every(
      (rect) =>
        left + toolbar.width + gap <= rect.left ||
        left >= rect.right + gap ||
        y + toolbar.height + gap <= rect.top ||
        y >= rect.bottom + gap,
    );
  const rows = [top, ...chrome.map((rect) => rect.bottom + gap)].sort((a, b) => a - b);
  const columns = [centre, ...chrome.map((rect) => rect.right + gap)].sort(
    (a, b) => Math.abs(a - centre) - Math.abs(b - centre),
  );
  for (const y of rows) {
    const left = columns.find((x) => free(x, y));
    if (left !== undefined) return { left, top: y };
  }
  return { left: Math.max(gap, centre), top };
}
