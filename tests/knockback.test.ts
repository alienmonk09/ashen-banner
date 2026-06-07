import { describe, it, expect } from "vitest";
import type { MapDef, Point, Unit } from "../src/core/types";
import { createUnit } from "../src/core/unit";
import { Grid } from "../src/battle/grid";
import { knockbackTo } from "../src/battle/targeting";
import { SKILLS } from "../src/data/skills";

/** Build a minimal w×h Grid (all heights 0, nothing blocked). */
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

/** Build a grid with a specific tile set as blocked. */
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

function unitAt(pos: Point, alive = true): Unit {
  const u = createUnit({
    name: "u",
    team: "enemy",
    classId: "knight",
    level: 1,
    pos,
    weaponId: "sword",
  });
  u.alive = alive;
  return u;
}

describe("knockbackTo", () => {
  describe("cardinal direction shoves", () => {
    it("shoves east when caster is west of target", () => {
      const grid = makeGrid(10, 10);
      const caster: Point = { x: 2, y: 5 };
      const target: Point = { x: 3, y: 5 };
      const dest = knockbackTo(grid, [], caster, target, 1);
      expect(dest).toEqual({ x: 4, y: 5 });
    });

    it("shoves west when caster is east of target", () => {
      const grid = makeGrid(10, 10);
      const caster: Point = { x: 6, y: 5 };
      const target: Point = { x: 5, y: 5 };
      const dest = knockbackTo(grid, [], caster, target, 1);
      expect(dest).toEqual({ x: 4, y: 5 });
    });

    it("shoves south when caster is north of target", () => {
      const grid = makeGrid(10, 10);
      const caster: Point = { x: 5, y: 2 };
      const target: Point = { x: 5, y: 3 };
      const dest = knockbackTo(grid, [], caster, target, 1);
      expect(dest).toEqual({ x: 5, y: 4 });
    });

    it("shoves north when caster is south of target", () => {
      const grid = makeGrid(10, 10);
      const caster: Point = { x: 5, y: 6 };
      const target: Point = { x: 5, y: 5 };
      const dest = knockbackTo(grid, [], caster, target, 1);
      expect(dest).toEqual({ x: 5, y: 4 });
    });

    // directionTo collapses an exact diagonal to a cardinal, favouring the
    // horizontal axis (|dx| >= |dy|). These lock that documented resolution.
    it("shoves east (horizontal wins) on an exact SE diagonal", () => {
      const grid = makeGrid(10, 10);
      // caster NW of target on a perfect diagonal → bearing is SE; horizontal wins → east.
      const caster: Point = { x: 2, y: 2 };
      const target: Point = { x: 3, y: 3 };
      const dest = knockbackTo(grid, [], caster, target, 1);
      expect(dest).toEqual({ x: 4, y: 3 });
    });

    it("shoves west (horizontal wins) on an exact SW diagonal", () => {
      const grid = makeGrid(10, 10);
      // caster NE of target on a perfect diagonal → bearing is SW; horizontal wins → west.
      const caster: Point = { x: 4, y: 2 };
      const target: Point = { x: 3, y: 3 };
      const dest = knockbackTo(grid, [], caster, target, 1);
      expect(dest).toEqual({ x: 2, y: 3 });
    });
  });

  it("moves two tiles when clear (distance 2)", () => {
    const grid = makeGrid(10, 10);
    const caster: Point = { x: 2, y: 5 };
    const target: Point = { x: 3, y: 5 };
    const dest = knockbackTo(grid, [], caster, target, 2);
    expect(dest).toEqual({ x: 5, y: 5 });
  });

  it("stops at the map edge (east boundary)", () => {
    const grid = makeGrid(10, 10);
    const caster: Point = { x: 7, y: 5 };
    const target: Point = { x: 9, y: 5 }; // already at eastern edge
    const dest = knockbackTo(grid, [], caster, target, 2);
    // x=10 is out of bounds — stays at 9
    expect(dest).toEqual({ x: 9, y: 5 });
  });

  it("stops at the map edge (north boundary)", () => {
    const grid = makeGrid(10, 10);
    const caster: Point = { x: 5, y: 3 };
    const target: Point = { x: 5, y: 0 }; // at northern edge
    const dest = knockbackTo(grid, [], caster, target, 2);
    // y=-1 is out of bounds — stays at 0
    expect(dest).toEqual({ x: 5, y: 0 });
  });

  it("stops before a blocked tile", () => {
    // caster at (3,5), target at (5,5), blocked tile at (6,5)
    const grid = makeGridWithBlocked(10, 10, [{ x: 6, y: 5 }]);
    const caster: Point = { x: 3, y: 5 };
    const target: Point = { x: 5, y: 5 };
    // Would shove east; (6,5) is blocked → can't move
    const dest = knockbackTo(grid, [], caster, target, 1);
    expect(dest).toEqual({ x: 5, y: 5 });
  });

  it("stops before a blocked tile at distance 2", () => {
    // caster at (2,5), target at (3,5), blocked at (4,5)
    const grid = makeGridWithBlocked(10, 10, [{ x: 4, y: 5 }]);
    const caster: Point = { x: 2, y: 5 };
    const target: Point = { x: 3, y: 5 };
    // First step would land on (4,5) which is blocked → stays at (3,5)
    const dest = knockbackTo(grid, [], caster, target, 2);
    expect(dest).toEqual({ x: 3, y: 5 });
  });

  it("stops before a tile occupied by another living unit", () => {
    const grid = makeGrid(10, 10);
    const caster: Point = { x: 2, y: 5 };
    const target: Point = { x: 3, y: 5 };
    // Another unit sits directly behind the target (where it would land).
    const blocker = unitAt({ x: 4, y: 5 });
    const dest = knockbackTo(grid, [blocker], caster, target, 1);
    expect(dest).toEqual({ x: 3, y: 5 });
  });

  it("does not treat the target's own tile as blocked by itself", () => {
    const grid = makeGrid(10, 10);
    const caster: Point = { x: 2, y: 5 };
    const target: Point = { x: 3, y: 5 };
    // Pass a unit that sits ON the target tile — must not prevent the shove.
    const targetUnit = unitAt({ x: 3, y: 5 });
    const dest = knockbackTo(grid, [targetUnit], caster, target, 1);
    expect(dest).toEqual({ x: 4, y: 5 });
  });

  it("returns target's tile unchanged when immediately boxed in by a unit", () => {
    const grid = makeGrid(10, 10);
    const caster: Point = { x: 2, y: 5 };
    const target: Point = { x: 3, y: 5 };
    // Blocker directly in the shove direction.
    const blocker = unitAt({ x: 4, y: 5 });
    const dest = knockbackTo(grid, [blocker], caster, target, 1);
    expect(dest).toEqual({ x: 3, y: 5 });
  });

  it("returns target's tile unchanged when map edge is immediately behind", () => {
    const grid = makeGrid(5, 5);
    const caster: Point = { x: 2, y: 3 };
    // Target is at the southern edge — can't go further south.
    const target: Point = { x: 2, y: 4 };
    const dest = knockbackTo(grid, [], caster, target, 3);
    expect(dest).toEqual({ x: 2, y: 4 });
  });

  it("ignores dead units when computing occupancy", () => {
    const grid = makeGrid(10, 10);
    const caster: Point = { x: 2, y: 5 };
    const target: Point = { x: 3, y: 5 };
    // A dead unit occupying the destination tile must not block the shove.
    const deadBlocker = unitAt({ x: 4, y: 5 }, false);
    const dest = knockbackTo(grid, [deadBlocker], caster, target, 1);
    expect(dest).toEqual({ x: 4, y: 5 });
  });
});

describe("skill definitions", () => {
  it("palmStrike has knockback: 1 and aoe: single", () => {
    const skill = SKILLS["palmStrike"];
    expect(skill.knockback).toBe(1);
    expect(skill.aoe).toBe("single");
  });

  it("powerStrike has knockback: 1 and aoe: single", () => {
    const skill = SKILLS["powerStrike"];
    expect(skill.knockback).toBe(1);
    expect(skill.aoe).toBe("single");
  });

  it("harpoon has pull: true, knockback, and aoe: single", () => {
    const skill = SKILLS["harpoon"];
    expect(skill.pull).toBe(true);
    expect(skill.knockback).toBeGreaterThan(0);
    expect(skill.aoe).toBe("single");
  });

  it("bodySlam has knockback: 3, throwOver: true, and aoe: single", () => {
    const skill = SKILLS["bodySlam"];
    expect(skill.knockback).toBe(3);
    expect(skill.throwOver).toBe(true);
    expect(skill.aoe).toBe("single");
  });
});

describe("knockbackTo — throwOver variant", () => {
  it("throw passes over an occupied tile and lands beyond it on a clear tile", () => {
    const grid = makeGrid(10, 10);
    // Caster at (2,5), target at (3,5), blocker at (4,5), clear at (5,5) and (6,5).
    // throwOver=true, distance=3 → steps: (4,5)[occ pass], (5,5)[clear], (6,5)[clear].
    // Farthest unoccupied reachable = (6,5).
    const caster: Point = { x: 2, y: 5 };
    const target: Point = { x: 3, y: 5 };
    const blocker = unitAt({ x: 4, y: 5 });
    const dest = knockbackTo(grid, [blocker], caster, target, 3, false, true);
    expect(dest).toEqual({ x: 6, y: 5 });
  });

  it("throw still stops at the grid edge", () => {
    const grid = makeGrid(10, 10);
    // Caster at (2,5), target at (7,5), throw distance 3 → farthest reachable = (9,5); x=10 OOB.
    const caster: Point = { x: 2, y: 5 };
    const target: Point = { x: 7, y: 5 };
    const dest = knockbackTo(grid, [], caster, target, 3, false, true);
    expect(dest).toEqual({ x: 9, y: 5 }); // (10,5) is out of bounds
  });

  it("throw still stops at a blocked tile", () => {
    // Caster at (2,5), target at (3,5), blocked at (5,5), throw distance 3.
    // Step 1→(4,5) clear, step 2→(5,5) blocked (hard stop) → lands at (4,5).
    const grid = makeGridWithBlocked(10, 10, [{ x: 5, y: 5 }]);
    const caster: Point = { x: 2, y: 5 };
    const target: Point = { x: 3, y: 5 };
    const dest = knockbackTo(grid, [], caster, target, 3, false, true);
    expect(dest).toEqual({ x: 4, y: 5 });
  });

  it("throw lands on farthest unoccupied tile when the last reachable tile is occupied", () => {
    const grid = makeGrid(10, 10);
    // Caster at (2,5), target at (3,5), blocker at (4,5), another blocker at (5,5).
    // Throw distance 3 → steps (4,5)[occ], (5,5)[occ], (6,5)[clear]. Farthest unoccupied = (6,5).
    const caster: Point = { x: 2, y: 5 };
    const target: Point = { x: 3, y: 5 };
    const b1 = unitAt({ x: 4, y: 5 });
    const b2 = unitAt({ x: 5, y: 5 });
    const dest = knockbackTo(grid, [b1, b2], caster, target, 3, false, true);
    expect(dest).toEqual({ x: 6, y: 5 });
  });

  it("throw returns target tile (no movement) when every reachable tile is occupied", () => {
    const grid = makeGrid(10, 10);
    // Caster at (2,5), target at (3,5), blockers at (4,5) and only 1 distance available.
    // Distance=1, only step is (4,5) which is occupied → no clear tile found, stays at (3,5).
    const caster: Point = { x: 2, y: 5 };
    const target: Point = { x: 3, y: 5 };
    const blocker = unitAt({ x: 4, y: 5 });
    const dest = knockbackTo(grid, [blocker], caster, target, 1, false, true);
    expect(dest).toEqual({ x: 3, y: 5 });
  });

  it("throwOver=false (default) is identical to the normal shove when a unit blocks", () => {
    const grid = makeGrid(10, 10);
    const caster: Point = { x: 2, y: 5 };
    const target: Point = { x: 3, y: 5 };
    const blocker = unitAt({ x: 4, y: 5 });
    // Normal shove stops at blocker; default throwOver=false must match.
    expect(knockbackTo(grid, [blocker], caster, target, 3, false, false)).toEqual(
      knockbackTo(grid, [blocker], caster, target, 3),
    );
  });

  it("pull + throwOver together honours pull behaviour (throwOver is ignored)", () => {
    const grid = makeGrid(10, 10);
    // Caster at (2,5), target at (6,5), blocker at (5,5).
    // pull=true, throwOver=true → throwOver ignored, pull stops before blocker at (6,5).
    const caster: Point = { x: 2, y: 5 };
    const target: Point = { x: 6, y: 5 };
    const blocker = unitAt({ x: 5, y: 5 });
    const dest = knockbackTo(grid, [blocker], caster, target, 3, true, true);
    expect(dest).toEqual({ x: 6, y: 5 }); // same as pull without throwOver
  });
});

describe("knockbackTo — pull variant", () => {
  it("pulls target one tile toward caster (caster west, target two east → pulled one west)", () => {
    const grid = makeGrid(10, 10);
    // Caster at (2,5), target at (4,5) — pull distance 1, target moves west to (3,5).
    const caster: Point = { x: 2, y: 5 };
    const target: Point = { x: 4, y: 5 };
    const dest = knockbackTo(grid, [], caster, target, 1, true);
    expect(dest).toEqual({ x: 3, y: 5 });
  });

  it("pull stops one tile short of the caster (never lands on the caster's tile)", () => {
    const grid = makeGrid(10, 10);
    // Caster at (2,5), target at (4,5), pull distance 2 → would reach (2,5) but must stop at (3,5).
    const caster: Point = { x: 2, y: 5 };
    const target: Point = { x: 4, y: 5 };
    const dest = knockbackTo(grid, [], caster, target, 2, true);
    expect(dest).toEqual({ x: 3, y: 5 });
  });

  it("pull stops before an occupied tile between target and caster", () => {
    const grid = makeGrid(10, 10);
    // Caster at (2,5), target at (6,5), blocker at (5,5) — pull 3 tiles but (5,5) is occupied.
    const caster: Point = { x: 2, y: 5 };
    const target: Point = { x: 6, y: 5 };
    const blocker = unitAt({ x: 5, y: 5 });
    const dest = knockbackTo(grid, [blocker], caster, target, 3, true);
    expect(dest).toEqual({ x: 6, y: 5 }); // can't move — immediately blocked
  });

  it("pull stops before a blocked tile between target and caster", () => {
    // Caster at (2,5), target at (6,5), blocked tile at (5,5) — pull stops at (6,5).
    const grid = makeGridWithBlocked(10, 10, [{ x: 5, y: 5 }]);
    const caster: Point = { x: 2, y: 5 };
    const target: Point = { x: 6, y: 5 };
    const dest = knockbackTo(grid, [], caster, target, 3, true);
    expect(dest).toEqual({ x: 6, y: 5 });
  });

  it("pull=false (default) gives the same result as the original shove", () => {
    const grid = makeGrid(10, 10);
    const caster: Point = { x: 2, y: 5 };
    const target: Point = { x: 3, y: 5 };
    // Regression: explicit false must be identical to omitting the argument.
    expect(knockbackTo(grid, [], caster, target, 1, false)).toEqual(
      knockbackTo(grid, [], caster, target, 1),
    );
  });

  it("pull works from the north (caster north, target two south → pulled one north)", () => {
    const grid = makeGrid(10, 10);
    const caster: Point = { x: 5, y: 2 };
    const target: Point = { x: 5, y: 4 };
    const dest = knockbackTo(grid, [], caster, target, 1, true);
    expect(dest).toEqual({ x: 5, y: 3 });
  });

  // Pull reverses the collapsed cardinal: an exact diagonal favours horizontal,
  // so the pull travels along the (reversed) horizontal axis.
  it("pulls west on an exact SE diagonal (horizontal wins, reversed)", () => {
    const grid = makeGrid(10, 10);
    // caster NW of target on a perfect diagonal → bearing SE → horizontal "east";
    // pull reverses to west → target moves to (2,3).
    const caster: Point = { x: 2, y: 2 };
    const target: Point = { x: 3, y: 3 };
    const dest = knockbackTo(grid, [], caster, target, 1, true);
    expect(dest).toEqual({ x: 2, y: 3 });
  });

  it("pulls east on an exact SW diagonal (horizontal wins, reversed)", () => {
    const grid = makeGrid(10, 10);
    // caster NE of target on a perfect diagonal → bearing SW → horizontal "west";
    // pull reverses to east → target moves to (4,3).
    const caster: Point = { x: 4, y: 2 };
    const target: Point = { x: 3, y: 3 };
    const dest = knockbackTo(grid, [], caster, target, 1, true);
    expect(dest).toEqual({ x: 4, y: 3 });
  });
});
