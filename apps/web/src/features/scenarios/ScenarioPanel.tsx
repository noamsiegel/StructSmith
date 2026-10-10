import {
  type ArchitectureElement,
  type ArchitectureOperationInput,
  type ArchitectureRelationship,
  type ViewDetail,
  type ViewScenario,
  ViewScenarioSchema,
  type ViewScenarioStep,
} from "@structsmith/contracts";
import { clearInvalidScenarioArrivals, scenarioProblems } from "@structsmith/domain";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ListOrdered,
  MousePointerClick,
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CopyReferenceButton } from "@/features/reference/CopyReferenceButton";
import { useApplyOperations, useViews, useWorkspace } from "@/hooks/useApi";
import { useEditorStore } from "@/store/editor";
import { stepsFromSelection } from "./selectionSteps";

type DraftStep = ViewScenarioStep & { key: string };
type DraftScenario = Omit<ViewScenario, "steps"> & { steps: DraftStep[] };

const NOTE = "__note";
const NO_ARRIVAL = "none";
const REPLY = "reply:";
/** Chooser values for scenarios on other views; this view's scenarios use their own IDs. */
const ELSEWHERE = "elsewhere:";

/** Keys that belong to a focused form control rather than to playback. */
function typing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

export function ScenarioPanel({
  workspaceId,
  view,
  elements,
  relationships,
  onStep,
  onOpenScenario,
}: {
  workspaceId: string;
  view: ViewDetail;
  elements: readonly ArchitectureElement[];
  relationships: readonly ArchitectureRelationship[];
  onStep: (step: ViewScenarioStep | null) => void;
  /** Opens another view and starts one of its scenarios. */
  onOpenScenario: (viewId: string, scenarioId: string) => void;
}) {
  const { t } = useTranslation();
  const fieldId = useId();
  const workspace = useWorkspace(workspaceId);
  const views = useViews(workspaceId);
  const command = useApplyOperations(workspaceId);
  const selection = useEditorStore((state) => state.selection);
  const scenarioRequest = useEditorStore((state) => state.scenarioRequest);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<{
    scenario: DraftScenario;
    revision: number;
    existing: boolean;
  } | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selected = view.settings.scenarios.find((scenario) => scenario.id === selectedId);
  const step = playing ? selected?.steps[index] : undefined;
  const viewElementIds = view.elements.map((row) => row.elementId);
  const visible = elements.filter((element) => viewElementIds.includes(element.id));
  const nameOf = (id: string | undefined) => elements.find((element) => element.id === id)?.name;
  const edgeName = (edge: ArchitectureRelationship) =>
    edge.description ||
    `${nameOf(edge.sourceElementId) ?? "?"} → ${nameOf(edge.targetElementId) ?? "?"}`;
  const arrival = relationships.find((edge) => edge.id === step?.relationshipId);
  const stale =
    selected && step
      ? scenarioProblems([selected], viewElementIds, elements, relationships).some(
          (problem) => problem.stepIndex === index,
        )
      : false;
  const count = selected?.steps.length ?? 0;
  // Scenarios belong to a view; the chooser also lists every other view's so all are reachable.
  const elsewhere = (views.data ?? []).filter(
    (other) => other.id !== view.id && other.settings.scenarios.length,
  );
  const total =
    view.settings.scenarios.length +
    elsewhere.reduce((sum, other) => sum + other.settings.scenarios.length, 0);

  useEffect(() => {
    onStep(step && !stale ? step : null);
  }, [step, stale, onStep]);
  useEffect(() => () => onStep(null), [onStep]);

  // A copied scenario reference opens its walkthrough once the view has loaded.
  useEffect(() => {
    if (!scenarioRequest || draft) return;
    if (!view.settings.scenarios.some((scenario) => scenario.id === scenarioRequest)) return;
    useEditorStore.getState().requestScenario(null);
    setOpen(true);
    setSelectedId(scenarioRequest);
    setIndex(0);
    setPlaying(true);
    setDeleting(null);
    setError(null);
  }, [scenarioRequest, view.settings.scenarios, draft]);

  // Playback owns the arrow keys so they move between steps instead of nudging the
  // focused element; capture runs before the canvas's own shortcuts.
  useEffect(() => {
    if (!playing) return;
    const onKey = (event: KeyboardEvent) => {
      if (typing(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      const move =
        event.key === "ArrowRight" || event.key === "PageDown"
          ? 1
          : event.key === "ArrowLeft" || event.key === "PageUp"
            ? -1
            : 0;
      if (!move && event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") setPlaying(false);
      else setIndex((current) => Math.min(Math.max(current + move, 0), count - 1));
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [playing, count]);

  const choose = (value: string) => {
    if (value.startsWith(ELSEWHERE)) {
      const [viewIndex, scenarioIndex] = value.slice(ELSEWHERE.length).split(":").map(Number);
      const other = elsewhere[viewIndex ?? -1];
      const scenario = other?.settings.scenarios[scenarioIndex ?? -1];
      if (other && scenario) onOpenScenario(other.id, scenario.id);
      return;
    }
    const id = value;
    setSelectedId(id);
    setIndex(0);
    setPlaying(false);
    setDeleting(null);
    setError(null);
  };
  const keyed = (steps: readonly ViewScenarioStep[]): DraftStep[] =>
    steps.map((entry) => ({ ...entry, key: crypto.randomUUID() }));
  const fromSelection = (previous: ViewScenarioStep | undefined) =>
    stepsFromSelection(selection, previous, viewElementIds, elements, relationships);
  const edit = () => {
    if (!workspace.data || !selected) return;
    setDraft({
      scenario: { ...structuredClone(selected), steps: keyed(selected.steps) },
      revision: workspace.data.revision,
      existing: true,
    });
    setPlaying(false);
    setDeleting(null);
    setError(null);
  };
  const create = () => {
    const element = visible[0];
    if (!workspace.data || !element) return;
    const picked = fromSelection(undefined);
    setDraft({
      revision: workspace.data.revision,
      existing: false,
      scenario: {
        id: crypto.randomUUID(),
        name: "",
        steps: keyed(
          picked && picked !== "outside"
            ? picked
            : [{ elementId: element.id, title: element.name }],
        ),
      },
    });
    setPlaying(false);
    setDeleting(null);
    setError(null);
  };
  const persist = async (operation: ArchitectureOperationInput, revision: number) => {
    try {
      await command.mutateAsync({
        expectedRevision: revision,
        label: t("scenarios.changed"),
        operations: [operation],
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
    if (scenarioProblems([parsed.data], viewElementIds, elements, relationships).length) {
      setError(t("scenarios.invalidReferences"));
      return;
    }
    const { id, name, steps } = parsed.data;
    const saved = await persist(
      draft.existing
        ? { op: "updateViewScenario", viewId: view.id, scenarioId: id, data: { name, steps } }
        : { op: "addViewScenario", viewId: view.id, data: parsed.data },
      draft.revision,
    );
    if (saved) choose(id);
  };
  const updateSteps = (steps: DraftStep[]) => {
    if (!draft) return;
    const cleaned = clearInvalidScenarioArrivals(steps, relationships);
    setDraft({ ...draft, scenario: { ...draft.scenario, steps: cleaned } });
    setError(null);
  };
  const patchStep = (itemIndex: number, patch: Partial<ViewScenarioStep>) =>
    draft &&
    updateSteps(
      draft.scenario.steps.map((entry, i) => (i === itemIndex ? { ...entry, ...patch } : entry)),
    );
  const picked = draft ? fromSelection(draft.scenario.steps.at(-1)) : null;

  return (
    <section
      aria-label={t("scenarios.title")}
      data-canvas-chrome
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
          {total > 0 && (
            <span
              className="text-xs tabular-nums text-muted-foreground"
              title={t("scenarios.countHint", { here: view.settings.scenarios.length, total })}
            >
              {total}
            </span>
          )}
        </Button>
        {open && !draft && (
          <>
            <Select value={selected?.id ?? ""} onValueChange={choose} disabled={command.isPending}>
              <SelectTrigger aria-label={t("scenarios.choose")} className="h-7 min-w-0 flex-1">
                <SelectValue placeholder={t("scenarios.choose")} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>{t("scenarios.thisView")}</SelectLabel>
                  {view.settings.scenarios.map((scenario) => (
                    <SelectItem key={scenario.id} value={scenario.id}>
                      {scenario.name}
                    </SelectItem>
                  ))}
                  {!view.settings.scenarios.length && (
                    <SelectLabel className="font-normal text-muted-foreground">
                      {t("scenarios.noneHere")}
                    </SelectLabel>
                  )}
                </SelectGroup>
                {elsewhere.map((other, viewIndex) => (
                  <SelectGroup key={other.id}>
                    <SelectLabel>{other.name}</SelectLabel>
                    {other.settings.scenarios.map((scenario, scenarioIndex) => (
                      <SelectItem
                        key={scenario.id}
                        value={`${ELSEWHERE}${viewIndex}:${scenarioIndex}`}
                      >
                        {scenario.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
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
            // Bounded by the viewport so Save stays visible above the creation toolbar.
            <div className="flex max-h-[max(16rem,calc(100vh-17rem))] flex-col gap-3">
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
              <ol className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                {draft.scenario.steps.map((item, itemIndex) => {
                  const previous = draft.scenario.steps[itemIndex - 1];
                  const requests = relationships.filter(
                    (edge) =>
                      edge.sourceElementId === previous?.elementId &&
                      edge.targetElementId === item.elementId,
                  );
                  const replies = relationships.filter(
                    (edge) =>
                      edge.sourceElementId === item.elementId &&
                      edge.targetElementId === previous?.elementId,
                  );
                  return (
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
                        value={item.elementId ?? NOTE}
                        disabled={command.isPending}
                        onValueChange={(value) =>
                          patchStep(itemIndex, { elementId: value === NOTE ? undefined : value })
                        }
                      >
                        <SelectTrigger aria-label={t("scenarios.element")}>
                          <SelectValue placeholder={t("scenarios.missingElement")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NOTE}>{t("scenarios.noteStep")}</SelectItem>
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
                        onChange={(event) => patchStep(itemIndex, { title: event.target.value })}
                      />
                      <Textarea
                        aria-label={t("scenarios.description")}
                        placeholder={t("scenarios.description")}
                        maxLength={2000}
                        rows={2}
                        value={item.description ?? ""}
                        disabled={command.isPending}
                        onChange={(event) =>
                          patchStep(itemIndex, { description: event.target.value })
                        }
                      />
                      {previous?.elementId && item.elementId && (
                        <Select
                          value={
                            item.relationshipId
                              ? `${item.response ? REPLY : ""}${item.relationshipId}`
                              : NO_ARRIVAL
                          }
                          disabled={command.isPending}
                          onValueChange={(value) =>
                            patchStep(
                              itemIndex,
                              value === NO_ARRIVAL
                                ? { relationshipId: undefined, response: undefined }
                                : value.startsWith(REPLY)
                                  ? { relationshipId: value.slice(REPLY.length), response: true }
                                  : { relationshipId: value, response: undefined },
                            )
                          }
                        >
                          <SelectTrigger aria-label={t("scenarios.arrival")}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NO_ARRIVAL}>
                              {t("scenarios.noConnection")}
                            </SelectItem>
                            {requests.map((edge) => (
                              <SelectItem key={edge.id} value={edge.id}>
                                {edge.description || t("scenarios.connection")}
                              </SelectItem>
                            ))}
                            {replies.map((edge) => (
                              <SelectItem key={`${REPLY}${edge.id}`} value={`${REPLY}${edge.id}`}>
                                {t("scenarios.replyOver", { name: edgeName(edge) })}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </li>
                  );
                })}
              </ol>
              <div className="flex flex-wrap gap-2">
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
                <Button
                  variant="outline"
                  size="sm"
                  title={t("scenarios.addSelectionHint")}
                  disabled={
                    !picked ||
                    picked === "outside" ||
                    draft.scenario.steps.length + picked.length > 200 ||
                    command.isPending
                  }
                  onClick={() => {
                    if (picked && picked !== "outside")
                      updateSteps([...draft.scenario.steps, ...keyed(picked)]);
                  }}
                >
                  <MousePointerClick size={14} />
                  {t("scenarios.addSelection")}
                </Button>
              </div>
              {picked === "outside" && (
                <p className="text-xs text-muted-foreground">{t("scenarios.selectionNotInView")}</p>
              )}
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
              {/* Controls come first so Back and Next stay put while step text changes length. */}
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
                    <Select
                      value={String(index)}
                      onValueChange={(value) => setIndex(Number(value))}
                    >
                      <SelectTrigger
                        aria-label={t("scenarios.jumpTo")}
                        className="h-7 w-auto shrink-0 gap-1 border-none px-1 text-xs tabular-nums text-muted-foreground shadow-none"
                      >
                        {t("scenarios.progress", { number: index + 1, count })}
                      </SelectTrigger>
                      <SelectContent>
                        {selected.steps.map((entry, stepIndex) => (
                          <SelectItem
                            // biome-ignore lint/suspicious/noArrayIndexKey: steps have no ID; position is the identity.
                            key={stepIndex}
                            value={String(stepIndex)}
                          >
                            {stepIndex + 1}. {entry.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={index >= count - 1}
                      onClick={() => setIndex(index + 1)}
                    >
                      {t("scenarios.next")}
                      <ChevronRight size={14} />
                    </Button>
                    <Button
                      size="iconSm"
                      variant="ghost"
                      aria-label={t("scenarios.stop")}
                      title={t("scenarios.keyboardHint")}
                      onClick={() => setPlaying(false)}
                    >
                      <X size={14} />
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    title={t("scenarios.keyboardHint")}
                    onClick={() => {
                      setIndex(0);
                      setPlaying(true);
                    }}
                  >
                    <Play size={14} />
                    {t("scenarios.play")}
                  </Button>
                )}
                <div className="ml-auto flex items-center gap-1">
                  <CopyReferenceButton
                    reference={{
                      type: "scenario",
                      workspaceId,
                      targetId: selected.id,
                      label: selected.name,
                      viewId: view.id,
                    }}
                  />
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
              {playing && step ? (
                <div aria-live="polite">
                  <h3 className="break-words text-sm font-medium">{step.title}</h3>
                  {arrival && !stale && (
                    <p className="mt-1 break-words text-xs font-medium text-primary">
                      {t(step.response ? "scenarios.replyOver" : "scenarios.arrivesOver", {
                        name: edgeName(arrival),
                      })}
                    </p>
                  )}
                  {step.description && (
                    <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                      {step.description}
                    </p>
                  )}
                  {stale && <p className="mt-2 text-xs text-destructive">{t("scenarios.stale")}</p>}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{t("scenarios.ready", { count })}</p>
              )}
              {playing && (
                <p className="text-xs text-muted-foreground">{t("scenarios.keyboardHint")}</p>
              )}
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
                            {
                              op: "deleteViewScenario",
                              viewId: view.id,
                              scenarioId: selected.id,
                            },
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
            <p className="text-xs text-muted-foreground">
              {t(total ? "scenarios.chooseHint" : "scenarios.empty", { count: total })}
            </p>
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
