import { describe, it, expect } from "vitest";
import { Grid, key, manhattan, samePoint, occupancy, moveBlockers } from "../src/battle/grid";
import type { MapDef, Point, Unit } from "../src/core/types";

// --- Helpers -------------------------------------------------------------

/**
 * Build a MapDef with explicit dims. `heights` defaults to all-zero unless
 * provided; `blocked` is omitted unless explicitly passed (Grid then defaults
 * it to an all-false mask).
 */
function makeMap(opts: {
  width: number;
  height: number;
  heights?: number[][];
  blocked?: boolean[][];
}): MapDef {
  const { width, height } = opts;
  const heights =
    opts.heights ??
    Array.from({ length: height }, () => Array(width).fill(0));
  const base: MapDef = {
    id: "test",
    name: "Test",
    intro: "",
    width,
    height,
    heights,
    playerSpawns: [],
    enemies: [],
  };
  if (opts.blocked !== undefined) base.blocked = opts.blocked;
  return base;
}

/** Minimal Unit stub — occupancy only reads id, pos, and alive. */
function makeUnit(id: string, pos: Point, alive = true): Unit {
  return { id, pos, alive } as unknown as Unit;
}

// --- Grid.inBounds -------------------------------------------------------

describe("Grid.inBounds", () => {
  const grid = new Grid(makeMap({ width: 3, height: 2 }));

  it("returns true for the origin", () => {
    expect(grid.inBounds(0, 0)).toBe(true);
  });

  it("returns true for an interior tile", () => {
    expect(grid.inBounds(1, 1)).toBe(true);
  });

  it("returns true for the far corner (max valid indices)", () => {
    expect(grid.inBounds(2, 1)).toBe(true);
  });

  it("returns false when x equals width (boundary, exclusive)", () => {
    expect(grid.inBounds(3, 0)).toBe(false);
  });

  it("returns false when y equals height (boundary, exclusive)", () => {
    expect(grid.inBounds(0, 2)).toBe(false);
  });

  it("returns false for negative x", () => {
    expect(grid.inBounds(-1, 0)).toBe(false);
  });

  it("returns false for negative y", () => {
    expect(grid.inBounds(0, -1)).toBe(false);
  });

  it("returns false when both coords are out of bounds", () => {
    expect(grid.inBounds(99, 99)).toBe(false);
  });
});

// --- Grid.heightAt -------------------------------------------------------

describe("Grid.heightAt", () => {
  const grid = new Grid(
    makeMap({
      width: 2,
      height: 2,
      heights: [
        [0, 1],
        [2, 3],
      ],
    }),
  );

  it("returns the stored height for an in-bounds tile (row-major [y][x])", () => {
    expect(grid.heightAt(0, 0)).toBe(0);
    expect(grid.heightAt(1, 0)).toBe(1);
    expect(grid.heightAt(0, 1)).toBe(2);
    expect(grid.heightAt(1, 1)).toBe(3);
  });

  it("returns 0 for tiles past the width boundary", () => {
    expect(grid.heightAt(2, 0)).toBe(0);
  });

  it("returns 0 for tiles past the height boundary", () => {
    expect(grid.heightAt(0, 2)).toBe(0);
  });

  it("returns 0 for negative coordinates", () => {
    expect(grid.heightAt(-1, 0)).toBe(0);
    expect(grid.heightAt(0, -1)).toBe(0);
  });
});

// --- Grid.isBlocked ------------------------------------------------------

describe("Grid.isBlocked", () => {
  it("returns false everywhere when no blocked mask is supplied", () => {
    const grid = new Grid(makeMap({ width: 3, height: 3 }));
    expect(grid.isBlocked(0, 0)).toBe(false);
    expect(grid.isBlocked(1, 2)).toBe(false);
    expect(grid.isBlocked(2, 2)).toBe(false);
  });

  it("respects a supplied mask, returning true for masked tiles", () => {
    const grid = new Grid(
      makeMap({
        width: 2,
        height: 2,
        blocked: [
          [false, true],
          [true, false],
        ],
      }),
    );
    expect(grid.isBlocked(1, 0)).toBe(true);
    expect(grid.isBlocked(0, 1)).toBe(true);
  });

  it("returns false for unmasked tiles when a mask is present", () => {
    const grid = new Grid(
      makeMap({
        width: 2,
        height: 2,
        blocked: [
          [false, true],
          [true, false],
        ],
      }),
    );
    expect(grid.isBlocked(0, 0)).toBe(false);
    expect(grid.isBlocked(1, 1)).toBe(false);
  });

  it("returns true for out-of-bounds tiles past the boundary", () => {
    const grid = new Grid(makeMap({ width: 2, height: 2 }));
    expect(grid.isBlocked(2, 0)).toBe(true);
    expect(grid.isBlocked(0, 2)).toBe(true);
  });

  it("returns true for negative coordinates", () => {
    const grid = new Grid(makeMap({ width: 2, height: 2 }));
    expect(grid.isBlocked(-1, 0)).toBe(true);
    expect(grid.isBlocked(0, -1)).toBe(true);
  });

  it("treats out-of-bounds as blocked even when an explicit mask exists", () => {
    const grid = new Grid(
      makeMap({
        width: 2,
        height: 2,
        blocked: [
          [false, false],
          [false, false],
        ],
      }),
    );
    expect(grid.isBlocked(5, 5)).toBe(true);
  });
});

// --- key -----------------------------------------------------------------

describe("key", () => {
  it("formats a point as \"x,y\"", () => {
    expect(key({ x: 1, y: 2 })).toBe("1,2");
  });

  it("handles the origin", () => {
    expect(key({ x: 0, y: 0 })).toBe("0,0");
  });

  it("handles negative coordinates", () => {
    expect(key({ x: -3, y: -4 })).toBe("-3,-4");
  });

  it("produces distinct keys for swapped coordinates", () => {
    expect(key({ x: 1, y: 2 })).not.toBe(key({ x: 2, y: 1 }));
  });

  it("produces equal keys for equal points", () => {
    expect(key({ x: 7, y: 9 })).toBe(key({ x: 7, y: 9 }));
  });
});

// --- manhattan -----------------------------------------------------------

describe("manhattan", () => {
  it("is 0 for identical points", () => {
    expect(manhattan({ x: 2, y: 3 }, { x: 2, y: 3 })).toBe(0);
  });

  it("sums absolute deltas on both axes", () => {
    expect(manhattan({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(7);
  });

  it("is symmetric", () => {
    const a = { x: 1, y: 5 };
    const b = { x: 4, y: 2 };
    expect(manhattan(a, b)).toBe(manhattan(b, a));
  });

  it("handles a pure horizontal distance", () => {
    expect(manhattan({ x: 1, y: 7 }, { x: 6, y: 7 })).toBe(5);
  });

  it("handles a pure vertical distance", () => {
    expect(manhattan({ x: 4, y: 1 }, { x: 4, y: 9 })).toBe(8);
  });

  it("handles negative coordinates", () => {
    expect(manhattan({ x: -2, y: -2 }, { x: 1, y: 1 })).toBe(6);
  });
});

// --- samePoint -----------------------------------------------------------

describe("samePoint", () => {
  it("returns true for points with equal coordinates", () => {
    expect(samePoint({ x: 3, y: 4 }, { x: 3, y: 4 })).toBe(true);
  });

  it("returns false when x differs", () => {
    expect(samePoint({ x: 3, y: 4 }, { x: 5, y: 4 })).toBe(false);
  });

  it("returns false when y differs", () => {
    expect(samePoint({ x: 3, y: 4 }, { x: 3, y: 6 })).toBe(false);
  });

  it("returns false for swapped coordinates that are not on the diagonal", () => {
    expect(samePoint({ x: 1, y: 2 }, { x: 2, y: 1 })).toBe(false);
  });

  it("returns true at the origin", () => {
    expect(samePoint({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe(true);
  });
});

// --- occupancy -----------------------------------------------------------

describe("occupancy", () => {
  it("returns an empty set for no units", () => {
    expect(occupancy([]).size).toBe(0);
  });

  it("includes the tile keys of all living units", () => {
    const units = [
      makeUnit("a", { x: 0, y: 0 }),
      makeUnit("b", { x: 1, y: 2 }),
    ];
    const set = occupancy(units);
    expect(set.size).toBe(2);
    expect(set.has("0,0")).toBe(true);
    expect(set.has("1,2")).toBe(true);
  });

  it("skips dead units", () => {
    const units = [
      makeUnit("a", { x: 0, y: 0 }, true),
      makeUnit("b", { x: 1, y: 1 }, false),
    ];
    const set = occupancy(units);
    expect(set.size).toBe(1);
    expect(set.has("0,0")).toBe(true);
    expect(set.has("1,1")).toBe(false);
  });

  it("excludes the unit matching excludeId", () => {
    const units = [
      makeUnit("a", { x: 0, y: 0 }),
      makeUnit("b", { x: 1, y: 1 }),
      makeUnit("c", { x: 2, y: 2 }),
    ];
    const set = occupancy(units, "b");
    expect(set.size).toBe(2);
    expect(set.has("1,1")).toBe(false);
    expect(set.has("0,0")).toBe(true);
    expect(set.has("2,2")).toBe(true);
  });

  it("returns all living units when excludeId matches nobody", () => {
    const units = [
      makeUnit("a", { x: 0, y: 0 }),
      makeUnit("b", { x: 1, y: 1 }),
    ];
    const set = occupancy(units, "zzz");
    expect(set.size).toBe(2);
  });

  it("combines excludeId and dead-unit filtering", () => {
    const units = [
      makeUnit("a", { x: 0, y: 0 }, true),
      makeUnit("b", { x: 1, y: 1 }, false),
      makeUnit("c", { x: 2, y: 2 }, true),
    ];
    const set = occupancy(units, "a");
    expect(set.size).toBe(1);
    expect(set.has("2,2")).toBe(true);
    expect(set.has("0,0")).toBe(false);
    expect(set.has("1,1")).toBe(false);
  });

  it("collapses units sharing the same tile into one key", () => {
    const units = [
      makeUnit("a", { x: 4, y: 4 }),
      makeUnit("b", { x: 4, y: 4 }),
    ];
    const set = occupancy(units);
    expect(set.size).toBe(1);
    expect(set.has("4,4")).toBe(true);
  });

  it("does not mutate the input units array", () => {
    const units = [makeUnit("a", { x: 0, y: 0 })];
    occupancy(units, "a");
    expect(units.length).toBe(1);
  });
});

// --- moveBlockers --------------------------------------------------------

/** Unit stub with a team — moveBlockers reads id, pos, alive, and team. */
function makeTeamUnit(id: string, pos: Point, team: "player" | "enemy", alive = true): Unit {
  return { id, pos, alive, team } as unknown as Unit;
}

describe("moveBlockers", () => {
  it("classifies same-team units as pass-through and other-team as solid", () => {
    const mover = makeTeamUnit("m", { x: 0, y: 0 }, "player");
    const units = [
      mover,
      makeTeamUnit("ally", { x: 1, y: 0 }, "player"),
      makeTeamUnit("foe", { x: 2, y: 0 }, "enemy"),
    ];
    const { solid, passThrough } = moveBlockers(units, mover);
    expect(passThrough.has("1,0")).toBe(true);
    expect(passThrough.has("2,0")).toBe(false);
    expect(solid.has("2,0")).toBe(true);
    expect(solid.has("1,0")).toBe(false);
  });

  it("never includes the mover's own tile in either set", () => {
    const mover = makeTeamUnit("m", { x: 3, y: 3 }, "enemy");
    const { solid, passThrough } = moveBlockers([mover], mover);
    expect(solid.has("3,3")).toBe(false);
    expect(passThrough.has("3,3")).toBe(false);
    expect(solid.size).toBe(0);
    expect(passThrough.size).toBe(0);
  });

  it("skips dead units regardless of team", () => {
    const mover = makeTeamUnit("m", { x: 0, y: 0 }, "player");
    const units = [
      mover,
      makeTeamUnit("deadAlly", { x: 1, y: 0 }, "player", false),
      makeTeamUnit("deadFoe", { x: 0, y: 1 }, "enemy", false),
    ];
    const { solid, passThrough } = moveBlockers(units, mover);
    expect(passThrough.size).toBe(0);
    expect(solid.size).toBe(0);
  });

  it("is symmetric: an enemy mover treats enemies as pass-through and players as solid", () => {
    const mover = makeTeamUnit("m", { x: 0, y: 0 }, "enemy");
    const units = [
      mover,
      makeTeamUnit("foeAlly", { x: 1, y: 0 }, "enemy"),
      makeTeamUnit("player", { x: 0, y: 1 }, "player"),
    ];
    const { solid, passThrough } = moveBlockers(units, mover);
    expect(passThrough.has("1,0")).toBe(true);
    expect(solid.has("0,1")).toBe(true);
  });
});
