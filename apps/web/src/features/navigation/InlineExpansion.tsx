import type { ArchitectureElement } from "@structsmith/contracts";
import { Maximize2, Minimize2 } from "lucide-react";
import { createContext, useContext } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

interface InlineExpansion {
  elements: readonly ArchitectureElement[];
  expandedElementIds: ReadonlySet<string>;
  depths: ReadonlyMap<string, number>;
  enabled: boolean;
  toggle: (elementId: string) => void;
}

export const InlineExpansionContext = createContext<InlineExpansion | null>(null);

export function InlineExpansionAction({
  elementId,
  compact = false,
}: {
  elementId: string;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const context = useContext(InlineExpansionContext);
  if (!context?.elements.some((element) => element.parentId === elementId)) return null;
  const expanded = context.expandedElementIds.has(elementId);
  const depth = context.depths.get(elementId);
  const atLimit = !expanded && (depth === undefined || depth >= 3);
  const label = t(expanded ? "navigation.collapseInline" : "navigation.expandInline");
  const Icon = expanded ? Minimize2 : Maximize2;
  return (
    <Button
      type="button"
      size={compact ? "iconSm" : "sm"}
      variant={compact ? "ghost" : "outline"}
      className="nodrag nopan shrink-0 normal-case tracking-normal"
      aria-label={label}
      aria-expanded={expanded}
      title={atLimit ? t("navigation.expansionLimit") : label}
      disabled={!context.enabled || atLimit}
      onClick={(event) => {
        event.stopPropagation();
        context.toggle(elementId);
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <Icon className="h-3.5 w-3.5" />
      {!compact && label}
    </Button>
  );
}
