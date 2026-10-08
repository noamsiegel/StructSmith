import { DEFAULT_NODE_WIDTH, elementShape } from "@structsmith/domain";
import type { NodeProps } from "@xyflow/react";
import { AlertTriangle, Lock } from "lucide-react";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { iconFor } from "../icons";
import { DetailViewAction } from "../navigation/DetailNavigation";
import { InlineExpansionAction } from "../navigation/InlineExpansion";
import { ConnectionHandles } from "./ConnectionHandles";
import type { ElementNodeData } from "./graph";
import { NodeSilhouette } from "./NodeSilhouette";
import { statusColor } from "./statusOverlay";

/** Custom node (spec §33) — icon, name, technology and a small kind/role badge. */
function ElementNodeComponent({
  data,
  selected,
  width,
  height,
}: NodeProps & { data: ElementNodeData }) {
  const { t } = useTranslation();
  const { element, severity, locked, showDescriptions, minimumHeight } = data;
  const Icon = iconFor(element.kind, element.role);
  const workflow = [
    "workflowGroup",
    "action",
    "decision",
    "outcome",
    "data",
    "document",
    "start",
    "end",
    "fork",
    "join",
    "merge",
  ].includes(element.kind);
  const shape = elementShape(element);
  const diamond = shape === "diamond";
  const control = shape === "start" || shape === "end" || shape === "bar" ? shape : undefined;
  const stroke =
    data.color ??
    (data.status
      ? statusColor(data.status)
      : `var(--node-${element.external ? "external" : "internal"}-border)`);
  const fill = data.color
    ? `color-mix(in srgb, ${data.color} 16%, var(--card))`
    : `var(--node-${element.external ? "external" : "internal"})`;

  const badge = [t(`kinds.${element.kind}`), element.role ? t(`roles.${element.role}`) : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      style={{
        minHeight: minimumHeight,
        outline: "none",
      }}
      className="as-node group relative flex w-full overflow-visible"
    >
      <NodeSilhouette
        shape={shape}
        width={width ?? DEFAULT_NODE_WIDTH}
        height={height ?? minimumHeight}
        fill={fill}
        stroke={stroke}
        selected={selected}
        external={element.external}
      />
      <ConnectionHandles
        diamond={diamond}
        sloped={shape === "data"}
        control={control}
        width={width ?? DEFAULT_NODE_WIDTH}
      />

      <div
        className="relative flex min-w-0 flex-1 flex-col justify-between"
        style={{
          paddingInline: diamond
            ? "calc(25% + 12px)"
            : shape === "data"
              ? 32
              : shape === "terminal"
                ? 20
                : shape === "subprocess"
                  ? 16
                  : 12,
          paddingTop: control
            ? 40
            : diamond
              ? minimumHeight / 4
              : shape === "cylinder"
                ? 24
                : shape === "terminal"
                  ? 14
                  : 10,
          paddingBottom: diamond
            ? minimumHeight / 4
            : shape === "cylinder"
              ? 16
              : shape === "terminal"
                ? 14
                : 10,
        }}
      >
        <div className={cn("flex items-start gap-2", control && "text-center")}>
          {!control && (
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded",
                element.external
                  ? "bg-ownership-external/15 text-ownership-external"
                  : "bg-ownership-internal/15 text-ownership-internal",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div
              title={element.name}
              className="whitespace-pre-line text-[13px] font-semibold leading-4 [overflow-wrap:anywhere]"
            >
              {element.name}
            </div>
            {element.technology && (
              <div className="mt-0.5 whitespace-pre-line font-mono text-[10.5px] leading-[14px] text-muted-foreground [overflow-wrap:anywhere]">
                {element.technology}
              </div>
            )}
          </div>
          {severity && (
            <AlertTriangle
              className={cn(
                "h-3.5 w-3.5 shrink-0",
                severity === "critical" ? "text-destructive" : "text-warning",
              )}
            />
          )}
          {locked && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />}
        </div>

        {showDescriptions && element.description?.trim() && (
          <p className="mt-2 whitespace-pre-line text-[11px] leading-4 text-muted-foreground [overflow-wrap:anywhere]">
            {element.description.trim()}
          </p>
        )}

        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
          {data.status && (
            <Badge
              variant="outline"
              className="max-w-full whitespace-normal text-[9px] normal-case tracking-normal [overflow-wrap:anywhere]"
              style={{
                color: statusColor(data.status),
                borderColor: statusColor(data.status),
                backgroundColor: `color-mix(in srgb, ${statusColor(data.status)} 10%, var(--card))`,
              }}
            >
              {t(`statusOverlay.${data.status}`)}
            </Badge>
          )}
          {!workflow && (
            <span
              className={cn(
                "max-w-full whitespace-normal rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider [overflow-wrap:anywhere]",
                element.external
                  ? "border-ownership-external/45 bg-ownership-external/10 text-ownership-external"
                  : "border-ownership-internal/45 bg-ownership-internal/10 text-ownership-internal",
              )}
            >
              {element.external ? t("inspector.external") : t("inspector.internal")}
            </span>
          )}
          <span className="min-w-0 whitespace-normal text-[9.5px] font-medium uppercase tracking-wider text-muted-foreground [overflow-wrap:anywhere]">
            {badge}
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <DetailViewAction elementId={element.id} compact />
            <InlineExpansionAction elementId={element.id} compact />
          </div>
        </div>
      </div>
    </div>
  );
}

export const ElementNode = memo(ElementNodeComponent);
