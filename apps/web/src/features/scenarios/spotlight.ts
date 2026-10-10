import type { ViewScenario } from "@structsmith/contracts";

/** What the canvas shows for the current step of a walkthrough on one view. */
export interface ScenarioSpotlight {
  /** Lit elements; empty for a plain note step, which dims nothing. */
  elementIds: ReadonlySet<string>;
  relationshipIds: ReadonlySet<string>;
  /** The arrival connection when the step replies over it (its arrow is drawn reversed). */
  replyingRelationshipId?: string;
  /** The step's own element: the camera centres on it. */
  focusElementId?: string;
  /** 1-based numbers of the steps that happen on this view, by element. */
  badges: ReadonlyMap<string, number[]>;
  current: number;
}

/** The step's view; naming the scenario's own view is the same as omitting it. */
export const stepViewId = (step: { viewId?: string }, ownerViewId: string) =>
  step.viewId ?? ownerViewId;

/**
 * The spotlight for step `index` as seen from `viewId`, or null when that step happens
 * on another view. The previous element stays lit so a message's sender is not dimmed.
 */
export function scenarioSpotlight(
  scenario: Pick<ViewScenario, "steps">,
  index: number,
  viewId: string,
  ownerViewId: string,
  relationships: readonly { id: string; sourceElementId: string; targetElementId: string }[],
): ScenarioSpotlight | null {
  const step = scenario.steps[index];
  if (!step || stepViewId(step, ownerViewId) !== viewId) return null;
  const edges = new Map(relationships.map((edge) => [edge.id, edge]));
  const relationshipIds = [
    ...(step.relationshipId ? [step.relationshipId] : []),
    ...(step.highlightRelationshipIds ?? []),
  ];
  const elementIds = new Set([
    ...(step.elementId ? [step.elementId] : []),
    ...(step.highlightElementIds ?? []),
    ...relationshipIds.flatMap((id) => {
      const edge = edges.get(id);
      return edge ? [edge.sourceElementId, edge.targetElementId] : [];
    }),
  ]);
  const badges = new Map<string, number[]>();
  for (const [stepIndex, entry] of scenario.steps.entries())
    if (entry.elementId && stepViewId(entry, ownerViewId) === viewId)
      badges.set(entry.elementId, [...(badges.get(entry.elementId) ?? []), stepIndex + 1]);
  return {
    elementIds,
    relationshipIds: new Set(relationshipIds),
    ...(step.response && step.relationshipId
      ? { replyingRelationshipId: step.relationshipId }
      : {}),
    ...(step.elementId ? { focusElementId: step.elementId } : {}),
    badges,
    current: index + 1,
  };
}
