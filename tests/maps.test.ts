import { describe, it, expect } from "vitest";
import { PHASES } from "../src/data/maps";
import { CLASSES } from "../src/data/classes";
import { WEAPONS } from "../src/data/weapons";
import { SKILLS } from "../src/data/skills";
import { ITEMS } from "../src/data/items";
import { partyCapForPhase } from "../src/data/party";
import { Grid } from "../src/battle/grid";
import { PROPS } from "../src/data/props";

describe("map data invariants", () => {
  PHASES.forEach((map, index) => {
    describe(map.id, () => {
      it("has rectangular heights matching width/height", () => {
        expect(map.heights.length).toBe(map.height);
        for (const row of map.heights) {
          expect(row.length).toBe(map.width);
          for (const z of row) expect(z).toBeGreaterThanOrEqual(0);
        }
      });

      it("has a blocked mask matching dims when present", () => {
        if (!map.blocked) return;
        expect(map.blocked.length).toBe(map.height);
        for (const row of map.blocked) expect(row.length).toBe(map.width);
      });

      it("offers enough in-bounds, non-blocked, distinct spawns for the party cap", () => {
        // Every map must seat at least the chapter's party cap, and stay sane.
        expect(map.playerSpawns.length).toBeGreaterThanOrEqual(partyCapForPhase(index));
        expect(map.playerSpawns.length).toBeLessThanOrEqual(8);
        const seen = new Set<string>();
        for (const s of map.playerSpawns) {
          expect(s.x).toBeGreaterThanOrEqual(0);
          expect(s.y).toBeGreaterThanOrEqual(0);
          expect(s.x).toBeLessThan(map.width);
          expect(s.y).toBeLessThan(map.height);
          expect(map.blocked?.[s.y][s.x] ?? false).toBe(false);
          const k = `${s.x},${s.y}`;
          expect(seen.has(k)).toBe(false);
          seen.add(k);
        }
      });

      it("has valid, in-bounds, non-blocked, non-overlapping enemies", () => {
        const seen = new Set<string>(map.playerSpawns.map((s) => `${s.x},${s.y}`));
        expect(map.enemies.length).toBeGreaterThanOrEqual(2);
        for (const e of map.enemies) {
          expect(CLASSES[e.classId]).toBeDefined();
          expect(WEAPONS[e.weaponId]).toBeDefined();
          // weapon must belong to the class
          expect(CLASSES[e.classId].weaponIds).toContain(e.weaponId);
          for (const sid of e.skillIds ?? []) {
            expect(SKILLS[sid]).toBeDefined();
            expect(CLASSES[e.classId].skillIds).toContain(sid);
          }
          expect(e.pos.x).toBeGreaterThanOrEqual(0);
          expect(e.pos.y).toBeGreaterThanOrEqual(0);
          expect(e.pos.x).toBeLessThan(map.width);
          expect(e.pos.y).toBeLessThan(map.height);
          expect(map.blocked?.[e.pos.y][e.pos.x] ?? false).toBe(false);
          const k = `${e.pos.x},${e.pos.y}`;
          expect(seen.has(k)).toBe(false);
          seen.add(k);
        }
      });

      it("places treasure chests on valid, walkable, unoccupied tiles", () => {
        if (!map.chests) return;
        const grid = new Grid(map);
        // Every tile already taken by a spawn, foe, ally, or objective.
        const taken = new Set<string>();
        for (const s of map.playerSpawns) taken.add(`${s.x},${s.y}`);
        for (const e of map.enemies) taken.add(`${e.pos.x},${e.pos.y}`);
        for (const a of map.allies ?? []) taken.add(`${a.pos.x},${a.pos.y}`);
        const o = map.objective;
        if (o && (o.kind === "seize" || o.kind === "defend" || o.kind === "escort")) {
          taken.add(`${o.x},${o.y}`);
        }
        const seen = new Set<string>();
        for (const c of map.chests) {
          // In bounds.
          expect(c.pos.x).toBeGreaterThanOrEqual(0);
          expect(c.pos.y).toBeGreaterThanOrEqual(0);
          expect(c.pos.x).toBeLessThan(map.width);
          expect(c.pos.y).toBeLessThan(map.height);
          // Walkable: not blocked, and (if terrain is defined) not water/lava.
          expect(grid.isBlocked(c.pos.x, c.pos.y)).toBe(false);
          if (map.terrain) {
            const t = grid.terrainAt(c.pos.x, c.pos.y);
            expect(t).not.toBe("water");
            expect(t).not.toBe("lava");
          }
          // Loot references only real items.
          for (const id of c.loot.items ?? []) expect(ITEMS[id]).toBeDefined();
          // No overlap with units/objective, and no two chests on the same tile.
          const k = `${c.pos.x},${c.pos.y}`;
          expect(taken.has(k)).toBe(false);
          expect(seen.has(k)).toBe(false);
          seen.add(k);
        }
      });

      it("places decor on valid tiles (solid props on blocked tiles)", () => {
        if (!map.decor) return;
        const grid = new Grid(map);
        const taken = new Set<string>();
        for (const s of map.playerSpawns) taken.add(`${s.x},${s.y}`);
        for (const e of map.enemies) taken.add(`${e.pos.x},${e.pos.y}`);
        for (const a of map.allies ?? []) taken.add(`${a.pos.x},${a.pos.y}`);
        for (const c of map.chests ?? []) taken.add(`${c.pos.x},${c.pos.y}`);
        const o = map.objective;
        if (o && (o.kind === "seize" || o.kind === "defend" || o.kind === "escort")) taken.add(`${o.x},${o.y}`);
        const seen = new Set<string>();
        for (const d of map.decor) {
          expect(d.pos.x).toBeGreaterThanOrEqual(0);
          expect(d.pos.y).toBeGreaterThanOrEqual(0);
          expect(d.pos.x).toBeLessThan(map.width);
          expect(d.pos.y).toBeLessThan(map.height);
          const prop = PROPS[d.propId];
          expect(prop).toBeDefined();
          if (prop.solid) expect(grid.isBlocked(d.pos.x, d.pos.y)).toBe(true);
          const k = `${d.pos.x},${d.pos.y}`;
          expect(taken.has(k)).toBe(false);
          expect(seen.has(k)).toBe(false);
          seen.add(k);
        }
      });
    });
  });
});
