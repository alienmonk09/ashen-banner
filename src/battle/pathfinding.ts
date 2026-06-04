import type { Point } from "../core/types";
import { Grid, key } from "./grid";

const DIRS: Point[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

const EMPTY: ReadonlySet<string> = new Set<string>();

export interface ReachResult {
  /** tile key -> step cost from start. Includes pass-through tiles (for routing). */
  costs: Map<string, number>;
  /** tile key -> previous tile key (for path reconstruction). */
  prev: Map<string, string | null>;
  /** Tiles the mover may actually stop on (reachable minus pass-through tiles). */
  destinations: Set<string>;
}

/**
 * BFS over walkable tiles within `move` steps. A step is allowed when the
 * destination is in bounds, not blocked terrain, not a `solid` tile, and the
 * height difference does not exceed `jump`.
 *
 * `passThrough` tiles (e.g. allied units) may be crossed for routing but are
 * never offered as stopping points — they are excluded from `destinations`.
 */
export function reachable(
  grid: Grid,
  start: Point,
  move: number,
  jump: number,
  solid: ReadonlySet<string>,
  passThrough: ReadonlySet<string> = EMPTY,
): ReachResult {
  const costs = new Map<string, number>();
  const prev = new Map<string, string | null>();
  const startKey = key(start);
  costs.set(startKey, 0);
  prev.set(startKey, null);

  let frontier: Point[] = [start];
  let cost = 0;
  while (frontier.length > 0 && cost < move) {
    const next: Point[] = [];
    for (const cur of frontier) {
      const curH = grid.heightAt(cur.x, cur.y);
      for (const d of DIRS) {
        const nx = cur.x + d.x;
        const ny = cur.y + d.y;
        if (!grid.inBounds(nx, ny)) continue;
        if (grid.isBlocked(nx, ny)) continue;
        const k = `${nx},${ny}`;
        if (costs.has(k)) continue;
        if (solid.has(k)) continue;
        if (Math.abs(grid.heightAt(nx, ny) - curH) > jump) continue;
        costs.set(k, cost + 1);
        prev.set(k, key(cur));
        next.push({ x: nx, y: ny });
      }
    }
    frontier = next;
    cost += 1;
  }

  const destinations = new Set<string>();
  for (const k of costs.keys()) {
    if (!passThrough.has(k)) destinations.add(k);
  }
  return { costs, prev, destinations };
}

/** Reconstruct the path of points from start to `target` using a ReachResult. */
export function pathTo(result: ReachResult, target: Point): Point[] | null {
  const targetKey = key(target);
  if (!result.costs.has(targetKey)) return null;
  const path: Point[] = [];
  let cur: string | null = targetKey;
  while (cur) {
    const [x, y] = cur.split(",").map(Number);
    path.push({ x, y });
    cur = result.prev.get(cur) ?? null;
  }
  return path.reverse();
}
