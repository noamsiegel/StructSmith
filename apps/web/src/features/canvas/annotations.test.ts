import { describe, expect, test } from "bun:test";
import { annotationSize, containingAnnotationSection, pasteTableCells } from "./annotations";

describe("view annotation geometry and table paste", () => {
  test("expands a rectangle and preserves unaffected spreadsheet cells", () => {
    const cells = [
      ["keep", "old"],
      ["stay", ""],
    ];
    expect(pasteTableCells(cells, "a\tb\r\nc\td\r\n", 0, 1)).toEqual([
      ["keep", "a", "b"],
      ["stay", "c", "d"],
    ]);
    expect(cells).toEqual([
      ["keep", "old"],
      ["stay", ""],
    ]);
  });
  test("preserves quoted spreadsheet cells with newlines tabs and escaped quotes", () => {
    expect(pasteTableCells([["keep"]], '"line one\nline two"\t"quoted ""value"""\n', 0, 1)).toEqual(
      [["keep", "line one\nline two", 'quoted "value"']],
    );
    expect(() => pasteTableCells([["keep"]], '"unclosed\ncell', 0, 0)).toThrow();
  });
  test("rejects oversized pasted tables without mutating cells", () => {
    const cells = [["keep"]];
    expect(() => pasteTableCells(cells, Array(21).fill("a").join("\t"), 0, 0)).toThrow();
    expect(() => pasteTableCells(cells, "a".repeat(5001), 0, 0)).toThrow();
    expect(cells).toEqual([["keep"]]);
  });
  test("grows notes and table dimensions to retain readable content", () => {
    expect(
      annotationSize({
        id: "note",
        kind: "note",
        x: 0,
        y: 0,
        width: 120,
        height: 20,
        text: "Very long explanatory note. ".repeat(20),
      }).height,
    ).toBeGreaterThan(500);
    const size = annotationSize({
      id: "table",
      kind: "table",
      x: 0,
      y: 0,
      width: 120,
      height: 20,
      cells: [
        ["a", "b", "c"],
        ["Long cell ".repeat(20), "", ""],
      ],
    });
    expect(size.width).toBe(420);
    expect(size.height).toBeGreaterThan(200);
  });
  test("chooses the deepest fully containing section", () => {
    const sections = [
      { id: "outer", frame: { x: 0, y: 0, width: 500, height: 500 } },
      { id: "inner", frame: { x: 40, y: 40, width: 200, height: 200 } },
    ];
    expect(containingAnnotationSection({ x: 50, y: 50, width: 100, height: 100 }, sections)).toBe(
      "inner",
    );
    expect(
      containingAnnotationSection({ x: 450, y: 450, width: 100, height: 100 }, sections),
    ).toBeNull();
  });
});
