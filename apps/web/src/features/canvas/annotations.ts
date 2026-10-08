import type { SectionFrame } from "@structsmith/contracts";

export { estimateAnnotationSize as annotationSize } from "@structsmith/domain";

export const annotationNodeId = (id: string) => `annotation:${id}`;
export const annotationId = (nodeId: string) => nodeId.slice("annotation:".length);
export const isAnnotationId = (nodeId: string) => nodeId.startsWith("annotation:");

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
  const pasted: string[][] = [[]];
  let cell = "";
  let quoted = false;
  const text = value.replace(/\r\n?/g, "\n");
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '"' && (quoted || cell.length === 0)) {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else quoted = !quoted;
    } else if (!quoted && (character === "\t" || character === "\n")) {
      pasted[pasted.length - 1]?.push(cell);
      cell = "";
      if (character === "\n") pasted.push([]);
    } else cell += character;
  }
  if (quoted) throw new Error("invalid");
  pasted[pasted.length - 1]?.push(cell);
  if (
    pasted.length > 1 &&
    pasted[pasted.length - 1]?.length === 1 &&
    pasted[pasted.length - 1]?.[0] === "" &&
    text.endsWith("\n")
  )
    pasted.pop();
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
