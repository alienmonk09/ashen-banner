import { describe, it, expect, beforeEach } from "vitest";
import {
  createGameState,
  saveGame,
  loadGame,
  survivorsAfterBattle,
  SAVE_KEY,
} from "../src/core/state";
import { createStartingParty } from "../src/data/party";

/** Minimal in-memory localStorage for node-env tests. */
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

describe("permadeath - survivorsAfterBattle", () => {
  it("with permadeath true, drops fallen (alive===false) and keeps the living", () => {
    const party = createStartingParty();
    expect(party.length).toBeGreaterThanOrEqual(2);
    party[0].alive = false; // fell in battle
    party[1].alive = true;
    const result = survivorsAfterBattle(party, true);
    expect(result).not.toContain(party[0]);
    expect(result).toContain(party[1]);
    expect(result.every((u) => u.alive !== false)).toBe(true);
  });

  it("with permadeath false, returns the party unchanged (including the dead)", () => {
    const party = createStartingParty();
    party[0].alive = false;
    const result = survivorsAfterBattle(party, false);
    expect(result).toBe(party);
    expect(result).toContain(party[0]);
  });
});

describe("permadeath - GameState field", () => {
  it("createGameState defaults permadeath to false", () => {
    expect(createGameState().permadeath).toBe(false);
  });

  it("save round-trip persists permadeath", () => {
    const state = createGameState();
    state.permadeath = true;
    saveGame(state);
    const loaded = loadGame(0);
    expect(loaded).not.toBeNull();
    expect(loaded!.permadeath).toBe(true);
  });

  it("an old save without permadeath loads as false", () => {
    const state = createGameState();
    const { permadeath: _permadeath, ...legacyState } = state;
    localStorage.setItem(SAVE_KEY, JSON.stringify(legacyState));
    const loaded = loadGame(0);
    expect(loaded).not.toBeNull();
    expect(loaded!.permadeath).toBe(false);
  });
});
