import { describe, it, expect } from "vitest";
import type { MapDef, Point, Unit } from "../src/core/types";
import { createUnit } from "../src/core/unit";
import { Grid, moveBlockers, samePoint } from "../src/battle/grid";
import { reachable, pathTo } from "../src/battle/pathfinding";

/**
 * Integration tests for the pass-through movement rule, exercising the exact
 * production stack the battle scene and AI use: moveBlockers() -> reachable()
 * -> pathTo(). A unit may cross tiles held by ALLIES but may never finish on an
 * occupied tile; ENEMY-held tiles block movement entirely. The rule is
 * symmetric for player and enemy movers.
 *
 * Topology: a 1-row corridor so the unit on the middle tile is the ONLY route
 * to the far side — making "passes through" vs "blocked" directly observable.
 */
function corridor(width: number): Grid {
  const map: MapDef = {
    id: "corridor",
    name: "Corridor",
    intro: "",
    width,
    height: 1,
    heights: [Array(width).fill(0)],
    blocked: undefined,
    playerSpawns: [],
    enemies: [],
  };
  return new Grid(map);
}

function unitAt(id: string, team: "player" | "enemy", pos: Point): Unit {
  return createUnit({
    name: id,
    team,
    classId: "knight",
    level: 3,
    pos,
    weaponId: "sword",
    learnedSkillIds: [],
  });
}

/** Mirror of battleScene.enterMove: the tiles a unit may actually move to. */
function moveTargets(grid: Grid, mover: Unit, units: Unit[]): Set<string> {
  const { solid, passThrough } = moveBlockers(units, mover);
  const reach = reachable(grid, mover.pos, mover.stats.move, mover.stats.jump, solid, passThrough);
  return reach.destinations;
}

describe("pass-through movement (integration: moveBlockers + reachable + pathTo)", () => {
  it("a unit moves THROUGH an allied unit to reach the far side, but cannot stop on it", () => {
    const grid = corridor(5);
    const mover = unitAt("hero", "player", { x: 0, y: 0 });
    mover.stats.move = 4;
    const ally = unitAt("ally", "player", { x: 2, y: 0 });
    const units = [mover, ally];

    const targets = moveTargets(grid, mover, units);
    // Cannot finish on the ally's tile...
    expect(targets.has("2,0")).toBe(false);
    // ...but tiles BEYOND the ally (only reachable by crossing it) are valid.
    expect(targets.has("3,0")).toBe(true);
    expect(targets.has("4,0")).toBe(true);
    // The tile just before the ally is also valid.
    expect(targets.has("1,0")).toBe(true);

    // The actual path to the far tile runs straight through the ally's tile.
    const { solid, passThrough } = moveBlockers(units, mover);
    const reach = reachable(grid, mover.pos, mover.stats.move, mover.stats.jump, solid, passThrough);
    const path = pathTo(reach, { x: 4, y: 0 });
    expect(path).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 0 },
    ]);
    expect(path!.some((p) => samePoint(p, ally.pos))).toBe(true);
  });

  it("an ENEMY-held tile blocks movement — the far side is unreachable", () => {
    const grid = corridor(5);
    const mover = unitAt("hero", "player", { x: 0, y: 0 });
    mover.stats.move = 4;
    const foe = unitAt("foe", "enemy", { x: 2, y: 0 });
    const units = [mover, foe];

    const targets = moveTargets(grid, mover, units);
    expect(targets.has("1,0")).toBe(true); // up to the enemy
    expect(targets.has("2,0")).toBe(false); // cannot enter the enemy tile
    expect(targets.has("3,0")).toBe(false); // walled off behind it
    expect(targets.has("4,0")).toBe(false);

    const { solid, passThrough } = moveBlockers(units, mover);
    const reach = reachable(grid, mover.pos, mover.stats.move, mover.stats.jump, solid, passThrough);
    expect(pathTo(reach, { x: 4, y: 0 })).toBeNull();
  });

  it("is symmetric: an enemy unit passes through its enemy ally but is blocked by a player", () => {
    const grid = corridor(5);
    const mover = unitAt("orc", "enemy", { x: 0, y: 0 });
    mover.stats.move = 4;

    // Enemy ally on the corridor -> pass-through.
    const enemyAlly = unitAt("goblin", "enemy", { x: 2, y: 0 });
    let targets = moveTargets(grid, mover, [mover, enemyAlly]);
    expect(targets.has("2,0")).toBe(false); // cannot stop on the ally
    expect(targets.has("4,0")).toBe(true); // but can pass through to the far side

    // A player on the corridor -> solid block.
    const player = unitAt("knight", "player", { x: 2, y: 0 });
    targets = moveTargets(grid, mover, [mover, player]);
    expect(targets.has("3,0")).toBe(false);
    expect(targets.has("4,0")).toBe(false);
  });

  it("two stacked allies on the path are both crossable; neither is a valid stop", () => {
    const grid = corridor(6);
    const mover = unitAt("hero", "player", { x: 0, y: 0 });
    mover.stats.move = 5;
    const a1 = unitAt("a1", "player", { x: 2, y: 0 });
    const a2 = unitAt("a2", "player", { x: 3, y: 0 });
    const targets = moveTargets(grid, mover, [mover, a1, a2]);
    expect(targets.has("2,0")).toBe(false);
    expect(targets.has("3,0")).toBe(false);
    expect(targets.has("4,0")).toBe(true);
    expect(targets.has("5,0")).toBe(true);
  });
});
