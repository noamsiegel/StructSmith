import type {
  ArchitectureElement,
  ArchitectureRelationship,
  ViewDetail,
} from "@structsmith/contracts";

export function elementDependencies(
  elementId: string,
  elements: readonly ArchitectureElement[],
  relationships: readonly ArchitectureRelationship[],
  views: readonly ViewDetail[],
) {
  const inside = new Set([elementId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const element of elements) {
      if (element.parentId && inside.has(element.parentId) && !inside.has(element.id)) {
        inside.add(element.id);
        changed = true;
      }
    }
  }
  const incoming = relationships.filter(
    (item) => inside.has(item.targetElementId) && !inside.has(item.sourceElementId),
  );
  const outgoing = relationships.filter(
    (item) => inside.has(item.sourceElementId) && !inside.has(item.targetElementId),
  );
  const usedIn = views.filter(
    (view) =>
      view.scopeElementId === elementId ||
      view.elements.some((entry) => entry.elementId === elementId && !entry.hidden),
  );
  return { incoming, outgoing, usedIn };
}

export function safeWebLink(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
