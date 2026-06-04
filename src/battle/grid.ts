import type { MapDef, Point, Unit } from "../core/types";

/** Runtime battle grid: tile heights, blocked mask, and unit occupancy. */
export class Grid {
  readonly width: number;
  readonly height: number;
  private readonly heights: number[][];
  private readonly blocked: boolean[][];

  constructor(map: MapDef) {
    this.width = map.width;
    this.height = map.height;
    this.heights = map.heights;
    this.blocked =
      map.blocked ??
      Array.from({ length: map.height }, () => Array(map.width).fill(false));
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  heightAt(x: number, y: number): number {
    return this.inBounds(x, y) ? this.heights[y][x] : 0;
  }

  isBlocked(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return true;
    return this.blocked[y][x];
  }
}

export function key(p: Point): string {
  return `${p.x},${p.y}`;
}

export function manhattan(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

/** Build a set of occupied tile keys, optionally excluding one unit. */
export function occupancy(units: Unit[], excludeId?: string): Set<string> {
  const set = new Set<string>();
  for (const u of units) {
    if (!u.alive) continue;
    if (u.id === excludeId) continue;
    set.add(key(u.pos));
  }
  return set;
}

export interface MoveBlockers {
  /** Tiles the mover cannot enter (occupied by an enemy). */
  solid: Set<string>;
  /** Tiles the mover may cross but not stop on (occupied by an ally). */
  passThrough: Set<string>;
}

/**
 * Split live unit occupancy relative to `mover`: allies are pass-through (you
 * may move across a friendly unit but not finish on it), enemies are solid
 * (they block movement entirely). The mover's own tile is ignored. The same
 * rule applies to player and enemy units alike.
 */
export function moveBlockers(units: Unit[], mover: Unit): MoveBlockers {
  const solid = new Set<string>();
  const passThrough = new Set<string>();
  for (const u of units) {
    if (!u.alive || u.id === mover.id) continue;
    const k = key(u.pos);
    if (u.team === mover.team) passThrough.add(k);
    else solid.add(k);
  }
  return { solid, passThrough };
}
