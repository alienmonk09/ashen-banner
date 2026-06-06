import { describe, it, expect } from "vitest";
import { rollBattleDrops, rollEnemyDrop, LOOT_POOL } from "../src/data/loot";
import { ITEMS } from "../src/data/items";
import type { Difficulty } from "../src/core/types";
import { RNG } from "../src/core/rng";

const BASIC = new Set(["potion", "ether"]);
const PREMIUM = new Set(["xPotion", "turboEther", "megaPhoenix"]);
const FINALE = 16; // 0-based last phase

/** Battle drops gathered across many seeds for a given phase/difficulty. */
function sampleDrops(phaseIndex: number, difficulty: Difficulty, seeds: number): string[][] {
  const out: string[][] = [];
  for (let s = 0; s < seeds; s++) out.push(rollBattleDrops(phaseIndex, difficulty, new RNG(s + 1)));
  return out;
}

describe("rollBattleDrops — validity", () => {
  it("only ever returns ids that exist in ITEMS", () => {
    for (const phase of [0, 4, 8, 12, FINALE]) {
      for (const diff of ["easy", "normal", "hard"] as Difficulty[]) {
        for (const drops of sampleDrops(phase, diff, 300)) {
          for (const id of drops) expect(ITEMS[id]).toBeDefined();
        }
      }
    }
  });

  it("LOOT_POOL is entirely valid item ids", () => {
    for (const id of LOOT_POOL) expect(ITEMS[id]).toBeDefined();
  });

  it("returns between 0 and 3 drops, inclusive", () => {
    for (const phase of [0, 8, FINALE]) {
      for (const diff of ["easy", "normal", "hard"] as Difficulty[]) {
        for (const drops of sampleDrops(phase, diff, 300)) {
          expect(drops.length).toBeGreaterThanOrEqual(0);
          expect(drops.length).toBeLessThanOrEqual(3);
        }
      }
    }
  });
});

describe("rollBattleDrops — chapter scaling", () => {
  it("early chapters stay in the basic tier (never premium)", () => {
    const all = sampleDrops(0, "hard", 500).flat();
    expect(all.length).toBeGreaterThan(0); // sanity: hard does drop something
    for (const id of all) {
      expect(BASIC.has(id)).toBe(true);
      expect(PREMIUM.has(id)).toBe(false);
    }
  });

  it("late chapters can surface the premium tier", () => {
    const all = sampleDrops(FINALE, "normal", 500).flat();
    expect(all.some((id) => PREMIUM.has(id))).toBe(true);
  });

  it("late chapters rarely if ever fall back to the basic tier", () => {
    const all = sampleDrops(FINALE, "normal", 500).flat();
    // Basic is weighted low (1 of 10) in the finale band but not impossible.
    const basicFraction = all.filter((id) => BASIC.has(id)).length / all.length;
    expect(basicFraction).toBeLessThan(0.25);
  });
});

/** Quality score: basic=1, mid=2, premium=3, summed over a drop list. */
function quality(ids: string[]): number {
  const MID = new Set(["hiPotion", "phoenixDown", "hourglass"]);
  let q = 0;
  for (const id of ids) q += PREMIUM.has(id) ? 3 : MID.has(id) ? 2 : 1;
  return q;
}

describe("rollBattleDrops — difficulty ordering", () => {
  it("expected drop count rises easy <= normal <= hard", () => {
    const seeds = 1000;
    const avgCount = (d: Difficulty) =>
      sampleDrops(FINALE, d, seeds).reduce((s, drops) => s + drops.length, 0) / seeds;
    const easy = avgCount("easy");
    const normal = avgCount("normal");
    const hard = avgCount("hard");
    expect(easy).toBeLessThanOrEqual(normal);
    expect(normal).toBeLessThanOrEqual(hard);
    // And the gap is real, not a rounding tie.
    expect(hard).toBeGreaterThan(easy);
  });

  it("expected total quality rises easy <= normal <= hard", () => {
    const seeds = 1000;
    const avgQuality = (d: Difficulty) =>
      sampleDrops(FINALE, d, seeds).reduce((s, drops) => s + quality(drops), 0) / seeds;
    const easy = avgQuality("easy");
    const normal = avgQuality("normal");
    const hard = avgQuality("hard");
    expect(easy).toBeLessThanOrEqual(normal);
    expect(normal).toBeLessThanOrEqual(hard);
    expect(hard).toBeGreaterThan(easy);
  });
});

describe("rollEnemyDrop", () => {
  it("returns null sometimes and a valid id sometimes; never an invalid id", () => {
    let nulls = 0;
    let hits = 0;
    for (let s = 0; s < 1000; s++) {
      const drop = rollEnemyDrop(8, new RNG(s + 1));
      if (drop === null) {
        nulls++;
      } else {
        hits++;
        expect(ITEMS[drop]).toBeDefined();
      }
    }
    expect(nulls).toBeGreaterThan(0);
    expect(hits).toBeGreaterThan(0);
    // The ~15% drop chance means misses dominate.
    expect(nulls).toBeGreaterThan(hits);
  });

  it("low-level enemies drop only the basic tier", () => {
    for (let s = 0; s < 1000; s++) {
      const drop = rollEnemyDrop(1, new RNG(s + 1));
      if (drop !== null) {
        expect(BASIC.has(drop)).toBe(true);
        expect(PREMIUM.has(drop)).toBe(false);
      }
    }
  });

  it("high-level enemies can drop the premium tier", () => {
    const drops: string[] = [];
    for (let s = 0; s < 2000; s++) {
      const drop = rollEnemyDrop(15, new RNG(s + 1));
      if (drop !== null) drops.push(drop);
    }
    expect(drops.some((id) => PREMIUM.has(id))).toBe(true);
  });

  it("floors a non-positive level at 1 (basic tier, no crash)", () => {
    for (let s = 0; s < 200; s++) {
      const drop = rollEnemyDrop(0, new RNG(s + 1));
      if (drop !== null) expect(BASIC.has(drop)).toBe(true);
    }
  });
});
