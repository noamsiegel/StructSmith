import { expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createTestContext, createWorkspace } from "../../../tests/helpers";
import { GUIDE_TOPICS } from "./guide";
import { createMcpServer } from "./server";

async function connect(readOnly = false) {
  const context = createTestContext();
  const server = createMcpServer({ services: context.services, readOnly });
  const client = new Client({ name: "guide-test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  await client.connect(a);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args });
    const blocks = result.content as Array<{ text: string }>;
    if (result.isError) throw new Error(blocks[0]?.text);
    return { data: JSON.parse(blocks[0]?.text ?? "null"), hint: blocks[1]?.text ?? null };
  };
  const close = async () => {
    await client.close();
    await server.close();
    context.close();
  };
  return { ...context, client, call, close };
}

test("modeling_guide opens on live content and serves one topic at a time", async () => {
  const { services, call, client, close } = await connect();
  try {
    const empty = (await call("modeling_guide")).data;
    expect(empty.workspaces).toEqual({
      count: 0,
      note: "0 workspaces on this server. Create one with workspace_create.",
    });
    const workspace = createWorkspace(services, "Payments");
    const home = (await call("modeling_guide")).data;
    expect(home.workspaces.items).toEqual([
      { id: workspace.id, name: "Payments", revision: workspace.revision },
    ]);
    expect(home.topics.map((topic: { id: string }) => topic.id)).toEqual(
      GUIDE_TOPICS.filter((topic) => topic !== "all"),
    );
    // The home view is a fraction of the complete reference.
    const all = JSON.stringify((await call("modeling_guide", { topic: "all" })).data);
    expect(JSON.stringify(home).length * 4).toBeLessThan(all.length);

    const readability = (await call("modeling_guide", { topic: "readability" })).data;
    expect(readability.status).toContain("status:live");
    expect((await call("modeling_guide", { topic: "acceptance" })).data.url).toBe(
      "Each view opens at /w/{workspaceId}?view={viewId} on the StructSmith server (add &ref=element:{id} or &ref=scenario:{id} to focus or start a walkthrough).",
    );
    expect((await call("modeling_guide", { topic: "integrity" })).data.imports).toContain(
      "diamond decision",
    );
    const scenarios = (await call("modeling_guide", { topic: "scenarios" })).data;
    expect(scenarios.scenarios).toContain("response: true");
    expect(JSON.stringify(scenarios)).not.toContain("layoutAlgorithms");
    for (const topic of GUIDE_TOPICS)
      expect((await call("modeling_guide", { topic })).data).toBeTruthy();
    expect(
      (await client.callTool({ name: "modeling_guide", arguments: { topic: "nope" } })).isError,
    ).toBe(true);
    const instructions = client.getInstructions() ?? "";
    expect(instructions).toContain("Call modeling_guide first");
    expect(instructions).toContain("topic acceptance");
  } finally {
    await close();
  }
});

test("results name empty states and suggest concrete next calls", async () => {
  const { services, call, close } = await connect();
  try {
    expect((await call("workspace_list")).hint).toBe(
      '0 workspaces on this server.\nnext[2]:\n  workspace_create {"name":"…"}\n  modeling_guide {}',
    );
    const workspace = createWorkspace(services);
    const step = services.elements.create(workspace.id, { name: "Step", kind: "action" }).result;
    const view = services.views.create(workspace.id, {
      name: "Flow",
      kind: "workflow",
      elementIds: [step.id],
    }).result;
    const base = { workspaceId: workspace.id, viewId: view.id };
    const empty = await call("scenario_list", base);
    expect(empty.data).toEqual([]);
    expect(empty.hint).toStartWith(`0 scenarios on view ${view.id}.\nnext[2]:\n  scenario_create`);

    const created = await call("scenario_create", {
      ...base,
      data: { name: "Walk", steps: [{ elementId: step.id, title: "Go" }] },
    });
    expect(created.hint).toBe(
      [
        "next[3]:",
        `  model_validate {"workspaceId":"${workspace.id}"}`,
        `  Open /w/${workspace.id}?view=${view.id} and check it: modeling_guide {"topic":"acceptance"}`,
        `  Undo: snapshot_restore {"snapshotId":"${created.data.snapshotId}"}`,
      ].join("\n"),
    );
    expect((await call("model_validate", { workspaceId: workspace.id })).hint).toStartWith(
      `0 validation issues in workspace ${workspace.id}.`,
    );
    services.elements.create(workspace.id, { name: "Unplaced", kind: "container" });
    const validated = await call("model_validate", { workspaceId: workspace.id });
    const count = (level: string) =>
      validated.data.issues.filter((issue: { level: string }) => issue.level === level).length;
    expect(count("warning")).toBeGreaterThan(count("error"));
    expect(validated.hint).toStartWith(
      `${count("error")} errors, ${count("warning")} warnings, ${count("info")} info in workspace ${workspace.id}.`,
    );
  } finally {
    await close();
  }
});
