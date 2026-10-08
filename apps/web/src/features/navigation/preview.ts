import type {
  ArchitectureElement,
  ArchitectureRelationship,
  ArchitectureView,
  ViewDetail,
} from "@structsmith/contracts";
import {
  computeLayout,
  detailViewElementIds,
  detailViewKind,
  detailViewsFor,
} from "@structsmith/domain";
import { buildGraph } from "../canvas/graph";

/** Preview reads a saved layout when possible and never creates a model record. */
export function previewDestination(
  element: ArchitectureElement,
  views: readonly ArchitectureView[],
  source: ArchitectureView,
): ArchitectureView | null {
  const candidates = detailViewsFor(element, views, source.id);
  return (
    candidates.find((view) => view.id === source.settings.preferredDetailViews[element.id]) ??
    candidates[0] ??
    null
  );
}

export function previewView(
  scope: ArchitectureElement,
  source: ViewDetail,
  elements: readonly ArchitectureElement[],
  relationships: readonly ArchitectureRelationship[],
  saved?: ViewDetail,
): ViewDetail {
  const base = saved ?? source;
  const view: ViewDetail = {
    ...base,
    id: saved?.id ?? `preview:${scope.id}`,
    name: saved?.name ?? scope.name,
    kind: saved?.kind ?? detailViewKind(scope) ?? "custom",
    scopeElementId: scope.id,
    settings: { ...base.settings, showFullTitles: true, showRelationshipLabels: true },
    boundaries: saved?.boundaries ?? [],
    relationships: saved?.relationships ?? [],
    elements:
      saved?.elements ??
      detailViewElementIds(scope, elements, relationships).map((elementId) => ({
        viewId: `preview:${scope.id}`,
        elementId,
        x: 0,
        y: 0,
        width: null,
        height: null,
        hidden: false,
        locked: false,
        zIndex: 0,
      })),
  };
  if (saved) return view;
  view.settings = { ...view.settings, sectionFrames: {}, nodeColors: {} };
  const graph = buildGraph({ view, elements, relationships, records: [] });
  const layout = new Map(
    computeLayout(
      graph.nodes.map((node) => ({
        id: node.id,
        width: node.width,
        height: node.data.minimumHeight as number,
      })),
      graph.edges.map((edge) => ({
        source: edge.source,
        target: edge.target,
        label: edge.data?.label,
      })),
      view.settings.autoLayoutDirection,
    ).map((position) => [position.id, position]),
  );
  view.elements = view.elements.map((entry) => ({
    ...entry,
    x: layout.get(entry.elementId)?.x ?? 0,
    y: layout.get(entry.elementId)?.y ?? 0,
  }));
  return view;
}
