import { expect, test } from "bun:test";
import {
  AddViewCommentOpSchema,
  AddViewCommentReplySchema,
  ApplyOperationsRequestSchema,
  type ArchitectureOperationInput,
  UpdateViewCommentSchema,
  ViewSettingsSchema,
} from "@structsmith/contracts";
import { isCommentShortcut } from "../apps/web/src/features/canvas/CanvasComments";
import { fromView, toView } from "../packages/database/src/mappers";
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

test("legacy pins gain thread defaults when imported and read from saved settings", () => {
  const legacy = { id: "legacy", x: -15, y: 32, text: "Existing note" };
  const expected = { ...legacy, resolved: false, replies: [] };
  expect(ViewSettingsSchema.parse({ commentPins: [legacy] }).commentPins).toEqual([expected]);
  const { services, close } = createTestContext();
  try {
    const workspace = createWorkspace(services);
    const view = services.views.create(workspace.id, { name: "Legacy", kind: "custom" }).result;
    const row = fromView(view);
    row.settingsJson = JSON.stringify({ ...view.settings, commentPins: [legacy] });
    expect(toView(row).settings.commentPins).toEqual([expected]);
  } finally {
    close();
  }
});

test("thread edits, replies, resolution and deletion preserve stable IDs and undo whole threads", () => {
  const { services, close } = createTestContext();
  try {
    const workspace = createWorkspace(services);
    const view = services.views.create(workspace.id, { name: "Threads", kind: "custom" }).result;
    const run = (operations: ArchitectureOperationInput[], expectedRevision?: number) =>
      services.model.applyOperations(
        workspace.id,
        ApplyOperationsRequestSchema.parse({ operations, expectedRevision }),
        "ui",
      );
    run([
      { op: "addViewComment", viewId: view.id, data: { x: 1, y: 2, text: "Original" } },
      { op: "addViewComment", viewId: view.id, data: { x: 30, y: 40, text: "Unrelated" } },
    ]);
    const original = services.views.get(view.id).settings.commentPins;
    const comment = original[0];
    const unrelated = original[1];
    if (!comment || !unrelated) throw new Error("Missing threads");
    const commentId = comment.id;
    run([
      {
        op: "updateViewComment",
        viewId: view.id,
        commentId,
        data: { text: " Edited ", x: -50, y: 60, resolved: true },
      },
    ]);
    run([
      { op: "addViewCommentReply", viewId: view.id, commentId, data: { text: " First reply " } },
      { op: "addViewCommentReply", viewId: view.id, commentId, data: { text: "Second reply" } },
    ]);
    const current = () => services.views.get(view.id).settings.commentPins;
    const replies = current()[0]?.replies;
    if (!replies?.[0] || !replies[1]) throw new Error("Missing replies");
    expect(new Set(replies.map((reply) => reply.id)).size).toBe(2);
    run([
      {
        op: "updateViewCommentReply",
        viewId: view.id,
        commentId,
        replyId: replies[0].id,
        data: { text: " Updated reply " },
      },
    ]);
    expect(current()).toMatchObject([
      {
        id: commentId,
        x: -50,
        y: 60,
        text: "Edited",
        resolved: true,
        replies: [
          { id: replies[0].id, text: "Updated reply" },
          { id: replies[1].id, text: "Second reply" },
        ],
      },
      unrelated,
    ]);
    run([{ op: "updateViewComment", viewId: view.id, commentId, data: { resolved: false } }]);
    const reopened = current();
    expect(reopened[0]?.resolved).toBe(false);
    const deletedReply = run([
      { op: "deleteViewCommentReply", viewId: view.id, commentId, replyId: replies[0].id },
    ]);
    expect(current()[0]?.replies).toEqual([replies[1]]);
    if (!deletedReply.snapshotId) throw new Error("Missing reply undo snapshot");
    services.snapshots.restore(deletedReply.snapshotId);
    expect(current()).toEqual(reopened);
    const deletedThread = run([{ op: "deleteViewComment", viewId: view.id, commentId }]);
    expect(current()).toEqual([unrelated]);
    if (!deletedThread.snapshotId) throw new Error("Missing thread undo snapshot");
    services.snapshots.restore(deletedThread.snapshotId);
    expect(current()).toEqual(reopened);
    expect(() =>
      run(
        [{ op: "addViewCommentReply", viewId: view.id, commentId, data: { text: "Stale" } }],
        deletedThread.revision,
      ),
    ).toThrow("Workspace was modified by someone else");
    expect(current()).toEqual(reopened);
  } finally {
    close();
  }
});

test("missing thread or reply IDs fail and roll back the entire command", () => {
  const { services, close } = createTestContext();
  try {
    const workspace = createWorkspace(services);
    const view = services.views.create(workspace.id, { name: "Atomic", kind: "custom" }).result;
    const run = (operations: ArchitectureOperationInput[]) =>
      services.model.applyOperations(
        workspace.id,
        ApplyOperationsRequestSchema.parse({ operations }),
        "ui",
      );
    run([{ op: "addViewComment", viewId: view.id, data: { x: 1, y: 2, text: "Saved" } }]);
    const original = services.views.get(view.id).settings.commentPins;
    const commentId = original[0]?.id;
    if (!commentId) throw new Error("Missing comment");
    const missingComment = { viewId: view.id, commentId: "missing" };
    const missingReply = { viewId: view.id, commentId, replyId: "missing" };
    const invalid: ArchitectureOperationInput[] = [
      { op: "updateViewComment", ...missingComment, data: { text: "Wrong" } },
      { op: "deleteViewComment", ...missingComment },
      { op: "addViewCommentReply", ...missingComment, data: { text: "Wrong" } },
      { op: "updateViewCommentReply", ...missingReply, data: { text: "Wrong" } },
      { op: "deleteViewCommentReply", ...missingReply },
    ];
    for (const operation of invalid) {
      const revision = services.workspaces.get(workspace.id).revision;
      expect(() =>
        run([
          {
            op: "updateViewComment",
            viewId: view.id,
            commentId,
            data: { text: "Should roll back" },
          },
          operation,
        ]),
      ).toThrow("does not exist");
      expect({
        pins: services.views.get(view.id).settings.commentPins,
        revision: services.workspaces.get(workspace.id).revision,
      }).toEqual({ pins: original, revision });
    }
  } finally {
    close();
  }
});

test("thread patches have no defaults and reject invalid text, points or duplicate replies", () => {
  expect(UpdateViewCommentSchema.parse({ text: " Changed " })).toEqual({ text: "Changed" });
  for (const text of ["   ", "x".repeat(4001)]) {
    expect(AddViewCommentReplySchema.safeParse({ text }).success).toBe(false);
    expect(UpdateViewCommentSchema.safeParse({ text }).success).toBe(false);
  }
  expect(UpdateViewCommentSchema.safeParse({ x: Number.POSITIVE_INFINITY }).success).toBe(false);
  expect(UpdateViewCommentSchema.safeParse({ y: Number.NaN }).success).toBe(false);
  const reply = { id: "same", text: "Reply" };
  expect(
    ViewSettingsSchema.safeParse({
      commentPins: [{ id: "thread", x: 0, y: 0, text: "Thread", replies: [reply, reply] }],
    }).success,
  ).toBe(false);
});

test("attached comments require a placement in their own view and retain server timestamps", async () => {
  const { services, close } = createTestContext();
  try {
    const workspace = createWorkspace(services);
    const other = createWorkspace(services, "Other");
    const view = services.views.create(workspace.id, { name: "Attached", kind: "custom" }).result;
    const placed = services.elements.create(workspace.id, {
      kind: "custom",
      name: "Placed",
    }).result;
    const unplaced = services.elements.create(workspace.id, {
      kind: "custom",
      name: "Unplaced",
    }).result;
    const foreign = services.elements.create(other.id, { kind: "custom", name: "Foreign" }).result;
    services.views.setElements(workspace.id, view.id, [placed.id], "add");
    services.views.saveLayout(workspace.id, view.id, [{ elementId: placed.id, x: 100, y: 200 }]);
    const run = (operations: ArchitectureOperationInput[]) =>
      services.model.applyOperations(
        workspace.id,
        ApplyOperationsRequestSchema.parse({ operations }),
        "ui",
      );
    for (const elementId of ["missing", unplaced.id, foreign.id]) {
      expect(() =>
        run([
          {
            op: "addViewComment",
            viewId: view.id,
            data: { x: 5, y: 6, text: "Invalid", elementId },
          },
        ]),
      ).toThrow();
    }
    run([
      {
        op: "addViewComment",
        viewId: view.id,
        data: { x: 5, y: 6, text: "Attached", elementId: placed.id },
      },
    ]);
    const read = () => {
      const pin = services.views.get(view.id).settings.commentPins[0];
      if (!pin) throw new Error("Missing attached comment");
      return pin;
    };
    const original = read();
    expect(original).toMatchObject({ x: 5, y: 6, elementId: placed.id });
    expect(original.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(original.updatedAt).toBe(original.createdAt);
    for (const elementId of [unplaced.id, foreign.id]) {
      expect(() =>
        run([
          { op: "updateViewComment", viewId: view.id, commentId: original.id, data: { elementId } },
        ]),
      ).toThrow();
    }
    await Bun.sleep(3);
    run([
      {
        op: "addViewCommentReply",
        viewId: view.id,
        commentId: original.id,
        data: { text: "Reply" },
      },
    ]);
    const replied = read();
    const reply = replied.replies[0];
    if (!reply) throw new Error("Missing timestamped reply");
    expect(reply.createdAt).toBe(replied.updatedAt);
    expect(reply.updatedAt).toBe(reply.createdAt);
    expect(replied.createdAt).toBe(original.createdAt);
    expect((replied.updatedAt ?? "") > (original.updatedAt ?? "")).toBe(true);
    await Bun.sleep(3);
    run([
      {
        op: "updateViewCommentReply",
        viewId: view.id,
        commentId: original.id,
        replyId: reply.id,
        data: { text: "Edit reply" },
      },
    ]);
    expect(read().replies[0]?.createdAt).toBe(reply.createdAt);
    expect(read().replies[0]?.updatedAt).toBe(read().updatedAt);
    expect((read().updatedAt ?? "") > (replied.updatedAt ?? "")).toBe(true);
    await Bun.sleep(3);
    const lastUpdated = read().updatedAt ?? "";
    run([
      {
        op: "updateViewComment",
        viewId: view.id,
        commentId: original.id,
        data: { text: "Edited", elementId: null, x: 105, y: 206 },
      },
    ]);
    expect(read()).toMatchObject({
      createdAt: original.createdAt,
      elementId: null,
      x: 105,
      y: 206,
    });
    expect((read().updatedAt ?? "") > lastUpdated).toBe(true);
  } finally {
    close();
  }
});
