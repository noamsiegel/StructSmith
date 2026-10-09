import type { ControlPoint } from "@structsmith/contracts";
import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  getBezierPath,
  getStraightPath,
  useReactFlow,
} from "@xyflow/react";
import { memo, type PointerEvent, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editor";
import type { RelationshipEdgeData } from "./graph";
import { useLabelPlacement } from "./LabelPlacement";
import { closestLabelRoutePoint } from "./labelClearance";
import {
  closestRelationshipSegment,
  manualRelationshipPath,
  moveRelationshipSegment,
  orthogonalRelationshipBends,
  relationshipDash,
  slidingRelationshipLabel,
} from "./relationshipGeometry";
import { statusColor, statusStroke } from "./statusOverlay";

export type RelationshipFocus = "normal" | "connected" | "dimmed";

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
  const flow = useReactFlow();
  const markerId = `relationship-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const activeElementId = useEditorStore((state) =>
    state.selection.type === "element" ? state.selection.id : null,
  );
  const select = useEditorStore((state) => state.select);
  const focus = relationshipFocus(activeElementId, source, target);
  const presentation = data?.placement?.presentation;
  const strokeStyle = data?.status ? statusStroke(data.status) : presentation?.strokeStyle;
  const sourceArrow = presentation?.sourceArrow ?? "none";
  const targetArrow = presentation?.targetArrow ?? "arrowclosed";
  const pathOptions = { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition };
  const savedBends = data?.movementBends ?? data?.placement?.controlPoints ?? [];
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
  const sourcePoint = { x: sourceX, y: sourceY };
  const targetPoint = { x: targetX, y: targetY };
  const orthogonal = (data?.routing ?? "orthogonal") === "orthogonal";
  const bends = orthogonal
    ? orthogonalRelationshipBends(
        sourcePoint,
        targetPoint,
        sourcePosition,
        targetPosition,
        routePreview ?? savedBends,
      )
    : (routePreview ?? savedBends);
  const labelPosition = data?.placement?.labelPosition ?? 0.5;
  const [path, defaultX, defaultY] =
    bends.length > 0 || orthogonal
      ? manualRelationshipPath(sourcePoint, targetPoint, bends, labelPosition)
      : data?.routing === "straight"
        ? getStraightPath(pathOptions)
        : data?.routing === "curved"
          ? getBezierPath(pathOptions)
          : manualRelationshipPath(sourcePoint, targetPoint, bends, labelPosition);
  const routePoints = [sourcePoint, ...bends, targetPoint];
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
      ?.onControlPointsChange?.(gesture.current)
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
  const stroke =
    presentation?.color ??
    (data?.status ? statusColor(data.status) : undefined) ??
    (selected || focus === "connected" ? "var(--primary)" : "var(--edge)");
  const width =
    presentation?.strokeWidth ??
    (selected ? 2 : focus === "connected" ? 2.4 : data?.implied ? 1.1 : 1.4);
  const originalLabel =
    data?.implied && (data?.count ?? 0) > 1 ? `${data.label} (${data.count})` : (data?.label ?? "");
  const label =
    data?.status === "conflict"
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
    () => (showLabel ? { points: labelRoute, desired: labelPoint, ...labelSize } : null),
    [showLabel, labelRoute, labelPoint, labelSize],
  );
  const clearPoint = useLabelPlacement(id, request) ?? labelPoint;
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
      <defs>
        {[sourceArrow, targetArrow].map((arrow, index) =>
          arrow === "none" ? null : (
            <marker
              key={index === 0 ? "source" : "target"}
              id={`${markerId}-${index}`}
              markerWidth="12"
              markerHeight="12"
              viewBox="0 0 12 12"
              refX="10"
              refY="6"
              orient="auto-start-reverse"
              markerUnits="userSpaceOnUse"
            >
              <path
                d={arrow === "arrow" ? "M 2 2 L 10 6 L 2 10" : "M 2 2 L 10 6 L 2 10 Z"}
                fill={arrow === "arrow" ? "none" : stroke}
                stroke={stroke}
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </marker>
          ),
        )}
      </defs>
      <path ref={geometryRef} d={path} fill="none" stroke="none" pointerEvents="none" />
      <g
        onPointerDown={(event) => {
          if (!selected) return;
          const point = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
          beginRoute(event, closestRelationshipSegment(routePoints, point));
        }}
        onPointerMove={moveRoute}
        onPointerUp={endRoute}
        onPointerCancel={cancelRoute}
      >
        <BaseEdge
          id={id}
          path={path}
          markerStart={sourceArrow === "none" ? undefined : `url(#${markerId}-0)`}
          markerEnd={targetArrow === "none" ? undefined : `url(#${markerId}-1)`}
          style={{
            strokeWidth: width,
            strokeDasharray: relationshipDash(data?.relationship.interactionStyle, strokeStyle),
            strokeLinecap: strokeStyle === "dotted" ? "round" : undefined,
            stroke,
            opacity: style?.opacity ?? (focus === "dimmed" ? 0.7 : 1),
            filter: focus === "connected" ? "drop-shadow(0 0 3px var(--primary))" : undefined,
            transition: "stroke 150ms, stroke-width 150ms, opacity 150ms, filter 150ms",
          }}
        />
      </g>
      {showLabel && leader && (
        <path
          d={`M ${leaderAnchor.x},${leaderAnchor.y} L ${labelX},${leaderAnchor.y} L ${labelX},${labelY}`}
          fill="none"
          stroke={stroke}
          strokeWidth="1"
          strokeDasharray="2 3"
          pointerEvents="none"
          data-label-leader={id}
        />
      )}
      {showLabel && (
        <EdgeLabelRenderer>
          <Button
            ref={labelRef}
            data-relationship-label={id}
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
              Math.hypot(end.x - start.x, end.y - start.y) < 1 ||
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
