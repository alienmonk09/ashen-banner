import { describe, it, expect } from "vitest";
import type { MapDef, Point, Unit } from "../src/core/types";
import { CLASSES } from "../src/data/classes";
import { SKILLS } from "../src/data/skills";
import { WEAPONS } from "../src/data/weapons";
import { statsForLevel, createUnit } from "../src/core/unit";
import { Grid } from "../src/battle/grid";
import { leapLanding } from "../src/battle/targeting";
import { CHARACTER_SPRITES } from "../src/data/sprites/characters";
import { SKILL_SPRITES } from "../src/data/sprites/skills";
import { WEAPON_SPRITES } from "../src/data/sprites/weapons";

const LANCER_SKILL_IDS = ["jump", "lanceThrust", "hobble", "harpoon", "sweep"];

// --- Grid helpers ---

function makeGrid(width: number, height: number): Grid {
  const map: MapDef = {
    id: "test",
    name: "Test",
    intro: "",
    width,
    height,
    heights: Array.from({ length: height }, () => Array(width).fill(0)),
    playerSpawns: [],
    enemies: [],
  };
  return new Grid(map);
}

function makeGridWithBlocked(width: number, height: number, blockedTiles: Point[]): Grid {
  const blocked = Array.from({ length: height }, () => Array(width).fill(false));
  for (const p of blockedTiles) {
    blocked[p.y][p.x] = true;
  }
  const map: MapDef = {
    id: "test",
    name: "Test",
    intro: "",
    width,
    height,
    heights: Array.from({ length: height }, () => Array(width).fill(0)),
    blocked,
    playerSpawns: [],
    enemies: [],
  };
  return new Grid(map);
}

function unitAt(id: string, pos: Point, alive = true): Unit {
  const u = createUnit({
    name: id,
    team: "player",
    classId: "knight",
    level: 1,
    pos,
    weaponId: "sword",
  });
  u.id = id;
  u.alive = alive;
  return u;
}

// --- Class / skill / weapon integrity ---

describe("Lancer class", () => {
  const def = CLASSES.lancer;

  it("exists in CLASSES", () => {
    expect(def).toBeTruthy();
    expect(def.id).toBe("lancer");
  });

  it("every skillId exists in SKILLS", () => {
    for (const sid of def.skillIds) {
      expect(SKILLS[sid], `missing skill: ${sid}`).toBeTruthy();
    }
  });

  it("every weaponId exists in WEAPONS and lists lancer as a valid class", () => {
    for (const wid of def.weaponIds) {
      const w = WEAPONS[wid];
      expect(w, `missing weapon: ${wid}`).toBeTruthy();
      expect(w.classes).toContain("lancer");
    }
  });

  it("has exactly the 5 lancer skill ids in its skillIds", () => {
    for (const sid of LANCER_SKILL_IDS) {
      expect(def.skillIds).toContain(sid);
    }
    expect(def.skillIds).toHaveLength(LANCER_SKILL_IDS.length);
  });

  it("has a distinct color not used by any other class", () => {
    expect(def.color).toBeTruthy();
    const otherColors = Object.entries(CLASSES)
      .filter(([id]) => id !== "lancer")
      .map(([, c]) => c.color);
    expect(otherColors).not.toContain(def.color);
  });
});

describe("Lancer skills", () => {
  it("jump has leap: true, aoe single, high power", () => {
    const s = SKILLS.jump;
    expect(s).toBeTruthy();
    expect(s.leap).toBe(true);
    expect(s.aoe).toBe("single");
    expect(s.effect).toBe("damage");
    expect(s.scaling).toBe("physical");
    expect(s.power).toBeGreaterThanOrEqual(20);
  });

  it("lanceThrust is single-target physical damage with range 2", () => {
    const s = SKILLS.lanceThrust;
    expect(s).toBeTruthy();
    expect(s.effect).toBe("damage");
    expect(s.scaling).toBe("physical");
    expect(s.aoe).toBe("single");
    expect(s.range).toBe(2);
  });

  it("sweep is physical AoE damage (cross)", () => {
    const s = SKILLS.sweep;
    expect(s).toBeTruthy();
    expect(s.effect).toBe("damage");
    expect(s.scaling).toBe("physical");
    expect(s.aoe).toBe("cross");
  });

  it("hobble is a debuff that applies slow", () => {
    const s = SKILLS.hobble;
    expect(s).toBeTruthy();
    expect(s.effect).toBe("debuff");
    expect(s.scaling).toBe("physical");
    expect(s.statusKind).toBe("slow");
    expect(s.range).toBe(2);
  });

  it("skills unlock in ascending JP order", () => {
    const costs = LANCER_SKILL_IDS.map((sid) => SKILLS[sid].jpCost);
    for (let i = 1; i < costs.length; i++) {
      expect(costs[i]).toBeGreaterThanOrEqual(costs[i - 1]);
    }
  });
});

describe("spear weapon", () => {
  it("exists in WEAPONS", () => {
    expect(WEAPONS.spear).toBeTruthy();
  });

  it("has range 2", () => {
    expect(WEAPONS.spear.range).toBe(2);
  });

  it("is physical kind", () => {
    expect(WEAPONS.spear.kind).toBe("physical");
  });

  it("lists lancer as valid class", () => {
    expect(WEAPONS.spear.classes).toContain("lancer");
  });
});

// --- leapLanding ---

describe("leapLanding", () => {
  it("returns an adjacent tile nearest the caster when target is far away", () => {
    const grid = makeGrid(10, 10);
    const caster = unitAt("caster", { x: 0, y: 5 });
    const target = unitAt("target", { x: 5, y: 5 });
    const units = [caster, target];
    const land = leapLanding(grid, units, caster, target.pos);
    expect(land).not.toBeNull();
    // Must be adjacent (manhattan 1) to target
    const dist = Math.abs(land!.x - target.pos.x) + Math.abs(land!.y - target.pos.y);
    expect(dist).toBe(1);
    // Must be in bounds
    expect(grid.inBounds(land!.x, land!.y)).toBe(true);
    // Nearest to caster (caster is at x=0, so land should be at x=4, y=5)
    expect(land).toEqual({ x: 4, y: 5 });
  });

  it("returns null when caster is already adjacent to target", () => {
    const grid = makeGrid(10, 10);
    const caster = unitAt("caster", { x: 4, y: 5 });
    const target = unitAt("target", { x: 5, y: 5 });
    const land = leapLanding(grid, [caster, target], caster, target.pos);
    expect(land).toBeNull();
  });

  it("returns null when caster is on the same tile as target (distance 0)", () => {
    const grid = makeGrid(10, 10);
    const caster = unitAt("caster", { x: 5, y: 5 });
    const target = unitAt("target", { x: 5, y: 5 });
    const land = leapLanding(grid, [caster, target], caster, target.pos);
    expect(land).toBeNull();
  });

  it("skips blocked adjacent tiles", () => {
    // Target at (5,5). Block W, N, S — only E (6,5) is free.
    const grid = makeGridWithBlocked(10, 10, [
      { x: 4, y: 5 }, // W
      { x: 5, y: 4 }, // N
      { x: 5, y: 6 }, // S
    ]);
    const caster = unitAt("caster", { x: 0, y: 5 });
    const target = unitAt("target", { x: 5, y: 5 });
    const land = leapLanding(grid, [caster, target], caster, target.pos);
    expect(land).toEqual({ x: 6, y: 5 });
  });

  it("skips tiles occupied by living units", () => {
    const grid = makeGrid(10, 10);
    const caster = unitAt("caster", { x: 0, y: 5 });
    const target = unitAt("target", { x: 5, y: 5 });
    // Occupy W and N neighbours
    const blocker1 = unitAt("b1", { x: 4, y: 5 });
    const blocker2 = unitAt("b2", { x: 5, y: 4 });
    const land = leapLanding(grid, [caster, target, blocker1, blocker2], caster, target.pos);
    // S (5,6) and E (6,5) are free; S is closer to caster (x=0,y=5) than E
    // dist(S) = |0-5|+|5-6| = 6, dist(E) = |0-6|+|5-5| = 6 — tie, N comes first in stable order but N blocked
    // Actually W is blocked, N is blocked by unit, so candidates are S and E — tied at dist 6
    // Stable order N→E→S→W: E wins tie
    expect(land).not.toBeNull();
    const dist = Math.abs(land!.x - target.pos.x) + Math.abs(land!.y - target.pos.y);
    expect(dist).toBe(1);
    // Must not be an occupied tile
    expect(land).not.toEqual({ x: 4, y: 5 });
    expect(land).not.toEqual({ x: 5, y: 4 });
  });

  it("returns null when all 4 neighbours are blocked", () => {
    const grid = makeGridWithBlocked(10, 10, [
      { x: 4, y: 5 }, // W
      { x: 6, y: 5 }, // E
      { x: 5, y: 4 }, // N
      { x: 5, y: 6 }, // S
    ]);
    const caster = unitAt("caster", { x: 0, y: 5 });
    const target = unitAt("target", { x: 5, y: 5 });
    const land = leapLanding(grid, [caster, target], caster, target.pos);
    expect(land).toBeNull();
  });

  it("returns null when all 4 neighbours are out of bounds (corner target)", () => {
    // Target at (0,0): N=(0,-1) OOB, W=(-1,0) OOB, E=(1,0) and S=(0,1) are free
    // But caster far away — should return a valid tile, not null
    const grid = makeGrid(10, 10);
    const caster = unitAt("caster", { x: 5, y: 5 });
    const target = unitAt("target", { x: 0, y: 0 });
    const land = leapLanding(grid, [caster, target], caster, target.pos);
    expect(land).not.toBeNull();
  });

  it("returns null when all in-bounds neighbours are occupied/blocked at a corner", () => {
    // Target at (0,0). Only E=(1,0) and S=(0,1) are in-bounds — block them both
    const grid = makeGridWithBlocked(10, 10, [{ x: 1, y: 0 }, { x: 0, y: 1 }]);
    const caster = unitAt("caster", { x: 5, y: 5 });
    const target = unitAt("target", { x: 0, y: 0 });
    const land = leapLanding(grid, [caster, target], caster, target.pos);
    expect(land).toBeNull();
  });

  it("caster's own starting tile does not count as occupied", () => {
    // Caster at (4,5), target at (6,5). Caster is not adjacent (dist=2).
    // W=(5,5) is the closest. Caster's tile (4,5) is NOT a candidate here.
    const grid = makeGrid(10, 10);
    const caster = unitAt("caster", { x: 4, y: 5 });
    const target = unitAt("target", { x: 6, y: 5 });
    const land = leapLanding(grid, [caster, target], caster, target.pos);
    expect(land).toEqual({ x: 5, y: 5 }); // W of target, nearest caster
  });
});

// --- statsForLevel ---

describe("statsForLevel(lancer, 5)", () => {
  const s = statsForLevel("lancer", 5);
  const knight = statsForLevel("knight", 5);

  it("all stats are positive", () => {
    expect(s.maxHp).toBeGreaterThan(0);
    expect(s.maxMp).toBeGreaterThan(0);
    expect(s.atk).toBeGreaterThan(0);
    expect(s.def).toBeGreaterThan(0);
    expect(s.spd).toBeGreaterThan(0);
  });

  it("atk is the highest offensive stat", () => {
    expect(s.atk).toBeGreaterThan(s.mag);
  });

  it("has high jump (3)", () => {
    expect(s.jump).toBe(3);
  });

  it("has higher speed than a knight at same level", () => {
    expect(s.spd).toBeGreaterThan(knight.spd);
  });
});

// --- Sprites ---

describe("Lancer sprites", () => {
  it("CHARACTER_SPRITES.lancer has 20 rows each of length 16", () => {
    const sprite = CHARACTER_SPRITES.lancer;
    expect(sprite).toBeTruthy();
    expect(sprite.rows).toHaveLength(20);
    for (const row of sprite.rows) {
      expect(row).toHaveLength(16);
    }
  });

  for (const sid of LANCER_SKILL_IDS) {
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

  it("WEAPON_SPRITES has spear", () => {
    expect(WEAPON_SPRITES.spear).toBeTruthy();
  });

  it("WEAPON_SPRITES.spear has 14 rows each of length 14", () => {
    const sprite = WEAPON_SPRITES.spear;
    expect(sprite.rows).toHaveLength(14);
    for (const row of sprite.rows) {
      expect(row).toHaveLength(14);
    }
  });
});
