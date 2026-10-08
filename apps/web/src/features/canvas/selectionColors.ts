import type { ArchitectureOperation, ViewDetail } from "@structsmith/contracts";
import type { Selection } from "../../store/editor";
import type { FlowEdge, FlowNode } from "./graph";

export function selectionColorTargets(
  selection: Selection,
  nodes: readonly FlowNode[],
  edges: readonly FlowEdge[],
) {
  const nodeIds = nodes
    .filter((node) => {
      if (selection.type === "boundary")
        return node.type === "boundary" && node.data.boundaryId === selection.id;
      const id = node.type === "boundary" ? node.data.elementId : node.id;
      return selection.type === "element"
        ? id === selection.id
        : selection.type === "elements" && selection.ids.includes(id ?? "");
    })
    .map((node) => node.id);
  const relationshipIds = [
    ...new Set(
      edges
        .filter((edge) =>
          selection.type === "relationship"
            ? edge.selected || edge.data?.relationship.id === selection.id
            : selection.type === "none" && edge.selected && (edge.data?.count ?? 0) > 1,
        )
        .flatMap((edge) => edge.data?.relationshipIds ?? [edge.data?.relationship.id ?? edge.id]),
    ),
  ];
  return { nodeIds, relationshipIds };
}

export function colorSelectionOperations(
  view: ViewDetail,
  nodeIds: readonly string[],
  relationshipIds: readonly string[],
  color: string | null,
): ArchitectureOperation[] {
  const operations: ArchitectureOperation[] = [];
  if (nodeIds.length) {
    const nodeColors = { ...view.settings.nodeColors };
    for (const id of nodeIds) {
      if (color === null) delete nodeColors[id];
      else nodeColors[id] = color;
    }
    operations.push({ op: "updateView", viewId: view.id, data: { settings: { nodeColors } } });
  }
  if (relationshipIds.length)
    operations.push({
      op: "setViewRelationships",
      viewId: view.id,
      relationships: relationshipIds.map((relationshipId) => ({
        relationshipId,
        presentation: { color },
      })),
    });
  return operations;
}

export function applyNodeColors(
  nodes: FlowNode[],
  colors: Readonly<Record<string, string>>,
): FlowNode[] {
  return nodes.map((node) => {
    const color = colors[node.id];
    if (!color) return node;
    if (node.type === "boundary")
      return {
        ...node,
        data: { ...node.data, color },
        style: {
          ...node.style,
          borderColor: color,
          backgroundColor: `color-mix(in srgb, ${color} 12%, var(--canvas))`,
        },
      };
    return { ...node, data: { ...node.data, color } };
  });
}
