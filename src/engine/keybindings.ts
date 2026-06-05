/**
 * Persisted key-binding map for Ashen Banner.
 *
 * Only actions that the keyboard actually drives in handleKey are listed here.
 * Node-safe: all localStorage access is guarded behind typeof window checks and
 * wrapped in try/catch so tests can import this module without a DOM.
 */

const STORAGE_KEY = "ashen-keybindings";

export type Action = "rotateLeft" | "rotateRight" | "endTurn" | "cancel";

export const ACTIONS: Action[] = ["rotateLeft", "rotateRight", "endTurn", "cancel"];

export const DEFAULT_BINDINGS: Record<Action, string> = {
  rotateLeft: ",",
  rotateRight: ".",
  endTurn: "e",
  cancel: "Escape",
};

/** Human-readable label for display in the Controls settings section. */
export const ACTION_LABELS: Record<Action, string> = {
  rotateLeft: "Rotate Left",
  rotateRight: "Rotate Right",
  endTurn: "End Turn",
  cancel: "Cancel",
};

// In-memory overrides (only keys that differ from the defaults are stored here).
let overrides: Partial<Record<Action, string>> = readStoredOverrides();

// ---------------------------------------------------------------------------
// localStorage helpers — always node-safe
// ---------------------------------------------------------------------------

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readStoredOverrides(): Partial<Record<Action, string>> {
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const result: Partial<Record<Action, string>> = {};
    for (const action of ACTIONS) {
      const v = (parsed as Record<string, unknown>)[action];
      if (typeof v === "string" && v.length > 0) result[action] = v;
    }
    return result;
  } catch {
    return {};
  }
}

function writeStoredOverrides(): void {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // localStorage can be unavailable in private mode; in-memory state still works.
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Return the currently bound key for an action (override or default). */
export function getBinding(action: Action): string {
  return overrides[action] ?? DEFAULT_BINDINGS[action];
}

/** Return the full binding map (all actions, overrides applied). */
export function getBindings(): Record<Action, string> {
  const result = { ...DEFAULT_BINDINGS };
  for (const action of ACTIONS) {
    if (overrides[action] !== undefined) result[action] = overrides[action]!;
  }
  return result;
}

/**
 * Bind `key` to `action`, persisting the change.
 * If `key` is already bound to a different action, that other binding is
 * cleared first so a key maps to at most one action.
 */
export function setBinding(action: Action, key: string): void {
  // Clear any existing action that uses this key (case-insensitive for letters).
  for (const other of ACTIONS) {
    if (other !== action && keysMatch(getBinding(other), key)) {
      // Revert that other action back to its default — but only if the default
      // itself doesn't also conflict (it won't after we reassign).
      if (DEFAULT_BINDINGS[other] === key) {
        delete overrides[other];
      } else {
        overrides[other] = DEFAULT_BINDINGS[other];
      }
    }
  }
  if (key === DEFAULT_BINDINGS[action]) {
    delete overrides[action];
  } else {
    overrides[action] = key;
  }
  writeStoredOverrides();
}

/** Reset all bindings to their defaults. */
export function resetBindings(): void {
  overrides = {};
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Reverse lookup: which action does a pressed key trigger?
 * Single-letter keys are matched case-insensitively; special keys (Escape,
 * Enter, etc.) are matched exactly.
 * Returns null if the key is not bound to any action.
 */
export function actionForKey(key: string): Action | null {
  for (const action of ACTIONS) {
    if (keysMatch(getBinding(action), key)) return action;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function keysMatch(bound: string, pressed: string): boolean {
  // Single-character keys: compare case-insensitively.
  if (bound.length === 1 && pressed.length === 1) {
    return bound.toLowerCase() === pressed.toLowerCase();
  }
  // Multi-character keys (e.g. "Escape", "Enter"): exact match.
  return bound === pressed;
}
