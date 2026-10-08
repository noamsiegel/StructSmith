import type { ViewComment } from "@structsmith/contracts";

export function commentCanvasPosition(
  pin: Pick<ViewComment, "x" | "y" | "elementId">,
  positions: ReadonlyMap<string, { x: number; y: number }>,
): { x: number; y: number } {
  const position = pin.elementId ? positions.get(pin.elementId) : undefined;
  return position ? { x: position.x + pin.x, y: position.y + pin.y } : { x: pin.x, y: pin.y };
}

export function commentContentState(pin: ViewComment): string {
  return JSON.stringify([
    pin.text,
    pin.resolved,
    pin.updatedAt,
    pin.replies.map((reply) => [reply.id, reply.text, reply.updatedAt]),
  ]);
}

export function parseCommentSeen(value: string | null): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(value ?? "null");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

export function commentMatchesSearch(pin: ViewComment, query: string): boolean {
  const search = query.trim().toLocaleLowerCase();
  return (
    !search ||
    [pin.text, ...pin.replies.map((reply) => reply.text)].some((text) =>
      text.toLocaleLowerCase().includes(search),
    )
  );
}

export function canDismissComment({
  dirty,
  pending,
  confirmingDelete,
  insideControl,
}: {
  dirty: boolean;
  pending: boolean;
  confirmingDelete: boolean;
  insideControl: boolean;
}): boolean {
  return !dirty && !pending && !confirmingDelete && !insideControl;
}
