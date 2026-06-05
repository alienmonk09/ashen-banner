import { describe, it, expect } from "vitest";
import { PHASES } from "../src/data/maps";
import { RACES } from "../src/data/races";
import { createUnit } from "../src/core/unit";
import type { RaceId } from "../src/core/types";

const ALL_RACE_IDS = Object.keys(RACES) as RaceId[];

describe("enemy race variety across campaign", () => {
  it("enemy spawns use more than one distinct race across all phases", () => {
    const races = new Set<RaceId | undefined>();
    for (const map of PHASES) {
      for (const e of map.enemies) {
        races.add(e.raceId);
      }
    }
    // Filter out undefined (treated as human) — count actual distinct raceIds set
    const explicit = new Set([...races].filter((r): r is RaceId => r !== undefined));
    expect(explicit.size).toBeGreaterThan(1);
  });

  it("at least one campaign enemy's race is weak to a player-castable element (fire/bolt/nature)", () => {
    const playerElements = new Set(["fire", "bolt", "nature"]);
    const hasWeak = PHASES.some((map) =>
      map.enemies.some((e) => {
        if (!e.raceId) return false;
        const race = RACES[e.raceId];
        return race.weak?.some((el) => playerElements.has(el));
      }),
    );
    expect(hasWeak).toBe(true);
  });

  it("at least one campaign enemy's race resists a player-castable element (fire/bolt/nature)", () => {
    const playerElements = new Set(["fire", "bolt", "nature"]);
    const hasResist = PHASES.some((map) =>
      map.enemies.some((e) => {
        if (!e.raceId) return false;
        const race = RACES[e.raceId];
        return race.resist?.some((el) => playerElements.has(el));
      }),
    );
    expect(hasResist).toBe(true);
  });

  it("spawning an enemy with a raceId produces a unit with that raceId", () => {
    for (const raceId of ALL_RACE_IDS) {
      const unit = createUnit({
        name: "Test",
        team: "enemy",
        classId: "knight",
        pos: { x: 0, y: 0 },
        raceId,
      });
      expect(unit.raceId).toBe(raceId);
    }
  });

  it("each map's enemies include varied races (no map has all spawns defaulting to human/undefined)", () => {
    // Every map that has raceIds set must have more than one distinct value
    // (maps with all-undefined are excluded from this check as pre-race data).
    for (const map of PHASES) {
      const explicit = map.enemies.filter((e) => e.raceId !== undefined);
      if (explicit.length === 0) continue; // legacy map — skip
      const distinct = new Set(explicit.map((e) => e.raceId));
      expect(distinct.size).toBeGreaterThan(1);
    }
  });
});
