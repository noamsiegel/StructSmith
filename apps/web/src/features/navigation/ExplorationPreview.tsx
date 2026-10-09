import type {
  ArchitectureElement,
  ArchitectureRecord,
  ArchitectureRelationship,
  ViewDetail,
} from "@structsmith/contracts";
import { canOpenElementDetails } from "@structsmith/domain";
import {
  Background,
  BackgroundVariant,
  ControlButton,
  Controls,
  getViewportForBounds,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import { ArrowLeft, ArrowUpRight, ChevronRight, Maximize, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useView, useViews } from "@/hooks/useApi";
import { AnnotationNode } from "../canvas/AnnotationNode";
import { BoundaryNode } from "../canvas/BoundaryNode";
import { commandWheelViewport } from "../canvas/commandWheel";
import { ElementNode } from "../canvas/ElementNode";
import {
  buildGraph,
  canvasFitBounds,
  computeCanvasBoundaries,
  type FlowEdge,
  type FlowNode,
} from "../canvas/graph";
import { LabelPlacementProvider } from "../canvas/LabelPlacement";
import { RelationshipEdge } from "../canvas/RelationshipEdge";
import { applyNodeColors } from "../canvas/selectionColors";
import type { StatusOverlay } from "../canvas/statusOverlay";
import { DetailNavigationContext } from "./DetailNavigation";
import { InlineExpansionContext } from "./InlineExpansion";
import { previewDestination, previewView } from "./preview";

const nodeTypes = { element: ElementNode, boundary: BoundaryNode, annotation: AnnotationNode };
const edgeTypes = { relationship: RelationshipEdge };

function PreviewCanvas({
  view,
  elements,
  relationships,
  records,
  statusOverlay,
  onDrill,
}: {
  view: ViewDetail;
  elements: readonly ArchitectureElement[];
  relationships: readonly ArchitectureRelationship[];
  records: readonly ArchitectureRecord[];
  statusOverlay: StatusOverlay;
  onDrill: (elementId: string) => void;
}) {
  const { t } = useTranslation();
  const flow = useReactFlow<FlowNode, FlowEdge>();
  const container = useRef<HTMLDivElement>(null);
  const graph = useMemo(() => {
    const graph = buildGraph({ view, elements, relationships, records, statusOverlay });
    const sources = graph.nodes.map((node) => ({
      id: node.id,
      ...node.position,
      width: node.width ?? 220,
      height: Number(node.data.minimumHeight ?? node.height ?? 96),
    }));
    const frames = computeCanvasBoundaries(
      sources,
      new Map(elements.map((element) => [element.id, element])),
      view.boundaries,
      view.settings.boundaryLayer,
      view.settings.showBoundaries,
      view.settings.sectionFrames,
      view.scopeElementId,
    );
    return {
      nodes: applyNodeColors(
        [...frames.semanticBoundaries, ...frames.parentBoundaries, ...graph.nodes].map(
          (node): FlowNode => {
            const readonlyNode = {
              ...node,
              draggable: false,
              selectable: false,
              connectable: false,
              deletable: false,
              selected: false,
              style:
                node.type === "boundary" && node.data.section
                  ? { ...node.style, pointerEvents: "none" as const }
                  : node.style,
            };
            return readonlyNode.type === "element"
              ? { ...readonlyNode, data: { ...readonlyNode.data, locked: false } }
              : readonlyNode;
          },
        ),
        view.settings.nodeColors,
      ),
      edges: graph.edges.map((edge) => ({
        ...edge,
        selectable: false,
        deletable: false,
        reconnectable: false,
        style: { ...edge.style, opacity: 1 },
      })),
    };
  }, [view, elements, relationships, records, statusOverlay]);

  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(graph.nodes);
  useEffect(() => setNodes(graph.nodes), [graph.nodes, setNodes]);
  const initialized =
    graph.nodes.length > 0 &&
    graph.nodes.every((node) => {
      if (node.type === "boundary") return true;
      const rendered = nodes.find((entry) => entry.id === node.id);
      return (rendered?.measured?.width ?? 0) > 0 && (rendered?.measured?.height ?? 0) > 0;
    });
  const fit = useCallback(() => {
    const canvas = container.current;
    if (!canvas) return;
    void flow.setViewport(
      getViewportForBounds(
        canvasFitBounds(flow.getNodes(), flow.getEdges()),
        canvas.clientWidth,
        canvas.clientHeight,
        0.05,
        1,
        0.15,
      ),
    );
  }, [flow]);
  useEffect(() => {
    if (initialized && flow.viewportInitialized) fit();
  }, [initialized, flow, fit]);

  useEffect(() => {
    const canvas = container.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.metaKey || event.ctrlKey) return;
      if (event.target instanceof Element && event.target.closest("button, .nowheel")) return;
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
    canvas.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => canvas.removeEventListener("wheel", onWheel, true);
  }, [flow]);

  return (
    <div
      ref={container}
      className="exploration-preview relative min-h-0 flex-1 bg-canvas"
      data-testid="exploration-preview-canvas"
    >
      <LabelPlacementProvider key={view.id} nodes={nodes}>
        <ReactFlow
          nodes={nodes}
          onNodesChange={onNodesChange}
          edges={graph.edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          nodesFocusable={false}
          edgesFocusable={false}
          edgesReconnectable={false}
          elementsSelectable={false}
          deleteKeyCode={null}
          selectionKeyCode={null}
          multiSelectionKeyCode={null}
          panOnDrag
          panOnScroll
          zoomOnScroll={false}
          zoomActivationKeyCode={["Meta", "Control"]}
          minZoom={0.05}
          maxZoom={2.5}
          onNodeClick={(_event, node) => {
            if (node.type === "annotation") return;
            const elementId = node.type === "boundary" ? node.data.elementId : node.id;
            if (typeof elementId === "string") onDrill(elementId);
          }}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
          <Controls showInteractive={false} showFitView={false}>
            <ControlButton
              onClick={fit}
              aria-label={t("topbar.fitView")}
              title={t("topbar.fitView")}
            >
              <Maximize />
            </ControlButton>
          </Controls>
        </ReactFlow>
      </LabelPlacementProvider>
      {!graph.nodes.length && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-sm text-muted-foreground">
          {t("navigation.previewEmpty")}
        </div>
      )}
    </div>
  );
}

export function ExplorationPreview({
  workspaceId,
  elementId,
  sourceView,
  elements,
  relationships,
  records,
  statusOverlay,
  onClose,
  onOpenDetails,
}: {
  workspaceId: string;
  elementId: string;
  sourceView: ViewDetail;
  elements: readonly ArchitectureElement[];
  relationships: readonly ArchitectureRelationship[];
  records: readonly ArchitectureRecord[];
  statusOverlay: StatusOverlay;
  onClose: () => void;
  onOpenDetails: (elementId: string) => void;
}) {
  const { t } = useTranslation();
  const views = useViews(workspaceId);
  const [trail, setTrail] = useState([{ elementId, source: sourceView }]);
  const current = trail[trail.length - 1] ?? trail[0];
  const scope = elements.find((element) => element.id === current?.elementId);
  const destination =
    scope && current && previewDestination(scope, views.data ?? [], current.source);
  const saved = useView(destination ? destination.id : null);
  const opener = useRef(document.activeElement);
  const view = useMemo(
    () =>
      scope && current && (!destination || saved.data)
        ? previewView(scope, current.source, elements, relationships, saved.data)
        : null,
    [scope, current, destination, saved.data, elements, relationships],
  );
  const drill = (id: string) => {
    const ancestorIndex = trail.findIndex((entry) => entry.elementId === id);
    if (ancestorIndex >= 0) {
      setTrail((trail) => trail.slice(0, ancestorIndex + 1));
      return;
    }
    const element = elements.find((item) => item.id === id);
    if (!view || !element || !canOpenElementDetails(element, elements, views.data ?? [], view.id))
      return;
    setTrail((trail) => [...trail, { elementId: id, source: view }]);
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        hideClose
        className="flex h-[88dvh] max-h-[960px] w-[calc(100vw-32px)] max-w-[1440px] flex-col gap-0 overflow-hidden p-0"
        onKeyDown={(event) => event.stopPropagation()}
        onEscapeKeyDown={(event) => event.stopPropagation()}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (opener.current instanceof HTMLElement) opener.current.focus();
        }}
      >
        <div className="flex flex-wrap items-start gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <nav
              aria-label={t("navigation.previewBreadcrumbs")}
              className="mb-2 flex items-center gap-1 overflow-x-auto text-xs"
            >
              <Button
                size="iconSm"
                variant="ghost"
                aria-label={t("navigation.back")}
                disabled={trail.length < 2}
                onClick={() => setTrail((trail) => trail.slice(0, -1))}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              {trail.map((entry, index) => (
                <span key={entry.elementId} className="flex shrink-0 items-center gap-1">
                  {index > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-current={index === trail.length - 1 ? "page" : undefined}
                    className="h-7 max-w-52 truncate px-2 text-xs"
                    title={elements.find((element) => element.id === entry.elementId)?.name}
                    onClick={() => setTrail((trail) => trail.slice(0, index + 1))}
                  >
                    {elements.find((element) => element.id === entry.elementId)?.name}
                  </Button>
                </span>
              ))}
            </nav>
            <DialogTitle className="whitespace-normal text-base leading-6 [overflow-wrap:anywhere]">
              {scope?.name ?? t("navigation.preview")}
            </DialogTitle>
            <DialogDescription className="mt-1">
              {t("navigation.previewDescription")}
            </DialogDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              disabled={!scope}
              onClick={() => {
                if (!scope) return;
                onClose();
                onOpenDetails(scope.id);
              }}
            >
              <ArrowUpRight className="h-3.5 w-3.5" />
              {t("navigation.openFullView")}
            </Button>
            <DialogClose asChild>
              <Button size="iconSm" variant="ghost" aria-label={t("common.close")}>
                <X className="h-4 w-4" />
              </Button>
            </DialogClose>
          </div>
        </div>
        {saved.isError || views.isError ? (
          <div
            role="alert"
            className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-sm"
          >
            <p>{t("navigation.previewError")}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void (views.isError ? views.refetch() : saved.refetch())}
            >
              {t("navigation.previewRetry")}
            </Button>
          </div>
        ) : view && !views.isPending ? (
          <InlineExpansionContext.Provider value={null}>
            <DetailNavigationContext.Provider
              value={{
                elements,
                views: views.data ?? [],
                currentViewId: view.id,
                enabled: true,
                openDetails: drill,
              }}
            >
              <ReactFlowProvider key={`${scope?.id}:${view.id}`}>
                <PreviewCanvas
                  view={view}
                  elements={elements}
                  relationships={relationships}
                  records={records}
                  statusOverlay={statusOverlay}
                  onDrill={drill}
                />
              </ReactFlowProvider>
            </DetailNavigationContext.Provider>
          </InlineExpansionContext.Provider>
        ) : (
          <div
            className="flex flex-1 items-center justify-center text-sm text-muted-foreground"
            role="status"
          >
            {t("common.loading")}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
