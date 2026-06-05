import type { MapDef, TerrainType } from "../../core/types";

// Cinder Fields — a wide, open stretch of burned farmland after the bridge.
// Larger terrain than the early maps: scattered low rises and rubble mounds
// (height-2 blocks read as rock cover) break the sightlines on an open field.
const heights: number[][] = [
  [0, 0, 1, 1, 1, 0, 0, 0, 1, 1, 1, 0, 0],
  [0, 1, 1, 2, 1, 1, 0, 1, 1, 2, 1, 1, 0],
  [0, 0, 1, 1, 1, 0, 0, 0, 1, 1, 1, 0, 0],
  [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0],
  [0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0],
  [0, 0, 1, 1, 0, 1, 2, 1, 0, 1, 1, 0, 0],
  [0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0],
  [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
];

// Rubble mounds (the height-2 blocks) are impassable cover; everything else open.
const blocked: boolean[][] = heights.map((row) => row.map(() => false));
blocked[1][3] = true;
blocked[1][9] = true;
blocked[5][6] = true;

// Default every tile to "dirt" (burned farmland feel), then mark a lava lane
// cutting across the mid-field (rows 3–4, columns 1–3 and 9–11). These tiles are
// all walkable — stepping on them costs HP at end of turn.
const G: TerrainType = "dirt";
const L: TerrainType = "lava";
const terrain: TerrainType[][] = [
  [G, G, G, G, G, G, G, G, G, G, G, G, G],
  [G, G, G, G, G, G, G, G, G, G, G, G, G],
  [G, G, G, G, G, G, G, G, G, G, G, G, G],
  [G, L, L, L, G, G, G, G, G, L, L, L, G],
  [G, L, G, G, G, G, G, G, G, G, G, L, G],
  [G, G, G, G, G, G, G, G, G, G, G, G, G],
  [G, G, G, G, G, G, G, G, G, G, G, G, G],
  [G, G, G, G, G, G, G, G, G, G, G, G, G],
  [G, G, G, G, G, G, G, G, G, G, G, G, G],
  [G, G, G, G, G, G, G, G, G, G, G, G, G],
  [G, G, G, G, G, G, G, G, G, G, G, G, G],
];

// Keep the blocked rubble mounds reading as rocky cover — without this they'd
// inherit "dirt" from the grid above and lose the visual distinction the intro
// leans on ("use the rubble for cover").
const R: TerrainType = "rock";
terrain[1][3] = R;
terrain[1][9] = R;
terrain[5][6] = R;

export const cinderFields: MapDef = {
  id: "cinderFields",
  name: "The Cinder Fields",
  intro:
    "Past the bridge the land opens into a plain of burned farmland — black stubble, broken fences, the husks of barns. Maldrath's roving company means to overrun your position. Hold the rally point at the field's center and don't let them seize it — survive long enough and reinforcements will turn the tide.",
  objective: { kind: "defend", x: 6, y: 8, turns: 7 },
  width: 13,
  height: 11,
  heights,
  blocked,
  terrain,
  playerSpawns: [
    { x: 2, y: 10 },
    { x: 4, y: 10 },
    { x: 6, y: 10 },
    { x: 8, y: 10 },
    { x: 10, y: 10 },
    { x: 6, y: 9 },
  ],
  enemies: [
    { name: "Cinder Marauder", classId: "knight", level: 5, weaponId: "greatsword", skillIds: ["powerStrike", "guard"], pos: { x: 4, y: 1 }, personality: "aggressive", raceId: "orc" },
    { name: "Ash Archer", classId: "archer", level: 5, weaponId: "longbow", skillIds: ["aimedShot", "cripple"], pos: { x: 10, y: 1 }, raceId: "halfling" },
    { name: "Scorch Mage", classId: "blackMage", level: 5, weaponId: "rod", skillIds: ["fire", "poison"], pos: { x: 6, y: 0 }, raceId: "elf" },
    { name: "Field Cleric", classId: "whiteMage", level: 4, weaponId: "staff", skillIds: ["cure", "protect"], pos: { x: 2, y: 2 }, personality: "support", raceId: "human" },
    { name: "Reaver Monk", classId: "monk", level: 5, weaponId: "knuckles", skillIds: ["palmStrike", "earthShake"], pos: { x: 10, y: 2 }, personality: "aggressive", raceId: "orc" },
    { name: "Brigand Lieutenant", classId: "thief", level: 5, weaponId: "dagger", skillIds: ["backstab", "hamstring"], pos: { x: 6, y: 2 }, raceId: "halfling" },
  ],
};
