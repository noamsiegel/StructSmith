import type { ArchitectureElement, ControlPoint } from "@structsmith/contracts";
import { elementShape } from "@structsmith/domain";
import { type Node, useReactFlow, useViewport } from "@xyflow/react";
import { type PointerEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  type EndpointBox,
  type EndpointSide,
  snapAlignedBorderEndpoint,
  snapConnectorEndpoint,
} from "./endpointGeometry";

export interface ConnectorAttachment {
  elementId?: string;
  side: EndpointSide;
  fraction?: number;
  point: ControlPoint;
}

export function connectorBox(node: Node, position = node.position): EndpointBox | null {
  const element = node.data.element as ArchitectureElement | undefined;
  const elementId = element?.id ?? (node.data.elementId as string | undefined);
  if (!elementId || node.hidden) return null;
  return {
    id: elementId,
    ...position,
    width: node.measured?.width ?? node.width ?? 220,
    height: node.measured?.height ?? node.height ?? 96,
    shape: element ? elementShape(element) : "rectangle",
  };
}

export function ConnectorEndpointHandle({
  endpoint,
  point,
  side,
  displayPoint = point,
  oppositePoint,
  label,
  saving,
  onPreview,
  onSave,
}: {
  endpoint: "source" | "target";
  point: ControlPoint;
  side: EndpointSide;
  displayPoint?: ControlPoint;
  oppositePoint: ControlPoint;
  label: string;
  saving: boolean;
  onPreview: (attachment: ConnectorAttachment | null) => void;
  onSave: (attachment: ConnectorAttachment) => void;
}) {
  const { t } = useTranslation();
  const flow = useReactFlow();
  const { zoom } = useViewport();
  const drag = useRef<{
    start: ControlPoint;
    offset: ControlPoint;
    current: ConnectorAttachment;
  } | null>(null);
  const [attached, setAttached] = useState(false);
  const [alignment, setAlignment] = useState<ControlPoint | null>(null);
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    if (!drag.current) return;
    const pointer = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const canvasPoint = {
      x: pointer.x - drag.current.offset.x,
      y: pointer.y - drag.current.offset.y,
    };
    const boxes = flow.getNodes().flatMap((node) => {
      const internal = flow.getInternalNode(node.id);
      const box = connectorBox(node, internal?.internals.positionAbsolute);
      return box ? [box] : [];
    });
    const snap = snapConnectorEndpoint(boxes, canvasPoint, 18 / zoom);
    const box = boxes.find((candidate) => candidate.id === snap?.elementId);
    const aligned =
      snap && box
        ? snapAlignedBorderEndpoint(box, snap.side, snap.point, oppositePoint, 6 / zoom)
        : null;
    if (snap && aligned) Object.assign(snap, aligned);
    setAlignment(aligned?.point ?? null);
    drag.current.current = snap
      ? { elementId: snap.elementId, side: snap.side, fraction: snap.fraction, point: snap.point }
      : { point: canvasPoint, side };
    setAttached(Boolean(snap));
    onPreview(drag.current.current);
  };
  const cancel = () => {
    drag.current = null;
    setAttached(false);
    setAlignment(null);
    onPreview(null);
  };
  const display = drag.current
    ? { x: point.x + drag.current.offset.x, y: point.y + drag.current.offset.y }
    : displayPoint;
  return (
    <>
      {alignment && (
        <svg
          data-connection-alignment-guide="endpoint"
          aria-hidden="true"
          className="pointer-events-none absolute overflow-visible"
          width={1}
          height={1}
        >
          <path
            d={`M ${alignment.x},${alignment.y} L ${oppositePoint.x},${oppositePoint.y}`}
            stroke="var(--primary)"
            strokeWidth={1 / zoom}
            strokeDasharray={`${4 / zoom} ${4 / zoom}`}
          />
        </svg>
      )}
      {(display.x !== point.x || display.y !== point.y) && (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute overflow-visible"
          width={1}
          height={1}
        >
          <path
            d={`M ${point.x},${point.y} L ${display.x},${display.y}`}
            stroke="var(--primary)"
            strokeWidth={1 / zoom}
            strokeDasharray={`${2 / zoom} ${2 / zoom}`}
          />
        </svg>
      )}
      <Button
        variant="outline"
        data-connector-endpoint={endpoint}
        aria-label={t(
          `relationshipPresentation.move${endpoint === "source" ? "Source" : "Target"}`,
          {
            label,
          },
        )}
        title={t("relationshipPresentation.moveEndpointHint")}
        aria-busy={saving}
        disabled={saving}
        className="nodrag nopan pointer-events-auto absolute cursor-grab rounded-full border-0 bg-transparent p-0 hover:bg-transparent focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
        style={{
          transform: `translate(-50%, -50%) translate(${display.x}px, ${display.y}px)`,
          width: 28 / zoom,
          height: 28 / zoom,
          touchAction: "none",
        }}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => {
          if (saving || event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          const pointer = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
          drag.current = {
            start: point,
            offset: { x: pointer.x - point.x, y: pointer.y - point.y },
            current: { point, side },
          };
        }}
        onPointerMove={move}
        onPointerUp={(event) => {
          const gesture = drag.current;
          if (!gesture) return;
          event.stopPropagation();
          move(event);
          if (
            Math.hypot(
              gesture.current.point.x - gesture.start.x,
              gesture.current.point.y - gesture.start.y,
            ) >
            1 / zoom
          )
            onSave(gesture.current);
          else onPreview(null);
          drag.current = null;
          setAttached(false);
          setAlignment(null);
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={cancel}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            cancel();
          }
          const delta = {
            ArrowLeft: [-1, 0],
            ArrowRight: [1, 0],
            ArrowUp: [0, -1],
            ArrowDown: [0, 1],
          }[event.key];
          if (!delta || saving) return;
          event.preventDefault();
          event.stopPropagation();
          const step = event.shiftKey ? 10 : 1;
          onSave({
            point: { x: point.x + (delta[0] ?? 0) * step, y: point.y + (delta[1] ?? 0) * step },
            side,
          });
        }}
      >
        <span
          className="rounded-full border-primary"
          style={{
            width: 12 / zoom,
            height: 12 / zoom,
            borderWidth: 2 / zoom,
            backgroundColor: attached ? "var(--primary)" : "var(--card)",
          }}
        />
      </Button>
    </>
  );
}
