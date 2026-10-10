import type {
  ArchitectureBoundary,
  ArchitectureElement,
  ArchitectureRecord,
  ArchitectureRelationship,
  ControlPoint,
  SectionFrame,
  ViewAnnotation,
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
  wrappedLines,
} from "@structsmith/domain";
import type { Edge, Node } from "@xyflow/react";
import { annotationNodeId, annotationSize } from "./annotations";
import { automaticAttachmentFractions } from "./attachmentSpacing";
import type { ConnectorAttachment } from "./ConnectorEndpointHandle";
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

export function boundaryHeaderHeight(name: string, width: number, section = false): number {
  return Math.max(BOUNDARY_HEADER, wrappedLines(name, width - (section ? 60 : 150), 7) * 16 + 8);
}

export interface ElementNodeData extends Record<string, unknown> {
  color?: string;
  element: ArchitectureElement;
  severity: "high" | "critical" | null;
  locked: boolean;
  showFullTitles: boolean;
  showDescriptions: boolean;
  minimumHeight: number;
  status: ImplementationStatus | null;
  /** The current scenario step's element: outlined along its own shape. */
  scenarioFocus?: boolean;
  /** 1-based numbers of the playing scenario's steps on this element; clicking one jumps there. */
  scenarioBadges?: number[];
  scenarioCurrent?: number;
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
  /** Display-only: a scenario response travels against the connection's direction. */
  replying?: boolean;
  tags: string[];
  onControlPointsChange?: (points: ControlPoint[]) => Promise<void>;
  movementBends?: ControlPoint[];
  automaticAttachments?: { source?: number; target?: number };
  onRouteRendered?: (points: ControlPoint[]) => void;
  onLabelOffsetChange?: (relationshipId: string, offset: ControlPoint) => Promise<void>;
  onEndpointChange?: (
    endpoint: "source" | "target",
    attachment: ConnectorAttachment,
  ) => Promise<void>;
}

export interface AnnotationNodeData extends Record<string, unknown> {
  annotation: ViewAnnotation;
  onEdit?: () => void;
  onResize?: (frame: SectionFrame) => void;
}
export type FlowNode =
  | Node<ElementNodeData, "element">
  | Node<BoundaryNodeData, "boundary">
  | Node<AnnotationNodeData, "annotation">;
export type FlowEdge = Edge<RelationshipEdgeData>;

/** Section titles sit outside node rectangles, but must remain visible when fitting. */
export function canvasFitBounds(nodes: readonly FlowNode[], edges: readonly FlowEdge[] = []) {
  const boxes = nodes
    .filter((node) => !node.hidden)
    .map((node) => {
      const width = node.measured?.width ?? node.width ?? DEFAULT_NODE_WIDTH;
      const height =
        node.measured?.height ??
        node.height ??
        (node.type === "element" ? node.data.minimumHeight : DEFAULT_NODE_HEIGHT);
      const titleHeight =
        node.type === "boundary" && node.data.section
          ? boundaryHeaderHeight(node.data.name, width, true)
          : 0;
      return {
        x: node.position.x,
        y: node.position.y - titleHeight,
        width,
        height: height + titleHeight,
      };
    });
  for (const edge of edges) {
    const presentation = edge.data?.placement?.presentation;
    for (const point of [
      presentation?.sourcePoint,
      presentation?.targetPoint,
      ...(edge.data?.movementBends ?? edge.data?.placement?.controlPoints ?? []),
    ]) {
      if (point) boxes.push({ x: point.x - 16, y: point.y - 16, width: 32, height: 32 });
    }
  }
  if (!boxes.length) return { x: 0, y: 0, width: 0, height: 0 };
  const x = Math.min(...boxes.map((box) => box.x));
  const y = Math.min(...boxes.map((box) => box.y));
  return {
    x,
    y,
    width: Math.max(...boxes.map((box) => box.x + box.width)) - x,
    height: Math.max(...boxes.map((box) => box.y + box.height)) - y,
  };
}

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
      style: { minHeight: size.height },
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

  const attachments = automaticAttachmentFractions(
    edges,
    view.settings.autoLayoutDirection,
    relationships,
  );
  for (const edge of edges) {
    if (edge.data) edge.data.automaticAttachments = attachments.get(edge.id);
  }

  for (const annotation of view.settings.annotations ?? []) {
    const size = annotationSize(annotation);
    nodes.push({
      id: annotationNodeId(annotation.id),
      type: "annotation",
      position: { x: annotation.x, y: annotation.y },
      data: { annotation },
      width: size.width,
      height: size.height,
      style: { ...size },
      zIndex: 25,
      connectable: false,
    });
  }

  return { nodes, edges, hiddenCount: placements.length - visible.length };
}

export function sourceHandleFor(side: string | null | undefined, direction: "LR" | "TB", slot = 1) {
  const resolved = side ?? (direction === "TB" ? "bottom" : "right");
  const base = { left: "source-l", top: "source-t", bottom: "b", right: "source-r" }[resolved];
  return slot === 1 ? base : `${base ?? "source-r"}-${slot}`;
}

export function targetHandleFor(side: string | null | undefined, direction: "LR" | "TB", slot = 1) {
  const resolved = side ?? (direction === "TB" ? "top" : "left");
  const base = { right: "target-r", bottom: "target-b", top: "t", left: "target-l" }[resolved];
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
  scopeElementId?: string | null,
): FlowNode[] {
  if (!enabled) return [];

  const present = new Set(sources.map((source) => source.id));
  const groups = new Map<string, BoundarySource[]>();

  for (const source of sources) {
    const parentId = elementsById.get(source.id)?.parentId;
    if (!parentId || parentId === scopeElementId || present.has(parentId)) continue;
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
            parentId !== null &&
            parentId !== undefined &&
            parentId !== scopeElementId &&
            !present.has(parentId),
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
    const headerHeight = boundaryHeaderHeight(
      parent.name,
      saved?.width ?? maxX - minX + BOUNDARY_PADDING * 2,
    );
    const extraHeader = headerHeight - BOUNDARY_HEADER;
    const frame = saved
      ? {
          ...saved,
          y: saved.y - extraHeader,
          height: saved.height + extraHeader,
        }
      : {
          x: minX - BOUNDARY_PADDING,
          y: minY - BOUNDARY_PADDING - headerHeight,
          width: maxX - minX + BOUNDARY_PADDING * 2,
          height: maxY - minY + BOUNDARY_PADDING * 2 + headerHeight,
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
        section: false,
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
  subprocessFrames: readonly NestedBoundarySource[] = [],
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
    const members = new Set(boundary.elementIds);
    const collectMembers = (id: string, seen = new Set<string>()): void => {
      if (seen.has(id)) return;
      seen.add(id);
      for (const child of active.filter((item) => item.parentBoundaryId === id)) {
        for (const member of child.elementIds) members.add(member);
        collectMembers(child.id, seen);
      }
    };
    collectMembers(boundary.id);
    const saved = boundary.kind === "custom" ? sectionFrames[`boundary:${boundary.id}`] : undefined;
    if (saved) {
      const enclosing = [
        ...subprocessFrames.filter((frame) => frame.elementIds.some((id) => members.has(id))),
        ...active
          .filter((child) => child.parentBoundaryId === boundary.id)
          .flatMap((child) => {
            const box = boxFor(child, visiting);
            if (!box) return [];
            const titleHeight =
              child.kind === "custom" ? boundaryHeaderHeight(child.name, box.width, true) : 0;
            return [{ ...box, y: box.y - titleHeight, height: box.height + titleHeight }];
          }),
      ];
      const x = Math.min(saved.x, ...enclosing.map((frame) => frame.x - BOUNDARY_PADDING));
      const y = Math.min(saved.y, ...enclosing.map((frame) => frame.y - BOUNDARY_PADDING));
      const box = {
        id: boundary.id,
        x,
        y,
        width:
          Math.max(
            saved.x + saved.width,
            ...enclosing.map((frame) => frame.x + frame.width + BOUNDARY_PADDING),
          ) - x,
        height:
          Math.max(
            saved.y + saved.height,
            ...enclosing.map((frame) => frame.y + frame.height + BOUNDARY_PADDING),
          ) - y,
      };
      boxes.set(boundary.id, box);
      visiting.delete(boundary.id);
      return box;
    }
    const contents: BoundarySource[] = boundary.elementIds
      .map((id) => sourceById.get(id))
      .filter((source): source is BoundarySource => Boolean(source));
    if (boundary.kind === "custom")
      contents.push(
        ...subprocessFrames.filter((frame) => frame.elementIds.some((id) => members.has(id))),
      );
    for (const child of active.filter((item) => item.parentBoundaryId === boundary.id)) {
      const childBox = boxFor(child, visiting);
      if (childBox) {
        const titleHeight =
          child.kind === "custom" ? boundaryHeaderHeight(child.name, childBox.width, true) : 0;
        contents.push({
          ...childBox,
          y: childBox.y - titleHeight,
          height: childBox.height + titleHeight,
        });
      }
    }
    visiting.delete(boundary.id);
    if (contents.length === 0) return null;
    const minX = Math.min(...contents.map((item) => item.x));
    const minY = Math.min(...contents.map((item) => item.y));
    const maxX = Math.max(...contents.map((item) => item.x + item.width));
    const maxY = Math.max(...contents.map((item) => item.y + item.height));
    const width = maxX - minX + BOUNDARY_PADDING * 2;
    const headerHeight =
      boundary.kind === "custom" ? BOUNDARY_HEADER : boundaryHeaderHeight(boundary.name, width);
    const box = {
      id: boundary.id,
      x: minX - BOUNDARY_PADDING,
      y: minY - BOUNDARY_PADDING - headerHeight,
      width,
      height: maxY - minY + BOUNDARY_PADDING * 2 + headerHeight,
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
        zIndex: boundary.kind === "custom" ? depth - 10 : depth + 1,
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
  scopeElementId?: string | null,
  expandedFrames: readonly NestedBoundarySource[] = [],
): { parentBoundaries: FlowNode[]; semanticBoundaries: FlowNode[] } {
  const semanticBoundaries = computeSemanticBoundaries(
    sources,
    boundaries,
    layer,
    enabled,
    sectionFrames,
    expandedFrames,
  );
  if (!enabled) return { parentBoundaries: [], semanticBoundaries };

  // Sections own the visual grouping of their members; do not invent hidden
  // model-parent frames around those same members.
  const sectionMembers = new Set(
    boundaries
      .filter((boundary) => boundary.kind === "custom" && boundary.layer === layer)
      .flatMap((boundary) => [
        ...boundaryMemberIds({ boundaryId: boundary.id }, elementsById, boundaries, layer),
      ]),
  );

  const nestedBoundaries = semanticBoundaries
    .filter((node) => !node.data.section)
    .flatMap((node): NestedBoundarySource[] => {
      const boundaryId = node.data.boundaryId;
      if (!boundaryId || node.width === undefined || node.height === undefined) return [];
      const members = [
        ...boundaryMemberIds({ boundaryId: String(boundaryId) }, elementsById, boundaries, layer),
      ];
      if (members.some((id) => sectionMembers.has(id))) return [];
      return [
        {
          id: node.id,
          x: node.position.x,
          y: node.position.y,
          width: node.width,
          height: node.height,
          elementIds: members,
        },
      ];
    });

  const parentBoundaries = computeBoundaries(
    sources.filter((source) => !sectionMembers.has(source.id)),
    elementsById,
    enabled,
    nestedBoundaries,
    sectionFrames,
    scopeElementId,
  ).filter((node) => !expandedFrames.some((frame) => frame.id === node.data.elementId));
  return {
    parentBoundaries,
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
  expandedElementIds?: ReadonlySet<string>,
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
    for (const elementId of [...members]) {
      if (!expandedElementIds?.has(elementId)) continue;
      for (const descendant of boundaryMemberIds({ elementId }, elementsById, boundaries, layer))
        members.add(descendant);
    }
  } else if (data.elementId) {
    members.add(data.elementId);
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
