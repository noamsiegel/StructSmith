import { expect, test } from "bun:test";
import {
  AddViewCommentReplySchema,
  AddViewCommentSchema,
  RelationshipPresentationSchema,
  UpdateViewSchema,
  ViewSettingsSchema,
} from "@structsmith/contracts";

test("editor settings remain backwards compatible and patches preserve omissions", () => {
  expect(ViewSettingsSchema.parse({}).preferredDetailViews).toEqual({});
  expect(ViewSettingsSchema.parse({}).scenarios).toEqual([]);
  expect(UpdateViewSchema.parse({ settings: { scenarios: [] } }).settings).toEqual({
    scenarios: [],
  });
  expect(
    AddViewCommentSchema.parse({
      x: 0,
      y: 0,
      text: "Note",
      elementId: "card",
      createdAt: "forged",
    }),
  ).toEqual({ x: 0, y: 0, text: "Note", elementId: "card" });
  expect(AddViewCommentReplySchema.parse({ text: "Reply", createdAt: "forged" })).toEqual({
    text: "Reply",
  });
});

test("scenario and connector inputs reject invalid bounds and ambiguous IDs", () => {
  const scenario = {
    id: "scenario",
    name: "Capture",
    steps: [{ elementId: "start", title: "Start" }],
  };
  expect(ViewSettingsSchema.safeParse({ scenarios: [scenario, scenario] }).success).toBe(false);
  expect(ViewSettingsSchema.safeParse({ scenarios: [{ ...scenario, steps: [] }] }).success).toBe(
    false,
  );
  expect(
    ViewSettingsSchema.safeParse({
      scenarios: [{ ...scenario, steps: [{ elementId: "start", title: " " }] }],
    }).success,
  ).toBe(false);
  expect(RelationshipPresentationSchema.parse({ sourceSlot: 0, targetSlot: 2 })).toEqual({
    sourceSlot: 0,
    targetSlot: 2,
  });
  for (const slot of [-1, 3, 0.5, Number.NaN]) {
    expect(RelationshipPresentationSchema.safeParse({ sourceSlot: slot }).success).toBe(false);
    expect(RelationshipPresentationSchema.safeParse({ targetSlot: slot }).success).toBe(false);
  }
});
