import type {
  ArchitectureBoundary,
  ArchitectureElement,
  ArchitectureOperation,
  SectionFrame,
} from "@structsmith/contracts";
import type { BoundaryNodeData, FlowNode } from "./graph";

export function sectionFrameEntries(nodes: readonly FlowNode[]): Record<string, SectionFrame> {
  return Object.fromEntries(
    nodes
      .filter((node) => node.type === "boundary" && node.data.section)
      .map((node) => [
        node.id,
        { ...node.position, width: node.width ?? 120, height: node.height ?? 80 },
      ]),
  );
}

export function translateSectionFrames(
  frames: Readonly<Record<string, SectionFrame>>,
  id: string,
  delta: { x: number; y: number },
  nestedIds: ReadonlySet<string> = new Set(),
): Record<string, SectionFrame> {
  return Object.fromEntries(
    Object.entries(frames).map(([key, frame]) => [
      key,
      key === id || nestedIds.has(key)
        ? { ...frame, x: frame.x + delta.x, y: frame.y + delta.y }
        : frame,
    ]),
  );
}

function contains(frame: SectionFrame, object: SectionFrame): boolean {
  return (
    object.x >= frame.x &&
    object.y >= frame.y &&
    object.x + object.width <= frame.x + frame.width &&
    object.y + object.height <= frame.y + frame.height
  );
}

export function sectionMembershipOperations(
  moved: readonly FlowNode[],
  sections: readonly FlowNode[],
  elements: ReadonlyMap<string, ArchitectureElement>,
  boundaries: readonly ArchitectureBoundary[],
): ArchitectureOperation[] {
  const operations: ArchitectureOperation[] = [];
  for (const node of moved) {
    const element = elements.get(node.id);
    if (!element) continue;
    const object = {
      ...node.position,
      width: node.measured?.width ?? node.width ?? 240,
      height: node.measured?.height ?? node.height ?? 112,
    };
    const candidates = sections
      .filter(
        (frame) =>
          frame.type === "boundary" &&
          frame.data.section &&
          frame.data.elementId !== node.id &&
          contains(
            { ...frame.position, width: frame.width ?? 120, height: frame.height ?? 80 },
            object,
          ),
      )
      .sort((a, b) => (a.width ?? 0) * (a.height ?? 0) - (b.width ?? 0) * (b.height ?? 0));
    const target = candidates[0]?.data as BoundaryNodeData | undefined;
    const currentBoundary = boundaries.find((boundary) => {
      if (!boundary.elementIds.includes(node.id)) return false;
      let parent: ArchitectureBoundary | undefined = boundary;
      const visited = new Set<string>();
      while (parent && !visited.has(parent.id)) {
        if (parent.kind === "custom") return true;
        visited.add(parent.id);
        parent = boundaries.find((item) => item.id === parent?.parentBoundaryId);
      }
      return false;
    });
    if (currentBoundary && target?.boundaryId !== currentBoundary.id)
      operations.push({
        op: "setBoundaryMembers",
        boundaryId: currentBoundary.id,
        elementIds: [node.id],
        mode: "remove",
      });
    if (target?.boundaryId && target.boundaryId !== currentBoundary?.id)
      operations.push({
        op: "setBoundaryMembers",
        boundaryId: target.boundaryId,
        elementIds: [node.id],
        mode: "add",
      });
    const currentParent = element.parentId ? elements.get(element.parentId) : undefined;
    if (target?.elementId && target.elementId !== element.parentId)
      operations.push({
        op: "updateElement",
        elementId: node.id,
        data: { parentId: target.elementId },
      });
    else if (!target?.elementId && currentParent?.kind === "custom")
      operations.push({ op: "updateElement", elementId: node.id, data: { parentId: null } });
  }
  return operations;
}
