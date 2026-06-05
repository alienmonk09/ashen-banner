import { describe, it, expect } from "vitest";
import { canCounter, coverFor, hasCover, hasAutoPotion } from "../src/battle/combat";
import { createUnit } from "../src/core/unit";
import type { Unit } from "../src/core/types";

// ---- helpers ---------------------------------------------------------------

function at(
  classId: Parameters<typeof createUnit>[0]["classId"],
  team: "player" | "enemy",
  pos: { x: number; y: number },
  overrides: Partial<Parameters<typeof createUnit>[0]> = {},
): Unit {
  return createUnit({ name: classId, team, classId, pos, ...overrides });
}

function knight(pos: { x: number; y: number }, team: "player" | "enemy" = "player"): Unit {
  return at("knight", team, pos);
}

function monk(pos: { x: number; y: number }, team: "player" | "enemy" = "player"): Unit {
  return at("monk", team, pos);
}

function thief(pos: { x: number; y: number }, team: "player" | "enemy" = "player"): Unit {
  return at("thief", team, pos);
}

// ---- hasCover --------------------------------------------------------------

describe("hasCover", () => {
  it("returns true for a Knight", () => {
    expect(hasCover(knight({ x: 0, y: 0 }))).toBe(true);
  });

  it("returns false for a Monk", () => {
    expect(hasCover(monk({ x: 0, y: 0 }))).toBe(false);
  });

  it("returns false for a Thief", () => {
    expect(hasCover(thief({ x: 0, y: 0 }))).toBe(false);
  });
});

// ---- reactions[] refactor — existing reactions still work ------------------

describe("reactions[] refactor", () => {
  it("canCounter is still true for Knight", () => {
    expect(canCounter(knight({ x: 0, y: 0 }))).toBe(true);
  });

  it("canCounter is still true for Monk", () => {
    expect(canCounter(monk({ x: 0, y: 0 }))).toBe(true);
  });

  it("canCounter is false for Thief", () => {
    expect(canCounter(thief({ x: 0, y: 0 }))).toBe(false);
  });

  it("hasAutoPotion is still true for Thief", () => {
    expect(hasAutoPotion(thief({ x: 0, y: 0 }))).toBe(true);
  });

  it("hasAutoPotion is false for Knight", () => {
    expect(hasAutoPotion(knight({ x: 0, y: 0 }))).toBe(false);
  });

  it("hasAutoPotion is false for Monk", () => {
    expect(hasAutoPotion(monk({ x: 0, y: 0 }))).toBe(false);
  });
});

// ---- coverFor --------------------------------------------------------------

describe("coverFor", () => {
  it("returns the adjacent same-team Knight who has more HP than the wounded target", () => {
    const target = monk({ x: 2, y: 2 });
    target.stats.hp = 20;
    const guard = knight({ x: 1, y: 2 }); // adjacent (manhattan 1), higher HP
    guard.stats.hp = 80;

    const result = coverFor(target, [guard, target]);
    expect(result).toBe(guard);
  });

  it("returns null when the guard has equal HP to the target (not strictly more)", () => {
    const target = monk({ x: 2, y: 2 });
    target.stats.hp = 50;
    const guard = knight({ x: 1, y: 2 });
    guard.stats.hp = 50; // equal — does NOT qualify

    expect(coverFor(target, [guard, target])).toBeNull();
  });

  it("returns null when the guard has less HP than the target", () => {
    const target = monk({ x: 2, y: 2 });
    target.stats.hp = 80;
    const guard = knight({ x: 1, y: 2 });
    guard.stats.hp = 40; // less — does NOT qualify

    expect(coverFor(target, [guard, target])).toBeNull();
  });

  it("returns null when the guard is not adjacent (manhattan > 1)", () => {
    const target = monk({ x: 2, y: 2 });
    target.stats.hp = 20;
    const guard = knight({ x: 4, y: 2 }); // distance 2 — not adjacent
    guard.stats.hp = 80;

    expect(coverFor(target, [guard, target])).toBeNull();
  });

  it("returns null when no unit on the team has the cover reaction", () => {
    const target = monk({ x: 2, y: 2 });
    target.stats.hp = 20;
    const ally = monk({ x: 1, y: 2 }); // monk: no cover reaction
    ally.stats.hp = 80;

    expect(coverFor(target, [ally, target])).toBeNull();
  });

  it("returns null when the guard is dead", () => {
    const target = monk({ x: 2, y: 2 });
    target.stats.hp = 20;
    const guard = knight({ x: 1, y: 2 });
    guard.stats.hp = 80;
    guard.alive = false;

    expect(coverFor(target, [guard, target])).toBeNull();
  });

  it("returns null when the only guard is on the opposing team", () => {
    const target = monk({ x: 2, y: 2 }, "player");
    target.stats.hp = 20;
    const guard = knight({ x: 1, y: 2 }, "enemy"); // different team
    guard.stats.hp = 80;

    expect(coverFor(target, [guard, target])).toBeNull();
  });

  it("picks the guard with the highest HP when several qualify", () => {
    const target = monk({ x: 2, y: 2 });
    target.stats.hp = 15;

    const guardA = knight({ x: 1, y: 2 });
    guardA.stats.hp = 60;
    // Give guardA a distinct id so we can tell them apart
    guardA.id = "guardA";

    // We need a second knight; createUnit generates a new unit each call
    const guardB = knight({ x: 2, y: 1 });
    guardB.stats.hp = 90;
    guardB.id = "guardB";

    const result = coverFor(target, [guardA, guardB, target]);
    expect(result).toBe(guardB); // higher HP wins
  });

  it("returns null when the target is itself the only unit (no allies)", () => {
    const target = monk({ x: 2, y: 2 });
    target.stats.hp = 10;

    expect(coverFor(target, [target])).toBeNull();
  });

  it("is not triggered by a guard who is diagonally adjacent (not orthogonal)", () => {
    const target = monk({ x: 2, y: 2 });
    target.stats.hp = 10;
    const guard = knight({ x: 3, y: 3 }); // diagonal — manhattan distance 2
    guard.stats.hp = 80;

    expect(coverFor(target, [guard, target])).toBeNull();
  });
});
