import type { Difficulty } from "../core/types";
import { RNG } from "../core/rng";
import { ITEMS } from "./items";

/**
 * Chapter/difficulty-scaled loot for END-OF-BATTLE spoils (and small per-enemy
 * drops). Pure: every roll's randomness flows through the passed `RNG`, so a
 * fixed seed reproduces the same haul. Treasure-chest contents are authored on
 * the maps elsewhere — this module only owns the random battle drops.
 *
 * The campaign is 17 phases (0-based). Drops lean by chapter: early fights pay
 * the basic tier (potion/ether), mid fights mix in the mid tier
 * (hiPotion/phoenixDown/hourglass), and late fights unlock the premium tier
 * (xPotion/turboEther/megaPhoenix). Difficulty nudges count and quality: hard
 * rolls a touch more and skews better, easy a touch less.
 */

/** The three quality tiers, basic → premium. Each holds valid ITEMS ids. */
const BASIC: string[] = ["potion", "ether"];
const MID: string[] = ["hiPotion", "phoenixDown", "hourglass"];
const PREMIUM: string[] = ["xPotion", "turboEther", "megaPhoenix"];

/** Relative weights across the three tiers for a single drop pick. */
interface TierWeights {
  basic: number;
  mid: number;
  premium: number;
}

/** A chapter band: phases [from, to] inclusive share one tier-weight profile. */
interface ChapterBand {
  /** Inclusive lower phase index (0-based). */
  from: number;
  /** Inclusive upper phase index; the last band runs to the finale. */
  to: number;
  weights: TierWeights;
}

/**
 * Chapter → tier-weight table. Read top-to-bottom; the first band whose range
 * covers the phase wins. Early bands are basic-heavy, the late band is the only
 * one that can surface premium loot, so early hauls stay in the basic tier and
 * late hauls can reach the top.
 */
const CHAPTER_BANDS: ChapterBand[] = [
  { from: 0, to: 4, weights: { basic: 10, mid: 0, premium: 0 } },
  { from: 5, to: 10, weights: { basic: 4, mid: 6, premium: 0 } },
  { from: 11, to: Infinity, weights: { basic: 1, mid: 4, premium: 5 } },
];

/** Tier-weight profile for a phase (clamped: negatives read as the opener). */
function bandFor(phaseIndex: number): TierWeights {
  const phase = Math.max(0, phaseIndex);
  for (const band of CHAPTER_BANDS) {
    if (phase >= band.from && phase <= band.to) return band.weights;
  }
  // Unreachable given the table covers [0, Infinity]; fall back to basics.
  return CHAPTER_BANDS[0].weights;
}

/** Pick one tier pool by weight, then one id uniformly from it. */
function pickDrop(weights: TierWeights, rng: RNG): string {
  const total = weights.basic + weights.mid + weights.premium;
  let roll = rng.next() * total;
  if ((roll -= weights.basic) < 0) return BASIC[rng.int(0, BASIC.length - 1)];
  if ((roll -= weights.mid) < 0) return MID[rng.int(0, MID.length - 1)];
  return PREMIUM[rng.int(0, PREMIUM.length - 1)];
}

/** Per-difficulty drop-count profile. `extra` is the chance to roll one more
 *  drop on top of the base count, so hard's expected count > normal > easy. */
const DROP_COUNT: Record<Difficulty, { base: number; extra: number }> = {
  easy: { base: 0, extra: 0.5 },
  normal: { base: 1, extra: 0.5 },
  hard: { base: 1, extra: 0.9 },
};

/** Hard upper bound on battle-drop count regardless of difficulty. */
const MAX_BATTLE_DROPS = 3;

/**
 * Roll the spoils dropped at victory: 0–3 item ids, weighted by chapter and
 * difficulty. Always returns valid ITEMS ids. Lower phases lean basic; the late
 * band can include the premium tier. Hard rolls slightly more/better than
 * normal, easy slightly less.
 */
export function rollBattleDrops(phaseIndex: number, difficulty: Difficulty, rng: RNG): string[] {
  const weights = bandFor(phaseIndex);
  const profile = DROP_COUNT[difficulty];

  let count = profile.base;
  if (rng.chance(profile.extra)) count += 1;
  // A second bonus roll keeps hard's tail reaching the cap more often.
  if (count > 0 && rng.chance(profile.extra * 0.5)) count += 1;
  count = Math.min(MAX_BATTLE_DROPS, count);

  const drops: string[] = [];
  for (let i = 0; i < count; i++) drops.push(pickDrop(weights, rng));
  return drops;
}

/** Chance a felled enemy coughs up a single consumable. */
const ENEMY_DROP_CHANCE = 0.15;

/**
 * Roll a single per-enemy drop scaled to the enemy's level, or null (most of the
 * time). Low-level foes drop basics; mid-level foes can drop the mid tier;
 * high-level foes can drop premium. Never returns an invalid id.
 */
export function rollEnemyDrop(enemyLevel: number, rng: RNG): string | null {
  if (!rng.chance(ENEMY_DROP_CHANCE)) return null;
  const level = Math.max(1, enemyLevel);
  // Level bands mirror the chapter bands: enemies track the party's level.
  const weights: TierWeights =
    level <= 4
      ? { basic: 10, mid: 0, premium: 0 }
      : level <= 10
        ? { basic: 4, mid: 6, premium: 0 }
        : { basic: 1, mid: 4, premium: 5 };
  return pickDrop(weights, rng);
}

/** Exposed for tests: the union of every id any roll can return. */
export const LOOT_POOL: string[] = [...BASIC, ...MID, ...PREMIUM];

// Sanity: every loot id must be a real item (guards against typos / removals).
for (const id of LOOT_POOL) {
  if (!ITEMS[id]) throw new Error(`loot.ts references unknown item: ${id}`);
}
