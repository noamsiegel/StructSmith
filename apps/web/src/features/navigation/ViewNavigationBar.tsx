import type { ArchitectureElement, ArchitectureView } from "@structsmith/contracts";
import {
  ArrowLeft,
  ChevronRight,
  CircleHelp,
  PanelLeft,
  PanelRight,
  Settings2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip } from "@/components/ui/tooltip";
import { primaryModifierKeyCode, primaryModifierLabel } from "@/lib/platform";
import type { StatusOverlay } from "../canvas/statusOverlay";
import { iconFor } from "../icons";
import type { ViewLocation } from "./history";

export function ViewNavigationBar({
  current,
  elements,
  views,
  back,
  onBack,
  onEditView,
  statusOverlay,
  onStatusOverlayChange,
  tags,
  tagFocus,
  onTagFocusChange,
  modelPanelVisible,
  inspectorPanelVisible,
  onToggleModelPanel,
  onToggleInspectorPanel,
}: {
  current: ArchitectureView | null;
  elements: readonly ArchitectureElement[];
  views: readonly ArchitectureView[];
  back: readonly ViewLocation[];
  onBack: (index: number) => void;
  onEditView: () => void;
  tags: readonly string[];
  tagFocus: string | null;
  onTagFocusChange: (tag: string | null) => void;
  statusOverlay: StatusOverlay;
  onStatusOverlayChange: (overlay: StatusOverlay) => void;
  modelPanelVisible: boolean;
  inspectorPanelVisible: boolean;
  onToggleModelPanel: () => void;
  onToggleInspectorPanel: () => void;
}) {
  const { t } = useTranslation();
  const trail = back.flatMap((entry, index) => {
    const view = views.find((item) => item.id === entry.viewId);
    return view ? [{ view, index }] : [];
  });
  const scope: string[] = [];
  const seen = new Set<string>();
  let parent = elements.find((element) => element.id === current?.scopeElementId);
  while (parent && !seen.has(parent.id)) {
    seen.add(parent.id);
    scope.unshift(parent.name);
    const parentId = parent.parentId;
    parent = elements.find((element) => element.id === parentId);
  }
  const previous = trail.at(-1);
  const modelLabel = t(
    modelPanelVisible ? "navigation.hideModelPanel" : "navigation.showModelPanel",
  );
  const inspectorLabel = t(
    inspectorPanelVisible ? "navigation.hideInspectorPanel" : "navigation.showInspectorPanel",
  );
  const primary = primaryModifierLabel();
  return (
    <nav
      aria-label={t("navigation.title")}
      className="flex min-h-10 shrink-0 items-center gap-2 border-b border-border bg-card px-2"
    >
      <Tooltip label={`${modelLabel} (${primary} B)`}>
        <Button
          id="toggle-model-panel"
          variant="ghost"
          size="icon"
          className="shrink-0"
          title={modelLabel}
          aria-label={modelLabel}
          aria-expanded={modelPanelVisible}
          aria-controls="model-panel"
          aria-keyshortcuts={`${primaryModifierKeyCode()}+B`}
          onClick={onToggleModelPanel}
        >
          <PanelLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
      </Tooltip>
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
        <Button
          size="sm"
          variant="ghost"
          className="shrink-0"
          disabled={!previous}
          onClick={() => previous && onBack(previous.index)}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("navigation.back")}
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-xs">
          {trail.map(({ view, index }) => (
            <span key={`${view.id}-${index}`} className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                className="max-w-40 truncate rounded px-1 py-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onBack(index)}
                title={view.name}
              >
                {view.name}
              </button>
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            </span>
          ))}
          <span aria-current="page" className="shrink-0 font-medium">
            {current?.name}
          </span>
          {current && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0"
              aria-label={t("inspector.viewSettings")}
              title={t("inspector.viewSettings")}
              onClick={onEditView}
            >
              <Settings2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <Select
          value={statusOverlay}
          onValueChange={(value) => onStatusOverlayChange(value as StatusOverlay)}
        >
          <SelectTrigger
            className="h-7 w-32 shrink-0 text-xs"
            aria-label={t("statusOverlay.title")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(["off", "status", "liveOnly"] as const).map((mode) => (
              <SelectItem key={mode} value={mode}>
                {t(`statusOverlay.${mode}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={tagFocus ? `tag:${tagFocus}` : "all"}
          onValueChange={(value) => onTagFocusChange(value === "all" ? null : value.slice(4))}
        >
          <SelectTrigger className="h-7 w-32 shrink-0 text-xs" aria-label={t("tagFocus.title")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("tagFocus.all")}</SelectItem>
            {tags.map((tag) => (
              <SelectItem key={tag} value={`tag:${tag}`}>
                {tag}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="iconSm"
              className="shrink-0"
              aria-label={t("canvas.diagramLegend")}
              title={t("canvas.diagramLegend")}
            >
              <CircleHelp className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 space-y-3 p-4 text-xs">
            <h3 className="font-semibold">{t("canvas.diagramLegend")}</h3>
            {current?.kind === "workflow" && (
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                {(["workflowGroup", "action", "decision", "outcome"] as const).map((kind) => {
                  const Icon = iconFor(kind, null);
                  return (
                    <span key={kind} className="flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5" />
                      {t(`kinds.${kind}`)}
                    </span>
                  );
                })}
              </div>
            )}
            <div className="space-y-2 border-t border-border pt-3">
              <p className="font-medium">{t("canvas.legend")}</p>
              <div className="flex items-center gap-4">
                <span className="text-ownership-internal">{t("inspector.internal")}</span>
                <span className="text-ownership-external">{t("inspector.external")}</span>
              </div>
            </div>
            {statusOverlay !== "off" && (
              <div className="space-y-2 border-t border-border pt-3">
                <p className="font-medium">{t("statusOverlay.title")}</p>
                <div className="flex items-center gap-4">
                  <span style={{ color: "var(--status-live)" }}>{t("statusOverlay.live")}</span>
                  <span style={{ color: "var(--status-planned)" }}>
                    {t("statusOverlay.planned")}
                  </span>
                </div>
                <p className="text-muted-foreground">{t("statusOverlay.untagged")}</p>
              </div>
            )}
          </PopoverContent>
        </Popover>
        {scope.length > 0 && (
          <span
            className="max-w-[35%] truncate text-[11px] text-muted-foreground"
            title={scope.join(" / ")}
          >
            {scope.join(" / ")}
          </span>
        )}
      </div>
      <Tooltip label={`${inspectorLabel} (${primary} Alt B)`}>
        <Button
          id="toggle-inspector-panel"
          variant="ghost"
          size="icon"
          className="shrink-0"
          title={inspectorLabel}
          aria-label={inspectorLabel}
          aria-expanded={inspectorPanelVisible}
          aria-controls="inspector-panel"
          aria-keyshortcuts={`${primaryModifierKeyCode()}+Alt+B`}
          onClick={onToggleInspectorPanel}
        >
          <PanelRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </Tooltip>
    </nav>
  );
}
