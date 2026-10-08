import { expect, test } from "bun:test";
import { AddViewCommentOpSchema, ViewSettingsSchema } from "@structsmith/contracts";
import { isCommentShortcut } from "../apps/web/src/features/canvas/CanvasComments";
import { createTestContext, createWorkspace } from "./helpers";

test("comments append on their view, survive settings edits and restore through snapshots", () => {
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
    services.relationships.create(workspace.id, {
      sourceElementId: source.id,
      targetElementId: target.id,
      description: "Existing flow",
    });
    const view = services.views.create(workspace.id, { name: "Main", kind: "custom" }).result;
    const other = services.views.create(workspace.id, { name: "Other", kind: "custom" }).result;
    const originalModel = services.model.get(workspace.id);
    const post = (text: string, expectedRevision?: number) =>
      services.model.applyOperations(
        workspace.id,
        {
          expectedRevision,
          operations: [
            AddViewCommentOpSchema.parse({
              op: "addViewComment",
              viewId: view.id,
              data: { x: -125.5, y: 410, text },
            }),
          ],
        },
        "ui",
      );
    const first = post(" First comment ");
    const second = post("Second comment", first.revision);
    expect(services.views.get(view.id).settings.commentPins).toMatchObject([
      { x: -125.5, y: 410, text: "First comment" },
      { x: -125.5, y: 410, text: "Second comment" },
    ]);
    expect(
      new Set(services.views.get(view.id).settings.commentPins.map((pin) => pin.id)).size,
    ).toBe(2);
    expect(services.views.get(other.id).settings.commentPins).toEqual([]);
    expect(services.model.get(workspace.id).elements).toEqual(originalModel.elements);
    expect(services.model.get(workspace.id).relationships).toEqual(originalModel.relationships);
    expect(() => post("Stale", first.revision)).toThrow("Workspace was modified by someone else");
    expect(services.views.get(view.id).settings.commentPins).toHaveLength(2);
    services.views.update(workspace.id, view.id, { settings: { snapToGrid: true } });
    expect(services.views.get(view.id).settings.commentPins).toHaveLength(2);
    const redo = services.snapshots.create(workspace.id, "Before undo");
    if (!second.snapshotId) throw new Error("Missing comment undo snapshot");
    services.snapshots.restore(second.snapshotId);
    expect(services.views.get(view.id).settings.commentPins).toHaveLength(1);
    expect(services.views.get(view.id).settings.commentPins[0]?.text).toBe("First comment");
    services.snapshots.restore(redo.id);
    expect(services.views.get(view.id).settings.commentPins.map((pin) => pin.text)).toEqual([
      "First comment",
      "Second comment",
    ]);
    const stranger = createWorkspace(services, "Stranger");
    expect(() =>
      services.model.applyOperations(
        stranger.id,
        {
          operations: [
            {
              op: "addViewComment",
              viewId: view.id,
              data: { x: 0, y: 0, text: "Cross workspace" },
            },
          ],
        },
        "ui",
      ),
    ).toThrow(`View "${view.id}" does not exist.`);
    expect(services.views.get(view.id).settings.commentPins).toHaveLength(2);
  } finally {
    close();
  }
});

test("comment trust boundary rejects empty text, oversized text, nonfinite points and duplicate pin ids", () => {
  const operation = { op: "addViewComment", viewId: "view", data: { x: 1, y: 2, text: "Comment" } };
  for (const data of [
    { text: "   " },
    { text: "x".repeat(4001) },
    { x: Number.POSITIVE_INFINITY },
    { y: Number.NaN },
  ]) {
    expect(
      AddViewCommentOpSchema.safeParse({ ...operation, data: { ...operation.data, ...data } })
        .success,
    ).toBe(false);
  }
  const pin = { ...operation.data, id: "same" };
  expect(ViewSettingsSchema.safeParse({ commentPins: [pin, pin] }).success).toBe(false);
});

test("C opens comment mode only outside editors and without copy or other modifiers", () => {
  const key = {
    key: "c",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
  };
  expect(isCommentShortcut(key, false)).toBe(true);
  expect(isCommentShortcut(key, true)).toBe(false);
  for (const modifier of ["ctrlKey", "metaKey", "altKey", "shiftKey", "repeat"]) {
    expect(isCommentShortcut({ ...key, [modifier]: true }, false)).toBe(false);
  }
  expect(isCommentShortcut({ ...key, key: "v" }, false)).toBe(false);
});
