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
    const edge = step.relationshipId ? edges.get(step.relationshipId) : undefined;
    if (scenarioArrivalMatches(step, steps[index - 1], edge)) return step;
    return { ...step, relationshipId: undefined, response: undefined };
  });
}

/**
 * Every reference problem in a view's scenarios. Saved scenarios may become
 * stale after model edits; they remain stored so the author can repair them.
 */
export function scenarioProblems(
  scenarios: readonly ViewScenario[],
  viewElementIds: readonly string[],
  elements: readonly Pick<ArchitectureElement, "id" | "name">[],
  relationships: readonly ScenarioEdge[],
): ScenarioProblem[] {
  const visible = new Set(viewElementIds);
  const existing = new Map(elements.map((element) => [element.id, element]));
  const edges = new Map(relationships.map((edge) => [edge.id, edge]));
  const problems: ScenarioProblem[] = [];
  for (const scenario of scenarios) {
    for (const [stepIndex, step] of scenario.steps.entries()) {
      const at = `Scenario "${scenario.name}", step ${stepIndex + 1}`;
      const base = { scenarioId: scenario.id, stepIndex };
      if (step.elementId && !existing.has(step.elementId)) {
        problems.push({
          ...base,
          code: "SCENARIO_ELEMENT_MISSING",
          elementId: step.elementId,
          message: `${at}: the element must exist in this workspace and view; it is no longer in the workspace.`,
        });
      } else if (step.elementId && !visible.has(step.elementId)) {
        problems.push({
          ...base,
          code: "SCENARIO_ELEMENT_NOT_IN_VIEW",
          elementId: step.elementId,
          message: `${at}: "${existing.get(step.elementId)?.name}" must exist in this workspace and view. Add it to the view, or author the scenario on a detail view that shows it when it is collapsed inside a visible parent.`,
        });
      }
      if (!step.relationshipId && !step.response) continue;
      const edge = step.relationshipId ? edges.get(step.relationshipId) : undefined;
      if (scenarioArrivalMatches(step, scenario.steps[stepIndex - 1], edge)) continue;
      problems.push({
        ...base,
        code: "SCENARIO_ARRIVAL_INVALID",
        ...(step.relationshipId ? { relationshipId: step.relationshipId } : {}),
        message: !step.relationshipId
          ? `${at}: a response needs the connection it replies over.`
          : !edge
            ? `${at}: the arrival connection no longer exists.`
            : `${at}: the arrival connection must directly join the previous element to this element${step.response ? " (a response runs from this element back to the previous one)" : ""}. The first step and note steps have no arrival connection; implied connections are not supported.`,
      });
    }
  }
  return problems;
}

export function validateViewScenarios(
  scenarios: readonly ViewScenario[],
  viewElementIds: readonly string[],
  elements: readonly Pick<ArchitectureElement, "id" | "name">[],
  relationships: readonly ScenarioEdge[],
): void {
  const [problem] = scenarioProblems(scenarios, viewElementIds, elements, relationships);
  if (problem) throw ruleViolation(problem.message);
}
