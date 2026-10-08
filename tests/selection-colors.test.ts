import { expect, test } from "bun:test";
import { ApplyOperationsRequestSchema, ViewSettingsSchema } from "@structsmith/contracts";
import {
  buildPasteOperations,
  createDiagramClipboard,
} from "../apps/web/src/features/canvas/clipboard";
import { buildGraph, computeCanvasBoundaries } from "../apps/web/src/features/canvas/graph";
import {
  applyNodeColors,
  colorSelectionOperations,
  selectionColorTargets,
} from "../apps/web/src/features/canvas/selectionColors";
import { createTestContext, createWorkspace } from "./helpers";

test("selection colors validate, persist per view, reset independently, undo, import and prune", () => {
  const { services, close } = createTestContext();
  try {
    expect(ViewSettingsSchema.parse({}).nodeColors).toEqual({});
    for (const color of ["red", "#123", "url(https://invalid)"])
      expect(ViewSettingsSchema.safeParse({ nodeColors: { card: color } }).success).toBe(false);
    const workspace = createWorkspace(services);
    const otherWorkspace = createWorkspace(services, "Other workspace");
    const card = services.elements.create(workspace.id, {
      kind: "action",
      name: "Card",
      tags: ["status:live"],
    }).result;
    const target = services.elements.create(workspace.id, {
      kind: "outcome",
      name: "Result",
    }).result;
    const foreign = services.elements.create(otherWorkspace.id, {
      kind: "action",
      name: "Foreign",
    }).result;
    const relationship = services.relationships.create(workspace.id, {
      sourceElementId: card.id,
      targetElementId: target.id,
      description: "Completes",
    }).result;
    const view = services.views.create(workspace.id, {
      kind: "workflow",
      name: "Flow",
      elementIds: [card.id, target.id],
    }).result;
    const otherView = services.views.create(workspace.id, {
      kind: "workflow",
      name: "Other view",
      elementIds: [card.id],
    }).result;
    const section = services.boundaries.create(workspace.id, {
      viewId: view.id,
      kind: "custom",
      name: "Section",
      elementIds: [card.id],
    }).result;
    const sectionKey = `boundary:${section.id}`;
    for (const key of [foreign.id, "missing", `boundary:${foreign.id}`])
      expect(() =>
        services.views.update(workspace.id, view.id, {
          settings: { nodeColors: { [key]: "#123456" } },
        }),
      ).toThrow();
    expect(() =>
      services.views.update(workspace.id, otherView.id, {
        settings: { nodeColors: { [sectionKey]: "#123456" } },
      }),
    ).toThrow();
    services.views.saveLayout(
      workspace.id,
      view.id,
      [],
      [
        {
          relationshipId: relationship.id,
          presentation: { strokeWidth: 4, labelOffset: { x: 24, y: 0 } },
        },
      ],
    );
    const saved = services.model.applyOperations(
      workspace.id,
      {
        operations: colorSelectionOperations(
          services.views.get(view.id),
          [card.id, sectionKey],
          [relationship.id],
          "#9747FF",
        ),
      },
      "ui",
    );
    expect(services.views.get(view.id).settings.nodeColors).toEqual({
      [card.id]: "#9747FF",
      [sectionKey]: "#9747FF",
    });
    expect(services.views.get(otherView.id).settings.nodeColors).toEqual({});
    const styled = services.views
      .get(view.id)
      .relationships.find((row) => row.relationshipId === relationship.id)?.presentation;
    expect(styled).toEqual({ strokeWidth: 4, labelOffset: { x: 24, y: 0 }, color: "#9747FF" });
    const imported = services.imports.importDocument(services.model.getDocument(workspace.id), {
      name: "Copy",
    });
    const importedView = services.views.list(imported.id).find((item) => item.name === "Flow");
    if (!importedView) throw new Error("Missing copied view");
    const copiedCard = services.elements.list(imported.id).find((item) => item.name === card.name);
    const copiedSection = services.boundaries
      .list(importedView.id)
      .find((item) => item.name === section.name);
    expect(importedView.settings.nodeColors[copiedCard?.id ?? ""]).toBe("#9747FF");
    expect(importedView.settings.nodeColors[`boundary:${copiedSection?.id}`]).toBe("#9747FF");
    services.model.applyOperations(
      workspace.id,
      {
        operations: colorSelectionOperations(
          services.views.get(view.id),
          [card.id],
          [relationship.id],
          null,
        ),
      },
      "ui",
    );
    expect(services.views.get(view.id).settings.nodeColors).toEqual({ [sectionKey]: "#9747FF" });
    expect(
      services.views
        .get(view.id)
        .relationships.find((row) => row.relationshipId === relationship.id)?.presentation,
    ).toEqual({ ...styled, color: null });
    services.snapshots.restore(saved.snapshotId as string);
    expect(services.views.get(view.id).settings.nodeColors).toEqual({});
    services.views.update(workspace.id, view.id, {
      settings: { nodeColors: { [card.id]: "#FF9E42", [sectionKey]: "#3DADFF" } },
    });
    const elements = services.elements.list(workspace.id);
    const current = services.views.get(view.id);
    const graph = buildGraph({
      view: current,
      elements,
      relationships: services.relationships.list(workspace.id),
      records: [],
    });
    const nodes = applyNodeColors(graph.nodes, current.settings.nodeColors);
    expect(nodes.find((node) => node.id === card.id)?.data.color).toBe("#FF9E42");
    const frames = computeCanvasBoundaries(
      graph.nodes.map((node) => ({
        id: node.id,
        ...node.position,
        width: node.width ?? 240,
        height: node.height ?? 100,
      })),
      new Map(elements.map((element) => [element.id, element])),
      current.boundaries,
      current.settings.boundaryLayer,
      true,
    );
    const coloredFrames = applyNodeColors(frames.semanticBoundaries, current.settings.nodeColors);
    expect(coloredFrames.find((node) => node.id === sectionKey)?.style?.borderColor).toBe(
      "#3DADFF",
    );
    const staleSelectedCard = graph.nodes.map((node) => ({
      ...node,
      selected: node.id === card.id,
    }));
    expect(
      selectionColorTargets(
        { type: "boundary", id: section.id },
        [...coloredFrames, ...staleSelectedCard],
        graph.edges,
      ).nodeIds,
    ).toEqual([sectionKey]);
    expect(selectionColorTargets({ type: "none" }, staleSelectedCard, graph.edges)).toEqual({
      nodeIds: [],
      relationshipIds: [],
    });
    const mergedEdges = graph.edges.flatMap((edge) =>
      edge.data
        ? [
            {
              ...edge,
              data: { ...edge.data, relationshipIds: [relationship.id, "sibling"] },
            },
          ]
        : [],
    );
    expect(
      selectionColorTargets(
        { type: "relationship", id: relationship.id },
        staleSelectedCard,
        mergedEdges,
      ),
    ).toEqual({ nodeIds: [], relationshipIds: [relationship.id, "sibling"] });
    expect(
      selectionColorTargets(
        { type: "none" },
        staleSelectedCard,
        mergedEdges.map((edge) => ({ ...edge, selected: true, data: { ...edge.data, count: 2 } })),
      ),
    ).toEqual({ nodeIds: [], relationshipIds: [relationship.id, "sibling"] });
    expect(
      selectionColorTargets(
        { type: "none" },
        staleSelectedCard,
        graph.edges.map((edge) => ({ ...edge, selected: true })),
      ),
    ).toEqual({ nodeIds: [], relationshipIds: [] });
    expect(
      selectionColorTargets(
        { type: "element", id: card.id },
        staleSelectedCard,
        mergedEdges.map((edge) => ({ ...edge, selected: true, data: { ...edge.data, count: 2 } })),
      ),
    ).toEqual({ nodeIds: [card.id], relationshipIds: [] });
    services.boundaries.delete(workspace.id, section.id);
    expect(services.views.get(view.id).settings.nodeColors).toEqual({ [card.id]: "#FF9E42" });
    services.elements.delete(workspace.id, card.id);
    expect(services.views.get(view.id).settings.nodeColors).toEqual({});
  } finally {
    close();
  }
});

test("pasting colors resolves new IDs and retains existing view colors atomically", () => {
  const { services, close } = createTestContext();
  try {
    const workspace = createWorkspace(services);
    const card = services.elements.create(workspace.id, { kind: "action", name: "Colored" }).result;
    const other = services.elements.create(workspace.id, { kind: "action", name: "Other" }).result;
    const view = services.views.create(workspace.id, {
      kind: "workflow",
      name: "Colors",
      elementIds: [card.id, other.id],
      settings: { nodeColors: { [card.id]: "#12AB34", [other.id]: "#9747FF" } },
    }).result;
    const copied = createDiagramClipboard(
      workspace.id,
      services.views.get(view.id),
      [card, other],
      [],
      [card.id],
    );
    if (!copied) throw new Error("Missing colored clipboard");
    const before = services.views.get(view.id);
    services.model.applyOperations(
      workspace.id,
      ApplyOperationsRequestSchema.parse({
        operations: buildPasteOperations(copied, workspace.id, before),
      }),
      "ui",
    );
    const pasted = services.elements
      .list(workspace.id)
      .find((entry) => entry.name === "Colored (copy)");
    if (!pasted) throw new Error("Missing pasted card");
    expect(services.views.get(view.id).settings.nodeColors).toEqual({
      [card.id]: "#12AB34",
      [other.id]: "#9747FF",
      [pasted.id]: "#12AB34",
    });
    const copiedView = services.views.create(workspace.id, {
      kind: "workflow",
      name: "Other view",
    }).result;
    services.model.applyOperations(
      workspace.id,
      ApplyOperationsRequestSchema.parse({
        operations: buildPasteOperations(copied, workspace.id, services.views.get(copiedView.id)),
      }),
      "ui",
    );
    expect(Object.values(services.views.get(copiedView.id).settings.nodeColors)).toEqual([
      "#12AB34",
    ]);
  } finally {
    close();
  }
});
