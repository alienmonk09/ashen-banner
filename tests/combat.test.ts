import { describe, it, expect } from "vitest";
import {
  effectiveDef,
  effectiveSpd,
  resolveWeaponAttack,
  resolveSkillOnTarget,
  resolveItem,
  resolveCounterAttack,
  addStatus,
  tickStatuses,
} from "../src/battle/combat";
import { createUnit } from "../src/core/unit";
import { RNG } from "../src/core/rng";
import { getWeapon } from "../src/data/weapons";
import { getSkill } from "../src/data/skills";
import type { SkillDef, Unit, WeaponDef } from "../src/core/types";

/**
 * Deterministic RNG stub: `next()` walks a scripted sequence so we can pin the
 * exact variance roll and force/deny a crit. `chance(p)` reuses `next()` exactly
 * like the real RNG (`next() < p`), so the script must account for both draws.
 */
class ScriptedRNG {
  private i = 0;
  constructor(private readonly seq: number[]) {}
  next(): number {
    const v = this.seq[Math.min(this.i, this.seq.length - 1)];
    this.i++;
    return v;
  }
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
}

function knight(overrides: Partial<Parameters<typeof createUnit>[0]> = {}): Unit {
  return createUnit({
    name: "K",
    team: "player",
    classId: "knight",
    pos: { x: 0, y: 0 },
    ...overrides,
  });
}

function whiteMage(overrides: Partial<Parameters<typeof createUnit>[0]> = {}): Unit {
  return createUnit({
    name: "W",
    team: "player",
    classId: "whiteMage",
    pos: { x: 1, y: 0 },
    ...overrides,
  });
}

function enemyKnight(overrides: Partial<Parameters<typeof createUnit>[0]> = {}): Unit {
  return createUnit({
    name: "E",
    team: "enemy",
    classId: "knight",
    pos: { x: 2, y: 0 },
    ...overrides,
  });
}

describe("effectiveDef", () => {
  it("returns base def when not guarding", () => {
    const u = knight();
    expect(effectiveDef(u)).toBe(u.stats.def);
  });

  it("raises def by 50% (rounded) while guarding", () => {
    const u = knight();
    u.stats.def = 12;
    u.statuses.push({ kind: "guard", turnsLeft: 2 });
    expect(effectiveDef(u)).toBe(18); // round(12 * 1.5)
  });

  it("rounds the guard bonus", () => {
    const u = knight();
    u.stats.def = 11;
    u.statuses.push({ kind: "guard", turnsLeft: 1 });
    expect(effectiveDef(u)).toBe(Math.round(11 * 1.5)); // 17 (16.5 -> 17)
  });

  it("ignores non-guard statuses", () => {
    const u = knight();
    u.stats.def = 10;
    u.statuses.push({ kind: "slow", turnsLeft: 2 });
    expect(effectiveDef(u)).toBe(10);
  });
});

describe("resolveCounterAttack", () => {
  it("counters a melee attacker when able", () => {
    const defender = knight({ pos: { x: 0, y: 0 } });
    const attacker = enemyKnight({ pos: { x: 1, y: 0 } });
    const sword = getWeapon("sword");
    const result = resolveCounterAttack(defender, attacker, sword, new RNG(1));
    expect(result).not.toBeNull();
  });

  it("does not counter while stopped", () => {
    const defender = knight({ pos: { x: 0, y: 0 } });
    const attacker = enemyKnight({ pos: { x: 1, y: 0 } });
    addStatus(defender, { kind: "stop", turnsLeft: 2 });
    const sword = getWeapon("sword");
    const result = resolveCounterAttack(defender, attacker, sword, new RNG(1));
    expect(result).toBeNull();
  });
});

describe("effectiveSpd", () => {
  it("returns base spd when no status", () => {
    const u = knight();
    expect(effectiveSpd(u)).toBe(u.stats.spd);
  });

  it("halves spd (rounded) while slowed", () => {
    const u = knight();
    u.stats.spd = 10;
    u.statuses.push({ kind: "slow", turnsLeft: 3 });
    expect(effectiveSpd(u)).toBe(5); // round(10 * 0.5)
  });

  it("boosts spd by 50% (rounded) while hasted", () => {
    const u = knight();
    u.stats.spd = 10;
    u.statuses.push({ kind: "haste", turnsLeft: 2 });
    expect(effectiveSpd(u)).toBe(15); // round(10 * 1.5)
  });

  it("never returns below 1, even when slowed to zero", () => {
    const u = knight();
    u.stats.spd = 1;
    u.statuses.push({ kind: "slow", turnsLeft: 2 });
    // round(1 * 0.5) = round(0.5) = 1 here, but clamp guarantees >= 1 regardless
    expect(effectiveSpd(u)).toBeGreaterThanOrEqual(1);
  });

  it("clamps to 1 when slow rounds down to 0", () => {
    const u = knight();
    u.stats.spd = 0; // round(0) = 0 -> clamped to 1
    u.statuses.push({ kind: "slow", turnsLeft: 2 });
    expect(effectiveSpd(u)).toBe(1);
  });

  it("haste replaces slow (mutually exclusive) — full speed boost, no x0.75 muddle", () => {
    const u = knight();
    u.stats.spd = 10;
    addStatus(u, { kind: "slow", turnsLeft: 2 });
    addStatus(u, { kind: "haste", turnsLeft: 2 });
    expect(u.statuses.some((s) => s.kind === "slow")).toBe(false);
    expect(effectiveSpd(u)).toBe(15); // round(10 * 1.5), not round(10*0.5*1.5)=8
  });

  it("slow replaces haste (mutually exclusive)", () => {
    const u = knight();
    u.stats.spd = 10;
    addStatus(u, { kind: "haste", turnsLeft: 2 });
    addStatus(u, { kind: "slow", turnsLeft: 2 });
    expect(u.statuses.some((s) => s.kind === "haste")).toBe(false);
    expect(effectiveSpd(u)).toBe(5); // round(10 * 0.5)
  });
});

describe("resolveWeaponAttack", () => {
  it("reduces target HP by at least 1", () => {
    const attacker = knight();
    const target = enemyKnight();
    const before = target.stats.hp;
    const res = resolveWeaponAttack(attacker, target, getWeapon("sword"), new RNG(123));
    expect(res.kind).toBe("damage");
    expect(res.amount).toBeGreaterThanOrEqual(1);
    expect(target.stats.hp).toBeLessThan(before);
    expect(before - target.stats.hp).toBe(res.amount);
  });

  it("deals at least 1 damage even when def exceeds power", () => {
    const attacker = knight();
    attacker.stats.atk = 1;
    const target = enemyKnight();
    target.stats.def = 999;
    const before = target.stats.hp;
    const res = resolveWeaponAttack(attacker, target, getWeapon("sword"), new RNG(7));
    expect(res.amount).toBeGreaterThanOrEqual(1);
    expect(target.stats.hp).toBe(before - res.amount);
  });

  it("kills target and sets alive=false + killed when HP hits 0", () => {
    const attacker = knight();
    const target = enemyKnight();
    target.stats.hp = 1; // any damage >= 1 kills
    const res = resolveWeaponAttack(attacker, target, getWeapon("sword"), new RNG(42));
    expect(target.stats.hp).toBe(0);
    expect(target.alive).toBe(false);
    expect(res.killed).toBe(true);
  });

  it("clears statuses on the unit it kills", () => {
    const attacker = knight();
    const target = enemyKnight();
    target.stats.hp = 1;
    target.statuses.push({ kind: "guard", turnsLeft: 2 });
    resolveWeaponAttack(attacker, target, getWeapon("sword"), new RNG(99));
    expect(target.alive).toBe(false);
    expect(target.statuses).toEqual([]);
  });

  it("does not flag killed on a non-lethal hit", () => {
    const attacker = knight();
    const target = enemyKnight(); // full HP, sword can't one-shot
    const res = resolveWeaponAttack(attacker, target, getWeapon("sword"), new RNG(1));
    expect(res.killed).toBe(false);
    expect(target.alive).toBe(true);
    expect(target.stats.hp).toBeGreaterThan(0);
  });

  it("uses MAG for magical weapons", () => {
    const attacker = createUnit({
      name: "BM",
      team: "player",
      classId: "blackMage",
      pos: { x: 0, y: 0 },
    });
    attacker.stats.mag = 50;
    attacker.stats.atk = 0;
    const target = enemyKnight();
    target.stats.def = 0;
    target.stats.res = 0;
    const before = target.stats.hp;
    const res = resolveWeaponAttack(attacker, target, getWeapon("rod"), new RNG(5));
    // base ~ 50 + 3 = 53, so clearly driven by MAG not ATK(0)
    expect(res.amount).toBeGreaterThan(10);
    expect(target.stats.hp).toBe(before - res.amount);
  });

  it("is deterministic for a fixed seed", () => {
    const mk = () => ({ a: knight(), t: enemyKnight() });
    const one = mk();
    const two = mk();
    const r1 = resolveWeaponAttack(one.a, one.t, getWeapon("sword"), new RNG(2024));
    const r2 = resolveWeaponAttack(two.a, two.t, getWeapon("sword"), new RNG(2024));
    expect(r1.amount).toBe(r2.amount);
    expect(r1.crit).toBe(r2.crit);
  });

  it("honors elemental affinity: weak target takes more than a resistant one", () => {
    // A fire-element magical weapon (no crit, so the same seed yields the same
    // variance roll for both targets — isolating the elemental multiplier).
    const fireRod: WeaponDef = { ...getWeapon("rod"), element: "fire" };
    const attacker = createUnit({ name: "BM", team: "player", classId: "blackMage", pos: { x: 0, y: 0 } });
    attacker.stats.mag = 80;
    // Elf is weak to fire (×1.5); dwarf resists it (×0.5).
    const weak = createUnit({ name: "Elf", team: "enemy", classId: "knight", raceId: "elf", pos: { x: 2, y: 0 } });
    const resistant = createUnit({ name: "Dwarf", team: "enemy", classId: "knight", raceId: "dwarf", pos: { x: 2, y: 0 } });
    // Zero def/res on both so the elemental multiplier is the ONLY difference
    // (races also carry def/hp mods that would otherwise confound the comparison).
    weak.stats.def = 0;
    weak.stats.res = 0;
    resistant.stats.def = 0;
    resistant.stats.res = 0;
    const weakRes = resolveWeaponAttack(attacker, weak, fireRod, new RNG(7));
    const resistRes = resolveWeaponAttack(attacker, resistant, fireRod, new RNG(7));
    expect(weakRes.amount).toBeGreaterThan(resistRes.amount);
  });
});

describe("resolveSkillOnTarget - damage", () => {
  it("deals damage to a living enemy", () => {
    const caster = knight();
    const target = enemyKnight();
    const before = target.stats.hp;
    const res = resolveSkillOnTarget(caster, target, getSkill("powerStrike"), new RNG(11));
    expect(res).not.toBeNull();
    expect(res!.kind).toBe("damage");
    expect(res!.amount).toBeGreaterThanOrEqual(1);
    expect(target.stats.hp).toBe(before - res!.amount);
  });

  it("returns null when the damage target is dead", () => {
    const caster = knight();
    const target = enemyKnight();
    target.alive = false;
    target.stats.hp = 0;
    const res = resolveSkillOnTarget(caster, target, getSkill("powerStrike"), new RNG(3));
    expect(res).toBeNull();
    expect(target.stats.hp).toBe(0);
  });

  it("kills and sets killed when damage skill drops HP to 0", () => {
    const caster = knight();
    const target = enemyKnight();
    target.stats.hp = 1;
    const res = resolveSkillOnTarget(caster, target, getSkill("powerStrike"), new RNG(8));
    expect(res!.killed).toBe(true);
    expect(target.alive).toBe(false);
    expect(target.stats.hp).toBe(0);
  });
});

/**
 * Regression lock on the exact composed damage multiplier. facing × Protect ×
 * element-weakness × crit all stack multiplicatively in resolveSkillOnTarget;
 * the individual factors are tested elsewhere, but nothing pinned their exact
 * PRODUCT through the live damage path. A deterministic RNG removes variance and
 * forces (or denies) the crit so the number is fully determined.
 *
 * Fixture (physical damage skill, power 10, attacker ATK 100, def 0):
 *   base       = (100 * 10) / 10 - 0           = 100
 *   × rear     = 1.25                          -> 125
 *   × Protect  = 0.75 (physical)               -> 93.75
 *   × weakness = 1.5 (elf vs fire)             -> 140.625
 *   × variance = 1.0 (roll 0.5)                -> 140.625
 *   × crit     = 1.5                           -> 210.9375 -> round 211
 *   (non-crit: round(140.625)                  -> 141)
 */
describe("resolveSkillOnTarget - composed multiplier (facing × defense × element × crit)", () => {
  const composedSkill: SkillDef = {
    id: "testComposed",
    name: "Test Composed",
    description: "fixture",
    mpCost: 0,
    spCost: 0,
    range: 1,
    aoe: "single",
    power: 10,
    element: "fire",
    effect: "damage",
    scaling: "physical",
  };

  function fixture(): { caster: Unit; target: Unit; ctx: { fromPos: { x: number; y: number } } } {
    const caster = knight({ pos: { x: 0, y: -2 } });
    caster.stats.atk = 100;
    const target = enemyKnight({ pos: { x: 0, y: 0 }, raceId: "elf" }); // weak to fire, faces south by default
    target.stats.def = 0;
    addStatus(target, { kind: "protect", turnsLeft: 3 }); // physical -25%
    // Attacker is due north of a south-facing target -> rear hit (×1.25).
    return { caster, target, ctx: { fromPos: { x: 0, y: -2 } } };
  }

  it("pins the exact NON-crit composed product (1.25 × 0.75 × 1.5)", () => {
    const { caster, target, ctx } = fixture();
    // Script: variance roll 0.5 (neutral), then crit draw 0.99 -> no crit.
    const res = resolveSkillOnTarget(caster, target, composedSkill, new ScriptedRNG([0.5, 0.99]) as unknown as RNG, ctx);
    expect(res!.crit).toBe(false);
    expect(res!.amount).toBe(141); // round(100 × 1.25 × 0.75 × 1.5)
  });

  it("pins the exact CRIT composed product (1.25 × 0.75 × 1.5 × 1.5)", () => {
    const { caster, target, ctx } = fixture();
    // Script: variance roll 0.5 (neutral), then crit draw 0 -> crit fires.
    const res = resolveSkillOnTarget(caster, target, composedSkill, new ScriptedRNG([0.5, 0]) as unknown as RNG, ctx);
    expect(res!.crit).toBe(true);
    expect(res!.amount).toBe(211); // round(100 × 1.25 × 0.75 × 1.5 × 1.5)
  });
});

describe("resolveSkillOnTarget - heal", () => {
  it("heals a living ally and clamps at maxHp", () => {
    const caster = whiteMage();
    const target = knight();
    target.stats.maxHp = 100;
    target.stats.hp = 99; // big cure should clamp at 100
    const res = resolveSkillOnTarget(caster, target, getSkill("cure"), new RNG(4));
    expect(res).not.toBeNull();
    expect(res!.kind).toBe("heal");
    expect(target.stats.hp).toBe(100);
    expect(target.stats.hp).toBeLessThanOrEqual(target.stats.maxHp);
  });

  it("reports the real HP restored (clamped), not the full rolled amount", () => {
    const caster = whiteMage();
    const target = knight();
    target.stats.maxHp = 100;
    target.stats.hp = 99; // only 1 HP missing — a big cure must report +1, not its roll
    const res = resolveSkillOnTarget(caster, target, getSkill("cure"), new RNG(4));
    expect(res!.amount).toBe(1);
    expect(target.stats.hp).toBe(100);
  });

  it("restores HP when below max without exceeding it", () => {
    const caster = whiteMage();
    const target = knight();
    target.stats.maxHp = 1000;
    target.stats.hp = 10;
    const res = resolveSkillOnTarget(caster, target, getSkill("cure"), new RNG(6));
    expect(res!.amount).toBeGreaterThanOrEqual(1);
    expect(target.stats.hp).toBe(10 + res!.amount);
    expect(target.stats.hp).toBeLessThanOrEqual(target.stats.maxHp);
  });

  it("returns null when healing a dead target", () => {
    const caster = whiteMage();
    const target = knight();
    target.alive = false;
    target.stats.hp = 0;
    const res = resolveSkillOnTarget(caster, target, getSkill("cure"), new RNG(2));
    expect(res).toBeNull();
    expect(target.stats.hp).toBe(0);
  });
});

describe("resolveSkillOnTarget - revive", () => {
  it("revives a dead target, setting alive and some HP", () => {
    const caster = whiteMage();
    const target = knight();
    target.alive = false;
    target.stats.hp = 0;
    const res = resolveSkillOnTarget(caster, target, getSkill("raise"), new RNG(9));
    expect(res).not.toBeNull();
    expect(res!.kind).toBe("revive");
    expect(res!.revived).toBe(true);
    expect(target.alive).toBe(true);
    expect(target.stats.hp).toBeGreaterThanOrEqual(1);
    expect(target.stats.hp).toBeLessThanOrEqual(target.stats.maxHp);
  });

  it("clamps revive HP at maxHp", () => {
    const caster = whiteMage();
    caster.stats.mag = 100000; // huge -> revive value would exceed maxHp
    const target = knight();
    target.stats.maxHp = 5;
    target.alive = false;
    target.stats.hp = 0;
    resolveSkillOnTarget(caster, target, getSkill("raise"), new RNG(1));
    expect(target.stats.hp).toBe(5);
  });

  it("returns null and leaves a living target untouched", () => {
    const caster = whiteMage();
    const target = knight();
    target.stats.hp = 40;
    expect(target.alive).toBe(true);
    const res = resolveSkillOnTarget(caster, target, getSkill("raise"), new RNG(1));
    expect(res).toBeNull();
    expect(target.alive).toBe(true);
    expect(target.stats.hp).toBe(40);
  });
});

describe("resolveSkillOnTarget - buff/debuff", () => {
  it("buff adds the guard status to a living target", () => {
    const caster = knight();
    const target = knight();
    const res = resolveSkillOnTarget(caster, target, getSkill("guard"), new RNG(1));
    expect(res).not.toBeNull();
    expect(res!.kind).toBe("status");
    expect(res!.status).toBe("guard");
    expect(target.statuses.some((s) => s.kind === "guard")).toBe(true);
  });

  it("debuff adds the slow status to a living target", () => {
    const caster = createUnit({
      name: "A",
      team: "player",
      classId: "archer",
      pos: { x: 0, y: 0 },
    });
    const target = enemyKnight();
    const res = resolveSkillOnTarget(caster, target, getSkill("cripple"), new RNG(1));
    expect(res).not.toBeNull();
    expect(res!.kind).toBe("status");
    expect(res!.status).toBe("slow");
    expect(target.statuses.some((s) => s.kind === "slow")).toBe(true);
  });

  it("buff returns null on a dead target", () => {
    const caster = knight();
    const target = knight();
    target.alive = false;
    target.stats.hp = 0;
    const res = resolveSkillOnTarget(caster, target, getSkill("guard"), new RNG(1));
    expect(res).toBeNull();
    expect(target.statuses).toEqual([]);
  });

  it("debuff returns null on a dead target", () => {
    const caster = createUnit({
      name: "A",
      team: "player",
      classId: "archer",
      pos: { x: 0, y: 0 },
    });
    const target = enemyKnight();
    target.alive = false;
    target.stats.hp = 0;
    const res = resolveSkillOnTarget(caster, target, getSkill("cripple"), new RNG(1));
    expect(res).toBeNull();
  });
});

describe("resolveItem", () => {
  it("healHp restores HP and clamps at maxHp", () => {
    const target = knight();
    target.stats.maxHp = 100;
    target.stats.hp = 90;
    const res = resolveItem(target, "healHp", 50);
    expect(res).not.toBeNull();
    expect(res!.kind).toBe("heal");
    expect(target.stats.hp).toBe(100); // clamped, not 140
  });

  it("healHp adds the full amount when room remains", () => {
    const target = knight();
    target.stats.maxHp = 200;
    target.stats.hp = 50;
    resolveItem(target, "healHp", 30);
    expect(target.stats.hp).toBe(80);
  });

  it("healHp returns null on a dead target", () => {
    const target = knight();
    target.alive = false;
    target.stats.hp = 0;
    const res = resolveItem(target, "healHp", 50);
    expect(res).toBeNull();
    expect(target.stats.hp).toBe(0);
  });

  it("healMp restores MP and clamps at maxMp", () => {
    const target = whiteMage();
    target.stats.maxMp = 60;
    target.stats.mp = 50;
    const res = resolveItem(target, "healMp", 100);
    expect(res).not.toBeNull();
    expect(res!.kind).toBe("mp");
    expect(target.stats.mp).toBe(60); // clamped
  });

  it("healMp adds the full amount when room remains", () => {
    const target = whiteMage();
    target.stats.maxMp = 100;
    target.stats.mp = 10;
    resolveItem(target, "healMp", 25);
    expect(target.stats.mp).toBe(35);
  });

  it("healMp returns null on a dead target", () => {
    const target = whiteMage();
    target.alive = false;
    target.stats.hp = 0;
    const res = resolveItem(target, "healMp", 20);
    expect(res).toBeNull();
  });

  it("revive only works on a dead target and clamps HP at maxHp", () => {
    const target = knight();
    target.stats.maxHp = 30;
    target.alive = false;
    target.stats.hp = 0;
    const res = resolveItem(target, "revive", 100);
    expect(res).not.toBeNull();
    expect(res!.kind).toBe("revive");
    expect(res!.revived).toBe(true);
    expect(target.alive).toBe(true);
    expect(target.stats.hp).toBe(30); // clamped to maxHp
  });

  it("revive sets the given HP when below maxHp", () => {
    const target = knight();
    target.stats.maxHp = 100;
    target.alive = false;
    target.stats.hp = 0;
    resolveItem(target, "revive", 25);
    expect(target.alive).toBe(true);
    expect(target.stats.hp).toBe(25);
  });

  it("revive returns null on a living target and leaves it untouched", () => {
    const target = knight();
    target.stats.hp = 40;
    const res = resolveItem(target, "revive", 100);
    expect(res).toBeNull();
    expect(target.alive).toBe(true);
    expect(target.stats.hp).toBe(40);
  });
});

describe("addStatus", () => {
  it("adds a new status", () => {
    const u = knight();
    addStatus(u, { kind: "guard", turnsLeft: 2 });
    expect(u.statuses).toHaveLength(1);
    expect(u.statuses[0]).toEqual({ kind: "guard", turnsLeft: 2 });
  });

  it("does not duplicate an existing status of the same kind", () => {
    const u = knight();
    addStatus(u, { kind: "slow", turnsLeft: 2 });
    addStatus(u, { kind: "slow", turnsLeft: 3 });
    expect(u.statuses.filter((s) => s.kind === "slow")).toHaveLength(1);
  });

  it("refreshes to the longer remaining duration", () => {
    const u = knight();
    addStatus(u, { kind: "haste", turnsLeft: 1 });
    addStatus(u, { kind: "haste", turnsLeft: 5 });
    expect(u.statuses[0].turnsLeft).toBe(5);
  });

  it("keeps the longer duration when re-applied with a shorter one", () => {
    const u = knight();
    addStatus(u, { kind: "guard", turnsLeft: 4 });
    addStatus(u, { kind: "guard", turnsLeft: 1 });
    expect(u.statuses[0].turnsLeft).toBe(4);
  });

  it("tracks distinct kinds independently", () => {
    const u = knight();
    addStatus(u, { kind: "guard", turnsLeft: 2 });
    addStatus(u, { kind: "slow", turnsLeft: 3 });
    expect(u.statuses).toHaveLength(2);
  });

  it("copies the status rather than storing the passed reference", () => {
    const u = knight();
    const incoming = { kind: "guard" as const, turnsLeft: 2 };
    addStatus(u, incoming);
    incoming.turnsLeft = 99;
    expect(u.statuses[0].turnsLeft).toBe(2);
  });
});

describe("tickStatuses", () => {
  it("decrements remaining turns", () => {
    const u = knight();
    u.statuses.push({ kind: "guard", turnsLeft: 3 });
    tickStatuses(u);
    expect(u.statuses[0].turnsLeft).toBe(2);
  });

  it("drops a status when it expires", () => {
    const u = knight();
    u.statuses.push({ kind: "guard", turnsLeft: 1 });
    tickStatuses(u);
    expect(u.statuses).toHaveLength(0);
  });

  it("keeps surviving statuses and drops only the expired ones", () => {
    const u = knight();
    u.statuses.push({ kind: "guard", turnsLeft: 1 });
    u.statuses.push({ kind: "slow", turnsLeft: 2 });
    tickStatuses(u);
    expect(u.statuses).toHaveLength(1);
    expect(u.statuses[0].kind).toBe("slow");
    expect(u.statuses[0].turnsLeft).toBe(1);
  });

  it("is a no-op on a unit with no statuses", () => {
    const u = knight();
    tickStatuses(u);
    expect(u.statuses).toEqual([]);
  });

  it("expires a status over successive ticks", () => {
    const u = knight();
    u.statuses.push({ kind: "haste", turnsLeft: 2 });
    tickStatuses(u);
    expect(u.statuses[0].turnsLeft).toBe(1);
    tickStatuses(u);
    expect(u.statuses).toHaveLength(0);
  });

  describe("poison + regen on the same unit", () => {
    it("nets out to zero HP swing when starting at full HP (equal fractions)", () => {
      const u = knight();
      const tick = Math.round(u.stats.maxHp * 0.1); // POISON_FRAC === REGEN_FRAC
      expect(u.stats.hp).toBe(u.stats.maxHp);
      u.statuses.push({ kind: "poison", turnsLeft: 3 });
      u.statuses.push({ kind: "regen", turnsLeft: 3 });

      const results = tickStatuses(u);

      // Poison opens a gap, regen fills it back: same fraction → net zero.
      expect(tick).toBeGreaterThan(0);
      expect(u.stats.hp).toBe(u.stats.maxHp);
      expect(u.alive).toBe(true);

      // Two HP-change results, poison before regen (array iteration order).
      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({
        unitId: u.id,
        kind: "damage",
        amount: tick,
        status: "poison",
        killed: false,
        crit: false,
        revived: false,
      });
      expect(results[1]).toMatchObject({
        unitId: u.id,
        kind: "heal",
        amount: tick,
        status: "regen",
        killed: false,
        crit: false,
        revived: false,
      });
    });

    it("a lethal poison tick prevents regen from firing or appearing in the results", () => {
      const u = knight();
      const tick = Math.round(u.stats.maxHp * 0.1);
      u.stats.hp = tick; // poison tick is exactly lethal
      u.statuses.push({ kind: "poison", turnsLeft: 3 });
      u.statuses.push({ kind: "regen", turnsLeft: 3 });

      const results = tickStatuses(u);

      expect(u.alive).toBe(false);
      expect(u.stats.hp).toBe(0);
      // dealDamage clears statuses on death, so nothing survives to decrement.
      expect(u.statuses).toEqual([]);

      // Only the killing poison result — regen never ran, so no heal is reported.
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        kind: "damage",
        status: "poison",
        killed: true,
        amount: tick,
      });
      expect(results.some((r) => r.status === "regen")).toBe(false);
    });
  });
});