import { expect, test } from "bun:test";
import type { ViewComment } from "@structsmith/contracts";
import {
  commentCanvasPosition,
  commentContentState,
  commentMatchesSearch,
  parseCommentSeen,
} from "./comment-state";

const pin: ViewComment = {
  id: "pin",
  text: "Gateway failure",
  x: 10,
  y: -5,
  elementId: "node",
  resolved: false,
  replies: [{ id: "reply", text: "Retry in the worker" }],
};

test("attached comment offsets follow current object positions, and free pins stay put", () => {
  expect(commentCanvasPosition(pin, new Map([["node", { x: 200, y: 100 }]]))).toEqual({
    x: 210,
    y: 95,
  });
  expect(commentCanvasPosition(pin, new Map([["node", { x: 500, y: 600 }]]))).toEqual({
    x: 510,
    y: 595,
  });
  expect(
    commentCanvasPosition({ ...pin, elementId: null }, new Map([["node", { x: 500, y: 600 }]])),
  ).toEqual({ x: 10, y: -5 });
});

test("local unread content detects text, resolution and replies even without legacy timestamps", () => {
  const seen = commentContentState(pin);
  expect(commentContentState({ ...pin, x: 50 })).toBe(seen);
  expect(commentContentState({ ...pin, text: "Changed" })).not.toBe(seen);
  expect(commentContentState({ ...pin, resolved: true })).not.toBe(seen);
  expect(commentContentState({ ...pin, replies: [{ id: "reply", text: "Edited" }] })).not.toBe(
    seen,
  );
  expect(commentContentState({ ...pin, replies: [] })).not.toBe(seen);
  expect(
    commentContentState({ ...pin, replies: [...pin.replies, { id: "second", text: "New" }] }),
  ).not.toBe(seen);
});

test("seen storage rejects malformed records and thread search includes replies", () => {
  for (const value of [null, "{", "null", "[]", "true", "4"])
    expect(parseCommentSeen(value)).toEqual({});
  expect(parseCommentSeen('{"pin":"state","bad":7,"other":null}')).toEqual({ pin: "state" });
  expect(commentMatchesSearch(pin, "  GATEWAY ")).toBe(true);
  expect(commentMatchesSearch(pin, "worker")).toBe(true);
  expect(commentMatchesSearch(pin, "missing")).toBe(false);
  expect(commentMatchesSearch(pin, "")).toBe(true);
});
