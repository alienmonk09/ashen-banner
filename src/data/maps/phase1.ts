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
    [0, 0, 0, 0, 1, 0, 0, 0],
    [0, 0, 1, 0, 0, 0, 0, 0],
    [0, 0, 1, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
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
};
