import { expect, test } from "bun:test";
import {
  ApplyOperationsRequestSchema,
  RelationshipPresentationSchema,
  WorkspaceDocumentSchema,
} from "@structsmith/contracts";
import { createTestContext, createWorkspace } from "./helpers";

test("border fractions and free endpoints persist only on their view and round trip", () => {
  const { services, close } = createTestContext();
  try {
    const workspace = createWorkspace(services);
    const source = services.elements.create(workspace.id, {
      kind: "action",
      name: "Source",
    }).result;
    const target = services.elements.create(workspace.id, {
      kind: "action",
      name: "Target",
    }).result;
    const relationship = services.relationships.create(workspace.id, {
      sourceElementId: source.id,
      targetElementId: target.id,
    }).result;
    const view = services.views.create(workspace.id, {
      name: "Endpoints",
      kind: "workflow",
      elementIds: [source.id, target.id],
    }).result;
    const other = services.views.create(workspace.id, {
      name: "Other",
      kind: "workflow",
      elementIds: [source.id, target.id],
    }).result;
    const presentation = {
      sourceSide: "right" as const,
      targetSide: "bottom" as const,
      sourceSlot: 0,
      targetSlot: 2,
      sourceFraction: 0.137,
      targetFraction: 0.863,
      sourcePoint: { x: -124, y: 381.5 },
      targetPoint: { x: 620.5, y: -42 },
    };
    const apply = (patch: unknown) =>
      services.model.applyOperations(
        workspace.id,
        ApplyOperationsRequestSchema.parse({
          operations: [
            {
              op: "setViewRelationships",
              viewId: view.id,
              relationships: [{ relationshipId: relationship.id, presentation: patch }],
            },
          ],
        }),
      );
    apply(presentation);
    const saved = () => services.views.get(view.id).relationships[0]?.presentation;
    expect(saved()).toEqual(presentation);
    expect(services.views.get(other.id).relationships).toEqual([]);
    expect(services.model.get(workspace.id).relationships).toEqual([relationship]);

    const document = WorkspaceDocumentSchema.parse(
      JSON.parse(JSON.stringify(services.model.getDocument(workspace.id))),
    );
    const imported = services.imports.importDocument(document, { name: "Copy" });
    const importedView = services.views.list(imported.id).find((entry) => entry.name === view.name);
    if (!importedView) throw new Error("Missing imported view");
    expect(services.views.get(importedView.id).relationships[0]?.presentation).toEqual(
      presentation,
    );

    const restored = apply({
      sourceFraction: null,
      targetFraction: null,
      sourcePoint: null,
      targetPoint: null,
    });
    expect(saved()).toEqual({
      ...presentation,
      sourceFraction: null,
      targetFraction: null,
      sourcePoint: null,
      targetPoint: null,
    });
    if (!restored.snapshotId) throw new Error("Missing endpoint undo snapshot");
    services.snapshots.restore(restored.snapshotId);
    expect(saved()).toEqual(presentation);
    expect(services.model.get(workspace.id).relationships).toEqual([relationship]);

    const foreign = createWorkspace(services);
    const before = services.model.getDocument(foreign.id);
    const foreignView = services.views.create(foreign.id, {
      name: "Foreign",
      kind: "workflow",
    }).result;
    expect(() =>
      services.views.saveLayout(
        foreign.id,
        foreignView.id,
        [],
        [
          {
            relationshipId: relationship.id,
            presentation,
          },
        ],
      ),
    ).toThrow("does not exist");
    expect(services.views.get(foreignView.id).relationships).toEqual([]);
    expect(services.model.get(foreign.id).relationships).toEqual(before.relationships);
  } finally {
    close();
  }
});

test("endpoint presentation accepts legacy slots and rejects invalid fractions and coordinates", () => {
  expect(RelationshipPresentationSchema.parse({ sourceSlot: 0, targetSlot: 2 })).toEqual({
    sourceSlot: 0,
    targetSlot: 2,
  });
  expect(RelationshipPresentationSchema.parse({ sourceFraction: 0, targetFraction: 1 })).toEqual({
    sourceFraction: 0,
    targetFraction: 1,
  });
  for (const field of ["sourceFraction", "targetFraction"]) {
    for (const value of [-0.001, 1.001, Number.NaN, Number.POSITIVE_INFINITY, "0.5"]) {
      expect(RelationshipPresentationSchema.safeParse({ [field]: value }).success).toBe(false);
    }
  }
  for (const field of ["sourcePoint", "targetPoint"]) {
    for (const value of [
      { x: 1 },
      { x: "1", y: 2 },
      { x: 1, y: Number.NaN },
      { x: Number.POSITIVE_INFINITY, y: 2 },
    ]) {
      expect(RelationshipPresentationSchema.safeParse({ [field]: value }).success).toBe(false);
    }
  }
});
