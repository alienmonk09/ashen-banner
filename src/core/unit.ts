import type { AIPersonality, ClassId, Direction, EquipMod, EquipSlot, Point, RaceId, Stats, Team, Unit } from "./types";
import { CLASSES, getClass } from "../data/classes";
import { getRace } from "../data/races";
import { getWeapon } from "../data/weapons";
import { getEquipment } from "../data/equipment";

let idCounter = 0;
export function nextUnitId(prefix = "u"): string {
  idCounter += 1;
  return `${prefix}${idCounter}`;
}

/**
 * XP needed to reach the next level. Front-loaded: early levels are cheap (50 to
 * hit L2) so a fresh level-1 party climbs fast toward the unchanged enemy curve,
 * then the +30/level slope gradually slows things down. Pairs with the battle
 * `xpLevelMult`, which pays a premium for fighting higher-level foes.
 */
export function xpForLevel(level: number): number {
  return 50 + (level - 1) * 30;
}

/**
 * Compute the stat block for a class at a given level, with optional race
 * modifiers folded in. Race deltas are flat and applied here (not once at
 * creation) so they survive level-ups and class changes, which recompute stats.
 * Every stat floors at 1.
 */
export function statsForLevel(classId: ClassId, level: number, raceId?: RaceId): Stats {
  const c = getClass(classId);
  const lv = level - 1;
  const g = c.growth;
  const m = raceId ? getRace(raceId).mod : {};
  const f = (value: number, delta = 0) => Math.max(1, Math.round(value) + delta);
  const maxHp = f(c.base.hp + g.hp * lv, m.hp ?? 0);
  const maxMp = f(c.base.mp + g.mp * lv, m.mp ?? 0);
  return {
    hp: maxHp,
    maxHp,
    mp: maxMp,
    maxMp,
    atk: f(c.base.atk + g.atk * lv, m.atk ?? 0),
    def: f(c.base.def + g.def * lv, m.def ?? 0),
    mag: f(c.base.mag + g.mag * lv, m.mag ?? 0),
    res: f(c.base.res + g.res * lv, m.res ?? 0),
    spd: f(c.base.spd + g.spd * lv, m.spd ?? 0),
    move: f(c.base.move, m.move ?? 0),
    jump: f(c.base.jump, m.jump ?? 0),
  };
}

/** Sum the stat deltas from a unit's equipped armor and accessory (if any). */
export function equipmentMod(unit: Unit): EquipMod {
  const result: EquipMod = {};
  const ids = [unit.armorId, unit.accessoryId].filter((id): id is string => id !== undefined);
  for (const id of ids) {
    const mod = getEquipment(id).mod;
    for (const key of Object.keys(mod) as Array<keyof EquipMod>) {
      result[key] = (result[key] ?? 0) + (mod[key] ?? 0);
    }
  }
  return result;
}

// ── Job mastery ───────────────────────────────────────────────────────────────

/** Per mastered class: +4 maxHp, +1 spd. Derived — never stored on Unit. */
export const MASTERY_HP_BONUS = 4;
export const MASTERY_SPD_BONUS = 1;

/**
 * Returns true when the unit has learned every skill of a given class.
 * A class with no skills can never be "mastered".
 */
export function hasMasteredClass(unit: Unit, classId: ClassId): boolean {
  const skills = getClass(classId).skillIds;
  return skills.length > 0 && skills.every((id) => unit.learnedSkillIds.includes(id));
}

/** All ClassIds the unit has mastered (learned every skill). */
export function masteredClasses(unit: Unit): ClassId[] {
  return (Object.keys(CLASSES) as ClassId[]).filter((id) => hasMasteredClass(unit, id));
}

/** Number of classes the unit has mastered — used to scale the passive bonus. */
export function masteryBonus(unit: Unit): number {
  return masteredClasses(unit).length;
}

/**
 * Compute the full stat block for a unit, including class/level/race stats,
 * equipment bonuses, and a permanent mastery bonus for each class fully learned.
 * This is the single source of truth for a unit's effective stat block.
 *
 * hp/mp deltas adjust both current AND max; every stat floors at 1.
 */
export function statsForUnit(unit: Unit): Stats {
  const base = statsForLevel(unit.classId, unit.level, unit.raceId);
  const mod = equipmentMod(unit);
  const mastered = masteryBonus(unit);
  const hpBonus = mastered * MASTERY_HP_BONUS;
  const spdBonus = mastered * MASTERY_SPD_BONUS;
  const f = (value: number, delta = 0) => Math.max(1, value + delta);
  const maxHp = f(base.maxHp, (mod.hp ?? 0) + hpBonus);
  const maxMp = f(base.maxMp, mod.mp ?? 0);
  return {
    hp: maxHp,
    maxHp,
    mp: maxMp,
    maxMp,
    atk: f(base.atk, mod.atk ?? 0),
    def: f(base.def, mod.def ?? 0),
    mag: f(base.mag, mod.mag ?? 0),
    res: f(base.res, mod.res ?? 0),
    spd: f(base.spd, (mod.spd ?? 0) + spdBonus),
    move: f(base.move, mod.move ?? 0),
    jump: f(base.jump, mod.jump ?? 0),
  };
}

/**
 * Recompute a unit's stats from scratch (class + level + race + equipment).
 * When preserveRatio is true, the current hp/mp fraction is kept so a wounded
 * unit stays wounded after equipping/unequipping.
 */
export function recomputeStats(unit: Unit, preserveRatio = false): void {
  const hpRatio = preserveRatio && unit.stats.maxHp > 0 ? unit.stats.hp / unit.stats.maxHp : 1;
  const mpRatio = preserveRatio && unit.stats.maxMp > 0 ? unit.stats.mp / unit.stats.maxMp : 1;
  const next = statsForUnit(unit);
  unit.stats = next;
  if (preserveRatio) {
    unit.stats.hp = Math.max(1, Math.round(next.maxHp * hpRatio));
    unit.stats.mp = Math.round(next.maxMp * mpRatio);
  }
}

/**
 * Equip an item to a unit's armor or accessory slot. Pass null to unequip.
 * Throws if the item's slot doesn't match the target slot. Preserves the
 * current hp/mp ratio so equipping doesn't suddenly fully restore a wounded unit.
 */
export function equip(unit: Unit, slot: EquipSlot, id: string | null): void {
  if (id !== null) {
    const def = getEquipment(id);
    if (def.slot !== slot) throw new Error(`Equipment "${id}" is for slot "${def.slot}", not "${slot}"`);
  }
  if (slot === "armor") {
    unit.armorId = id ?? undefined;
  } else {
    unit.accessoryId = id ?? undefined;
  }
  recomputeStats(unit, true);
}

export interface CreateUnitOpts {
  name: string;
  team: Team;
  classId: ClassId;
  /** Race; defaults to "human" (no stat modifiers). */
  raceId?: RaceId;
  level?: number;
  pos: Point;
  weaponId?: string;
  /** Skills already learned; defaults to none. */
  learnedSkillIds?: string[];
  /** Initial facing; defaults to south. Battle setup overrides toward the foe. */
  facing?: Direction;
  id?: string;
  /** AI behavioral archetype; only meaningful for enemy units. */
  personality?: AIPersonality;
}

export function createUnit(opts: CreateUnitOpts): Unit {
  const level = opts.level ?? 1;
  const raceId = opts.raceId ?? "human";
  const c = getClass(opts.classId);
  const weaponId = opts.weaponId ?? c.weaponIds[0];
  // Validate weapon belongs to class; fall back to class default.
  const w = getWeapon(weaponId);
  const finalWeapon = w.classes.includes(opts.classId) ? weaponId : c.weaponIds[0];
  return {
    id: opts.id ?? nextUnitId(opts.team === "player" ? "p" : "e"),
    name: opts.name,
    team: opts.team,
    personality: opts.personality,
    classId: opts.classId,
    raceId,
    level,
    xp: 0,
    sp: 0,
    learnedSkillIds: [...(opts.learnedSkillIds ?? [])],
    weaponId: finalWeapon,
    pos: { ...opts.pos },
    facing: opts.facing ?? "s",
    ct: 0,
    stats: statsForLevel(opts.classId, level, raceId),
    statuses: [],
    alive: true,
  };
}

/**
 * Grant XP to a unit, applying any level ups. Preserves the ratio of current
 * to max HP/MP across a level up so a wounded unit stays wounded.
 * Returns the number of levels gained.
 */
export function grantXp(unit: Unit, amount: number): number {
  unit.xp += amount;
  let gained = 0;
  while (unit.xp >= xpForLevel(unit.level)) {
    unit.xp -= xpForLevel(unit.level);
    const hpRatio = unit.stats.maxHp > 0 ? unit.stats.hp / unit.stats.maxHp : 1;
    const mpRatio = unit.stats.maxMp > 0 ? unit.stats.mp / unit.stats.maxMp : 1;
    unit.level += 1;
    const next = statsForUnit(unit);
    unit.stats = next;
    unit.stats.hp = Math.max(1, Math.round(next.maxHp * hpRatio));
    unit.stats.mp = Math.round(next.maxMp * mpRatio);
    gained += 1;
  }
  return gained;
}

/** Grant SP toward learning skills. */
export function grantSp(unit: Unit, amount: number): void {
  unit.sp += amount;
}

/** The next skill the unit can learn for a given class, or null if all learned. */
export function nextLearnableSkillForClass(unit: Unit, classId: ClassId): string | null {
  for (const id of getClass(classId).skillIds) {
    if (!unit.learnedSkillIds.includes(id)) return id;
  }
  return null;
}

/** The next skill the unit can learn for its primary class, or null if all learned. */
export function nextLearnableSkill(unit: Unit): string | null {
  return nextLearnableSkillForClass(unit, unit.classId);
}

/**
 * Try to learn the next skill in a class's order, spending SP. Works for the
 * primary class or a secondary job. Returns the learned skill id, or null.
 */
export function learnSkillForClass(unit: Unit, classId: ClassId, spCost: number): string | null {
  const next = nextLearnableSkillForClass(unit, classId);
  if (!next || unit.sp < spCost) return null;
  unit.sp -= spCost;
  unit.learnedSkillIds.push(next);
  return next;
}

/** Try to learn the next primary-class skill, spending SP. */
export function learnNextSkill(unit: Unit, spCost: number): string | null {
  return learnSkillForClass(unit, unit.classId, spCost);
}
