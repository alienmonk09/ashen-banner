import type { AoeShape, Point, Unit } from "../core/types";
import { Grid, key, manhattan, samePoint } from "./grid";
import { directionTo, dirVector } from "./facing";

/** All in-bounds tiles within manhattan `range` of origin (excludes origin for range>0 attacks if requested). */
export function tilesInRange(
  grid: Grid,
  origin: Point,
  range: number,
  includeSelf = false,
): Point[] {
  const out: Point[] = [];
  for (let dy = -range; dy <= range; dy++) {
    for (let dx = -range; dx <= range; dx++) {
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist > range) continue;
      if (dist === 0 && !includeSelf) continue;
      const x = origin.x + dx;
      const y = origin.y + dy;
      if (!grid.inBounds(x, y)) continue;
      out.push({ x, y });
    }
  }
  return out;
}

/** Tiles affected by an AoE shape centered at `center`. */
export function aoeTiles(grid: Grid, center: Point, shape: AoeShape): Point[] {
  const out: Point[] = [];
  const push = (x: number, y: number) => {
    if (grid.inBounds(x, y)) out.push({ x, y });
  };
  switch (shape) {
    case "single":
      push(center.x, center.y);
      break;
    case "cross":
      push(center.x, center.y);
      push(center.x + 1, center.y);
      push(center.x - 1, center.y);
      push(center.x, center.y + 1);
      push(center.x, center.y - 1);
      break;
    case "square3":
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          push(center.x + dx, center.y + dy);
        }
      }
      break;
  }
  return out;
}

export function inRange(origin: Point, target: Point, range: number): boolean {
  return manhattan(origin, target) <= range && manhattan(origin, target) > 0;
}

/**
 * Compute the best adjacent landing tile for a leaping caster who wants to
 * land next to `target`. Candidates are the 4 orthogonal neighbours of
 * `target`: in-bounds, not grid-blocked, not occupied by another living unit
 * (the caster's own tile is always a valid candidate). Among valid tiles the
 * one with smallest manhattan distance to the caster's current position wins
 * (ties broken by stable insertion order: N, E, S, W).
 *
 * Returns `null` when the caster is already adjacent to the target (no leap
 * needed) or when every neighbouring tile is blocked/occupied.
 */
export function leapLanding(grid: Grid, units: Unit[], caster: Unit, target: Point): Point | null {
  // Already adjacent — strike in place.
  if (manhattan(caster.pos, target) <= 1) return null;
  // Occupancy: all living units except the caster itself.
  const occ = new Set(
    units.filter((u) => u.alive && u.id !== caster.id).map((u) => key(u.pos)),
  );
  const deltas: Point[] = [
    { x: 0, y: -1 }, // N
    { x: 1, y: 0 },  // E
    { x: 0, y: 1 },  // S
    { x: -1, y: 0 }, // W
  ];
  let best: Point | null = null;
  let bestDist = Infinity;
  for (const d of deltas) {
    const nx = target.x + d.x;
    const ny = target.y + d.y;
    if (!grid.inBounds(nx, ny)) continue;
    if (grid.isBlocked(nx, ny)) continue;
    if (occ.has(key({ x: nx, y: ny }))) continue;
    const dist = manhattan(caster.pos, { x: nx, y: ny });
    if (dist < bestDist) {
      bestDist = dist;
      best = { x: nx, y: ny };
    }
  }
  return best;
}

/**
 * Compute the landing tile when a unit at `target` is shoved `distance` tiles
 * directly away from `caster` (or pulled toward it when `pull` is true). Steps
 * are blocked by the grid edge, blocked tiles, and tiles occupied by other
 * living units. Returns the last valid tile (may equal `target` if every step
 * is blocked). A pull never moves the target onto or past the caster's tile.
 */
export function knockbackTo(
  grid: Grid,
  units: Unit[],
  caster: Point,
  target: Point,
  distance: number,
  pull = false,
): Point {
  // Shove: step away from caster. Pull: step toward caster (reverse direction).
  const dir = directionTo(caster, target);
  const rawStep = dirVector(dir);
  const step = pull
    ? { x: -rawStep.x, y: -rawStep.y }
    : rawStep;
  // Occupancy of all living units except the unit being shoved/pulled.
  const occ = new Set(
    units.filter((u) => u.alive && !samePoint(u.pos, target)).map((u) => key(u.pos)),
  );
  let cur = { ...target };
  for (let i = 0; i < distance; i++) {
    const nx = cur.x + step.x;
    const ny = cur.y + step.y;
    if (!grid.inBounds(nx, ny)) break;
    if (grid.isBlocked(nx, ny)) break;
    if (occ.has(key({ x: nx, y: ny }))) break;
    // A pull must never land the target on or past the caster's tile.
    if (pull && samePoint({ x: nx, y: ny }, caster)) break;
    cur = { x: nx, y: ny };
  }
  return cur;
}
