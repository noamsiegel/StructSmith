import type { FlowEdge, FlowNode } from "./graph";

/** Keep tagged objects and their visible neighbors, with context subdued. */
export function focusGraphByTag(
  nodes: FlowNode[],
  edges: FlowEdge[],
  tag: string | null,
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  if (!tag) return { nodes, edges };
  const primary = new Set(
    nodes
      .filter((node) => node.type === "element" && node.data.element.tags.includes(tag))
      .map((node) => node.id),
  );
  const taggedEdges = new Set(
    edges.filter((edge) => edge.data?.relationship.tags.includes(tag)).map((edge) => edge.id),
  );
  for (const edge of edges)
    if (taggedEdges.has(edge.id)) {
      primary.add(edge.source);
      primary.add(edge.target);
    }
  const relevant = edges.filter((edge) => primary.has(edge.source) || primary.has(edge.target));
  const visible = new Set(primary);
  for (const edge of relevant) {
    visible.add(edge.source);
    visible.add(edge.target);
  }
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const id of [...visible]) {
    let node = byId.get(id);
    const seen = new Set<string>();
    while (node?.type === "element" && node.data.element.parentId && !seen.has(node.id)) {
      seen.add(node.id);
      const parent = byId.get(node.data.element.parentId);
      if (!parent) break;
      visible.add(parent.id);
      node = parent;
    }
  }
  return {
    nodes: nodes
      .filter((node) => visible.has(node.id))
      .map((node) => ({
        ...node,
        style: { ...node.style, opacity: primary.has(node.id) ? 1 : 0.5 },
      })),
    edges: relevant.map((edge) => ({
      ...edge,
      style: {
        ...edge.style,
        opacity:
          taggedEdges.has(edge.id) || (primary.has(edge.source) && primary.has(edge.target))
            ? 1
            : 0.5,
      },
    })),
  };
}
