import type { ElementPreset } from "@structsmith/domain";
import { useTranslation } from "react-i18next";
import { useApplyOperations, useWorkspace } from "@/hooks/useApi";
import { useEditorStore } from "@/store/editor";
import { presetCreationOperations } from "./presetCreation";

export function useCreatePreset(workspaceId: string) {
  const { t } = useTranslation();
  const workspace = useWorkspace(workspaceId);
  const command = useApplyOperations(workspaceId);
  const select = useEditorStore((state) => state.select);
  const setPaletteOpen = useEditorStore((state) => state.setPaletteOpen);
  const showInspector = useEditorStore((state) => state.setInspectorPanelVisible);

  const add = (
    preset: ElementPreset,
    viewId: string | null,
    boundaryId: string | null = null,
    point?: { x: number; y: number },
  ): void => {
    if (command.isPending || !workspace.data) return;
    const name = t(`presets.${preset.id}`, { defaultValue: preset.label });
    command.mutate(
      {
        label: t("palette.added", { name }),
        expectedRevision: workspace.data.revision,
        operations: presetCreationOperations(preset, name, viewId, boundaryId, point),
      },
      {
        onSuccess: (result) => {
          const created = result.appliedOperations.find((operation) => operation.ref === "created");
          if (created?.id) {
            select({ type: "element", id: created.id });
            showInspector(true);
          }
          setPaletteOpen(false);
        },
      },
    );
  };

  return { add, disabled: command.isPending || !workspace.data };
}
