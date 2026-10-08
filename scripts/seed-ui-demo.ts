import { WorkspaceDocumentSchema, WorkspaceSchema } from "@structsmith/contracts";
import { buildUiDemoDocument } from "./ui-demo-fixture";

/** Use REST so the running service retains ownership of its database. */
export async function seedUiDemo(baseUrl: string, reset = false) {
  const document = buildUiDemoDocument();
  const base = baseUrl.replace(/\/$/, "");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.APP_TOKEN) headers.Authorization = `Bearer ${process.env.APP_TOKEN}`;
  const request = async (path: string, body?: unknown) => {
    const response = await fetch(`${base}/api${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`${response.status} ${path}: ${await response.text()}`);
    return response.json();
  };
  const path = `/workspaces/${document.workspace.id}`;
  const existing = await fetch(`${base}/api${path}`, { headers });
  if (existing.ok) {
    const workspace = WorkspaceSchema.parse(await existing.json());
    if (workspace.name !== document.workspace.name) {
      throw new Error(`Refusing to replace unrelated workspace ${workspace.id}.`);
    }
    if (!reset) {
      if (workspace.revision === 1) {
        const saved = WorkspaceDocumentSchema.parse(await request(`${path}/document`));
        if (!saved.views.length && !saved.elements.length) {
          throw new Error("UI demo seed is incomplete. Run bun run ui:demo --reset to recover.");
        }
      }
      return workspace;
    }
    WorkspaceDocumentSchema.parse(await request(`${path}/document`));
    await request(`${path}/snapshots`, { label: "Before UI demo reset", source: "import" });
  } else if (existing.status === 404) {
    await request("/workspaces", {
      id: document.workspace.id,
      name: document.workspace.name,
      mode: document.workspace.mode,
      description: document.workspace.description,
    });
  } else {
    throw new Error(`${existing.status} ${path}: ${await existing.text()}`);
  }
  return WorkspaceSchema.parse(
    await request("/workspaces/import", { document, mode: "overwrite" }),
  );
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log("Usage: bun run ui:demo [http://127.0.0.1:8090] [--reset]");
    console.log(
      "Create the UI demo once. --reset snapshots existing edits before restoring baseline.",
    );
  } else {
    const unknown = args.find((arg) => arg.startsWith("--") && arg !== "--reset");
    if (unknown) throw new Error(`Unknown option: ${unknown}`);
    const baseUrl = args.find((arg) => arg !== "--reset") ?? "http://127.0.0.1:8090";
    const workspace = await seedUiDemo(baseUrl, args.includes("--reset"));
    console.log(`[ui-demo] ${baseUrl.replace(/\/$/, "")}/w/${workspace.id}?view=demo-home`);
  }
}
