import { describe, it, expect } from "vitest";
import {
  xpForKill,
  xpForFinisher,
  battleClearXp,
  grantXpTracked,
  KILL_FINISHER_BONUS,
  ACTION_XP_OFFENSIVE,
  ACTION_XP_SUPPORT,
} from "../src/core/progression";
import { createUnit, xpForLevel } from "../src/core/unit";
import type { Unit } from "../src/core/types";

const mk = (over: Partial<Parameters<typeof createUnit>[0]> = {}): Unit =>
  createUnit({ name: "U", team: "player", classId: "knight", pos: { x: 0, y: 0 }, ...over });

describe("xpForKill", () => {
  it("scales 12 + level*5", () => {
    expect(xpForKill(1)).toBe(17);
    expect(xpForKill(5)).toBe(37);
    expect(xpForKill(14)).toBe(82);
  });

  it("floors the level at 1 (never pays less than a level-1 kill)", () => {
    expect(xpForKill(0)).toBe(xpForKill(1));
    expect(xpForKill(-3)).toBe(xpForKill(1));
  });
});

describe("xpForFinisher", () => {
  it("adds the finisher bonus on top of the base kill share", () => {
    for (const lvl of [1, 5, 10, 14]) {
      expect(xpForFinisher(lvl)).toBe(Math.round(xpForKill(lvl) * (1 + KILL_FINISHER_BONUS)));
      expect(xpForFinisher(lvl)).toBeGreaterThan(xpForKill(lvl));
    }
  });
});

describe("action XP knobs", () => {
  it("offensive and support actions both pay a small flat amount", () => {
    expect(ACTION_XP_OFFENSIVE).toBeGreaterThan(0);
    expect(ACTION_XP_SUPPORT).toBeGreaterThan(0);
  });
});

describe("battleClearXp", () => {
  it("is a fixed grant that grows gently per chapter", () => {
    expect(battleClearXp(0)).toBe(40);
    expect(battleClearXp(4)).toBe(56);
    expect(battleClearXp(16)).toBe(104);
  });

  it("floors a negative phase at chapter 0", () => {
    expect(battleClearXp(-2)).toBe(battleClearXp(0));
  });
});

describe("grantXpTracked", () => {
  it("returns null and grants nothing for a non-positive amount", () => {
    const u = mk();
    expect(grantXpTracked(u, 0)).toBeNull();
    expect(grantXpTracked(u, -5)).toBeNull();
    expect(u.xp).toBe(0);
  });

  it("returns null when XP is gained but no level is crossed", () => {
    const u = mk();
    const need = xpForLevel(u.level);
    const info = grantXpTracked(u, need - 1);
    expect(info).toBeNull();
    expect(u.xp).toBe(need - 1);
    expect(u.level).toBe(1);
  });

  it("captures a level-up with before/after stat snapshots", () => {
    const u = mk();
    const before = { ...u.stats };
    const info = grantXpTracked(u, xpForLevel(u.level));
    expect(info).not.toBeNull();
    expect(info!.fromLevel).toBe(1);
    expect(info!.toLevel).toBe(2);
    expect(info!.unitId).toBe(u.id);
    expect(info!.statsBefore.maxHp).toBe(before.maxHp);
    // Knight grows HP per level, so after-max exceeds before-max.
    expect(info!.statsAfter.maxHp).toBeGreaterThan(info!.statsBefore.maxHp);
  });

  it("captures crossing multiple levels in a single grant", () => {
    const u = mk();
    const huge = xpForLevel(1) + xpForLevel(2) + xpForLevel(3);
    const info = grantXpTracked(u, huge);
    expect(info).not.toBeNull();
    expect(info!.fromLevel).toBe(1);
    expect(info!.toLevel).toBeGreaterThanOrEqual(3);
  });

  it("names a now-affordable skill when SP allows it", () => {
    const u = mk();
    u.sp = 100000; // can afford the first Knight skill (powerStrike, spCost 100)
    const info = grantXpTracked(u, xpForLevel(u.level));
    expect(info!.newSkillName).toBeTruthy();
  });

  it("omits the skill hint when SP can't afford the next skill", () => {
    const u = mk();
    u.sp = 0;
    const info = grantXpTracked(u, xpForLevel(u.level));
    expect(info!.newSkillName).toBeUndefined();
  });
});
