import { expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createTestContext, createWorkspace } from "../../../tests/helpers";
import { MCP_TOOLS } from "./catalog";
import { createMcpServer } from "./server";

test("MCP annotations CRUD guards revisions, isolates views, snapshots deletes and validates cells", async () => {
  const { services, close } = createTestContext();
  const server = createMcpServer({ services, readOnly: false });
  const client = new Client({ name: "annotation-test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(b);
    await client.connect(a);
    const workspace = createWorkspace(services);
    const view = services.views.create(workspace.id, {
      name: "Annotations",
      kind: "custom",
    }).result;
    const base = { workspaceId: workspace.id, viewId: view.id };
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const result = await client.callTool({ name, arguments: { ...base, ...args } });
      if (result.isError) throw new Error(JSON.stringify(result));
      const block = result.content as Array<{ type: string; text: string }>;
      return JSON.parse(block[0]?.text ?? "null");
    };
    const created = await call("annotation_create", {
      data: {
        kind: "table",
        x: 0,
        y: 0,
        width: 500,
        height: 200,
        cells: [
          ["Source", "Status"],
          ["Portal", "Captured"],
        ],
      },
    });
    const annotationId = created.annotations[0].id;
    expect(created.snapshotId).toBeString();
    const updated = await call("annotation_update", {
      annotationId,
      expectedRevision: created.revision,
      data: {
        color: "#bbddff",
        cells: [
          ["Source", "Status"],
          ["Portal", "Published"],
        ],
      },
    });
    expect(await call("annotation_get", { annotationId })).toMatchObject({
      id: annotationId,
      kind: "table",
      color: "#bbddff",
      x: 0,
      cells: [
        ["Source", "Status"],
        ["Portal", "Published"],
      ],
    });
    expect(
      (
        await client.callTool({
          name: "annotation_delete",
          arguments: { ...base, annotationId, expectedRevision: created.revision },
        })
      ).isError,
    ).toBe(true);
    expect(
      (
        await client.callTool({
          name: "annotation_update",
          arguments: { ...base, annotationId, data: { cells: [["a"], ["b", "c"]] } },
        })
      ).isError,
    ).toBe(true);
    const stranger = createWorkspace(services, "Stranger");
    expect(
      (
        await client.callTool({
          name: "annotation_delete",
          arguments: { ...base, workspaceId: stranger.id, annotationId },
        })
      ).isError,
    ).toBe(true);
    expect(await call("annotation_list")).toEqual(updated.annotations);
    const deleted = await call("annotation_delete", {
      annotationId,
      expectedRevision: updated.revision,
    });
    expect(await call("annotation_list")).toEqual([]);
    services.snapshots.restore(deleted.snapshotId);
    expect(await call("annotation_get", { annotationId })).toEqual(updated.annotations[0]);
    expect(
      (
        await client.callTool({
          name: "annotation_get",
          arguments: { viewId: view.id, annotationId: "missing" },
        })
      ).isError,
    ).toBe(true);
  } finally {
    await client.close();
    await server.close();
    close();
  }
});

test("read-only MCP exposes annotation reads and excludes all annotation writes", async () => {
  const { services, close } = createTestContext();
  const server = createMcpServer({ services, readOnly: true });
  const client = new Client({ name: "annotation-readonly-test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(b);
    await client.connect(a);
    const tools = (await client.listTools()).tools;
    expect(
      tools
        .filter((tool) => tool.name.startsWith("annotation_"))
        .map((tool) => tool.name)
        .sort(),
    ).toEqual(["annotation_get", "annotation_list"]);
    expect(tools.map((tool) => tool.name).sort()).toEqual(
      MCP_TOOLS.filter((tool) => !tool.mutating)
        .map((tool) => tool.name)
        .sort(),
    );
    expect(
      (
        await client.callTool({
          name: "annotation_delete",
          arguments: { workspaceId: "missing", viewId: "missing", annotationId: "missing" },
        })
      ).isError,
    ).toBe(true);
  } finally {
    await client.close();
    await server.close();
    close();
  }
});
