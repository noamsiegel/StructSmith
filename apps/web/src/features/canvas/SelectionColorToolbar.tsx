import type { ViewDetail } from "@structsmith/contracts";
import { Check, Palette, RotateCcw } from "lucide-react";
import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useApplyOperations } from "@/hooks/useApi";
import { useEditorStore } from "@/store/editor";
import { annotationId, isAnnotationId } from "./annotations";
import type { FlowEdge, FlowNode } from "./graph";
import { colorSelectionOperations, selectionColorTargets } from "./selectionColors";
import { selectionToolbarPosition } from "./toolbarPlacement";

const palette = [
  "#FFFFFF",
  "#757575",
  "#B3B3B3",
  "#66D575",
  "#5AD8CC",
  "#3DADFF",
  "#9747FF",
  "#F849C1",
  "#FF7556",
  "#FF9E42",
  "#FFC943",
  "#1E1E1E",
];

export function SelectionColorToolbar({
  workspaceId,
  view,
  nodes,
  edges,
  children,
}: {
  workspaceId: string;
  view: ViewDetail;
  nodes: FlowNode[];
  edges: FlowEdge[];
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const selection = useEditorStore((state) => state.selection);
  const command = useApplyOperations(workspaceId);
  const { nodeIds, relationshipIds } = selectionColorTargets(selection, nodes, edges);
  const colors = [
    ...nodeIds.map((id) =>
      isAnnotationId(id)
        ? (view.settings.annotations.find((annotation) => annotation.id === annotationId(id))
            ?.color ?? undefined)
        : view.settings.nodeColors[id],
    ),
    ...relationshipIds.map(
      (id) =>
        view.relationships.find((row) => row.relationshipId === id)?.presentation?.color ??
        undefined,
    ),
  ];
  const mixed = colors.some((color) => color !== colors[0]);
  const color = mixed ? undefined : colors[0];
  const [draft, setDraft] = useState(color ?? "#3DADFF");
  const fieldId = useId();
  const targetKey = [...nodeIds, ...relationshipIds].join("/");
  useEffect(() => {
    setDraft(color ?? "#3DADFF");
  }, [color]);
  const toolbar = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  // Re-measure after every render: chrome such as the scenario panel opens, grows and closes.
  useLayoutEffect(() => {
    const own = toolbar.current;
    const canvas = own?.offsetParent;
    if (!own || !(canvas instanceof HTMLElement)) return;
    const chrome = [...canvas.querySelectorAll<HTMLElement>("[data-canvas-chrome]")];
    const place = () => {
      const box = canvas.getBoundingClientRect();
      const next = selectionToolbarPosition(
        canvas.clientWidth,
        { width: own.offsetWidth, height: own.offsetHeight },
        window.matchMedia("(min-width: 640px)").matches ? 12 : 56,
        chrome.map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            left: rect.left - box.left,
            top: rect.top - box.top,
            right: rect.right - box.left,
            bottom: rect.bottom - box.top,
          };
        }),
      );
      setPosition((current) =>
        current?.left === next.left && current.top === next.top ? current : next,
      );
    };
    const observer = new ResizeObserver(place);
    for (const element of [canvas, own, ...chrome]) observer.observe(element);
    place();
    return () => observer.disconnect();
  });
  if (!nodeIds.length && !relationshipIds.length) return null;
  const valid = /^#[0-9a-fA-F]{6}$/.test(draft);
  const save = (next: string | null) =>
    command.mutate({
      label: t("selectionColors.updated"),
      operations: colorSelectionOperations(view, nodeIds, relationshipIds, next),
    });

  return (
    <div
      ref={toolbar}
      style={position ? { left: position.left, top: position.top, translate: "none" } : undefined}
      className="absolute left-1/2 top-14 z-40 flex -translate-x-1/2 items-center rounded-lg border border-border bg-popover p-1 shadow-md sm:top-3"
      role="toolbar"
      aria-label={t("selectionColors.toolbar")}
    >
      {children}
      {relationshipIds.length > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          title={t("relationshipPresentation.resetRouteHint")}
          disabled={
            command.isPending ||
            !view.relationships.some(
              (row) => relationshipIds.includes(row.relationshipId) && row.controlPoints.length,
            )
          }
          onClick={() =>
            command.mutate({
              label: t("relationshipPresentation.resetRoute"),
              operations: [
                {
                  op: "setViewRelationships",
                  viewId: view.id,
                  relationships: relationshipIds.map((relationshipId) => ({
                    relationshipId,
                    controlPoints: [],
                  })),
                },
              ],
            })
          }
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          {t("relationshipPresentation.resetRoute")}
        </Button>
      )}
      <Popover
        key={targetKey}
        onOpenChange={(open) => {
          if (open) setDraft(color ?? "#3DADFF");
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="gap-2"
            aria-label={t("selectionColors.change")}
          >
            {color ? (
              <span
                className="h-4 w-4 rounded-full border border-border"
                style={{ backgroundColor: color }}
                aria-hidden="true"
              />
            ) : (
              <Palette className="h-4 w-4" />
            )}
            {mixed ? t("selectionColors.mixed") : t("selectionColors.color")}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-64 space-y-3 p-3"
          align="center"
          aria-label={t("selectionColors.palette")}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <div
            className="grid grid-cols-6 gap-1.5"
            role="group"
            aria-label={t("selectionColors.palette")}
          >
            {palette.map((swatch) => (
              <Button
                key={swatch}
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-full border-border p-0"
                style={{ backgroundColor: swatch }}
                aria-label={t("selectionColors.use", { color: swatch })}
                aria-pressed={color?.toUpperCase() === swatch}
                disabled={command.isPending}
                onClick={() => save(swatch)}
              >
                {color?.toUpperCase() === swatch && (
                  <Check
                    className="h-4 w-4"
                    style={{
                      color: ["#757575", "#9747FF", "#1E1E1E"].includes(swatch)
                        ? "#FFFFFF"
                        : "#1E1E1E",
                    }}
                  />
                )}
              </Button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={fieldId}>{t("selectionColors.custom")}</Label>
            <div className="flex gap-2">
              <Input
                id={`${fieldId}-picker`}
                aria-label={t("selectionColors.customPicker")}
                type="color"
                className="w-10 shrink-0 p-1"
                value={valid ? draft : "#3DADFF"}
                onChange={(event) => setDraft(event.target.value)}
              />
              <Input
                id={fieldId}
                value={draft}
                spellCheck={false}
                aria-invalid={!valid}
                maxLength={7}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && valid && !command.isPending) save(draft);
                }}
              />
              <Button
                variant="secondary"
                size="sm"
                disabled={!valid || command.isPending}
                onClick={() => save(draft)}
              >
                {t("selectionColors.apply")}
              </Button>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            disabled={!colors.some(Boolean) || command.isPending}
            onClick={() => save(null)}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t("selectionColors.reset")}
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
