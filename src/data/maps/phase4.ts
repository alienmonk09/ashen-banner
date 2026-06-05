import type { MapDef } from "../../core/types";

// Phase 4 — Sorcerer's Court. Tiered platforms, mage-stack + a healer.
// An envoy bearing a peace accord must be shepherded through the court's crossfire
// to the sealed archive at the far dais — keep her alive long enough to deliver it.
export const phase4: MapDef = {
  id: "phase4",
  name: "Sorcerer's Court",
  intro:
    "Tiered stone terraces rise to a raised dais where two black mages trade volleys of fire and lightning, an abbess weaving healing light from a side ledge. Spread out, weather the storm, and out-heal the court before the AoE grinds you down. Sable the Envoy carries a sealed accord — she must reach the archive at the far dais alive.",
  objective: { kind: "escort", vipName: "Sable the Envoy", x: 5, y: 1 },
  width: 10,
  height: 10,
  heights: [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 1, 1, 2, 2, 2, 2, 1, 1, 0],
    [0, 1, 2, 3, 3, 3, 3, 2, 1, 0],
    [0, 1, 2, 3, 3, 3, 3, 2, 1, 0],
    [0, 1, 2, 2, 2, 2, 2, 2, 1, 0],
    [0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
    [0, 0, 0, 1, 1, 1, 1, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ],
  blocked: [
    [false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false],
    [true, true, false, false, false, false, false, false, true, true],
    [true, true, false, false, false, false, false, false, true, true],
    [false, false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false, false],
    [false, false, true, false, false, false, false, true, false, false],
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
  /** Sable the Envoy — a White Mage escort who starts behind the player line. */
  allies: [
    { name: "Sable the Envoy", classId: "whiteMage", level: 4, weaponId: "staff", skillIds: ["cure"], pos: { x: 6, y: 8 }, raceId: "human" },
  ],
  enemies: [
    { name: "Pyromancer Velis", classId: "blackMage", level: 6, weaponId: "rod", skillIds: ["fire", "fireball", "poison"], pos: { x: 4, y: 2 }, raceId: "elf" },
    { name: "Stormcaller Dane", classId: "blackMage", level: 6, weaponId: "rod", skillIds: ["fire", "bolt", "stop"], pos: { x: 5, y: 2 }, raceId: "elf" },
    { name: "Abbess Mirelle", classId: "whiteMage", level: 5, weaponId: "staff", skillIds: ["cure", "cura", "protect", "haste"], pos: { x: 2, y: 3 }, raceId: "human" },
    { name: "Court Guard Rolf", classId: "knight", level: 6, weaponId: "sword", skillIds: ["powerStrike", "guard"], pos: { x: 4, y: 4 }, raceId: "dwarf" },
    { name: "Temple Fist Kai", classId: "monk", level: 5, weaponId: "knuckles", skillIds: ["palmStrike", "earthShake"], pos: { x: 5, y: 4 }, raceId: "orc" },
  ],
};
