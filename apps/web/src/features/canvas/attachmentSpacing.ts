import type { ArchitectureRelationship } from "@structsmith/contracts";
import type { EndpointSide } from "./endpointGeometry";
import type { FlowEdge } from "./graph";

type Attachments = { source?: number; target?: number };

function nextFraction(occupied: readonly number[]): number {
  for (const preferred of [0.5, 0.25, 0.75]) {
    if (occupied.every((fraction) => Math.abs(fraction - preferred) >= 0.125)) return preferred;
  }
  const positions = [0, ...occupied, 1].sort((a, b) => a - b);
  let fraction = 0.125;
  let clearance = -1;
  for (let index = 1; index < positions.length; index += 1) {
    const low = positions[index - 1] as number;
    const high = positions[index] as number;
    const candidate = Math.max(0.125, Math.min(0.875, (low + high) / 2));
    if (candidate < low || candidate > high) continue;
    const distance = Math.min(candidate - low, high - candidate);
    if (distance > clearance) {
      fraction = candidate;
      clearance = distance;
    }
  }
  return fraction;
}

/** Derived visual positions never replace a user's saved endpoint placement. */
export function automaticAttachmentFractions(
  edges: readonly FlowEdge[],
  direction: "LR" | "TB",
  relationships: readonly ArchitectureRelationship[],
): Map<string, Attachments> {
  const order = new Map(
    relationships.map((relationship, index) => [
      relationship.id,
      { createdAt: relationship.createdAt, index },
    ]),
  );
  const rank = (edge: FlowEdge) =>
    (edge.data?.relationshipIds ?? [edge.data?.relationship.id ?? edge.id])
      .map((id) => order.get(id))
      .filter((item) => item !== undefined)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.index - b.index)[0];
  const sorted = edges
    .map((edge) => ({ edge, rank: rank(edge) }))
    .sort((a, b) => {
      return (
        (a.rank?.createdAt ?? "").localeCompare(b.rank?.createdAt ?? "") ||
        (a.rank?.index ?? 0) - (b.rank?.index ?? 0)
      );
    });
  const groups = new Map<
    string,
    { edgeId: string; endpoint: "source" | "target"; fraction?: number }[]
  >();
  for (const { edge } of sorted) {
    if (edge.hidden) continue;
    const presentation = edge.data?.placement?.presentation;
    for (const endpoint of ["source", "target"] as const) {
      if (presentation?.[`${endpoint}Point`]) continue;
      const defaultSide: EndpointSide =
        direction === "TB"
          ? endpoint === "source"
            ? "bottom"
            : "top"
          : endpoint === "source"
            ? "right"
            : "left";
      const side = presentation?.[`${endpoint}Side`] ?? defaultSide;
      const key = JSON.stringify([edge[endpoint], side]);
      const occupants = groups.get(key) ?? [];
      const slot = presentation?.[`${endpoint}Slot`];
      occupants.push({
        edgeId: edge.id,
        endpoint,
        fraction:
          presentation?.[`${endpoint}Fraction`] ??
          (slot === undefined ? undefined : (1 + slot) / 4),
      });
      groups.set(key, occupants);
    }
  }
  const assignments = new Map<string, Attachments>();
  for (const occupants of groups.values()) {
    const occupied = occupants.flatMap(({ fraction }) =>
      fraction === undefined ? [] : [fraction],
    );
    for (const occupant of occupants) {
      if (occupant.fraction !== undefined) continue;
      const fraction = nextFraction(occupied);
      occupied.push(fraction);
      const attachments = assignments.get(occupant.edgeId) ?? {};
      attachments[occupant.endpoint] = fraction;
      assignments.set(occupant.edgeId, attachments);
    }
  }
  return assignments;
}
