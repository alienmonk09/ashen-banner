import { describe, it, expect } from "vitest";
import type { MapDef, Point } from "../src/core/types";
import { Grid, key } from "../src/battle/grid";
import { reachable, pathTo } from "../src/battle/pathfinding";

/**
 * Build a small flat 5x5 map (all heights 0, nothing blocked) unless
 * overrides are provided. Only the fields Grid/pathfinding read matter;
 * the rest are filled to satisfy MapDef.
 */
function makeMap(overrides: Partial<MapDef> = {}): MapDef {
  const width = overrides.width ?? 5;
  const height = overrides.height ?? 5;
  return {
    id: "test",
    name: "Test",
    intro: "",
    width,
    height,
    heights:
      overrides.heights ??
      Array.from({ length: height }, () => Array(width).fill(0)),
    blocked: overrides.blocked,
    playerSpawns: [],
    enemies: [],
  };
}

const NO_OCCUPANTS = new Set<string>();

describe("reachable", () => {
  it("includes the start tile at cost 0", () => {
    const grid = new Grid(makeMap());
    const start: Point = { x: 2, y: 2 };
    const { costs } = reachable(grid, start, 3, 1, NO_OCCUPANTS);
    expect(costs.get(key(start))).toBe(0);
  });

  it("sets prev of the start tile to null", () => {
    const grid = new Grid(makeMap());
    const start: Point = { x: 2, y: 2 };
    const { prev } = reachable(grid, start, 3, 1, NO_OCCUPANTS);
    expect(prev.get(key(start))).toBeNull();
  });

  it("with move 0 only reaches the start tile", () => {
    const grid = new Grid(makeMap());
    const start: Point = { x: 2, y: 2 };
    const { costs } = reachable(grid, start, 0, 1, NO_OCCUPANTS);
    expect(costs.size).toBe(1);
    expect(costs.has(key(start))).toBe(true);
  });

  it("reaches the 4 orthogonal neighbors at cost 1 with move 1", () => {
    const grid = new Grid(makeMap());
    const start: Point = { x: 2, y: 2 };
    const { costs } = reachable(grid, start, 1, 1, NO_OCCUPANTS);
    expect(costs.get("3,2")).toBe(1);
    expect(costs.get("1,2")).toBe(1);
    expect(costs.get("2,3")).toBe(1);
    expect(costs.get("2,1")).toBe(1);
    // Diagonal is not reachable in a single orthogonal step.
    expect(costs.has("3,3")).toBe(false);
  });

  it("does not exceed the move budget (no tile beyond `move` steps)", () => {
    const grid = new Grid(makeMap());
    const start: Point = { x: 2, y: 2 };
    const move = 2;
    const { costs } = reachable(grid, start, move, 1, NO_OCCUPANTS);
    for (const c of costs.values()) {
      expect(c).toBeLessThanOrEqual(move);
    }
    // A tile exactly `move` steps away is included...
    expect(costs.get("0,2")).toBe(2);
    // ...but one step further is not.
    expect(costs.has("2,2")).toBe(true); // start itself
    expect(costs.has("4,4")).toBe(false); // manhattan dist 4 > move 2
  });

  it("assigns BFS cost equal to manhattan distance on open terrain", () => {
    const grid = new Grid(makeMap());
    const start: Point = { x: 0, y: 0 };
    const { costs } = reachable(grid, start, 4, 1, NO_OCCUPANTS);
    expect(costs.get("1,0")).toBe(1);
    expect(costs.get("0,1")).toBe(1);
    expect(costs.get("2,0")).toBe(2);
    expect(costs.get("1,1")).toBe(2);
    expect(costs.get("2,2")).toBe(4);
  });

  it("stays in bounds (never includes out-of-bounds tiles)", () => {
    const grid = new Grid(makeMap({ width: 3, height: 3 }));
    const start: Point = { x: 0, y: 0 };
    const { costs } = reachable(grid, start, 10, 1, NO_OCCUPANTS);
    for (const k of costs.keys()) {
      const [x, y] = k.split(",").map(Number);
      expect(grid.inBounds(x, y)).toBe(true);
    }
    // 3x3 fully open -> 9 tiles reachable.
    expect(costs.size).toBe(9);
  });

  it("excludes blocked tiles and does not path through them", () => {
    // Block the whole column x=1 so x>=2 is unreachable from x=0.
    const blocked = Array.from({ length: 5 }, () => Array(5).fill(false));
    for (let y = 0; y < 5; y++) blocked[y][1] = true;
    const grid = new Grid(makeMap({ blocked }));
    const start: Point = { x: 0, y: 2 };
    const { costs } = reachable(grid, start, 10, 1, NO_OCCUPANTS);
    expect(costs.has("1,2")).toBe(false); // blocked tile itself
    expect(costs.has("2,2")).toBe(false); // walled off behind the column
    // The open column x=0 is still fully reachable.
    expect(costs.has("0,0")).toBe(true);
    expect(costs.has("0,4")).toBe(true);
  });

  it("excludes occupied tiles and does not path through them", () => {
    // Occupy the whole column x=1 so x>=2 is unreachable from x=0.
    const occupied = new Set<string>();
    for (let y = 0; y < 5; y++) occupied.add(`1,${y}`);
    const grid = new Grid(makeMap());
    const start: Point = { x: 0, y: 2 };
    const { costs } = reachable(grid, start, 10, 1, occupied);
    expect(costs.has("1,2")).toBe(false); // occupied tile
    expect(costs.has("2,2")).toBe(false); // blocked off behind occupants
    expect(costs.has("0,0")).toBe(true);
  });

  it("does not treat the start tile as occupied even if listed", () => {
    const grid = new Grid(makeMap());
    const start: Point = { x: 2, y: 2 };
    const occupied = new Set<string>([key(start)]);
    const { costs } = reachable(grid, start, 2, 1, occupied);
    // Start is seeded before the occupancy check, so it stays at cost 0.
    expect(costs.get(key(start))).toBe(0);
  });

  it("refuses a step where height difference exceeds jump", () => {
    // Tile (3,2) is a cliff (height 5); everything else is 0. jump=1.
    const heights = Array.from({ length: 5 }, () => Array(5).fill(0));
    heights[2][3] = 5;
    const grid = new Grid(makeMap({ heights }));
    const start: Point = { x: 2, y: 2 };
    const { costs } = reachable(grid, start, 5, 1, NO_OCCUPANTS);
    expect(costs.has("3,2")).toBe(false);
  });

  it("allows a step where height difference is within jump", () => {
    // (3,2) is one step up; with jump=1 it is reachable, with jump=0 it is not.
    const heights = Array.from({ length: 5 }, () => Array(5).fill(0));
    heights[2][3] = 1;
    const grid = new Grid(makeMap({ heights }));
    const start: Point = { x: 2, y: 2 };

    const okJump = reachable(grid, start, 3, 1, NO_OCCUPANTS);
    expect(okJump.costs.get("3,2")).toBe(1);

    const noJump = reachable(grid, start, 3, 0, NO_OCCUPANTS);
    expect(noJump.costs.has("3,2")).toBe(false);
  });

  it("allows descending within jump (height diff is absolute)", () => {
    // Start on a plateau (height 2); neighbors at height 0, jump 2 -> allowed.
    const heights = Array.from({ length: 5 }, () => Array(5).fill(0));
    heights[2][2] = 2;
    const grid = new Grid(makeMap({ heights }));
    const start: Point = { x: 2, y: 2 };
    const ok = reachable(grid, start, 1, 2, NO_OCCUPANTS);
    expect(ok.costs.get("1,2")).toBe(1);
    const blocked = reachable(grid, start, 1, 1, NO_OCCUPANTS);
    expect(blocked.costs.has("1,2")).toBe(false);
  });

  it("keeps the first (cheapest) cost when a tile is reachable by multiple paths", () => {
    const grid = new Grid(makeMap());
    const start: Point = { x: 0, y: 0 };
    const { costs } = reachable(grid, start, 4, 1, NO_OCCUPANTS);
    // (1,1) is reachable via (1,0) or (0,1), both at cost 2 — never overwritten higher.
    expect(costs.get("1,1")).toBe(2);
  });

  it("lists every reachable tile as a destination when there are no pass-through tiles", () => {
    const grid = new Grid(makeMap({ width: 3, height: 3 }));
    const start: Point = { x: 0, y: 0 };
    const { costs, destinations } = reachable(grid, start, 10, 1, NO_OCCUPANTS);
    expect(destinations.size).toBe(costs.size);
    for (const k of costs.keys()) expect(destinations.has(k)).toBe(true);
  });
});

describe("reachable pass-through (allies)", () => {
  it("routes through a pass-through tile but excludes it from destinations", () => {
    // Block column x=1 except the single gap at (1,2), which is an ally tile.
    const blocked = Array.from({ length: 5 }, () => Array(5).fill(false));
    for (let y = 0; y < 5; y++) if (y !== 2) blocked[y][1] = true;
    const grid = new Grid(makeMap({ blocked }));
    const start: Point = { x: 0, y: 2 };
    const passThrough = new Set<string>(["1,2"]);
    const { costs, destinations } = reachable(grid, start, 10, 1, NO_OCCUPANTS, passThrough);
    // The ally tile is crossed (recorded in costs) and the far side is reached...
    expect(costs.has("1,2")).toBe(true);
    expect(costs.has("2,2")).toBe(true);
    // ...but you cannot stop on the ally tile itself.
    expect(destinations.has("1,2")).toBe(false);
    expect(destinations.has("2,2")).toBe(true);
  });

  it("reconstructs a path straight through an ally tile", () => {
    const grid = new Grid(makeMap());
    const start: Point = { x: 0, y: 0 };
    const passThrough = new Set<string>(["1,0"]);
    const result = reachable(grid, start, 4, 1, NO_OCCUPANTS, passThrough);
    const path = pathTo(result, { x: 2, y: 0 });
    expect(path).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
  });

  it("keeps solid (5th arg) tiles fully impassable — no crossing, no stopping", () => {
    const grid = new Grid(makeMap());
    const start: Point = { x: 0, y: 2 };
    const solid = new Set<string>();
    for (let y = 0; y < 5; y++) solid.add(`1,${y}`);
    const { costs, destinations } = reachable(grid, start, 10, 1, solid);
    expect(costs.has("1,2")).toBe(false);
    expect(costs.has("2,2")).toBe(false);
    expect(destinations.has("1,2")).toBe(false);
  });

  it("treats a tile listed as both solid and pass-through as solid (solid wins)", () => {
    // Corridor: column x=1 is walled except a single gap at (1,2). The far side
    // (x>=2) is reachable only by crossing that gap, so the gap's classification
    // is observable. Same tile, two classifications, contrasting outcomes.
    const blocked = Array.from({ length: 5 }, () => Array(5).fill(false));
    for (let y = 0; y < 5; y++) if (y !== 2) blocked[y][1] = true;
    const grid = new Grid(makeMap({ blocked }));
    const start: Point = { x: 0, y: 2 };

    // Gap is BOTH solid and pass-through -> solid wins: gap sealed, far side closed.
    const both = reachable(grid, start, 10, 1, new Set(["1,2"]), new Set(["1,2"]));
    expect(both.costs.has("1,2")).toBe(false);
    expect(both.costs.has("2,2")).toBe(false);

    // Same gap as pass-through ONLY -> crossable: far side opens, gap not a stop.
    const passOnly = reachable(grid, start, 10, 1, new Set(), new Set(["1,2"]));
    expect(passOnly.costs.has("2,2")).toBe(true);
    expect(passOnly.destinations.has("1,2")).toBe(false);
  });
});

describe("pathTo", () => {
  it("returns null for an unreachable target", () => {
    const grid = new Grid(makeMap());
    const start: Point = { x: 0, y: 0 };
    const result = reachable(grid, start, 2, 1, NO_OCCUPANTS);
    // (4,4) is manhattan distance 8 — far outside a move-2 budget.
    expect(pathTo(result, { x: 4, y: 4 })).toBeNull();
  });

  it("returns a single-element path when target equals start", () => {
    const grid = new Grid(makeMap());
    const start: Point = { x: 2, y: 2 };
    const result = reachable(grid, start, 3, 1, NO_OCCUPANTS);
    const path = pathTo(result, start);
    expect(path).toEqual([{ x: 2, y: 2 }]);
  });

  it("reconstructs a path that begins at start and ends at target", () => {
    const grid = new Grid(makeMap());
    const start: Point = { x: 0, y: 0 };
    const target: Point = { x: 2, y: 1 };
    const result = reachable(grid, start, 5, 1, NO_OCCUPANTS);
    const path = pathTo(result, target);
    expect(path).not.toBeNull();
    expect(path![0]).toEqual(start);
    expect(path![path!.length - 1]).toEqual(target);
  });

  it("reconstructs a contiguous path (each step is a single orthogonal move)", () => {
    const grid = new Grid(makeMap());
    const start: Point = { x: 0, y: 0 };
    const target: Point = { x: 3, y: 2 };
    const result = reachable(grid, start, 6, 1, NO_OCCUPANTS);
    const path = pathTo(result, target)!;
    expect(path).not.toBeNull();
    for (let i = 1; i < path.length; i++) {
      const dx = Math.abs(path[i].x - path[i - 1].x);
      const dy = Math.abs(path[i].y - path[i - 1].y);
      expect(dx + dy).toBe(1);
    }
  });

  it("produces a path whose length matches the target's step cost plus one", () => {
    const grid = new Grid(makeMap());
    const start: Point = { x: 0, y: 0 };
    const target: Point = { x: 3, y: 2 };
    const result = reachable(grid, start, 6, 1, NO_OCCUPANTS);
    const path = pathTo(result, target)!;
    // path includes start, so length = cost + 1.
    expect(path.length).toBe(result.costs.get(key(target))! + 1);
    expect(path.length).toBe(6); // manhattan distance 5 + start
  });

  it("routes around a wall instead of through it", () => {
    // Wall along x=2 for y=0..2, with a gap at y=3 forcing a detour.
    const blocked = Array.from({ length: 5 }, () => Array(5).fill(false));
    blocked[0][2] = true;
    blocked[1][2] = true;
    blocked[2][2] = true;
    const grid = new Grid(makeMap({ blocked }));
    const start: Point = { x: 0, y: 0 };
    const target: Point = { x: 4, y: 0 };
    const result = reachable(grid, start, 20, 1, NO_OCCUPANTS);
    const path = pathTo(result, target);
    expect(path).not.toBeNull();
    // No tile in the path may be a blocked wall tile.
    for (const p of path!) {
      expect(grid.isBlocked(p.x, p.y)).toBe(false);
    }
    // It must reach below the wall (y >= 3) to get around it.
    expect(path!.some((p) => p.y >= 3)).toBe(true);
  });
});
