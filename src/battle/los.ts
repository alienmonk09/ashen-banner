import type { Point } from "../core/types";
import type { Grid } from "./grid";

/**
 * Height (in tile-z levels) of a unit's "eye" above the top of its tile. Kept
 * below one level on purpose: terrain that rises a full level or more above the
 * eyeline counts as cover, so a height-3 block between two height-2 standers
 * actually blocks (its top, 3, clears the 2.5 sightline). Raising this past 1.0
 * would let units shoot straight through such cover.
 */
const EYE = 0.5;

/**
 * Line of sight between two tiles for ranged attacks/spells. Walks every cell
 * the eye-to-eye segment crosses (including the orthogonal cells either side of
 * a diagonal step, so a thin wall in a diagonal gap still blocks) and reports no
 * sight if any intervening tile's top rises above the interpolated sightline.
 * Same/adjacent tiles always see each other. The high ground gets a clearer view
 * (its eye sits higher, so the line clears nearer terrain).
 */
export function hasLineOfSight(grid: Grid, from: Point, to: Point): boolean {
  if (from.x === to.x && from.y === to.y) return true;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) <= 1) return true; // nothing in between
  const z0 = grid.heightAt(from.x, from.y) + EYE;
  const z1 = grid.heightAt(to.x, to.y) + EYE;

  const blocks = (cx: number, cy: number, t: number): boolean => {
    if (!grid.inBounds(cx, cy)) return false;
    if ((cx === from.x && cy === from.y) || (cx === to.x && cy === to.y)) return false;
    const lineZ = z0 + (z1 - z0) * t;
    return grid.heightAt(cx, cy) + grid.sightBlockAt(cx, cy) > lineZ + 1e-6;
  };

  const steps = Math.max(2, Math.ceil(Math.hypot(dx, dy) * 4));
  let prevX = from.x;
  let prevY = from.y;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const cx = Math.round(from.x + dx * t);
    const cy = Math.round(from.y + dy * t);
    if (cx === prevX && cy === prevY) continue;
    // A diagonal step skips two orthogonal cells the segment grazes — vet both so
    // a sightline can't squeeze through a 1-wide wall sitting in a diagonal gap.
    if (cx !== prevX && cy !== prevY) {
      const tMid = (i - 0.5) / steps;
      if (blocks(prevX, cy, tMid) || blocks(cx, prevY, tMid)) return false;
    }
    if (blocks(cx, cy, t)) return false;
    prevX = cx;
    prevY = cy;
  }
  return true;
}
