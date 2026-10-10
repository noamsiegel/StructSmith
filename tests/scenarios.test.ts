import { describe, expect, test } from "bun:test";
import { ViewScenarioSchema, ViewSettingsSchema } from "@structsmith/contracts";
import { validateDocument } from "@structsmith/domain";
import {
  clearInvalidScenarioArrivals,
  scenarioProblems,
  scenarioToMermaid,
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
      '"B" must exist in this workspace and view. Add it to the view, or place the step on a detail view',
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

test("a step can continue on another view and light up several things at once", () => {
  const { services, close } = createTestContext();
  try {
    const workspace = createWorkspace(services);
    const make = (name: string, parentId?: string) =>
      services.elements.create(workspace.id, {
        name,
        kind: parentId ? "action" : "workflowGroup",
        ...(parentId ? { parentId } : {}),
      }).result;
    const group = make("Onboard");
    const other = make("Upload");
    const child = make("Verify email", group.id);
    const second = make("Set password", group.id);
    const handoff = services.relationships.create(workspace.id, {
      sourceElementId: group.id,
      targetElementId: other.id,
    }).result;
    const inner = services.relationships.create(workspace.id, {
      sourceElementId: child.id,
      targetElementId: second.id,
    }).result;
    const home = services.views.create(workspace.id, {
      name: "Home",
      kind: "workflow",
      elementIds: [group.id, other.id],
    }).result;
    const detail = services.views.create(workspace.id, {
      name: "Onboard details",
      kind: "workflow",
      scopeElementId: group.id,
      elementIds: [child.id, second.id, other.id],
    }).result;
    const add = (steps: unknown[]) =>
      services.model.applyOperations(
        workspace.id,
        {
          operations: [
            { op: "addViewScenario", viewId: home.id, data: { name: "Walk", steps } as never },
          ],
        },
        "mcp",
      );
    const valid = [
      {
        title: "Who is involved",
        highlightElementIds: [group.id, other.id],
        highlightRelationshipIds: [handoff.id],
      },
      { elementId: group.id, title: "Start onboarding" },
      { elementId: child.id, viewId: detail.id, title: "Inside: verify email" },
      {
        elementId: second.id,
        viewId: detail.id,
        relationshipId: inner.id,
        title: "Then a password",
      },
      { elementId: group.id, viewId: home.id, title: "Back on the overview" },
      // Naming the scenario's own view is the same as omitting it, so this arrival is valid.
      { elementId: other.id, relationshipId: handoff.id, title: "Hand off to upload" },
    ];
    add(valid);
    expect(services.views.get(home.id).settings.scenarios[0]?.steps).toEqual(valid);

    for (const [steps, message] of [
      [
        [{ elementId: child.id, title: "Not on home" }],
        '"Verify email" must exist in this workspace and view',
      ],
      [
        [{ elementId: group.id, viewId: detail.id, title: "Wrong view" }],
        'must exist in view "Onboard details"',
      ],
      [
        [{ elementId: other.id, title: "x", highlightElementIds: [child.id] }],
        '"Verify email" must exist',
      ],
      [
        [{ title: "x", highlightRelationshipIds: [inner.id] }],
        "a highlighted connection must have both ends",
      ],
      [
        [{ title: "x", viewId: "missing-view" }],
        'the step\'s view "missing-view" no longer exists',
      ],
      [
        [
          { elementId: group.id, title: "a" },
          { elementId: other.id, viewId: detail.id, relationshipId: handoff.id, title: "b" },
        ],
        "this step and the previous one are on different views",
      ],
    ] as const)
      expect(() => add(steps as unknown as unknown[])).toThrow(message);

    // Deleting a view a step relies on keeps the scenario and reports it.
    services.views.delete(workspace.id, detail.id);
    expect(
      validateDocument(services.model.getDocument(workspace.id))
        .issues.filter((issue) => issue.code === "SCENARIO_VIEW_MISSING")
        .map((issue) => issue.viewId),
    ).toEqual([home.id, home.id]);
  } finally {
    close();
  }
});

test("cross-view steps and highlights survive cloning with remapped IDs", () => {
  const { services, close, workspace, view, client, api, call } = scenarioWorkspace();
  try {
    const detail = services.views.create(workspace.id, {
      name: "API detail",
      kind: "workflow",
      elementIds: [api.id],
    }).result;
    const steps = [
      {
        title: "Overview",
        highlightElementIds: [client.id, api.id],
        highlightRelationshipIds: [call.id],
      },
      { elementId: api.id, viewId: detail.id, title: "Inside the API" },
    ];
    services.model.applyOperations(
      workspace.id,
      {
        operations: [
          { op: "addViewScenario", viewId: view.id, data: { id: "x", name: "X", steps } },
        ],
      },
      "ui",
    );
    const copy = services.imports.importDocument(services.model.getDocument(workspace.id), {
      mode: "new",
      name: "Copy",
    });
    const model = services.model.get(copy.id);
    const id = (name: string) => model.elements.find((element) => element.name === name)?.id;
    const views = services.views.listDetailed(copy.id);
    const copied = views.find((item) => item.name === "Flow")?.settings.scenarios[0]?.steps;
    expect(copied as unknown).toEqual([
      {
        title: "Overview",
        highlightElementIds: [id(client.name), id(api.name)],
        highlightRelationshipIds: [model.relationships[0]?.id],
      },
      {
        elementId: id(api.name),
        viewId: views.find((item) => item.name === "API detail")?.id,
        title: "Inside the API",
      },
    ]);
  } finally {
    close();
  }
});

test("a scenario exports as a Mermaid sequence diagram", () => {
  expect(
    scenarioToMermaid(
      {
        name: "Sign in; fast #1",
        steps: [
          { title: "Context" },
          { elementId: "browser", title: "Submit" },
          { elementId: "api", relationshipId: "login", title: "Check\npassword" },
          { elementId: "browser", relationshipId: "login", response: true, title: "Cookie" },
          { title: "Done" },
        ],
      },
      [
        { id: "browser", name: "Browser" },
        { id: "api", name: "API" },
      ],
    ),
  ).toBe(
    [
      "sequenceDiagram",
      "  title Sign in#59; fast #35;1",
      "  participant p1 as Browser",
      "  participant p2 as API",
      "  Note over p1,p2: Context",
      "  Note over p1: Submit",
      "  p1->>p2: Check password",
      "  p2-->>p1: Cookie",
      "  Note over p1,p2: Done",
    ].join("\n"),
  );
});
