import { describe, it, expect } from "vitest";
import type { MapDef } from "../src/core/types";
import { Grid } from "../src/battle/grid";
import { planEnemyTurn } from "../src/battle/ai";
import { createUnit } from "../src/core/unit";
import { getSkill } from "../src/data/skills";
import { CLASSES } from "../src/data/classes";

function flatMap(width: number, height: number): MapDef {
  return {
    id: "test",
    name: "Test",
    intro: "",
    width,
    height,
    heights: Array.from({ length: height }, () => Array(width).fill(0)),
    playerSpawns: [],
    enemies: [],
  };
}

describe("chargeTime — data", () => {
  it("meteor has chargeTime: 1", () => {
    const meteor = getSkill("meteor");
    expect(meteor.chargeTime).toBe(1);
  });

  it("meteor is a damage skill with square3 AoE", () => {
    const meteor = getSkill("meteor");
    expect(meteor.effect).toBe("damage");
    expect(meteor.aoe).toBe("square3");
    expect(meteor.element).toBe("none");
    expect(meteor.scaling).toBe("magical");
    expect(meteor.power).toBeGreaterThan(20);
  });

  it("meteor is in the Black Mage skillIds", () => {
    expect(CLASSES.blackMage.skillIds).toContain("meteor");
  });

  it("non-charged skills have no chargeTime", () => {
    const fire = getSkill("fire");
    expect(fire.chargeTime == null || fire.chargeTime === 0).toBe(true);
  });
});

describe("chargeTime — AI filter", () => {
  it("planEnemyTurn does NOT choose a charged skill as a skill action", () => {
    const grid = new Grid(flatMap(10, 10));

    // An enemy Black Mage that only knows meteor (charged) and has no weapon range.
    // It should fall back to a basic attack or move, never a 'skill' action with meteor.
    const enemy = createUnit({
      name: "DarkMage",
      team: "enemy",
      classId: "blackMage",
      pos: { x: 0, y: 0 },
      weaponId: "rod",
      learnedSkillIds: ["meteor"],
    });

    const player = createUnit({
      name: "Hero",
      team: "player",
      classId: "knight",
      pos: { x: 3, y: 3 },
      weaponId: "sword",
    });

    const plan = planEnemyTurn(enemy, [enemy, player], grid);

    // The AI must never select meteor as a skill action.
    if (plan.action.kind === "skill") {
      expect(plan.action.skillId).not.toBe("meteor");
    }
    // If no valid non-charged action is available the plan may be a move or wait,
    // but it must not be a charged skill cast.
    expect(
      plan.action.kind === "skill" && plan.action.skillId === "meteor",
    ).toBe(false);
  });

  it("planEnemyTurn CAN use an uncharged damage skill alongside meteor", () => {
    const grid = new Grid(flatMap(10, 10));

    // A Black Mage with both fire (instant) and meteor (charged).
    // The AI should be able to pick fire but never meteor.
    const enemy = createUnit({
      name: "DarkMage",
      team: "enemy",
      classId: "blackMage",
      pos: { x: 4, y: 4 },
      weaponId: "rod",
      learnedSkillIds: ["fire", "meteor"],
    });
    // Give it plenty of MP so fire is always affordable.
    enemy.stats.mp = 60;
    enemy.stats.maxMp = 60;

    const player = createUnit({
      name: "Hero",
      team: "player",
      classId: "knight",
      pos: { x: 5, y: 5 },
      weaponId: "sword",
    });

    const plan = planEnemyTurn(enemy, [enemy, player], grid);

    // Must never choose meteor.
    if (plan.action.kind === "skill") {
      expect(plan.action.skillId).not.toBe("meteor");
    }
  });
});
