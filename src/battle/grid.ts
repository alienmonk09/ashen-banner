import type { MapDef, Point, Team, TerrainType, Unit } from "../core/types";
import { defaultTerrain } from "../data/terrain";
import { PROPS } from "../data/props";

/** Runtime battle grid: tile heights, blocked mask, terrain, and occupancy. */
export class Grid {
  readonly width: number;
  readonly height: number;
  private readonly heights: number[][];
  private readonly blocked: boolean[][];
  private readonly terrain: TerrainType[][];
  private readonly sightBlock: number[][];
  private readonly _maxHeight: number;

  constructor(map: MapDef) {
    this.width = map.width;
    this.height = map.height;
    this.heights = map.heights;
    this.blocked =
      map.blocked ??
      Array.from({ length: map.height }, () => Array(map.width).fill(false));
    this.terrain = Array.from({ length: map.height }, (_, y) =>
      Array.from({ length: map.width }, (_, x) =>
        map.terrain?.[y]?.[x] ?? defaultTerrain(this.blocked[y]?.[x] ?? false, this.heights[y]?.[x] ?? 0),
      ),
    );
    this.sightBlock = Array.from({ length: this.height }, () => Array(this.width).fill(0));
    for (const d of map.decor ?? []) {
      const sb = PROPS[d.propId]?.sightBlock ?? 0;
      if (sb > 0 && this.inBounds(d.pos.x, d.pos.y)) this.sightBlock[d.pos.y][d.pos.x] = sb;
    }
    let mx = 0;
    for (const row of this.heights) for (const z of row) if (z > mx) mx = z;
    this._maxHeight = mx;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  heightAt(x: number, y: number): number {
    return this.inBounds(x, y) ? this.heights[y][x] : 0;
  }

  /** Extra LOS occlusion (in tile-z) from a sight-blocking prop on this tile. */
  sightBlockAt(x: number, y: number): number {
    return this.inBounds(x, y) ? this.sightBlock[y][x] : 0;
  }

  /** Tallest tile height on the map (for camera fit). Computed once. */
  maxHeight(): number {
    return this._maxHeight;
  }

  terrainAt(x: number, y: number): TerrainType {
    return this.inBounds(x, y) ? this.terrain[y][x] : "grass";
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
 * Zone of control exerted against a unit of `moverTeam`.
 * For every living unit on the opposing team, each of its 4 orthogonal
 * neighbours is a ZoC tile. A unit may enter a ZoC tile but cannot continue
 * moving past it (the BFS frontier stops there).
 * Out-of-bounds keys are included harmlessly — `reachable` guards `inBounds`.
 */
export function zoneOfControl(units: Unit[], moverTeam: Team): Set<string> {
  const zoc = new Set<string>();
  for (const u of units) {
    if (!u.alive || u.team === moverTeam) continue;
    zoc.add(`${u.pos.x + 1},${u.pos.y}`);
    zoc.add(`${u.pos.x - 1},${u.pos.y}`);
    zoc.add(`${u.pos.x},${u.pos.y + 1}`);
    zoc.add(`${u.pos.x},${u.pos.y - 1}`);
  }
  return zoc;
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
