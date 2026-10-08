import type {
  ArchitectureBoundary,
  ArchitectureElement,
  ArchitectureRecord,
  ArchitectureRelationship,
  ControlPoint,
  SectionFrame,
  ViewDetail,
  ViewElement,
  ViewRelationship,
} from "@structsmith/contracts";
import {
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  edgeLabel,
  estimateElementSize,
  resolveRelationshipsForView,
} from "@structsmith/domain";
import type { Edge, Node } from "@xyflow/react";
import {
  type ImplementationStatus,
  relationshipStatus,
  type StatusOverlay,
  statusFromTags,
} from "./statusOverlay";

export const CANVAS_FIT_PADDING = { top: "48px", bottom: "96px", x: 0.2 } as const;
export const NODE_WIDTH = DEFAULT_NODE_WIDTH;
export const NODE_HEIGHT = DEFAULT_NODE_HEIGHT;
export const BOUNDARY_PADDING = 28;
export const BOUNDARY_HEADER = 36;

export interface ElementNodeData extends Record<string, unknown> {
  color?: string;
  element: ArchitectureElement;
  severity: "high" | "critical" | null;
  locked: boolean;
  showFullTitles: boolean;
  showDescriptions: boolean;
  minimumHeight: number;
  status: ImplementationStatus | null;
}

export interface BoundaryNodeData extends Record<string, unknown> {
  color?: string;
  name: string;
  layer?: ArchitectureBoundary["layer"];
  kind?: ArchitectureElement["kind"];
  classification: "public" | "restricted" | "private" | null;
  boundaryId?: string;
  elementId?: string;
  section?: boolean;
  onRename?: (name: string) => void;
  onFit?: () => void;
  onResize?: (frame: SectionFrame) => void;
  onResizePreview?: (frame: SectionFrame) => void;
}

export interface RelationshipEdgeData extends Record<string, unknown> {
  /** The relationship to select and edit when this edge is picked. */
  relationship: ArchitectureRelationship;
  /** True when the edge stands in for relationships between hidden descendants. */
  implied: boolean;
  label: string;
  count: number;
  routing: ViewDetail["settings"]["relationshipRouting"];
  showLabel: boolean;
  placement?: ViewRelationship;
  status: ImplementationStatus | null;
  relationshipIds?: string[];
  tags: string[];
  onControlPointsChange?: (points: ControlPoint[]) => Promise<void>;
  onLabelOffsetChange?: (relationshipId: string, offset: ControlPoint) => Promise<void>;
}

export type FlowNode = Node<ElementNodeData, "element"> | Node<BoundaryNodeData, "boundary">;
export type FlowEdge = Edge<RelationshipEdgeData>;

interface BuildInput {
  view: ViewDetail;
  elements: readonly ArchitectureElement[];
  relationships: readonly ArchitectureRelationship[];
  records: readonly ArchitectureRecord[];
  statusOverlay?: StatusOverlay;
}

/** Risk indicators stay subtle — the canvas must not turn into a christmas tree. */
function riskSeverities(records: readonly ArchitectureRecord[]): Map<string, "high" | "critical"> {
  const map = new Map<string, "high" | "critical">();
  for (const record of records) {
    if (record.kind !== "risk") continue;
    if (record.status === "resolved" || record.status === "rejected") continue;
    if (record.severity !== "high" && record.severity !== "critical") continue;
    for (const elementId of record.linkedElementIds) {
      if (record.severity === "critical" || map.get(elementId) !== "critical") {
        map.set(elementId, record.severity);
      }
    }
  }
  return map;
}

/**
 * The single translation step from the semantic model to React Flow. React Flow
 * never owns data — it renders what a view declares visible, where the view
 * says it is.
 */
export function buildGraph({
  view,
  elements,
  relationships,
  records,
  statusOverlay = "off",
}: BuildInput): {
  nodes: FlowNode[];
  edges: FlowEdge[];
  hiddenCount: number;
} {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const placements = view.elements.filter((entry) => byId.has(entry.elementId));
  const visible = placements.filter(
    (entry) =>
      !entry.hidden &&
      (statusOverlay !== "liveOnly" ||
        statusFromTags(byId.get(entry.elementId)?.tags ?? []) === "live"),
  );
  const visibleIds = new Set(visible.map((entry) => entry.elementId));
  const severities = riskSeverities(records);

  const nodes: FlowNode[] = [];
  for (const entry of visible) {
    const element = byId.get(entry.elementId);
    if (!element) continue;
    const size = estimateElementSize(element, view.settings, entry);
    const expanded = view.settings.showFullTitles || view.settings.showDescriptions;
    nodes.push({
      id: element.id,
      type: "element",
      position: { x: entry.x, y: entry.y },
      draggable: !entry.locked,
      data: {
        element,
        severity: severities.get(element.id) ?? null,
        locked: entry.locked,
        showFullTitles: view.settings.showFullTitles,
        showDescriptions: view.settings.showDescriptions,
        minimumHeight: size.height,
        status: statusOverlay === "off" ? null : statusFromTags(element.tags),
      },
      // Keep semantic boundaries above the canvas background, relationship
      // paths above their fills, and cards above both.
      zIndex: 20 + entry.zIndex,
      width: size.width,
      height: expanded ? undefined : size.height,
      style: expanded ? { minHeight: size.height } : undefined,
    });
  }

  const relationshipPlacements = new Map(
    view.relationships.map((entry) => [entry.relationshipId, entry]),
  );
  const hiddenRelationships = new Set(
    view.relationships.filter((entry) => entry.hidden).map((entry) => entry.relationshipId),
  );

  const edges: FlowEdge[] = resolveRelationshipsForView(
    elements,
    relationships.filter((relationship) => {
      if (hiddenRelationships.has(relationship.id)) return false;
      if (statusOverlay !== "liveOnly") return true;
      // Filter real endpoints before lifting, so a planned child cannot create a live shortcut.
      return (
        relationshipStatus(relationship, byId) === "live" &&
        statusFromTags(byId.get(relationship.sourceElementId)?.tags ?? []) === "live" &&
        statusFromTags(byId.get(relationship.targetElementId)?.tags ?? []) === "live"
      );
    }),
    visibleIds,
  ).map((edge) => {
    const first = edge.relationships[0] as ArchitectureRelationship;
    const label = edgeLabel(edge);
    // Merged lines share visual routes; endpoint and semantic edits require one relationship.
    const unambiguous = edge.relationships.length === 1;
    const firstPlacement = relationshipPlacements.get(first.id);
    const commonRoute = edge.relationships.every(
      (item) =>
        JSON.stringify(relationshipPlacements.get(item.id)?.controlPoints ?? []) ===
        JSON.stringify(firstPlacement?.controlPoints ?? []),
    );
    const placement = unambiguous
      ? firstPlacement
      : firstPlacement
        ? { ...firstPlacement, controlPoints: commonRoute ? firstPlacement.controlPoints : [] }
        : undefined;
    const statuses = new Set(edge.relationships.map((item) => relationshipStatus(item, byId)));
    const status =
      statusOverlay === "off" ? null : statuses.size > 1 ? "conflict" : ([...statuses][0] ?? null);
    return {
      id: edge.id,
      type: "relationship",
      source: edge.sourceElementId,
      target: edge.targetElementId,
      sourceHandle: sourceHandleFor(
        relationshipPlacements.get(first.id)?.presentation?.sourceSide,
        view.settings.autoLayoutDirection,
        relationshipPlacements.get(first.id)?.presentation?.sourceSlot,
      ),
      targetHandle: targetHandleFor(
        relationshipPlacements.get(first.id)?.presentation?.targetSide,
        view.settings.autoLayoutDirection,
        relationshipPlacements.get(first.id)?.presentation?.targetSlot,
      ),
      selectable: true,
      deletable: unambiguous,
      reconnectable: unambiguous,
      zIndex: 10,
      data: {
        relationship: first,
        placement,
        relationshipIds: edge.relationships.map((item) => item.id),
        tags: [...new Set(edge.relationships.flatMap((item) => item.tags))],
        implied: edge.implied,
        label,
        count: edge.relationships.length,
        routing: view.settings.relationshipRouting,
        showLabel: view.settings.showRelationshipLabels,
        status,
      },
    };
  });

  return { nodes, edges, hiddenCount: placements.length - visible.length };
}

export function sourceHandleFor(side: string | null | undefined, direction: "LR" | "TB", slot = 1) {
  const resolved = side ?? (direction === "TB" ? "bottom" : "right");
  const base = { left: "source-l", top: "source-t", bottom: "b", right: undefined }[resolved];
  return slot === 1 ? base : `${base ?? "source-r"}-${slot}`;
}

export function targetHandleFor(side: string | null | undefined, direction: "LR" | "TB", slot = 1) {
  const resolved = side ?? (direction === "TB" ? "top" : "left");
  const base = { right: "target-r", bottom: "target-b", top: "t", left: undefined }[resolved];
  return slot === 1 ? base : `${base ?? "target-l"}-${slot}`;
}

export interface BoundarySource {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface NestedBoundarySource extends BoundarySource {
  elementIds: readonly string[];
}

function boundaryStyle(
  classification: ArchitectureBoundary["classification"],
  width: number,
  height: number,
): Record<string, string | number> {
  const accent =
    classification === "public"
      ? "var(--ownership-external)"
      : classification === "private"
        ? "var(--ownership-internal)"
        : "var(--boundary)";
  return {
    width,
    height,
    border: `1px solid color-mix(in oklch, ${accent} 45%, var(--canvas))`,
    borderRadius: 12,
    backgroundColor: `color-mix(in srgb, ${accent} 8%, transparent)`,
  };
}

/**
 * Boundaries are derived from live node positions so they follow a drag
 * immediately (spec §34). They are never persisted — a boundary is just the
 * footprint of a parent element whose children are on the view.
 */
export function computeBoundaries(
  sources: readonly BoundarySource[],
  elementsById: ReadonlyMap<string, ArchitectureElement>,
  enabled: boolean,
  nestedBoundaries: readonly NestedBoundarySource[] = [],
  sectionFrames: Readonly<Record<string, SectionFrame>> = {},
): FlowNode[] {
  if (!enabled) return [];

  const present = new Set(sources.map((source) => source.id));
  const groups = new Map<string, BoundarySource[]>();

  for (const source of sources) {
    const parentId = elementsById.get(source.id)?.parentId;
    if (!parentId || present.has(parentId)) continue;
    const bucket = groups.get(parentId);
    if (bucket) bucket.push(source);
    else groups.set(parentId, [source]);
  }

  // A semantic boundary can sit inside a parent-element frame. Include the
  // entire nested rectangle in that parent's footprint, rather than deriving
  // both frames independently from the same cards and overlapping headers.
  for (const boundary of nestedBoundaries) {
    const parentIds = new Set(
      boundary.elementIds
        .map((elementId) => elementsById.get(elementId)?.parentId)
        .filter(
          (parentId): parentId is string =>
            parentId !== null && parentId !== undefined && !present.has(parentId),
        ),
    );
    for (const parentId of parentIds) {
      const bucket = groups.get(parentId);
      if (bucket) {
        if (!bucket.some((source) => source.id === boundary.id)) bucket.push(boundary);
      } else {
        groups.set(parentId, [boundary]);
      }
    }
  }

  for (const frameId of Object.keys(sectionFrames)) {
    const parentId = frameId.slice("boundary:".length);
    if (
      elementsById.get(parentId)?.kind === "custom" &&
      !present.has(parentId) &&
      !groups.has(parentId)
    )
      groups.set(parentId, []);
  }
  const nodes: FlowNode[] = [];
  for (const [parentId, children] of groups) {
    const parent = elementsById.get(parentId);
    if (!parent || (children.length === 0 && !sectionFrames[`boundary:${parentId}`])) continue;

    const minX = Math.min(...children.map((child) => child.x));
    const minY = Math.min(...children.map((child) => child.y));
    const maxX = Math.max(...children.map((child) => child.x + child.width));
    const maxY = Math.max(...children.map((child) => child.y + child.height));

    const saved = parent.kind === "custom" ? sectionFrames[`boundary:${parentId}`] : undefined;
    const frame = saved ?? {
      x: minX - BOUNDARY_PADDING,
      y: minY - BOUNDARY_PADDING - BOUNDARY_HEADER,
      width: maxX - minX + BOUNDARY_PADDING * 2,
      height: maxY - minY + BOUNDARY_PADDING * 2 + BOUNDARY_HEADER,
    };
    nodes.push({
      id: `boundary:${parentId}`,
      type: "boundary",
      position: { x: frame.x, y: frame.y },
      width: frame.width,
      height: frame.height,
      measured: { width: frame.width, height: frame.height },
      data: {
        name: parent.name,
        kind: parent.kind,
        section: parent.kind === "custom",
        classification: parent.external ? "public" : null,
        elementId: parent.id,
      },
      draggable: false,
      // Derived containers are clickable through Canvas.onNodeClick, but must
      // stay out of React Flow's rectangle/multi-selection of real elements.
      selectable: false,
      connectable: false,
      deletable: false,
      zIndex: 0,
      style: boundaryStyle(parent.external ? "public" : null, frame.width, frame.height),
    });
  }
  return nodes;
}

/** Build nested semantic boundary rectangles from visible member footprints. */
export function computeSemanticBoundaries(
  sources: readonly BoundarySource[],
  boundaries: readonly ArchitectureBoundary[],
  layer: ArchitectureBoundary["layer"],
  enabled: boolean,
  sectionFrames: Readonly<Record<string, SectionFrame>> = {},
): FlowNode[] {
  if (!enabled) return [];
  const active = boundaries.filter((boundary) => boundary.layer === layer);
  const byId = new Map(active.map((boundary) => [boundary.id, boundary] as const));
  const sourceById = new Map(sources.map((source) => [source.id, source] as const));
  const boxes = new Map<string, BoundarySource>();

  const boxFor = (
    boundary: ArchitectureBoundary,
    visiting = new Set<string>(),
  ): BoundarySource | null => {
    const cached = boxes.get(boundary.id);
    if (cached) return cached;
    if (visiting.has(boundary.id)) return null;
    visiting.add(boundary.id);
    const saved = boundary.kind === "custom" ? sectionFrames[`boundary:${boundary.id}`] : undefined;
    if (saved) {
      const box = { id: boundary.id, ...saved };
      boxes.set(boundary.id, box);
      visiting.delete(boundary.id);
      return box;
    }
    const contents: BoundarySource[] = boundary.elementIds
      .map((id) => sourceById.get(id))
      .filter((source): source is BoundarySource => Boolean(source));
    for (const child of active.filter((item) => item.parentBoundaryId === boundary.id)) {
      const childBox = boxFor(child, visiting);
      if (childBox) contents.push(childBox);
    }
    visiting.delete(boundary.id);
    if (contents.length === 0) return null;
    const minX = Math.min(...contents.map((item) => item.x));
    const minY = Math.min(...contents.map((item) => item.y));
    const maxX = Math.max(...contents.map((item) => item.x + item.width));
    const maxY = Math.max(...contents.map((item) => item.y + item.height));
    const box = {
      id: boundary.id,
      x: minX - BOUNDARY_PADDING,
      y: minY - BOUNDARY_PADDING - BOUNDARY_HEADER,
      width: maxX - minX + BOUNDARY_PADDING * 2,
      height: maxY - minY + BOUNDARY_PADDING * 2 + BOUNDARY_HEADER,
    };
    boxes.set(boundary.id, box);
    return box;
  };

  for (const boundary of active) boxFor(boundary);
  const depthOf = (boundary: ArchitectureBoundary): number => {
    let depth = 0;
    let parent = boundary.parentBoundaryId ? byId.get(boundary.parentBoundaryId) : undefined;
    while (parent) {
      depth += 1;
      parent = parent.parentBoundaryId ? byId.get(parent.parentBoundaryId) : undefined;
    }
    return depth;
  };

  return active.flatMap((boundary) => {
    const box = boxes.get(boundary.id);
    if (!box) return [];
    const depth = depthOf(boundary);
    return [
      {
        id: `boundary:${boundary.id}`,
        type: "boundary" as const,
        position: { x: box.x, y: box.y },
        width: box.width,
        height: box.height,
        measured: { width: box.width, height: box.height },
        data: {
          name: boundary.name,
          layer: boundary.layer,
          classification: boundary.classification,
          boundaryId: boundary.id,
          section: boundary.kind === "custom",
        },
        draggable: false,
        // Boundary boxes are view-owned containers, not blocks in a group
        // selection. Canvas.onNodeClick still opens their inspector.
        selectable: false,
        connectable: false,
        deletable: false,
        // Parent-element frames use zero. Semantic boundaries sit above them,
        // and each nested semantic level sits above its parent.
        zIndex: depth + 1,
        style: boundaryStyle(boundary.classification, box.width, box.height),
      },
    ];
  });
}

/** Compute both boundary systems together so their boxes form one visual hierarchy. */
export function computeCanvasBoundaries(
  sources: readonly BoundarySource[],
  elementsById: ReadonlyMap<string, ArchitectureElement>,
  boundaries: readonly ArchitectureBoundary[],
  layer: ArchitectureBoundary["layer"],
  enabled: boolean,
  sectionFrames: Readonly<Record<string, SectionFrame>> = {},
): { parentBoundaries: FlowNode[]; semanticBoundaries: FlowNode[] } {
  const semanticBoundaries = computeSemanticBoundaries(
    sources,
    boundaries,
    layer,
    enabled,
    sectionFrames,
  );
  if (!enabled) return { parentBoundaries: [], semanticBoundaries };

  const nestedBoundaries = semanticBoundaries.flatMap((node): NestedBoundarySource[] => {
    const boundaryId = node.data.boundaryId;
    if (!boundaryId || node.width === undefined || node.height === undefined) return [];
    return [
      {
        id: node.id,
        x: node.position.x,
        y: node.position.y,
        width: node.width,
        height: node.height,
        elementIds: [
          ...boundaryMemberIds({ boundaryId: String(boundaryId) }, elementsById, boundaries, layer),
        ],
      },
    ];
  });

  return {
    parentBoundaries: computeBoundaries(
      sources,
      elementsById,
      enabled,
      nestedBoundaries,
      sectionFrames,
    ),
    semanticBoundaries,
  };
}

export const isBoundaryId = (id: string): boolean => id.startsWith("boundary:");
export const boundaryElementId = (id: string): string => id.slice("boundary:".length);

/** Resolve membership, never the unrelated cards that happen to share a rectangle. */
export function boundaryMemberIds(
  data: Pick<BoundaryNodeData, "elementId" | "boundaryId">,
  elementsById: ReadonlyMap<string, ArchitectureElement>,
  boundaries: readonly ArchitectureBoundary[],
  layer: ArchitectureBoundary["layer"],
): Set<string> {
  const members = new Set<string>();
  if (data.boundaryId) {
    const visited = new Set<string>();
    const collect = (id: string): void => {
      if (visited.has(id)) return;
      visited.add(id);
      const boundary = boundaries.find((item) => item.id === id && item.layer === layer);
      if (!boundary) return;
      for (const elementId of boundary.elementIds) members.add(elementId);
      for (const child of boundaries) {
        if (child.parentBoundaryId === id && child.layer === layer) collect(child.id);
      }
    };
    collect(data.boundaryId);
  } else if (data.elementId) {
    for (const element of elementsById.values()) {
      let parentId = element.parentId;
      const visited = new Set<string>();
      while (parentId && !visited.has(parentId)) {
        if (parentId === data.elementId) {
          members.add(element.id);
          break;
        }
        visited.add(parentId);
        parentId = elementsById.get(parentId)?.parentId ?? null;
      }
    }
  }
  return members;
}

/** A locked member holds the entire group in place, including hidden members. */
export function boundaryMoveEntries(
  placements: readonly Pick<ViewElement, "elementId" | "x" | "y" | "locked">[],
  memberIds: ReadonlySet<string>,
  delta: { x: number; y: number },
): { elementId: string; x: number; y: number }[] {
  if (!Number.isFinite(delta.x) || !Number.isFinite(delta.y)) return [];
  const members = placements.filter((entry) => memberIds.has(entry.elementId));
  if (members.some((entry) => entry.locked)) return [];
  const x = Math.round(delta.x);
  const y = Math.round(delta.y);
  return members.map((entry) => ({ elementId: entry.elementId, x: entry.x + x, y: entry.y + y }));
}
