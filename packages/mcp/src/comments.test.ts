import { expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { ViewComment } from "@structsmith/contracts";
import { createTestContext, createWorkspace } from "../../../tests/helpers";
import { MCP_TOOLS } from "./catalog";
import { createMcpServer } from "./server";

test("MCP comment CRUD preserves replies, guards revisions and snapshots thread deletion", async () => {
  const { services, close } = createTestContext();
  const server = createMcpServer({ services, readOnly: false });
  const client = new Client({ name: "comment-test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(b);
    await client.connect(a);
    const workspace = createWorkspace(services);
    const view = services.views.create(workspace.id, { name: "Comments", kind: "custom" }).result;
    const base = { workspaceId: workspace.id, viewId: view.id };
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const result = await client.callTool({ name, arguments: { ...base, ...args } });
      if (result.isError) throw new Error(JSON.stringify(result));
      const block = result.content as Array<{ type: string; text: string }>;
      return JSON.parse(block[0]?.text ?? "null");
    };
    const created = await call("comment_create", { data: { x: 10, y: 20, text: " Parent " } });
    const pin: ViewComment = created.comments[0];
    expect(pin).toMatchObject({ x: 10, y: 20, text: "Parent", resolved: false, replies: [] });
    const replied = await call("comment_reply_create", {
      commentId: pin.id,
      data: { text: "Reply" },
      expectedRevision: created.revision,
    });
    const replyId = replied.comments[0].replies[0].id;
    const updated = await call("comment_update", {
      commentId: pin.id,
      data: { text: "Edited parent", resolved: true, x: 30 },
      expectedRevision: replied.revision,
    });
    expect(updated.comments[0]).toMatchObject({
      id: pin.id,
      text: "Edited parent",
      x: 30,
      y: 20,
      resolved: true,
      replies: [{ id: replyId, text: "Reply" }],
    });
    const stale = await client.callTool({
      name: "comment_delete",
      arguments: { ...base, commentId: pin.id, expectedRevision: created.revision },
    });
    expect(stale.isError).toBe(true);
    expect(await call("comment_get", { commentId: pin.id })).toEqual(updated.comments[0]);
    const replyEdited = await call("comment_reply_update", {
      commentId: pin.id,
      replyId,
      data: { text: "Edited reply" },
    });
    expect(replyEdited.comments[0].replies).toEqual([{ id: replyId, text: "Edited reply" }]);
    await call("comment_update", { commentId: pin.id, data: { resolved: false } });
    expect((await call("comment_list"))[0].resolved).toBe(false);
    const replyDeleted = await call("comment_reply_delete", { commentId: pin.id, replyId });
    expect(replyDeleted.comments[0]).toMatchObject({ text: "Edited parent", replies: [] });
    await call("comment_reply_create", { commentId: pin.id, data: { text: "Restorable reply" } });
    const deleted = await call("comment_delete", { commentId: pin.id });
    expect(deleted.comments).toEqual([]);
    services.snapshots.restore(deleted.snapshotId);
    expect((await call("comment_get", { commentId: pin.id })).replies[0].text).toBe(
      "Restorable reply",
    );

    const stranger = createWorkspace(services, "Other");
    for (const args of [
      { data: { text: "   " }, commentId: pin.id },
      { data: { text: "Cross-workspace" }, commentId: pin.id, workspaceId: stranger.id },
      { data: { text: "Missing" }, commentId: "missing" },
    ]) {
      expect(
        (await client.callTool({ name: "comment_update", arguments: { ...base, ...args } }))
          .isError,
      ).toBe(true);
    }
    expect((await call("comment_list"))[0].text).toBe("Edited parent");
    const missing = await client.callTool({
      name: "comment_get",
      arguments: { viewId: view.id, commentId: "missing" },
    });
    expect(missing.isError).toBe(true);
  } finally {
    await client.close();
    await server.close();
    close();
  }
});

test("read-only MCP exposes comment reads and excludes every comment write", async () => {
  const { services, close } = createTestContext();
  const server = createMcpServer({ services, readOnly: true });
  const client = new Client({ name: "comment-readonly-test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(b);
    await client.connect(a);
    const tools = (await client.listTools()).tools;
    expect(
      tools
        .filter((tool) => tool.name.startsWith("comment_"))
        .map((tool) => tool.name)
        .sort(),
    ).toEqual(["comment_get", "comment_list"]);
    expect(tools.map((tool) => tool.name).sort()).toEqual(
      MCP_TOOLS.filter((tool) => !tool.mutating)
        .map((tool) => tool.name)
        .sort(),
    );
    expect(
      (
        await client.callTool({
          name: "comment_create",
          arguments: {
            workspaceId: "irrelevant",
            viewId: "irrelevant",
            data: { x: 1, y: 2, text: "Denied" },
          },
        })
      ).isError,
    ).toBe(true);
  } finally {
    await client.close();
    await server.close();
    close();
  }
});
