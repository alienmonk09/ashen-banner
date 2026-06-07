import type { RaceDef, RaceId } from "../core/types";

/**
 * Races apply flat, modest stat deltas on top of class stats (see
 * statsForLevel). They flavor a unit without overriding its class identity.
 */
export const RACES: Record<RaceId, RaceDef> = {
  human: {
    id: "human",
    name: "Human",
    description: "Adaptable and even-keeled — no strengths, no weaknesses.",
    mod: {},
  },
  elf: {
    id: "elf",
    name: "Elf",
    description: "Keen and quick, but frail. Forest-attuned; scorches easily.",
    mod: { hp: -8, mag: 3, res: 2, spd: 2 },
    weak: ["fire"],
    resist: ["nature"],
  },
  dwarf: {
    id: "dwarf",
    name: "Dwarf",
    description: "Stalwart and armored, but slow. Forge-born — fire glances off; living growth chokes them.",
    mod: { hp: 12, def: 3, spd: -2 },
    weak: ["nature"],
    resist: ["fire"],
  },
  halfling: {
    id: "halfling",
    name: "Halfling",
    description: "Nimble skirmisher — swift and sure-footed, light on muscle. Quick to dodge a spark, slow to shrug off a blaze.",
    mod: { hp: -6, atk: -2, spd: 3, move: 1, jump: 1 },
    weak: ["fire"],
    resist: ["bolt"],
  },
  orc: {
    id: "orc",
    name: "Orc",
    description: "Brutal and hardy, with little aptitude for magic. Toxin-tough, but lightning fells them — and holy light scourges their dark blood.",
    mod: { hp: 10, atk: 3, mag: -3, res: -2 },
    weak: ["bolt", "holy"],
    resist: ["nature"],
  },
  gnome: {
    id: "gnome",
    name: "Gnome",
    description: "Pint-sized arcane tinkerer — deep mana and sharp wits, but slight of frame. Insulated against shocks; a stray spark sets the workshop alight.",
    mod: { mp: 10, mag: 3, res: 2, hp: -6, atk: -1 },
    weak: ["fire"],
    resist: ["bolt"],
  },
  saurian: {
    id: "saurian",
    name: "Saurian",
    description: "Scaled and cold-blooded — thick hide and crushing strength, sluggish and dull to magic. Basks through flame; the cold leaves it torpid.",
    mod: { hp: 14, atk: 3, def: 1, spd: -2, mag: -3 },
    weak: ["ice"],
    resist: ["fire"],
  },
  sylph: {
    id: "sylph",
    name: "Sylph",
    description: "Airy fae — fleet, quick to cast, and feather-light, but barely there to a solid blow. The wind-borne ground a storm's wrath; living groves cradle them.",
    mod: { spd: 3, mag: 2, move: 1, hp: -10, def: -2 },
    weak: ["bolt"],
    resist: ["nature"],
  },
};

export function getRace(id: RaceId): RaceDef {
  return RACES[id];
}
