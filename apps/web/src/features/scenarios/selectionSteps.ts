import type {
  ArchitectureElement,
  ArchitectureRelationship,
  ViewScenarioStep,
} from "@structsmith/contracts";
import type { Selection } from "@/store/editor";

const titled = (text: string) => text.trim().slice(0, 200);

/**
 * Steps for the current canvas selection, continuing from the previous step.
 * A connection that leaves the previous element becomes a message step; one that
 * arrives at it becomes the reply; any other connection adds both of its ends.
 * Returns "outside" when the selection is not on this view and null when nothing usable is selected.
 */
export function stepsFromSelection(
  selection: Selection,
  previous: ViewScenarioStep | undefined,
  viewElementIds: readonly string[],
  elements: readonly Pick<ArchitectureElement, "id" | "name">[],
  relationships: readonly ArchitectureRelationship[],
): ViewScenarioStep[] | "outside" | null {
  const name = (id: string) => elements.find((element) => element.id === id)?.name ?? id;
  if (selection.type === "element") {
    if (!viewElementIds.includes(selection.id)) return "outside";
    const requests = relationships.filter(
      (edge) =>
        edge.sourceElementId === previous?.elementId && edge.targetElementId === selection.id,
    );
    return [
      {
        elementId: selection.id,
        title: titled(name(selection.id)),
        ...(requests.length === 1 ? { relationshipId: requests[0]?.id } : {}),
      },
    ];
  }
  if (selection.type !== "relationship") return null;
  const edge = relationships.find((candidate) => candidate.id === selection.id);
  if (!edge) return null;
  const { sourceElementId: source, targetElementId: target } = edge;
  if (!viewElementIds.includes(source) || !viewElementIds.includes(target)) return "outside";
  const message = (id: string) => titled(edge.description || name(id));
  if (previous?.elementId === source)
    return [{ elementId: target, relationshipId: edge.id, title: message(target) }];
  if (previous?.elementId === target)
    return [{ elementId: source, relationshipId: edge.id, response: true, title: message(source) }];
  return [
    { elementId: source, title: titled(name(source)) },
    { elementId: target, relationshipId: edge.id, title: message(target) },
  ];
}
