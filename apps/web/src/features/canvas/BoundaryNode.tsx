import { type NodeProps, NodeResizer } from "@xyflow/react";
import { GripVertical, Scan } from "lucide-react";
import { memo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { iconFor } from "../icons";
import { DetailViewAction } from "../navigation/DetailNavigation";
import { InlineExpansionAction } from "../navigation/InlineExpansion";
import { ConnectionHandles } from "./ConnectionHandles";
import type { BoundaryNodeData } from "./graph";

/** A semantic boundary rendered from the live footprint of its visible members. */
function BoundaryNodeComponent({
  data,
  selected,
  draggable,
}: NodeProps & { data: BoundaryNodeData }) {
  const { t } = useTranslation();
  const cancelled = useRef(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(data.name);
  const commitName = () => {
    const value = name.trim();
    if (!cancelled.current && value && value !== data.name) data.onRename?.(value);
    cancelled.current = true;
    setEditing(false);
  };
  const accent =
    data.color ??
    (data.classification === "public"
      ? "var(--ownership-external)"
      : data.classification === "private"
        ? "var(--ownership-internal)"
        : "var(--boundary)");
  const Icon = iconFor(data.kind ?? "custom", null);

  return (
    <div
      onDoubleClick={(event) => {
        if (!data.section) return;
        event.stopPropagation();
        if (
          (event.target as HTMLElement).closest(
            "button, input, [role='button'], .react-flow__handle",
          )
        )
          return;
        event.preventDefault();
        data.onFit?.();
      }}
      className={cn(
        "as-node h-full w-full rounded-lg",
        data.elementId &&
          !selected &&
          "[&>[data-handlepos]]:opacity-0! [&:hover>[data-handlepos]]:opacity-100! [&:focus-within>[data-handlepos]]:opacity-100!",
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-canvas",
      )}
      style={{
        outline: selected ? "3px solid var(--primary)" : undefined,
        outlineOffset: selected ? 2 : undefined,
      }}
    >
      {data.section && data.onResize && (
        <NodeResizer
          minWidth={120}
          minHeight={80}
          isVisible={Boolean(selected)}
          onResize={(_event, params) => data.onResizePreview?.(params)}
          onResizeEnd={(_event, params) => data.onResize?.(params)}
        />
      )}
      {data.elementId && <ConnectionHandles />}
      <div
        className={cn(
          data.section
            ? "absolute -top-8 left-0 flex h-7 max-w-full items-center gap-1 rounded-md bg-canvas px-1 text-xs font-medium"
            : "flex h-9 min-w-0 items-center gap-2 rounded-t-lg border-b px-3 text-xs",
          draggable && "cursor-grab active:cursor-grabbing",
        )}
        title={draggable ? t("boundaries.moveGroupHint") : undefined}
        style={{
          borderColor: data.section
            ? undefined
            : `color-mix(in oklch, ${accent} 45%, var(--canvas))`,
          backgroundColor: data.section
            ? "var(--canvas)"
            : `color-mix(in oklch, ${accent} 12%, var(--canvas))`,
        }}
      >
        {draggable && <GripVertical className="h-3 w-3 shrink-0" aria-hidden="true" />}
        {data.elementId ? (
          <span
            role="img"
            aria-label={data.kind ? t(`kinds.${data.kind}`) : undefined}
            className="shrink-0 text-muted-foreground"
            title={data.kind ? t(`kinds.${data.kind}`) : undefined}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        ) : !data.section ? (
          <span
            className={cn(
              "h-2 w-2 shrink-0 rounded-sm",
              data.classification === "public" ? "bg-ownership-external" : "bg-ownership-internal",
            )}
          />
        ) : null}
        {data.section && editing ? (
          <Input
            autoFocus
            className="nodrag nopan h-7 min-w-0 flex-1 normal-case tracking-normal"
            aria-label={t("sections.rename")}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={commitName}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") commitName();
              if (event.key === "Escape") {
                cancelled.current = true;
                setName(data.name);
                setEditing(false);
              }
            }}
          />
        ) : data.section ? (
          <Button
            variant="ghost"
            className="nodrag nopan h-7 min-w-0 truncate px-1 normal-case tracking-normal"
            title={t("sections.rename")}
            onClick={() => {
              cancelled.current = false;
              setName(data.name);
              setEditing(true);
            }}
          >
            {data.name}
          </Button>
        ) : (
          <span className="min-w-0 flex-1 truncate font-semibold text-foreground" title={data.name}>
            {data.name}
          </span>
        )}
        {data.section ? (
          <span className="font-medium text-muted-foreground">{t("sections.title")}</span>
        ) : !data.elementId ? (
          <Badge variant="outline" className="shrink-0 normal-case tracking-normal">
            {data.classification
              ? t(`boundaries.classification.${data.classification}`)
              : data.kind
                ? t(`kinds.${data.kind}`)
                : t(`boundaries.layer.${data.layer}`)}
          </Badge>
        ) : null}
        {data.section && selected && (
          <Button
            type="button"
            variant="ghost"
            size="iconSm"
            className="nodrag nopan shrink-0"
            title={t("sections.fit")}
            aria-label={t("sections.fit")}
            disabled={!data.onFit}
            onClick={(event) => {
              event.stopPropagation();
              data.onFit?.();
            }}
          >
            <Scan className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        )}
        {data.elementId && (
          <div className="flex shrink-0 items-center gap-0.5 border-l border-border pl-1">
            <InlineExpansionAction elementId={data.elementId} compact />
            <DetailViewAction elementId={data.elementId} compact />
          </div>
        )}
      </div>
    </div>
  );
}

export const BoundaryNode = memo(BoundaryNodeComponent);
