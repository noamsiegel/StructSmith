import { expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createTestContext, createWorkspace } from "../../../tests/helpers";
import { createMcpServer } from "./server";

test("MCP scenario tools author, validate, resolve and undo walkthroughs", async () => {
  const { services, close } = createTestContext();
  const server = createMcpServer({ services, readOnly: false });
  const client = new Client({ name: "scenario-test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(b);
    await client.connect(a);
    const workspace = createWorkspace(services);
    const browser = services.elements.create(workspace.id, { name: "Browser", kind: "action" });
    const api = services.elements.create(workspace.id, { name: "API", kind: "action" });
    const request = services.relationships.create(workspace.id, {
      sourceElementId: browser.result.id,
      targetElementId: api.result.id,
      description: "Sends credentials",
    }).result;
    const view = services.views.create(workspace.id, {
      name: "Sign in",
      kind: "workflow",
      elementIds: [browser.result.id, api.result.id],
    }).result;
    const base = { workspaceId: workspace.id, viewId: view.id };
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const result = await client.callTool({ name, arguments: { ...base, ...args } });
      const text = (result.content as Array<{ text: string }>)[0]?.text ?? "null";
      if (result.isError) throw new Error(text);
      return JSON.parse(text);
    };
    const steps = [
      { elementId: browser.result.id, title: "Submit" },
      { elementId: api.result.id, relationshipId: request.id, title: "Check password" },
      {
        elementId: browser.result.id,
        relationshipId: request.id,
        response: true,
        title: "Session cookie",
      },
      { title: "Signed in", description: "The browser shows the dashboard." },
    ];

    const guide = await call("modeling_guide", { topic: "all" });
    expect(guide.views.settings.scenarios).toContain("response: true replies back");
    expect(guide.enums.operationKinds).toContain("addViewScenario");
    expect(guide.enums.operationKinds).toContain("addViewComment");

    const created = await call("scenario_create", { data: { name: "Sign in", steps } });
    const id = created.scenarioId;
    expect(created.scenarios).toEqual([{ id, name: "Sign in", steps }]);
    expect(await call("scenario_list")).toEqual(created.scenarios);
    expect(await call("scenario_get", { scenarioId: id })).toEqual(created.scenarios[0]);
    const mermaid = await client.callTool({
      name: "scenario_get",
      arguments: { ...base, scenarioId: id, format: "mermaid" },
    });
    expect((mermaid.content as Array<{ text: string }>)[0]?.text).toBe(
      [
        "sequenceDiagram",
        "  title Sign in",
        "  participant p1 as Browser",
        "  participant p2 as API",
        "  Note over p1: Submit",
        "  p1->>p2: Check password",
        "  p2-->>p1: Session cookie",
        "  Note over p1,p2: Signed in",
      ].join("\n"),
    );

    await expect(
      call("scenario_create", {
        data: { name: "Bad", steps: [{ ...steps[1], relationshipId: request.id }] },
      }),
    ).rejects.toThrow("first step");
    await expect(
      call("scenario_update", {
        scenarioId: id,
        expectedRevision: created.previousRevision,
        data: { name: "Stale" },
      }),
    ).rejects.toThrow();

    const renamed = await call("scenario_update", {
      scenarioId: id,
      data: { name: "Password sign in" },
    });
    expect(renamed.scenarios[0]).toEqual({ id, name: "Password sign in", steps });

    const resolved = await call("reference_resolve", {
      type: "scenario",
      targetId: id,
      viewId: view.id,
    });
    expect(resolved.reference.viewId).toBe(view.id);
    expect(
      resolved.context.steps.map(
        (step: { element: { name: string } | null }) => step.element?.name ?? null,
      ),
    ).toEqual(["Browser", "API", "Browser", null]);
    expect(resolved.context.steps[2].relationship.description).toBe("Sends credentials");
    expect(resolved.context.problems).toEqual([]);

    await call("relationship_delete", { relationshipId: request.id });
    const findings = (await call("model_validate")).issues.filter((issue: { code: string }) =>
      issue.code.startsWith("SCENARIO_"),
    );
    expect(findings).toHaveLength(2);
    expect(findings[0].message).toContain("arrival connection no longer exists");
    expect(
      (await call("reference_resolve", { type: "scenario", targetId: id })).context.problems,
    ).toHaveLength(2);
    const repaired = await call("scenario_update", {
      scenarioId: id,
      data: { steps: steps.map(({ relationshipId: _, response: __, ...step }) => step) },
    });
    expect(repaired.scenarios[0].steps[2]).toEqual({
      elementId: browser.result.id,
      title: "Session cookie",
    });
    expect(
      (await call("model_validate")).issues.some((issue: { code: string }) =>
        issue.code.startsWith("SCENARIO_"),
      ),
    ).toBe(false);

    const deleted = await call("scenario_delete", { scenarioId: id });
    expect(deleted.scenarios).toEqual([]);
    await expect(call("scenario_get", { scenarioId: id })).rejects.toThrow("does not exist");
    services.snapshots.restore(deleted.snapshotId);
    expect((await call("scenario_get", { scenarioId: id })).name).toBe("Password sign in");
  } finally {
    await client.close();
    await server.close();
    close();
  }
});

test("scenario references need their view when the same id exists on two views", async () => {
  const { services, close } = createTestContext();
  const server = createMcpServer({ services, readOnly: true });
  const client = new Client({ name: "scenario-reference-test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(b);
    await client.connect(a);
    const workspace = createWorkspace(services);
    const element = services.elements.create(workspace.id, { name: "Step", kind: "action" });
    const views = ["One", "Two"].map(
      (name) =>
        services.views.create(workspace.id, {
          name,
          kind: "workflow",
          elementIds: [element.result.id],
          settings: {
            scenarios: [
              { id: "shared", name, steps: [{ elementId: element.result.id, title: "Go" }] },
            ],
          },
        }).result,
    );
    const resolve = (args: Record<string, unknown>) =>
      client.callTool({
        name: "reference_resolve",
        arguments: { workspaceId: workspace.id, type: "scenario", targetId: "shared", ...args },
      });
    const ambiguous = await resolve({});
    expect(ambiguous.isError).toBe(true);
    expect(JSON.stringify(ambiguous.content)).toContain("pass the reference's viewId");
    const second = await resolve({ viewId: views[1]?.id });
    const text = (second.content as Array<{ text: string }>)[0]?.text ?? "{}";
    expect(JSON.parse(text).target.name).toBe("Two");
  } finally {
    await client.close();
    await server.close();
    close();
  }
});
