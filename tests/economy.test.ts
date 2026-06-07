import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, saveGame, loadGame, buyItem, sellItem, GOLD_PER_KILL, GOLD_PER_PHASE, goldForKill } from "../src/core/state";
import { ITEMS } from "../src/data/items";
import { WEAPONS } from "../src/data/weapons";
import { resolveItem } from "../src/battle/combat";
import { createUnit } from "../src/core/unit";
import type { ClassId } from "../src/core/types";

const SAVE_KEY = "tactics-mvp-save";

/** Minimal in-memory localStorage for node env. Mirrors difficulty.test.ts approach. */
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
// GOLD_PER_KILL constant
// ---------------------------------------------------------------------------

describe("GOLD_PER_KILL", () => {
  it("is a positive number", () => {
    expect(typeof GOLD_PER_KILL).toBe("number");
    expect(GOLD_PER_KILL).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// createGameState defaults
// ---------------------------------------------------------------------------

describe("createGameState - gold", () => {
  it("starts at 0 gold", () => {
    expect(createGameState().gold).toBe(0);
  });
});

describe("goldForKill - chapter-scaled bounty", () => {
  it("pays the base bounty in chapter 0 and more in later chapters", () => {
    expect(goldForKill(0)).toBe(GOLD_PER_KILL);
    expect(goldForKill(6)).toBe(GOLD_PER_KILL + 6 * GOLD_PER_PHASE);
    expect(goldForKill(6)).toBeGreaterThan(goldForKill(0));
  });
});

describe("gold save migration", () => {
  it("carries a pre-rename `gil` balance over to `gold`", () => {
    const raw = JSON.parse(JSON.stringify(createGameState())) as Record<string, unknown>;
    delete raw.gold;
    raw.gil = 250; // legacy field name
    store(raw);
    const loaded = loadGame(0);
    expect(loaded).not.toBeNull();
    expect(loaded!.gold).toBe(250);
  });

  it("defaults to 0 gold when neither gold nor gil is present", () => {
    const raw = JSON.parse(JSON.stringify(createGameState())) as Record<string, unknown>;
    delete raw.gold;
    store(raw);
    expect(loadGame(0)!.gold).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buyItem
// ---------------------------------------------------------------------------

describe("buyItem", () => {
  it("deducts the item price from gold and adds 1 to inventory, returns true", () => {
    const state = createGameState();
    state.gold = 100;
    const before = state.inventory["potion"] ?? 0;
    const result = buyItem(state, "potion");
    expect(result).toBe(true);
    expect(state.gold).toBe(100 - ITEMS.potion.price);
    expect(state.inventory["potion"]).toBe(before + 1);
  });

  it("returns false and mutates nothing when gold is insufficient", () => {
    const state = createGameState();
    state.gold = 10; // potion costs 25
    const gilBefore = state.gold;
    const inventoryBefore = { ...state.inventory };
    const result = buyItem(state, "potion");
    expect(result).toBe(false);
    expect(state.gold).toBe(gilBefore);
    expect(state.inventory).toEqual(inventoryBefore);
  });

  it("returns false for an unknown item id", () => {
    const state = createGameState();
    state.gold = 9999;
    const result = buyItem(state, "nonexistent_item");
    expect(result).toBe(false);
    expect(state.gold).toBe(9999);
  });

  it("increments from zero when item not yet in inventory", () => {
    const state = createGameState();
    state.gold = 999;
    delete state.inventory["phoenixDown"];
    const result = buyItem(state, "phoenixDown");
    expect(result).toBe(true);
    expect(state.inventory["phoenixDown"]).toBe(1);
  });

  it("can buy exactly when gold equals the price", () => {
    const state = createGameState();
    state.gold = ITEMS.ether.price;
    const result = buyItem(state, "ether");
    expect(result).toBe(true);
    expect(state.gold).toBe(0);
  });

  it("returns false when gold is exactly one short", () => {
    const state = createGameState();
    state.gold = ITEMS.ether.price - 1;
    const result = buyItem(state, "ether");
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Save round-trip with gold
// ---------------------------------------------------------------------------

describe("gold - save/load round-trip", () => {
  it("persists gold through save -> load", () => {
    const state = createGameState();
    state.gold = 360;
    saveGame(state);
    const loaded = loadGame();
    expect(loaded).not.toBeNull();
    expect(loaded!.gold).toBe(360);
  });

  it("normalises missing gold field to 0 (old save back-compat)", () => {
    const raw: Record<string, unknown> = JSON.parse(JSON.stringify(createGameState()));
    delete raw.gold;
    store(raw);
    const loaded = loadGame();
    expect(loaded).not.toBeNull();
    expect(loaded!.gold).toBe(0);
  });

  it("does NOT reject an old save that is missing the gold field", () => {
    const raw: Record<string, unknown> = JSON.parse(JSON.stringify(createGameState()));
    delete raw.gold;
    store(raw);
    expect(loadGame()).not.toBeNull();
  });

  it("normalises garbage gold value to 0", () => {
    const raw: Record<string, unknown> = JSON.parse(JSON.stringify(createGameState()));
    raw.gold = "lots";
    store(raw);
    const loaded = loadGame();
    expect(loaded).not.toBeNull();
    expect(loaded!.gold).toBe(0);
  });

  it("normalises negative gold to 0", () => {
    const raw: Record<string, unknown> = JSON.parse(JSON.stringify(createGameState()));
    raw.gold = -50;
    store(raw);
    const loaded = loadGame();
    expect(loaded).not.toBeNull();
    expect(loaded!.gold).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Every ITEMS entry has a positive numeric price
// ---------------------------------------------------------------------------

describe("ITEMS price field", () => {
  it("every item has a positive numeric price", () => {
    for (const item of Object.values(ITEMS)) {
      expect(typeof item.price, `${item.id}.price must be a number`).toBe("number");
      expect(item.price, `${item.id}.price must be positive`).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Caster classes have a purchasable weapon upgrade (gold sink)
// ---------------------------------------------------------------------------

describe("caster weapon upgrade path", () => {
  const CASTERS: ClassId[] = ["blackMage", "timeMage", "whiteMage", "druid", "summoner", "geomancer"];

  for (const cls of CASTERS) {
    it(`${cls} has >=2 usable weapons including at least one purchasable upgrade`, () => {
      const usable = Object.values(WEAPONS).filter((w) => w.classes.includes(cls));
      // Mirror the shop filter: purchasable means price > 0.
      const purchasable = usable.filter((w) => w.price > 0);
      expect(usable.length, `${cls} should have at least 2 usable weapons`).toBeGreaterThanOrEqual(2);
      expect(purchasable.length, `${cls} should have at least one purchasable upgrade`).toBeGreaterThanOrEqual(1);
    });
  }
});

// ---------------------------------------------------------------------------
// Per-tier price + effect-amount monotonicity (a stronger consumable upgrade
// must never be cheaper than the weaker one it replaces).
// ---------------------------------------------------------------------------

describe("consumable tier monotonicity", () => {
  // Each tier ordered weakest -> strongest. Price AND restore amount must climb.
  const TIERS: ReadonlyArray<readonly string[]> = [
    ["potion", "hiPotion", "xPotion"], // healHp
    ["ether", "turboEther"],           // healMp
    ["phoenixDown", "megaPhoenix"],    // revive
  ];

  for (const tier of TIERS) {
    it(`${tier.join(" < ")} climbs in both price and amount`, () => {
      for (let i = 1; i < tier.length; i++) {
        const lo = ITEMS[tier[i - 1]];
        const hi = ITEMS[tier[i]];
        expect(hi.price, `${hi.id}.price must exceed ${lo.id}.price`).toBeGreaterThan(lo.price);
        expect(hi.amount, `${hi.id}.amount must exceed ${lo.id}.amount`).toBeGreaterThan(lo.amount);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// sellItem - half-price (floored) buyback
// ---------------------------------------------------------------------------

describe("sellItem", () => {
  it("refunds floor(price/2), decrements the count, returns true", () => {
    const state = createGameState();
    state.gold = 0;
    state.inventory["xPotion"] = 2; // price 130 -> refund 65
    const result = sellItem(state, "xPotion");
    expect(result).toBe(true);
    expect(state.gold).toBe(Math.floor(ITEMS.xPotion.price / 2));
    expect(state.inventory["xPotion"]).toBe(1);
  });

  it("floors the refund for an odd price", () => {
    const state = createGameState();
    state.gold = 0;
    state.inventory["remedy"] = 1; // price 45 -> floor(22.5) = 22
    sellItem(state, "remedy");
    expect(ITEMS.remedy.price % 2).toBe(1); // guard: still an odd-priced item
    expect(state.gold).toBe(22);
  });

  it("returns false and mutates nothing when the party has none in stock", () => {
    const state = createGameState();
    state.gold = 7;
    state.inventory["phoenixDown"] = 0;
    const result = sellItem(state, "phoenixDown");
    expect(result).toBe(false);
    expect(state.gold).toBe(7);
    expect(state.inventory["phoenixDown"]).toBe(0);
  });

  it("returns false for an unknown item id", () => {
    const state = createGameState();
    state.gold = 7;
    expect(sellItem(state, "nonexistent_item")).toBe(false);
    expect(state.gold).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// resolveItem - no-op guards on a target that has nothing to gain.
// (Dead-target / alive-revive paths live in combat.test.ts; these pin the
// full-resource branches: a wasted potion/ether must not be consumed.)
// ---------------------------------------------------------------------------

describe("resolveItem no-effect guards", () => {
  function target() {
    return createUnit({ name: "T", team: "player", classId: "knight", pos: { x: 0, y: 0 } });
  }

  it("healHp returns null on a full-HP target (no wasted potion)", () => {
    const t = target();
    t.stats.hp = t.stats.maxHp;
    expect(resolveItem(t, "healHp", ITEMS.potion.amount)).toBeNull();
    expect(t.stats.hp).toBe(t.stats.maxHp);
  });

  it("healMp returns null on a full-MP target (no wasted ether)", () => {
    const t = target();
    t.stats.mp = t.stats.maxMp;
    expect(resolveItem(t, "healMp", ITEMS.ether.amount)).toBeNull();
    expect(t.stats.mp).toBe(t.stats.maxMp);
  });

  it("revive returns null on a living target (no wasted phoenix down)", () => {
    const t = target();
    expect(t.alive).toBe(true);
    expect(resolveItem(t, "revive", ITEMS.phoenixDown.amount)).toBeNull();
  });
});
