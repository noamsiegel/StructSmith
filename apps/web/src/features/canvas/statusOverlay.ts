import type { ArchitectureElement, ArchitectureRelationship } from "@structsmith/contracts";

export type StatusOverlay = "off" | "status" | "liveOnly";
export type ImplementationStatus = "live" | "planned" | "conflict";

export function statusFromTags(tags: readonly string[]): ImplementationStatus | null {
  const live = tags.includes("status:live");
  const planned = tags.includes("status:planned");
  return live && planned ? "conflict" : live ? "live" : planned ? "planned" : null;
}

export function relationshipStatus(
  relationship: ArchitectureRelationship,
  elements: ReadonlyMap<string, ArchitectureElement>,
): ImplementationStatus | null {
  const explicit = statusFromTags(relationship.tags);
  if (explicit) return explicit;
  const source = statusFromTags(elements.get(relationship.sourceElementId)?.tags ?? []);
  const target = statusFromTags(elements.get(relationship.targetElementId)?.tags ?? []);
  if (source === "conflict" || target === "conflict") return "conflict";
  if (source === "planned" || target === "planned") return "planned";
  return source === "live" && target === "live" ? "live" : null;
}

export function statusColor(status: ImplementationStatus): string {
  return status === "conflict" ? "var(--muted-foreground)" : `var(--status-${status})`;
}

export function statusStroke(status: ImplementationStatus): "solid" | "dashed" | "dotted" {
  return status === "live" ? "solid" : status === "planned" ? "dashed" : "dotted";
}
