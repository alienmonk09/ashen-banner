import type { ActiveStatus, Element, ItemEffect, SkillDef, StatusKind, TerrainType, Unit, WeaponDef, WeaponKind } from "../core/types";
import { RNG } from "../core/rng";
import { attackAngle, type AttackAngle } from "./facing";
import { getRace } from "../data/races";
import { getClass } from "../data/classes";
import { terrainEffect } from "../data/terrain";
import { getItem } from "../data/items";
import { manhattan } from "./grid";

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

/**
 * Positional context for an attack: where it comes from and the elevation gap.
 * Omitted entirely for low-level/raw resolution (no facing/elevation bonus);
 * the live game and AI always supply it so flanks and high ground matter.
 */
export interface AttackContext {
  /** Tile the attack originates from (defaults to the attacker's own tile). */
  fromPos?: { x: number; y: number };
  /** Attacker-tile height minus target-tile height (in level units). */
  heightDelta?: number;
}

const VARIANCE = 0.15;
const CRIT_CHANCE = 0.08;
const CRIT_MULT = 1.5;
const GUARD_DEF_BONUS = 0.5; // +50% def while guarding

// Flank/rear damage and crit bonuses (physical only).
const FACING_DMG: Record<AttackAngle, number> = { front: 1.0, flank: 1.1, rear: 1.25 };
const FACING_CRIT: Record<AttackAngle, number> = { front: 0, flank: 0.1, rear: 0.2 };
// High-ground advantage: ±damage per level (clamped) and a crit edge from above.
const ELEV_DMG_PER = 0.07;
const ELEV_CLAMP = 2;
const ELEV_CRIT_HIGH = 0.05;
// Protective statuses cut incoming damage of their type.
const PROTECT_REDUCTION = 0.25; // physical
const SHELL_REDUCTION = 0.25; // magical
// Per-turn HP swing from damage/heal-over-time statuses (fraction of maxHp).
const POISON_FRAC = 0.1;
const REGEN_FRAC = 0.1;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function hasStatus(unit: Unit, kind: StatusKind): boolean {
  return unit.statuses.some((s) => s.kind === kind);
}

/** A stopped unit forfeits its turns until the status wears off. */
export function isStopped(unit: Unit): boolean {
  return hasStatus(unit, "stop");
}

/** Defense after status modifiers (Guard). */
export function effectiveDef(unit: Unit): number {
  let def = unit.stats.def;
  if (hasStatus(unit, "guard")) {
    def = Math.round(def * (1 + GUARD_DEF_BONUS));
  }
  return def;
}

/** Speed after status modifiers (Slow/Haste) — used by the turn manager. */
export function effectiveSpd(unit: Unit): number {
  let spd = unit.stats.spd;
  if (hasStatus(unit, "slow")) spd = Math.round(spd * 0.5);
  if (hasStatus(unit, "haste")) spd = Math.round(spd * 1.5);
  return Math.max(1, spd);
}

/**
 * Damage multiplier from the attacker's position: flank/rear bonus plus a
 * high/low-ground edge. Physical only — magic ignores facing and elevation.
 * Returns 1 when no context is supplied.
 */
export function positionalDamageMult(
  attacker: Unit,
  target: Unit,
  kind: WeaponKind,
  ctx?: AttackContext,
): number {
  if (!ctx || kind !== "physical") return 1;
  const from = ctx.fromPos ?? attacker.pos;
  let m = FACING_DMG[attackAngle(from, target.pos, target.facing)];
  m *= 1 + clamp(ctx.heightDelta ?? 0, -ELEV_CLAMP, ELEV_CLAMP) * ELEV_DMG_PER;
  return m;
}

/** Crit-chance bonus from position (physical only); 0 without context. */
export function positionalCritBonus(
  attacker: Unit,
  target: Unit,
  kind: WeaponKind,
  ctx?: AttackContext,
): number {
  if (!ctx || kind !== "physical") return 0;
  const from = ctx.fromPos ?? attacker.pos;
  let b = FACING_CRIT[attackAngle(from, target.pos, target.facing)];
  if ((ctx.heightDelta ?? 0) > 0) b += ELEV_CRIT_HIGH;
  return b;
}

/**
 * Incoming-damage multiplier from the defender's protective statuses (always
 * applied, like Guard's defense bonus): Protect softens physical, Shell magical.
 */
export function defenseDamageMult(target: Unit, kind: WeaponKind): number {
  if (kind === "physical" && hasStatus(target, "protect")) return 1 - PROTECT_REDUCTION;
  if (kind === "magical" && hasStatus(target, "shell")) return 1 - SHELL_REDUCTION;
  return 1;
}

export type Affinity = "weak" | "resist" | "neutral";

/** The target race's stance toward an element (drives elemental damage scaling). */
export function elementAffinity(target: Unit, element: Element): Affinity {
  if (element === "none") return "neutral";
  const race = getRace(target.raceId);
  if (race.weak?.includes(element)) return "weak";
  if (race.resist?.includes(element)) return "resist";
  return "neutral";
}

/** Elemental damage multiplier: weakness ×1.5, resistance ×0.5, else ×1. */
export function elementDamageMult(target: Unit, element: Element): number {
  switch (elementAffinity(target, element)) {
    case "weak":
      return 1.5;
    case "resist":
      return 0.5;
    default:
      return 1;
  }
}

function applyVarianceAndCrit(
  base: number,
  rng: RNG,
  allowCrit: boolean,
  critChance: number = CRIT_CHANCE,
): { value: number; crit: boolean } {
  const v = 1 - VARIANCE + rng.next() * (2 * VARIANCE);
  let value = base * v;
  let crit = false;
  if (allowCrit && rng.chance(critChance)) {
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
  ctx?: AttackContext,
): HitResult {
  const power = weapon.kind === "magical" ? attacker.stats.mag : attacker.stats.atk;
  let base = Math.max(1, power + weapon.power - effectiveDef(target));
  base *= positionalDamageMult(attacker, target, weapon.kind, ctx);
  base *= defenseDamageMult(target, weapon.kind);
  base = Math.max(1, base);
  const critChance = CRIT_CHANCE + positionalCritBonus(attacker, target, weapon.kind, ctx);
  const { value, crit } = applyVarianceAndCrit(base, rng, weapon.kind === "physical", critChance);
  const { killed } = dealDamage(target, value);
  return { unitId: target.id, kind: "damage", amount: value, crit, killed, revived: false };
}

/** True if the unit's class has the Counter reaction (strikes back at melee). */
export function canCounter(unit: Unit): boolean {
  return getClass(unit.classId).reactions?.includes("counter") ?? false;
}

/**
 * A counterattack from `defender` back at `attacker`, or null if it can't happen
 * (defender can't counter, either is down, or the attacker is outside the
 * defender's weapon reach). Callers gate this to melee provocations. The weapon
 * is passed in so combat stays free of the weapon data table.
 */
export function resolveCounterAttack(
  defender: Unit,
  attacker: Unit,
  defenderWeapon: WeaponDef,
  rng: RNG,
  ctx?: AttackContext,
): HitResult | null {
  if (!defender.alive || !attacker.alive || !canCounter(defender)) return null;
  const dist = Math.abs(defender.pos.x - attacker.pos.x) + Math.abs(defender.pos.y - attacker.pos.y);
  if (dist === 0 || dist > defenderWeapon.range) return null;
  return resolveWeaponAttack(defender, attacker, defenderWeapon, rng, ctx);
}

/** True if the unit's class has the Auto-Potion reaction. */
export function hasAutoPotion(unit: Unit): boolean {
  return getClass(unit.classId).reactions?.includes("autoPotion") ?? false;
}

/** True if the unit's class has the Cover reaction (intercepts hits aimed at adjacent wounded allies). */
export function hasCover(unit: Unit): boolean {
  return getClass(unit.classId).reactions?.includes("cover") ?? false;
}

/**
 * Returns the living ally who will intercept a single-target hit aimed at
 * `target`, or null when no valid guardian is present. Rules:
 * - Same team as the target, different unit, and alive.
 * - Has the Cover reaction (hasCover).
 * - Orthogonally adjacent to the target (manhattan distance 1).
 * - Has strictly MORE current HP than the target (a healthy guard shields a
 *   wounded ally — never redirect onto someone worse off).
 * When multiple guards qualify, the one with the highest current HP wins
 * (highest HP first; ties are left in their original order, stable).
 */
export function coverFor(target: Unit, units: Unit[]): Unit | null {
  const candidates = units.filter(
    (u) =>
      u !== target &&
      u.alive &&
      u.team === target.team &&
      hasCover(u) &&
      manhattan(u.pos, target.pos) === 1 &&
      u.stats.hp > target.stats.hp,
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((best, u) => (u.stats.hp > best.stats.hp ? u : best));
}

/**
 * When a player unit drops below `threshold` HP fraction after taking damage,
 * automatically consume a potion from the shared party inventory and heal.
 * Prefers "potion" over "hiPotion". Returns a heal HitResult, or null if the
 * reaction cannot fire (wrong class, HP above threshold, no stock, or dead).
 * Mutates both the unit's HP and the inventory count.
 */
export function resolveAutoPotion(
  unit: Unit,
  inventory: Record<string, number>,
  threshold = 0.3,
): HitResult | null {
  if (!unit.alive || !hasAutoPotion(unit)) return null;
  if (unit.stats.hp / unit.stats.maxHp >= threshold) return null;
  const itemId =
    (inventory["potion"] ?? 0) > 0
      ? "potion"
      : (inventory["hiPotion"] ?? 0) > 0
        ? "hiPotion"
        : null;
  if (!itemId) return null;
  const item = getItem(itemId);
  const res = resolveItem(unit, "healHp", item.amount);
  if (!res) return null;
  inventory[itemId] = (inventory[itemId] ?? 0) - 1;
  return res;
}

export function addStatus(unit: Unit, status: ActiveStatus): void {
  const existing = unit.statuses.find((s) => s.kind === status.kind);
  if (existing) existing.turnsLeft = Math.max(existing.turnsLeft, status.turnsLeft);
  else unit.statuses.push({ ...status });
}

/**
 * Process a unit's statuses at the end of its turn: apply damage/heal-over-time
 * (Poison, Regen), then reduce every status by one turn and drop expired ones.
 * Returns the HP-change results so the caller can show popups / detect a death.
 */
export function tickStatuses(unit: Unit): HitResult[] {
  const out: HitResult[] = [];
  for (const s of unit.statuses) {
    if (!unit.alive) break; // poison may have already killed the unit mid-loop
    if (s.kind === "poison") {
      const dmg = Math.max(1, Math.round(unit.stats.maxHp * POISON_FRAC));
      const { killed } = dealDamage(unit, dmg);
      out.push({ unitId: unit.id, kind: "damage", amount: dmg, crit: false, killed, revived: false, status: "poison" });
    } else if (s.kind === "regen" && unit.stats.hp < unit.stats.maxHp) {
      const before = unit.stats.hp;
      healHp(unit, Math.max(1, Math.round(unit.stats.maxHp * REGEN_FRAC)));
      out.push({ unitId: unit.id, kind: "heal", amount: unit.stats.hp - before, crit: false, killed: false, revived: false, status: "regen" });
    }
  }
  unit.statuses = unit.statuses
    .map((s) => ({ ...s, turnsLeft: s.turnsLeft - 1 }))
    .filter((s) => s.turnsLeft > 0);
  return out;
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
  ctx?: AttackContext,
): HitResult | null {
  const power = skill.scaling === "magical" ? caster.stats.mag : caster.stats.atk;

  switch (skill.effect) {
    case "damage": {
      if (!target.alive) return null;
      let base = Math.max(1, (power * skill.power) / 10 - (skill.scaling === "magical" ? target.stats.res : effectiveDef(target)));
      base *= positionalDamageMult(caster, target, skill.scaling, ctx);
      base *= defenseDamageMult(target, skill.scaling);
      base *= elementDamageMult(target, skill.element);
      base = Math.max(1, base);
      const critChance = CRIT_CHANCE + positionalCritBonus(caster, target, skill.scaling, ctx);
      const { value, crit } = applyVarianceAndCrit(base, rng, skill.scaling === "physical", critChance);
      const { killed } = dealDamage(target, value);
      return { unitId: target.id, kind: "damage", amount: value, crit, killed, revived: false };
    }
    case "heal": {
      if (!target.alive) return null;
      const base = (power * skill.power) / 10;
      const value = Math.max(1, Math.round(base));
      const before = target.stats.hp;
      healHp(target, value);
      // Report the real HP restored (clamped at maxHp), matching resolveItem, so
      // the floating popup is honest instead of showing the full rolled value.
      return { unitId: target.id, kind: "heal", amount: target.stats.hp - before, crit: false, killed: false, revived: false };
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
      addStatus(target, { kind: skill.statusKind, turnsLeft: skill.statusDuration ?? 2 });
      return { unitId: target.id, kind: "status", amount: 0, crit: false, killed: false, revived: false, status: skill.statusKind };
    }
    case "debuff": {
      if (!target.alive || !skill.statusKind) return null;
      addStatus(target, { kind: skill.statusKind, turnsLeft: skill.statusDuration ?? 3 });
      return { unitId: target.id, kind: "status", amount: 0, crit: false, killed: false, revived: false, status: skill.statusKind };
    }
  }
}

/**
 * Apply the terrain's per-turn HP effect (lava damage, spring heal) to a unit
 * that just ended its turn on that tile. Returns null if no effect applies
 * (terrain is neutral, unit is dead, or healer is already at full HP).
 * Called after tickStatuses so status ticks happen first.
 */
export function applyTerrainEffect(unit: Unit, terrain: TerrainType): HitResult | null {
  if (!unit.alive) return null;
  const eff = terrainEffect(terrain);
  if (!eff) return null;
  if (eff.kind === "damage") {
    const dmg = Math.max(1, Math.round(unit.stats.maxHp * eff.fracMaxHp));
    const { killed } = dealDamage(unit, dmg);
    return { unitId: unit.id, kind: "damage", amount: dmg, crit: false, killed, revived: false };
  } else {
    // heal
    if (unit.stats.hp >= unit.stats.maxHp) return null;
    const before = unit.stats.hp;
    healHp(unit, Math.max(1, Math.round(unit.stats.maxHp * eff.fracMaxHp)));
    return { unitId: unit.id, kind: "heal", amount: unit.stats.hp - before, crit: false, killed: false, revived: false };
  }
}

// A fall hurts only past a meaningful ledge, scaling with how far the unit drops.
const FALL_THRESHOLD = 2; // levels of height drop before a fall deals damage
const FALL_FRAC_PER_LEVEL = 0.08; // maxHp fraction lost per level dropped

/**
 * Damage from being knocked off a ledge: `heightDrop` is the origin tile height
 * minus the landing tile height (in level units). Returns null if the drop is
 * below the threshold or the unit is already down.
 */
export function fallDamage(unit: Unit, heightDrop: number): HitResult | null {
  if (!unit.alive || heightDrop < FALL_THRESHOLD) return null;
  const dmg = Math.max(1, Math.round(unit.stats.maxHp * FALL_FRAC_PER_LEVEL * heightDrop));
  const { killed } = dealDamage(unit, dmg);
  return { unitId: unit.id, kind: "damage", amount: dmg, crit: false, killed, revived: false };
}

/** Restore HP/MP/revive, or grant a buff, from a consumable item. */
export function resolveItem(
  target: Unit,
  effect: ItemEffect,
  amount: number,
  statusKind?: StatusKind,
  statusDuration?: number,
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
    case "buff": {
      if (!target.alive || !statusKind) return null;
      addStatus(target, { kind: statusKind, turnsLeft: statusDuration ?? 3 });
      return { unitId: target.id, kind: "status", amount: 0, crit: false, killed: false, revived: false, status: statusKind };
    }
  }
}
