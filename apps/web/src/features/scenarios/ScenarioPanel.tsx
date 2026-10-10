import {
  type ArchitectureElement,
  type ArchitectureOperationInput,
  type ArchitectureRelationship,
  type ViewDetail,
  type ViewScenario,
  ViewScenarioSchema,
} from "@structsmith/contracts";
import { scenarioProblems, scenarioToMermaid } from "@structsmith/domain";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  ListOrdered,
  MessageCircle,
  MonitorPlay,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  Workflow,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useChatStore } from "@/features/chat/store";
import { useCopyAgentReference } from "@/features/reference/useCopyAgentReference";
import { useApplyOperations, useViews, useWorkspace } from "@/hooks/useApi";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editor";
import { type DraftScenario, keyedSteps, ScenarioEditor } from "./ScenarioEditor";
import { stepsFromSelection } from "./selectionSteps";
import { type ScenarioSpotlight, scenarioSpotlight, stepViewId } from "./spotlight";

/** Chooser values for scenarios on other views; this view's scenarios use their own IDs. */
const ELSEWHERE = "elsewhere:";

/** Keys that belong to a focused form control or an open menu rather than to playback. */
function ownsKeys(target: EventTarget | null): boolean {
  if (document.querySelector('[role="menu"], [role="listbox"]')) return true;
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
  onSpotlight,
}: {
  workspaceId: string;
  view: ViewDetail;
  elements: readonly ArchitectureElement[];
  relationships: readonly ArchitectureRelationship[];
  onSpotlight: (spotlight: ScenarioSpotlight | null) => void;
}) {
  const { t } = useTranslation();
  const workspace = useWorkspace(workspaceId);
  const views = useViews(workspaceId);
  const command = useApplyOperations(workspaceId);
  const selection = useEditorStore((state) => state.selection);
  const playback = useEditorStore((state) => state.playback);
  const presenting = useEditorStore((state) => state.presenting);
  const { setPlayback, setPresenting } = useEditorStore.getState();
  const copyReference = useCopyAgentReference();
  const ask = useChatStore((state) => state.ask);
  const [expanded, setExpanded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    scenario: DraftScenario;
    revision: number;
    existing: boolean;
    resumeAt: number | null;
  } | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const viewList = views.data ?? [];
  const viewElementIds = view.elements.map((row) => row.elementId);
  const scenariosOf = (viewId: string) =>
    viewId === view.id
      ? view.settings.scenarios
      : (viewList.find((item) => item.id === viewId)?.settings.scenarios ?? []);
  // The walkthrough may belong to another view when one of its steps brought us here.
  const playing = playback
    ? scenariosOf(playback.ownerViewId).find((item) => item.id === playback.scenarioId)
    : undefined;
  const browsing = view.settings.scenarios.find((item) => item.id === selectedId);
  const scenario = playing ?? browsing;
  const ownerViewId = playing ? (playback?.ownerViewId ?? view.id) : view.id;
  const count = scenario?.steps.length ?? 0;
  const index = Math.min(playback?.index ?? 0, Math.max(count - 1, 0));
  const step = playing && !playback?.finished ? playing.steps[index] : undefined;
  const open = expanded || Boolean(playing) || Boolean(draft);
  const elsewhere = viewList.filter(
    (other) => other.id !== view.id && other.settings.scenarios.length,
  );
  const total =
    view.settings.scenarios.length +
    elsewhere.reduce((sum, other) => sum + other.settings.scenarios.length, 0);
  const nameOf = (id: string | undefined) => elements.find((element) => element.id === id)?.name;
  const edgeName = (edge: ArchitectureRelationship) =>
    edge.description ||
    `${nameOf(edge.sourceElementId) ?? "?"} → ${nameOf(edge.targetElementId) ?? "?"}`;
  const arrival = relationships.find((edge) => edge.id === step?.relationshipId);
  const stepHere = step && stepViewId(step, ownerViewId) === view.id;
  const stale =
    playing && stepHere
      ? scenarioProblems(
          [playing],
          {
            viewId: ownerViewId,
            elementIds: ownerViewId === view.id ? viewElementIds : [],
            views: new Map([[view.id, { name: view.name, elementIds: viewElementIds }]]),
          },
          elements,
          relationships,
        ).some((problem) => problem.stepIndex === index)
      : false;

  const spotlight = useMemo(
    () =>
      playing && playback && !playback.finished && !stale
        ? scenarioSpotlight(playing, index, view.id, playback.ownerViewId, relationships)
        : null,
    [playing, playback, index, view.id, relationships, stale],
  );
  useEffect(() => onSpotlight(spotlight), [spotlight, onSpotlight]);
  useEffect(() => () => onSpotlight(null), [onSpotlight]);

  const go = (next: number) => {
    if (!playback) return;
    if (next >= count) setPlayback({ ...playback, index: count - 1, finished: true });
    else setPlayback({ ...playback, index: Math.max(next, 0), finished: false });
  };
  const start = (item: ViewScenario, from = 0) =>
    setPlayback({ ownerViewId: view.id, scenarioId: item.id, index: from });
  const stop = () => {
    // Stopping keeps the scenario chosen, so Play restarts it from here.
    if (playing && ownerViewId === view.id) setSelectedId(playing.id);
    setPlayback(null);
  };

  // Playback owns the arrow keys so they move between steps instead of nudging the
  // focused element; capture runs before the canvas's own shortcuts.
  useEffect(() => {
    if (!playback || !count) return;
    const onKey = (event: KeyboardEvent) => {
      if (ownsKeys(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      const { playback: current } = useEditorStore.getState();
      if (!current) return;
      const at = current.finished ? count : current.index;
      const moves: Record<string, number> = {
        ArrowRight: at + 1,
        PageDown: at + 1,
        ArrowLeft: at - 1,
        PageUp: at - 1,
        Home: 0,
        End: count - 1,
      };
      if (event.key !== "Escape" && !(event.key in moves)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        if (useEditorStore.getState().presenting) setPresenting(false);
        else setPlayback(null);
        return;
      }
      const next = moves[event.key] ?? at;
      if (next >= count) setPlayback({ ...current, index: count - 1, finished: true });
      else setPlayback({ ...current, index: Math.max(next, 0), finished: false });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [playback, count, setPlayback, setPresenting]);

  const choose = (value: string) => {
    if (value.startsWith(ELSEWHERE)) {
      const [viewIndex, scenarioIndex] = value.slice(ELSEWHERE.length).split(":").map(Number);
      const other = elsewhere[viewIndex ?? -1];
      const item = other?.settings.scenarios[scenarioIndex ?? -1];
      // Playback follows the first step to its view.
      if (other && item) setPlayback({ ownerViewId: other.id, scenarioId: item.id, index: 0 });
      return;
    }
    setSelectedId(value);
    setPlayback(null);
    setDeleting(null);
    setError(null);
  };
  const edit = (item: ViewScenario) => {
    if (!workspace.data) return;
    setDraft({
      scenario: { ...structuredClone(item), steps: keyedSteps(item.steps) },
      revision: workspace.data.revision,
      existing: true,
      resumeAt: playing?.id === item.id && !playback?.finished ? index : null,
    });
    setSelectedId(item.id);
    setPlayback(null);
    setDeleting(null);
    setError(null);
  };
  const create = () => {
    const element = elements.find((candidate) => viewElementIds.includes(candidate.id));
    if (!workspace.data || !element) return;
    const picked = stepsFromSelection(
      selection,
      undefined,
      viewElementIds,
      elements,
      relationships,
    );
    setDraft({
      revision: workspace.data.revision,
      existing: false,
      resumeAt: null,
      scenario: {
        id: crypto.randomUUID(),
        name: "",
        steps: keyedSteps(
          picked && picked !== "outside"
            ? picked
            : [{ elementId: element.id, title: element.name }],
        ),
      },
    });
    setPlayback(null);
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
      setDeleting(null);
      setError(null);
      return true;
    } catch (failure) {
      setDeleting(null);
      // The server names the step and reference at fault; show it rather than a generic message.
      setError(
        failure instanceof Error && failure.message ? failure.message : t("scenarios.saveFailed"),
      );
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
    const { id, name, steps } = parsed.data;
    const saved = await persist(
      draft.existing
        ? { op: "updateViewScenario", viewId: view.id, scenarioId: id, data: { name, steps } }
        : { op: "addViewScenario", viewId: view.id, data: parsed.data },
      draft.revision,
    );
    if (!saved) return;
    const resumeAt = draft.resumeAt;
    setDraft(null);
    setSelectedId(id);
    if (resumeAt !== null)
      setPlayback({
        ownerViewId: view.id,
        scenarioId: id,
        index: Math.min(resumeAt, steps.length - 1),
      });
  };
  const cancel = () => {
    const resumeAt = draft?.resumeAt ?? null;
    const id = draft?.scenario.id;
    setDraft(null);
    setError(null);
    if (resumeAt !== null && id)
      setPlayback({ ownerViewId: view.id, scenarioId: id, index: resumeAt });
  };

  const actions = scenario && (
    <ScenarioActions
      scenario={scenario}
      editable={ownerViewId === view.id && !command.isPending && Boolean(workspace.data)}
      presenting={presenting}
      playing={Boolean(playing)}
      onPresent={() => {
        if (!playing) start(scenario, 0);
        setPresenting(!presenting);
      }}
      onCopyReference={() =>
        void copyReference({
          type: "scenario",
          workspaceId,
          targetId: scenario.id,
          label: scenario.name,
          viewId: ownerViewId,
        })
      }
      onAsk={() =>
        ask({
          type: "scenario",
          workspaceId,
          targetId: scenario.id,
          label: scenario.name,
          viewId: ownerViewId,
        })
      }
      onCopyMermaid={async () => {
        try {
          await navigator.clipboard.writeText(scenarioToMermaid(scenario, elements));
          toast.success(t("scenarios.mermaidCopied"));
        } catch {
          toast.error(t("scenarios.copyFailed"));
        }
      }}
      onEdit={() => edit(scenario)}
      onDelete={() => {
        setPlayback(null);
        setSelectedId(scenario.id);
        setDeleting(workspace.data?.revision ?? null);
      }}
    />
  );

  return (
    <section
      aria-label={t("scenarios.title")}
      data-canvas-chrome
      className={cn(
        "pointer-events-auto rounded-lg bg-background shadow-lg",
        draft
          ? "w-[min(46rem,calc(100vw-2rem))]"
          : open
            ? "w-[min(22rem,calc(100vw-2rem))]"
            : "w-auto",
      )}
    >
      <div className="flex min-w-0 items-center gap-1 p-1.5">
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={open}
          disabled={Boolean(draft)}
          title={t("scenarios.countHint", { here: view.settings.scenarios.length, total })}
          onClick={() => {
            if (playing) stop();
            setExpanded(!open);
          }}
        >
          <ListOrdered size={14} />
          {t("scenarios.title")}
          {total > 0 && <span className="text-xs tabular-nums text-muted-foreground">{total}</span>}
        </Button>
        {playing ? (
          <>
            <h2 className="min-w-0 flex-1 truncate text-sm font-medium" title={playing.name}>
              {playing.name}
            </h2>
            <Button
              size="iconSm"
              variant={presenting ? "secondary" : "ghost"}
              aria-pressed={presenting}
              aria-label={t(presenting ? "scenarios.stopPresenting" : "scenarios.present")}
              title={t("scenarios.presentHint")}
              onClick={() => setPresenting(!presenting)}
            >
              <MonitorPlay size={14} />
            </Button>
            {actions}
            <Button
              size="iconSm"
              variant="ghost"
              aria-label={t("scenarios.stop")}
              title={t("scenarios.stop")}
              onClick={stop}
            >
              <X size={14} />
            </Button>
          </>
        ) : (
          open &&
          !draft && (
            <>
              <Select
                value={browsing?.id ?? ""}
                onValueChange={choose}
                disabled={command.isPending}
              >
                <SelectTrigger aria-label={t("scenarios.choose")} className="h-7 min-w-0 flex-1">
                  <SelectValue placeholder={t("scenarios.choose")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>{t("scenarios.thisView")}</SelectLabel>
                    {view.settings.scenarios.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
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
                      {other.settings.scenarios.map((item, scenarioIndex) => (
                        <SelectItem
                          key={item.id}
                          value={`${ELSEWHERE}${viewIndex}:${scenarioIndex}`}
                        >
                          {item.name}
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
                  !viewElementIds.length ||
                  command.isPending ||
                  view.settings.scenarios.length >= 100
                }
                onClick={create}
              >
                <Plus size={14} />
              </Button>
            </>
          )
        )}
      </div>
      {open && (
        <div className="border-t border-border p-3">
          {draft ? (
            <ScenarioEditor
              view={view}
              views={viewList}
              elements={elements}
              relationships={relationships}
              draft={draft.scenario}
              busy={command.isPending}
              onChange={(scenarioDraft) => {
                setDraft({ ...draft, scenario: scenarioDraft });
                setError(null);
              }}
              onCancel={cancel}
              onSave={() => void save()}
            />
          ) : playing && playback?.finished ? (
            <div className="space-y-3" aria-live="polite">
              <div>
                <h3 className="text-base font-semibold">{t("scenarios.finished")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("scenarios.finishedHint", { count })}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => go(0)}>
                  <RotateCcw size={14} />
                  {t("scenarios.restart")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setPlayback(null);
                    setSelectedId(null);
                    setExpanded(true);
                  }}
                >
                  {t("scenarios.chooseAnother")}
                </Button>
              </div>
            </div>
          ) : playing && step ? (
            <div className="space-y-3">
              <ol className="flex gap-0.5" aria-label={t("scenarios.jumpTo")}>
                {playing.steps.map((entry, at) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: steps have no ID; position is the identity.
                  <li key={at} className="min-w-0 flex-1">
                    <button
                      type="button"
                      aria-label={`${t("scenarios.goToStep", { number: at + 1 })}: ${entry.title}`}
                      aria-current={at === index ? "step" : undefined}
                      title={`${at + 1}. ${entry.title}`}
                      className={cn(
                        "block h-1.5 w-full rounded-full transition-colors",
                        at === index ? "bg-primary" : at < index ? "bg-primary/40" : "bg-muted",
                      )}
                      onClick={() => go(at)}
                    />
                  </li>
                ))}
              </ol>
              <div aria-live="polite" className="space-y-1">
                <p className="text-xs tabular-nums text-muted-foreground">
                  {t("scenarios.progress", { number: index + 1, count })}
                  {step.viewId && step.viewId !== ownerViewId && (
                    <>
                      {" · "}
                      {t("scenarios.onView", {
                        view: viewList.find((item) => item.id === step.viewId)?.name ?? "",
                      })}
                    </>
                  )}
                </p>
                <h3 className="break-words text-base font-semibold leading-snug">{step.title}</h3>
                {arrival && !stale && (
                  <p className="break-words text-sm font-medium text-primary">
                    {t(step.response ? "scenarios.replyOver" : "scenarios.arrivesOver", {
                      name: edgeName(arrival),
                    })}
                  </p>
                )}
                {step.description && (
                  <p className="max-h-[30vh] overflow-y-auto whitespace-pre-wrap break-words text-sm text-muted-foreground">
                    {step.description}
                  </p>
                )}
                {stale && <p className="text-sm text-destructive">{t("scenarios.stale")}</p>}
              </div>
              <div className="flex items-center justify-between gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={index === 0}
                  onClick={() => go(index - 1)}
                >
                  <ChevronLeft size={14} />
                  {t("scenarios.back")}
                </Button>
                <Button size="sm" onClick={() => go(index + 1)}>
                  {index === count - 1 ? t("scenarios.finish") : t("scenarios.next")}
                  <ChevronRight size={14} />
                </Button>
              </div>
              {index === 0 && (
                <p className="text-xs text-muted-foreground">{t("scenarios.keyboardHint")}</p>
              )}
            </div>
          ) : browsing ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{t("scenarios.ready", { count })}</p>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => start(browsing)}>
                  <Play size={14} />
                  {t("scenarios.play")}
                </Button>
                <div className="ml-auto">{actions}</div>
              </div>
              {deleting !== null && (
                <div className="space-y-2 border-t border-border pt-2">
                  <p className="text-sm">{t("scenarios.confirmDelete", { name: browsing.name })}</p>
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
                            { op: "deleteViewScenario", viewId: view.id, scenarioId: browsing.id },
                            deleting,
                          )
                        )
                          setSelectedId(null);
                      }}
                    >
                      {t("scenarios.delete")}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t(total ? "scenarios.chooseHint" : "scenarios.empty", { count: total })}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/** Management actions live in one menu so playback controls never compete with them. */
function ScenarioActions({
  scenario,
  editable,
  presenting,
  playing,
  onPresent,
  onCopyReference,
  onAsk,
  onCopyMermaid,
  onEdit,
  onDelete,
}: {
  scenario: ViewScenario;
  editable: boolean;
  presenting: boolean;
  playing: boolean;
  onPresent: () => void;
  onCopyReference: () => void;
  onAsk: () => void;
  onCopyMermaid: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="iconSm"
          variant="ghost"
          aria-label={t("scenarios.actions")}
          title={t("scenarios.actions")}
        >
          <MoreHorizontal size={14} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" aria-label={scenario.name}>
        {!playing && (
          <DropdownMenuItem onSelect={onPresent}>
            <MonitorPlay size={14} />
            {t(presenting ? "scenarios.stopPresenting" : "scenarios.present")}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={onCopyReference}>
          <Copy size={14} />
          {t("reference.copy")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onAsk}>
          <MessageCircle size={14} />
          {t("chat.askAbout")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onCopyMermaid}>
          <Workflow size={14} />
          {t("scenarios.copyMermaid")}
        </DropdownMenuItem>
        {editable && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil size={14} />
              {t("scenarios.edit")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={onDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 size={14} />
              {t("scenarios.delete")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
