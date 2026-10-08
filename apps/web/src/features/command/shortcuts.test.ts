import { expect, test } from "bun:test";
import { isShortcutHelp, shortcutKeyLabel, shortcuts } from "./shortcuts";

test("shortcut search labels expose platform modifier names and translated gestures", () => {
  const sidebar = shortcuts.find((item) => item.id === "inspector");
  const pan = shortcuts.find((item) => item.id === "pan-x");
  if (!sidebar || !pan) throw new Error("Shortcut missing");
  expect(shortcutKeyLabel(sidebar, true, (key) => key)).toBe("⌘ + Option + B");
  expect(shortcutKeyLabel(sidebar, false, (key) => key)).toBe("Ctrl + Alt + B");
  expect(
    shortcutKeyLabel(pan, true, (key) => (key === "shortcuts.scroll" ? "przewijanie" : key)),
  ).toBe("Shift + przewijanie");
});

test("shortcut help accepts the physical slash key and does not steal alt or shifted chords", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  try {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { userAgent: "Macintosh" },
    });
    const mac = {
      key: "/",
      code: "Slash",
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
    };
    expect(isShortcutHelp(mac)).toBe(true);
    expect(isShortcutHelp({ ...mac, key: "-" })).toBe(true);
    expect(isShortcutHelp({ ...mac, key: "x", code: "KeyX" })).toBe(false);
    expect(isShortcutHelp({ ...mac, altKey: true })).toBe(false);
    expect(isShortcutHelp({ ...mac, shiftKey: true })).toBe(false);
    expect(isShortcutHelp({ ...mac, metaKey: false })).toBe(false);
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { userAgent: "Windows" },
    });
    expect(isShortcutHelp({ ...mac, metaKey: false, ctrlKey: true })).toBe(true);
    expect(isShortcutHelp(mac)).toBe(false);
  } finally {
    if (original) Object.defineProperty(globalThis, "navigator", original);
    else Reflect.deleteProperty(globalThis, "navigator");
  }
});
