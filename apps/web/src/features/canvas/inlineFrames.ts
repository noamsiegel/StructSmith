import type { ArchitectureElement } from "@structsmith/contracts";
import type { BoundarySource, FlowNode } from "./graph";

/** Expanded summaries become titled frames; the original model IDs remain endpoints. */
export function inlineFrames(
  sources: readonly BoundarySource[],
  elements: ReadonlyMap<string, ArchitectureElement>,
  expanded: ReadonlySet<string>,
): FlowNode[] {
  const byId = new Map(sources.map((source) => [source.id, source]));
  const frames = new Map<string, FlowNode>();
  const visiting = new Set<string>();
  const frameFor = (id: string): FlowNode | undefined => {
    if (frames.has(id)) return frames.get(id);
    const own = byId.get(id);
    const element = elements.get(id);
    if (!own || !element || !expanded.has(id) || visiting.has(id)) return undefined;
    visiting.add(id);
    const members: BoundarySource[] = [own];
    for (const child of elements.values()) {
      if (child.parentId !== id) continue;
      const nested = frameFor(child.id);
      const source = byId.get(child.id);
      if (nested)
        members.push({
          id: child.id,
          x: nested.position.x,
          y: nested.position.y,
          width: nested.width ?? 0,
          height: nested.height ?? 0,
        });
      else if (source) members.push(source);
    }
    visiting.delete(id);
    if (members.length < 2) return undefined;
    const x = Math.min(...members.map((member) => member.x)) - 24;
    const y = Math.min(...members.map((member) => member.y)) - 52;
    const width = Math.max(...members.map((member) => member.x + member.width)) - x + 24;
    const height = Math.max(...members.map((member) => member.y + member.height)) - y + 24;
    const frame: FlowNode = {
      id,
      type: "boundary",
      position: { x, y },
      width,
      height,
      draggable: false,
      selectable: true,
      zIndex: -expandedDepth(id, elements),
      data: { name: element.name, elementId: id, kind: element.kind, classification: null },
      style: {
        width,
        height,
        border: "1px solid var(--boundary)",
        backgroundColor: "color-mix(in srgb, var(--node-internal) 35%, transparent)",
        borderRadius: 12,
      },
    };
    frames.set(id, frame);
    return frame;
  };
  for (const id of expanded) frameFor(id);
  return [...frames.values()];
}

function expandedDepth(id: string, elements: ReadonlyMap<string, ArchitectureElement>): number {
  const seen = new Set<string>();
  let current = elements.get(id);
  let depth = 0;
  while (current?.parentId && !seen.has(current.id)) {
    seen.add(current.id);
    depth += 1;
    current = elements.get(current.parentId);
  }
  return -depth;
}
