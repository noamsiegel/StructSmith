import { MCP_TOOLS } from "./catalog";

/** What an empty list means, named by the context that was searched. */
const empties: Record<string, (args: Args) => string> = {
  workspace_list: () => "0 workspaces on this server.",
  view_list: (args) => `0 views in workspace ${args.workspaceId}.`,
  boundary_list: (args) => `0 boundaries on view ${args.viewId}.`,
  annotation_list: (args) => `0 annotations on view ${args.viewId}.`,
  scenario_list: (args) => `0 scenarios on view ${args.viewId}.`,
  comment_list: (args) => `0 comment threads on view ${args.viewId}.`,
  record_list: (args) => `0 records in workspace ${args.workspaceId}.`,
  snapshot_list: (args) => `0 snapshots of workspace ${args.workspaceId}.`,
};

type Args = Record<string, unknown> & { workspaceId?: string; viewId?: string };

const call = (tool: string, args: Record<string, unknown>) => `${tool} ${JSON.stringify(args)}`;

function parse(text: string | undefined): unknown {
  try {
    return text === undefined ? undefined : JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * A short text block appended to a tool result: a named empty state and two to four
 * concrete next calls, so agents need neither a skill nor a follow-up guide lookup.
 */
export function nextSteps(name: string, input: unknown, text: string | undefined): string | null {
  const args = (input ?? {}) as Args;
  const result = parse(text) as Record<string, unknown> | unknown[] | undefined;
  const ws = args.workspaceId ? { workspaceId: args.workspaceId } : {};
  const lines: string[] = [];
  let summary: string | null = null;

  if (Array.isArray(result) && result.length === 0 && empties[name]) summary = empties[name](args);

  if (name === "workspace_list") {
    const first = Array.isArray(result) ? (result[0] as { id?: string } | undefined) : undefined;
    lines.push(
      first?.id
        ? call("workspace_inspect", { workspaceId: first.id })
        : call("workspace_create", { name: "…" }),
      call("modeling_guide", {}),
    );
  } else if (name === "workspace_inspect") {
    lines.push(
      call("modeling_guide", { topic: "workflow" }),
      call("model_preview_operations", { ...ws, operations: ["…"] }),
    );
  } else if (name === "model_validate" && result && !Array.isArray(result)) {
    const issues = (result.issues ?? []) as { level: string; code: string }[];
    const count = (level: string) => issues.filter((issue) => issue.level === level).length;
    summary = issues.length
      ? `${count("error")} errors, ${count("warning")} warnings, ${count("info")} info in workspace ${args.workspaceId}.`
      : `0 validation issues in workspace ${args.workspaceId}.`;
    if (issues.some((issue) => issue.code.startsWith("SCENARIO_")))
      lines.push(call("scenario_update", { ...ws, viewId: "…", scenarioId: "…", data: {} }));
    lines.push(call("modeling_guide", { topic: "acceptance" }));
  } else if (name === "workspace_create" && result && !Array.isArray(result)) {
    const created = (result.result ?? result) as { id?: string };
    if (created.id)
      lines.push(
        call("workspace_inspect", { workspaceId: created.id }),
        call("modeling_guide", { topic: "readability" }),
      );
  } else if (name === "scenario_list" && Array.isArray(result) && result.length === 0) {
    lines.push(
      call("scenario_create", { ...ws, viewId: args.viewId, data: { name: "…", steps: [] } }),
      call("modeling_guide", { topic: "scenarios" }),
    );
  } else if (MCP_TOOLS.find((tool) => tool.name === name)?.mutating) {
    if (args.workspaceId) lines.push(call("model_validate", ws));
    if (args.workspaceId && args.viewId)
      lines.push(
        `Open /w/${args.workspaceId}?view=${args.viewId} and check it: ${call("modeling_guide", { topic: "acceptance" })}`,
      );
    const snapshotId =
      result && !Array.isArray(result) && typeof result.snapshotId === "string"
        ? result.snapshotId
        : null;
    if (snapshotId) lines.push(`Undo: ${call("snapshot_restore", { snapshotId })}`);
  }

  if (!summary && !lines.length) return null;
  return [
    ...(summary ? [summary] : []),
    ...(lines.length ? [`next[${lines.length}]:`, ...lines.map((line) => `  ${line}`)] : []),
  ].join("\n");
}
