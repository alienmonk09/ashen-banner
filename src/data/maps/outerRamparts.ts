import type { MapDef } from "../../core/types";

// Outer Ramparts — the keep's fortified outer wall, the last line before the
// throne. A raised stone rampart (height 2-3) walls off the courtyard; the face
// is impassable except a central gate, so the approach is a real chokepoint with
// archers and a mage firing down from the wall.
const heights: number[][] = [
  [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
  [2, 3, 3, 2, 2, 2, 2, 2, 2, 3, 3, 2],
  [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
  [1, 1, 2, 2, 2, 0, 0, 2, 2, 2, 1, 1],
  [0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
];

// Merlons on the wall top and the wall face are solid stone; the only break is
// the central gate (row 3, columns 5-6) and the height-1 ends.
const blocked: boolean[][] = heights.map((row) => row.map(() => false));
for (const [y, x] of [[1, 1], [1, 2], [1, 9], [1, 10], [3, 2], [3, 3], [3, 4], [3, 7], [3, 8], [3, 9]]) {
  blocked[y][x] = true;
}

export const outerRamparts: MapDef = {
  id: "outerRamparts",
  name: "The Outer Ramparts",
  intro:
    "The keep's outer wall rears up out of the ash — merlons manned, a single gate yawning at its center. Maldrath's garrison holds the high stone and rains shafts and fire on the courtyard below. Force the gate or scale the ends and seize the gatehouse at the wall's crown to break the garrison's hold.",
  objective: { kind: "seize", x: 5, y: 0 },
  width: 12,
  height: 12,
  heights,
  blocked,
  playerSpawns: [
    { x: 3, y: 11 },
    { x: 4, y: 11 },
    { x: 5, y: 11 },
    { x: 6, y: 11 },
    { x: 7, y: 11 },
    { x: 8, y: 11 },
  ],
  enemies: [
    { name: "Rampart Captain", classId: "knight", level: 7, weaponId: "greatsword", skillIds: ["powerStrike", "guard"], pos: { x: 3, y: 1 }, personality: "aggressive", raceId: "dwarf" },
    { name: "Siege Mage", classId: "blackMage", level: 7, weaponId: "rod", skillIds: ["fire", "bolt", "stop"], pos: { x: 7, y: 1 }, raceId: "elf" },
    { name: "Wall Sentry", classId: "archer", level: 6, weaponId: "longbow", skillIds: ["aimedShot", "cripple"], pos: { x: 8, y: 2 }, personality: "defensive", raceId: "halfling" },
    { name: "Wall Watcher", classId: "archer", level: 6, weaponId: "bow", skillIds: ["aimedShot"], pos: { x: 4, y: 2 }, personality: "defensive", raceId: "halfling" },
    { name: "Gate Cleric", classId: "whiteMage", level: 6, weaponId: "staff", skillIds: ["cure", "protect", "haste"], pos: { x: 6, y: 2 }, personality: "support", raceId: "human" },
    { name: "Gate Brute", classId: "monk", level: 7, weaponId: "knuckles", skillIds: ["palmStrike", "earthShake"], pos: { x: 5, y: 3 }, raceId: "orc" },
  ],
};
