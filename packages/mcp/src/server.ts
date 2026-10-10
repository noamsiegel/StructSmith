import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PRODUCT } from "@structsmith/contracts";
import type { Services } from "@structsmith/domain";
import { registerPrompts } from "./prompts";
import { registerResources } from "./resources";
import { registerTools } from "./tools";

export interface McpServerOptions {
  services: Services;
  /** When true, no mutating tool is registered at all (spec §53). */
  readOnly: boolean;
}

export function createMcpServer({ services, readOnly }: McpServerOptions): McpServer {
  const server = new McpServer(
    { name: PRODUCT.slug, version: PRODUCT.version },
    {
      instructions: [
        `Call modeling_guide first: without arguments it lists live workspaces, the call order and guide topics; pass topic for one slice (readability, scenarios, acceptance, ...). Then workspace_inspect the workspace you will change; never inspect ${PRODUCT.name} source code to discover schemas. When the user provides a StructSmithRef payload, call reference_resolve before acting. For multi-entity changes use model_preview_operations, then one model_apply_operations batch with @ref aliases, and finish with model_validate. The semantic model is the source of truth; views control membership, view-owned boundaries, presentation and saved layout. Model a relationship once at the most specific C4 level because views automatically lift descendant relationships. A visual change is done only after the changed views are checked in a browser (topic acceptance). Results end with a next[] block of suggested calls.`,
        "Use expectedRevision when replacing or deleting existing data. On conflict inspect again and reconcile before retrying.",
        readOnly
          ? "This server is running in read-only mode; no mutating tools are available."
          : "",
      ]
        .filter(Boolean)
        .join(" "),
    },
  );

  registerTools(server, services, { readOnly });
  registerResources(server, services);
  registerPrompts(server);

  return server;
}
