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
      const parentSize = estimateElementSize(parent, view.settings, placement);
      for (const child of members) {
        // Explicitly hidden or already visible members keep their saved presentation.
        if (present.has(child.id)) continue;
        const size = estimateElementSize(child, view.settings);
        const x = placement.x + parentSize.width + 64;
        let y = placement.y;
        for (let occupied = true; occupied; ) {
          occupied = false;
          for (const existing of placements) {
            if (existing.hidden) continue;
            const other = estimateElementSize(
              byId.get(existing.elementId),
              view.settings,
              existing,
            );
            if (
              x < existing.x + other.width + 32 &&
              x + size.width + 32 > existing.x &&
              y < existing.y + other.height + 32 &&
              y + size.height + 32 > existing.y
            ) {
              y = existing.y + other.height + 48;
              occupied = true;
            }
          }
        }
        placements.push({
          viewId: view.id,
          elementId: child.id,
          x,
          y,
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
  return {
    view: expandedElementIds.size ? { ...view, elements: placements } : view,
    temporaryElementIds,
    expandedElementIds,
    depths,
  };
}
