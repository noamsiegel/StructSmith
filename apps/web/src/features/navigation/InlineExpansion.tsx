import type { ArchitectureElement } from "@structsmith/contracts";
import { Maximize2 } from "lucide-react";
import { createContext, useContext } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useDetailNavigation } from "./DetailNavigation";

interface InlineExpansion {
  elements: readonly ArchitectureElement[];
  enabled: boolean;
  open: (elementId: string) => void;
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
  const details = useDetailNavigation(elementId);
  if (
    !context ||
    (!details.available && !context.elements.some((element) => element.parentId === elementId))
  )
    return null;
  const label = t("navigation.preview");
  return (
    <Button
      type="button"
      size={compact ? "iconSm" : "sm"}
      variant={compact ? "ghost" : "outline"}
      className="nodrag nopan shrink-0 normal-case tracking-normal"
      aria-label={label}
      aria-haspopup="dialog"
      title={label}
      disabled={!context.enabled}
      onClick={(event) => {
        event.stopPropagation();
        context.open(elementId);
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <Maximize2 className="h-3.5 w-3.5" />
      {!compact && label}
    </Button>
  );
}
