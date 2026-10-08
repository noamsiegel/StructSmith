export interface McpToolInfo {
  name: string;
  description: string;
  mutating: boolean;
}

/** Advertised in the UI (Settings → MCP) and used to gate read-only mode. */
export const MCP_TOOLS: readonly McpToolInfo[] = [
  {
    name: "modeling_guide",
    description: "Read modeling rules, allowed enum values and the recommended MCP workflow.",
    mutating: false,
  },
  { name: "workspace_list", description: "List all workspaces.", mutating: false },
  { name: "workspace_get", description: "Read a single workspace.", mutating: false },
  {
    name: "workspace_inspect",
    description:
      "Read a complete AI-oriented packet with model, view membership, view-owned boundaries, settings, validation and optional layout/history.",
    mutating: false,
  },
  {
    name: "reference_resolve",
    description:
      "Resolve a copied StructSmith reference to its exact object and useful surrounding context.",
    mutating: false,
  },
  { name: "workspace_create", description: "Create a workspace.", mutating: true },
  {
    name: "workspace_update",
    description: "Update a workspace name, description or validation mode.",
    mutating: true,
  },
  {
    name: "workspace_delete",
    description: "Delete a workspace and everything in it.",
    mutating: true,
  },

  {
    name: "model_get",
    description:
      "Read reusable semantic elements and relationships; view-owned boundaries are returned by view tools.",
    mutating: false,
  },
  {
    name: "model_validate",
    description: "Run the deterministic architecture validator.",
    mutating: false,
  },
  {
    name: "model_apply_operations",
    description:
      "Apply 1-500 operations atomically with @ref aliases and an automatic snapshot. Preferred for larger changes.",
    mutating: true,
  },
  {
    name: "model_preview_operations",
    description:
      "Run a batch through the real engine and validator, then roll it back without persisting anything.",
    mutating: false,
  },

  {
    name: "annotation_list",
    description: "List view-owned text, note and table annotations.",
    mutating: false,
  },
  {
    name: "annotation_get",
    description: "Read one annotation from its owning view.",
    mutating: false,
  },
  {
    name: "annotation_create",
    description:
      "Add a text, note or table annotation to a view with revision protection and an undo snapshot.",
    mutating: true,
  },
  {
    name: "annotation_update",
    description:
      "Patch annotation text, cells, geometry, color or Section membership without changing its ID or kind.",
    mutating: true,
  },
  {
    name: "annotation_delete",
    description: "Delete one annotation from its view with an undo snapshot.",
    mutating: true,
  },

  { name: "element_create", description: "Add an element to the model.", mutating: true },
  { name: "element_update", description: "Update an element.", mutating: true },
  { name: "element_delete", description: "Delete an element from the model.", mutating: true },

  {
    name: "boundary_list",
    description: "List one view's semantic boundary trees and element memberships.",
    mutating: false,
  },
  {
    name: "boundary_create",
    description: "Create a view-owned semantic boundary; it is not a model element.",
    mutating: true,
  },
  {
    name: "boundary_update",
    description:
      "Update a view-owned boundary, its nesting or members; assigning members moves them within the same view layer.",
    mutating: true,
  },
  {
    name: "boundary_delete",
    description: "Delete a view-owned boundary, optionally with its nested boundaries.",
    mutating: true,
  },

  { name: "relationship_create", description: "Connect two elements.", mutating: true },
  { name: "relationship_update", description: "Update a relationship.", mutating: true },
  { name: "relationship_delete", description: "Delete a relationship.", mutating: true },

  { name: "view_list", description: "List the views of a workspace.", mutating: false },
  {
    name: "view_get",
    description: "Read a view including settings, boundaries, memberships and saved layout.",
    mutating: false,
  },
  { name: "view_create", description: "Create a view.", mutating: true },
  {
    name: "view_update",
    description: "Update view metadata or presentation and layout settings.",
    mutating: true,
  },
  { name: "view_delete", description: "Delete a view (the model is untouched).", mutating: true },
  {
    name: "comment_list",
    description: "Read all comment threads on a view, including resolved threads and replies.",
    mutating: false,
  },
  {
    name: "comment_get",
    description: "Read one comment thread and its replies by view and comment id.",
    mutating: false,
  },
  {
    name: "comment_create",
    description:
      "Create a view-owned comment at canvas x/y coordinates. Returns revision, undo snapshot and threads with generated ids.",
    mutating: true,
  },
  {
    name: "comment_update",
    description:
      "Edit comment text or position, or resolve/reopen with data.resolved. Preserves replies.",
    mutating: true,
  },
  {
    name: "comment_delete",
    description: "Delete a whole comment thread, including all replies. Returns an undo snapshot.",
    mutating: true,
  },
  {
    name: "comment_reply_create",
    description: "Append a reply to a comment thread. Returns threads with generated reply ids.",
    mutating: true,
  },
  {
    name: "comment_reply_update",
    description: "Edit one reply without replacing the thread or other replies.",
    mutating: true,
  },
  {
    name: "comment_reply_delete",
    description: "Delete one reply while retaining the parent comment and other replies.",
    mutating: true,
  },
  {
    name: "view_set_elements",
    description:
      "Add or remove reusable model elements on a view; removing one also clears its boundary memberships in that view.",
    mutating: true,
  },
  {
    name: "view_set_layout",
    description:
      "Save element positions, sizes and locks plus per-view relationship visibility, labels or bend points.",
    mutating: true,
  },
  {
    name: "view_auto_layout",
    description:
      "Persist an automatic dagre, force, radial or grid layout for a view while keeping locked elements fixed.",
    mutating: true,
  },

  {
    name: "record_list",
    description: "List presales records (risks, assumptions, …).",
    mutating: false,
  },
  { name: "record_create", description: "Create a presales record.", mutating: true },
  { name: "record_update", description: "Update a presales record.", mutating: true },
  { name: "record_delete", description: "Delete a presales record.", mutating: true },

  { name: "snapshot_list", description: "List workspace snapshots.", mutating: false },
  { name: "snapshot_create", description: "Create a snapshot.", mutating: true },
  { name: "snapshot_restore", description: "Restore a snapshot.", mutating: true },

  {
    name: "export_json",
    description: "Export the full workspace document as JSON.",
    mutating: false,
  },
  {
    name: "export_mermaid",
    description: "Export the model or a view as a Mermaid diagram.",
    mutating: false,
  },
  {
    name: "import_mermaid",
    description:
      "Import Mermaid flowchart/graph source as a semantic workspace with an arranged view. Other diagram types are rejected. Defaults to a new workspace; overwrite replaces the entire target workspace and requires workspaceId.",
    mutating: true,
  },
];

export const MCP_RESOURCES: readonly string[] = [
  "architecture://guide",
  "architecture://workspaces",
  "architecture://workspace/{workspaceId}",
  "architecture://workspace/{workspaceId}/inspection",
  "architecture://workspace/{workspaceId}/model",
  "architecture://workspace/{workspaceId}/views",
  "architecture://workspace/{workspaceId}/view/{viewId}",
  "architecture://workspace/{workspaceId}/records",
];

export interface McpPromptInfo {
  name: string;
  description: string;
}

export const MCP_PROMPTS: readonly McpPromptInfo[] = [
  { name: "review_architecture", description: "Review the architecture of a workspace." },
  {
    name: "create_presales_architecture",
    description: "Draft a presales architecture from a brief.",
  },
  { name: "identify_architecture_risks", description: "List architectural risks and record them." },
  { name: "identify_unknowns", description: "Find open questions for a discovery call." },
  { name: "review_security", description: "Review the architecture from a security angle." },
  { name: "review_scalability", description: "Review the architecture for scalability." },
];
