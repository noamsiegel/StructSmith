import {
  type ArchitectureElement,
  type ArchitectureRelationship,
  type ViewDetail,
  type ViewScenario,
  ViewScenarioSchema,
  type ViewScenarioStep,
} from "@structsmith/contracts";
import { clearInvalidScenarioArrivals, validateViewScenarios } from "@structsmith/domain";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ListOrdered,
  Pencil,
  Play,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useApplyOperations, useWorkspace } from "@/hooks/useApi";

type DraftStep = ViewScenarioStep & { key: string };
type DraftScenario = Omit<ViewScenario, "steps"> & { steps: DraftStep[] };

export function ScenarioPanel({
  workspaceId,
  view,
  elements,
  relationships,
  onStep,
}: {
  workspaceId: string;
  view: ViewDetail;
  elements: readonly ArchitectureElement[];
  relationships: readonly ArchitectureRelationship[];
  onStep: (step: ViewScenarioStep | null) => void;
}) {
  const { t } = useTranslation();
  const fieldId = useId();
  const workspace = useWorkspace(workspaceId);
  const command = useApplyOperations(workspaceId);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<{ scenario: DraftScenario; revision: number } | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selected = view.settings.scenarios.find((scenario) => scenario.id === selectedId);
  const step = playing ? selected?.steps[index] : undefined;
  const visible = elements.filter((element) =>
    view.elements.some((row) => row.elementId === element.id),
  );
  const arrival = relationships.find((edge) => edge.id === step?.relationshipId);
  const previous = selected?.steps[index - 1];
  const stale =
    step &&
    (!visible.some((element) => element.id === step.elementId) ||
      (step.relationshipId &&
        (!arrival ||
          !previous ||
          arrival.sourceElementId !== previous.elementId ||
          arrival.targetElementId !== step.elementId)));

  useEffect(() => {
    onStep(step && !stale ? step : null);
  }, [step, stale, onStep]);
  useEffect(() => () => onStep(null), [onStep]);

  const choose = (id: string) => {
    setSelectedId(id);
    setIndex(0);
    setPlaying(false);
    setDeleting(null);
    setError(null);
  };
  const edit = () => {
    if (!workspace.data || !selected) return;
    setDraft({
      scenario: {
        ...structuredClone(selected),
        steps: selected.steps.map((entry) => ({ ...entry, key: crypto.randomUUID() })),
      },
      revision: workspace.data.revision,
    });
    setPlaying(false);
    setDeleting(null);
    setError(null);
  };
  const create = () => {
    const element = visible[0];
    if (!workspace.data || !element) return;
    setDraft({
      revision: workspace.data.revision,
      scenario: {
        id: crypto.randomUUID(),
        name: "",
        steps: [{ key: crypto.randomUUID(), elementId: element.id, title: element.name }],
      },
    });
    setPlaying(false);
    setDeleting(null);
    setError(null);
  };
  const persist = async (scenarios: ViewScenario[], revision: number) => {
    try {
      await command.mutateAsync({
        expectedRevision: revision,
        label: t("scenarios.changed"),
        operations: [{ op: "updateView", viewId: view.id, data: { settings: { scenarios } } }],
      });
      setDraft(null);
      setDeleting(null);
      setError(null);
      return true;
    } catch {
      setDeleting(null);
      setError(t("scenarios.saveFailed"));
      return false;
    }
  };
  const save = async () => {
    if (!draft) return;
    const parsed = ViewScenarioSchema.safeParse(draft.scenario);
    if (!parsed.success) {
      setError(t("scenarios.required"));
      return;
    }
    try {
      validateViewScenarios(
        [parsed.data],
        view.elements.map((row) => row.elementId),
        elements,
        relationships,
      );
    } catch {
      setError(t("scenarios.invalidReferences"));
      return;
    }
    const scenarios = view.settings.scenarios.some((scenario) => scenario.id === parsed.data.id)
      ? view.settings.scenarios.map((scenario) =>
          scenario.id === parsed.data.id ? parsed.data : scenario,
        )
      : [...view.settings.scenarios, parsed.data];
    if (await persist(scenarios, draft.revision)) choose(parsed.data.id);
  };
  const updateSteps = (steps: DraftStep[]) => {
    if (!draft) return;
    const cleaned = clearInvalidScenarioArrivals(steps, relationships);
    setDraft({ ...draft, scenario: { ...draft.scenario, steps: cleaned } });
    setError(null);
  };

  return (
    <section
      aria-label={t("scenarios.title")}
      className={`pointer-events-auto rounded-lg bg-background shadow-lg ${open ? "w-[min(22rem,calc(100vw-2rem))]" : "w-auto"}`}
    >
      <div className="flex items-center gap-1 p-1.5">
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={open}
          disabled={Boolean(draft)}
          onClick={() => {
            if (draft) return;
            setOpen(!open);
            if (open) setPlaying(false);
          }}
        >
          <ListOrdered size={14} />
          {t("scenarios.title")}
        </Button>
        {open && !draft && (
          <>
            <Select value={selected?.id ?? ""} onValueChange={choose} disabled={command.isPending}>
              <SelectTrigger aria-label={t("scenarios.choose")} className="h-7 min-w-0 flex-1">
                <SelectValue placeholder={t("scenarios.choose")} />
              </SelectTrigger>
              <SelectContent>
                {view.settings.scenarios.map((scenario) => (
                  <SelectItem key={scenario.id} value={scenario.id}>
                    {scenario.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="iconSm"
              variant="ghost"
              aria-label={t("scenarios.create")}
              title={t("scenarios.create")}
              disabled={
                !visible.length || command.isPending || view.settings.scenarios.length >= 100
              }
              onClick={create}
            >
              <Plus size={14} />
            </Button>
          </>
        )}
      </div>
      {open && (
        <div className="border-t border-border p-3">
          {draft ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor={`${fieldId}-name`}>{t("scenarios.name")}</Label>
                <Input
                  id={`${fieldId}-name`}
                  maxLength={200}
                  value={draft.scenario.name}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      scenario: { ...draft.scenario, name: event.target.value },
                    })
                  }
                  disabled={command.isPending}
                />
              </div>
              <ol className="max-h-[min(24rem,50vh)] space-y-4 overflow-y-auto pr-1">
                {draft.scenario.steps.map((item, itemIndex) => (
                  <li key={item.key} className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium">
                        {t("scenarios.stepNumber", { number: itemIndex + 1 })}
                      </span>
                      <div className="flex gap-0.5">
                        <Button
                          size="iconSm"
                          variant="ghost"
                          disabled={itemIndex === 0 || command.isPending}
                          aria-label={t("scenarios.moveUp")}
                          onClick={() => {
                            const steps = [...draft.scenario.steps];
                            const prior = steps[itemIndex - 1];
                            if (!prior) return;
                            steps[itemIndex - 1] = item;
                            steps[itemIndex] = prior;
                            updateSteps(steps);
                          }}
                        >
                          <ArrowUp size={14} />
                        </Button>
                        <Button
                          size="iconSm"
                          variant="ghost"
                          disabled={
                            itemIndex === draft.scenario.steps.length - 1 || command.isPending
                          }
                          aria-label={t("scenarios.moveDown")}
                          onClick={() => {
                            const steps = [...draft.scenario.steps];
                            const next = steps[itemIndex + 1];
                            if (!next) return;
                            steps[itemIndex + 1] = item;
                            steps[itemIndex] = next;
                            updateSteps(steps);
                          }}
                        >
                          <ArrowDown size={14} />
                        </Button>
                        <Button
                          size="iconSm"
                          variant="ghost"
                          disabled={draft.scenario.steps.length === 1 || command.isPending}
                          aria-label={t("scenarios.removeStep")}
                          onClick={() =>
                            updateSteps(draft.scenario.steps.filter((_, i) => i !== itemIndex))
                          }
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </div>
                    <Select
                      value={item.elementId}
                      disabled={command.isPending}
                      onValueChange={(elementId) =>
                        updateSteps(
                          draft.scenario.steps.map((entry, i) =>
                            i === itemIndex ? { ...entry, elementId } : entry,
                          ),
                        )
                      }
                    >
                      <SelectTrigger aria-label={t("scenarios.element")}>
                        <SelectValue placeholder={t("scenarios.missingElement")} />
                      </SelectTrigger>
                      <SelectContent>
                        {visible.map((element) => (
                          <SelectItem key={element.id} value={element.id}>
                            {element.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      aria-label={t("scenarios.stepTitle")}
                      placeholder={t("scenarios.stepTitle")}
                      maxLength={200}
                      value={item.title}
                      disabled={command.isPending}
                      onChange={(event) =>
                        updateSteps(
                          draft.scenario.steps.map((entry, i) =>
                            i === itemIndex ? { ...entry, title: event.target.value } : entry,
                          ),
                        )
                      }
                    />
                    <Textarea
                      aria-label={t("scenarios.description")}
                      placeholder={t("scenarios.description")}
                      maxLength={2000}
                      rows={2}
                      value={item.description ?? ""}
                      disabled={command.isPending}
                      onChange={(event) =>
                        updateSteps(
                          draft.scenario.steps.map((entry, i) =>
                            i === itemIndex ? { ...entry, description: event.target.value } : entry,
                          ),
                        )
                      }
                    />
                    {itemIndex > 0 && (
                      <Select
                        value={item.relationshipId ?? "none"}
                        disabled={command.isPending}
                        onValueChange={(id) =>
                          updateSteps(
                            draft.scenario.steps.map((entry, i) =>
                              i === itemIndex
                                ? { ...entry, relationshipId: id === "none" ? undefined : id }
                                : entry,
                            ),
                          )
                        }
                      >
                        <SelectTrigger aria-label={t("scenarios.arrival")}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t("scenarios.noConnection")}</SelectItem>
                          {relationships
                            .filter(
                              (edge) =>
                                edge.sourceElementId ===
                                  draft.scenario.steps[itemIndex - 1]?.elementId &&
                                edge.targetElementId === item.elementId,
                            )
                            .map((edge) => (
                              <SelectItem key={edge.id} value={edge.id}>
                                {edge.description || t("scenarios.connection")}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    )}
                  </li>
                ))}
              </ol>
              <Button
                variant="outline"
                size="sm"
                disabled={draft.scenario.steps.length >= 200 || command.isPending}
                onClick={() => {
                  const element = visible[0];
                  if (element)
                    updateSteps([
                      ...draft.scenario.steps,
                      { key: crypto.randomUUID(), elementId: element.id, title: element.name },
                    ]);
                }}
              >
                <Plus size={14} />
                {t("scenarios.addStep")}
              </Button>
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={command.isPending}
                  onClick={() => {
                    setDraft(null);
                    setError(null);
                  }}
                >
                  {t("common.cancel")}
                </Button>
                <Button size="sm" disabled={command.isPending} onClick={() => void save()}>
                  {t("common.save")}
                </Button>
              </div>
            </div>
          ) : selected ? (
            <div className="space-y-3">
              {playing && step ? (
                <div aria-live="polite">
                  <p className="text-xs text-muted-foreground">
                    {t("scenarios.progress", { number: index + 1, count: selected.steps.length })}
                  </p>
                  <h3 className="mt-1 break-words text-sm font-medium">{step.title}</h3>
                  {step.description && (
                    <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                      {step.description}
                    </p>
                  )}
                  {stale && <p className="mt-2 text-xs text-destructive">{t("scenarios.stale")}</p>}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {t("scenarios.ready", { count: selected.steps.length })}
                </p>
              )}
              <div className="flex items-center gap-1">
                {playing ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={index === 0}
                      onClick={() => setIndex(index - 1)}
                    >
                      <ChevronLeft size={14} />
                      {t("scenarios.back")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={index >= selected.steps.length - 1}
                      onClick={() => setIndex(index + 1)}
                    >
                      {t("scenarios.next")}
                      <ChevronRight size={14} />
                    </Button>
                    <Button
                      size="iconSm"
                      variant="ghost"
                      aria-label={t("scenarios.stop")}
                      onClick={() => setPlaying(false)}
                    >
                      <X size={14} />
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => {
                      setIndex(0);
                      setPlaying(true);
                    }}
                  >
                    <Play size={14} />
                    {t("scenarios.play")}
                  </Button>
                )}
                <div className="ml-auto flex gap-1">
                  <Button
                    size="iconSm"
                    variant="ghost"
                    aria-label={t("scenarios.edit")}
                    disabled={command.isPending}
                    onClick={edit}
                  >
                    <Pencil size={14} />
                  </Button>
                  <Button
                    size="iconSm"
                    variant="ghost"
                    aria-label={t("scenarios.delete")}
                    disabled={command.isPending || !workspace.data}
                    onClick={() => setDeleting(workspace.data?.revision ?? null)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
              {deleting !== null && (
                <div className="space-y-2 border-t border-border pt-2">
                  <p className="text-xs">{t("scenarios.confirmDelete", { name: selected.name })}</p>
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={command.isPending}
                      onClick={() => setDeleting(null)}
                    >
                      {t("common.cancel")}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={command.isPending}
                      onClick={async () => {
                        if (
                          await persist(
                            view.settings.scenarios.filter(
                              (scenario) => scenario.id !== selected.id,
                            ),
                            deleting,
                          )
                        ) {
                          setSelectedId(null);
                          setPlaying(false);
                        }
                      }}
                    >
                      {t("scenarios.delete")}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t("scenarios.empty")}</p>
          )}
          {error && (
            <p role="alert" className="mt-3 text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
