import { expect, test } from "bun:test";
import { ViewRelationshipPatchSchema, WorkspaceDocumentSchema } from "@structsmith/contracts";
import {
  buildPasteOperations,
  createDiagramClipboard,
} from "../apps/web/src/features/canvas/clipboard";
import {
  buildGraph,
  sourceHandleFor,
  targetHandleFor,
} from "../apps/web/src/features/canvas/graph";
import {
  manualRelationshipPath,
  relationshipDash,
  sideFromHandle,
} from "../apps/web/src/features/canvas/relationshipGeometry";
import { createTestContext, createWorkspace } from "./helpers";

test("relationship overrides survive DB, native JSON, paste and snapshots without changing endpoints", () => {
  const { services, close } = createTestContext();
  try {
    const workspace = createWorkspace(services);
    const source = services.elements.create(workspace.id, {
      kind: "custom",
      name: "Source",
    }).result;
    const target = services.elements.create(workspace.id, {
      kind: "custom",
      name: "Target",
    }).result;
    const relationship = services.relationships.create(workspace.id, {
      sourceElementId: source.id,
      targetElementId: target.id,
      description: "Calls",
    }).result;
    const view = services.views.create(workspace.id, {
      kind: "custom",
      name: "Flow",
      elementIds: [source.id, target.id],
    }).result;
    const otherView = services.views.create(workspace.id, {
      kind: "custom",
      name: "Other",
      elementIds: [source.id, target.id],
    }).result;
    const override = {
      color: "#c12abc",
      strokeWidth: 3.5,
      strokeStyle: "dotted" as const,
      sourceArrow: "arrow" as const,
      targetArrow: "none" as const,
      sourceSide: "left" as const,
      targetSide: "bottom" as const,
      labelOffset: { x: 30, y: -50 },
    };
    const apply = (patches: unknown[]) =>
      services.model.applyOperations(
        workspace.id,
        {
          operations: [
            {
              op: "setViewRelationships",
              viewId: view.id,
              relationships: patches.map((patch) => ViewRelationshipPatchSchema.parse(patch)),
            },
          ],
        },
        "ui",
      );
    apply([
      {
        relationshipId: relationship.id,
        presentation: override,
        labelPosition: 0.2,
        controlPoints: [{ x: 100, y: 120 }],
      },
    ]);
    const saved = services.views.get(view.id);
    expect(saved.relationships[0]).toMatchObject({
      presentation: override,
      labelPosition: 0.2,
      controlPoints: [{ x: 100, y: 120 }],
    });
    expect(services.views.get(otherView.id).relationships).toEqual([]);
    expect(services.model.get(workspace.id).relationships).toEqual([relationship]);
    const graph = buildGraph({
      view: saved,
      elements: [source, target],
      relationships: [relationship],
      records: [],
    });
    expect(graph.edges[0]).toMatchObject({
      source: source.id,
      target: target.id,
      sourceHandle: "source-l",
      targetHandle: "target-b",
      data: { placement: { presentation: override } },
    });
    const exported = WorkspaceDocumentSchema.parse(
      JSON.parse(JSON.stringify(services.model.getDocument(workspace.id))),
    );
    const imported = services.imports.importDocument(exported, { name: "Imported" });
    const importedView = services.views
      .list(imported.id)
      .find((candidate) => candidate.name === "Flow");
    if (!importedView) throw new Error("Missing imported view");
    expect(services.views.get(importedView.id).relationships[0]?.presentation).toEqual(override);
    const clipboard = createDiagramClipboard(
      workspace.id,
      saved,
      [source, target],
      [relationship],
      [source.id, target.id],
    );
    if (!clipboard) throw new Error("Missing clipboard");
    const paste = buildPasteOperations(clipboard, workspace.id, otherView);
    const layoutOp = paste.find((operation) => operation.op === "setViewRelationships");
    if (layoutOp?.op !== "setViewRelationships") throw new Error("Missing paste presentation");
    expect(layoutOp.relationships[0]).toMatchObject({
      presentation: override,
      controlPoints: [{ x: 140, y: 160 }],
    });
    apply([
      { relationshipId: relationship.id, presentation: { color: "#ffffff" } },
      { relationshipId: relationship.id, presentation: { strokeWidth: 4 } },
    ]);
    expect(services.views.get(view.id).relationships[0]?.presentation).toEqual({
      ...override,
      color: "#ffffff",
      strokeWidth: 4,
    });
    apply([
      { relationshipId: relationship.id, presentation: { sourceSide: null, targetSide: null } },
    ]);
    expect(services.views.get(view.id).relationships[0]?.presentation).toEqual({
      ...override,
      color: "#ffffff",
      strokeWidth: 4,
      sourceSide: null,
      targetSide: null,
    });
    const reset = apply([
      {
        relationshipId: relationship.id,
        presentation: null,
        labelPosition: null,
        controlPoints: [],
      },
    ]);
    expect(services.views.get(view.id).relationships[0]).toMatchObject({
      presentation: null,
      labelPosition: null,
      controlPoints: [],
    });
    if (!reset.snapshotId) throw new Error("Missing undo snapshot");
    services.snapshots.restore(reset.snapshotId);
    expect(services.views.get(view.id).relationships[0]?.presentation).toEqual({
      ...override,
      color: "#ffffff",
      strokeWidth: 4,
      sourceSide: null,
      targetSide: null,
    });
    const legacy = JSON.parse(JSON.stringify(exported));
    for (const row of legacy.views[0].relationships) delete row.presentation;
    const legacyWorkspace = services.imports.importDocument(WorkspaceDocumentSchema.parse(legacy));
    const legacyView = services.views.list(legacyWorkspace.id)[0];
    if (!legacyView) throw new Error("Missing legacy view");
    expect(services.views.get(legacyView.id).relationships[0]?.presentation).toBeNull();
  } finally {
    close();
  }
});

test("presentation input rejects unsafe colors, invalid widths, sides and non-finite geometry", () => {
  for (const presentation of [
    { color: "url(https://example.com/a)" },
    { color: "red" },
    { strokeWidth: 0 },
    { strokeWidth: 13 },
    { sourceSide: "middle" },
    { targetArrow: "javascript" },
    { labelOffset: { x: Infinity, y: 0 } },
    { unexpected: true },
  ]) {
    expect(
      ViewRelationshipPatchSchema.safeParse({ relationshipId: "rel", presentation }).success,
    ).toBe(false);
  }
  for (const labelPosition of [-0.1, 1.1, Infinity])
    expect(
      ViewRelationshipPatchSchema.safeParse({ relationshipId: "rel", labelPosition }).success,
    ).toBe(false);
  expect(
    ViewRelationshipPatchSchema.safeParse({
      relationshipId: "rel",
      controlPoints: [{ x: NaN, y: 0 }],
    }).success,
  ).toBe(false);
});

test("manual routing uses saved bends and label position by path length", () => {
  const source = { x: 0, y: 0 },
    target = { x: 100, y: 100 };
  expect(manualRelationshipPath(source, target, [{ x: 0, y: 100 }], 0.25)).toEqual([
    "M 0,0 L 0,100 L 100,100",
    0,
    50,
  ]);
  expect(manualRelationshipPath(source, target, [{ x: 0, y: 100 }], 0.75)).toEqual([
    "M 0,0 L 0,100 L 100,100",
    50,
    100,
  ]);
  expect(manualRelationshipPath(source, source, [source], 0)).toEqual(["M 0,0 L 0,0 L 0,0", 0, 0]);
  expect(relationshipDash("async", "solid")).toBeUndefined();
  expect(relationshipDash("sync", "dotted")).toBe("1 4");
  expect(relationshipDash("async", undefined)).toBe("5 4");
});

test("all attachment sides keep existing defaults and map reconnect handles", () => {
  expect(sourceHandleFor(undefined, "LR")).toBeUndefined();
  expect(targetHandleFor(undefined, "LR")).toBeUndefined();
  expect(sourceHandleFor(undefined, "TB")).toBe("b");
  expect(sourceHandleFor(null, "TB")).toBe("b");
  expect(targetHandleFor(null, "TB")).toBe("t");
  expect(targetHandleFor(undefined, "TB")).toBe("t");
  for (const side of ["left", "right", "top", "bottom"] as const) {
    expect(sideFromHandle(sourceHandleFor(side, "LR"), "source")).toBe(side);
    expect(sideFromHandle(targetHandleFor(side, "LR"), "target")).toBe(side);
  }
});

test("view presentation refuses relationships owned by another workspace", () => {
  const { services, close } = createTestContext();
  try {
    const workspace = createWorkspace(services),
      other = createWorkspace(services);
    const source = services.elements.create(other.id, { kind: "custom", name: "Source" }).result;
    const target = services.elements.create(other.id, { kind: "custom", name: "Target" }).result;
    const relationship = services.relationships.create(other.id, {
      sourceElementId: source.id,
      targetElementId: target.id,
    }).result;
    const view = services.views.create(workspace.id, { kind: "custom", name: "Flow" }).result;
    expect(() =>
      services.views.saveLayout(
        workspace.id,
        view.id,
        [],
        [{ relationshipId: relationship.id, presentation: { color: "#000000" } }],
      ),
    ).toThrow("does not exist");
    expect(services.views.get(view.id).relationships).toEqual([]);
  } finally {
    close();
  }
});
