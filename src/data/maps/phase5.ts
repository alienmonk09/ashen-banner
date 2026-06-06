import type { MapDef } from "../../core/types";

// Phase 5 — The Tyrant's Stand (Boss). Throne arena, two chasms force a center
// approach. Added a 6th enemy (throne archer) so the finale breaks the 5v5
// plateau of the prior maps and reads as the clear climax.
export const phase5: MapDef = {
  id: "phase5",
  name: "The Tyrant's Stand",
  intro:
    "Atop the shattered keep, the tyrant Maldrath the Unbowed waits upon his raised throne, flanked by his last loyal guard. Two chasms split the approach — there is only one way up, and he has made it a killing floor.",
  // The war ends when the tyrant falls — his guard need not be wiped out.
  objective: { kind: "defeat", targetName: "Maldrath the Unbowed" },
  width: 10,
  height: 10,
  heights: [
    [2, 2, 1, 1, 3, 3, 1, 1, 2, 2],
    [2, 1, 1, 1, 2, 2, 1, 1, 1, 2],
    [1, 1, 3, 2, 3, 3, 2, 3, 1, 1],
    [1, 1, 3, 2, 3, 3, 2, 3, 1, 1],
    [1, 0, 2, 2, 2, 2, 2, 2, 0, 1],
    [1, 0, 1, 1, 1, 1, 1, 1, 0, 1],
    [1, 1, 0, 1, 1, 1, 1, 0, 1, 1],
    [1, 1, 0, 0, 1, 1, 0, 0, 1, 1],
    [0, 1, 1, 0, 0, 0, 0, 1, 1, 0],
    [0, 0, 1, 0, 0, 0, 0, 1, 0, 0],
  ],
  blocked: [
    [false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false],
    [false, false, true, false, false, false, false, true, false, false],
    [false, false, true, false, false, false, false, true, false, false],
    [false, false, true, false, false, false, false, true, false, false],
    [false, false, true, false, false, false, false, true, false, false],
    [false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false],
  ],
  playerSpawns: [
    { x: 3, y: 9 },
    { x: 4, y: 9 },
    { x: 5, y: 9 },
    { x: 6, y: 9 },
    { x: 4, y: 8 },
    { x: 5, y: 8 },
  ],
  enemies: [
    { name: "Maldrath the Unbowed", classId: "knight", level: 14, weaponId: "greatsword", skillIds: ["powerStrike", "guard"], pos: { x: 4, y: 2 }, raceId: "human" },
    { name: "Seris, Throne Cleric", classId: "whiteMage", level: 12, weaponId: "staff", skillIds: ["cure", "cura", "raise", "protect", "haste"], pos: { x: 5, y: 3 }, raceId: "human" },
    { name: "Vexin the Emberborn", classId: "blackMage", level: 12, weaponId: "rod", skillIds: ["fire", "bolt", "poison", "stop"], pos: { x: 6, y: 2 }, raceId: "elf" },
    { name: "Ironsworn Hale", classId: "knight", level: 11, weaponId: "sword", skillIds: ["powerStrike", "guard"], pos: { x: 4, y: 4 }, raceId: "dwarf" },
    { name: "Bastion Monk Garr", classId: "monk", level: 11, weaponId: "knuckles", skillIds: ["palmStrike", "chakra"], pos: { x: 5, y: 4 }, raceId: "orc" },
    { name: "Throne Archer Vael", classId: "archer", level: 11, weaponId: "longbow", skillIds: ["aimedShot"], pos: { x: 3, y: 3 }, raceId: "halfling" },
  ],
  // The tyrant's hoard, flanking the killing floor on either side of the chasms.
  chests: [
    { pos: { x: 1, y: 5 }, loot: { gold: 150, items: ["xPotion"] } },
    { pos: { x: 8, y: 5 }, loot: { gold: 180, items: ["megaPhoenix"] } },
  ],
};
