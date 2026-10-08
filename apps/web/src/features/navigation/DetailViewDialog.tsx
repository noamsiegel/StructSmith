import type {
  ArchitectureElement,
  ArchitectureRelationship,
  ArchitectureView,
} from "@structsmith/contracts";
import { detailViewElementIds, detailViewKind, detailViewsFor } from "@structsmith/domain";
import { ArrowRight, Layers } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApplyOperations } from "@/hooks/useApi";

export function DetailViewDialog({
  workspaceId,
  element,
  elements,
  relationships,
  views,
  currentViewId,
  preferredDetailViews = {},
  canRemember = true,
  onClose,
  onOpenView,
}: {
  workspaceId: string;
  element: ArchitectureElement;
  elements: readonly ArchitectureElement[];
  relationships: readonly ArchitectureRelationship[];
  views: readonly ArchitectureView[];
  currentViewId: string | null;
  preferredDetailViews?: Readonly<Record<string, string>>;
  canRemember?: boolean;
  onClose: () => void;
  onOpenView: (viewId: string) => void;
}) {
  const { t } = useTranslation();
  const mutation = useApplyOperations(workspaceId);
  const kind = detailViewKind(element);
  const candidates = detailViewsFor(element, views, currentViewId);
  const [name, setName] = useState(
    t("navigation.defaultName", { name: element.name, kind: t(`viewKinds.${kind}`) }),
  );
  const [seed, setSeed] = useState(true);
  const [remember, setRemember] = useState(false);
  const elementIds = detailViewElementIds(element, elements, relationships);
  const open = (viewId: string) => {
    const navigate = () => {
      onOpenView(viewId);
      onClose();
    };
    if (!remember || !currentViewId || !canRemember) return navigate();
    mutation.mutate(
      {
        label: t("navigation.rememberDetails"),
        operations: [
          {
            op: "updateView",
            viewId: currentViewId,
            data: {
              settings: { preferredDetailViews: { ...preferredDetailViews, [element.id]: viewId } },
            },
          },
        ],
      },
      { onSuccess: navigate },
    );
  };
  const create = () => {
    if (!kind || !name.trim() || mutation.isPending) return;
    mutation.mutate(
      {
        label: t("navigation.createDetails"),
        operations: [
          {
            op: "createView",
            ref: "detail",
            data: {
              name: name.trim(),
              kind,
              scopeElementId: element.id,
              elementIds: seed ? elementIds : [],
            },
          },
          { op: "autoLayoutView", viewId: "@detail", direction: "LR" },
        ],
      },
      {
        onSuccess: (result) => {
          const created = result.appliedOperations.find((operation) => operation.ref === "detail");
          if (created?.id) onOpenView(created.id);
          onClose();
        },
      },
    );
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t(candidates.length ? "navigation.chooseView" : "navigation.createDetails")}
          </DialogTitle>
          <DialogDescription>
            {t(candidates.length ? "navigation.chooseDescription" : "navigation.noView", {
              name: element.name,
            })}
          </DialogDescription>
        </DialogHeader>
        {candidates.length ? (
          <div className="space-y-3">
            <div className="max-h-80 space-y-1 overflow-y-auto">
              {candidates.map((view) => (
                <Button
                  key={view.id}
                  type="button"
                  variant="outline"
                  className="h-auto w-full gap-3 p-3 text-left"
                  disabled={mutation.isPending}
                  onClick={() => open(view.id)}
                >
                  <Layers className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{view.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {t(`viewKinds.${view.kind}`)}
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ))}
            </div>
            {currentViewId && canRemember && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={remember}
                  disabled={mutation.isPending}
                  onChange={(event) => setRemember(event.target.checked)}
                />
                {t("navigation.rememberDetails")}
              </label>
            )}
          </div>
        ) : (
          <form
            id="create-detail-view"
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              create();
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="detail-view-name">{t("views.name")}</Label>
              <Input
                id="detail-view-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={mutation.isPending}
                autoFocus
              />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={seed}
                onChange={(event) => setSeed(event.target.checked)}
                disabled={mutation.isPending}
                className="mt-1"
              />
              <span>
                {t("navigation.seedContents")}
                <span className="block text-xs text-muted-foreground">
                  {t("navigation.seedDescription", { count: elementIds.length })}
                </span>
              </span>
            </label>
          </form>
        )}
        {Boolean(mutation.error) && (
          <p role="alert" className="text-sm text-destructive">
            {mutation.error instanceof Error ? mutation.error.message : String(mutation.error)}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            {t("common.cancel")}
          </Button>
          {!candidates.length && (
            <Button
              type="submit"
              form="create-detail-view"
              disabled={!name.trim() || mutation.isPending}
            >
              {t(mutation.isPending ? "common.loading" : "common.create")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
