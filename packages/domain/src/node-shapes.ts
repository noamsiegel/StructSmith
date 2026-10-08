import type { ArchitectureElement } from "@structsmith/contracts";

export type NodeShape = "rectangle" | "subprocess" | "diamond" | "terminal" | "cylinder";

export function elementShape(element: Pick<ArchitectureElement, "kind" | "role">): NodeShape {
  if (element.kind === "decision") return "diamond";
  if (element.kind === "outcome") return "terminal";
  if (element.role === "database") return "cylinder";
  if (element.kind === "workflowGroup") return "subprocess";
  return "rectangle";
}
