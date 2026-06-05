import { describe, it, expect } from "vitest";
import { CLASSES } from "../src/data/classes";
import { SKILLS } from "../src/data/skills";
import { WEAPONS } from "../src/data/weapons";
import { statsForLevel } from "../src/core/unit";
import { CHARACTER_SPRITES } from "../src/data/sprites/characters";
import { SKILL_SPRITES } from "../src/data/sprites/skills";
import { WEAPON_SPRITES } from "../src/data/sprites/weapons";

const GEO_SKILL_IDS = ["boulder", "quagmire", "tremor", "petrify"];

describe("Geomancer class", () => {
  const def = CLASSES.geomancer;

  it("exists in CLASSES", () => {
    expect(def).toBeTruthy();
    expect(def.id).toBe("geomancer");
  });

  it("every skillId exists in SKILLS", () => {
    for (const sid of def.skillIds) {
      expect(SKILLS[sid], `missing skill: ${sid}`).toBeTruthy();
    }
  });

  it("every weaponId exists in WEAPONS and lists geomancer as a valid class", () => {
    for (const wid of def.weaponIds) {
      const w = WEAPONS[wid];
      expect(w, `missing weapon: ${wid}`).toBeTruthy();
      expect(w.classes).toContain("geomancer");
    }
  });

  it("has exactly the 4 geomancer skill ids in its skillIds", () => {
    for (const sid of GEO_SKILL_IDS) {
      expect(def.skillIds).toContain(sid);
    }
    expect(def.skillIds).toHaveLength(GEO_SKILL_IDS.length);
  });

  it("has a distinct color not used by any other class", () => {
    expect(def.color).toBeTruthy();
    const otherColors = Object.entries(CLASSES)
      .filter(([id]) => id !== "geomancer")
      .map(([, c]) => c.color);
    expect(otherColors).not.toContain(def.color);
  });
});

describe("Geomancer skills", () => {
  it("boulder is a single-target magical damage skill", () => {
    const s = SKILLS.boulder;
    expect(s).toBeTruthy();
    expect(s.effect).toBe("damage");
    expect(s.scaling).toBe("magical");
    expect(s.aoe).toBe("single");
  });

  it("tremor is an AoE magical damage skill of nature element", () => {
    const s = SKILLS.tremor;
    expect(s).toBeTruthy();
    expect(s.effect).toBe("damage");
    expect(s.scaling).toBe("magical");
    expect(s.aoe).toBe("square3");
    expect(s.element).toBe("nature");
  });

  it("quagmire is a debuff that applies slow", () => {
    const s = SKILLS.quagmire;
    expect(s).toBeTruthy();
    expect(s.effect).toBe("debuff");
    expect(s.scaling).toBe("magical");
    expect(s.statusKind).toBe("slow");
  });

  it("petrify is a debuff that applies stop", () => {
    const s = SKILLS.petrify;
    expect(s).toBeTruthy();
    expect(s.effect).toBe("debuff");
    expect(s.scaling).toBe("magical");
    expect(s.statusKind).toBe("stop");
    expect(s.statusDuration).toBeGreaterThanOrEqual(2);
  });

  it("skills unlock in ascending JP order", () => {
    const costs = GEO_SKILL_IDS.map((sid) => SKILLS[sid].jpCost);
    for (let i = 1; i < costs.length; i++) {
      expect(costs[i]).toBeGreaterThanOrEqual(costs[i - 1]);
    }
  });
});

describe("statsForLevel(geomancer, 5)", () => {
  const s = statsForLevel("geomancer", 5);
  const bm = statsForLevel("blackMage", 5);

  it("all stats are positive", () => {
    expect(s.maxHp).toBeGreaterThan(0);
    expect(s.maxMp).toBeGreaterThan(0);
    expect(s.atk).toBeGreaterThan(0);
    expect(s.def).toBeGreaterThan(0);
    expect(s.mag).toBeGreaterThan(0);
    expect(s.res).toBeGreaterThan(0);
    expect(s.spd).toBeGreaterThan(0);
  });

  it("mag is the highest offensive stat", () => {
    expect(s.mag).toBeGreaterThan(s.atk);
  });

  it("is tankier than Black Mage at same level (higher HP)", () => {
    expect(s.maxHp).toBeGreaterThan(bm.maxHp);
  });

  it("is tankier than Black Mage at same level (higher DEF)", () => {
    expect(s.def).toBeGreaterThan(bm.def);
  });
});

describe("Geomancer sprites", () => {
  it("CHARACTER_SPRITES.geomancer has 20 rows each of length 16", () => {
    const sprite = CHARACTER_SPRITES.geomancer;
    expect(sprite).toBeTruthy();
    expect(sprite.rows).toHaveLength(20);
    for (const row of sprite.rows) {
      expect(row).toHaveLength(16);
    }
  });

  for (const sid of GEO_SKILL_IDS) {
    it(`SKILL_SPRITES has an entry for ${sid}`, () => {
      expect(SKILL_SPRITES[sid]).toBeTruthy();
    });

    it(`SKILL_SPRITES.${sid} has 14 rows each of length 14`, () => {
      const sprite = SKILL_SPRITES[sid];
      expect(sprite.rows).toHaveLength(14);
      for (const row of sprite.rows) {
        expect(row).toHaveLength(14);
      }
    });
  }

  it("WEAPON_SPRITES has gaiaStaff", () => {
    expect(WEAPON_SPRITES.gaiaStaff).toBeTruthy();
  });

  it("WEAPON_SPRITES.gaiaStaff has 14 rows each of length 14", () => {
    const sprite = WEAPON_SPRITES.gaiaStaff;
    expect(sprite.rows).toHaveLength(14);
    for (const row of sprite.rows) {
      expect(row).toHaveLength(14);
    }
  });
});
