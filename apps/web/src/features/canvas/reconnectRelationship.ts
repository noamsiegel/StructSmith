import type { ArchitectureOperation, ArchitectureRelationship } from "@structsmith/contracts";
import type { ConnectorAttachment } from "./ConnectorEndpointHandle";

export function reconnectRelationshipOperations(
  viewId: string,
  relationship: ArchitectureRelationship,
  visibleEndpointId: string,
  endpoint: "source" | "target",
  attachment: ConnectorAttachment,
): ArchitectureOperation[] {
  const semanticKey = endpoint === "source" ? "sourceElementId" : "targetElementId";
  const changedObject = attachment.elementId && attachment.elementId !== visibleEndpointId;
  if (
    changedObject &&
    attachment.elementId ===
      relationship[endpoint === "source" ? "targetElementId" : "sourceElementId"]
  )
    throw new Error("self-endpoint");
  if (changedObject && visibleEndpointId !== relationship[semanticKey])
    throw new Error("lifted-endpoint");
  return [
    ...(changedObject
      ? [
          {
            op: "updateRelationship" as const,
            relationshipId: relationship.id,
            data: { [semanticKey]: attachment.elementId },
          },
        ]
      : []),
    {
      op: "setViewRelationships",
      viewId,
      relationships: [
        {
          relationshipId: relationship.id,
          presentation: {
            [`${endpoint}Side`]: attachment.side,
            [`${endpoint}Fraction`]: attachment.fraction ?? null,
            [`${endpoint}Point`]: attachment.elementId ? null : attachment.point,
          },
        },
      ],
    },
  ];
}
