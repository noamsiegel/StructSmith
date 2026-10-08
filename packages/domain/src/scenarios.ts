import type {
  ArchitectureElement,
  ArchitectureRelationship,
  ViewScenario,
  ViewScenarioStep,
} from "@structsmith/contracts";
import { ruleViolation } from "./errors";

/** Reordering changes which edge can arrive from the preceding step. */
export function clearInvalidScenarioArrivals<T extends ViewScenarioStep>(
  steps: readonly T[],
  relationships: readonly Pick<
    ArchitectureRelationship,
    "id" | "sourceElementId" | "targetElementId"
  >[],
): T[] {
  const edges = new Map(relationships.map((edge) => [edge.id, edge]));
  return steps.map((step, index) => {
    const previous = steps[index - 1];
    const edge = step.relationshipId ? edges.get(step.relationshipId) : undefined;
    if (
      previous &&
      edge?.sourceElementId === previous.elementId &&
      edge.targetElementId === step.elementId
    )
      return step;
    return { ...step, relationshipId: undefined };
  });
}

export function validateViewScenarios(
  scenarios: readonly ViewScenario[],
  viewElementIds: readonly string[],
  elements: readonly Pick<ArchitectureElement, "id">[],
  relationships: readonly Pick<
    ArchitectureRelationship,
    "id" | "sourceElementId" | "targetElementId"
  >[],
): void {
  const visible = new Set(viewElementIds);
  const existing = new Set(elements.map((element) => element.id));
  const edges = new Map(relationships.map((edge) => [edge.id, edge]));
  for (const scenario of scenarios) {
    for (const [index, step] of scenario.steps.entries()) {
      if (!existing.has(step.elementId) || !visible.has(step.elementId)) {
        throw ruleViolation(
          `Scenario "${scenario.name}", step ${index + 1}: the element must exist in this workspace and view.`,
        );
      }
      if (!step.relationshipId) continue;
      const edge = edges.get(step.relationshipId);
      const previous = scenario.steps[index - 1];
      if (
        !previous ||
        !edge ||
        edge.sourceElementId !== previous.elementId ||
        edge.targetElementId !== step.elementId
      ) {
        throw ruleViolation(
          `Scenario "${scenario.name}", step ${index + 1}: the arrival connection must directly join the previous element to this element. The first step has no arrival connection; implied connections are not supported.`,
        );
      }
    }
  }
}
