import type {
  ArchitectureElement,
  ArchitectureRelationship,
  ViewDetail,
} from "@structsmith/contracts";
import { elementDependencies } from "@structsmith/domain";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useEditorStore } from "@/store/editor";

export function DependencyPanel({
  element,
  elements,
  relationships,
  views,
  onOpenView,
}: {
  element: ArchitectureElement;
  elements: readonly ArchitectureElement[];
  relationships: readonly ArchitectureRelationship[];
  views: readonly ViewDetail[];
  onOpenView: (viewId: string) => void;
}) {
  const { t } = useTranslation();
  const result = elementDependencies(element.id, elements, relationships, views);
  const select = useEditorStore((state) => state.select);
  const byId = new Map(elements.map((item) => [item.id, item]));
  return (
    <section className="space-y-3 border-t border-border pt-3" aria-label={t("dependencies.title")}>
      <h3 className="text-xs font-semibold">{t("dependencies.title")}</h3>
      {(["incoming", "outgoing"] as const).map((direction) => (
        <div key={direction}>
          <h4 className="mb-1 flex items-center gap-1 text-xs font-medium">
            {direction === "incoming" ? (
              <ArrowDownLeft className="h-3.5 w-3.5" />
            ) : (
              <ArrowUpRight className="h-3.5 w-3.5" />
            )}
            {t(`dependencies.${direction}`)}{" "}
            <span className="text-muted-foreground">{result[direction].length}</span>
          </h4>
          {result[direction].length === 0 && (
            <p className="text-xs text-muted-foreground">{t("dependencies.none")}</p>
          )}
          <ul className="space-y-1">
            {result[direction].map((relationship) => {
              const endpoint =
                direction === "incoming"
                  ? relationship.sourceElementId
                  : relationship.targetElementId;
              const own =
                direction === "incoming"
                  ? relationship.targetElementId
                  : relationship.sourceElementId;
              const inherited = own !== element.id;
              const containing = views.find((view) =>
                view.elements.some((entry) => entry.elementId === endpoint && !entry.hidden),
              );
              return (
                <li key={relationship.id} className="text-xs">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto w-full justify-start whitespace-normal px-1 py-1 text-left"
                    onClick={() => {
                      if (containing) onOpenView(containing.id);
                      select({ type: "element", id: endpoint });
                      useEditorStore.getState().requestFocus(endpoint);
                    }}
                  >
                    <span className="min-w-0 [overflow-wrap:anywhere]">
                      <span className="font-medium">{byId.get(endpoint)?.name ?? endpoint}</span>
                      <span className="block text-muted-foreground">
                        {relationship.description || t("dependencies.unlabeled")}
                        {inherited &&
                          ` · ${t("dependencies.via", { name: byId.get(own)?.name ?? own })}`}
                      </span>
                    </span>
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <div>
        <h4 className="mb-1 text-xs font-medium">
          {t("dependencies.usedIn", { count: result.usedIn.length })}
        </h4>
        {result.usedIn.length === 0 && (
          <p className="text-xs text-muted-foreground">{t("dependencies.noViews")}</p>
        )}
        {result.usedIn.map((view) => (
          <Button
            key={view.id}
            variant="ghost"
            size="sm"
            className="h-auto w-full justify-start whitespace-normal px-1 py-1 text-left"
            onClick={() => {
              onOpenView(view.id);
              select({ type: "element", id: element.id });
              useEditorStore.getState().requestFocus(element.id);
            }}
          >
            {view.name}
          </Button>
        ))}
      </div>
    </section>
  );
}
