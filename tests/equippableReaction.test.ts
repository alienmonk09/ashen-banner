import { describe, it, expect, beforeEach } from "vitest";
import {
  unitHasReaction,
  canCounter,
  hasAutoPotion,
  hasCover,
} from "../src/battle/combat";
import { createUnit } from "../src/core/unit";
import { createGameState, loadGame, saveGame } from "../src/core/state";
import type { Unit } from "../src/core/types";

// ──────────────────────────────────────────────────────────────────────────────
// Minimal localStorage shim (node env has no DOM storage)
// ──────────────────────────────────────────────────────────────────────────────
class MemoryStorage {
  private store = new Map<string, string>();
  get length(): number { return this.store.size; }
  clear(): void { this.store.clear(); }
  getItem(key: string): string | null { return this.store.has(key) ? this.store.get(key)! : null; }
  setItem(key: string, value: string): void { this.store.set(key, String(value)); }
  removeItem(key: string): void { this.store.delete(key); }
  key(index: number): string | null { return [...this.store.keys()][index] ?? null; }
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage =
    new MemoryStorage() as unknown as Storage;
});

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────
function knight(overrides: Partial<Parameters<typeof createUnit>[0]> = {}): Unit {
  return createUnit({ name: "K", team: "player", classId: "knight", pos: { x: 0, y: 0 }, ...overrides });
}

function archer(overrides: Partial<Parameters<typeof createUnit>[0]> = {}): Unit {
  return createUnit({ name: "A", team: "player", classId: "archer", pos: { x: 1, y: 0 }, ...overrides });
}

const SAVE_KEY = "tactics-mvp-save";
function store(value: unknown): void {
  localStorage.setItem(SAVE_KEY, JSON.stringify(value));
}
function validRaw(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(createGameState()));
}
function corruptFirstUnit(patch: Record<string, unknown>): Record<string, unknown> {
  const raw = validRaw();
  const party = raw.party as Array<Record<string, unknown>>;
  party[0] = { ...party[0], ...patch };
  return raw;
}

// ──────────────────────────────────────────────────────────────────────────────
// unitHasReaction
// ──────────────────────────────────────────────────────────────────────────────
describe("unitHasReaction", () => {
  it("returns true via innate class reaction (Knight has counter)", () => {
    expect(unitHasReaction(knight(), "counter")).toBe(true);
  });

  it("returns true via equipped reactionId when class has no innate", () => {
    const a = archer();
    a.reactionId = "counter";
    expect(unitHasReaction(a, "counter")).toBe(true);
  });

  it("returns false when neither innate nor equipped", () => {
    expect(unitHasReaction(archer(), "counter")).toBe(false);
  });

  it("returns false when a different reaction is equipped", () => {
    const a = archer();
    a.reactionId = "autoPotion";
    expect(unitHasReaction(a, "counter")).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// canCounter
// ──────────────────────────────────────────────────────────────────────────────
describe("canCounter", () => {
  it("returns true for Knight (innate counter)", () => {
    expect(canCounter(knight())).toBe(true);
  });

  it("returns false for Archer with no reaction equipped", () => {
    expect(canCounter(archer())).toBe(false);
  });

  it("returns true for Archer with counter equipped", () => {
    const a = archer();
    a.reactionId = "counter";
    expect(canCounter(a)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// hasAutoPotion
// ──────────────────────────────────────────────────────────────────────────────
describe("hasAutoPotion", () => {
  it("returns false for Knight with no reaction equipped", () => {
    expect(hasAutoPotion(knight())).toBe(false);
  });

  it("returns true for Knight with autoPotion equipped", () => {
    const k = knight();
    k.reactionId = "autoPotion";
    expect(hasAutoPotion(k)).toBe(true);
  });

  it("Knight still has innate counter while autoPotion is equipped", () => {
    const k = knight();
    k.reactionId = "autoPotion";
    expect(canCounter(k)).toBe(true);
    expect(hasAutoPotion(k)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// hasCover
// ──────────────────────────────────────────────────────────────────────────────
describe("hasCover", () => {
  it("returns true for Knight (innate cover)", () => {
    expect(hasCover(knight())).toBe(true);
  });

  it("returns false for Archer with no reaction equipped", () => {
    expect(hasCover(archer())).toBe(false);
  });

  it("returns true for Archer with cover equipped", () => {
    const a = archer();
    a.reactionId = "cover";
    expect(hasCover(a)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// No equipped reaction — all three helpers false for that reaction
// ──────────────────────────────────────────────────────────────────────────────
describe("no reaction equipped on a class without innate reactions", () => {
  it("canCounter is false", () => expect(canCounter(archer())).toBe(false));
  it("hasAutoPotion is false", () => expect(hasAutoPotion(archer())).toBe(false));
  it("hasCover is false", () => expect(hasCover(archer())).toBe(false));
});

// ──────────────────────────────────────────────────────────────────────────────
// isValidSave — reactionId validation
// ──────────────────────────────────────────────────────────────────────────────
describe("isValidSave — reactionId", () => {
  it("accepts a unit with a valid reactionId", () => {
    store(corruptFirstUnit({ reactionId: "counter" }));
    expect(loadGame()).not.toBeNull();
  });

  it("accepts a unit with reactionId autoPotion", () => {
    store(corruptFirstUnit({ reactionId: "autoPotion" }));
    expect(loadGame()).not.toBeNull();
  });

  it("accepts a unit with reactionId cover", () => {
    store(corruptFirstUnit({ reactionId: "cover" }));
    expect(loadGame()).not.toBeNull();
  });

  it("rejects a unit with an invalid reactionId value", () => {
    store(corruptFirstUnit({ reactionId: "dodge" }));
    expect(loadGame()).toBeNull();
    expect(localStorage.getItem(SAVE_KEY)).toBeNull();
  });

  it("accepts a unit with no reactionId (field omitted)", () => {
    const raw = validRaw();
    // Ensure field is absent from the unit (not just undefined — strip it)
    const party = raw.party as Array<Record<string, unknown>>;
    delete party[0].reactionId;
    store(raw);
    expect(loadGame()).not.toBeNull();
  });

  it("the base game state (fresh save) is valid", () => {
    const state = createGameState();
    saveGame(state);
    expect(loadGame()).not.toBeNull();
  });
});
