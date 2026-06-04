import type { ActiveStatus, SkillDef, StatusKind, Unit, WeaponDef } from "../core/types";
import { RNG } from "../core/rng";

export type HitKind = "damage" | "heal" | "mp" | "revive" | "status";

export interface HitResult {
  unitId: string;
  kind: HitKind;
  /** HP/MP delta magnitude (positive number); status uses 0. */
  amount: number;
  crit: boolean;
  killed: boolean;
  revived: boolean;
  status?: StatusKind;
}

const VARIANCE = 0.15;
const CRIT_CHANCE = 0.08;
const CRIT_MULT = 1.5;
const GUARD_DEF_BONUS = 0.5; // +50% def while guarding

/** Defense after status modifiers (Guard). */
export function effectiveDef(unit: Unit): number {
  let def = unit.stats.def;
  if (unit.statuses.some((s) => s.kind === "guard")) {
    def = Math.round(def * (1 + GUARD_DEF_BONUS));
  }
  return def;
}

/** Speed after status modifiers (Slow/Haste) — used by the turn manager. */
export function effectiveSpd(unit: Unit): number {
  let spd = unit.stats.spd;
  if (unit.statuses.some((s) => s.kind === "slow")) spd = Math.round(spd * 0.5);
  if (unit.statuses.some((s) => s.kind === "haste")) spd = Math.round(spd * 1.5);
  return Math.max(1, spd);
}

function applyVarianceAndCrit(base: number, rng: RNG, allowCrit: boolean): { value: number; crit: boolean } {
  const v = 1 - VARIANCE + rng.next() * (2 * VARIANCE);
  let value = base * v;
  let crit = false;
  if (allowCrit && rng.chance(CRIT_CHANCE)) {
    value *= CRIT_MULT;
    crit = true;
  }
  return { value: Math.max(1, Math.round(value)), crit };
}

function dealDamage(target: Unit, amount: number): { killed: boolean } {
  target.stats.hp = Math.max(0, target.stats.hp - amount);
  if (target.stats.hp === 0 && target.alive) {
    target.alive = false;
    target.statuses = [];
    return { killed: true };
  }
  return { killed: false };
}

function healHp(target: Unit, amount: number): void {
  target.stats.hp = Math.min(target.stats.maxHp, target.stats.hp + amount);
}

/** Basic weapon attack. Mutates target, returns the result. */
export function resolveWeaponAttack(
  attacker: Unit,
  target: Unit,
  weapon: WeaponDef,
  rng: RNG,
): HitResult {
  const power = weapon.kind === "magical" ? attacker.stats.mag : attacker.stats.atk;
  const base = Math.max(1, power + weapon.power - effectiveDef(target));
  const { value, crit } = applyVarianceAndCrit(base, rng, weapon.kind === "physical");
  const { killed } = dealDamage(target, value);
  return { unitId: target.id, kind: "damage", amount: value, crit, killed, revived: false };
}

export function addStatus(unit: Unit, status: ActiveStatus): void {
  const existing = unit.statuses.find((s) => s.kind === status.kind);
  if (existing) existing.turnsLeft = Math.max(existing.turnsLeft, status.turnsLeft);
  else unit.statuses.push({ ...status });
}

/** Reduce status durations by one turn and drop expired ones. */
export function tickStatuses(unit: Unit): void {
  unit.statuses = unit.statuses
    .map((s) => ({ ...s, turnsLeft: s.turnsLeft - 1 }))
    .filter((s) => s.turnsLeft > 0);
}

/**
 * Resolve a skill against one target tile occupant. Damage/heal/revive/buff/debuff.
 * Mutates the target and returns the result (null if no valid effect, e.g. reviving
 * a living unit or healing a dead one).
 */
export function resolveSkillOnTarget(
  caster: Unit,
  target: Unit,
  skill: SkillDef,
  rng: RNG,
): HitResult | null {
  const power = skill.scaling === "magical" ? caster.stats.mag : caster.stats.atk;

  switch (skill.effect) {
    case "damage": {
      if (!target.alive) return null;
      const base = Math.max(1, (power * skill.power) / 10 - (skill.scaling === "magical" ? target.stats.res : effectiveDef(target)));
      const { value, crit } = applyVarianceAndCrit(base, rng, skill.scaling === "physical");
      const { killed } = dealDamage(target, value);
      return { unitId: target.id, kind: "damage", amount: value, crit, killed, revived: false };
    }
    case "heal": {
      if (!target.alive) return null;
      const base = (power * skill.power) / 10;
      const value = Math.max(1, Math.round(base));
      healHp(target, value);
      return { unitId: target.id, kind: "heal", amount: value, crit: false, killed: false, revived: false };
    }
    case "revive": {
      if (target.alive) return null;
      target.alive = true;
      const value = Math.max(1, Math.round((power * skill.power) / 20));
      target.stats.hp = Math.min(target.stats.maxHp, value);
      return { unitId: target.id, kind: "revive", amount: value, crit: false, killed: false, revived: true };
    }
    case "buff": {
      if (!target.alive || !skill.statusKind) return null;
      addStatus(target, { kind: skill.statusKind, turnsLeft: 2 });
      return { unitId: target.id, kind: "status", amount: 0, crit: false, killed: false, revived: false, status: skill.statusKind };
    }
    case "debuff": {
      if (!target.alive || !skill.statusKind) return null;
      addStatus(target, { kind: skill.statusKind, turnsLeft: 3 });
      return { unitId: target.id, kind: "status", amount: 0, crit: false, killed: false, revived: false, status: skill.statusKind };
    }
  }
}

/** Restore HP/MP/revive from a consumable item. */
export function resolveItem(
  target: Unit,
  effect: "healHp" | "healMp" | "revive",
  amount: number,
): HitResult | null {
  switch (effect) {
    case "healHp": {
      // No effect (and so: don't consume) on a dead or already-full target.
      if (!target.alive || target.stats.hp >= target.stats.maxHp) return null;
      const before = target.stats.hp;
      healHp(target, amount);
      return { unitId: target.id, kind: "heal", amount: target.stats.hp - before, crit: false, killed: false, revived: false };
    }
    case "healMp": {
      if (!target.alive || target.stats.mp >= target.stats.maxMp) return null;
      const before = target.stats.mp;
      target.stats.mp = Math.min(target.stats.maxMp, target.stats.mp + amount);
      return { unitId: target.id, kind: "mp", amount: target.stats.mp - before, crit: false, killed: false, revived: false };
    }
    case "revive":
      if (target.alive) return null;
      target.alive = true;
      target.stats.hp = Math.min(target.stats.maxHp, amount);
      return { unitId: target.id, kind: "revive", amount, crit: false, killed: false, revived: true };
  }
}
