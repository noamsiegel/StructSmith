/* biome-ignore-all lint/suspicious/noArrayIndexKey: Table cells are controlled and addressed by row and column coordinates. */
import { type NodeProps, NodeResizer } from "@xyflow/react";
import { Pencil } from "lucide-react";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { annotationSize } from "./annotations";
import type { AnnotationNodeData } from "./graph";
import "./annotationTranslations";

function AnnotationNodeComponent({ data, selected }: NodeProps & { data: AnnotationNodeData }) {
  const { t } = useTranslation("annotations");
  const annotation = data.annotation;
  const size = annotationSize(annotation);
  const noteColor = annotation.color ?? "#FFF1AE";
  const rgb = [1, 3, 5]
    .map((offset) => Number.parseInt(noteColor.slice(offset, offset + 2), 16) / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  const luminance = (rgb[0] ?? 0) * 0.2126 + (rgb[1] ?? 0) * 0.7152 + (rgb[2] ?? 0) * 0.0722;
  const fontSize =
    "fontSize" in annotation && typeof annotation.fontSize === "number"
      ? annotation.fontSize
      : annotation.kind === "text"
        ? 18
        : 16;
  return (
    <div
      className={cn(
        "relative h-full w-full",
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-canvas",
      )}
      style={{
        minHeight: size.height,
        color:
          annotation.kind === "text"
            ? (annotation.color ?? "var(--foreground)")
            : luminance > 0.179
              ? "#000000"
              : "#FFFFFF",
        backgroundColor:
          annotation.kind === "note"
            ? (annotation.color ?? "#FFF1AE")
            : annotation.kind === "table"
              ? "var(--card)"
              : undefined,
      }}
    >
      {data.onResize && (
        <NodeResizer
          isVisible={Boolean(selected)}
          minWidth={annotation.kind === "table" ? (annotation.cells[0]?.length ?? 1) * 140 : 120}
          minHeight={annotationSize({ ...annotation, height: 20 }).height}
          onResizeEnd={(_event, frame) =>
            data.onResize?.({ x: frame.x, y: frame.y, width: frame.width, height: frame.height })
          }
        />
      )}
      {annotation.kind === "table" ? (
        <table
          className="w-full table-fixed border-collapse text-left text-sm text-foreground"
          style={{ borderColor: annotation.color ?? "var(--border)" }}
        >
          <tbody>
            {annotation.cells.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td
                    key={c}
                    className={cn(
                      "border px-3 py-2 align-top whitespace-pre-wrap [overflow-wrap:anywhere]",
                      r === 0 && "bg-muted font-medium",
                    )}
                    style={{ borderColor: annotation.color ?? "var(--border)" }}
                  >
                    {cell || "\u00a0"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div
          className="whitespace-pre-wrap px-4 py-4 [overflow-wrap:anywhere]"
          style={{ fontSize, lineHeight: 1.5 }}
        >
          {annotation.text || t(annotation.kind)}
        </div>
      )}
      {selected && data.onEdit && (
        <Button
          variant="secondary"
          size="icon"
          className="nodrag nopan absolute -right-2 -top-8 h-7 w-7"
          aria-label={t("editHint")}
          onClick={() => data.onEdit?.()}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
export const AnnotationNode = memo(AnnotationNodeComponent);
