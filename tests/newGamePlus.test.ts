import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, enemyLevelFor, loadGame, saveGame, startNgPlus } from "../src/core/state";
import { startingInventory } from "../src/data/items";

const SAVE_KEY = "tactics-mvp-save";

/** Minimal in-memory localStorage for node env. Mirrors existing test patterns. */
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
  (globalThis as unknown as { localStorage: Storage }).localStorage = new MemoryStorage() as unknown as Storage;
});

function store(value: unknown): void {
  localStorage.setItem(SAVE_KEY, JSON.stringify(value));
}

// ---------------------------------------------------------------------------
// enemyLevelFor — ngPlus parameter
// ---------------------------------------------------------------------------

describe("enemyLevelFor — ngPlus", () => {
  it("ngPlus 0 leaves level unchanged (normal difficulty)", () => {
    expect(enemyLevelFor(5, "normal", 0)).toBe(5);
  });

  it("ngPlus 0 is the default — results match two-arg call", () => {
    expect(enemyLevelFor(5, "normal")).toBe(enemyLevelFor(5, "normal", 0));
    expect(enemyLevelFor(5, "hard")).toBe(enemyLevelFor(5, "hard", 0));
    expect(enemyLevelFor(5, "easy")).toBe(enemyLevelFor(5, "easy", 0));
  });

  it("ngPlus 1 adds 3 to the result (normal difficulty)", () => {
    expect(enemyLevelFor(5, "normal", 1)).toBe(8);
  });

  it("ngPlus 2 adds 6 to the result (normal difficulty)", () => {
    expect(enemyLevelFor(5, "normal", 2)).toBe(11);
  });

  it("ngPlus stacks on top of hard difficulty (+2 hard, +3 ngPlus = +5 over base)", () => {
    expect(enemyLevelFor(5, "hard", 1)).toBe(10);
  });

  it("ngPlus stacks on top of easy difficulty (easy -1, ngPlus 1 +3 = net +2 over base)", () => {
    expect(enemyLevelFor(5, "easy", 1)).toBe(7);
  });

  it("easy floor still applies before ngPlus is added", () => {
    // base 1 easy → floored at 1, then +3 for ngPlus 1 → 4
    expect(enemyLevelFor(1, "easy", 1)).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// createGameState — ngPlus default
// ---------------------------------------------------------------------------

describe("createGameState — ngPlus", () => {
  it("starts with ngPlus = 0", () => {
    expect(createGameState().ngPlus).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// startNgPlus
// ---------------------------------------------------------------------------

describe("startNgPlus", () => {
  it("increments ngPlus by 1", () => {
    const state = createGameState();
    startNgPlus(state);
    expect(state.ngPlus).toBe(1);
  });

  it("increments ngPlus again on a second call", () => {
    const state = createGameState();
    startNgPlus(state);
    startNgPlus(state);
    expect(state.ngPlus).toBe(2);
  });

  it("resets phaseIndex to 0", () => {
    const state = createGameState();
    state.phaseIndex = 4;
    startNgPlus(state);
    expect(state.phaseIndex).toBe(0);
  });

  it("keeps the party array with same units and levels", () => {
    const state = createGameState();
    const originalParty = state.party;
    const firstUnitLevel = state.party[0].level;
    state.party[0].level = 7;
    startNgPlus(state);
    expect(state.party).toBe(originalParty);
    expect(state.party[0].level).toBe(7);
    // Sanity: levels were not reset
    expect(state.party[0].level).not.toBe(firstUnitLevel);
  });

  it("keeps gil", () => {
    const state = createGameState();
    state.gil = 1500;
    startNgPlus(state);
    expect(state.gil).toBe(1500);
  });

  it("keeps ownedEquipment", () => {
    const state = createGameState();
    state.ownedEquipment = ["iron-armor", "power-ring"];
    startNgPlus(state);
    expect(state.ownedEquipment).toEqual(["iron-armor", "power-ring"]);
  });

  it("keeps difficulty", () => {
    const state = createGameState();
    state.difficulty = "hard";
    startNgPlus(state);
    expect(state.difficulty).toBe("hard");
  });

  it("keeps slot", () => {
    const state = createGameState();
    state.slot = 2;
    startNgPlus(state);
    expect(state.slot).toBe(2);
  });

  it("refreshes inventory to starting inventory", () => {
    const state = createGameState();
    // Drain the inventory entirely
    for (const key of Object.keys(state.inventory)) {
      state.inventory[key] = 0;
    }
    startNgPlus(state);
    expect(state.inventory).toEqual(startingInventory());
  });
});

// ---------------------------------------------------------------------------
// save / load round-trip — ngPlus persists
// ---------------------------------------------------------------------------

describe("ngPlus — save/load round-trip", () => {
  it("persists ngPlus = 0 through save/load", () => {
    const state = createGameState();
    saveGame(state);
    const loaded = loadGame();
    expect(loaded).not.toBeNull();
    expect(loaded!.ngPlus).toBe(0);
  });

  it("persists ngPlus = 2 through save/load", () => {
    const state = createGameState();
    state.ngPlus = 2;
    saveGame(state);
    const loaded = loadGame();
    expect(loaded).not.toBeNull();
    expect(loaded!.ngPlus).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// back-compat: old save without ngPlus field
// ---------------------------------------------------------------------------

describe("ngPlus — back-compat with old saves", () => {
  it("normalises missing ngPlus to 0", () => {
    const raw: Record<string, unknown> = JSON.parse(JSON.stringify(createGameState()));
    delete raw.ngPlus;
    store(raw);
    const loaded = loadGame();
    expect(loaded).not.toBeNull();
    expect(loaded!.ngPlus).toBe(0);
  });

  it("normalises a negative ngPlus to 0", () => {
    const raw: Record<string, unknown> = JSON.parse(JSON.stringify(createGameState()));
    raw.ngPlus = -1;
    store(raw);
    const loaded = loadGame();
    expect(loaded).not.toBeNull();
    expect(loaded!.ngPlus).toBe(0);
  });

  it("a save without ngPlus is still valid (not rejected)", () => {
    const raw: Record<string, unknown> = JSON.parse(JSON.stringify(createGameState()));
    delete raw.ngPlus;
    store(raw);
    expect(loadGame()).not.toBeNull();
  });
});
