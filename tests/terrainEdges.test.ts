import { describe, it, expect } from "vitest";
import type { TerrainType } from "../src/core/types";
import { TERRAIN_BLEND_RANK, edgeBlends } from "../src/engine/terrainEdges";

/** Build a tiny terrain grid stub from a row-major [y][x] array. OOB → out of bounds. */
function stub(rows: TerrainType[][]) {
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
  return {
    inBounds: (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h,
    terrainAt: (x: number, y: number) => rows[y][x],
  };
}

describe("TERRAIN_BLEND_RANK", () => {
  it("assigns a rank to every terrain type and ranks liquids above land", () => {
    const types: TerrainType[] = ["grass", "dirt", "rock", "sand", "water", "wood", "lava", "spring", "mire"];
    for (const t of types) expect(TERRAIN_BLEND_RANK[t]).toBeGreaterThan(0);
    // liquids/hazards bleed onto land, not the reverse
    expect(TERRAIN_BLEND_RANK.water).toBeGreaterThan(TERRAIN_BLEND_RANK.grass);
    expect(TERRAIN_BLEND_RANK.water).toBeGreaterThan(TERRAIN_BLEND_RANK.dirt);
    expect(TERRAIN_BLEND_RANK.lava).toBeGreaterThan(TERRAIN_BLEND_RANK.rock);
    expect(TERRAIN_BLEND_RANK.sand).toBeGreaterThan(TERRAIN_BLEND_RANK.grass);
  });
});

describe("edgeBlends", () => {
  it("returns nothing for a tile whose 4 neighbors are the same terrain", () => {
    const g = stub([
      ["grass", "grass", "grass"],
      ["grass", "grass", "grass"],
      ["grass", "grass", "grass"],
    ]);
    expect(edgeBlends(g, 1, 1)).toEqual([]);
  });

  it("returns a higher-rank neighbor (water blends onto centre grass)", () => {
    const g = stub([
      ["grass", "water", "grass"],
      ["grass", "grass", "grass"],
      ["grass", "grass", "grass"],
    ]);
    const b = edgeBlends(g, 1, 1);
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ dx: 0, dy: -1, terrain: "water" });
  });

  it("does NOT blend a lower-rank neighbor onto a higher-rank tile (grass does not paint onto water)", () => {
    const g = stub([
      ["water", "grass", "water"],
      ["water", "water", "water"],
      ["water", "water", "water"],
    ]);
    // centre is water (high rank); the grass to the north must not blend onto it
    expect(edgeBlends(g, 1, 1)).toEqual([]);
  });

  it("does not blend equal-rank neighbors (no water<->lava mutual fringe)", () => {
    const g = stub([
      ["lava", "water", "lava"],
      ["water", "water", "water"],
      ["water", "water", "water"],
    ]);
    expect(edgeBlends(g, 1, 1)).toEqual([]);
  });

  it("ignores out-of-bounds neighbors", () => {
    const g = stub([["grass", "grass", "grass"]]);
    // corner tile: its N/S/W neighbors are OOB; only E is in bounds and equal
    expect(edgeBlends(g, 0, 0)).toEqual([]);
  });

  it("reports multiple blending edges and only the ones that outrank", () => {
    const g = stub([
      ["grass", "water", "grass"],
      ["rock", "grass", "lava"],
      ["grass", "grass", "grass"],
    ]);
    const b = edgeBlends(g, 1, 1);
    // N=water (rank>grass) yes; W=rock (rank<grass) no; E=lava yes; S=grass no
    const dirs = b.map((e) => `${e.dx},${e.dy}:${e.terrain}`).sort();
    expect(dirs).toEqual(["0,-1:water", "1,0:lava"]);
  });
});
