import type { ArchitectureElement } from "@structsmith/contracts";

export type NodeShape =
  | "rectangle"
  | "subprocess"
  | "diamond"
  | "terminal"
  | "cylinder"
  | "data"
  | "document"
  | "start"
  | "end"
  | "bar";

export function elementShape(element: Pick<ArchitectureElement, "kind" | "role">): NodeShape {
  if (element.kind === "decision" || element.kind === "merge") return "diamond";
  if (element.kind === "outcome") return "terminal";
  if (
    element.kind === "data" ||
    element.kind === "document" ||
    element.kind === "start" ||
    element.kind === "end"
  )
    return element.kind;
  if (element.kind === "fork" || element.kind === "join") return "bar";
  if (element.role === "database") return "cylinder";
  if (element.kind === "workflowGroup") return "subprocess";
  return "rectangle";
}
