import type {
  ArchitectureBoundary,
  ArchitectureElement,
  ArchitectureRecord,
  ArchitectureRelationship,
  SectionFrame,
  UpdateViewAnnotationInput,
  ViewAnnotation,
  ViewDetail,
  ViewElement,
  ViewRelationshipPatch,
  ViewScenarioStep,
  Workspace,
} from "@structsmith/contracts";
import { deriveExpandedView, estimateElementSize } from "@structsmith/domain";
import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  type Connection,
  ControlButton,
  Controls,
  type EdgeChange,
  getViewportForBounds,
  MiniMap,
  type NodeChange,
  type NodeMouseHandler,
  type OnNodeDrag,
  type OnSelectionChangeParams,
  Panel,
  ReactFlow,
  SelectionMode,
  useNodes,
  useReactFlow,
} from "@xyflow/react";
import { Maximize } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useChatStore } from "@/features/chat/store";
import { useApiErrorHandler, useApplyOperations } from "@/hooks/useApi";
import { api } from "@/lib/api";
import { hasPrimaryModifier, primaryModifierKeyCode } from "@/lib/platform";
import { invalidateWorkspace, queryClient, queryKeys } from "@/lib/query";
import { useEditorStore } from "@/store/editor";
import { useHistoryStore } from "@/store/history";
import { ExplorationPreview } from "../navigation/ExplorationPreview";
import type { ViewLocation } from "../navigation/history";
import { InlineExpansionContext } from "../navigation/InlineExpansion";
import { useCopyAgentReference } from "../reference/useCopyAgentReference";
import { ScenarioPanel } from "../scenarios/ScenarioPanel";
import { AnnotationEditor } from "./AnnotationEditor";
import { AnnotationNode } from "./AnnotationNode";
import {
  annotationId,
  annotationNodeId,
  annotationSize,
  containingAnnotationSection,
  isAnnotationId,
} from "./annotations";
import "./annotationTranslations";
import { BoundaryNode } from "./BoundaryNode";
import { CanvasComments } from "./CanvasComments";
import { CreationToolbar } from "./CreationToolbar";
import { buildPasteOperations, createDiagramClipboard, type DiagramCopyMode } from "./clipboard";
import { commandWheelViewport } from "./commandWheel";
import { ElementNode } from "./ElementNode";
import { ElementTypePicker } from "./ElementTypePicker";
import {
  boundaryElementId,
  boundaryMemberIds,
  boundaryMoveEntries,
  buildGraph,
  CANVAS_FIT_PADDING,
  canvasFitBounds,
  computeCanvasBoundaries,
  type FlowEdge,
  type FlowNode,
  isBoundaryId,
  NODE_HEIGHT,
  NODE_WIDTH,
  type RelationshipEdgeData,
} from "./graph";
import { inlineFrames } from "./inlineFrames";
import { type ContextMenuItem, NodeContextMenu } from "./NodeContextMenu";
import { RelationshipEdge } from "./RelationshipEdge";
import { sideFromHandle, slotFromHandle } from "./relationshipGeometry";
import { SelectionColorToolbar } from "./SelectionColorToolbar";
import {
  fitSectionFrame,
  sectionFrameEntries,
  sectionMembershipOperations,
  translateSectionFrames,
} from "./sections";
import { applyNodeColors } from "./selectionColors";
import type { StatusOverlay } from "./statusOverlay";
import { focusGraphByTag } from "./tagFocus";

/** An implied edge carries a derived id, so always resolve the real one. */
const relationshipIdOf = (edge: { id: string; data?: Record<string, unknown> }): string =>
  (edge.data as RelationshipEdgeData | undefined)?.relationship.id ?? edge.id;

const nodeTypes = { element: ElementNode, boundary: BoundaryNode, annotation: AnnotationNode };
const edgeTypes = { relationship: RelationshipEdge };
const LAYOUT_DEBOUNCE_MS = 500;
const NO_INLINE_EXPANSIONS = new Set<string>();

export const DRAG_MIME = "application/x-architecture-element";

interface CanvasProps {
  workspaceId: string;
  view: ViewDetail;
  elements: readonly ArchitectureElement[];
  boundaries: readonly ArchitectureBoundary[];
  relationships: readonly ArchitectureRelationship[];
  records: readonly ArchitectureRecord[];
  initialLocation?: ViewLocation;
  layoutFitRequest: number;
  statusOverlay: StatusOverlay;
  tagFocus: string | null;
  onOpenDetails: (elementId: string) => void;
  canOpenDetails: (elementId: string) => boolean;
}

export function Canvas({
  workspaceId,
  view,
  elements,
  boundaries,
  relationships,
  records,
  initialLocation,
  layoutFitRequest,
  statusOverlay,
  tagFocus,
  onOpenDetails,
  canOpenDetails,
}: CanvasProps) {
  const { t } = useTranslation();
  const { t: ta } = useTranslation("annotations");
  const flow = useReactFlow<FlowNode, FlowEdge>();
  const onError = useApiErrorHandler();
  const applyOperations = useApplyOperations(workspaceId);
  const copyReference = useCopyAgentReference();
  const askAgent = useChatStore((state) => state.ask);
  const pushHistory = useHistoryStore((state) => state.push);

  const select = useEditorStore((state) => state.select);
  const clearSelection = useEditorStore((state) => state.clearSelection);
  const selection = useEditorStore((state) => state.selection);
  const connectFrom = useEditorStore((state) => state.connectFrom);
  const setConnectFrom = useEditorStore((state) => state.setConnectFrom);
  const focusRequest = useEditorStore((state) => state.focusRequest);
  const beginSave = useEditorStore((state) => state.beginSave);
  const endSave = useEditorStore((state) => state.endSave);
  const clipboard = useEditorStore((state) => state.clipboard);
  const setClipboard = useEditorStore((state) => state.setClipboard);

  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
  const [previewElementId, setPreviewElementId] = useState<string | null>(null);
  const [scenarioStep, setScenarioStep] = useState<ViewScenarioStep | null>(null);
  const expansion = useMemo(
    () => deriveExpandedView(view, elements, NO_INLINE_EXPANSIONS),
    [view, elements],
  );
  const graph = useMemo(() => {
    const built = buildGraph({
      view: expansion.view,
      elements,
      relationships,
      records,
      statusOverlay,
    });
    return { ...built, ...focusGraphByTag(built.nodes, built.edges, tagFocus) };
  }, [expansion.view, elements, relationships, records, statusOverlay, tagFocus]);
  const onScenarioStep = useCallback(
    (step: ViewScenarioStep | null) => {
      setScenarioStep(step);
      if (step) {
        select({ type: "element", id: step.elementId });
        useEditorStore.getState().requestFocus(step.elementId);
      }
    },
    [select],
  );
  const elementsById = useMemo(
    () => new Map(elements.map((element) => [element.id, element])),
    [elements],
  );

  const restoredSelection = useRef(initialLocation?.selection);
  const [nodes, setNodes] = useState<FlowNode[]>(() =>
    graph.nodes.map((node) => ({
      ...node,
      selected:
        initialLocation?.selection.type === "element"
          ? initialLocation.selection.id === node.id
          : initialLocation?.selection.type === "annotation"
            ? annotationNodeId(initialLocation.selection.id) === node.id
            : initialLocation?.selection.type === "elements" &&
              initialLocation.selection.ids.includes(node.id),
    })),
  );
  // React Flow keeps selection *inside* the elements array, so edges must be
  // state with an onEdgesChange handler — a plain prop can never be selected.
  const [edges, setEdges] = useState<FlowEdge[]>(() =>
    graph.edges.map((edge) => ({
      ...edge,
      selected:
        initialLocation?.selection.type === "relationship" &&
        initialLocation.selection.id === relationshipIdOf(edge),
    })),
  );
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
  const pendingLayout = useRef(new Map<string, { x: number; y: number }>());
  const layoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragOrigins = useRef(new Map<string, { x: number; y: number }>());
  const layoutSaveQueue = useRef<Promise<void>>(Promise.resolve());
  const ignoreDetailsUntil = useRef(0);
  const [sectionFrames, setSectionFrames] = useState(view.settings.sectionFrames);
  const dragSectionNodes = useRef<FlowNode[]>([]);
  useEffect(() => setSectionFrames(view.settings.sectionFrames), [view.settings.sectionFrames]);
  const boundaryDrag = useRef<{
    id: string;
    position: { x: number; y: number };
    members: Set<string>;
    placements: ViewElement[];
    revision: number;
    frames: Record<string, SectionFrame>;
    nestedFrameIds: Set<string>;
    annotations: ViewAnnotation[];
  } | null>(null);

  // A rebuild happens after every mutation; carry the current selection over so
  // the highlight does not blink off while the inspector still shows the item.
  useEffect(() => {
    setNodes((current) => {
      const previous = new Map(current.map((node) => [node.id, node]));
      return graph.nodes.map((node) => ({
        ...node,
        selected: previous.get(node.id)?.selected ?? node.selected,
        // Keep edges mounted while ResizeObserver measures refreshed cards.
        measured: previous.get(node.id)?.measured,
      }));
    });
  }, [graph.nodes]);

  useEffect(() => {
    setEdges((current) => {
      const selected = new Set(current.filter((edge) => edge.selected).map((edge) => edge.id));
      return selected.size === 0
        ? graph.edges
        : graph.edges.map((edge) => (selected.has(edge.id) ? { ...edge, selected: true } : edge));
    });
  }, [graph.edges]);

  /**
   * Fit the diagram once per view, as soon as React Flow has measured the
   * nodes. The `fitView` prop alone runs before the panel layout has settled
   * and before the model query resolves, so entering a workspace from the home
   * screen would otherwise land on an unfitted canvas.
   */
  const canvasRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onCommandWheel = (event: WheelEvent) => {
      if (!event.metaKey || event.ctrlKey) return;
      if (!(event.target instanceof Element) || !event.target.closest(".react-flow")) return;
      if (event.target.closest(".nowheel, .nopan, button, input, textarea, [role=dialog]")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const bounds = canvas.getBoundingClientRect();
      void flow.setViewport(
        commandWheelViewport(
          flow.getViewport(),
          { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
          event.deltaY,
          event.deltaMode,
        ),
      );
    };
    canvas.addEventListener("wheel", onCommandWheel, { passive: false, capture: true });
    return () => canvas.removeEventListener("wheel", onCommandWheel, true);
  }, [flow]);
  const renderedNodes = useNodes<FlowNode>();
  // Boundary frames have no handles; only cards need measurement before fitting.
  const nodesInitialized = graph.nodes.every((node) => {
    const rendered = renderedNodes.find((entry) => entry.id === node.id);
    return (rendered?.measured?.width ?? 0) > 0 && (rendered?.measured?.height ?? 0) > 0;
  });
  const fittedLayoutRequest = useRef(layoutFitRequest);
  const fittedViewId = useRef<string | null>(null);
  const initialViewport = useRef(initialLocation?.viewport);
  const fit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    void flow.setViewport(
      getViewportForBounds(
        canvasFitBounds(flow.getNodes()),
        canvas.clientWidth,
        canvas.clientHeight,
        0.15,
        1,
        CANVAS_FIT_PADDING,
      ),
      { duration: 250 },
    );
  }, [flow]);

  useEffect(() => {
    if (!flow.viewportInitialized || nodes.length === 0 || !nodesInitialized) return;
    if (fittedViewId.current === view.id) return;
    fittedViewId.current = view.id;
    if (initialViewport.current) void flow.setViewport(initialViewport.current);
    else if (nodes.length > 0) fit();
    if (restoredSelection.current) select(restoredSelection.current);
  }, [nodesInitialized, nodes.length, view.id, flow, select, fit]);

  useEffect(() => {
    if (fittedLayoutRequest.current === layoutFitRequest || !nodesInitialized) return;
    const width = canvasRef.current?.clientWidth ?? 0;
    const height = canvasRef.current?.clientHeight ?? 0;
    if (width === 0 || height === 0) return;
    const rendered = new Map(renderedNodes.map((node) => [node.id, node.position]));
    if (
      graph.nodes.some((node) => {
        const position = rendered.get(node.id);
        return !position || position.x !== node.position.x || position.y !== node.position.y;
      })
    )
      return;
    fittedLayoutRequest.current = layoutFitRequest;
    void flow.setViewport(
      getViewportForBounds(
        canvasFitBounds(flow.getNodes()),
        width,
        height,
        0.1,
        1,
        CANVAS_FIT_PADDING,
      ),
      { duration: 300 },
    );
  }, [layoutFitRequest, nodesInitialized, renderedNodes, graph.nodes, flow]);

  /**
   * Selecting an element outside the canvas (model tree, command palette) has
   * to move the camera *and* mark the node as selected — React Flow keeps
   * `selected` inside the elements array, so the store alone cannot show it.
   */
  useEffect(() => {
    if (!focusRequest) return;
    const { elementId } = focusRequest;

    const node = flow.getNode(elementId);
    if (node)
      void flow.fitView({
        nodes: [{ id: node.id }],
        duration: 350,
        maxZoom: 1.2,
        padding: CANVAS_FIT_PADDING,
      });

    setNodes((current) =>
      current.map((candidate) => {
        const shouldSelect = candidate.id === elementId;
        return candidate.selected === shouldSelect
          ? candidate
          : { ...candidate, selected: shouldSelect };
      }),
    );
    setEdges((current) =>
      current.map((edge) => (edge.selected ? { ...edge, selected: false } : edge)),
    );
  }, [focusRequest, flow]);

  useEffect(() => {
    if (selection.type !== "relationship") return;
    setNodes((current) =>
      current.map((node) => (node.selected ? { ...node, selected: false } : node)),
    );
    setEdges((current) =>
      current.map((edge) => {
        const shouldSelect = relationshipIdOf(edge) === selection.id;
        return edge.selected === shouldSelect ? edge : { ...edge, selected: shouldSelect };
      }),
    );
  }, [selection]);

  /* --------------------------- layout persistence --------------------------- */

  const persistLayout = useCallback(
    (
      entries: { elementId: string; x: number; y: number }[],
      previous: { elementId: string; x: number; y: number }[],
    ) => {
      if (entries.length === 0) return;
      beginSave();
      const request = layoutSaveQueue.current.then(() => api.saveLayout(view.id, { entries }));
      // Keep gestures ordered. A slower earlier response must never overwrite a
      // newer position when somebody drags the same card several times quickly.
      layoutSaveQueue.current = request.then(
        () => undefined,
        () => undefined,
      );
      void request
        .then(() => {
          pushHistory({
            kind: "layout",
            viewId: view.id,
            entries: previous,
            label: t("toast.layoutSaved"),
          });
          invalidateWorkspace(workspaceId);
        })
        .catch(onError)
        .finally(endSave);
    },
    [beginSave, endSave, onError, pushHistory, t, view.id, workspaceId],
  );

  const flushLayout = useCallback(() => {
    const pending = [...pendingLayout.current.entries()];
    pendingLayout.current.clear();
    const entries = pending
      .filter(([elementId]) => view.elements.some((entry) => entry.elementId === elementId))
      .map(([elementId, position]) => ({
        elementId,
        x: Math.round(position.x),
        y: Math.round(position.y),
      }));
    const annotationEntries = pending.filter(([id]) => isAnnotationId(id));
    if (annotationEntries.length)
      applyOperations.mutate(
        {
          label: ta("updated"),
          operations: annotationEntries.map(([id, position]) => ({
            op: "updateViewAnnotation",
            viewId: view.id,
            annotationId: annotationId(id),
            data: position,
          })),
        },
        { onError: () => invalidateWorkspace(workspaceId) },
      );
    if (entries.length === 0) return;

    const previous = entries.map(({ elementId }) => {
      const stored = view.elements.find((entry) => entry.elementId === elementId);
      return { elementId, x: stored?.x ?? 0, y: stored?.y ?? 0 };
    });
    persistLayout(entries, previous);
  }, [persistLayout, view.elements, view.id, applyOperations, ta, workspaceId]);

  const flushLayoutRef = useRef(flushLayout);
  flushLayoutRef.current = flushLayout;

  // A view switch unmounts this canvas. Commit a pending keyboard move rather
  // than discarding it together with the debounce timer.
  useEffect(
    () => () => {
      if (layoutTimer.current) clearTimeout(layoutTimer.current);
      flushLayoutRef.current();
    },
    [],
  );

  const scheduleLayoutSave = useCallback(() => {
    if (layoutTimer.current) clearTimeout(layoutTimer.current);
    layoutTimer.current = setTimeout(flushLayout, LAYOUT_DEBOUNCE_MS);
  }, [flushLayout]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const relevant = changes.filter(
        (change) =>
          (!("id" in change) || !isBoundaryId(change.id as string)) &&
          !(change.type === "dimensions" && expansion.expandedElementIds.has(change.id)) &&
          !(boundaryDrag.current && change.type === "position"),
      );
      if (relevant.length === 0) return;
      setNodes((current) => applyNodeChanges(relevant, current) as FlowNode[]);

      for (const change of relevant) {
        if (
          change.type === "position" &&
          change.position &&
          !change.dragging &&
          !dragOrigins.current.has(change.id)
        ) {
          pendingLayout.current.set(change.id, change.position);
        }
      }
      if (
        relevant.some(
          (change) =>
            change.type === "position" && !change.dragging && !dragOrigins.current.has(change.id),
        )
      ) {
        scheduleLayoutSave();
      }
    },
    [scheduleLayoutSave, expansion.expandedElementIds],
  );

  const onNodeDragStart = useCallback<OnNodeDrag<FlowNode>>(
    (_event, node, draggedNodes) => {
      // Finish a preceding keyboard move before starting a separate gesture.
      if (layoutTimer.current) clearTimeout(layoutTimer.current);
      flushLayout();
      dragOrigins.current.clear();
      boundaryDrag.current = null;
      dragSectionNodes.current = flow
        .getNodes()
        .filter((item) => item.type === "boundary" && item.data.section) as FlowNode[];
      const frames = { ...sectionFrames, ...sectionFrameEntries(dragSectionNodes.current) };
      setSectionFrames(frames);
      if (node.type === "boundary") {
        const workspace = queryClient.getQueryData<Workspace>(queryKeys.workspace(workspaceId));
        if (!workspace) return;
        const members = boundaryMemberIds(
          node.data,
          elementsById,
          boundaries,
          view.settings.boundaryLayer,
          expansion.expandedElementIds,
        );
        const current = new Map(nodes.map((item) => [item.id, item.position]));
        boundaryDrag.current = {
          id: node.id,
          position: node.position,
          members,
          placements: expansion.view.elements.map((entry) => ({
            ...entry,
            ...current.get(entry.elementId),
            // Temporary children are locked against individual edits, not group movement.
            locked: expansion.temporaryElementIds.has(entry.elementId) ? false : entry.locked,
          })),
          revision: workspace.revision,
          annotations: (view.settings.annotations ?? []).filter((annotation) => {
            if (!node.data.section || !annotation.sectionId) return false;
            let section = boundaries.find((item) => item.id === annotation.sectionId);
            const seen = new Set<string>();
            while (section && !seen.has(section.id)) {
              if (section.id === node.data.boundaryId) return true;
              seen.add(section.id);
              section = boundaries.find((item) => item.id === section?.parentBoundaryId);
            }
            return false;
          }),
          frames,
          nestedFrameIds: new Set(
            dragSectionNodes.current
              .filter((candidate) => {
                if (!node.data.section) return false;
                let parent = candidate.data.boundaryId
                  ? boundaries.find((item) => item.id === candidate.data.boundaryId)
                  : undefined;
                const visited = new Set<string>();
                while (parent && !visited.has(parent.id)) {
                  if (parent.parentBoundaryId === node.data.boundaryId) return true;
                  visited.add(parent.id);
                  parent = boundaries.find((item) => item.id === parent?.parentBoundaryId);
                }
                return false;
              })
              .map((candidate) => candidate.id),
          ),
        };
        return;
      }
      for (const dragged of draggedNodes.length > 0 ? draggedNodes : [node]) {
        if (isBoundaryId(dragged.id)) continue;
        dragOrigins.current.set(dragged.id, {
          x: dragged.position.x,
          y: dragged.position.y,
        });
      }
    },
    [
      flushLayout,
      workspaceId,
      elementsById,
      boundaries,
      view,
      expansion.view,
      expansion.expandedElementIds,
      expansion.temporaryElementIds,
      nodes,
      flow,
      sectionFrames,
    ],
  );

  const onNodeDrag = useCallback<OnNodeDrag<FlowNode>>((_event, node) => {
    const drag = boundaryDrag.current;
    if (!drag || drag.id !== node.id) return;
    const entries = boundaryMoveEntries(drag.placements, drag.members, {
      x: node.position.x - drag.position.x,
      y: node.position.y - drag.position.y,
    });
    setSectionFrames(
      translateSectionFrames(
        drag.frames,
        drag.id,
        {
          x: node.position.x - drag.position.x,
          y: node.position.y - drag.position.y,
        },
        drag.nestedFrameIds,
      ),
    );
    const positions = new Map([
      ...entries.map((entry) => [entry.elementId, { x: entry.x, y: entry.y }] as const),
      ...drag.annotations.map(
        (annotation) =>
          [
            annotationNodeId(annotation.id),
            {
              x: annotation.x + node.position.x - drag.position.x,
              y: annotation.y + node.position.y - drag.position.y,
            },
          ] as const,
      ),
    ]);
    setNodes((current) =>
      current.map((item) => ({ ...item, position: positions.get(item.id) ?? item.position })),
    );
  }, []);

  const onNodeDragStop = useCallback<OnNodeDrag<FlowNode>>(
    (_event, node, draggedNodes) => {
      const drag = boundaryDrag.current;
      onNodeDrag(_event, node, draggedNodes);
      boundaryDrag.current = null;
      if (drag && drag.id === node.id) {
        const entries = boundaryMoveEntries(drag.placements, drag.members, {
          x: node.position.x - drag.position.x,
          y: node.position.y - drag.position.y,
        });
        const previous = new Map(drag.placements.map((entry) => [entry.elementId, entry]));
        if (
          node.position.x === drag.position.x &&
          node.position.y === drag.position.y &&
          entries.every(
            (entry) =>
              entry.x === previous.get(entry.elementId)?.x &&
              entry.y === previous.get(entry.elementId)?.y,
          )
        )
          return;
        beginSave();
        const request = layoutSaveQueue.current.then(() =>
          api.applyOperations(workspaceId, {
            expectedRevision: drag.revision,
            label: t("toast.layoutSaved"),
            operations: [
              ...drag.annotations.map((annotation) => ({
                op: "updateViewAnnotation" as const,
                viewId: view.id,
                annotationId: annotation.id,
                data: {
                  x: annotation.x + node.position.x - drag.position.x,
                  y: annotation.y + node.position.y - drag.position.y,
                },
              })),
              {
                op: "setLayout",
                viewId: view.id,
                entries: entries.filter((entry) =>
                  view.elements.some((saved) => saved.elementId === entry.elementId),
                ),
              },
              {
                op: "updateView",
                viewId: view.id,
                data: {
                  settings: {
                    sectionFrames: translateSectionFrames(
                      drag.frames,
                      drag.id,
                      {
                        x: node.position.x - drag.position.x,
                        y: node.position.y - drag.position.y,
                      },
                      drag.nestedFrameIds,
                    ),
                  },
                },
              },
              ...(node.data.elementId
                ? sectionMembershipOperations(
                    [node],
                    dragSectionNodes.current,
                    elementsById,
                    boundaries.filter(
                      (boundary) =>
                        boundary.viewId === view.id &&
                        boundary.layer === view.settings.boundaryLayer,
                    ),
                  )
                : []),
            ],
          }),
        );
        layoutSaveQueue.current = request.then(
          () => undefined,
          () => undefined,
        );
        void request
          .then((result) => {
            if (result.snapshotId)
              pushHistory({
                kind: "snapshot",
                snapshotId: result.snapshotId,
                label: t("toast.layoutSaved"),
              });
            invalidateWorkspace(workspaceId);
          })
          .catch((error) => {
            setSectionFrames(drag.frames);
            const previous = new Map(
              drag.placements
                .filter((entry) => drag.members.has(entry.elementId))
                .map((entry) => [entry.elementId, { x: entry.x, y: entry.y }]),
            );
            for (const annotation of drag.annotations)
              previous.set(annotationNodeId(annotation.id), { x: annotation.x, y: annotation.y });
            setNodes((current) =>
              current.map((item) => ({
                ...item,
                position: previous.get(item.id) ?? item.position,
              })),
            );
            invalidateWorkspace(workspaceId);
            onError(error);
          })
          .finally(endSave);
        return;
      }
      const moved = (draggedNodes.length > 0 ? draggedNodes : [node]).filter(
        (dragged) => !isBoundaryId(dragged.id),
      );
      const changes = moved.flatMap((dragged) => {
        const before = dragOrigins.current.get(dragged.id);
        const after = {
          x: Math.round(dragged.position.x),
          y: Math.round(dragged.position.y),
        };
        if (!before || (Math.round(before.x) === after.x && Math.round(before.y) === after.y)) {
          return [];
        }
        return [{ elementId: dragged.id, before, after }];
      });
      dragOrigins.current.clear();
      const membership = sectionMembershipOperations(
        moved,
        dragSectionNodes.current,
        elementsById,
        boundaries.filter(
          (boundary) =>
            boundary.viewId === view.id && boundary.layer === view.settings.boundaryLayer,
        ),
      );
      const annotationChanges = changes.filter((change) => isAnnotationId(change.elementId));
      if (annotationChanges.length) {
        const sections = dragSectionNodes.current.flatMap((section) =>
          section.type === "boundary" && section.data.boundaryId
            ? [
                {
                  id: section.data.boundaryId,
                  frame: {
                    ...section.position,
                    width: section.width ?? 120,
                    height: section.height ?? 80,
                  },
                },
              ]
            : [],
        );
        const elementChanges = changes.filter((change) => !isAnnotationId(change.elementId));
        applyOperations.mutate(
          {
            label: ta("updated"),
            operations: [
              ...annotationChanges.map(({ elementId, after }) => {
                const annotation = view.settings.annotations.find(
                  (item) => item.id === annotationId(elementId),
                );
                const size = annotation ? annotationSize(annotation) : { width: 120, height: 40 };
                return {
                  op: "updateViewAnnotation" as const,
                  viewId: view.id,
                  annotationId: annotationId(elementId),
                  data: {
                    ...after,
                    sectionId: containingAnnotationSection({ ...after, ...size }, sections),
                  },
                };
              }),
              ...(elementChanges.length
                ? [
                    {
                      op: "setLayout" as const,
                      viewId: view.id,
                      entries: elementChanges.map(({ elementId, after }) => ({
                        elementId,
                        ...after,
                      })),
                    },
                  ]
                : []),
              ...membership,
            ],
          },
          { onError: () => invalidateWorkspace(workspaceId) },
        );
        return;
      }
      if (dragSectionNodes.current.length > 0 && changes.length > 0) {
        applyOperations.mutate(
          {
            label: t("sections.membershipChanged"),
            operations: [
              {
                op: "setLayout",
                viewId: view.id,
                entries: changes.map(({ elementId, after }) => ({ elementId, ...after })),
              },
              { op: "updateView", viewId: view.id, data: { settings: { sectionFrames } } },
              ...membership,
            ],
          },
          {
            onError: () => {
              setSectionFrames(view.settings.sectionFrames);
              invalidateWorkspace(workspaceId);
            },
          },
        );
        return;
      }
      persistLayout(
        changes.map(({ elementId, after }) => ({ elementId, ...after })),
        changes.map(({ elementId, before }) => ({ elementId, ...before })),
      );
    },
    [
      persistLayout,
      onNodeDrag,
      beginSave,
      endSave,
      onError,
      pushHistory,
      t,
      view,
      workspaceId,
      elementsById,
      boundaries,
      applyOperations,
      sectionFrames,
      ta,
    ],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) =>
      setEdges((current) => applyEdgeChanges(changes, current) as FlowEdge[]),
    [],
  );

  /* ------------------------------- interactions ----------------------------- */

  const createRelationship = useCallback(
    (sourceElementId: string, targetElementId: string, connection?: Connection) => {
      if (sourceElementId === targetElementId) return;
      const source = elementsById.get(sourceElementId)?.name ?? sourceElementId;
      const target = elementsById.get(targetElementId)?.name ?? targetElementId;
      applyOperations.mutate(
        {
          label: `Connected ${source} → ${target}`,
          operations: [
            {
              op: "createRelationship",
              ref: "relationship",
              data: { sourceElementId, targetElementId, interactionStyle: "sync" },
            },
            ...(connection
              ? [
                  {
                    op: "setViewRelationships" as const,
                    viewId: view.id,
                    relationships: [
                      {
                        relationshipId: "@relationship",
                        presentation: {
                          sourceSide: sideFromHandle(connection.sourceHandle, "source"),
                          targetSide: sideFromHandle(connection.targetHandle, "target"),
                          sourceSlot: slotFromHandle(connection.sourceHandle),
                          targetSlot: slotFromHandle(connection.targetHandle),
                        },
                      },
                    ],
                  },
                ]
              : []),
          ],
        },
        {
          onSuccess: (result) => {
            const created = result.appliedOperations.find(
              (operation) => operation.ref === "relationship",
            );
            if (created?.id) select({ type: "relationship", id: created.id });
          },
        },
      );
    },
    [applyOperations, elementsById, select, view.id],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      createRelationship(connection.source, connection.target, connection);
    },
    [createRelationship],
  );

  const onSelectionChange = useCallback(
    ({ nodes: selectedNodes, edges: selectedEdges }: OnSelectionChangeParams) => {
      if (fittedViewId.current !== view.id) return;
      const elementNodes = selectedNodes.filter((node) => node.type === "element");
      if (elementNodes.length > 1) {
        select({ type: "elements", ids: elementNodes.map((node) => node.id).sort() });
        return;
      }
      const node = elementNodes[0] ?? selectedNodes[0];
      const edge = selectedEdges[0];
      if (node) {
        if (node.type === "annotation") {
          select({ type: "annotation", id: annotationId(node.id) });
        } else if (node.type === "boundary" && node.data?.boundaryId) {
          select({ type: "boundary", id: String(node.data.boundaryId) });
        } else {
          select({
            type: "element",
            id: isBoundaryId(node.id) ? boundaryElementId(node.id) : node.id,
          });
        }
      } else if (edge && Number(edge.data?.count ?? 0) > 1) {
        clearSelection();
      } else if (edge) {
        select({ type: "relationship", id: relationshipIdOf(edge) });
      } else {
        clearSelection();
      }
    },
    [clearSelection, select, view.id],
  );

  const onNodeClick = useCallback<NodeMouseHandler>(
    (_event, node) => {
      if (node.type === "boundary") {
        setNodes((current) =>
          current.map((candidate) =>
            candidate.selected === (candidate.id === node.id)
              ? candidate
              : { ...candidate, selected: candidate.id === node.id },
          ),
        );
        setEdges((current) =>
          current.map((edge) => (edge.selected ? { ...edge, selected: false } : edge)),
        );
        if (node.data?.boundaryId) {
          select({ type: "boundary", id: String(node.data.boundaryId) });
        } else if (node.data?.elementId) {
          select({ type: "element", id: String(node.data.elementId) });
        }
        return;
      }
      if (node.type === "annotation" || !connectFrom) return;
      ignoreDetailsUntil.current = Date.now() + 600;
      createRelationship(connectFrom, node.id);
      setConnectFrom(null);
    },
    [connectFrom, createRelationship, select, setConnectFrom],
  );

  const removeFromView = useCallback(
    (elementId: string) =>
      applyOperations.mutate({
        label: t("contextMenu.removeFromView"),
        operations: [
          { op: "setViewElements", viewId: view.id, elementIds: [elementId], mode: "remove" },
        ],
      }),
    [applyOperations, t, view.id],
  );

  const hideInView = useCallback(
    (elementId: string) =>
      applyOperations.mutate({
        label: t("contextMenu.hideFromView"),
        operations: [{ op: "setLayout", viewId: view.id, entries: [{ elementId, hidden: true }] }],
      }),
    [applyOperations, t, view.id],
  );

  const deleteRelationships = useCallback(
    (relationshipIds: readonly string[]) => {
      const ids = [...new Set(relationshipIds.filter((id) => !id.startsWith("implied:")))];
      if (ids.length === 0) return;
      applyOperations.mutate({
        label: t("contextMenu.deleteRelationship"),
        operations: ids.map((relationshipId) => ({
          op: "deleteRelationship" as const,
          relationshipId,
        })),
      });
    },
    [applyOperations, t],
  );

  const deleteSelection = useCallback(
    ({ nodes: deletedNodes, edges: deletedEdges }: { nodes: FlowNode[]; edges: FlowEdge[] }) => {
      const elementIds = deletedNodes
        .filter((node) => node.type === "element")
        .map((node) => node.id);
      // React Flow also reports edges connected to a deleted node. Only remove
      // a semantic relationship when the edge itself was explicitly selected.
      const relationshipIds = [
        ...new Set(
          deletedEdges
            .filter((edge) => edge.selected)
            .map(relationshipIdOf)
            .filter((id) => !id.startsWith("implied:")),
        ),
      ];
      const annotationIds = deletedNodes
        .filter((node) => node.type === "annotation")
        .map((node) => annotationId(node.id));
      if (elementIds.length === 0 && relationshipIds.length === 0 && annotationIds.length === 0)
        return;

      applyOperations.mutate(
        {
          label: t("canvas.deletedSelection"),
          operations: [
            ...annotationIds.map((annotationId) => ({
              op: "deleteViewAnnotation" as const,
              viewId: view.id,
              annotationId,
            })),
            ...(elementIds.length > 0
              ? [
                  {
                    op: "setViewElements" as const,
                    viewId: view.id,
                    elementIds,
                    mode: "remove" as const,
                  },
                ]
              : []),
            ...relationshipIds.map((relationshipId) => ({
              op: "deleteRelationship" as const,
              relationshipId,
            })),
          ],
        },
        { onError: () => invalidateWorkspace(workspaceId) },
      );
      clearSelection();
    },
    [applyOperations, clearSelection, t, view.id, workspaceId],
  );

  const deleteFromModel = useCallback(
    (elementId: string) => {
      const name = elementsById.get(elementId)?.name ?? elementId;
      applyOperations.mutate({
        label: `Deleted ${name}`,
        operations: [{ op: "deleteElement", elementId, cascade: true }],
      });
    },
    [applyOperations, elementsById],
  );

  const duplicateElement = useCallback(
    (elementId: string) => {
      const element = elementsById.get(elementId);
      if (!element) return;
      const copied = createDiagramClipboard(
        workspaceId,
        view,
        elements,
        relationships,
        [elementId],
        "elements-only",
      );
      if (!copied) return;
      applyOperations.mutate({
        label: `Duplicated ${element.name}`,
        operations: buildPasteOperations(copied, workspaceId, view),
      });
    },
    [applyOperations, elementsById, workspaceId, view, elements, relationships],
  );

  const copyElementsToClipboard = useCallback(
    (elementIds: readonly string[], mode: DiagramCopyMode = "with-connections") => {
      const nextClipboard = createDiagramClipboard(
        workspaceId,
        view,
        elements,
        relationships,
        elementIds,
        mode,
      );
      if (!nextClipboard) return false;
      setClipboard(nextClipboard);
      toast.success(t("canvas.copiedElements", { count: elementIds.length }));
      return true;
    },
    [elements, relationships, setClipboard, t, view, workspaceId],
  );

  const onNodeContextMenu = useCallback<NodeMouseHandler>(
    (event, node) => {
      event.preventDefault();
      if (node.type === "annotation") {
        const id = annotationId(node.id);
        select({ type: "annotation", id });
        setMenu({
          x: event.clientX,
          y: event.clientY,
          items: [
            {
              label: ta("edit", {
                kind: ta(
                  String(node.data.annotation && (node.data.annotation as ViewAnnotation).kind),
                ),
              }),
              onSelect: () => setEditingAnnotationId(id),
            },
            {
              label: ta("duplicate"),
              onSelect: () => {
                const copied = createDiagramClipboard(workspaceId, view, elements, relationships, [
                  node.id,
                ]);
                if (copied)
                  applyOperations.mutate({
                    label: ta("created"),
                    operations: buildPasteOperations(copied, workspaceId, view),
                  });
              },
            },
            {
              label: ta("delete"),
              destructive: true,
              separatorBefore: true,
              onSelect: () =>
                applyOperations.mutate({
                  label: ta("deleted"),
                  operations: [{ op: "deleteViewAnnotation", viewId: view.id, annotationId: id }],
                }),
            },
          ],
        });
        return;
      }
      // Right-click and right-button panning must never activate a boundary.
      // Boundaries remain selectable with an intentional left click.
      if (node.type === "boundary") {
        const elementId = node.data.elementId;
        const element = elementId ? elementsById.get(String(elementId)) : undefined;
        setMenu(
          element && canOpenDetails(element.id) && !connectFrom
            ? {
                x: event.clientX,
                y: event.clientY,
                items: [
                  { label: t("navigation.openDetails"), onSelect: () => onOpenDetails(element.id) },
                ],
              }
            : null,
        );
        return;
      }
      const elementId = node.id;
      const element = elementsById.get(elementId);
      const selectedElementIds = nodes
        .filter((candidate) => candidate.type === "element" && candidate.selected)
        .map((candidate) => candidate.id);
      const contextElementIds =
        node.selected && selectedElementIds.length > 1 ? selectedElementIds : [elementId];
      if (!node.selected) {
        setNodes((current) =>
          current.map((candidate) => ({ ...candidate, selected: candidate.id === elementId })),
        );
        setEdges((current) =>
          current.map((edge) => (edge.selected ? { ...edge, selected: false } : edge)),
        );
        select({ type: "element", id: elementId });
      }
      setMenu({
        x: event.clientX,
        y: event.clientY,
        items: [
          ...(element && canOpenDetails(element.id) && !connectFrom
            ? [{ label: t("navigation.openDetails"), onSelect: () => onOpenDetails(elementId) }]
            : []),
          {
            label: t("contextMenu.edit"),
            onSelect: () => select({ type: "element", id: elementId }),
          },
          {
            label: t("chat.askAbout"),
            onSelect: () =>
              askAgent({
                type: "element",
                workspaceId,
                targetId: elementId,
                label: elementsById.get(elementId)?.name,
                viewId: view.id,
              }),
          },
          {
            label: t("contextMenu.copyWithConnections"),
            onSelect: () => copyElementsToClipboard(contextElementIds),
          },
          {
            label: t("contextMenu.copyElementsOnly"),
            onSelect: () => copyElementsToClipboard(contextElementIds, "elements-only"),
          },
          {
            label: t("reference.copy"),
            separatorBefore: true,
            onSelect: () =>
              void copyReference({
                type: "element",
                workspaceId,
                targetId: elementId,
                label: elementsById.get(elementId)?.name,
                viewId: view.id,
              }),
          },
          { label: t("contextMenu.duplicate"), onSelect: () => duplicateElement(elementId) },
          { label: t("contextMenu.connect"), onSelect: () => setConnectFrom(elementId) },
          {
            label: t("contextMenu.hideFromView"),
            onSelect: () => hideInView(elementId),
            separatorBefore: true,
          },
          { label: t("contextMenu.removeFromView"), onSelect: () => removeFromView(elementId) },
          {
            label: t("contextMenu.deleteFromModel"),
            onSelect: () => deleteFromModel(elementId),
            destructive: true,
            separatorBefore: true,
          },
        ],
      });
    },
    [
      applyOperations,
      elements,
      relationships,
      view,
      ta,
      askAgent,
      connectFrom,
      canOpenDetails,
      onOpenDetails,
      copyReference,
      copyElementsToClipboard,
      deleteFromModel,
      duplicateElement,
      elementsById,
      hideInView,
      nodes,
      removeFromView,
      select,
      setConnectFrom,
      t,
      view.id,
      workspaceId,
    ],
  );

  const onEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: FlowEdge) => {
      event.preventDefault();
      if ((edge.data?.count ?? 0) > 1) {
        clearSelection();
        setMenu(null);
        toast.message(t("relationshipPresentation.mergedRouteHint"));
        return;
      }
      const relationshipId = relationshipIdOf(edge);
      const relationship = relationships.find((item) => item.id === relationshipId);
      select({ type: "relationship", id: relationshipId });
      setMenu({
        x: event.clientX,
        y: event.clientY,
        items: [
          {
            label: t("chat.askAbout"),
            onSelect: () =>
              askAgent({
                type: "relationship",
                workspaceId,
                targetId: relationshipId,
                label: relationship?.description ?? undefined,
                viewId: view.id,
              }),
          },
          {
            label: t("reference.copy"),
            onSelect: () =>
              void copyReference({
                type: "relationship",
                workspaceId,
                targetId: relationshipId,
                label: relationship
                  ? `${elementsById.get(relationship.sourceElementId)?.name ?? relationship.sourceElementId} → ${elementsById.get(relationship.targetElementId)?.name ?? relationship.targetElementId}`
                  : relationshipId,
                viewId: view.id,
              }),
          },
          {
            label: t("contextMenu.deleteRelationship"),
            destructive: true,
            separatorBefore: true,
            onSelect: () => deleteRelationships([relationshipId]),
          },
        ],
      });
    },
    [
      askAgent,
      clearSelection,
      copyReference,
      deleteRelationships,
      elementsById,
      relationships,
      select,
      t,
      view.id,
      workspaceId,
    ],
  );

  /* ------------------------------ drag and drop ----------------------------- */

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const elementId = event.dataTransfer.getData(DRAG_MIME);
      if (!elementId) return;
      const targetNode = (event.target as Element | null)?.closest<HTMLElement>(
        ".react-flow__node-boundary",
      );
      const candidateBoundaryId = targetNode?.dataset.id?.startsWith("boundary:")
        ? boundaryElementId(targetNode.dataset.id)
        : null;
      const targetBoundaryId = boundaries.some((boundary) => boundary.id === candidateBoundaryId)
        ? candidateBoundaryId
        : null;
      const alreadyVisible = view.elements.some(
        (entry) => entry.elementId === elementId && !entry.hidden,
      );
      if (alreadyVisible && !targetBoundaryId) {
        toast.message(t("explorer.inView"));
        return;
      }
      const position = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      applyOperations.mutate({
        label: targetBoundaryId ? t("boundaries.membershipChanged") : t("explorer.addToView"),
        operations: [
          { op: "setViewElements", viewId: view.id, elementIds: [elementId], mode: "add" },
          ...(!alreadyVisible
            ? [
                {
                  op: "setLayout" as const,
                  viewId: view.id,
                  entries: [
                    {
                      elementId,
                      x: Math.round(position.x - NODE_WIDTH / 2),
                      y: Math.round(position.y - NODE_HEIGHT / 2),
                      hidden: false,
                    },
                  ],
                },
              ]
            : []),
          ...(targetBoundaryId
            ? [
                {
                  op: "setBoundaryMembers" as const,
                  boundaryId: targetBoundaryId,
                  elementIds: [elementId],
                  mode: "add" as const,
                },
              ]
            : []),
        ],
      });
    },
    [applyOperations, boundaries, flow, t, view.elements, view.id],
  );

  /* ------------------------------- shortcuts ------------------------------- */

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable === true;
      if (typing || !hasPrimaryModifier(event)) return;

      const key = event.key.toLowerCase();
      if (key === "a") {
        event.preventDefault();
        const ids = nodes.filter((node) => node.type !== "boundary").map((node) => node.id);
        setNodes((current) =>
          current.map((node) => ({ ...node, selected: node.type !== "boundary" })),
        );
        setEdges((current) =>
          current.map((edge) => (edge.selected ? { ...edge, selected: false } : edge)),
        );
        if (ids.length === 1)
          select(
            isAnnotationId(ids[0] as string)
              ? { type: "annotation", id: annotationId(ids[0] as string) }
              : { type: "element", id: ids[0] as string },
          );
        else if (ids.length > 1) select({ type: "elements", ids: ids.sort() });
        else clearSelection();
        return;
      }

      if (key === "c") {
        const ids = nodes
          .filter((node) => node.type !== "boundary" && node.selected)
          .map((node) => node.id);
        if (!copyElementsToClipboard(ids)) return;
        event.preventDefault();
        return;
      }

      if (key === "v" && clipboard && !applyOperations.isPending) {
        event.preventDefault();
        applyOperations.mutate({
          label: t("canvas.pastedElements", { count: clipboard.elements.length }),
          operations: buildPasteOperations(clipboard, workspaceId, view),
        });
        setClipboard({ ...clipboard, pasteCount: clipboard.pasteCount + 1 });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    applyOperations,
    clearSelection,
    clipboard,
    copyElementsToClipboard,
    nodes,
    select,
    setClipboard,
    t,
    view,
    workspaceId,
  ]);

  const typeElement =
    selection.type === "element"
      ? elementsById.get(selection.id)
      : selection.type === "elements" && selection.ids.length === 1
        ? elementsById.get(selection.ids[0] as string)
        : undefined;

  /* --------------------------------- render --------------------------------- */

  const allNodes = useMemo(() => {
    const sources = nodes
      .filter((node) => node.type === "element")
      .map((node) => ({
        id: node.id,
        x: node.position.x,
        y: node.position.y,
        width: expansion.expandedElementIds.has(node.id)
          ? (node.width ?? NODE_WIDTH)
          : (node.measured?.width ?? node.width ?? NODE_WIDTH),
        height: expansion.expandedElementIds.has(node.id)
          ? (node.height ?? (node.data.minimumHeight as number | undefined) ?? NODE_HEIGHT)
          : (node.measured?.height ?? node.height ?? NODE_HEIGHT),
      }));
    const expandedFrames = inlineFrames(sources, elementsById, expansion.expandedElementIds).map(
      (frame) => {
        const members = boundaryMemberIds(
          { elementId: frame.id },
          elementsById,
          boundaries,
          view.settings.boundaryLayer,
        );
        return {
          ...frame,
          draggable: !view.elements.some((entry) => entry.locked && members.has(entry.elementId)),
          selected: nodes.some((node) => node.id === frame.id && node.selected),
        };
      },
    );
    const expandedSources = expandedFrames.map((frame) => ({
      id: frame.id,
      ...frame.position,
      width: frame.width ?? 0,
      height: frame.height ?? 0,
      elementIds: [
        ...boundaryMemberIds(
          { elementId: frame.id },
          elementsById,
          boundaries,
          view.settings.boundaryLayer,
        ),
      ],
    }));
    const computedBoundaries = computeCanvasBoundaries(
      sources,
      elementsById,
      boundaries,
      view.settings.boundaryLayer,
      view.settings.showBoundaries,
      sectionFrames,
      view.scopeElementId,
      expandedSources,
    );
    // A parent shown as a boundary has no entry in `nodes`, so mirror the
    // selection onto it here.
    const legacyBoundaries = computedBoundaries.parentBoundaries.map((boundary) => ({
      ...boundary,
      selected:
        (selection.type === "element" && selection.id === boundaryElementId(boundary.id)) ||
        (selection.type === "elements" && selection.ids.includes(boundaryElementId(boundary.id))),
    }));
    const semanticBoundaries = computedBoundaries.semanticBoundaries.map((boundary) => ({
      ...boundary,
      selected: selection.type === "boundary" && selection.id === boundary.data.boundaryId,
    }));
    const annotationNodes = nodes.filter((node) => node.type === "annotation");
    const frames = [...legacyBoundaries, ...semanticBoundaries].map((boundary) => {
      if (boundary.type !== "boundary") return boundary;
      const members = boundaryMemberIds(
        boundary.data,
        elementsById,
        boundaries,
        view.settings.boundaryLayer,
        expansion.expandedElementIds,
      );
      const placements = view.elements.filter((entry) => members.has(entry.elementId));
      const fitSources = [
        ...sources.map(
          (source) => expandedSources.find((frame) => frame.id === source.id) ?? source,
        ),
        ...placements
          .filter((entry) => !sources.some((source) => source.id === entry.elementId))
          .map((entry) => ({
            id: entry.elementId,
            x: entry.x,
            y: entry.y,
            ...estimateElementSize(
              elementsById.get(entry.elementId),
              {
                showFullTitles: view.settings.showFullTitles,
                showDescriptions: view.settings.showDescriptions,
              },
              entry,
            ),
          })),
      ];
      for (const node of annotationNodes) {
        if (
          node.type === "annotation" &&
          (node.data.annotation.sectionId === boundary.data.boundaryId ||
            boundaries.some(
              (section) =>
                section.id === node.data.annotation.sectionId &&
                section.parentBoundaryId === boundary.data.boundaryId,
            ))
        ) {
          members.add(node.id);
          fitSources.push({
            id: node.id,
            ...node.position,
            width: node.width ?? 120,
            height: node.height ?? 40,
          });
        }
      }
      const fittedFrame = boundary.data.section ? fitSectionFrame(fitSources, members) : null;
      return {
        ...boundary,
        draggable:
          (placements.length > 0 || boundary.data.section === true) &&
          !placements.some((entry) => entry.locked),
        data: {
          ...boundary.data,
          onFit:
            fittedFrame && !placements.some((entry) => entry.locked)
              ? () => {
                  const next = { ...sectionFrames, [boundary.id]: fittedFrame };
                  setSectionFrames(next);
                  applyOperations.mutate(
                    {
                      label: t("sections.fit"),
                      operations: [
                        {
                          op: "updateView",
                          viewId: view.id,
                          data: { settings: { sectionFrames: next } },
                        },
                      ],
                    },
                    { onError: () => setSectionFrames(view.settings.sectionFrames) },
                  );
                }
              : undefined,
          onRename: boundary.data.section
            ? (name: string) =>
                applyOperations.mutate({
                  label: t("sections.updated"),
                  operations: [
                    boundary.data.boundaryId
                      ? {
                          op: "updateBoundary",
                          boundaryId: boundary.data.boundaryId,
                          data: { name },
                        }
                      : {
                          op: "updateElement",
                          elementId: String(boundary.data.elementId),
                          data: { name },
                        },
                  ],
                })
            : undefined,
          onResizePreview: boundary.data.section
            ? (frame: SectionFrame) =>
                setSectionFrames((current) => ({ ...current, [boundary.id]: frame }))
            : undefined,
          onResize:
            boundary.data.section && !placements.some((entry) => entry.locked)
              ? (frame: SectionFrame) => {
                  const next = { ...sectionFrames, [boundary.id]: frame };
                  setSectionFrames(next);
                  applyOperations.mutate(
                    {
                      label: t("sections.updated"),
                      operations: [
                        {
                          op: "updateView",
                          viewId: view.id,
                          data: { settings: { sectionFrames: next } },
                        },
                      ],
                    },
                    { onError: () => setSectionFrames(view.settings.sectionFrames) },
                  );
                }
              : undefined,
        },
      };
    });
    const transformed = new Set(expandedFrames.map((frame) => frame.id));
    return applyNodeColors(
      [...frames, ...expandedFrames, ...nodes.filter((node) => !transformed.has(node.id))].map(
        (node): FlowNode => {
          const className =
            scenarioStep?.elementId === node.id ? "ring-2 ring-primary rounded-lg" : undefined;
          if (node.type !== "annotation") return { ...node, className };
          return {
            ...node,
            className,
            data: {
              ...node.data,
              onEdit: () => setEditingAnnotationId(node.data.annotation.id),
              onResize: (frame: SectionFrame) =>
                applyOperations.mutate(
                  {
                    label: ta("updated"),
                    operations: [
                      {
                        op: "updateViewAnnotation",
                        viewId: view.id,
                        annotationId: node.data.annotation.id,
                        data: frame,
                      },
                    ],
                  },
                  { onError: () => invalidateWorkspace(workspaceId) },
                ),
            },
          };
        },
      ),
      view.settings.nodeColors,
    );
  }, [
    nodes,
    elementsById,
    boundaries,
    view.settings.showBoundaries,
    view.settings.boundaryLayer,
    view.elements,
    sectionFrames,
    applyOperations.mutate,
    t,
    view.id,
    view.scopeElementId,
    view.settings.sectionFrames,
    view.settings.nodeColors,
    ta,
    workspaceId,
    view.settings.showFullTitles,
    view.settings.showDescriptions,
    selection,
    expansion.expandedElementIds,
    scenarioStep,
  ]);

  const changeRelationshipPresentation = useCallback(
    (patches: ViewRelationshipPatch[]) => {
      return applyOperations
        .mutateAsync({
          label: t("relationshipPresentation.updated"),
          operations: [
            {
              op: "setViewRelationships",
              viewId: view.id,
              relationships: patches,
            },
          ],
        })
        .then(() =>
          queryClient.refetchQueries(
            { queryKey: queryKeys.view(view.id) },
            { cancelRefetch: false },
          ),
        )
        .then(() => undefined);
    },
    [applyOperations, t, view.id],
  );

  const editableEdges = useMemo(
    () =>
      edges.map((edge) => ({
        ...edge,
        style: {
          ...edge.style,
          opacity: scenarioStep
            ? edge.data?.relationshipIds?.includes(scenarioStep.relationshipId ?? "")
              ? 1
              : 0.25
            : edge.style?.opacity,
        },
        data: edge.data
          ? {
              ...edge.data,
              onControlPointsChange: (controlPoints: { x: number; y: number }[]) =>
                changeRelationshipPresentation(
                  (edge.data?.relationshipIds ?? [edge.data?.relationship.id as string]).map(
                    (relationshipId) => ({ relationshipId, controlPoints }),
                  ),
                ),
              onLabelOffsetChange: (
                _relationshipId: string,
                labelOffset: { x: number; y: number },
              ) =>
                changeRelationshipPresentation(
                  (edge.data?.relationshipIds ?? []).map((relationshipId) => ({
                    relationshipId,
                    presentation: { labelOffset },
                  })),
                ),
            }
          : undefined,
      })),
    [edges, changeRelationshipPresentation, scenarioStep],
  );

  return (
    <InlineExpansionContext.Provider
      value={{
        elements,
        enabled: !connectFrom,
        open: setPreviewElementId,
      }}
    >
      <div
        ref={canvasRef}
        className="relative h-full w-full"
        onDrop={onDrop}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
      >
        <ReactFlow
          nodes={allNodes}
          edges={editableEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onReconnect={(edge, connection) => {
            if (connection.source !== edge.source || connection.target !== edge.target) return;
            const relationshipId = relationshipIdOf(edge);
            void changeRelationshipPresentation([
              {
                relationshipId,
                presentation: {
                  sourceSide: sideFromHandle(connection.sourceHandle, "source"),
                  targetSide: sideFromHandle(connection.targetHandle, "target"),
                  sourceSlot: slotFromHandle(connection.sourceHandle),
                  targetSlot: slotFromHandle(connection.targetHandle),
                },
              },
            ]).catch(() => undefined);
          }}
          onSelectionChange={onSelectionChange}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={(event, node) => {
            if (
              connectFrom ||
              Date.now() < ignoreDetailsUntil.current ||
              event.ctrlKey ||
              event.metaKey ||
              event.altKey ||
              event.shiftKey ||
              (event.target as HTMLElement).closest(
                "button, input, textarea, a, .react-flow__handle",
              )
            )
              return;
            if (node.type === "annotation") {
              setEditingAnnotationId(node.data.annotation.id);
              return;
            }
            const elementId = node.type === "boundary" ? node.data.elementId : node.id;
            if (elementId) onOpenDetails(String(elementId));
          }}
          zoomOnDoubleClick={false}
          onNodeContextMenu={onNodeContextMenu}
          onEdgeContextMenu={onEdgeContextMenu}
          onPaneClick={() => {
            setMenu(null);
            clearSelection();
            setNodes((current) =>
              current.map((node) => (node.selected ? { ...node, selected: false } : node)),
            );
            setEdges((current) =>
              current.map((edge) => (edge.selected ? { ...edge, selected: false } : edge)),
            );
          }}
          onDelete={deleteSelection}
          selectionMode={SelectionMode.Partial}
          panOnDrag
          selectionKeyCode={primaryModifierKeyCode()}
          multiSelectionKeyCode={primaryModifierKeyCode()}
          // A selected boundary covers a large area. Keep the explicit graph
          // layering (boundaries < edges < elements) so cards remain clickable.
          elevateNodesOnSelect={false}
          snapToGrid={view.settings.snapToGrid}
          snapGrid={[16, 16]}
          minZoom={0.15}
          maxZoom={2.5}
          defaultViewport={initialViewport.current}
          fitView={!initialViewport.current}
          panOnScroll
          zoomOnScroll={false}
          zoomActivationKeyCode={["Meta", "Control"]}
          fitViewOptions={{ padding: CANVAS_FIT_PADDING, maxZoom: 1 }}
          proOptions={{ hideAttribution: false }}
          deleteKeyCode={["Delete", "Backspace"]}
        >
          <Panel position="top-left" className="z-40">
            <ScenarioPanel
              key={view.id}
              workspaceId={workspaceId}
              view={view}
              elements={elements}
              relationships={relationships}
              onStep={onScenarioStep}
            />
          </Panel>
          <CanvasComments
            key={view.id}
            workspaceId={workspaceId}
            view={view}
            canvasRef={canvasRef}
          />
          <Background
            variant={BackgroundVariant.Dots}
            gap={18}
            size={1}
            color="var(--canvas-dot)"
          />
          <Controls showInteractive={false} position="bottom-left" showFitView={false}>
            <ControlButton
              onClick={fit}
              aria-label={t("topbar.fitView")}
              title={t("topbar.fitView")}
            >
              <Maximize />
            </ControlButton>
          </Controls>
          <MiniMap
            pannable
            zoomable
            position="bottom-right"
            style={{ bottom: 96 }}
            nodeStrokeWidth={2}
            maskColor="transparent"
          />
        </ReactFlow>

        <SelectionColorToolbar
          workspaceId={workspaceId}
          view={view}
          nodes={allNodes}
          edges={editableEdges}
        >
          {typeElement && (
            <ElementTypePicker
              element={typeElement}
              elements={elements}
              disabled={applyOperations.isPending}
              onChange={(data) =>
                applyOperations.mutate({
                  label: t("elementTypes.changed"),
                  operations: [{ op: "updateElement", elementId: typeElement.id, data }],
                })
              }
            />
          )}
        </SelectionColorToolbar>
        {editingAnnotationId &&
          view.settings.annotations.find((item) => item.id === editingAnnotationId) && (
            <AnnotationEditor
              key={editingAnnotationId}
              annotation={
                view.settings.annotations.find(
                  (item) => item.id === editingAnnotationId,
                ) as ViewAnnotation
              }
              onClose={() => {
                setNodes((current) =>
                  current.map((node) => ({
                    ...node,
                    selected: node.id === annotationNodeId(editingAnnotationId),
                  })),
                );
                setEditingAnnotationId(null);
              }}
              onSave={async (data: UpdateViewAnnotationInput) => {
                await applyOperations.mutateAsync({
                  label: ta("updated"),
                  operations: [
                    {
                      op: "updateViewAnnotation",
                      viewId: view.id,
                      annotationId: editingAnnotationId,
                      data,
                    },
                  ],
                });
              }}
            />
          )}
        <CreationToolbar
          workspaceId={workspaceId}
          view={view}
          onCreateAnnotation={(kind) => {
            const bounds = canvasRef.current?.getBoundingClientRect();
            const position = bounds
              ? flow.screenToFlowPosition({
                  x: bounds.left + bounds.width / 2 - 140,
                  y: bounds.top + bounds.height / 2 - 60,
                })
              : { x: 0, y: 0 };
            const id = `annotation-${crypto.randomUUID().slice(0, 12)}`;
            applyOperations.mutate(
              {
                label: ta("created"),
                operations: [
                  {
                    op: "createViewAnnotation",
                    viewId: view.id,
                    data: {
                      id,
                      ...position,
                      width: kind === "table" ? 420 : 280,
                      height: kind === "note" ? 180 : 60,
                      ...(kind === "table"
                        ? {
                            kind,
                            cells: [
                              ["", "", ""],
                              ["", "", ""],
                            ],
                          }
                        : { kind, text: ta(kind === "text" ? "newText" : "newNote") }),
                    },
                  },
                ],
              },
              {
                onSuccess: () => {
                  select({ type: "annotation", id });
                  setEditingAnnotationId(id);
                },
              },
            );
          }}
          onCreateSection={() => {
            const bounds = canvasRef.current?.getBoundingClientRect();
            const point = bounds
              ? flow.screenToFlowPosition({
                  x: bounds.left + bounds.width / 2 - 180,
                  y: bounds.top + bounds.height / 2 - 120,
                })
              : { x: 0, y: 0 };
            const id = `section-${crypto.randomUUID().slice(0, 12)}`;
            const selectedIds =
              selection.type === "elements"
                ? selection.ids
                : selection.type === "element"
                  ? [selection.id]
                  : [];
            const selectedNodes = nodes.filter(
              (node) =>
                selectedIds.includes(node.id) || (node.type === "annotation" && node.selected),
            );
            const x = selectedNodes.length
              ? Math.min(...selectedNodes.map((node) => node.position.x)) - 28
              : point.x;
            const y = selectedNodes.length
              ? Math.min(...selectedNodes.map((node) => node.position.y)) - 64
              : point.y;
            const width = selectedNodes.length
              ? Math.max(
                  ...selectedNodes.map(
                    (node) => node.position.x + (node.measured?.width ?? NODE_WIDTH),
                  ),
                ) -
                x +
                28
              : 420;
            const height = selectedNodes.length
              ? Math.max(
                  ...selectedNodes.map(
                    (node) => node.position.y + (node.measured?.height ?? NODE_HEIGHT),
                  ),
                ) -
                y +
                28
              : 280;
            applyOperations.mutate(
              {
                label: t("sections.add"),
                operations: [
                  {
                    op: "createBoundary",
                    data: {
                      id,
                      viewId: view.id,
                      kind: "custom",
                      parentBoundaryId:
                        selection.type === "boundary" &&
                        boundaries.some(
                          (boundary) => boundary.id === selection.id && boundary.kind === "custom",
                        )
                          ? selection.id
                          : null,
                      layer: view.settings.boundaryLayer,
                      name: t("sections.newName"),
                      elementIds: selectedIds.filter((elementId) =>
                        view.elements.some((entry) => entry.elementId === elementId),
                      ),
                    },
                  },
                  ...nodes
                    .filter((node) => node.type === "annotation" && node.selected)
                    .map((node) => ({
                      op: "updateViewAnnotation" as const,
                      viewId: view.id,
                      annotationId: annotationId(node.id),
                      data: { sectionId: id },
                    })),
                  {
                    op: "updateView",
                    viewId: view.id,
                    data: {
                      settings: {
                        showBoundaries: true,
                        sectionFrames: {
                          ...sectionFrames,
                          [`boundary:${id}`]: { x, y, width, height },
                        },
                      },
                    },
                  },
                ],
              },
              { onSuccess: () => select({ type: "boundary", id }) },
            );
          }}
          getCreationPoint={() => {
            const bounds = canvasRef.current?.getBoundingClientRect();
            return bounds
              ? flow.screenToFlowPosition({
                  x: bounds.left + bounds.width / 2,
                  y: bounds.top + bounds.height / 2,
                })
              : { x: 0, y: 0 };
          }}
        />
        {graph.nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm font-medium">{t("canvas.empty")}</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              {t(
                tagFocus
                  ? "tagFocus.empty"
                  : statusOverlay === "liveOnly"
                    ? "statusOverlay.emptyHint"
                    : "canvas.emptyHint",
              )}
            </p>
          </div>
        )}

        {graph.hiddenCount > 0 && (
          <div className="pointer-events-none absolute right-3 top-16 rounded border border-border bg-background/80 px-2 py-1 text-[11px] text-muted-foreground">
            {t("canvas.hiddenElements", { count: graph.hiddenCount })}
          </div>
        )}

        {connectFrom && (
          <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] text-primary">
            {t("contextMenu.connect")}: {elementsById.get(connectFrom)?.name}
          </div>
        )}

        {menu && <NodeContextMenu {...menu} onClose={() => setMenu(null)} />}
      </div>
      {previewElementId && (
        <ExplorationPreview
          workspaceId={workspaceId}
          elementId={previewElementId}
          sourceView={view}
          elements={elements}
          relationships={relationships}
          records={records}
          statusOverlay={statusOverlay}
          onClose={() => setPreviewElementId(null)}
          onOpenDetails={onOpenDetails}
        />
      )}
    </InlineExpansionContext.Provider>
  );
}
