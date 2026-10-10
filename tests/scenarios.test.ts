import { describe, expect, test } from "bun:test";
import { ViewScenarioSchema, ViewSettingsSchema } from "@structsmith/contracts";
import { validateDocument } from "@structsmith/domain";
import {
  clearInvalidScenarioArrivals,
  scenarioProblems,
  validateViewScenarios,
} from "../packages/domain/src/scenarios";
import { createTestContext, createWorkspace } from "./helpers";

const elements = [
  { id: "a", name: "A" },
  { id: "b", name: "B" },
  { id: "c", name: "C" },
];
const relationships = [
  { id: "ab", sourceElementId: "a", targetElementId: "b" },
  { id: "ba", sourceElementId: "b", targetElementId: "a" },
  { id: "bc", sourceElementId: "b", targetElementId: "c" },
];
const scenario = ViewScenarioSchema.parse({
  id: "normal",
  name: "Normal path",
  steps: [
    { elementId: "a", title: "Begin" },
    { elementId: "b", relationshipId: "ab", title: "Process" },
    { elementId: "a", relationshipId: "ba", title: "Retry" },
  ],
});

describe("scenario references", () => {
  test("accepts ordered arrival edges, loops and steps without connections", () => {
    expect(() =>
      validateViewScenarios([scenario], ["a", "b"], elements, relationships),
    ).not.toThrow();
    expect(() =>
      validateViewScenarios(
        [{ ...scenario, steps: scenario.steps.map(({ relationshipId: _, ...step }) => step) }],
        ["a", "b"],
        elements,
        relationships,
      ),
    ).not.toThrow();
  });

  test("rejects elements outside the view or deleted from the workspace", () => {
    expect(() => validateViewScenarios([scenario], ["a"], elements, relationships)).toThrow(
      '"B" must exist in this workspace and view. Add it to the view, or author the scenario on a detail view',
    );
    expect(() =>
      validateViewScenarios([scenario], ["a", "b"], [{ id: "a", name: "A" }], relationships),
    ).toThrow("no longer in the workspace");
  });

  test("rejects reversed, wrong, missing and first-step arrival connections", () => {
    for (const relationshipId of ["ba", "bc"]) {
      const steps = scenario.steps.map((step, index) =>
        index === 1 ? { ...step, relationshipId } : step,
      );
      expect(() =>
        validateViewScenarios([{ ...scenario, steps }], ["a", "b"], elements, relationships),
      ).toThrow("directly join");
    }
    const missing = scenario.steps.map((step, index) =>
      index === 1 ? { ...step, relationshipId: "missing" } : step,
    );
    expect(() =>
      validateViewScenarios([{ ...scenario, steps: missing }], ["a", "b"], elements, relationships),
    ).toThrow("no longer exists");
    const steps = scenario.steps.map((step, index) =>
      index === 0 ? { ...step, relationshipId: "ba" } : step,
    );
    expect(() =>
      validateViewScenarios([{ ...scenario, steps }], ["a", "b"], elements, relationships),
    ).toThrow("first step");
  });

  test("a response replies over the request's connection, so one connection can be used twice", () => {
    const exchange = ViewScenarioSchema.parse({
      id: "exchange",
      name: "Request and reply",
      steps: [
        { elementId: "a", title: "Ask" },
        { elementId: "b", relationshipId: "ab", title: "Request" },
        { elementId: "a", relationshipId: "ab", response: true, title: "Reply" },
        { elementId: "b", relationshipId: "ab", title: "Ask again" },
      ],
    });
    expect(scenarioProblems([exchange], ["a", "b"], elements, relationships)).toEqual([]);
    const forward = exchange.steps.map((step, index) =>
      index === 2 ? { ...step, response: undefined } : step,
    );
    expect(() =>
      validateViewScenarios([{ ...exchange, steps: forward }], ["a", "b"], elements, relationships),
    ).toThrow("directly join");
    const backwards = exchange.steps.map((step, index) =>
      index === 1 ? { ...step, response: true } : step,
    );
    expect(() =>
      validateViewScenarios(
        [{ ...exchange, steps: backwards }],
        ["a", "b"],
        elements,
        relationships,
      ),
    ).toThrow("a response runs from this element back to the previous one");
    const unanchored = exchange.steps.map((step, index) =>
      index === 2 ? { ...step, relationshipId: undefined } : step,
    );
    expect(() =>
      validateViewScenarios(
        [{ ...exchange, steps: unanchored }],
        ["a", "b"],
        elements,
        relationships,
      ),
    ).toThrow("a response needs the connection it replies over");
  });

  test("note steps narrate without an element and cannot anchor an arrival", () => {
    const narrated = ViewScenarioSchema.parse({
      id: "narrated",
      name: "Narrated",
      steps: [
        { title: "Context", description: "Before anything happens." },
        { elementId: "a", title: "Begin" },
        { title: "Meanwhile" },
        { elementId: "b", relationshipId: "ab", title: "Process" },
      ],
    });
    expect(scenarioProblems([narrated], ["a", "b"], elements, relationships)).toEqual([
      expect.objectContaining({ code: "SCENARIO_ARRIVAL_INVALID", stepIndex: 3 }),
    ]);
    const anchored = narrated.steps.filter((step) => step.title !== "Meanwhile");
    expect(
      scenarioProblems([{ ...narrated, steps: anchored }], ["a", "b"], elements, relationships),
    ).toEqual([]);
    expect(
      scenarioProblems(
        [{ ...narrated, steps: [{ title: "Note", relationshipId: "ab" }] }],
        ["a", "b"],
        elements,
        relationships,
      ),
    ).toEqual([expect.objectContaining({ code: "SCENARIO_ARRIVAL_INVALID", stepIndex: 0 })]);
  });

  test("legacy views default to no scenarios; duplicate IDs and empty paths fail schema", () => {
    expect(ViewSettingsSchema.parse({}).scenarios).toEqual([]);
    expect(ViewSettingsSchema.safeParse({ scenarios: [scenario, scenario] }).success).toBe(false);
    expect(ViewScenarioSchema.safeParse({ ...scenario, steps: [] }).success).toBe(false);
  });
});

test("reordering or changing elements removes invalid arrivals while preserving titles and valid loops", () => {
  const [first, second, third] = scenario.steps;
  if (!first || !second || !third) throw new Error("Scenario fixture needs three steps");
  const reordered = [second, first, third];
  const cleaned = clearInvalidScenarioArrivals(reordered, relationships);
  expect(cleaned.map((step) => step.relationshipId)).toEqual([undefined, undefined, undefined]);
  expect(cleaned.map((step) => step.title)).toEqual(["Process", "Begin", "Retry"]);
  expect(clearInvalidScenarioArrivals(scenario.steps, relationships)).toEqual(scenario.steps);
  expect(() =>
    validateViewScenarios([{ ...scenario, steps: cleaned }], ["a", "b"], elements, relationships),
  ).not.toThrow();
  const reply = { elementId: "a", relationshipId: "ab", response: true, title: "Reply" };
  const atB = { elementId: "b", title: "Process" };
  expect(clearInvalidScenarioArrivals([atB, reply], relationships)).toEqual([atB, reply]);
  expect(clearInvalidScenarioArrivals([first, reply], relationships)[1]).toEqual({
    elementId: "a",
    relationshipId: undefined,
    response: undefined,
    title: "Reply",
  });
});

function scenarioWorkspace() {
  const context = createTestContext();
  const { services } = context;
  const workspace = createWorkspace(services);
  const client = services.elements.create(workspace.id, { name: "Client", kind: "action" }).result;
  const api = services.elements.create(workspace.id, { name: "API", kind: "action" }).result;
  const call = services.relationships.create(workspace.id, {
    sourceElementId: client.id,
    targetElementId: api.id,
    description: "Calls",
  }).result;
  const view = services.views.create(workspace.id, {
    name: "Flow",
    kind: "workflow",
    elementIds: [client.id, api.id],
  }).result;
  const steps = [
    { elementId: client.id, title: "Send" },
    { elementId: api.id, relationshipId: call.id, title: "Handle" },
    { elementId: client.id, relationshipId: call.id, response: true, title: "Answer" },
    { title: "Done", description: "Narration only." },
  ];
  return { ...context, workspace, client, api, call, view, steps };
}

test("scenario operations create, patch and delete one scenario with revision guards and undo", () => {
  const { services, close, workspace, view, steps } = scenarioWorkspace();
  try {
    const apply = (
      operations: Parameters<typeof services.model.applyOperations>[1]["operations"],
    ) => services.model.applyOperations(workspace.id, { operations }, "mcp");
    const created = apply([
      { op: "addViewScenario", viewId: view.id, data: { name: "Exchange", steps } },
    ]);
    const id = created.appliedOperations[0]?.id ?? "";
    expect(id).toStartWith("scenario");
    expect(services.views.get(view.id).settings.scenarios).toEqual([
      { id, name: "Exchange", steps },
    ]);
    expect(() =>
      apply([{ op: "addViewScenario", viewId: view.id, data: { id, name: "Twice", steps } }]),
    ).toThrow("already exists");
    apply([
      { op: "updateViewScenario", viewId: view.id, scenarioId: id, data: { name: "Renamed" } },
    ]);
    expect(services.views.get(view.id).settings.scenarios[0]).toEqual({
      id,
      name: "Renamed",
      steps,
    });
    const before = services.workspaces.get(workspace.id).revision;
    expect(() =>
      apply([
        {
          op: "updateViewScenario",
          viewId: view.id,
          scenarioId: id,
          data: { steps: steps.slice(1, 2) },
        },
      ]),
    ).toThrow("first step");
    expect(services.workspaces.get(workspace.id).revision).toBe(before);
    expect(() =>
      apply([{ op: "deleteViewScenario", viewId: view.id, scenarioId: "missing" }]),
    ).toThrow("does not exist");
    const deleted = apply([{ op: "deleteViewScenario", viewId: view.id, scenarioId: id }]);
    expect(services.views.get(view.id).settings.scenarios).toEqual([]);
    services.snapshots.restore(deleted.snapshotId ?? "");
    expect(services.views.get(view.id).settings.scenarios[0]?.name).toBe("Renamed");
  } finally {
    close();
  }
});

test("a scenario can reference elements and connections created earlier in the same batch", () => {
  const { services, close, workspace, view } = scenarioWorkspace();
  try {
    const result = services.model.applyOperations(
      workspace.id,
      {
        operations: [
          { op: "createElement", ref: "db", data: { name: "Store", kind: "action" } },
          { op: "setViewElements", viewId: view.id, elementIds: ["@db"], mode: "add" } as never,
          {
            op: "addViewScenario",
            viewId: view.id,
            data: { id: "batch", name: "Batch", steps: [{ elementId: "@db", title: "Store" }] },
          },
        ],
      },
      "mcp",
    );
    const db = result.appliedOperations[0]?.id;
    expect(services.views.get(view.id).settings.scenarios[0]?.steps[0]?.elementId).toBe(db);
  } finally {
    close();
  }
});

test("deleting a referenced connection keeps the scenario for repair and validation reports it", () => {
  const { services, close, workspace, view, steps, call } = scenarioWorkspace();
  try {
    services.model.applyOperations(
      workspace.id,
      {
        operations: [
          { op: "addViewScenario", viewId: view.id, data: { id: "x", name: "X", steps } },
        ],
      },
      "mcp",
    );
    services.relationships.delete(workspace.id, call.id);
    expect(services.views.get(view.id).settings.scenarios[0]?.steps).toEqual(steps);
    const findings = validateDocument(services.model.getDocument(workspace.id)).issues.filter(
      (issue) => issue.code.startsWith("SCENARIO_"),
    );
    expect(findings.map((issue) => [issue.level, issue.code, issue.viewId])).toEqual([
      ["warning", "SCENARIO_ARRIVAL_INVALID", view.id],
      ["warning", "SCENARIO_ARRIVAL_INVALID", view.id],
    ]);
    expect(findings[0]?.message).toContain('View "Flow": Scenario "X", step 2');
    expect(findings[0]?.relationshipId).toBeUndefined();
    // An unrelated edit to another scenario still saves while this one stays stale.
    services.model.applyOperations(
      workspace.id,
      {
        operations: [
          {
            op: "addViewScenario",
            viewId: view.id,
            data: { id: "y", name: "Y", steps: [{ title: "Only a note" }] },
          },
        ],
      },
      "mcp",
    );
    expect(services.views.get(view.id).settings.scenarios.map((item) => item.id)).toEqual([
      "x",
      "y",
    ]);
  } finally {
    close();
  }
});

test("responses and note steps survive native export/import and snapshot restore", () => {
  const { services, close, workspace, view, steps, client, api } = scenarioWorkspace();
  try {
    services.model.applyOperations(
      workspace.id,
      {
        operations: [
          { op: "addViewScenario", viewId: view.id, data: { id: "x", name: "X", steps } },
        ],
      },
      "ui",
    );
    const snapshot = services.snapshots.create(workspace.id, "Before");
    services.model.applyOperations(
      workspace.id,
      { operations: [{ op: "deleteViewScenario", viewId: view.id, scenarioId: "x" }] },
      "ui",
    );
    services.snapshots.restore(snapshot.id);
    expect(services.views.get(view.id).settings.scenarios[0]?.steps).toEqual(steps);

    const copy = services.imports.importDocument(services.model.getDocument(workspace.id), {
      mode: "new",
      name: "Copy",
    });
    const model = services.model.get(copy.id);
    const byName = (name: string) => model.elements.find((element) => element.name === name)?.id;
    const copied = services.views.listDetailed(copy.id)[0]?.settings.scenarios[0];
    expect(copied?.steps).toEqual([
      { elementId: byName(client.name), title: "Send" },
      { elementId: byName(api.name), relationshipId: model.relationships[0]?.id, title: "Handle" },
      {
        elementId: byName(client.name),
        relationshipId: model.relationships[0]?.id,
        response: true,
        title: "Answer",
      },
      { title: "Done", description: "Narration only." },
    ]);
    expect(validateDocument(services.model.getDocument(copy.id)).issues).not.toContainEqual(
      expect.objectContaining({ code: expect.stringMatching(/^SCENARIO_/) }),
    );
  } finally {
    close();
  }
});
