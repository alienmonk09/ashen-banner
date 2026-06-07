import { describe, it, expect } from "vitest";
import { CLASSES } from "../src/data/classes";
import { SKILLS, getSkill } from "../src/data/skills";
import { getSkillSprite, vfxKeyForSkill, getVfx } from "../src/data/sprites";

describe("Time Mage unique skill: hasten", () => {
  it("exists in SKILLS", () => {
    const s = SKILLS.hasten;
    expect(s, "missing skill: hasten").toBeTruthy();
    expect(getSkill("hasten").id).toBe("hasten");
  });

  it("is an AoE haste buff (square3, buff, statusKind haste)", () => {
    const s = SKILLS.hasten;
    expect(s.effect).toBe("buff");
    expect(s.scaling).toBe("magical");
    expect(s.aoe).toBe("square3");
    expect(s.statusKind).toBe("haste");
    expect(s.statusDuration ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("is granted by Time Mage and replaces a shared key", () => {
    const ids = CLASSES.timeMage.skillIds;
    expect(ids).toContain("hasten");
    // The point of R22: no longer a byte-identical shared single-target haste.
    expect(ids).not.toContain("haste");
  });

  it("resolves to a sprite and a VFX family (no missing assets)", () => {
    const s = SKILLS.hasten;
    expect(getSkillSprite("hasten")).toBeTruthy();
    expect(getVfx(vfxKeyForSkill(s))).toBeTruthy();
  });
});

describe("Knight gets reach/AoE skills (R23)", () => {
  it("Knight has more than 2 skills, including a reach/AoE one", () => {
    const ids = CLASSES.knight.skillIds;
    expect(ids).toContain("powerStrike");
    expect(ids).toContain("guard");
    expect(ids.length).toBeGreaterThan(2);
  });

  it("shieldBash is a melee debuff that staggers and slows", () => {
    const s = SKILLS.shieldBash;
    expect(s, "missing skill: shieldBash").toBeTruthy();
    expect(getSkill("shieldBash").id).toBe("shieldBash");
    expect(s.effect).toBe("debuff");
    expect(s.scaling).toBe("physical");
    expect(s.range).toBe(1);
    expect(s.statusKind).toBe("slow");
    expect(s.knockback ?? 0).toBeGreaterThanOrEqual(1);
    expect(CLASSES.knight.skillIds).toContain("shieldBash");
  });

  it("rallyingCry is a self-centered AoE guard buff", () => {
    const s = SKILLS.rallyingCry;
    expect(s, "missing skill: rallyingCry").toBeTruthy();
    expect(getSkill("rallyingCry").id).toBe("rallyingCry");
    expect(s.effect).toBe("buff");
    expect(s.aoe).toBe("square3");
    expect(s.range).toBe(0);
    expect(s.statusKind).toBe("guard");
    expect(CLASSES.knight.skillIds).toContain("rallyingCry");
  });

  it("both new Knight skills resolve to a sprite and a VFX family (no missing assets)", () => {
    for (const id of ["shieldBash", "rallyingCry"]) {
      const s = SKILLS[id];
      expect(getSkillSprite(id)).toBeTruthy();
      expect(getVfx(vfxKeyForSkill(s))).toBeTruthy();
    }
  });
});

describe("Archer gets ranged AoE/control skills (R24)", () => {
  it("Archer has more than 2 skills, keeping its originals", () => {
    const ids = CLASSES.archer.skillIds;
    expect(ids).toContain("aimedShot");
    expect(ids).toContain("cripple");
    expect(ids.length).toBeGreaterThan(2);
  });

  it("multishot is a ranged cross-AoE physical attack", () => {
    const s = SKILLS.multishot;
    expect(s, "missing skill: multishot").toBeTruthy();
    expect(getSkill("multishot").id).toBe("multishot");
    expect(s.effect).toBe("damage");
    expect(s.scaling).toBe("physical");
    expect(s.aoe).toBe("cross");
    expect(s.range).toBeGreaterThanOrEqual(4);
    expect(s.power).toBeGreaterThan(0);
    expect(CLASSES.archer.skillIds).toContain("multishot");
  });

  it("pinningShot is a ranged shot that knocks back and slows", () => {
    const s = SKILLS.pinningShot;
    expect(s, "missing skill: pinningShot").toBeTruthy();
    expect(getSkill("pinningShot").id).toBe("pinningShot");
    expect(s.effect).toBe("debuff");
    expect(s.scaling).toBe("physical");
    expect(s.range).toBeGreaterThanOrEqual(4);
    expect(s.aoe).toBe("single");
    expect(s.statusKind).toBe("slow");
    expect(s.knockback ?? 0).toBeGreaterThanOrEqual(1);
    expect(CLASSES.archer.skillIds).toContain("pinningShot");
  });

  it("both new Archer skills resolve to a sprite and a VFX family (no missing assets)", () => {
    for (const id of ["multishot", "pinningShot"]) {
      const s = SKILLS[id];
      expect(getSkillSprite(id)).toBeTruthy();
      expect(getVfx(vfxKeyForSkill(s))).toBeTruthy();
    }
  });
});
