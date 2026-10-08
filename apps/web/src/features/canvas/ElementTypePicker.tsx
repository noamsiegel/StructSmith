import type { ArchitectureElement, UpdateElementInput } from "@structsmith/contracts";
import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { iconFor } from "../icons";
import { elementTypeOptions, elementTypeProblem } from "./elementType";

export function ElementTypePicker({
  element,
  elements,
  disabled = false,
  onChange,
}: {
  element: ArchitectureElement;
  elements: readonly ArchitectureElement[];
  disabled?: boolean;
  onChange: (data: Pick<UpdateElementInput, "kind" | "role">) => void;
}) {
  const { t } = useTranslation();
  const current = elementTypeOptions.find(
    (option) => option.kind === element.kind && option.role === element.role,
  );
  const Icon = iconFor(element.kind, element.role);
  return (
    <Select
      value={current?.id ?? "current"}
      disabled={disabled}
      onValueChange={(value) => {
        const option = elementTypeOptions.find((candidate) => candidate.id === value);
        if (option && !elementTypeProblem(element, option.kind, elements)) {
          onChange({ kind: option.kind, role: option.role });
        }
      }}
    >
      <SelectTrigger
        className="h-8 w-auto max-w-48 border-0 bg-transparent"
        aria-label={t("elementTypes.title")}
        title={t("elementTypes.title")}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {!current && (
          <SelectItem value="current">
            {t(`kinds.${element.kind}`)}
            {element.role ? ` · ${t(`roles.${element.role}`)}` : ""}
          </SelectItem>
        )}
        {elementTypeOptions.map((option) => {
          const incompatible = elementTypeProblem(element, option.kind, elements) !== null;
          const OptionIcon = iconFor(option.kind, option.role);
          return (
            <SelectItem
              key={option.id}
              value={option.id}
              disabled={incompatible}
              title={incompatible ? t("elementTypes.invalid") : undefined}
            >
              <span className="flex items-center gap-2">
                <OptionIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {t(option.id.startsWith("kind-") ? `kinds.${option.kind}` : `presets.${option.id}`)}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
