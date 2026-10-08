import { expect, test } from "bun:test";
import { elementShape, estimateElementSize } from "@structsmith/domain";
import { buildGraph } from "../apps/web/src/features/canvas/graph";
import { createTestContext } from "./helpers";

test("shapes distinguish flow semantics and databases without inventing C4 levels", () => {
  expect(elementShape({ kind: "action", role: "worker" })).toBe("rectangle");
  expect(elementShape({ kind: "workflowGroup", role: null })).toBe("subprocess");
  expect(elementShape({ kind: "decision", role: null })).toBe("diamond");
  expect(elementShape({ kind: "outcome", role: null })).toBe("terminal");
  expect(elementShape({ kind: "component", role: "database" })).toBe("cylinder");
  expect(elementShape({ kind: "container", role: "database" })).toBe("cylinder");
  expect(elementShape({ kind: "container", role: "queue" })).toBe("rectangle");
});

test("diamond layout reserves a readable text rectangle and DB caps clear content", () => {
  const { services, close } = createTestContext();
  try {
    const workspace = services.workspaces.create({ name: "Shapes" });
    const action = services.elements.create(workspace.id, {
      name: "Check account-matched captured evidence for safety and coverage",
      kind: "action",
      description: "Compare the portal account and identity.\nKeep unsafe evidence out of charges.",
    }).result;
    const decision = services.elements.create(workspace.id, {
      ...action,
      id: undefined,
      kind: "decision",
    }).result;
    const database = services.elements.create(workspace.id, {
      name: "Ledger captures",
      kind: "container",
      role: "database",
    }).result;
    const settings = { showFullTitles: true, showDescriptions: true };
    const actionSize = estimateElementSize(action, settings);
    const decisionSize = estimateElementSize(decision, settings, { width: 220, height: 96 });
    expect(decisionSize.width / 2).toBe(actionSize.width);
    expect(decisionSize.height / 2).toBeGreaterThanOrEqual(actionSize.height);
    expect(
      estimateElementSize(database, { showFullTitles: false, showDescriptions: false }).height,
    ).toBeGreaterThan(96);
    const view = services.views.create(workspace.id, {
      name: "Shapes",
      kind: "workflow",
      elementIds: [action.id, decision.id, database.id],
      settings,
    }).result;
    services.relationships.create(workspace.id, {
      sourceElementId: action.id,
      targetElementId: decision.id,
      description: "Verify",
    });
    services.relationships.create(workspace.id, {
      sourceElementId: decision.id,
      targetElementId: database.id,
      description: "Store",
    });
    const before = services.elements.list(workspace.id);
    services.views.autoLayout(workspace.id, view.id, "LR");
    const model = services.model.get(workspace.id);
    const graph = buildGraph({ view: services.views.get(view.id), ...model, records: [] });
    const decisionNode = graph.nodes.find((node) => node.id === decision.id);
    const databaseNode = graph.nodes.find((node) => node.id === database.id);
    if (!decisionNode || !databaseNode) throw new Error("Missing shape nodes");
    expect(decisionNode.width).toBe(decisionSize.width);
    expect(databaseNode.position.x).toBeGreaterThan(decisionNode.position.x + decisionSize.width);
    expect(services.elements.list(workspace.id)).toEqual(before);
  } finally {
    close();
  }
});

test("compact database and outcome shapes retain an explicitly saved height", () => {
  for (const shape of [
    { kind: "container" as const, role: "database" as const },
    { kind: "outcome" as const, role: null },
  ]) {
    const element = { ...shape, name: "Saved", description: null, technology: null };
    const settings = { showFullTitles: false, showDescriptions: false };
    const first = estimateElementSize(element, settings, { height: 200 });
    expect(first.height).toBe(200);
    expect(estimateElementSize(element, settings, first).height).toBe(200);
  }
});
