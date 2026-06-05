import { describe, it, expect } from "vitest";
import {
  ROSTER,
  PARTY_SIZE,
  MAX_PARTY,
  createParty,
  createStartingParty,
  getHero,
  partyCapForPhase,
  recruitableHeroes,
  recruitHero,
} from "../src/data/party";
import { CLASSES, getClass } from "../src/data/classes";
import { RACES } from "../src/data/races";

describe("hero roster", () => {
  it("has unique ids and resolvable class + race for every hero", () => {
    const ids = new Set<string>();
    for (const h of ROSTER) {
      expect(ids.has(h.id)).toBe(false);
      ids.add(h.id);
      expect(CLASSES[h.classId]).toBeDefined();
      expect(RACES[h.raceId]).toBeDefined();
      expect(h.name.length).toBeGreaterThan(0);
    }
    expect(ROSTER.length).toBeGreaterThanOrEqual(PARTY_SIZE);
  });

  it("grows the party cap across the campaign without exceeding the roster", () => {
    expect(partyCapForPhase(0)).toBe(PARTY_SIZE); // start: three-strong
    expect(partyCapForPhase(1)).toBe(PARTY_SIZE);
    expect(partyCapForPhase(2)).toBe(4); // fourth slot opens
    expect(partyCapForPhase(4)).toBe(5); // fifth slot opens
    expect(partyCapForPhase(6)).toBe(6); // sixth slot for the finale
    expect(partyCapForPhase(9)).toBeLessThanOrEqual(MAX_PARTY);
    expect(partyCapForPhase(6)).toBeGreaterThan(partyCapForPhase(0));
    // Monotonic, non-decreasing growth across the campaign.
    for (let p = 1; p <= 6; p++) {
      expect(partyCapForPhase(p)).toBeGreaterThanOrEqual(partyCapForPhase(p - 1));
    }
  });

  it("offers only un-recruited roster heroes as reinforcements", () => {
    const party = createStartingParty(); // first PARTY_SIZE heroes
    const recruits = recruitableHeroes(party);
    expect(recruits.length).toBe(ROSTER.length - PARTY_SIZE);
    const partyIds = new Set(party.map((u) => u.id));
    for (const r of recruits) expect(partyIds.has(r.id)).toBe(false);
  });

  it("recruits a reinforcement at the requested level (floored at 1) with the right identity", () => {
    const enzo = getHero("enzo")!;
    const unit = recruitHero(enzo, 6);
    expect(unit.id).toBe("enzo");
    expect(unit.classId).toBe("thief");
    expect(unit.level).toBe(6);
    expect(unit.team).toBe("player");
    expect(unit.learnedSkillIds.length).toBeGreaterThanOrEqual(1);
    // Joins at the party average (floored at 1 to match the level-1 start).
    expect(recruitHero(enzo, 1).level).toBe(1);
  });

  it("includes Enzo the Thief and Penelope the Druid", () => {
    const enzo = getHero("enzo");
    const penelope = getHero("penelope");
    expect(enzo).toMatchObject({ name: "Enzo", classId: "thief" });
    expect(penelope).toMatchObject({ name: "Penelope", classId: "druid" });
  });
});

describe("createParty", () => {
  it("builds a level-1 unit per hero, with the first class skill and banked SP", () => {
    const party = createParty(["enzo", "penelope"]);
    expect(party).toHaveLength(2);
    const enzo = party[0];
    expect(enzo.name).toBe("Enzo");
    expect(enzo.classId).toBe("thief");
    expect(enzo.raceId).toBe("halfling");
    expect(enzo.team).toBe("player");
    expect(enzo.level).toBe(1);
    expect(enzo.sp).toBe(100);
    expect(enzo.learnedSkillIds).toEqual([getClass("thief").skillIds[0]]);
    expect(enzo.alive).toBe(true);
  });

  it("skips unknown hero ids", () => {
    const party = createParty(["enzo", "nobody", "penelope"]);
    expect(party.map((u) => u.name)).toEqual(["Enzo", "Penelope"]);
  });

  it("gives every unit a distinct id", () => {
    const party = createParty(ROSTER.map((h) => h.id));
    const ids = new Set(party.map((u) => u.id));
    expect(ids.size).toBe(ROSTER.length);
  });
});

describe("createStartingParty", () => {
  it("returns a default party of PARTY_SIZE player heroes", () => {
    const party = createStartingParty();
    expect(party).toHaveLength(PARTY_SIZE);
    for (const u of party) {
      expect(u.team).toBe("player");
      expect(u.level).toBe(1);
      expect(RACES[u.raceId]).toBeDefined();
    }
  });
});
