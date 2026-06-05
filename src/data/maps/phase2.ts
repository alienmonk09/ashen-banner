import type { MapDef } from "../../core/types";

// Phase 2 — Ambush in the Hills. Elevation + the first enemy mage.
// Sorcerer kept at L3 (was L4) to soften the spike right after the tutorial.
export const phase2: MapDef = {
  id: "phase2",
  name: "Ambush in the Hills",
  intro:
    "The road narrows into a valley walled by rolling hills. Brigands hold the high ground, and a hooded mage waits on the far ridge — already weaving flame.",
  width: 9,
  height: 9,
  heights: [
    [0, 0, 0, 1, 2, 2, 2, 2, 2],
    [0, 0, 0, 1, 1, 2, 2, 2, 2],
    [0, 0, 0, 0, 2, 2, 2, 2, 2],
    [0, 0, 1, 1, 2, 2, 2, 2, 2],
    [0, 0, 0, 0, 0, 1, 1, 2, 2],
    [0, 0, 1, 1, 2, 2, 2, 2, 2],
    [0, 0, 0, 0, 2, 2, 2, 2, 2],
    [0, 0, 0, 1, 1, 2, 2, 2, 2],
    [0, 0, 0, 1, 2, 2, 2, 2, 2],
  ],
  blocked: [
    [false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, true, false, false],
    [false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false],
  ],
  playerSpawns: [
    { x: 0, y: 2 },
    { x: 0, y: 4 },
    { x: 0, y: 6 },
    { x: 1, y: 3 },
    { x: 1, y: 5 },
  ],
  enemies: [
    { name: "Hill Sorcerer", classId: "blackMage", level: 3, weaponId: "rod", skillIds: ["fire", "poison"], pos: { x: 8, y: 4 }, raceId: "elf" },
    { name: "Ridge Sentry", classId: "knight", level: 4, weaponId: "sword", skillIds: ["powerStrike"], pos: { x: 6, y: 2 }, raceId: "dwarf" },
    { name: "Crag Sentry", classId: "knight", level: 3, weaponId: "sword", skillIds: ["guard"], pos: { x: 6, y: 6 }, raceId: "orc" },
    { name: "Pass Brawler", classId: "monk", level: 3, weaponId: "knuckles", skillIds: ["palmStrike"], pos: { x: 4, y: 4 }, raceId: "orc" },
  ],
};
