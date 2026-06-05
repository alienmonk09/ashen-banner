import type { TerrainType } from "../core/types";

/**
 * Per-terrain HSL base. The renderer shades the tile top brighter with height
 * (`l + z*step`) and the cliff walls darker, so one entry drives top + walls +
 * a subtle speckle. Kept as HSL components (not baked strings) so shading is a
 * cheap arithmetic tweak.
 */
export interface TerrainStyle {
  h: number;
  s: number;
  /** Base lightness of the tile top at z=0. */
  l: number;
}

export const TERRAIN: Record<TerrainType, TerrainStyle> = {
  grass: { h: 110, s: 32, l: 33 },
  dirt: { h: 30, s: 34, l: 32 },
  rock: { h: 220, s: 8, l: 40 },
  sand: { h: 46, s: 44, l: 60 },
  water: { h: 205, s: 55, l: 40 },
  wood: { h: 28, s: 42, l: 36 },
  lava: { h: 14, s: 85, l: 46 },
  spring: { h: 168, s: 58, l: 52 },
};

/**
 * Terrain is purely cosmetic — movement is still governed by the `blocked` mask.
 * When a map omits `terrain`, derive a pleasant default from height + blocked so
 * elevation alone yields variety: blocked flats read as water (rivers/chasms),
 * blocked heights as rock (pillars/cliffs), tall ground as rock, mid as dirt,
 * and the floor as grass. Maps can still override with an explicit `terrain`.
 */
export function defaultTerrain(blocked: boolean, height: number): TerrainType {
  if (blocked) return height > 0 ? "rock" : "water";
  if (height >= 2) return "rock";
  if (height === 1) return "dirt";
  return "grass";
}

/**
 * Per-turn HP effect a unit suffers when it ends its turn on this terrain.
 * Returns null for terrain types with no hazard/benefit (the common case).
 * `fracMaxHp` is the fraction of the unit's maxHp used to compute the delta.
 */
export function terrainEffect(t: TerrainType): { kind: "damage" | "heal"; fracMaxHp: number } | null {
  if (t === "lava") return { kind: "damage", fracMaxHp: 0.15 };
  if (t === "spring") return { kind: "heal", fracMaxHp: 0.12 };
  return null;
}
