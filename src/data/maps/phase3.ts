import type { MapDef, TerrainType } from "../../core/types";

// Phase 3 — The Bridge. A river (blocked band) split by a single-tile bridge.
// Two healing springs flank the south riverbank (row 5, columns 1 and 7).
// They're natural seeps fed by the river — a brief respite for a unit
// sheltering on the wings before crossing the bridge.
// A mire patch (row 3, columns 0–1) clings to the north bank approach —
// boggy ground where the river seeps into the soil.
const W: TerrainType = "water";
const G: TerrainType = "grass";
const S: TerrainType = "spring";
const M: TerrainType = "mire";
const terrain: TerrainType[][] = [
  [G, G, G, G, G, G, G, G, G],
  [G, G, G, G, G, G, G, G, G],
  [G, G, G, G, G, G, G, G, G],
  [M, M, G, G, G, G, G, G, G], // mire on north bank approach (river seepage)
  [W, W, W, W, G, W, W, W, W], // river row (blocked tiles read as water)
  [G, S, G, G, G, G, G, S, G], // spring seeps on south bank flanks
  [G, G, G, G, G, G, G, G, G],
  [G, G, G, G, G, G, G, G, G],
  [G, G, G, G, G, G, G, G, G],
];

export const phase3: MapDef = {
  id: "phase3",
  name: "The Bridge",
  intro:
    "A churning river cleaves the valley in two, fordable only by a single narrow stone bridge. Hold the span and the enemy must come one at a time; lose it and they pour across.",
  width: 9,
  height: 9,
  heights: [
    // North bank: a stepped escarpment crowns the far ridge (enemy high ground)
    [3, 3, 2, 1, 1, 1, 2, 3, 3],
    [2, 3, 2, 1, 2, 1, 1, 2, 3],
    [1, 2, 2, 1, 1, 1, 2, 2, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1], // graded slope down to the river / mire approach
    [0, 0, 0, 0, 1, 0, 0, 0, 0], // river row (bridge at col 4 stays height 1)
    [1, 1, 1, 1, 1, 1, 1, 1, 1], // south landing, level with the bridge
    [1, 1, 0, 1, 1, 1, 0, 1, 1], // sunken hollows cupping the spring seeps
    [1, 0, 0, 1, 2, 1, 0, 0, 1], // a low rise behind the central spawn (vantage)
    [2, 1, 1, 1, 2, 1, 1, 1, 2], // raised valley corners frame the south
  ],
  terrain,
  blocked: [
    [false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false],
    [true, true, true, true, false, true, true, true, true],
    [false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false],
    [false, false, false, false, false, false, false, false, false],
  ],
  playerSpawns: [
    { x: 1, y: 7 },
    { x: 3, y: 7 },
    { x: 5, y: 7 },
    { x: 7, y: 7 },
    { x: 4, y: 6 },
  ],
  enemies: [
    { name: "Bridge Vanguard", classId: "knight", level: 6, weaponId: "greatsword", skillIds: ["powerStrike", "guard"], pos: { x: 4, y: 1 }, raceId: "dwarf" },
    { name: "River Guard", classId: "knight", level: 5, weaponId: "sword", skillIds: ["guard"], pos: { x: 3, y: 3 }, raceId: "human" },
    { name: "Far Bank Archer", classId: "archer", level: 6, weaponId: "longbow", skillIds: ["aimedShot", "cripple"], pos: { x: 2, y: 2 }, raceId: "halfling" },
    { name: "Cliffside Mage", classId: "blackMage", level: 6, weaponId: "rod", skillIds: ["fire", "bolt"], pos: { x: 6, y: 2 }, raceId: "elf" },
    { name: "Wandering Monk", classId: "monk", level: 5, weaponId: "knuckles", skillIds: ["palmStrike", "chakra"], pos: { x: 6, y: 0 }, raceId: "orc" },
  ],
  // Cached on the south bank corners — grab them before committing to the span.
  chests: [
    { pos: { x: 2, y: 8 }, loot: { gold: 30, items: ["potion"] } },
    { pos: { x: 6, y: 8 }, loot: { gold: 25, items: ["ether"] } },
  ],
};
