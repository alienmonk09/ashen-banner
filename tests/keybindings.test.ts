import { describe, expect, it, beforeEach } from "vitest";
import {
  ACTIONS,
  DEFAULT_BINDINGS,
  getBinding,
  getBindings,
  setBinding,
  resetBindings,
  actionForKey,
  formatKey,
  type Action,
} from "../src/engine/keybindings";

// All tests run in the node environment — no window / document available.
// Every exported function must be safe to call without a DOM.

// Reset to defaults before each test so tests are fully isolated.
beforeEach(() => {
  resetBindings();
});

// ---------------------------------------------------------------------------
// Module import
// ---------------------------------------------------------------------------

describe("keybindings — module import", () => {
  it("importing the module does not throw", () => {
    expect(typeof getBinding).toBe("function");
    expect(typeof getBindings).toBe("function");
    expect(typeof setBinding).toBe("function");
    expect(typeof resetBindings).toBe("function");
    expect(typeof actionForKey).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

describe("keybindings — formatKey", () => {
  it("upper-cases single letters (default endTurn 'e' → 'E')", () => {
    expect(formatKey("e")).toBe("E");
    expect(formatKey(getBinding("endTurn"))).toBe("E");
  });

  it("humanizes special keys", () => {
    expect(formatKey("Escape")).toBe("Esc");
    expect(formatKey(" ")).toBe("Space");
    expect(formatKey("ArrowLeft")).toBe("←");
  });

  it("leaves the cancel binding readable (Escape → 'Esc')", () => {
    expect(formatKey(getBinding("cancel"))).toBe("Esc");
  });
});

describe("keybindings — defaults", () => {
  it("every Action has a non-empty default binding", () => {
    for (const action of ACTIONS) {
      expect(DEFAULT_BINDINGS[action]).toBeTruthy();
    }
  });

  it("getBinding returns the default for every action before any override", () => {
    for (const action of ACTIONS) {
      expect(getBinding(action)).toBe(DEFAULT_BINDINGS[action]);
    }
  });

  it("getBindings returns all actions with default values", () => {
    const all = getBindings();
    for (const action of ACTIONS) {
      expect(all[action]).toBe(DEFAULT_BINDINGS[action]);
    }
  });

  it("defaults include rotateLeft → ','", () => {
    expect(DEFAULT_BINDINGS.rotateLeft).toBe(",");
  });

  it("defaults include rotateRight → '.'", () => {
    expect(DEFAULT_BINDINGS.rotateRight).toBe(".");
  });

  it("defaults include endTurn → 'e'", () => {
    expect(DEFAULT_BINDINGS.endTurn).toBe("e");
  });

  it("defaults include cancel → 'Escape'", () => {
    expect(DEFAULT_BINDINGS.cancel).toBe("Escape");
  });
});

// ---------------------------------------------------------------------------
// setBinding / getBinding round-trip
// ---------------------------------------------------------------------------

describe("keybindings — setBinding / getBinding", () => {
  it("setBinding overrides and getBinding reflects the change", () => {
    setBinding("rotateLeft", "q");
    expect(getBinding("rotateLeft")).toBe("q");
  });

  it("overriding with the default key restores default (no override stored)", () => {
    setBinding("rotateLeft", "z");
    setBinding("rotateLeft", DEFAULT_BINDINGS.rotateLeft);
    expect(getBinding("rotateLeft")).toBe(DEFAULT_BINDINGS.rotateLeft);
  });

  it("getBindings reflects a setBinding change", () => {
    setBinding("endTurn", "t");
    const all = getBindings();
    expect(all.endTurn).toBe("t");
    // Other actions unaffected.
    expect(all.rotateLeft).toBe(DEFAULT_BINDINGS.rotateLeft);
  });

  it("does not throw in node env (no localStorage)", () => {
    expect(() => setBinding("cancel", "x")).not.toThrow();
    expect(() => getBinding("cancel")).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// One key → at most one action (conflict resolution)
// ---------------------------------------------------------------------------

describe("keybindings — conflict resolution", () => {
  it("binding a key already used by another action clears that other binding", () => {
    // Bind rotateLeft to "q", then bind rotateRight to "q" too.
    setBinding("rotateLeft", "q");
    setBinding("rotateRight", "q");
    // rotateRight should now use "q".
    expect(getBinding("rotateRight")).toBe("q");
    // rotateLeft should no longer use "q" — it should revert to its default.
    expect(getBinding("rotateLeft")).toBe(DEFAULT_BINDINGS.rotateLeft);
  });

  it("after conflict resolution, actionForKey maps the key to the new action only", () => {
    setBinding("rotateLeft", "q");
    setBinding("endTurn", "q");
    expect(actionForKey("q")).toBe("endTurn");
    // rotateLeft should no longer be triggered by "q".
    expect(getBinding("rotateLeft")).not.toBe("q");
  });

  it("binding a key to the same action it already owns is idempotent", () => {
    setBinding("endTurn", "e");
    setBinding("endTurn", "e");
    expect(getBinding("endTurn")).toBe("e");
  });
});

// ---------------------------------------------------------------------------
// actionForKey — reverse lookup
// ---------------------------------------------------------------------------

describe("keybindings — actionForKey", () => {
  it("returns the correct action for default keys", () => {
    expect(actionForKey(",")).toBe("rotateLeft");
    expect(actionForKey(".")).toBe("rotateRight");
    expect(actionForKey("e")).toBe("endTurn");
    expect(actionForKey("Escape")).toBe("cancel");
  });

  it("returns null for an unbound key", () => {
    expect(actionForKey("z")).toBeNull();
    expect(actionForKey("F1")).toBeNull();
  });

  it("is case-insensitive for single-letter keys", () => {
    // Default endTurn is "e" — pressing "E" (shift+e) should also match.
    expect(actionForKey("E")).toBe("endTurn");
  });

  it("reflects overrides: after rebind, old key returns null and new key returns the action", () => {
    setBinding("rotateLeft", "q");
    expect(actionForKey("q")).toBe("rotateLeft");
    // The old key "," is now unbound (default was overridden).
    expect(actionForKey(",")).toBeNull();
  });

  it("case-insensitive match works after a custom override", () => {
    setBinding("endTurn", "t");
    expect(actionForKey("T")).toBe("endTurn");
    expect(actionForKey("t")).toBe("endTurn");
  });

  it("exact match for multi-character keys (Escape, Enter)", () => {
    // Escape is the default for cancel; partial strings should NOT match.
    expect(actionForKey("esc")).toBeNull();
    expect(actionForKey("escape")).toBeNull();
    expect(actionForKey("Escape")).toBe("cancel");
  });
});

// ---------------------------------------------------------------------------
// resetBindings
// ---------------------------------------------------------------------------

describe("keybindings — resetBindings", () => {
  it("resets all overrides so getBinding returns defaults", () => {
    setBinding("rotateLeft", "q");
    setBinding("endTurn", "t");
    resetBindings();
    expect(getBinding("rotateLeft")).toBe(DEFAULT_BINDINGS.rotateLeft);
    expect(getBinding("endTurn")).toBe(DEFAULT_BINDINGS.endTurn);
  });

  it("does not throw in node env", () => {
    expect(() => resetBindings()).not.toThrow();
  });

  it("after reset, actionForKey resolves defaults correctly", () => {
    setBinding("cancel", "x");
    resetBindings();
    expect(actionForKey("x")).toBeNull();
    expect(actionForKey("Escape")).toBe("cancel");
  });
});

// ---------------------------------------------------------------------------
// Node-safety
// ---------------------------------------------------------------------------

describe("keybindings — node safety", () => {
  it("all exported functions work without window/document", () => {
    expect(typeof window).toBe("undefined");
    expect(() => getBinding("rotateLeft" as Action)).not.toThrow();
    expect(() => getBindings()).not.toThrow();
    expect(() => setBinding("rotateLeft", "q")).not.toThrow();
    expect(() => resetBindings()).not.toThrow();
    expect(() => actionForKey("q")).not.toThrow();
  });
});
