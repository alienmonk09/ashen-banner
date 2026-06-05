import type { WeaponDef } from "../core/types";

export const WEAPONS: Record<string, WeaponDef> = {
  sword: {
    id: "sword",
    name: "Iron Sword",
    power: 6,
    range: 1,
    kind: "physical",
    classes: ["knight"],
  },
  greatsword: {
    id: "greatsword",
    name: "Greatsword",
    power: 9,
    range: 1,
    kind: "physical",
    classes: ["knight"],
  },
  bow: {
    id: "bow",
    name: "Short Bow",
    power: 5,
    range: 3,
    kind: "physical",
    classes: ["archer"],
  },
  longbow: {
    id: "longbow",
    name: "Longbow",
    power: 7,
    range: 4,
    kind: "physical",
    classes: ["archer"],
  },
  rod: {
    id: "rod",
    name: "Rod",
    power: 3,
    range: 1,
    kind: "magical",
    classes: ["blackMage", "timeMage"],
  },
  staff: {
    id: "staff",
    name: "Healing Staff",
    power: 3,
    range: 1,
    kind: "magical",
    classes: ["whiteMage"],
  },
  knuckles: {
    id: "knuckles",
    name: "Iron Knuckles",
    power: 5,
    range: 1,
    kind: "physical",
    classes: ["monk"],
  },
  fellKnuckles: {
    id: "fellKnuckles",
    name: "Fell Knuckles",
    power: 8,
    range: 1,
    kind: "physical",
    classes: ["monk"],
  },
  dagger: {
    id: "dagger",
    name: "Dagger",
    power: 4,
    range: 1,
    kind: "physical",
    classes: ["thief"],
  },
  rapier: {
    id: "rapier",
    name: "Rapier",
    power: 7,
    range: 1,
    kind: "physical",
    classes: ["thief"],
  },
  heartwood: {
    id: "heartwood",
    name: "Heartwood Staff",
    power: 3,
    range: 1,
    kind: "magical",
    classes: ["druid"],
  },
  grimoire: {
    id: "grimoire",
    name: "Summoner's Grimoire",
    power: 3,
    range: 1,
    kind: "magical",
    classes: ["summoner"],
  },
  gaiaStaff: {
    id: "gaiaStaff",
    name: "Gaia Staff",
    power: 3,
    range: 1,
    kind: "magical",
    classes: ["geomancer"],
  },
};

export function getWeapon(id: string): WeaponDef {
  const w = WEAPONS[id];
  if (!w) throw new Error(`Unknown weapon: ${id}`);
  return w;
}
