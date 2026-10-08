import type { ViewDetail } from "@structsmith/contracts";
import { presets } from "@structsmith/domain";
import { Keyboard, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { primaryModifierLabel } from "@/lib/platform";
import { useEditorStore } from "@/store/editor";
import { useCreatePreset } from "../command/useCreatePreset";
import { iconFor } from "../icons";

const quickPresets = presets.filter((preset) =>
  ["workflowGroup", "action", "decision", "outcome"].includes(preset.id),
);

export function CreationToolbar({
  workspaceId,
  view,
  getCreationPoint,
}: {
  workspaceId: string;
  view: ViewDetail;
  getCreationPoint: () => { x: number; y: number };
}) {
  const { t } = useTranslation();
  const creation = useCreatePreset(workspaceId);
  const openPalette = useEditorStore((state) => state.openElementPalette);
  const setShortcutsOpen = useEditorStore((state) => state.setShortcutsOpen);
  const [focused, setFocused] = useState(0);

  return (
    <div
      role="toolbar"
      aria-label={t("creationToolbar.title")}
      className="nodrag nopan absolute bottom-4 left-1/2 z-30 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-lg bg-card p-1.5 shadow-lg ring-1 ring-border"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        const buttons = Array.from(
          event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
        );
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? buttons.length - 1
              : (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }}
    >
      {quickPresets.map((preset, index) => {
        const Icon = iconFor(preset.kind, preset.role);
        const label = t(`presets.${preset.id}`);
        return (
          <Tooltip key={preset.id} label={t("creationToolbar.add", { name: label })} side="top">
            <Button
              type="button"
              variant="ghost"
              className="h-12 min-w-16 shrink-0 flex-col gap-1 px-2 text-[11px] leading-4"
              aria-label={t("creationToolbar.add", { name: label })}
              disabled={creation.disabled}
              tabIndex={focused === index ? 0 : -1}
              onFocus={() => setFocused(index)}
              onClick={() => creation.add(preset, view.id, null, getCreationPoint())}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span>{t(`creationToolbar.${preset.id}`)}</span>
            </Button>
          </Tooltip>
        );
      })}
      <div className="mx-1 h-7 w-px shrink-0 bg-border" aria-hidden="true" />
      <Tooltip label={t("creationToolbar.moreHint")} side="top">
        <Button
          type="button"
          variant="ghost"
          className="h-12 min-w-16 shrink-0 flex-col gap-1 px-2 text-[11px] leading-4"
          aria-label={t("creationToolbar.moreHint")}
          tabIndex={focused === 4 || (creation.disabled && focused < 4) ? 0 : -1}
          onFocus={() => setFocused(4)}
          onClick={() => openPalette()}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>{t("creationToolbar.more")}</span>
        </Button>
      </Tooltip>
      <Tooltip label={`${t("shortcuts.title")} (${primaryModifierLabel()} /)`} side="top">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("shortcuts.title")}
          tabIndex={focused === 5 ? 0 : -1}
          onFocus={() => setFocused(5)}
          onClick={() => setShortcutsOpen(true)}
        >
          <Keyboard className="h-4 w-4" aria-hidden="true" />
        </Button>
      </Tooltip>
    </div>
  );
}
