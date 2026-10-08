import { expect, test } from "bun:test";
import {
  ApplyOperationsRequestSchema,
  type ArchitectureOperationInput,
  CreateViewAnnotationSchema,
  UpdateViewSchema,
  ViewSettingsSchema,
} from "@structsmith/contracts";
import { createTestContext, createWorkspace } from "./helpers";

const text = {
  kind: "text" as const,
  text: "A heading",
  x: 1,
  y: 2,
  width: 240,
  height: 60,
  fontSize: 24,
};

test("annotations CRUD is view-owned, atomic, revision guarded and snapshot reversible", () => {
  const { services, close } = createTestContext();
  try {
    const workspace = createWorkspace(services);
    const view = services.views.create(workspace.id, { name: "Annotated", kind: "custom" }).result;
    const other = services.views.create(workspace.id, { name: "Other", kind: "custom" }).result;
    const run = (operations: ArchitectureOperationInput[], expectedRevision?: number) =>
      services.model.applyOperations(
        workspace.id,
        ApplyOperationsRequestSchema.parse({ operations, expectedRevision }),
        "ui",
      );
    const created = run([
      { op: "createViewAnnotation", viewId: view.id, ref: "heading", data: text },
      {
        op: "updateViewAnnotation",
        viewId: view.id,
        annotationId: "@heading",
        data: { text: "Updated", x: -42 },
      },
      {
        op: "createViewAnnotation",
        viewId: view.id,
        data: { ...text, kind: "note", text: "A note" },
      },
      {
        op: "createViewAnnotation",
        viewId: view.id,
        data: {
          kind: "table",
          x: 0,
          y: 90,
          width: 500,
          height: 180,
          cells: [
            ["Name", "State"],
            ["Capture", "Ready"],
          ],
        },
      },
    ]);
    const annotations = services.views.get(view.id).settings.annotations;
    expect(annotations).toHaveLength(3);
    expect(annotations[0]).toMatchObject({ text: "Updated", x: -42, y: 2, fontSize: 24 });
    expect(services.views.get(other.id).settings.annotations).toEqual([]);
    expect(services.model.get(workspace.id).elements).toEqual([]);
    services.views.update(
      workspace.id,
      view.id,
      UpdateViewSchema.parse({ settings: { snapToGrid: true } }),
    );
    expect(services.views.get(view.id).settings.annotations).toEqual(annotations);
    const id = annotations[0]?.id;
    if (!id) throw new Error("Missing annotation ID");
    expect(() =>
      run([{ op: "deleteViewAnnotation", viewId: view.id, annotationId: id }], created.revision),
    ).toThrow("Workspace was modified");
    expect(() =>
      run([
        {
          op: "updateViewAnnotation",
          viewId: view.id,
          annotationId: id,
          data: { text: "Should roll back" },
        },
        { op: "deleteViewAnnotation", viewId: view.id, annotationId: "missing" },
      ]),
    ).toThrow("does not exist");
    expect(services.views.get(view.id).settings.annotations).toEqual(annotations);
    const deleted = run([{ op: "deleteViewAnnotation", viewId: view.id, annotationId: id }]);
    expect(services.views.get(view.id).settings.annotations).toHaveLength(2);
    if (!deleted.snapshotId) throw new Error("Missing snapshot");
    services.snapshots.restore(deleted.snapshotId);
    expect(services.views.get(view.id).settings.annotations).toEqual(annotations);
    const stranger = createWorkspace(services, "Stranger");
    expect(() =>
      services.model.applyOperations(
        stranger.id,
        ApplyOperationsRequestSchema.parse({
          operations: [{ op: "createViewAnnotation", viewId: view.id, data: text }],
        }),
        "ui",
      ),
    ).toThrow("does not exist");
  } finally {
    close();
  }
});

test("annotation trust boundaries reject invalid grids, geometry, duplicates and kind-specific fields", () => {
  for (const patch of [
    { x: Infinity },
    { y: NaN },
    { width: 0 },
    { height: 10001 },
    { fontSize: 73 },
    { text: "x".repeat(20001) },
    { color: "red" },
  ])
    expect(CreateViewAnnotationSchema.safeParse({ ...text, ...patch }).success).toBe(false);
  for (const cells of [
    [],
    [[]],
    [["a"], ["b", "c"]],
    [["x".repeat(5001)]],
    Array.from({ length: 101 }, () => ["a"]),
    [[...Array(21).fill("a")]],
    Array.from({ length: 21 }, () => ["x".repeat(5000)]),
  ])
    expect(
      CreateViewAnnotationSchema.safeParse({
        kind: "table",
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        cells,
      }).success,
    ).toBe(false);
  expect(
    ViewSettingsSchema.safeParse({
      annotations: [
        { ...text, id: "same" },
        { ...text, id: "same" },
      ],
    }).success,
  ).toBe(false);
  const { services, close } = createTestContext();
  try {
    const workspace = createWorkspace(services);
    const view = services.views.create(workspace.id, { name: "Trust", kind: "custom" }).result;
    services.views.update(workspace.id, view.id, {
      settings: { annotations: [{ ...text, id: "same" }] },
    });
    expect(() =>
      services.views.update(workspace.id, view.id, {
        settings: {
          annotations: [
            { ...text, id: "same" },
            { ...text, id: "same" },
          ],
        },
      }),
    ).toThrow("unique");
    expect(() =>
      services.model.applyOperations(
        workspace.id,
        ApplyOperationsRequestSchema.parse({
          operations: [
            {
              op: "updateViewAnnotation",
              viewId: view.id,
              annotationId: "same",
              data: { cells: [["wrong kind"]] },
            },
          ],
        }),
        "ui",
      ),
    ).toThrow();
  } finally {
    close();
  }
});

test("annotations use only their view's Sections, import remaps ownership and deletion preserves content", () => {
  const { services, close } = createTestContext();
  try {
    const workspace = createWorkspace(services);
    const view = services.views.create(workspace.id, {
      name: "Section annotations",
      kind: "custom",
    }).result;
    const other = services.views.create(workspace.id, { name: "Other", kind: "custom" }).result;
    const section = services.boundaries.create(workspace.id, {
      viewId: view.id,
      kind: "custom",
      layer: "custom",
      name: "Section",
    }).result;
    services.views.update(workspace.id, view.id, {
      settings: { annotations: [{ ...text, id: "heading", sectionId: section.id }] },
    });
    expect(() =>
      services.views.update(workspace.id, other.id, {
        settings: { annotations: [{ ...text, id: "foreign", sectionId: section.id }] },
      }),
    ).toThrow("own view");
    const imported = services.imports.importDocument(services.model.getDocument(workspace.id));
    const importedView = services.views
      .listDetailed(imported.id)
      .find((item) => item.name === view.name);
    expect(importedView?.settings.annotations[0]).toMatchObject({
      id: "heading",
      text: "A heading",
      sectionId: importedView?.boundaries[0]?.id,
    });
    expect(importedView?.boundaries[0]?.id).not.toBe(section.id);
    const invalid = services.model.getDocument(workspace.id);
    const invalidView = invalid.views.find((item) => item.id === other.id);
    if (!invalidView) throw new Error("Missing test view");
    invalidView.settings.annotations = [{ ...text, id: "invalid", sectionId: section.id }];
    expect(() => services.imports.importDocument(invalid)).toThrow("annotation");
    expect(() =>
      services.boundaries.update(workspace.id, section.id, { kind: "trustZone", layer: "security" }),
    ).toThrow("must remain a Section");
    services.boundaries.delete(workspace.id, section.id);
    expect(services.views.get(view.id).settings.annotations).toMatchObject([
      { id: "heading", text: "A heading", sectionId: null },
    ]);
  } finally {
    close();
  }
});
