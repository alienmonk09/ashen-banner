import type { ClassId, Direction, Point, RaceId, Stats, Team, Unit } from "./types";
import { getClass } from "../data/classes";
import { getRace } from "../data/races";
import { getWeapon } from "../data/weapons";

let idCounter = 0;
export function nextUnitId(prefix = "u"): string {
  idCounter += 1;
  return `${prefix}${idCounter}`;
}

/** XP needed to reach the next level (flat-ish curve). */
export function xpForLevel(level: number): number {
  return 100 + (level - 1) * 40;
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
    classId: opts.classId,
    raceId,
    level,
    xp: 0,
    jp: 0,
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
    const next = statsForLevel(unit.classId, unit.level, unit.raceId);
    unit.stats = next;
    unit.stats.hp = Math.max(1, Math.round(next.maxHp * hpRatio));
    unit.stats.mp = Math.round(next.maxMp * mpRatio);
    gained += 1;
  }
  return gained;
}

/** Grant JP toward learning skills. */
export function grantJp(unit: Unit, amount: number): void {
  unit.jp += amount;
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
 * Try to learn the next skill in a class's order, spending JP. Works for the
 * primary class or a secondary job. Returns the learned skill id, or null.
 */
export function learnSkillForClass(unit: Unit, classId: ClassId, jpCost: number): string | null {
  const next = nextLearnableSkillForClass(unit, classId);
  if (!next || unit.jp < jpCost) return null;
  unit.jp -= jpCost;
  unit.learnedSkillIds.push(next);
  return next;
}

/** Try to learn the next primary-class skill, spending JP. */
export function learnNextSkill(unit: Unit, jpCost: number): string | null {
  return learnSkillForClass(unit, unit.classId, jpCost);
}
