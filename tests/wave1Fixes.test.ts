import { describe, it, expect } from "vitest";
import {
  effectiveRes,
  effectiveDef,
  addStatus,
  resolveWeaponAttack,
  resolveSkillOnTarget,
  resolveItem,
} from "../src/battle/combat";
import { forecastSkill } from "../src/battle/forecast";
import { RNG } from "../src/core/rng";
import { createUnit } from "../src/core/unit";
import type { Unit } from "../src/core/types";
import { getWeapon } from "../src/data/weapons";
import { getSkill } from "../src/data/skills";

function mk(over: { team?: "player" | "enemy"; pos?: { x: number; y: number } } = {}): Unit {
  return createUnit({
    name: "U",
    team: over.team ?? "player",
    classId: "knight",
    pos: over.pos ?? { x: 0, y: 0 },
  });
}

describe("Guard now braces against magic too (effectiveRes)", () => {
  it("boosts RES by 50% while guarding, mirroring effectiveDef", () => {
    const u = mk();
    u.stats.res = 10;
    u.stats.def = 10;
    expect(effectiveRes(u)).toBe(10);
    addStatus(u, { kind: "guard", turnsLeft: 2 });
    expect(effectiveRes(u)).toBe(15);
    // Guard still helps physical defense as before.
    expect(effectiveDef(u)).toBe(15);
  });

  it("reduces incoming magical skill damage when the target is guarding", () => {
    const caster = mk({ team: "player", pos: { x: 0, y: 0 } });
    caster.stats.mag = 20;
    const fire = getSkill("fire"); // magical-scaling damage skill
    const exposed = mk({ team: "enemy", pos: { x: 1, y: 0 } });
    exposed.stats.res = 6;
    const guarded = mk({ team: "enemy", pos: { x: 2, y: 0 } });
    guarded.stats.res = 6;
    addStatus(guarded, { kind: "guard", turnsLeft: 2 });
    const open = forecastSkill(caster, exposed, fire).amount;
    const braced = forecastSkill(caster, guarded, fire).amount;
    expect(braced).toBeLessThan(open);
  });
});

describe("charged-skill state never orphans onto a corpse", () => {
  it("clears charging when the unit is felled by damage", () => {
    const attacker = mk({ team: "player", pos: { x: 0, y: 0 } });
    attacker.stats.atk = 999; // guarantee a kill
    const victim = mk({ team: "enemy", pos: { x: 1, y: 0 } });
    victim.stats.hp = 1;
    victim.charging = { skillId: "meteor", target: { x: 5, y: 5 }, turnsLeft: 1 };
    const res = resolveWeaponAttack(attacker, victim, getWeapon("sword"), new RNG(1));
    expect(res.killed).toBe(true);
    expect(victim.alive).toBe(false);
    expect(victim.charging).toBeUndefined();
  });

  it("clears charging when a fallen unit is revived by a skill", () => {
    const healer = mk({ team: "player" });
    healer.stats.mag = 20;
    const dead = mk({ team: "player", pos: { x: 1, y: 0 } });
    dead.alive = false;
    dead.stats.hp = 0;
    dead.charging = { skillId: "meteor", target: { x: 5, y: 5 }, turnsLeft: 1 };
    const raise = getSkill("raise");
    const res = resolveSkillOnTarget(healer, dead, raise, new RNG(1));
    expect(res?.revived).toBe(true);
    expect(dead.alive).toBe(true);
    expect(dead.charging).toBeUndefined();
  });

  it("clears charging when a fallen unit is revived by an item", () => {
    const dead = mk({ team: "player" });
    dead.alive = false;
    dead.stats.hp = 0;
    dead.charging = { skillId: "meteor", target: { x: 5, y: 5 }, turnsLeft: 1 };
    const res = resolveItem(dead, "revive", 20);
    expect(res?.revived).toBe(true);
    expect(dead.alive).toBe(true);
    expect(dead.charging).toBeUndefined();
  });
});
