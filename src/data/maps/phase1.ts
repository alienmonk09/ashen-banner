import type { MapDef } from "../../core/types";

// Phase 1 — Tutorial Skirmish. Flat field, 3 weak enemies, comfortable win.
export const phase1: MapDef = {
  id: "phase1",
  name: "Tutorial Skirmish",
  intro:
    "A quiet grassy field at the edge of the kingdom. A small band of brigands has made camp on the rise ahead — the perfect place to learn the basics of battle.",
  width: 8,
  height: 8,
  heights: [
    [1, 2, 2, 2, 2, 2, 2, 1],
    [1, 2, 2, 2, 2, 2, 3, 2],
    [1, 1, 2, 2, 2, 2, 2, 1],
    [0, 1, 1, 1, 1, 1, 1, 1],
    [0, 0, 1, 1, 1, 1, 0, 0],
    [0, 0, 0, 1, 1, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 1, 1],
    [0, 0, 0, 0, 0, 0, 1, 2],
  ],
  playerSpawns: [
    { x: 2, y: 7 },
    { x: 3, y: 7 },
    { x: 4, y: 7 },
    { x: 5, y: 7 },
    { x: 3, y: 6 },
  ],
  enemies: [
    { name: "Brigand Swordsman", classId: "knight", level: 2, weaponId: "sword", skillIds: ["powerStrike"], pos: { x: 4, y: 1 }, raceId: "orc" },
    { name: "Camp Lookout", classId: "archer", level: 1, weaponId: "bow", skillIds: [], pos: { x: 2, y: 2 }, raceId: "halfling" },
    { name: "Wandering Brawler", classId: "monk", level: 1, weaponId: "knuckles", skillIds: [], pos: { x: 5, y: 1 }, raceId: "orc" },
  ],
  // A small detour off the spawn→camp line rewards a scouting move.
  chests: [
    { pos: { x: 1, y: 4 }, loot: { gold: 25, items: ["potion"] } },
    { pos: { x: 6, y: 4 }, loot: { gold: 20, items: ["ether"] } },
  ],
};
