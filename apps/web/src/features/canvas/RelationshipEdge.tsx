import type { ControlPoint } from "@structsmith/contracts";
import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  useReactFlow,
} from "@xyflow/react";
import { memo, useId, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editor";
import type { RelationshipEdgeData } from "./graph";
import { manualRelationshipPath, relationshipDash } from "./relationshipGeometry";
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
  const bends = data?.placement?.controlPoints ?? [];
  const labelPosition = data?.placement?.labelPosition ?? 0.5;
  const [path, defaultX, defaultY] =
    bends.length > 0
      ? manualRelationshipPath(
          { x: sourceX, y: sourceY },
          { x: targetX, y: targetY },
          bends,
          labelPosition,
        )
      : data?.routing === "straight"
        ? getStraightPath(pathOptions)
        : data?.routing === "curved"
          ? getBezierPath(pathOptions)
          : getSmoothStepPath({ ...pathOptions, borderRadius: 8, offset: 24 });
  const geometryRef = useRef<SVGPathElement>(null);
  const [pathLabel, setPathLabel] = useState<ControlPoint | null>(null);
  useLayoutEffect(() => {
    const geometry = geometryRef.current;
    if (!path || !geometry || typeof geometry.getTotalLength !== "function") return;
    const point = geometry.getPointAtLength(geometry.getTotalLength() * labelPosition);
    setPathLabel({ x: point.x, y: point.y });
  }, [path, labelPosition]);
  const savedOffset = presentation?.labelOffset ?? { x: 0, y: 0 };
  const [dragOffset, setDragOffset] = useState<ControlPoint | null>(null);
  const pendingOffset = useRef<ControlPoint | null>(null);
  const drag = useRef<{ start: ControlPoint; offset: ControlPoint; current: ControlPoint } | null>(
    null,
  );
  const offset = dragOffset ?? savedOffset;
  const labelX = (pathLabel?.x ?? defaultX) + offset.x;
  const labelY = (pathLabel?.y ?? defaultY) + offset.y;
  const stroke =
    (data?.status ? statusColor(data.status) : presentation?.color) ??
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
  const showLabel =
    Boolean(label || data?.status === "conflict") &&
    (data?.showLabel !== false || selected || data?.status === "conflict");
  const editable = (data?.count ?? 0) === 1 && Boolean(data?.onLabelOffsetChange);
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
          opacity: focus === "dimmed" ? 0.7 : 1,
          filter: focus === "connected" ? "drop-shadow(0 0 3px var(--primary))" : undefined,
          transition: "stroke 150ms, stroke-width 150ms, opacity 150ms, filter 150ms",
        }}
      />
      {showLabel && (
        <EdgeLabelRenderer>
          <Button
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
              opacity: focus === "dimmed" ? 0.75 : 1,
              touchAction: "none",
              cursor: editable ? "grab" : "default",
              overflowWrap: "anywhere",
            }}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => {
              if (!editable || !data || event.button !== 0) return;
              event.stopPropagation();
              select({ type: "relationship", id: data.relationship.id });
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = {
                start: flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
                offset,
                current: offset,
              };
            }}
            onPointerMove={(event) => {
              if (!drag.current) return;
              const point = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
              const next = {
                x: drag.current.offset.x + point.x - drag.current.start.x,
                y: drag.current.offset.y + point.y - drag.current.start.y,
              };
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
              const current = pendingOffset.current ?? offset;
              const next = {
                x: current.x + (move[0] ?? 0) * step,
                y: current.y + (move[1] ?? 0) * step,
              };
              setDragOffset(next);
              saveOffset(next);
            }}
          >
            {label}
          </Button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const RelationshipEdge = memo(RelationshipEdgeComponent);
