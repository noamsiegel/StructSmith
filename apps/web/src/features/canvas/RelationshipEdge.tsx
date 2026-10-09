import type { ControlPoint } from "@structsmith/contracts";
import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  getBezierPath,
  getStraightPath,
  useReactFlow,
  useViewport,
} from "@xyflow/react";
import {
  type CSSProperties,
  memo,
  type PointerEvent,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editor";
import {
  type ConnectorAttachment,
  ConnectorEndpointHandle,
  connectorBox,
} from "./ConnectorEndpointHandle";
import { borderEndpoint, type EndpointSide, snapAlignedBorderEndpoint } from "./endpointGeometry";
import type { FlowEdge, FlowNode, RelationshipEdgeData } from "./graph";
import { useConnectorLanes, useLabelPlacement, useRoutingObstacles } from "./LabelPlacement";
import { closestLabelRoutePoint } from "./labelClearance";
import { safeOrthogonalRoute } from "./orthogonalRouting";
import {
  closestRelationshipSegment,
  manualRelationshipPath,
  moveRelationshipSegment,
  orthogonalRelationshipBends,
  relationshipDash,
  sideFromHandle,
  slidingRelationshipLabel,
} from "./relationshipGeometry";
import { statusColor, statusStroke } from "./statusOverlay";

export type RelationshipFocus = "normal" | "connected" | "dimmed";
const EMPTY_BENDS: ControlPoint[] = [];

export function relationshipFocus(
  activeElementId: string | null,
  sourceElementId: string,
  targetElementId: string,
): RelationshipFocus {
  if (!activeElementId) return "normal";
  return activeElementId === sourceElementId || activeElementId === targetElementId
    ? "connected"
    : "dimmed";
}

export function relationshipLabelBackground(focus: RelationshipFocus): string {
  return focus === "connected"
    ? "color-mix(in oklch, var(--primary) 12%, var(--card))"
    : "var(--card)";
}

export function RelationshipArrow({
  endpoint,
  point,
  neighbour,
  arrow,
  stroke,
  zoom,
  opacity,
}: {
  endpoint: "source" | "target";
  point: ControlPoint;
  neighbour?: ControlPoint;
  arrow: "none" | "arrow" | "arrowclosed";
  stroke: string;
  zoom: number;
  opacity: CSSProperties["opacity"];
}) {
  if (arrow === "none") return null;
  const angle = neighbour
    ? (Math.atan2(point.y - neighbour.y, point.x - neighbour.x) * 180) / Math.PI
    : 0;
  const size = 10 / zoom;
  const path = `M ${-size},${-size / 2} L 0,0 L ${-size},${size / 2}${arrow === "arrowclosed" ? " Z" : ""}`;
  return (
    <svg
      data-connector-arrow={endpoint}
      aria-hidden="true"
      className="pointer-events-none absolute overflow-visible"
      width={1}
      height={1}
      style={{ transform: `translate(${point.x}px, ${point.y}px) rotate(${angle}deg)`, opacity }}
    >
      <path
        d={path}
        fill={arrow === "arrowclosed" ? stroke : "none"}
        stroke="var(--canvas)"
        strokeWidth={5 / zoom}
        strokeLinejoin="round"
      />
      <path
        d={path}
        fill={arrow === "arrowclosed" ? stroke : "none"}
        stroke={stroke}
        strokeWidth={1.5 / zoom}
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RelationshipEdgeComponent({
  id,
  source,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  target,
  data,
  style,
}: EdgeProps & { data?: RelationshipEdgeData }) {
  const { t } = useTranslation();
  const flow = useReactFlow<FlowNode, FlowEdge>();
  const obstacles = useRoutingObstacles();
  const { zoom } = useViewport();
  const markerId = `relationship-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const activeElementId = useEditorStore((state) =>
    state.selection.type === "element" ? state.selection.id : null,
  );
  const select = useEditorStore((state) => state.select);
  const [hovered, setHovered] = useState(false);
  const focus = hovered ? "connected" : relationshipFocus(activeElementId, source, target);
  const presentation = data?.placement?.presentation;
  const strokeStyle = data?.status ? statusStroke(data.status) : presentation?.strokeStyle;
  const sourceArrow = presentation?.sourceArrow ?? "none";
  const targetArrow = presentation?.targetArrow ?? "arrowclosed";
  const [endpointPreview, setEndpointPreview] = useState<
    Partial<Record<"source" | "target", ConnectorAttachment>>
  >({});
  const [endpointSaving, setEndpointSaving] = useState(false);
  const endpointAt = (
    endpoint: "source" | "target",
    fallback: ControlPoint,
    side: EndpointSide,
  ) => {
    const preview = endpointPreview[endpoint];
    if (preview) return preview;
    const freePoint = presentation?.[`${endpoint}Point`];
    if (freePoint) return { point: freePoint, side };
    const node = flow.getInternalNode(endpoint === "source" ? source : target);
    const box = node ? connectorBox(node, node.internals.positionAbsolute) : null;
    const fraction =
      presentation?.[`${endpoint}Fraction`] ??
      (presentation?.[`${endpoint}Slot`] !== undefined
        ? (1 + (presentation?.[`${endpoint}Slot`] ?? 1)) / 4
        : (data?.automaticAttachments?.[endpoint] ?? 0.5));
    return {
      point: box ? borderEndpoint(box, side, fraction) : fallback,
      side,
      elementId: endpoint === "source" ? source : target,
      fraction,
    };
  };
  let start = endpointAt("source", { x: sourceX, y: sourceY }, sourcePosition);
  let end = endpointAt("target", { x: targetX, y: targetY }, targetPosition);
  const axis = start.side === "left" || start.side === "right" ? "y" : "x";
  const facing = { left: "right", right: "left", top: "bottom", bottom: "top" }[start.side];
  if (
    (data?.routing ?? "orthogonal") === "orthogonal" &&
    end.side === facing &&
    !endpointPreview.source &&
    !endpointPreview.target
  ) {
    for (const endpoint of ["target", "source"] as const) {
      const attachment = endpoint === "target" ? end : start;
      const reference = endpoint === "target" ? start : end;
      if (!attachment.elementId) continue;
      const automatic =
        presentation?.[`${endpoint}Fraction`] === undefined &&
        presentation?.[`${endpoint}Slot`] === undefined;
      const tolerance = automatic ? 6 : 1e-6;
      if (Math.abs(attachment.point[axis] - reference.point[axis]) > tolerance) continue;
      const node = flow.getInternalNode(attachment.elementId);
      const box = node ? connectorBox(node, node.internals.positionAbsolute) : null;
      if (!box) continue;
      const occupied = flow.getEdges().flatMap((edge) => {
        if (edge.id === id || edge.hidden) return [];
        return (["source", "target"] as const).flatMap((other) => {
          const saved = edge.data?.placement?.presentation;
          const side =
            saved?.[`${other}Side`] ??
            sideFromHandle(other === "source" ? edge.sourceHandle : edge.targetHandle, other);
          if (
            edge[other] !== attachment.elementId ||
            side !== attachment.side ||
            saved?.[`${other}Point`]
          )
            return [];
          const fraction =
            saved?.[`${other}Fraction`] ??
            (saved?.[`${other}Slot`] !== undefined
              ? (1 + (saved?.[`${other}Slot`] ?? 1)) / 4
              : (edge.data?.automaticAttachments?.[other] ?? 0.5));
          return [
            {
              coordinate: borderEndpoint(box, attachment.side, fraction)[axis],
              automatic:
                saved?.[`${other}Fraction`] === undefined && saved?.[`${other}Slot`] === undefined,
            },
          ];
        });
      });
      const aligned = snapAlignedBorderEndpoint(
        box,
        attachment.side,
        attachment.point,
        reference.point,
        tolerance,
        occupied,
      );
      if (!aligned) continue;
      if (endpoint === "target") end = { ...end, ...aligned };
      else start = { ...start, ...aligned };
      break;
    }
  }
  const pathOptions = {
    sourceX: start.point.x,
    sourceY: start.point.y,
    targetX: end.point.x,
    targetY: end.point.y,
    sourcePosition: start.side as typeof sourcePosition,
    targetPosition: end.side as typeof targetPosition,
  };
  const saveEndpoint = (endpoint: "source" | "target", attachment: ConnectorAttachment) => {
    setEndpointSaving(true);
    void data
      ?.onEndpointChange?.(endpoint, attachment)
      .catch(() => undefined)
      .finally(() => {
        setEndpointPreview({});
        setEndpointSaving(false);
      });
  };
  const savedBends = data?.movementBends ?? data?.placement?.controlPoints ?? EMPTY_BENDS;
  const [routePreview, setRoutePreview] = useState<ControlPoint[] | null>(null);
  const [routeSaving, setRouteSaving] = useState(false);
  const routeDrag = useRef<{
    points: ControlPoint[];
    index: number;
    start: ControlPoint;
    delta: ControlPoint;
    current: ControlPoint[];
    keyboard: boolean;
  } | null>(null);
  const sourcePoint = start.point;
  const targetPoint = end.point;
  const orthogonal = (data?.routing ?? "orthogonal") === "orthogonal";
  const route = useMemo(() => {
    const from = {
      point: { x: start.point.x, y: start.point.y },
      side: start.side,
      elementId: start.elementId,
    };
    const to = {
      point: { x: end.point.x, y: end.point.y },
      side: end.side,
      elementId: end.elementId,
    };
    if (!orthogonal)
      return { points: [from.point, ...(routePreview ?? savedBends), to.point], blocked: false };
    const authoredBends = routePreview ?? savedBends;
    const uncheckedBends = authoredBends.length
      ? orthogonalRelationshipBends(
          from.point,
          to.point,
          from.side as typeof sourcePosition,
          to.side as typeof targetPosition,
          authoredBends,
        )
      : [];
    const boxes = obstacles.filter((box) => box.id !== from.elementId && box.id !== to.elementId);
    for (const endpoint of [from, to]) {
      if (!endpoint.elementId) continue;
      const node = flow.getInternalNode(endpoint.elementId);
      const box = node ? connectorBox(node, node.internals.positionAbsolute) : null;
      if (box) boxes.push(box);
    }
    return safeOrthogonalRoute(from, to, [from.point, ...uncheckedBends, to.point], boxes);
  }, [
    orthogonal,
    routePreview,
    savedBends,
    obstacles,
    start.point.x,
    start.point.y,
    start.side,
    start.elementId,
    end.point.x,
    end.point.y,
    end.side,
    end.elementId,
    flow,
  ]);
  const laneRequest = useMemo(
    () =>
      orthogonal && !route.blocked
        ? {
            source: {
              point: { x: start.point.x, y: start.point.y },
              side: start.side,
              elementId: start.elementId,
            },
            target: {
              point: { x: end.point.x, y: end.point.y },
              side: end.side,
              elementId: end.elementId,
            },
            points: route.points,
            obstacles,
            manual: savedBends.length > 0 || routePreview !== null || endpointSaving,
            createdAt: data?.relationship.createdAt ?? "",
          }
        : null,
    [
      orthogonal,
      route,
      start.point.x,
      start.point.y,
      start.side,
      start.elementId,
      end.point.x,
      end.point.y,
      end.side,
      end.elementId,
      obstacles,
      savedBends.length,
      routePreview,
      endpointSaving,
      data?.relationship.createdAt,
    ],
  );
  const lanePoints = useConnectorLanes(id, laneRequest);
  const routePoints = lanePoints ?? route.points;
  const bends = routePoints.slice(1, -1);
  const labelPosition = data?.placement?.labelPosition ?? 0.5;
  const [path, defaultX, defaultY] =
    bends.length > 0 || orthogonal
      ? manualRelationshipPath(sourcePoint, targetPoint, bends, labelPosition)
      : data?.routing === "straight"
        ? getStraightPath(pathOptions)
        : data?.routing === "curved"
          ? getBezierPath(pathOptions)
          : manualRelationshipPath(sourcePoint, targetPoint, bends, labelPosition);
  useLayoutEffect(() => {
    data?.onRouteRendered?.(routePoints);
  }, [data?.onRouteRendered, routePoints]);
  const routeEditable = Boolean(data?.onControlPointsChange);
  const cancelRoute = () => {
    routeDrag.current = null;
    setRoutePreview(null);
  };
  const finishRoute = () => {
    const gesture = routeDrag.current;
    if (!gesture) return;
    routeDrag.current = null;
    if (JSON.stringify(gesture.current) === JSON.stringify(gesture.points.slice(1, -1))) {
      setRoutePreview(null);
      return;
    }
    setRouteSaving(true);
    void data
      ?.onControlPointsChange?.(
        moveRelationshipSegment(
          gesture.points,
          gesture.index,
          gesture.delta,
          orthogonal ? savedBends : undefined,
        ),
      )
      .catch(() => undefined)
      .finally(() => {
        setRoutePreview(null);
        setRouteSaving(false);
      });
  };
  const beginRoute = (event: PointerEvent<HTMLElement | SVGElement>, index: number) => {
    if (!routeEditable || routeSaving || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    document.getElementById(`${markerId}-segment-${index}`)?.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    routeDrag.current = {
      points: routePoints,
      index,
      start: flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
      delta: { x: 0, y: 0 },
      current: routePoints.slice(1, -1),
      keyboard: false,
    };
  };
  const moveRoute = (event: PointerEvent<HTMLElement | SVGElement>) => {
    const gesture = routeDrag.current;
    if (!gesture || gesture.keyboard) return;
    const point = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    gesture.delta = { x: point.x - gesture.start.x, y: point.y - gesture.start.y };
    gesture.current = moveRelationshipSegment(gesture.points, gesture.index, gesture.delta);
    setRoutePreview(gesture.current);
  };
  const endRoute = (event: PointerEvent<HTMLElement | SVGElement>) => {
    if (!routeDrag.current || routeDrag.current.keyboard) return;
    event.stopPropagation();
    finishRoute();
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const geometryRef = useRef<SVGPathElement>(null);
  const [pathLabel, setPathLabel] = useState<ControlPoint | null>(null);
  const [curveHandle, setCurveHandle] = useState<ControlPoint | null>(null);
  const [curvePoints, setCurvePoints] = useState<ControlPoint[]>([]);
  useLayoutEffect(() => {
    const geometry = geometryRef.current;
    if (!path || !geometry || typeof geometry.getTotalLength !== "function") return;
    const point = geometry.getPointAtLength(geometry.getTotalLength() * labelPosition);
    setPathLabel({ x: point.x, y: point.y });
    if (data?.routing === "curved" && savedBends.length === 0) {
      const handle = geometry.getPointAtLength(geometry.getTotalLength() * 0.25);
      setCurveHandle({ x: handle.x, y: handle.y });
      setCurvePoints(
        Array.from({ length: 65 }, (_, index) => {
          const sample = geometry.getPointAtLength((geometry.getTotalLength() * index) / 64);
          return { x: sample.x, y: sample.y };
        }),
      );
    }
  }, [path, labelPosition, data?.routing, savedBends.length]);
  const savedOffset = presentation?.labelOffset ?? { x: 0, y: 0 };
  const [dragOffset, setDragOffset] = useState<ControlPoint | null>(null);
  const pendingOffset = useRef<ControlPoint | null>(null);
  const drag = useRef<{ start: ControlPoint; offset: ControlPoint; current: ControlPoint } | null>(
    null,
  );
  const offset = dragOffset ?? savedOffset;
  const curved = data?.routing === "curved" && bends.length === 0;
  const [, polylineX, polylineY] = manualRelationshipPath(
    sourcePoint,
    targetPoint,
    routePoints.slice(1, -1),
    labelPosition,
  );
  const labelRoute = curved ? curvePoints : routePoints;
  const labelAnchor = curved
    ? (pathLabel ?? { x: defaultX, y: defaultY })
    : { x: polylineX, y: polylineY };
  const baseLabel = slidingRelationshipLabel(labelRoute, labelAnchor, 0, curved);
  const labelPoint = slidingRelationshipLabel(labelRoute, labelAnchor, offset.x, curved, offset.y);
  const snapOffset = (next: ControlPoint): ControlPoint => {
    const point = slidingRelationshipLabel(labelRoute, labelAnchor, next.x, curved, next.y);
    return { x: point.x - baseLabel.x, y: point.y - baseLabel.y };
  };
  const stroke = route.blocked
    ? "var(--destructive)"
    : (presentation?.color ??
      (data?.status ? statusColor(data.status) : undefined) ??
      (selected || focus === "connected" ? "var(--primary)" : "var(--edge)"));
  const width =
    presentation?.strokeWidth ??
    (selected ? 2 : focus === "connected" ? 2.4 : data?.implied ? 1.1 : 1.4);
  const originalLabel =
    data?.implied && (data?.count ?? 0) > 1 ? `${data.label} (${data.count})` : (data?.label ?? "");
  const label = route.blocked
    ? `${t("canvas.blockedRoute")}${originalLabel ? ` · ${originalLabel}` : ""}`
    : data?.status === "conflict"
      ? `${t("statusOverlay.conflict")}${originalLabel ? ` · ${originalLabel}` : ""}`
      : originalLabel;
  const showLabel = Boolean(label);
  const labelRef = useRef<HTMLButtonElement>(null);
  const [labelSize, setLabelSize] = useState({ width: 170, height: 32 });
  useLayoutEffect(() => {
    const button = labelRef.current;
    if (!showLabel || !button) return;
    const measure = () => {
      const width = button.offsetWidth;
      const height = button.offsetHeight;
      setLabelSize((previous) =>
        previous.width === width && previous.height === height ? previous : { width, height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(button);
    return () => observer.disconnect();
  }, [showLabel]);
  const request = useMemo(
    () => ({
      points: labelRoute,
      desired: labelPoint,
      ...labelSize,
      showLabel,
      obstacles: [sourcePoint, targetPoint].map((point) => ({
        x: point.x - 14 / zoom,
        y: point.y - 14 / zoom,
        width: 28 / zoom,
        height: 28 / zoom,
      })),
    }),
    [showLabel, labelRoute, labelPoint, labelSize, sourcePoint, targetPoint, zoom],
  );
  const placement = useLabelPlacement(id, request);
  const clearPoint = placement.point ?? labelPoint;
  const labelX = clearPoint.x;
  const labelY = clearPoint.y;
  const leaderAnchor = closestLabelRoutePoint(labelRoute, clearPoint);
  const leader = Math.hypot(labelX - leaderAnchor.x, labelY - leaderAnchor.y) > 0.5;
  const editable = Boolean(data?.onLabelOffsetChange);
  const labelSaves = useRef<Promise<void>>(Promise.resolve());
  const labelSaveSequence = useRef(0);
  const saveOffset = (next: ControlPoint) => {
    if (!data || !editable) return;
    pendingOffset.current = next;
    const sequence = ++labelSaveSequence.current;
    labelSaves.current = labelSaves.current
      .then(() => data.onLabelOffsetChange?.(data.relationship.id, next))
      .catch(() => undefined)
      .finally(() => {
        if (sequence === labelSaveSequence.current) {
          pendingOffset.current = null;
          setDragOffset(null);
        }
      });
  };

  return (
    <>
      <path ref={geometryRef} d={path} fill="none" stroke="none" pointerEvents="none" />
      <g
        data-routing-blocked={route.blocked || undefined}
        data-connector-highlighted={hovered || undefined}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onPointerDown={(event) => {
          if (!selected) return;
          const point = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
          beginRoute(event, closestRelationshipSegment(routePoints, point));
        }}
        onPointerMove={moveRoute}
        onPointerUp={endRoute}
        onPointerCancel={cancelRoute}
      >
        {route.blocked && <title>{t("canvas.blockedRouteHint")}</title>}
        <BaseEdge
          id={id}
          path={path}
          style={{
            strokeWidth: hovered ? Math.max(width, 2.8) : width,
            strokeDasharray: route.blocked
              ? "5 4"
              : relationshipDash(data?.relationship.interactionStyle, strokeStyle),
            strokeLinecap: strokeStyle === "dotted" ? "round" : undefined,
            stroke,
            opacity: style?.opacity ?? (focus === "dimmed" ? 0.7 : 1),
            filter: focus === "connected" ? "drop-shadow(0 0 3px var(--primary))" : undefined,
            transition: "stroke 150ms, stroke-width 150ms, opacity 150ms, filter 150ms",
          }}
        />
      </g>
      <EdgeLabelRenderer>
        {(["source", "target"] as const).map((endpoint) => {
          const attachment = endpoint === "source" ? start : end;
          const arrow = endpoint === "source" ? sourceArrow : targetArrow;
          const point = attachment.point;
          const tangentPoints = curved && curvePoints.length > 1 ? curvePoints : routePoints;
          const neighbour = endpoint === "source" ? tangentPoints[1] : tangentPoints.at(-2);
          return (
            <RelationshipArrow
              key={endpoint}
              endpoint={endpoint}
              point={point}
              neighbour={neighbour}
              arrow={arrow}
              stroke={stroke}
              zoom={zoom}
              opacity={style?.opacity ?? (focus === "dimmed" ? 0.7 : 1)}
            />
          );
        })}
        {selected &&
          data?.onEndpointChange &&
          (["source", "target"] as const).map((endpoint) => {
            const attachment = endpoint === "source" ? start : end;
            return (
              <ConnectorEndpointHandle
                oppositePoint={endpoint === "source" ? targetPoint : sourcePoint}
                key={endpoint}
                endpoint={endpoint}
                point={attachment.point}
                displayPoint={
                  Math.hypot(start.point.x - end.point.x, start.point.y - end.point.y) * zoom < 40
                    ? Math.abs(start.point.x - end.point.x) >= Math.abs(start.point.y - end.point.y)
                      ? {
                          x: attachment.point.x,
                          y: attachment.point.y + (endpoint === "source" ? -18 : 18) / zoom,
                        }
                      : {
                          x: attachment.point.x + (endpoint === "source" ? -18 : 18) / zoom,
                          y: attachment.point.y,
                        }
                    : attachment.point
                }
                side={attachment.side}
                label={originalLabel}
                saving={endpointSaving}
                onPreview={(next) =>
                  setEndpointPreview((previous) => {
                    const updated = { ...previous };
                    if (next) updated[endpoint] = next;
                    else delete updated[endpoint];
                    return updated;
                  })
                }
                onSave={(next) => saveEndpoint(endpoint, next)}
              />
            );
          })}
      </EdgeLabelRenderer>
      {showLabel && leader && (
        <>
          <defs>
            <mask
              id={`${markerId}-leader-mask`}
              maskUnits="userSpaceOnUse"
              x={Math.min(leaderAnchor.x, labelX) - 2}
              y={Math.min(leaderAnchor.y, labelY) - 2}
              width={Math.abs(labelX - leaderAnchor.x) + 4}
              height={Math.abs(labelY - leaderAnchor.y) + 4}
            >
              <rect
                x={Math.min(leaderAnchor.x, labelX) - 2}
                y={Math.min(leaderAnchor.y, labelY) - 2}
                width={Math.abs(labelX - leaderAnchor.x) + 4}
                height={Math.abs(labelY - leaderAnchor.y) + 4}
                fill="white"
              />
              <path
                d={placement.headers
                  .map(
                    (header) =>
                      `M ${header.x},${header.y} h ${header.width} v ${header.height} h ${-header.width} Z`,
                  )
                  .join(" ")}
                fill="black"
              />
            </mask>
          </defs>
          <path
            d={`M ${leaderAnchor.x},${leaderAnchor.y} L ${labelX},${leaderAnchor.y} L ${labelX},${labelY}`}
            fill="none"
            stroke={stroke}
            strokeWidth="1"
            strokeDasharray="2 3"
            pointerEvents="none"
            data-label-leader={id}
            mask={`url(#${markerId}-leader-mask)`}
          />
        </>
      )}
      {showLabel && (
        <EdgeLabelRenderer>
          <Button
            ref={labelRef}
            data-relationship-label={id}
            onPointerEnter={() => setHovered(true)}
            onPointerLeave={() => setHovered(false)}
            onFocus={() => setHovered(true)}
            onBlur={() => setHovered(false)}
            type="button"
            variant="outline"
            aria-label={t("relationshipPresentation.moveLabel", { label })}
            aria-busy={pendingOffset.current !== null}
            title={t("relationshipPresentation.moveLabelHint")}
            disabled={!editable}
            className={cn(
              "nodrag nopan pointer-events-auto absolute h-auto max-w-[170px] whitespace-normal rounded px-1.5 py-0.5 text-center text-[10px] font-medium leading-[1.3] shadow-sm disabled:opacity-100",
              focus === "connected"
                ? "border-primary/70 text-foreground"
                : "border-border text-foreground",
            )}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              backgroundColor: relationshipLabelBackground(focus),
              opacity: 1,
              touchAction: "none",
              cursor: editable ? "grab" : "default",
              overflowWrap: "anywhere",
            }}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => {
              if (!editable || !data || event.button !== 0) return;
              event.stopPropagation();
              if ((data.count ?? 0) === 1)
                select({ type: "relationship", id: data.relationship.id });
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = {
                start: flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
                offset: snapOffset({ x: labelX - baseLabel.x, y: labelY - baseLabel.y }),
                current: snapOffset({ x: labelX - baseLabel.x, y: labelY - baseLabel.y }),
              };
            }}
            onPointerMove={(event) => {
              if (!drag.current) return;
              const point = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
              const next = snapOffset({
                x: drag.current.offset.x + point.x - drag.current.start.x,
                y: drag.current.offset.y + point.y - drag.current.start.y,
              });
              drag.current.current = next;
              setDragOffset(next);
            }}
            onPointerUp={(event) => {
              if (!drag.current) return;
              event.stopPropagation();
              const next = drag.current.current;
              if (next.x !== drag.current.offset.x || next.y !== drag.current.offset.y)
                saveOffset(next);
              drag.current = null;
              if (next.x === savedOffset.x && next.y === savedOffset.y) setDragOffset(null);
              event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={() => {
              drag.current = null;
              setDragOffset(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape" && drag.current) {
                event.preventDefault();
                event.stopPropagation();
                drag.current = null;
                setDragOffset(null);
                return;
              }
              const move = {
                ArrowLeft: [-1, 0],
                ArrowRight: [1, 0],
                ArrowUp: [0, -1],
                ArrowDown: [0, 1],
              }[event.key];
              if (!move || !editable) return;
              event.preventDefault();
              event.stopPropagation();
              const step = event.shiftKey ? 10 : 1;
              const current = pendingOffset.current ?? {
                x: labelX - baseLabel.x,
                y: labelY - baseLabel.y,
              };
              const next = snapOffset({
                x: current.x + (move[0] ?? 0) * step,
                y: current.y + (move[1] ?? 0) * step,
              });
              if (next.x === current.x && next.y === current.y) return;
              setDragOffset(next);
              saveOffset(next);
            }}
          >
            {label}
          </Button>
        </EdgeLabelRenderer>
      )}

      {selected && routeEditable && (
        <EdgeLabelRenderer>
          {(routeDrag.current?.points ?? routePoints).slice(0, -1).map((start, index) => {
            const end = (routeDrag.current?.points ?? routePoints)[index + 1] as ControlPoint;
            if (
              Math.hypot(end.x - start.x, end.y - start.y) * zoom < 48 ||
              (routeDrag.current && routeDrag.current.index !== index)
            )
              return null;
            const activePoints = [
              sourcePoint,
              ...(routeDrag.current?.current ?? bends),
              targetPoint,
            ];
            const activeIndex =
              index === 0 &&
              routeDrag.current &&
              routeDrag.current.current.length > routeDrag.current.points.length - 2
                ? 1
                : index;
            const from = routeDrag.current ? (activePoints[activeIndex] as ControlPoint) : start;
            const to = routeDrag.current ? (activePoints[activeIndex + 1] as ControlPoint) : end;
            const point =
              data?.routing === "curved" && bends.length === 0 && !routeDrag.current
                ? (curveHandle ?? { x: defaultX, y: defaultY })
                : { x: from.x + (to.x - from.x) * 0.25, y: from.y + (to.y - from.y) * 0.25 };
            return (
              <Button
                // biome-ignore lint/suspicious/noArrayIndexKey: Segment identity must survive its coordinates changing during drag.
                key={index}
                id={`${markerId}-segment-${index}`}
                type="button"
                variant="outline"
                aria-label={t("relationshipPresentation.moveSegment", { index: index + 1, label })}
                aria-busy={routeSaving}
                title={t("relationshipPresentation.moveSegmentHint")}
                disabled={routeSaving}
                className="nodrag nopan pointer-events-auto absolute h-6 w-6 cursor-grab rounded-full border-2 border-primary bg-card p-0 shadow-sm focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
                style={{
                  transform: `translate(-50%, -50%) translate(${point.x}px, ${point.y}px)`,
                  touchAction: "none",
                }}
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => beginRoute(event, index)}
                onPointerMove={moveRoute}
                onPointerUp={endRoute}
                onPointerCancel={cancelRoute}
                onKeyDown={(event) => {
                  if (event.key === "Escape" && routeDrag.current) {
                    event.preventDefault();
                    event.stopPropagation();
                    cancelRoute();
                    return;
                  }
                  const move = {
                    ArrowLeft: [-1, 0],
                    ArrowRight: [1, 0],
                    ArrowUp: [0, -1],
                    ArrowDown: [0, 1],
                  }[event.key];
                  if (!move || routeSaving) return;
                  event.preventDefault();
                  event.stopPropagation();
                  routeDrag.current ??= {
                    points: routePoints,
                    index,
                    start: point,
                    delta: { x: 0, y: 0 },
                    current: routePoints.slice(1, -1),
                    keyboard: true,
                  };
                  const gesture = routeDrag.current;
                  if (!gesture.keyboard) return;
                  const step = event.shiftKey ? 10 : 1;
                  gesture.delta = {
                    x: gesture.delta.x + (move[0] ?? 0) * step,
                    y: gesture.delta.y + (move[1] ?? 0) * step,
                  };
                  gesture.current = moveRelationshipSegment(
                    gesture.points,
                    gesture.index,
                    gesture.delta,
                  );
                  setRoutePreview(gesture.current);
                }}
                onKeyUp={(event) => {
                  if (!event.key.startsWith("Arrow") || !routeDrag.current?.keyboard) return;
                  event.preventDefault();
                  event.stopPropagation();
                  finishRoute();
                }}
                onBlur={() => {
                  if (routeDrag.current?.keyboard) finishRoute();
                }}
              />
            );
          })}
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const RelationshipEdge = memo(RelationshipEdgeComponent);
