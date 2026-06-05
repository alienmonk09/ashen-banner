import { describe, it, expect } from "vitest";
import { terrainEffect } from "../src/data/terrain";
import { applyTerrainEffect } from "../src/battle/combat";
import { createUnit } from "../src/core/unit";
import { cinderFields } from "../src/data/maps/cinderFields";
import type { Unit } from "../src/core/types";

function makeUnit(overrides: Partial<Parameters<typeof createUnit>[0]> = {}): Unit {
  return createUnit({
    name: "U",
    team: "player",
    classId: "knight",
    pos: { x: 0, y: 0 },
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// terrainEffect
// ---------------------------------------------------------------------------

describe("terrainEffect", () => {
  it("returns damage 0.15 for lava", () => {
    const eff = terrainEffect("lava");
    expect(eff).not.toBeNull();
    expect(eff?.kind).toBe("damage");
    expect(eff?.fracMaxHp).toBe(0.15);
  });

  it("returns heal 0.12 for spring", () => {
    const eff = terrainEffect("spring");
    expect(eff).not.toBeNull();
    expect(eff?.kind).toBe("heal");
    expect(eff?.fracMaxHp).toBe(0.12);
  });

  it("returns null for grass", () => {
    expect(terrainEffect("grass")).toBeNull();
  });

  it("returns null for water", () => {
    expect(terrainEffect("water")).toBeNull();
  });

  it("returns null for dirt", () => {
    expect(terrainEffect("dirt")).toBeNull();
  });

  it("returns null for rock", () => {
    expect(terrainEffect("rock")).toBeNull();
  });

  it("returns null for sand", () => {
    expect(terrainEffect("sand")).toBeNull();
  });

  it("returns null for wood", () => {
    expect(terrainEffect("wood")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// applyTerrainEffect
// ---------------------------------------------------------------------------

describe("applyTerrainEffect", () => {
  it("deals Math.round(maxHp * 0.15) damage on lava", () => {
    const unit = makeUnit();
    const maxHp = unit.stats.maxHp;
    const expected = Math.max(1, Math.round(maxHp * 0.15));
    const result = applyTerrainEffect(unit, "lava");
    expect(result).not.toBeNull();
    expect(result?.kind).toBe("damage");
    expect(result?.amount).toBe(expected);
    expect(result?.crit).toBe(false);
    expect(result?.killed).toBe(false);
    expect(result?.revived).toBe(false);
    expect(unit.stats.hp).toBe(maxHp - expected);
  });

  it("kills the unit if lava damage brings HP to 0", () => {
    const unit = makeUnit();
    const dmg = Math.max(1, Math.round(unit.stats.maxHp * 0.15));
    unit.stats.hp = dmg; // exactly lethal
    const result = applyTerrainEffect(unit, "lava");
    expect(result?.killed).toBe(true);
    expect(unit.alive).toBe(false);
    expect(unit.stats.hp).toBe(0);
  });

  it("heals ~12% maxHp on spring for a half-HP unit", () => {
    const unit = makeUnit();
    const maxHp = unit.stats.maxHp;
    unit.stats.hp = Math.floor(maxHp / 2);
    const expected = Math.max(1, Math.round(maxHp * 0.12));
    const result = applyTerrainEffect(unit, "spring");
    expect(result).not.toBeNull();
    expect(result?.kind).toBe("heal");
    // Actual amount is clamped at maxHp; report the real delta.
    expect(result?.amount).toBe(Math.min(expected, maxHp - Math.floor(maxHp / 2)));
    expect(result?.crit).toBe(false);
    expect(result?.killed).toBe(false);
    expect(result?.revived).toBe(false);
  });

  it("does not overheal — returns null if unit is at full HP on spring", () => {
    const unit = makeUnit();
    // unit starts at full HP by default
    expect(unit.stats.hp).toBe(unit.stats.maxHp);
    const result = applyTerrainEffect(unit, "spring");
    expect(result).toBeNull();
  });

  it("clamps spring heal at maxHp when unit is nearly full", () => {
    const unit = makeUnit();
    const maxHp = unit.stats.maxHp;
    unit.stats.hp = maxHp - 1; // one HP missing
    const result = applyTerrainEffect(unit, "spring");
    expect(result).not.toBeNull();
    expect(result?.amount).toBe(1); // only 1 HP can actually be restored
    expect(unit.stats.hp).toBe(maxHp);
  });

  it("returns null for a dead unit on lava", () => {
    const unit = makeUnit();
    unit.alive = false;
    unit.stats.hp = 0;
    expect(applyTerrainEffect(unit, "lava")).toBeNull();
  });

  it("returns null for a dead unit on spring", () => {
    const unit = makeUnit();
    unit.alive = false;
    unit.stats.hp = 0;
    expect(applyTerrainEffect(unit, "spring")).toBeNull();
  });

  it("returns null on neutral terrain (grass)", () => {
    const unit = makeUnit();
    expect(applyTerrainEffect(unit, "grass")).toBeNull();
  });

  it("returns null on neutral terrain (water)", () => {
    const unit = makeUnit();
    expect(applyTerrainEffect(unit, "water")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Map sanity: cinderFields lava tiles
// ---------------------------------------------------------------------------

describe("cinderFields terrain", () => {
  it("has at least one lava tile in its terrain grid", () => {
    const { terrain } = cinderFields;
    expect(terrain).toBeDefined();
    const hasLava = terrain!.some((row) => row.includes("lava"));
    expect(hasLava).toBe(true);
  });

  it("no lava tile is blocked", () => {
    const { terrain, blocked, width, height } = cinderFields;
    expect(terrain).toBeDefined();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (terrain![y][x] === "lava") {
          const isBlocked = blocked?.[y][x] ?? false;
          expect(isBlocked).toBe(false);
        }
      }
    }
  });

  it("lava tiles are within map bounds", () => {
    const { terrain, width, height } = cinderFields;
    expect(terrain).toBeDefined();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (terrain![y][x] === "lava") {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThan(width);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThan(height);
        }
      }
    }
  });

  it("no lava tile sits on a player spawn", () => {
    const { terrain, playerSpawns } = cinderFields;
    expect(terrain).toBeDefined();
    const spawnKeys = new Set(playerSpawns.map((s) => `${s.x},${s.y}`));
    for (let y = 0; y < cinderFields.height; y++) {
      for (let x = 0; x < cinderFields.width; x++) {
        if (terrain![y][x] === "lava") {
          expect(spawnKeys.has(`${x},${y}`)).toBe(false);
        }
      }
    }
  });

  it("no lava tile sits on an enemy spawn", () => {
    const { terrain, enemies } = cinderFields;
    expect(terrain).toBeDefined();
    const enemyKeys = new Set(enemies.map((e) => `${e.pos.x},${e.pos.y}`));
    for (let y = 0; y < cinderFields.height; y++) {
      for (let x = 0; x < cinderFields.width; x++) {
        if (terrain![y][x] === "lava") {
          expect(enemyKeys.has(`${x},${y}`)).toBe(false);
        }
      }
    }
  });
});
