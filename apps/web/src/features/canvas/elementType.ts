import type { ArchitectureElement, ElementKind } from "@structsmith/contracts";
import { elementKinds } from "@structsmith/contracts";
import { checkParent, presets } from "@structsmith/domain";

const workflowKinds: readonly ElementKind[] = [
  "workflowGroup",
  "action",
  "decision",
  "outcome",
  "data",
  "document",
  "start",
  "end",
  "fork",
  "join",
  "merge",
];

export const elementTypeOptions = [
  ...presets.filter((preset) => workflowKinds.includes(preset.kind)),
  ...presets.filter((preset) => !workflowKinds.includes(preset.kind)),
  ...elementKinds
    .filter((kind) => !presets.some((preset) => preset.kind === kind))
    .map((kind) => ({ id: `kind-${kind}`, kind, role: null })),
];

export function elementTypeProblem(
  element: ArchitectureElement,
  kind: ElementKind,
  elements: readonly ArchitectureElement[],
): string | null {
  const next = { ...element, kind };
  const parent = elements.find((candidate) => candidate.id === element.parentId);
  const problem = checkParent(next, parent);
  if (problem) return problem.message;
  for (const child of elements) {
    if (child.parentId !== element.id) continue;
    const childProblem = checkParent(child, next);
    if (childProblem) return childProblem.message;
  }
  return null;
}
