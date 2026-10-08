import { type NodeProps, NodeResizer } from "@xyflow/react";
import { GripVertical } from "lucide-react";
import { memo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
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
    data.classification === "public"
      ? "var(--ownership-external)"
      : data.classification === "private"
        ? "var(--ownership-internal)"
        : "var(--boundary)";

  return (
    <div
      className={cn(
        "as-node h-full w-full rounded-lg",
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
            : "flex h-9 items-center gap-2 border-b px-3 py-2 text-xs font-bold uppercase tracking-wider backdrop-blur-sm",
          draggable && "cursor-grab active:cursor-grabbing",
        )}
        title={draggable ? t("boundaries.moveGroupHint") : undefined}
        style={{
          borderColor: data.section
            ? undefined
            : `color-mix(in oklch, ${accent} 45%, var(--canvas))`,
          backgroundColor: data.section
            ? "var(--canvas)"
            : `color-mix(in oklch, ${accent} 34%, var(--canvas))`,
        }}
      >
        {draggable && <GripVertical className="h-3 w-3 shrink-0" aria-hidden="true" />}
        {!data.section && (
          <span
            className={cn(
              "h-2 w-2 rounded-sm",
              data.classification === "public" ? "bg-ownership-external" : "bg-ownership-internal",
            )}
          />
        )}
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
          <span className="text-foreground drop-shadow-sm">{data.name}</span>
        )}
        <span
          className={cn(
            "font-medium",
            data.section
              ? "text-muted-foreground"
              : data.classification === "public"
                ? "text-ownership-external"
                : "text-ownership-internal",
          )}
        >
          {data.section
            ? t("sections.title")
            : data.classification
              ? t(`boundaries.classification.${data.classification}`)
              : data.kind
                ? t(`kinds.${data.kind}`)
                : t(`boundaries.layer.${data.layer}`)}
        </span>
        {data.elementId && <InlineExpansionAction elementId={data.elementId} compact />}
        {data.elementId && <DetailViewAction elementId={data.elementId} compact />}
      </div>
    </div>
  );
}

export const BoundaryNode = memo(BoundaryNodeComponent);
