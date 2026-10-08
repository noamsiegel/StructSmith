import { describe, expect, test } from "bun:test";
import { ViewScenarioSchema, ViewSettingsSchema } from "@structsmith/contracts";
import {
  clearInvalidScenarioArrivals,
  validateViewScenarios,
} from "../packages/domain/src/scenarios";

const elements = [{ id: "a" }, { id: "b" }, { id: "c" }];
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
      "must exist",
    );
    expect(() =>
      validateViewScenarios([scenario], ["a", "b"], [{ id: "a" }], relationships),
    ).toThrow("must exist");
  });

  test("rejects reversed, wrong, missing and first-step arrival connections", () => {
    for (const relationshipId of ["ba", "bc", "missing"]) {
      const steps = scenario.steps.map((step, index) =>
        index === 1 ? { ...step, relationshipId } : step,
      );
      expect(() =>
        validateViewScenarios([{ ...scenario, steps }], ["a", "b"], elements, relationships),
      ).toThrow("directly join");
    }
    const steps = scenario.steps.map((step, index) =>
      index === 0 ? { ...step, relationshipId: "ba" } : step,
    );
    expect(() =>
      validateViewScenarios([{ ...scenario, steps }], ["a", "b"], elements, relationships),
    ).toThrow("first step");
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
});
