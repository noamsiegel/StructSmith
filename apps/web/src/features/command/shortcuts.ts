import { hasPrimaryModifier } from "@/lib/platform";

export type ShortcutGroup = "editor" | "canvas" | "connectors" | "comments" | "controls" | "chat";
export interface Shortcut {
  id: string;
  group: ShortcutGroup;
  labelKey: string;
  keys: readonly string[];
}

/** Matches the physical slash key too, whose character varies with keyboard layout. */
export function isShortcutHelp(
  event: Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">,
): boolean {
  return (
    hasPrimaryModifier(event) &&
    !event.altKey &&
    !event.shiftKey &&
    (event.key === "/" || event.code === "Slash")
  );
}

export const shortcutGroups: readonly ShortcutGroup[] = [
  "editor",
  "canvas",
  "connectors",
  "comments",
  "controls",
  "chat",
];

// Keep this list alongside the global, canvas, connector and chat handlers it describes.
export const shortcuts: readonly Shortcut[] = [
  { id: "search", group: "editor", labelKey: "shortcuts.commandPalette", keys: ["primary", "K"] },
  { id: "help", group: "editor", labelKey: "shortcuts.showShortcuts", keys: ["primary", "/"] },
  { id: "model", group: "editor", labelKey: "topbar.toggleModelPanel", keys: ["primary", "B"] },
  {
    id: "inspector",
    group: "editor",
    labelKey: "topbar.toggleInspectorPanel",
    keys: ["primary", "alt", "B"],
  },
  { id: "undo", group: "editor", labelKey: "shortcuts.undo", keys: ["primary", "Z"] },
  { id: "redo", group: "editor", labelKey: "shortcuts.redo", keys: ["primary", "Shift", "Z"] },
  { id: "save", group: "editor", labelKey: "shortcuts.saveStatus", keys: ["primary", "S"] },
  { id: "select-all", group: "canvas", labelKey: "shortcuts.selectAll", keys: ["primary", "A"] },
  {
    id: "multi-select",
    group: "canvas",
    labelKey: "shortcuts.addToSelection",
    keys: ["primary", "$shortcuts.click"],
  },
  {
    id: "marquee",
    group: "canvas",
    labelKey: "shortcuts.marqueeSelection",
    keys: ["primary", "$shortcuts.dragCanvas"],
  },
  {
    id: "details",
    group: "canvas",
    labelKey: "navigation.openDetails",
    keys: ["$navigation.doubleClick"],
  },
  {
    id: "copy",
    group: "canvas",
    labelKey: "shortcuts.copyWithConnections",
    keys: ["primary", "C"],
  },
  { id: "paste", group: "canvas", labelKey: "shortcuts.paste", keys: ["primary", "V"] },
  { id: "delete", group: "canvas", labelKey: "shortcuts.delete", keys: ["Delete / Backspace"] },
  { id: "fit", group: "canvas", labelKey: "shortcuts.fitView", keys: ["F"] },
  { id: "clear", group: "canvas", labelKey: "shortcuts.clearSelection", keys: ["Escape"] },
  {
    id: "move-node",
    group: "canvas",
    labelKey: "shortcuts.moveElement",
    keys: ["$shortcuts.arrowKeys"],
  },
  {
    id: "move-node-fast",
    group: "canvas",
    labelKey: "shortcuts.moveElementFast",
    keys: ["Shift", "$shortcuts.arrowKeys"],
  },
  { id: "pan", group: "canvas", labelKey: "shortcuts.pan", keys: ["$shortcuts.dragCanvas"] },
  { id: "pan-y", group: "canvas", labelKey: "shortcuts.panVertical", keys: ["$shortcuts.scroll"] },
  {
    id: "pan-x",
    group: "canvas",
    labelKey: "shortcuts.panHorizontal",
    keys: ["Shift", "$shortcuts.scroll"],
  },
  {
    id: "trackpad",
    group: "canvas",
    labelKey: "shortcuts.panTrackpad",
    keys: ["$shortcuts.twoFingerScroll"],
  },
  {
    id: "zoom",
    group: "canvas",
    labelKey: "shortcuts.zoom",
    keys: ["primary", "$shortcuts.scroll"],
  },
  {
    id: "label",
    group: "connectors",
    labelKey: "shortcuts.moveLabel",
    keys: ["$shortcuts.arrowKeys"],
  },
  {
    id: "label-fast",
    group: "connectors",
    labelKey: "shortcuts.moveLabelFast",
    keys: ["Shift", "$shortcuts.arrowKeys"],
  },
  {
    id: "segment",
    group: "connectors",
    labelKey: "shortcuts.moveSegment",
    keys: ["$shortcuts.arrowKeys"],
  },
  {
    id: "segment-fast",
    group: "connectors",
    labelKey: "shortcuts.moveSegmentFast",
    keys: ["Shift", "$shortcuts.arrowKeys"],
  },
  { id: "cancel-drag", group: "connectors", labelKey: "shortcuts.cancelDrag", keys: ["Escape"] },
  { id: "comment", group: "comments", labelKey: "comments.addTitle", keys: ["C"] },
  { id: "comment-center", group: "comments", labelKey: "shortcuts.commentCenter", keys: ["Enter"] },
  {
    id: "comment-cancel",
    group: "comments",
    labelKey: "shortcuts.commentCancel",
    keys: ["Escape"],
  },
  { id: "next-control", group: "controls", labelKey: "shortcuts.nextControl", keys: ["Tab"] },
  {
    id: "previous-control",
    group: "controls",
    labelKey: "shortcuts.previousControl",
    keys: ["Shift", "Tab"],
  },
  { id: "choose", group: "controls", labelKey: "shortcuts.chooseResult", keys: ["↑ / ↓", "Enter"] },
  {
    id: "toolbar",
    group: "controls",
    labelKey: "shortcuts.toolbarNavigation",
    keys: ["← / → / Home / End"],
  },
  { id: "dismiss", group: "controls", labelKey: "shortcuts.dismiss", keys: ["Escape"] },
  { id: "commit-field", group: "controls", labelKey: "shortcuts.commitField", keys: ["Enter"] },
  { id: "cancel-field", group: "controls", labelKey: "shortcuts.cancelField", keys: ["Escape"] },
  { id: "chat-send", group: "chat", labelKey: "shortcuts.chatSend", keys: ["Enter"] },
  {
    id: "chat-newline",
    group: "chat",
    labelKey: "shortcuts.chatNewline",
    keys: ["Shift", "Enter"],
  },
  {
    id: "chat-reorder",
    group: "chat",
    labelKey: "shortcuts.chatReorder",
    keys: ["Space / Enter", "↑ / ↓", "Space / Enter"],
  },
  { id: "chat-cancel", group: "chat", labelKey: "shortcuts.chatCancelReorder", keys: ["Escape"] },
];

export function shortcutKeyLabel(
  shortcut: Shortcut,
  apple: boolean,
  translate: (key: string) => string,
): string {
  return shortcut.keys
    .map((key) =>
      key === "primary"
        ? apple
          ? "⌘"
          : "Ctrl"
        : key === "alt"
          ? apple
            ? "Option"
            : "Alt"
          : key.startsWith("$")
            ? translate(key.slice(1))
            : key,
    )
    .join(" + ");
}
