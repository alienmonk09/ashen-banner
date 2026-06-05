import type { ClassId, RaceId, Unit } from "../core/types";
import { createUnit } from "../core/unit";
import { getClass } from "./classes";

export interface HeroDef {
  /** Stable roster id (used by party selection + save). */
  id: string;
  name: string;
  classId: ClassId;
  raceId: RaceId;
}

/** The roster of named heroes who can carry the Ashen Banner. Pick 4. */
export const ROSTER: HeroDef[] = [
  { id: "garan", name: "Garan", classId: "knight", raceId: "dwarf" },
  { id: "lyra", name: "Lyra", classId: "archer", raceId: "elf" },
  { id: "vex", name: "Vex", classId: "blackMage", raceId: "human" },
  { id: "mira", name: "Mira", classId: "whiteMage", raceId: "human" },
  { id: "bron", name: "Bron", classId: "monk", raceId: "orc" },
  { id: "enzo", name: "Enzo", classId: "thief", raceId: "halfling" },
  { id: "penelope", name: "Penelope", classId: "druid", raceId: "elf" },
];

/** How many heroes you pick at the start of a new game. */
export const PARTY_SIZE = 4;

/** Hard ceiling on party size (the whole roster). */
export const MAX_PARTY = ROSTER.length;

/**
 * Deployment / recruit cap for a chapter (0-based phase index). The party starts
 * at four and earns a slot mid-campaign and another for the finale, so reinforce-
 * ments arrive at a readable pace. Maps must offer at least this many spawns.
 */
export function partyCapForPhase(phaseIndex: number): number {
  // 7-phase campaign (indices 0–6): the 5th slot opens mid-run, the 6th is
  // held back for the finale (the last phase) so the roster peaks at the climax.
  if (phaseIndex >= 6) return Math.min(6, MAX_PARTY);
  if (phaseIndex >= 2) return 5;
  return PARTY_SIZE;
}

export function getHero(id: string): HeroDef | undefined {
  return ROSTER.find((h) => h.id === id);
}

function buildHero(hero: HeroDef, level = 3): Unit {
  const c = getClass(hero.classId);
  // Learn one class skill per 3 levels so a recruit joining mid-campaign isn't
  // a blank slate (lv3→1 skill, lv6→2, lv9→3); JP is banked toward the next.
  const skillCount = Math.max(1, Math.floor(level / 3));
  const unit = createUnit({
    // Use the roster id as the unit id so the renderer/menus resolve the hero's
    // unique sprite (HERO_SPRITES is keyed by roster id). Roster ids are unique.
    id: hero.id,
    name: hero.name,
    team: "player",
    classId: hero.classId,
    raceId: hero.raceId,
    level,
    pos: { x: 0, y: 0 },
    learnedSkillIds: c.skillIds.slice(0, skillCount),
  });
  unit.jp = 100;
  return unit;
}

/** Build a party from a list of roster hero ids (unknown ids are skipped). */
export function createParty(heroIds: string[]): Unit[] {
  return heroIds.map(getHero).filter((h): h is HeroDef => Boolean(h)).map((h) => buildHero(h));
}

/** Default party: the first PARTY_SIZE heroes of the roster (level 3). */
export function createStartingParty(): Unit[] {
  return createParty(ROSTER.slice(0, PARTY_SIZE).map((h) => h.id));
}

/** Roster heroes not yet in the party (by id) — candidates for reinforcement. */
export function recruitableHeroes(party: Unit[]): HeroDef[] {
  const have = new Set(party.map((u) => u.id));
  return ROSTER.filter((h) => !have.has(h.id));
}

/** Build a reinforcement at the given level (floored at 3) to join the party. */
export function recruitHero(hero: HeroDef, level: number): Unit {
  return buildHero(hero, Math.max(3, Math.round(level)));
}
