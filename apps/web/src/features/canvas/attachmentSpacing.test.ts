import { afterEach, expect, test } from "bun:test";
import type { ArchitectureRelationship, RelationshipPresentation } from "@structsmith/contracts";
import { createTestContext, createWorkspace } from "../../../../../tests/helpers";
import { automaticAttachmentFractions } from "./attachmentSpacing";
import { buildGraph } from "./graph";
import { sideFromHandle, slotFromHandle } from "./relationshipGeometry";

const contexts: ReturnType<typeof createTestContext>[] = [];
afterEach(() => {
  for (const context of contexts.splice(0)) context.close();
});

function fixture(count = 6) {
  const context = createTestContext();
  contexts.push(context);
  const { services } = context;
  const workspace = createWorkspace(services);
  const elements = Array.from(
    { length: count + 1 },
    (_, index) =>
      services.elements.create(workspace.id, { kind: "action", name: `Card ${index}` }).result,
  );
  const source = elements[0];
  if (!source) throw new Error("Missing shared card");
  const relationships = elements.slice(1).map((target, index) => ({
    ...services.relationships.create(workspace.id, {
      sourceElementId: source.id,
      targetElementId: target.id,
    }).result,
    createdAt: "2026-10-09T12:00:00Z",
    id: `connector-${count - index}`,
  }));
  const view = services.views.create(workspace.id, {
    kind: "workflow",
    name: "Attachment spacing",
    elementIds: elements.map((element) => element.id),
  }).result;
  function present(index: number, presentation: RelationshipPresentation, hidden = false) {
    const relationship = relationships[index];
    if (!relationship) throw new Error("Missing relationship");
    view.relationships.push({
      viewId: view.id,
      relationshipId: relationship.id,
      presentation,
      hidden,
      labelPosition: null,
      controlPoints: [],
    });
  }
  const graph = (visibleRelationships: readonly ArchitectureRelationship[] = relationships) =>
    buildGraph({ view, elements, relationships: visibleRelationships, records: [] });
  const fractions = () => graph().edges.map((edge) => edge.data?.automaticAttachments?.source);
  return { elements, source, relationships, view, present, graph, fractions };
}

test("three preferred slots fill in insertion order before subdividing interior gaps", () => {
  const { fractions } = fixture(9);
  const values = fractions();
  expect(values.slice(0, 5)).toEqual([0.5, 0.25, 0.75, 0.125, 0.375]);
  expect(new Set(values).size).toBe(9);
  expect(values.every((value) => value !== undefined && value >= 0.125 && value <= 0.875)).toBe(
    true,
  );
});

test("incoming and outgoing connectors share capacity on the same visible card side", () => {
  const { source, relationships, present, graph } = fixture(3);
  const incoming = relationships[1];
  if (!incoming) throw new Error("Missing incoming relationship");
  incoming.sourceElementId = incoming.targetElementId;
  incoming.targetElementId = source.id;
  present(1, { targetSide: "right" });
  const edges = graph().edges;
  expect(edges[0]?.data?.automaticAttachments?.source).toBe(0.5);
  expect(edges[1]?.data?.automaticAttachments?.target).toBe(0.25);
  expect(edges[2]?.data?.automaticAttachments?.source).toBe(0.75);
  expect(edges[1]?.data?.automaticAttachments?.source).toBe(0.5);
});

test("manual fractions and slots reserve their border positions while loose endpoints reserve none", () => {
  const { relationships, view, present, graph } = fixture(5);
  present(0, { sourceFraction: 0.5, sourceSlot: 0 });
  present(1, { sourceSlot: 0 });
  present(2, { sourcePoint: { x: 0, y: 0 } });
  const original = structuredClone({ relationships, view });
  const edges = graph().edges;
  expect(edges.slice(0, 3).map((edge) => edge.data?.automaticAttachments?.source)).toEqual([
    undefined,
    undefined,
    undefined,
  ]);
  expect(edges.slice(3).map((edge) => edge.data?.automaticAttachments?.source)).toEqual([
    0.75, 0.125,
  ]);
  expect({ relationships, view }).toEqual(original);
});

test("hidden relationships do not consume automatic or manually reserved positions", () => {
  const { relationships, present, graph } = fixture(3);
  present(0, { sourceFraction: 0.5 }, true);
  const edges = graph().edges;
  expect(edges.map((edge) => edge.data?.automaticAttachments?.source)).toEqual([0.5, 0.25]);
  const assignments = automaticAttachmentFractions(
    [{ ...edges[0], hidden: true } as (typeof edges)[number], edges[1] as (typeof edges)[number]],
    "LR",
    relationships,
  );
  expect(assignments.get(edges[1]?.id ?? "")?.source).toBe(0.5);
});

test("oldest timestamps take priority and appending relationships leaves existing assignments stable", () => {
  const { relationships, graph } = fixture(6);
  const oldest = relationships[2];
  if (!oldest) throw new Error("Missing oldest relationship");
  oldest.createdAt = "2026-10-08T12:00:00Z";
  const initial = graph(relationships.slice(0, 3)).edges;
  expect(initial.map((edge) => edge.data?.automaticAttachments?.source)).toEqual([0.25, 0.75, 0.5]);
  expect(
    graph()
      .edges.slice(0, 3)
      .map((edge) => edge.data?.automaticAttachments),
  ).toEqual(initial.map((edge) => edge.data?.automaticAttachments));
});

test("fractions near standard slots force a clear neighboring position and sides remain independent", () => {
  const { present, fractions } = fixture(4);
  present(0, { sourceFraction: 0.49 });
  present(1, { sourceSide: "top" });
  expect(fractions()).toEqual([undefined, 0.5, 0.25, 0.75]);
});

test("TB defaults combine with explicit bottom attachments after lifting hidden descendants", () => {
  const { source, elements, relationships, view, graph, present } = fixture(3);
  const child = elements[1];
  const lifted = relationships[0];
  if (!child || !lifted) throw new Error("Missing descendant");
  child.parentId = source.id;
  lifted.sourceElementId = child.id;
  lifted.targetElementId = elements[2]?.id ?? "";
  view.elements = view.elements.filter((placement) => placement.elementId !== child.id);
  view.settings.autoLayoutDirection = "TB";
  present(1, { sourceSide: "bottom" });
  const edges = graph().edges;
  expect(edges[0]?.source).toBe(source.id);
  expect(edges[0]?.data?.implied).toBe(true);
  expect(edges.map((edge) => edge.data?.automaticAttachments?.source)).toEqual([0.5, 0.25, 0.75]);
});

test("drawing from center handles leaves allocation automatic while side slots remain explicit", () => {
  expect(sideFromHandle("source-r", "target")).toBe("right");
  expect(sideFromHandle("source-l-0", "target")).toBe("left");
  expect(slotFromHandle(null)).toBeUndefined();
  expect(slotFromHandle("source-r")).toBeUndefined();
  expect(slotFromHandle("target-l")).toBeUndefined();
  expect(slotFromHandle("source-r-0")).toBe(0);
  expect(slotFromHandle("target-l-2")).toBe(2);
});
