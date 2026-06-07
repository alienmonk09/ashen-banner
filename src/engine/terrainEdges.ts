import type { TerrainType } from "../core/types";

/**
 * Blend priority for terrain edge-fringing (SP2c). When two terrain types meet,
 * the HIGHER-ranked one bleeds a thin fringe onto the lower-ranked tile, so the
 * seam reads as a natural transition (a shoreline, a sandy fringe) instead of a
 * hard checkerboard edge. Liquids/hazards sit highest (they visibly encroach on
 * land); bare rock sits lowest (everything fringes over it). Equal ranks never
 * fringe onto each other, so water↔lava seams don't shimmer.
 */
export const TERRAIN_BLEND_RANK: Record<TerrainType, number> = {
  water: 9,
  lava: 9,
  spring: 8,
  mire: 6,
  sand: 5,
  dirt: 4,
  wood: 3,
  grass: 2,
  rock: 1,
};

/** Minimal grid surface edgeBlends needs — satisfied by battle/grid `Grid`. */
export interface TerrainGridLike {
  inBounds(x: number, y: number): boolean;
  terrainAt(x: number, y: number): TerrainType;
}

/** One orthogonal neighbor whose terrain should fringe onto tile (x,y). */
export interface EdgeBlend {
  /** Neighbor offset in grid space. */
  dx: number;
  dy: number;
  /** The neighbor's terrain (the color that bleeds onto this tile). */
  terrain: TerrainType;
}

const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [0, -1], // N
  [1, 0], // E
  [0, 1], // S
  [-1, 0], // W
];

/**
 * Which of tile (x,y)'s four orthogonal neighbors should paint an edge fringe
 * onto it: the in-bounds neighbors whose terrain strictly outranks this tile's
 * (see TERRAIN_BLEND_RANK). Pure + deterministic — the renderer draws a band of
 * each returned neighbor's color along the corresponding screen edge.
 */
export function edgeBlends(grid: TerrainGridLike, x: number, y: number): EdgeBlend[] {
  const own = TERRAIN_BLEND_RANK[grid.terrainAt(x, y)];
  const out: EdgeBlend[] = [];
  for (const [dx, dy] of NEIGHBORS) {
    const nx = x + dx;
    const ny = y + dy;
    if (!grid.inBounds(nx, ny)) continue;
    const nt = grid.terrainAt(nx, ny);
    if (TERRAIN_BLEND_RANK[nt] > own) out.push({ dx, dy, terrain: nt });
  }
  return out;
}
