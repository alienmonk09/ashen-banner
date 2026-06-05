import { describe, it, expect } from "vitest";
import { partyAverageLevel, enemyTierOffset, enemyLevelFor } from "../src/core/state";
import { createUnit } from "../src/core/unit";
import { createStartingParty } from "../src/data/party";
import { forecastWeapon, forecastSkill } from "../src/battle/forecast";
import { getWeapon } from "../src/data/weapons";
import { getSkill } from "../src/data/skills";
import { PHASES } from "../src/data/maps";
import type { Unit } from "../src/core/types";

describe("partyAverageLevel", () => {
  it("floors an empty party at 1", () => {
    expect(partyAverageLevel([])).toBe(1);
  });
  it("returns a lone member's level", () => {
    expect(partyAverageLevel([{ level: 4 }])).toBe(4);
  });
  it("rounds the mean", () => {
    expect(partyAverageLevel([{ level: 1 }, { level: 2 }])).toBe(2); // 1.5 → 2
    expect(partyAverageLevel([{ level: 3 }, { level: 4 }, { level: 4 }])).toBe(4); // 3.67 → 4
  });
});

describe("enemyTierOffset", () => {
  it("is 0 for the map's weakest tier", () => {
    expect(enemyTierOffset(6, 6)).toBe(0);
  });
  it("rises with the authored spread", () => {
    expect(enemyTierOffset(7, 6)).toBe(1);
    expect(enemyTierOffset(9, 6)).toBe(3);
  });
  it("clamps the spread at +3 (a finale boss, not more)", () => {
    expect(enemyTierOffset(14, 11)).toBe(3);
    expect(enemyTierOffset(20, 1)).toBe(3);
  });
  it("never goes negative", () => {
    expect(enemyTierOffset(4, 6)).toBe(0);
  });
});

describe("enemies scale to the party (slightly weaker, boss keeps bite)", () => {
  it("seats grunts below the party and lets a finale boss tower on Normal", () => {
    const partyAvg = 8;
    // Phase 5 (finale): grunts authored at 11 (map min), boss at 14.
    const map = PHASES[6];
    const mapMin = Math.min(...map.enemies.map((e) => e.level));
    const levels = map.enemies.map((e) => enemyLevelFor(partyAvg, enemyTierOffset(e.level, mapMin), "normal", 0));
    const grunt = Math.min(...levels);
    const boss = Math.max(...levels);
    expect(grunt).toBeLessThan(partyAvg); // grunts are a notch below the party
    expect(boss).toBeGreaterThan(partyAvg); // the boss still towers (party+2)
    expect(boss).toBe(partyAvg + 2);
  });

  it("every campaign map keeps the bulk of foes at or below the party on Normal", () => {
    const partyAvg = 6;
    for (const map of PHASES) {
      const mapMin = Math.min(...map.enemies.map((e) => e.level));
      const levels = map.enemies.map((e) => enemyLevelFor(partyAvg, enemyTierOffset(e.level, mapMin), "normal", 0));
      const atOrBelow = levels.filter((l) => l <= partyAvg).length;
      // A clear majority of each map's foes are not above the party.
      expect(atOrBelow / levels.length).toBeGreaterThanOrEqual(0.5);
    }
  });
});

describe("winnability: the party out-trades phase-2 foes (the reported wall)", () => {
  it("every phase-2 enemy has a favorable party answer at a plausible level", () => {
    const map = PHASES[1];
    const partyLvl = 2;
    const party = createStartingParty().map((p) =>
      createUnit({ name: p.name, team: "player", classId: p.classId, raceId: p.raceId, level: partyLvl, pos: { x: 0, y: 0 }, weaponId: p.weaponId, learnedSkillIds: p.learnedSkillIds }),
    );
    const mapMin = Math.min(...map.enemies.map((e) => e.level));
    const enemies = map.enemies.map((e) =>
      createUnit({ name: e.name, team: "enemy", classId: e.classId, raceId: e.raceId, level: enemyLevelFor(partyLvl, enemyTierOffset(e.level, mapMin), "normal", 0), pos: { x: 0, y: 0 }, weaponId: e.weaponId }),
    );
    const bestDmg = (atk: Unit, def: Unit): number => {
      let best = forecastWeapon(atk, def, getWeapon(atk.weaponId)).amount;
      for (const id of atk.learnedSkillIds) {
        const sk = getSkill(id);
        if (sk.effect === "damage") best = Math.max(best, forecastSkill(atk, def, sk).amount);
      }
      return best;
    };
    const htk = (atk: Unit, def: Unit) => (bestDmg(atk, def) > 0 ? Math.ceil(def.stats.maxHp / bestDmg(atk, def)) : Infinity);
    for (const e of enemies) {
      // At least one party member kills this enemy no slower than it kills them.
      const favorable = party.some((p) => htk(p, e) <= htk(e, p));
      expect(favorable).toBe(true);
    }
  });
});
