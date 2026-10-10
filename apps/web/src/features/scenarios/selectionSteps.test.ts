import { expect, test } from "bun:test";
import type { ArchitectureRelationship } from "@structsmith/contracts";
import { stepsFromSelection } from "./selectionSteps";

const elements = [
  { id: "browser", name: "Browser" },
  { id: "api", name: "API" },
  { id: "db", name: "Database" },
];
const edge = (id: string, source: string, target: string, description = "") =>
  ({
    id,
    sourceElementId: source,
    targetElementId: target,
    description,
  }) as ArchitectureRelationship;
const relationships = [
  edge("login", "browser", "api", "Sends credentials"),
  edge("query", "api", "db"),
  edge("audit", "api", "db"),
];
const onView = ["browser", "api", "db"];
const steps = (selection: Parameters<typeof stepsFromSelection>[0], previous?: string) =>
  stepsFromSelection(
    selection,
    previous ? { elementId: previous, title: "Previous" } : undefined,
    onView,
    elements,
    relationships,
  );

test("a selected element continues over its only connection from the previous step", () => {
  expect(steps({ type: "element", id: "api" }, "browser")).toEqual([
    { elementId: "api", relationshipId: "login", title: "API" },
  ]);
  // Two connections could arrive, so the author chooses one in the editor.
  expect(steps({ type: "element", id: "db" }, "api")).toEqual([
    { elementId: "db", title: "Database" },
  ]);
  expect(steps({ type: "element", id: "api" })).toEqual([{ elementId: "api", title: "API" }]);
});

test("a selected connection becomes a message, its reply, or both of its ends", () => {
  const login = { type: "relationship", id: "login" } as const;
  expect(steps(login, "browser")).toEqual([
    { elementId: "api", relationshipId: "login", title: "Sends credentials" },
  ]);
  expect(steps(login, "api")).toEqual([
    { elementId: "browser", relationshipId: "login", response: true, title: "Sends credentials" },
  ]);
  expect(steps({ type: "relationship", id: "query" }, "browser")).toEqual([
    { elementId: "api", title: "API" },
    { elementId: "db", relationshipId: "query", title: "Database" },
  ]);
});

test("selections off this view are explained and other selections are ignored", () => {
  expect(
    stepsFromSelection({ type: "element", id: "db" }, undefined, ["api"], elements, relationships),
  ).toBe("outside");
  expect(
    stepsFromSelection(
      { type: "relationship", id: "query" },
      undefined,
      ["api"],
      elements,
      relationships,
    ),
  ).toBe("outside");
  expect(steps({ type: "none" })).toBeNull();
  expect(steps({ type: "boundary", id: "b" })).toBeNull();
  expect(steps({ type: "relationship", id: "deleted" })).toBeNull();
});
