import type {
  ArchitectureElement,
  ArchitectureRelationship,
  ArchitectureView,
  ViewDetail,
  ViewScenario,
  ViewScenarioStep,
} from "@structsmith/contracts";
import { clearInvalidScenarioArrivals } from "@structsmith/domain";
import { ArrowDown, ArrowUp, MousePointerClick, Plus, Trash2, X } from "lucide-react";
import { useId, useState } from "react";
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
import { useView } from "@/hooks/useApi";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/editor";
import { highlightsFromSelection, stepsFromSelection } from "./selectionSteps";

export type DraftStep = ViewScenarioStep & { key: string };
export type DraftScenario = Omit<ViewScenario, "steps"> & { steps: DraftStep[] };

const NOTE = "__note";
const NO_ARRIVAL = "none";
const REPLY = "reply:";
const OWN_VIEW = "__own";
const ELEMENT = "element:";
const CONNECTION = "connection:";

export const keyedSteps = (steps: readonly ViewScenarioStep[]): DraftStep[] =>
  steps.map((entry) => ({ ...entry, key: crypto.randomUUID() }));

/**
 * Two panes: the ordered step list on the left and the selected step's details on
 * the right, so long scenarios stay navigable instead of one tall form.
 */
export function ScenarioEditor({
  view,
  views,
  elements,
  relationships,
  draft,
  busy,
  onChange,
  onCancel,
  onSave,
}: {
  view: ViewDetail;
  views: readonly ArchitectureView[];
  elements: readonly ArchitectureElement[];
  relationships: readonly ArchitectureRelationship[];
  draft: DraftScenario;
  busy: boolean;
  onChange: (draft: DraftScenario) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  const fieldId = useId();
  const selection = useEditorStore((state) => state.selection);
  const [current, setCurrent] = useState(0);
  const index = Math.min(current, draft.steps.length - 1);
  const step = draft.steps[index];
  const viewElementIds = view.elements.map((row) => row.elementId);
  const visible = elements.filter((element) => viewElementIds.includes(element.id));
  const others = views.filter((other) => other.id !== view.id);

  const setSteps = (steps: DraftStep[], select = index) => {
    onChange({ ...draft, steps: clearInvalidScenarioArrivals(steps, relationships) });
    setCurrent(Math.max(0, Math.min(select, steps.length - 1)));
  };
  const patch = (changes: Partial<ViewScenarioStep>) =>
    setSteps(draft.steps.map((entry, at) => (at === index ? { ...entry, ...changes } : entry)));
  const move = (offset: -1 | 1) => {
    const target = index + offset;
    const steps = [...draft.steps];
    const [moved] = steps.splice(index, 1);
    if (!moved || target < 0 || target > steps.length) return;
    steps.splice(target, 0, moved);
    setSteps(steps, target);
  };
  const picked = stepsFromSelection(
    selection,
    draft.steps.at(-1),
    viewElementIds,
    elements,
    relationships,
  );

  return (
    <div className="flex max-h-[max(18rem,calc(100vh-15rem))] flex-col gap-3">
      <div className="space-y-1">
        <Label htmlFor={`${fieldId}-name`}>{t("scenarios.name")}</Label>
        <Input
          id={`${fieldId}-name`}
          maxLength={200}
          value={draft.name}
          disabled={busy}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
        />
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,13rem)_minmax(0,1fr)] gap-3">
        <div className="flex min-h-0 flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">{t("scenarios.steps")}</p>
          <ol className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
            {draft.steps.map((entry, at) => (
              <li key={entry.key}>
                <button
                  type="button"
                  aria-current={at === index ? "step" : undefined}
                  className={cn(
                    "flex w-full items-baseline gap-2 rounded px-2 py-1 text-left text-xs",
                    at === index ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                  )}
                  onClick={() => setCurrent(at)}
                >
                  <span className="tabular-nums text-muted-foreground">{at + 1}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {entry.title || t("scenarios.untitled")}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <div className="flex flex-col gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={draft.steps.length >= 200 || busy || !visible[0]}
              onClick={() => {
                const element = visible[0];
                if (!element) return;
                setSteps(
                  [...draft.steps, ...keyedSteps([{ elementId: element.id, title: element.name }])],
                  draft.steps.length,
                );
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
                !picked || picked === "outside" || draft.steps.length + picked.length > 200 || busy
              }
              onClick={() => {
                if (picked && picked !== "outside")
                  setSteps([...draft.steps, ...keyedSteps(picked)], draft.steps.length);
              }}
            >
              <MousePointerClick size={14} />
              {t("scenarios.addSelection")}
            </Button>
            {picked === "outside" && (
              <p className="text-xs text-muted-foreground">{t("scenarios.selectionNotInView")}</p>
            )}
          </div>
        </div>
        {step && (
          <StepDetails
            key={step.key}
            view={view}
            others={others}
            elements={elements}
            visible={visible}
            relationships={relationships}
            step={step}
            previous={draft.steps[index - 1]}
            number={index + 1}
            count={draft.steps.length}
            busy={busy}
            onPatch={patch}
            onMove={move}
            onRemove={() => setSteps(draft.steps.filter((_, at) => at !== index))}
          />
        )}
      </div>
      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button size="sm" disabled={busy} onClick={onSave}>
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}

function StepDetails({
  view,
  others,
  elements,
  visible,
  relationships,
  step,
  previous,
  number,
  count,
  busy,
  onPatch,
  onMove,
  onRemove,
}: {
  view: ViewDetail;
  others: readonly ArchitectureView[];
  elements: readonly ArchitectureElement[];
  visible: readonly ArchitectureElement[];
  relationships: readonly ArchitectureRelationship[];
  step: DraftStep;
  previous: DraftStep | undefined;
  number: number;
  count: number;
  busy: boolean;
  onPatch: (changes: Partial<ViewScenarioStep>) => void;
  onMove: (offset: -1 | 1) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const selection = useEditorStore((state) => state.selection);
  // A step on another view lists that view's elements; the canvas shows this one.
  const other = useView(step.viewId ?? null);
  const stepElementIds = step.viewId
    ? (other.data?.elements.map((row) => row.elementId) ?? [])
    : view.elements.map((row) => row.elementId);
  const choices = step.viewId
    ? elements.filter((element) => stepElementIds.includes(element.id))
    : visible;
  const nameOf = (id: string) => elements.find((element) => element.id === id)?.name ?? id;
  const edgeName = (edge: ArchitectureRelationship) =>
    edge.description || `${nameOf(edge.sourceElementId)} → ${nameOf(edge.targetElementId)}`;
  const sameView = previous?.viewId === step.viewId;
  const requests = relationships.filter(
    (edge) =>
      edge.sourceElementId === previous?.elementId && edge.targetElementId === step.elementId,
  );
  const replies = relationships.filter(
    (edge) =>
      edge.sourceElementId === step.elementId && edge.targetElementId === previous?.elementId,
  );
  const highlightElements = step.highlightElementIds ?? [];
  const highlightRelationships = step.highlightRelationshipIds ?? [];
  const candidates = [
    ...choices
      .filter((element) => element.id !== step.elementId && !highlightElements.includes(element.id))
      .map((element) => ({ value: `${ELEMENT}${element.id}`, label: element.name })),
    ...relationships
      .filter(
        (edge) =>
          stepElementIds.includes(edge.sourceElementId) &&
          stepElementIds.includes(edge.targetElementId) &&
          !highlightRelationships.includes(edge.id),
      )
      .map((edge) => ({ value: `${CONNECTION}${edge.id}`, label: edgeName(edge) })),
  ];
  const fromCanvas = step.viewId
    ? null
    : highlightsFromSelection(selection, stepElementIds, relationships);
  const addHighlights = (elementIds: string[], relationshipIds: string[]) =>
    onPatch({
      highlightElementIds: [...new Set([...highlightElements, ...elementIds])].filter(
        (id) => id !== step.elementId,
      ),
      highlightRelationshipIds: [...new Set([...highlightRelationships, ...relationshipIds])],
    });

  return (
    <div className="min-h-0 space-y-2 overflow-y-auto pr-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium">{t("scenarios.stepNumber", { number })}</span>
        <div className="flex gap-0.5">
          <Button
            size="iconSm"
            variant="ghost"
            disabled={number === 1 || busy}
            aria-label={t("scenarios.moveUp")}
            title={t("scenarios.moveUp")}
            onClick={() => onMove(-1)}
          >
            <ArrowUp size={14} />
          </Button>
          <Button
            size="iconSm"
            variant="ghost"
            disabled={number === count || busy}
            aria-label={t("scenarios.moveDown")}
            title={t("scenarios.moveDown")}
            onClick={() => onMove(1)}
          >
            <ArrowDown size={14} />
          </Button>
          <Button
            size="iconSm"
            variant="ghost"
            disabled={count === 1 || busy}
            aria-label={t("scenarios.removeStep")}
            title={t("scenarios.removeStep")}
            onClick={onRemove}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      </div>
      {others.length > 0 && (
        <Select
          value={step.viewId ?? OWN_VIEW}
          disabled={busy}
          onValueChange={(value) =>
            onPatch({
              viewId: value === OWN_VIEW ? undefined : value,
              elementId: undefined,
              relationshipId: undefined,
              response: undefined,
              highlightElementIds: undefined,
              highlightRelationshipIds: undefined,
            })
          }
        >
          <SelectTrigger aria-label={t("scenarios.stepView")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={OWN_VIEW}>{t("scenarios.thisView")}</SelectItem>
            {others.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {step.viewId && (
        <p className="text-xs text-muted-foreground">
          {other.data ? t("scenarios.otherViewHint") : t("scenarios.noElements")}
        </p>
      )}
      <Select
        value={step.elementId ?? NOTE}
        disabled={busy}
        onValueChange={(value) => onPatch({ elementId: value === NOTE ? undefined : value })}
      >
        <SelectTrigger aria-label={t("scenarios.element")}>
          <SelectValue placeholder={t("scenarios.missingElement")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NOTE}>{t("scenarios.noteStep")}</SelectItem>
          {choices.map((element) => (
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
        value={step.title}
        disabled={busy}
        onChange={(event) => onPatch({ title: event.target.value })}
      />
      <Textarea
        aria-label={t("scenarios.description")}
        placeholder={t("scenarios.description")}
        maxLength={2000}
        rows={3}
        value={step.description ?? ""}
        disabled={busy}
        onChange={(event) => onPatch({ description: event.target.value })}
      />
      {previous?.elementId && step.elementId && sameView && (
        <Select
          value={
            step.relationshipId ? `${step.response ? REPLY : ""}${step.relationshipId}` : NO_ARRIVAL
          }
          disabled={busy}
          onValueChange={(value) =>
            onPatch(
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
            <SelectItem value={NO_ARRIVAL}>{t("scenarios.noConnection")}</SelectItem>
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
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">{t("scenarios.highlights")}</p>
        {(highlightElements.length > 0 || highlightRelationships.length > 0) && (
          <ul className="flex flex-wrap gap-1">
            {[
              ...highlightElements.map((id) => ({
                id,
                kind: "element" as const,
                label: nameOf(id),
              })),
              ...highlightRelationships.map((id) => {
                const edge = relationships.find((candidate) => candidate.id === id);
                return { id, kind: "connection" as const, label: edge ? edgeName(edge) : id };
              }),
            ].map((item) => (
              <li
                key={`${item.kind}:${item.id}`}
                className="flex max-w-full items-center gap-1 rounded-full border border-border bg-muted/50 py-0.5 pl-2 pr-0.5 text-xs"
              >
                <span className="min-w-0 truncate">{item.label}</span>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={t("scenarios.removeHighlight", { name: item.label })}
                  className="rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  onClick={() =>
                    onPatch(
                      item.kind === "element"
                        ? { highlightElementIds: highlightElements.filter((id) => id !== item.id) }
                        : {
                            highlightRelationshipIds: highlightRelationships.filter(
                              (id) => id !== item.id,
                            ),
                          },
                    )
                  }
                >
                  <X size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-1">
          <Select
            value=""
            disabled={busy || !candidates.length}
            onValueChange={(value) =>
              value.startsWith(ELEMENT)
                ? addHighlights([value.slice(ELEMENT.length)], [])
                : addHighlights([], [value.slice(CONNECTION.length)])
            }
          >
            <SelectTrigger aria-label={t("scenarios.addHighlight")} className="h-8 min-w-0 flex-1">
              <SelectValue placeholder={t("scenarios.addHighlight")} />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((candidate) => (
                <SelectItem key={candidate.value} value={candidate.value}>
                  {candidate.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!step.viewId && (
            <Button
              size="sm"
              variant="outline"
              title={t("scenarios.addSelectionHint")}
              disabled={busy || !fromCanvas || fromCanvas === "outside"}
              onClick={() => {
                if (fromCanvas && fromCanvas !== "outside")
                  addHighlights(fromCanvas.elementIds, fromCanvas.relationshipIds);
              }}
            >
              <MousePointerClick size={14} />
              {t("scenarios.addSelection")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
