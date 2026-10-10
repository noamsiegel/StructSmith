import { expect, test } from "bun:test";
import { selectionToolbarPosition } from "./toolbarPlacement";

const toolbar = { width: 210, height: 40 };
const scenarios = { left: 12, top: 12, right: 364, bottom: 170 };
const comments = { left: 555, top: 12, right: 670, bottom: 48 };

test("the selection toolbar stays top-centre when no canvas chrome covers it", () => {
  expect(
    selectionToolbarPosition(1100, toolbar, 12, [
      scenarios,
      { ...comments, left: 975, right: 1088 },
    ]),
  ).toEqual({
    left: 445,
    top: 12,
  });
});

test("the selection toolbar moves beside the scenario panel when the centre is covered", () => {
  expect(
    selectionToolbarPosition(900, toolbar, 12, [scenarios, { ...comments, left: 780, right: 888 }]),
  ).toEqual({
    left: 372,
    top: 12,
  });
});

test("on a narrow canvas the toolbar drops below the comments button, beside the panel", () => {
  expect(selectionToolbarPosition(682, toolbar, 12, [scenarios, comments])).toEqual({
    left: 372,
    top: 56,
  });
});

test("with no free position beside the chrome the toolbar goes below it", () => {
  expect(selectionToolbarPosition(420, toolbar, 12, [scenarios])).toEqual({ left: 105, top: 178 });
});
