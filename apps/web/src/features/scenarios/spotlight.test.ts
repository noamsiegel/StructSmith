import { expect, test } from "bun:test";
import { scenarioSpotlight } from "./spotlight";

const relationships = [
  { id: "ask", sourceElementId: "browser", targetElementId: "api" },
  { id: "store", sourceElementId: "api", targetElementId: "db" },
  { id: "audit", sourceElementId: "api", targetElementId: "log" },
];
const scenario = {
  steps: [
    { title: "Who is involved", highlightElementIds: ["browser", "api"] },
    { elementId: "browser", title: "Submit" },
    { elementId: "api", relationshipId: "ask", title: "Check" },
    {
      elementId: "db",
      relationshipId: "store",
      title: "Save",
      highlightRelationshipIds: ["audit"],
    },
    { elementId: "check", viewId: "detail", title: "Inside" },
    { elementId: "browser", viewId: "home", relationshipId: "ask", response: true, title: "Reply" },
    { title: "Done" },
  ],
};
const at = (index: number, viewId = "home") =>
  scenarioSpotlight(scenario, index, viewId, "home", relationships);

test("a message lights its sender, receiver and connection; others dim", () => {
  const message = at(2);
  expect(message?.elementIds).toEqual(new Set(["api", "browser"]));
  expect(message?.relationshipIds).toEqual(new Set(["ask"]));
  expect(message?.focusElementId).toBe("api");
  expect(message?.current).toBe(3);
  expect(message?.replyingRelationshipId).toBeUndefined();
  expect(at(5)?.replyingRelationshipId).toBe("ask");
});

test("parallel highlights light every connection and both of its ends", () => {
  expect(at(3)?.elementIds).toEqual(new Set(["db", "api", "log"]));
  expect(at(3)?.relationshipIds).toEqual(new Set(["store", "audit"]));
});

test("note steps light their highlights or nothing", () => {
  expect(at(0)?.elementIds).toEqual(new Set(["browser", "api"]));
  expect(at(0)?.focusElementId).toBeUndefined();
  expect(at(6)?.elementIds).toEqual(new Set());
});

test("steps on another view show only there, and badges number this view's steps", () => {
  expect(at(4)).toBeNull();
  expect(at(4, "detail")?.badges).toEqual(new Map([["check", [5]]]));
  expect(at(1)?.badges).toEqual(
    new Map([
      ["browser", [2, 6]],
      ["api", [3]],
      ["db", [4]],
    ]),
  );
  expect(scenarioSpotlight(scenario, 99, "home", "home", relationships)).toBeNull();
});
