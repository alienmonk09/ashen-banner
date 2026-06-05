import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, loadGame } from "../src/core/state";

const SAVE_KEY = "tactics-mvp-save";

/** Minimal in-memory localStorage for node env. Mirrors economy.test.ts approach. */
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

/** A raw GameState blob with the party's points stored under the legacy `jp` field. */
function legacyJpSave(jpPerUnit: number | undefined): Record<string, unknown> {
  const raw = JSON.parse(JSON.stringify(createGameState())) as Record<string, unknown>;
  for (const u of raw.party as Array<Record<string, unknown>>) {
    delete u.sp;
    if (jpPerUnit !== undefined) u.jp = jpPerUnit;
  }
  return raw;
}

describe("skill-points save migration (jp -> sp)", () => {
  it("carries a pre-rename `jp` balance over to `sp` for every party unit", () => {
    store(legacyJpSave(175));
    const loaded = loadGame(0);
    expect(loaded).not.toBeNull();
    expect(loaded!.party.length).toBeGreaterThan(0);
    for (const u of loaded!.party) {
      expect(u.sp).toBe(175);
    }
  });

  it("defaults sp to 0 when neither sp nor jp is present (and never leaves it NaN/undefined)", () => {
    store(legacyJpSave(undefined));
    const loaded = loadGame(0);
    expect(loaded).not.toBeNull();
    for (const u of loaded!.party) {
      expect(u.sp).toBe(0);
      expect(Number.isFinite(u.sp)).toBe(true);
    }
  });

  it("leaves a current `sp` field untouched", () => {
    const raw = JSON.parse(JSON.stringify(createGameState())) as Record<string, unknown>;
    for (const u of raw.party as Array<Record<string, unknown>>) u.sp = 42;
    store(raw);
    const loaded = loadGame(0);
    for (const u of loaded!.party) {
      expect(u.sp).toBe(42);
    }
  });
});
