import type { ArchitectureElement, ArchitectureView, ViewDetail } from "@structsmith/contracts";
import { detailViewsFor } from "./detail-views";
import { estimateElementSize } from "./layout";

/** A removed or unrelated destination never bypasses the detail chooser. */
export function preferredDetailView(
  element: Pick<ArchitectureElement, "id" | "kind">,
  views: readonly ArchitectureView[],
  currentViewId: string | null,
  preferred: Readonly<Record<string, string>>,
): ArchitectureView | null {
  const candidates = detailViewsFor(element, views, currentViewId);
  return (
    candidates.find((view) => view.id === preferred[element.id]) ??
    (candidates.length === 1 ? (candidates[0] ?? null) : null)
  );
}

export interface ExpandedView {
  view: ViewDetail;
  temporaryElementIds: Set<string>;
  expandedElementIds: Set<string>;
  depths: Map<string, number>;
}

/** Display-only children reuse model IDs. Mutations must use the original view. */
export function deriveExpandedView(
  view: ViewDetail,
  elements: readonly ArchitectureElement[],
  requested: ReadonlySet<string>,
): ExpandedView {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const placements = [...view.elements];
  const present = new Set(placements.map((placement) => placement.elementId));
  const depths = new Map(
    placements
      .filter((placement) => !placement.hidden)
      .map((placement) => [placement.elementId, 0]),
  );
  const temporaryElementIds = new Set<string>();
  const expandedElementIds = new Set<string>();
  const children = new Map<string, ArchitectureElement[]>();
  for (const element of elements) {
    if (!element.parentId) continue;
    const bucket = children.get(element.parentId) ?? [];
    bucket.push(element);
    children.set(element.parentId, bucket);
  }
  for (let level = 0; level < 3; level += 1) {
    for (const [elementId, depth] of [...depths]) {
      if (depth !== level || !requested.has(elementId)) continue;
      const parent = byId.get(elementId);
      const members = children.get(elementId);
      const placement = placements.find((entry) => entry.elementId === elementId);
      if (!parent || !placement || !members?.length) continue;
      expandedElementIds.add(elementId);
      for (const child of members) {
        // Explicitly hidden or already visible members keep their saved presentation.
        if (present.has(child.id)) continue;
        placements.push({
          viewId: view.id,
          elementId: child.id,
          x: placement.x + 24,
          y: placement.y,
          width: null,
          height: null,
          hidden: false,
          locked: true,
          zIndex: 0,
        });
        present.add(child.id);
        temporaryElementIds.add(child.id);
        depths.set(child.id, level + 1);
      }
    }
  }
  const placementById = new Map(placements.map((entry) => [entry.elementId, entry]));
  const footprint = (elementId: string): { width: number; height: number } => {
    const own = estimateElementSize(
      byId.get(elementId),
      view.settings,
      placementById.get(elementId),
    );
    if (!expandedElementIds.has(elementId)) return own;
    const sizes = (children.get(elementId) ?? [])
      .filter((child) => !placementById.get(child.id)?.hidden)
      .map((child) => footprint(child.id));
    if (!sizes.length) return own;
    return {
      width: Math.max(...sizes.map((size) => size.width)) + 48,
      height: sizes.reduce((sum, size) => sum + size.height, 0) + (sizes.length - 1) * 32 + 72,
    };
  };
  const occupied = placements.flatMap((entry) => {
    if (
      entry.hidden ||
      expandedElementIds.has(entry.elementId) ||
      temporaryElementIds.has(entry.elementId)
    )
      return [];
    return [{ x: entry.x, y: entry.y, ...footprint(entry.elementId) }];
  });
  const laidOut = new Set<string>();
  const placeChildren = (elementId: string, inset: number, reserve: boolean): void => {
    if (laidOut.has(elementId)) return;
    laidOut.add(elementId);
    const parent = placementById.get(elementId);
    if (!parent) return;
    let y = parent.y + inset;
    for (const child of children.get(elementId) ?? []) {
      const placement = placementById.get(child.id);
      if (!placement || placement.hidden) continue;
      const size = footprint(child.id);
      if (temporaryElementIds.has(child.id)) {
        const x = parent.x + 24;
        for (let collision = reserve; collision; ) {
          collision = false;
          for (const other of occupied) {
            if (
              x < other.x + other.width + 16 &&
              x + size.width + 16 > other.x &&
              y < other.y + other.height + 16 &&
              y + size.height + 16 > other.y
            ) {
              y = other.y + other.height + 32;
              collision = true;
            }
          }
        }
        placement.x = x;
        placement.y = y;
        occupied.push({ x, y, ...size });
      }
      if (expandedElementIds.has(child.id)) {
        // The outer allocation already reserves the entire temporary subtree.
        placeChildren(child.id, 48, !temporaryElementIds.has(child.id));
      }
      y = Math.max(y, placement.y + size.height + 32);
    }
  };
  for (const entry of view.elements) {
    if (!entry.hidden && expandedElementIds.has(entry.elementId))
      placeChildren(entry.elementId, 0, true);
  }
  return {
    view: expandedElementIds.size ? { ...view, elements: placements } : view,
    temporaryElementIds,
    expandedElementIds,
    depths,
  };
}
