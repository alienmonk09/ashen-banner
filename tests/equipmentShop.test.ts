import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, saveGame, loadGame, buyEquipment, ownsEquipment } from "../src/core/state";
import { EQUIPMENT } from "../src/data/equipment";

const SAVE_KEY = "tactics-mvp-save";

/** Minimal in-memory localStorage for node env. */
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
// createGameState defaults
// ---------------------------------------------------------------------------

describe("createGameState - ownedEquipment", () => {
  it("starts with an empty ownedEquipment array", () => {
    const state = createGameState();
    expect(state.ownedEquipment).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ownsEquipment
// ---------------------------------------------------------------------------

describe("ownsEquipment", () => {
  it("returns false when ownedEquipment is empty", () => {
    const state = createGameState();
    expect(ownsEquipment(state, "leatherArmor")).toBe(false);
  });

  it("returns true after the id is added to ownedEquipment", () => {
    const state = createGameState();
    state.ownedEquipment.push("ironRing");
    expect(ownsEquipment(state, "ironRing")).toBe(true);
  });

  it("returns false for an id not in ownedEquipment", () => {
    const state = createGameState();
    state.ownedEquipment.push("ironRing");
    expect(ownsEquipment(state, "swiftBoots")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buyEquipment
// ---------------------------------------------------------------------------

describe("buyEquipment", () => {
  it("deducts the price, adds to ownedEquipment, and returns true when affordable and unowned", () => {
    const state = createGameState();
    state.gil = 500;
    const price = EQUIPMENT.leatherArmor.price;
    const result = buyEquipment(state, "leatherArmor");
    expect(result).toBe(true);
    expect(state.gil).toBe(500 - price);
    expect(state.ownedEquipment).toContain("leatherArmor");
  });

  it("returns false and mutates nothing when gil is insufficient", () => {
    const state = createGameState();
    state.gil = 10; // leatherArmor costs 90
    const gilBefore = state.gil;
    const ownedBefore = [...state.ownedEquipment];
    const result = buyEquipment(state, "leatherArmor");
    expect(result).toBe(false);
    expect(state.gil).toBe(gilBefore);
    expect(state.ownedEquipment).toEqual(ownedBefore);
  });

  it("returns false and mutates nothing when item is already owned", () => {
    const state = createGameState();
    state.gil = 9999;
    state.ownedEquipment.push("ironRing");
    const gilBefore = state.gil;
    const result = buyEquipment(state, "ironRing");
    expect(result).toBe(false);
    expect(state.gil).toBe(gilBefore);
    expect(state.ownedEquipment.filter((id) => id === "ironRing").length).toBe(1);
  });

  it("returns false for an unknown equipment id", () => {
    const state = createGameState();
    state.gil = 9999;
    const result = buyEquipment(state, "nonexistent_gear");
    expect(result).toBe(false);
    expect(state.gil).toBe(9999);
    expect(state.ownedEquipment).toEqual([]);
  });

  it("can buy exactly when gil equals the price", () => {
    const state = createGameState();
    state.gil = EQUIPMENT.ironRing.price;
    const result = buyEquipment(state, "ironRing");
    expect(result).toBe(true);
    expect(state.gil).toBe(0);
  });

  it("returns false when gil is exactly one short", () => {
    const state = createGameState();
    state.gil = EQUIPMENT.ironRing.price - 1;
    const result = buyEquipment(state, "ironRing");
    expect(result).toBe(false);
  });

  it("updates ownsEquipment after a successful purchase", () => {
    const state = createGameState();
    state.gil = 999;
    expect(ownsEquipment(state, "swiftBoots")).toBe(false);
    buyEquipment(state, "swiftBoots");
    expect(ownsEquipment(state, "swiftBoots")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Save round-trip
// ---------------------------------------------------------------------------

describe("ownedEquipment - save/load round-trip", () => {
  it("persists ownedEquipment through save -> load", () => {
    const state = createGameState();
    state.gil = 999;
    buyEquipment(state, "ironRing");
    buyEquipment(state, "chainmail");
    saveGame(state);
    const loaded = loadGame();
    expect(loaded).not.toBeNull();
    expect(loaded!.ownedEquipment).toEqual(["ironRing", "chainmail"]);
  });

  it("normalises missing ownedEquipment to [] (old save back-compat)", () => {
    const raw: Record<string, unknown> = JSON.parse(JSON.stringify(createGameState()));
    delete raw.ownedEquipment;
    store(raw);
    const loaded = loadGame();
    expect(loaded).not.toBeNull();
    expect(loaded!.ownedEquipment).toEqual([]);
  });

  it("does NOT reject an old save that is missing the ownedEquipment field", () => {
    const raw: Record<string, unknown> = JSON.parse(JSON.stringify(createGameState()));
    delete raw.ownedEquipment;
    store(raw);
    expect(loadGame()).not.toBeNull();
  });

  it("migrates armorId on a unit to ownedEquipment when loading an old save", () => {
    const raw: Record<string, unknown> = JSON.parse(JSON.stringify(createGameState()));
    // Simulate an old save: unit has armorId set but ownedEquipment is missing.
    const party = raw.party as Array<Record<string, unknown>>;
    party[0].armorId = "leatherArmor";
    delete raw.ownedEquipment;
    store(raw);
    const loaded = loadGame();
    expect(loaded).not.toBeNull();
    expect(loaded!.ownedEquipment).toContain("leatherArmor");
  });

  it("migrates accessoryId on a unit to ownedEquipment when loading an old save", () => {
    const raw: Record<string, unknown> = JSON.parse(JSON.stringify(createGameState()));
    const party = raw.party as Array<Record<string, unknown>>;
    party[0].accessoryId = "swiftBoots";
    delete raw.ownedEquipment;
    store(raw);
    const loaded = loadGame();
    expect(loaded).not.toBeNull();
    expect(loaded!.ownedEquipment).toContain("swiftBoots");
  });

  it("does not duplicate an id already in ownedEquipment during migration", () => {
    const raw: Record<string, unknown> = JSON.parse(JSON.stringify(createGameState()));
    const party = raw.party as Array<Record<string, unknown>>;
    party[0].armorId = "leatherArmor";
    raw.ownedEquipment = ["leatherArmor"];
    store(raw);
    const loaded = loadGame();
    expect(loaded).not.toBeNull();
    expect(loaded!.ownedEquipment.filter((id: string) => id === "leatherArmor").length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Every EQUIPMENT entry has a positive numeric price
// ---------------------------------------------------------------------------

describe("EQUIPMENT price field", () => {
  it("every equipment entry has a positive numeric price", () => {
    for (const equip of Object.values(EQUIPMENT)) {
      expect(typeof equip.price, `${equip.id}.price must be a number`).toBe("number");
      expect(equip.price, `${equip.id}.price must be positive`).toBeGreaterThan(0);
    }
  });
});
