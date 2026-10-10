import type {
  ArchitectureElement,
  ArchitectureRelationship,
  ViewScenario,
  ViewScenarioStep,
} from "@structsmith/contracts";
import { ruleViolation } from "./errors";

type ScenarioEdge = Pick<ArchitectureRelationship, "id" | "sourceElementId" | "targetElementId">;

export type ScenarioProblemCode =
  | "SCENARIO_ELEMENT_MISSING"
  | "SCENARIO_ELEMENT_NOT_IN_VIEW"
  | "SCENARIO_VIEW_MISSING"
  | "SCENARIO_HIGHLIGHT_INVALID"
  | "SCENARIO_ARRIVAL_INVALID";

export interface ScenarioProblem {
  code: ScenarioProblemCode;
  scenarioId: string;
  stepIndex: number;
  message: string;
  elementId?: string;
  relationshipId?: string;
}

/**
 * Where a scenario's steps can appear: its own view, and (when known) every view of
 * the workspace by ID, for steps that continue on another view. Without `views`,
 * steps on other views are not checked, which suits clients that hold one view.
 */
export interface ScenarioContext {
  viewId?: string;
  elementIds: readonly string[];
  views?: ReadonlyMap<string, { name: string; elementIds: readonly string[] }>;
}

/** A step on its scenario's own view may omit viewId or repeat it. */
const stepView = (step: Pick<ViewScenarioStep, "viewId">, owner: string | undefined) =>
  step.viewId && step.viewId !== owner ? step.viewId : undefined;

/**
 * A request arrives over source → target. A response travels back over the
 * same connection, so it must run from this step's element to the previous one.
 */
export function scenarioArrivalMatches(
  step: Pick<ViewScenarioStep, "elementId" | "response">,
  previous: Pick<ViewScenarioStep, "elementId"> | undefined,
  edge: Pick<ArchitectureRelationship, "sourceElementId" | "targetElementId"> | undefined,
): boolean {
  if (!previous?.elementId || !step.elementId || !edge) return false;
  const [from, to] = step.response
    ? [step.elementId, previous.elementId]
    : [previous.elementId, step.elementId];
  return edge.sourceElementId === from && edge.targetElementId === to;
}

/** Reordering changes which edge can arrive from the preceding step. */
export function clearInvalidScenarioArrivals<T extends ViewScenarioStep>(
  steps: readonly T[],
  relationships: readonly ScenarioEdge[],
): T[] {
  const edges = new Map(relationships.map((edge) => [edge.id, edge]));
  return steps.map((step, index) => {
    if (!step.relationshipId && !step.response) return step;
    const previous = steps[index - 1];
    const edge = step.relationshipId ? edges.get(step.relationshipId) : undefined;
    if (previous?.viewId === step.viewId && scenarioArrivalMatches(step, previous, edge))
      return step;
    return { ...step, relationshipId: undefined, response: undefined };
  });
}

/**
 * Every reference problem in a view's scenarios. Saved scenarios may become
 * stale after model edits; they remain stored so the author can repair them.
 */
export function scenarioProblems(
  scenarios: readonly ViewScenario[],
  view: readonly string[] | ScenarioContext,
  elements: readonly Pick<ArchitectureElement, "id" | "name">[],
  relationships: readonly ScenarioEdge[],
): ScenarioProblem[] {
  const context: ScenarioContext = Array.isArray(view)
    ? { elementIds: view as readonly string[] }
    : (view as ScenarioContext);
  const own = new Set(context.elementIds);
  const existing = new Map(elements.map((element) => [element.id, element]));
  const edges = new Map(relationships.map((edge) => [edge.id, edge]));
  const problems: ScenarioProblem[] = [];
  for (const scenario of scenarios) {
    for (const [stepIndex, step] of scenario.steps.entries()) {
      const at = `Scenario "${scenario.name}", step ${stepIndex + 1}`;
      const base = { scenarioId: scenario.id, stepIndex };
      const viewId = stepView(step, context.viewId);
      const other = viewId ? context.views?.get(viewId) : undefined;
      if (viewId && context.views && !other) {
        problems.push({
          ...base,
          code: "SCENARIO_VIEW_MISSING",
          message: `${at}: the step's view "${viewId}" no longer exists in this workspace.`,
        });
        continue;
      }
      // Unknown when a client checks without the other views; the server always knows.
      const onView = viewId ? (other ? new Set(other.elementIds) : undefined) : own;
      const where = other ? `view "${other.name}"` : "this workspace and view";
      for (const [elementId, role] of [
        ...(step.elementId ? [[step.elementId, "the element"] as const] : []),
        ...(step.highlightElementIds ?? []).map((id) => [id, "a highlighted element"] as const),
      ]) {
        if (!existing.has(elementId))
          problems.push({
            ...base,
            code: "SCENARIO_ELEMENT_MISSING",
            elementId,
            message: `${at}: ${role} must exist in ${where}; it is no longer in the workspace.`,
          });
        else if (onView && !onView.has(elementId))
          problems.push({
            ...base,
            code: "SCENARIO_ELEMENT_NOT_IN_VIEW",
            elementId,
            message: `${at}: "${existing.get(elementId)?.name}" must exist in ${where}. Add it to the view, or place the step on a detail view that shows it when it is collapsed inside a visible parent.`,
          });
      }
      for (const relationshipId of step.highlightRelationshipIds ?? []) {
        const edge = edges.get(relationshipId);
        if (
          !edge ||
          (onView && (!onView.has(edge.sourceElementId) || !onView.has(edge.targetElementId)))
        )
          problems.push({
            ...base,
            code: "SCENARIO_HIGHLIGHT_INVALID",
            ...(edge ? { relationshipId } : {}),
            message: edge
              ? `${at}: a highlighted connection must have both ends in ${where}.`
              : `${at}: a highlighted connection no longer exists.`,
          });
      }
      if (!step.relationshipId && !step.response) continue;
      const previous = scenario.steps[stepIndex - 1];
      const edge = step.relationshipId ? edges.get(step.relationshipId) : undefined;
      const sameView = !previous || stepView(previous, context.viewId) === viewId;
      if (sameView && scenarioArrivalMatches(step, previous, edge)) continue;
      problems.push({
        ...base,
        code: "SCENARIO_ARRIVAL_INVALID",
        ...(step.relationshipId && edge ? { relationshipId: step.relationshipId } : {}),
        message: !step.relationshipId
          ? `${at}: a response needs the connection it replies over.`
          : !edge
            ? `${at}: the arrival connection no longer exists.`
            : !sameView
              ? `${at}: an arrival connection joins two steps on the same view; this step and the previous one are on different views.`
              : `${at}: the arrival connection must directly join the previous element to this element${step.response ? " (a response runs from this element back to the previous one)" : ""}. The first step and note steps have no arrival connection; implied connections are not supported.`,
      });
    }
  }
  return problems;
}

export function validateViewScenarios(
  scenarios: readonly ViewScenario[],
  view: readonly string[] | ScenarioContext,
  elements: readonly Pick<ArchitectureElement, "id" | "name">[],
  relationships: readonly ScenarioEdge[],
): void {
  const [problem] = scenarioProblems(scenarios, view, elements, relationships);
  if (problem) throw ruleViolation(problem.message);
}

/** Mermaid treats `#` and `;` as syntax inside messages; entity codes keep them literal. */
const mermaidText = (text: string) =>
  text
    .replace(/[#;]/g, (character) => (character === "#" ? "#35;" : "#59;"))
    .replace(/\s+/g, " ")
    .trim();

/**
 * The scenario as a Mermaid sequence diagram. Participants appear in the order the
 * walkthrough reaches them; arrivals become messages (replies dashed) and other
 * steps become notes.
 */
export function scenarioToMermaid(
  scenario: Pick<ViewScenario, "name" | "steps">,
  elements: readonly Pick<ArchitectureElement, "id" | "name">[],
): string {
  const names = new Map(elements.map((element) => [element.id, element.name]));
  const participants = new Map<string, string>();
  for (const step of scenario.steps)
    if (step.elementId && !participants.has(step.elementId))
      participants.set(step.elementId, `p${participants.size + 1}`);
  const ids = [...participants.values()];
  const everyone = ids.length > 1 ? `${ids[0]},${ids.at(-1)}` : ids[0];
  const lines = [
    "sequenceDiagram",
    `  title ${mermaidText(scenario.name)}`,
    ...[...participants].map(
      ([elementId, id]) =>
        `  participant ${id} as ${mermaidText(names.get(elementId) ?? elementId)}`,
    ),
  ];
  for (const [index, step] of scenario.steps.entries()) {
    const title = mermaidText(step.title);
    const to = step.elementId && participants.get(step.elementId);
    const previous = scenario.steps[index - 1]?.elementId;
    const from = previous && participants.get(previous);
    if (step.relationshipId && from && to)
      lines.push(`  ${from}${step.response ? "-->>" : "->>"}${to}: ${title}`);
    else if (to) lines.push(`  Note over ${to}: ${title}`);
    else if (everyone) lines.push(`  Note over ${everyone}: ${title}`);
    else lines.push(`  %% ${title}`);
  }
  return lines.join("\n");
}
