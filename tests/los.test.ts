import { describe, it, expect } from "vitest";
import type { MapDef } from "../src/core/types";
import { Grid } from "../src/battle/grid";
import { hasLineOfSight } from "../src/battle/los";
import { PROPS } from "../src/data/props";

function gridFromHeights(heights: number[][]): Grid {
  const h = heights.length;
  const w = heights[0].length;
  const map: MapDef = {
    id: "los",
    name: "LOS",
    intro: "",
    width: w,
    height: h,
    heights,
    playerSpawns: [],
    enemies: [],
  };
  return new Grid(map);
}

function flat(w: number, h: number): Grid {
  return gridFromHeights(Array.from({ length: h }, () => Array(w).fill(0)));
}

describe("hasLineOfSight", () => {
  it("is always true for the same tile", () => {
    const g = flat(5, 5);
    expect(hasLineOfSight(g, { x: 2, y: 2 }, { x: 2, y: 2 })).toBe(true);
  });

  it("is always true for adjacent tiles (nothing in between)", () => {
    const g = flat(5, 5);
    expect(hasLineOfSight(g, { x: 2, y: 2 }, { x: 3, y: 2 })).toBe(true);
    expect(hasLineOfSight(g, { x: 2, y: 2 }, { x: 3, y: 3 })).toBe(true);
  });

  it("is unobstructed across flat ground", () => {
    const g = flat(8, 1);
    expect(hasLineOfSight(g, { x: 0, y: 0 }, { x: 7, y: 0 })).toBe(true);
  });

  it("is blocked by a tall wall directly between two ground units", () => {
    // A height-3 pillar at x=3 between two ground (z=0) tiles on a row.
    const g = gridFromHeights([[0, 0, 0, 3, 0, 0, 0]]);
    expect(hasLineOfSight(g, { x: 0, y: 0 }, { x: 6, y: 0 })).toBe(false);
  });

  it("treats terrain a full level above the eyeline as cover", () => {
    // A height-1 ridge tops the ~0.5 eye-level sightline of two ground units.
    const g = gridFromHeights([[0, 1, 1, 0]]);
    expect(hasLineOfSight(g, { x: 0, y: 0 }, { x: 3, y: 0 })).toBe(false);
  });

  it("blocks a height-3 block sitting between two height-2 standers (throne cover)", () => {
    // Mirrors the phase4/phase5 dais: the height-3 plateau must block its shoulders.
    const g = gridFromHeights([[2, 3, 3, 2]]);
    expect(hasLineOfSight(g, { x: 0, y: 0 }, { x: 3, y: 0 })).toBe(false);
  });

  it("sees across tiles of the same height as the standers", () => {
    // Equal elevation is not cover — you can see across a flat plateau.
    const g = gridFromHeights([[2, 2, 2, 2]]);
    expect(hasLineOfSight(g, { x: 0, y: 0 }, { x: 3, y: 0 })).toBe(true);
  });

  it("lets the high ground see over a wall it stands above", () => {
    // Attacker on a height-4 cliff looking down past a height-2 tile to a target.
    const g = gridFromHeights([[4, 2, 0, 0]]);
    expect(hasLineOfSight(g, { x: 0, y: 0 }, { x: 3, y: 0 })).toBe(true);
  });

  it("does not squeeze a sightline through a 1-wide wall in a diagonal gap", () => {
    // Knight-shaped line (0,0)->(3,1); a tall wall in either grazed corner blocks.
    const wallAt20 = gridFromHeights([
      [0, 0, 9, 0],
      [0, 0, 0, 0],
    ]);
    expect(hasLineOfSight(wallAt20, { x: 0, y: 0 }, { x: 3, y: 1 })).toBe(false);
    const wallAt11 = gridFromHeights([
      [0, 0, 0, 0],
      [0, 9, 0, 0],
    ]);
    expect(hasLineOfSight(wallAt11, { x: 0, y: 0 }, { x: 3, y: 1 })).toBe(false);
  });

  it("is symmetric", () => {
    const g = gridFromHeights([[0, 0, 3, 0, 0]]);
    const a = { x: 0, y: 0 };
    const b = { x: 4, y: 0 };
    expect(hasLineOfSight(g, a, b)).toBe(hasLineOfSight(g, b, a));
  });
});

describe("line of sight blocked by a tall prop on flat ground", () => {
  const flat3 = (decor?: MapDef["decor"]): Grid => new Grid({
    id: "l", name: "l", intro: "", width: 3, height: 1,
    heights: [[0, 0, 0]], blocked: [[false, true, false]],
    decor, playerSpawns: [], enemies: [],
  });

  it("sees across flat ground with no prop", () => {
    expect(hasLineOfSight(flat3(), { x: 0, y: 0 }, { x: 2, y: 0 })).toBe(true);
  });
  it("is blocked by a tree (sightBlock) in the middle", () => {
    const g = flat3([{ pos: { x: 1, y: 0 }, propId: "tree" }]);
    expect(PROPS.tree.sightBlock).toBeGreaterThan(0);
    expect(hasLineOfSight(g, { x: 0, y: 0 }, { x: 2, y: 0 })).toBe(false);
  });
});

describe("hasLineOfSight at short range: the adjacency shortcut", () => {
  // Build a 2x2 grid where a sightBlock prop sits on one tile.
  const grid2x2 = (decor?: MapDef["decor"]): Grid => new Grid({
    id: "s", name: "s", intro: "", width: 2, height: 2,
    heights: [[0, 0], [0, 0]], decor, playerSpawns: [], enemies: [],
  });

  it("orthogonal adjacency has no intervening tile, so it always sees", () => {
    // (0,0)->(1,0): there is literally no tile between them. A tall prop on the
    // *target* tile never occludes the target itself. Lock the fast path.
    const g = grid2x2([{ pos: { x: 1, y: 0 }, propId: "tree" }]);
    expect(hasLineOfSight(g, { x: 0, y: 0 }, { x: 1, y: 0 })).toBe(true);
  });

  it("a tall prop in a diagonal corner gap occludes a diagonal shot", () => {
    // (0,0)->(1,1) is Chebyshev-adjacent but range-2: the segment grazes the
    // two orthogonal corners (1,0) and (0,1). A tree on (1,0) must block the
    // shot — the old `max(|dx|,|dy|)<=1` shortcut skipped these corners.
    const blockAt10 = grid2x2([{ pos: { x: 1, y: 0 }, propId: "tree" }]);
    expect(hasLineOfSight(blockAt10, { x: 0, y: 0 }, { x: 1, y: 1 })).toBe(false);
    const blockAt01 = grid2x2([{ pos: { x: 0, y: 1 }, propId: "tree" }]);
    expect(hasLineOfSight(blockAt01, { x: 0, y: 0 }, { x: 1, y: 1 })).toBe(false);
  });

  it("a clear diagonal corner gap still sees at range-2 diagonal", () => {
    expect(hasLineOfSight(grid2x2(), { x: 0, y: 0 }, { x: 1, y: 1 })).toBe(true);
  });

  it("a short prop in a diagonal corner does not occlude (below eyeline)", () => {
    // A stump-style prop has no sightBlock; corner-vetting must not over-block.
    const g = grid2x2([{ pos: { x: 1, y: 0 }, propId: "stump" }]);
    expect(PROPS.stump.sightBlock ?? 0).toBe(0);
    expect(hasLineOfSight(g, { x: 0, y: 0 }, { x: 1, y: 1 })).toBe(true);
  });
});
