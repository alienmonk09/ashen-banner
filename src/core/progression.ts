import type { LevelUpInfo, Stats, Unit } from "./types";
import { grantXp, nextLearnableSkill } from "./unit";
import { getSkill } from "../data/skills";

/**
 * The live XP economy. XP is earned DURING battle (not only at the bell), across
 * three channels so growth tracks engagement without snowballing:
 *
 *  1. Kill-participation — every unit that damaged or debuffed a foe shares its
 *     XP when it dies (`xpForKill`); the unit that lands the finisher gets a bonus.
 *  2. Action XP — a qualifying action that doesn't kill still pays its actor a
 *     little: an offensive hit on a foe, or a buff/heal/revive on an ally.
 *  3. Battle-clear XP — a fixed grant split equally to the whole party at victory
 *     (present, fallen, or benched) so supports and the bench keep pace.
 *
 * All knobs live here so balance is a one-file tuning pass.
 */

/** XP a defeated enemy is worth, scaled by its level (which tracks the party). */
export function xpForKill(enemyLevel: number): number {
  return 12 + Math.max(1, enemyLevel) * 5;
}

/** Extra fraction of `xpForKill` granted to the unit that lands the killing blow. */
export const KILL_FINISHER_BONUS = 0.5;

/** Finisher's total kill XP (base share + finisher bonus), rounded. */
export function xpForFinisher(enemyLevel: number): number {
  return Math.round(xpForKill(enemyLevel) * (1 + KILL_FINISHER_BONUS));
}

/** XP for an offensive action on a foe that did not kill it. */
export const ACTION_XP_OFFENSIVE = 4;
/** XP for a supportive action on an ally (buff / heal / revive). */
export const ACTION_XP_SUPPORT = 4;

/** Fixed clear bonus granted equally to every party member at victory, scaling
 *  gently with the chapter so late battles still nudge the curve. */
export function battleClearXp(phaseIndex: number): number {
  return 40 + Math.max(0, phaseIndex) * 4;
}

/**
 * Grant XP and, if the unit crossed at least one level, return a fully-captured
 * `LevelUpInfo` for the in-battle level-up card (before/after stat snapshots and
 * the name of a now-affordable skill, if any). Returns null when no level is
 * gained. The stat snapshots are copies — safe to hold after `grantXp` reassigns
 * `unit.stats`.
 */
export function grantXpTracked(unit: Unit, amount: number): LevelUpInfo | null {
  if (amount <= 0) return null;
  const fromLevel = unit.level;
  const statsBefore: Stats = { ...unit.stats };
  const gained = grantXp(unit, amount);
  if (gained <= 0) return null;
  const statsAfter: Stats = { ...unit.stats };

  let newSkillName: string | undefined;
  const nextId = nextLearnableSkill(unit);
  if (nextId) {
    const skill = getSkill(nextId);
    if (unit.sp >= skill.spCost) newSkillName = skill.name;
  }

  return {
    unitId: unit.id,
    unitName: unit.name,
    classId: unit.classId,
    fromLevel,
    toLevel: unit.level,
    statsBefore,
    statsAfter,
    newSkillName,
  };
}
