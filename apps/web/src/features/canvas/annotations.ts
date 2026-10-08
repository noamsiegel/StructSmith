import type { SectionFrame, ViewAnnotation } from "@structsmith/contracts";
import { wrappedLines } from "@structsmith/domain";

export const annotationNodeId = (id: string) => `annotation:${id}`;
export const annotationId = (nodeId: string) => nodeId.slice("annotation:".length);
export const isAnnotationId = (nodeId: string) => nodeId.startsWith("annotation:");

export function annotationSize(annotation: ViewAnnotation) {
  if (annotation.kind === "table") {
    const columns = annotation.cells[0]?.length ?? 1;
    const width = Math.max(annotation.width, columns * 140);
    const cellWidth = width / columns - 24;
    const height = annotation.cells.reduce(
      (total, row) =>
        total + Math.max(40, ...row.map((cell) => wrappedLines(cell, cellWidth, 7) * 20 + 20)),
      0,
    );
    return { width, height: Math.max(annotation.height, height) };
  }
  const width = Math.max(120, annotation.width);
  const fontSize =
    "fontSize" in annotation && typeof annotation.fontSize === "number"
      ? annotation.fontSize
      : annotation.kind === "text"
        ? 18
        : 16;
  return {
    width,
    height: Math.max(
      annotation.height,
      wrappedLines(annotation.text, width - 32, fontSize * 0.56) * fontSize * 1.5 + 32,
    ),
  };
}

export function containingAnnotationSection(
  rectangle: SectionFrame,
  sections: readonly { id: string; frame: SectionFrame }[],
): string | null {
  return (
    sections
      .filter(
        ({ frame }) =>
          rectangle.x >= frame.x &&
          rectangle.y >= frame.y &&
          rectangle.x + rectangle.width <= frame.x + frame.width &&
          rectangle.y + rectangle.height <= frame.y + frame.height,
      )
      .sort((a, b) => a.frame.width * a.frame.height - b.frame.width * b.frame.height)[0]?.id ??
    null
  );
}

/** Spreadsheet paste expands the rectangle; data beyond the supported table limit is rejected. */
export function pasteTableCells(
  cells: string[][],
  value: string,
  row: number,
  column: number,
): string[][] {
  const pasted = value
    .replace(/\r\n?/g, "\n")
    .replace(/\n$/, "")
    .split("\n")
    .map((line) => line.split("\t"));
  const rows = Math.max(cells.length, row + pasted.length);
  const columns = Math.max(
    cells[0]?.length ?? 1,
    column + Math.max(...pasted.map((line) => line.length)),
  );
  if (rows > 100 || columns > 20) throw new Error("limit");
  const result = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: columns }, (_, c) => cells[r]?.[c] ?? ""),
  );
  pasted.forEach((line, r) => {
    line.forEach((cell, c) => {
      const target = result[row + r];
      if (target) target[column + c] = cell;
    });
  });
  if (
    result.some((line) => line.some((cell) => cell.length > 5000)) ||
    result.flat().reduce((total, cell) => total + cell.length, 0) > 100000
  )
    throw new Error("limit");
  return result;
}
