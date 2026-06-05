import { describe, it, expect } from "vitest";
import type { Unit } from "../src/core/types";
import { RNG } from "../src/core/rng";
import { createUnit } from "../src/core/unit";
import { createStartingParty } from "../src/data/party";
import { Grid, samePoint } from "../src/battle/grid";
import { aoeTiles } from "../src/battle/targeting";
import { resolveCounterAttack, resolveSkillOnTarget, resolveWeaponAttack } from "../src/battle/combat";
import { advanceToNextActor, battleWinner, endTurn, evaluateOutcome } from "../src/battle/turnManager";
import { planEnemyTurn } from "../src/battle/ai";
import { getWeapon } from "../src/data/weapons";
import { getSkill } from "../src/data/skills";
import { PHASES } from "../src/data/maps";

/**
 * Drives a full auto-battle: both teams act via the AI policy. Proves the whole
 * battle loop (turn order + pathfinding + combat + AI + win detection) runs end
 * to end without crashing and terminates with a winner, holding HP/stat
 * invariants every turn.
 */
function buildUnits(mapIndex: number): { grid: Grid; units: Unit[] } {
  const map = PHASES[mapIndex];
  const grid = new Grid(map);
  const units: Unit[] = [];
  const party = createStartingParty();
  party.forEach((u, i) => {
    const spawn = map.playerSpawns[i];
    if (!spawn) return;
    u.pos = { ...spawn };
    u.ct = 0;
    units.push(u);
  });
  for (const e of map.enemies) {
    units.push(
      createUnit({
        name: e.name,
        team: "enemy",
        classId: e.classId,
        level: e.level,
        pos: e.pos,
        weaponId: e.weaponId,
        learnedSkillIds: e.skillIds ?? [],
      }),
    );
  }
  return { grid, units };
}

function applyPlan(unit: Unit, units: Unit[], grid: Grid, rng: RNG): void {
  const plan = planEnemyTurn(unit, units, grid);
  // Path must start at the unit's current position.
  expect(samePoint(plan.path[0], unit.pos)).toBe(true);
  if (plan.path.length > 1) {
    unit.pos = { ...plan.destination };
  }
  if (plan.action.kind === "attack" && plan.action.targetTile) {
    const target = units.find((u) => u.alive && samePoint(u.pos, plan.action.targetTile!));
    if (target && target.team !== unit.team) {
      const weapon = getWeapon(unit.weaponId);
      resolveWeaponAttack(unit, target, weapon, rng);
      // Melee provokes a counter from a surviving defender.
      if (weapon.range === 1) resolveCounterAttack(target, unit, getWeapon(target.weaponId), rng);
    }
  } else if (plan.action.kind === "skill" && plan.action.skillId && plan.action.targetTile) {
    const skill = getSkill(plan.action.skillId);
    const affected = aoeTiles(grid, plan.action.targetTile, skill.aoe)
      .map((t) => units.find((u) => samePoint(u.pos, t)))
      .filter((u): u is Unit => !!u);
    const offensive = skill.effect === "damage" || skill.effect === "debuff";
    for (const target of affected) {
      if (offensive && target.team === unit.team) continue;
      if (!offensive && target.team !== unit.team) continue;
      resolveSkillOnTarget(unit, target, skill, rng);
    }
  }
}

function assertInvariants(units: Unit[]): void {
  for (const u of units) {
    expect(Number.isFinite(u.stats.hp)).toBe(true);
    expect(u.stats.hp).toBeGreaterThanOrEqual(0);
    expect(u.stats.hp).toBeLessThanOrEqual(u.stats.maxHp);
    expect(u.stats.mp).toBeGreaterThanOrEqual(0);
    expect(u.stats.mp).toBeLessThanOrEqual(u.stats.maxMp);
    if (u.stats.hp === 0) expect(u.alive).toBe(false);
  }
}

describe("full battle simulation (AI vs AI)", () => {
  for (let phase = 0; phase < PHASES.length; phase++) {
    it(`phase ${phase + 1} runs to a decisive winner without crashing`, () => {
      const rng = new RNG(0xc0ffee + phase * 101);
      const objective = PHASES[phase].objective;
      const { grid, units } = buildUnits(phase);
      expect(units.length).toBeGreaterThan(2);

      let turns = 0;
      const CAP = 5000;
      let winner = evaluateOutcome(units, objective, turns);
      while (!winner && turns < CAP) {
        const active = advanceToNextActor(units);
        expect(active).not.toBeNull();
        if (!active) break;
        applyPlan(active, units, grid, rng);
        endTurn(active);
        assertInvariants(units);
        turns++;
        winner = evaluateOutcome(units, objective, turns);
      }

      expect(turns).toBeLessThan(CAP); // it actually terminated
      expect(winner === "player" || winner === "enemy").toBe(true);
      // Someone died for the battle to end.
      expect(units.some((u) => !u.alive)).toBe(true);
    });
  }

  it("advanceToNextActor returns null when one side is wiped", () => {
    const { units } = buildUnits(0);
    for (const u of units) {
      if (u.team === "enemy") {
        u.alive = false;
        u.stats.hp = 0;
      }
    }
    expect(battleWinner(units)).toBe("player");
  });
});
