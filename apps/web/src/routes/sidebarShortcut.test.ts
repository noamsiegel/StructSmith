import { expect, test } from "bun:test";
import { sidebarShortcut } from "./StudioPage";

test("sidebar shortcuts use platform modifiers and physical B without intercepting editing or Shift+B", () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const event = {
    key: "b",
    code: "KeyB",
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
  };
  try {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { userAgent: "Windows" },
    });
    expect(sidebarShortcut(event, false)).toBe("model");
    expect(sidebarShortcut({ ...event, altKey: true }, false)).toBe("inspector");
    expect(sidebarShortcut({ ...event, ctrlKey: false }, false)).toBeNull();
    expect(sidebarShortcut({ ...event, ctrlKey: false, metaKey: true }, false)).toBeNull();
    expect(sidebarShortcut({ ...event, shiftKey: true }, false)).toBeNull();
    expect(sidebarShortcut(event, true)).toBeNull();
    expect(sidebarShortcut({ ...event, code: "KeyX" }, false)).toBeNull();
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { userAgent: "Macintosh" },
    });
    const mac = { ...event, ctrlKey: false, metaKey: true };
    expect(sidebarShortcut(mac, false)).toBe("model");
    // Option+B changes event.key to ∫ on macOS, while code stays KeyB.
    const optionB = { ...mac, altKey: true, key: "∫" };
    expect(sidebarShortcut(optionB, false)).toBe("inspector");
    expect(sidebarShortcut(event, false)).toBeNull();
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
    else Reflect.deleteProperty(globalThis, "navigator");
  }
});
