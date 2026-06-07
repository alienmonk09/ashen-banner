import { describe, it, expect } from "vitest";
import {
  advanceToNextActor,
  endTurn,
  battleWinner,
  evaluateOutcome,
  previewOrder,
} from "../src/battle/turnManager";
import { createUnit } from "../src/core/unit";
import { CT_THRESHOLD, type ClassId, type Team, type Unit } from "../src/core/types";

/**
 * Build a fresh unit with a fully controlled speed and CT so the turn-order math
 * is deterministic and independent of class stat tables. We override the derived
 * `stats.spd` directly because `effectiveSpd` reads from it.
 */
function makeUnit(opts: {
  id: string;
  team?: Team;
  classId?: ClassId;
  spd?: number;
  ct?: number;
  alive?: boolean;
}): Unit {
  const u = createUnit({
    id: opts.id,
    name: opts.id,
    team: opts.team ?? "player",
    classId: opts.classId ?? "knight",
    pos: { x: 0, y: 0 },
  });
  if (opts.spd !== undefined) u.stats.spd = opts.spd;
  if (opts.ct !== undefined) u.ct = opts.ct;
  if (opts.alive !== undefined) u.alive = opts.alive;
  return u;
}

describe("advanceToNextActor", () => {
  it("returns null when the unit list is empty", () => {
    expect(advanceToNextActor([])).toBeNull();
  });

  it("returns null when every unit is dead", () => {
    const units = [
      makeUnit({ id: "a", spd: 10, alive: false }),
      makeUnit({ id: "b", spd: 10, alive: false }),
    ];
    expect(advanceToNextActor(units)).toBeNull();
  });

  it("returns the only living unit once it charges to threshold", () => {
    const u = makeUnit({ id: "solo", spd: 10, ct: 0 });
    const actor = advanceToNextActor([u]);
    expect(actor).toBe(u);
    expect(actor!.ct).toBeGreaterThanOrEqual(CT_THRESHOLD);
  });

  it("returns immediately without ticking when a unit already meets the threshold", () => {
    const u = makeUnit({ id: "ready", spd: 7, ct: CT_THRESHOLD });
    const actor = advanceToNextActor([u]);
    expect(actor).toBe(u);
    // No tick should have occurred since it was already ready.
    expect(actor!.ct).toBe(CT_THRESHOLD);
  });

  it("returns a unit sitting above the threshold without further ticks", () => {
    const u = makeUnit({ id: "over", spd: 7, ct: CT_THRESHOLD + 25 });
    const actor = advanceToNextActor([u]);
    expect(actor).toBe(u);
    expect(actor!.ct).toBe(CT_THRESHOLD + 25);
  });

  it("ignores dead units when picking the next actor", () => {
    const dead = makeUnit({ id: "dead", spd: 999, ct: CT_THRESHOLD, alive: false });
    const live = makeUnit({ id: "live", spd: 10, ct: 0 });
    const actor = advanceToNextActor([dead, live]);
    expect(actor).toBe(live);
  });

  it("does not tick dead units' CT while charging", () => {
    const dead = makeUnit({ id: "dead", spd: 50, ct: 0, alive: false });
    const live = makeUnit({ id: "live", spd: 10, ct: 0 });
    advanceToNextActor([dead, live]);
    expect(dead.ct).toBe(0);
  });

  it("picks the faster unit when both start equal", () => {
    const slow = makeUnit({ id: "slow", spd: 10, ct: 0 });
    const fast = makeUnit({ id: "fast", spd: 25, ct: 0 });
    const actor = advanceToNextActor([slow, fast]);
    expect(actor).toBe(fast);
  });

  it("breaks a CT tie by higher effective speed", () => {
    // Both reach exactly CT_THRESHOLD on the same tick (start 0, spd that divides 100).
    const a = makeUnit({ id: "a", spd: 20, ct: 0 }); // 5 ticks -> 100
    const b = makeUnit({ id: "b", spd: 25, ct: 0 }); // 4 ticks -> 100
    const actor = advanceToNextActor([a, b]);
    // b reaches 100 first (tick 4) while a is still at 80, so b actually wins on CT,
    // but to test the speed tiebreak directly we equalize CT below.
    expect(actor).toBe(b);
  });

  it("breaks an exact CT tie by higher speed, then by lower id", () => {
    // Equal CT already at threshold: tie resolved by speed.
    const slowHigh = makeUnit({ id: "z", spd: 10, ct: CT_THRESHOLD });
    const fastLow = makeUnit({ id: "a", spd: 20, ct: CT_THRESHOLD });
    expect(advanceToNextActor([slowHigh, fastLow])).toBe(fastLow);

    // Equal CT and equal speed: tie resolved by lexicographically smaller id.
    const idHigh = makeUnit({ id: "b", spd: 15, ct: CT_THRESHOLD });
    const idLow = makeUnit({ id: "a", spd: 15, ct: CT_THRESHOLD });
    expect(advanceToNextActor([idHigh, idLow])).toBe(idLow);
  });

  it("prefers the unit with strictly higher CT even if another is faster", () => {
    const aheadSlow = makeUnit({ id: "ahead", spd: 10, ct: CT_THRESHOLD + 30 });
    const behindFast = makeUnit({ id: "behind", spd: 30, ct: CT_THRESHOLD });
    expect(advanceToNextActor([aheadSlow, behindFast])).toBe(aheadSlow);
  });

  it("respects status-modified speed (haste beats raw stat winner)", () => {
    const base = makeUnit({ id: "base", spd: 20, ct: CT_THRESHOLD });
    const hasted = makeUnit({ id: "hasted", spd: 15, ct: CT_THRESHOLD });
    hasted.statuses.push({ kind: "haste", turnsLeft: 3 }); // 15 * 1.5 = 23 effective
    expect(advanceToNextActor([base, hasted])).toBe(hasted);
  });

  it("ticks repeatedly until someone crosses the threshold", () => {
    const u = makeUnit({ id: "creep", spd: 7, ct: 0 });
    const actor = advanceToNextActor([u]);
    expect(actor).toBe(u);
    // 7 per tick: first multiple of 7 that is >= 100 is 105 (15 ticks).
    expect(actor!.ct).toBe(105);
  });

  it("returns one of the units that crosses on the same tick from a clean start", () => {
    const a = makeUnit({ id: "a", spd: 50, ct: 0 });
    const b = makeUnit({ id: "b", spd: 50, ct: 0 });
    const actor = advanceToNextActor([a, b]);
    // Both hit 100 on tick 2; equal CT and speed -> lower id "a" wins.
    expect(actor).toBe(a);
    expect(a.ct).toBe(CT_THRESHOLD);
    expect(b.ct).toBe(CT_THRESHOLD);
  });
});

describe("endTurn", () => {
  it("subtracts CT_THRESHOLD from CT", () => {
    const u = makeUnit({ id: "a", spd: 10, ct: CT_THRESHOLD + 40 });
    endTurn(u);
    expect(u.ct).toBe(40);
  });

  it("subtracts exactly to zero when CT equals the threshold", () => {
    const u = makeUnit({ id: "a", spd: 10, ct: CT_THRESHOLD });
    endTurn(u);
    expect(u.ct).toBe(0);
  });

  it("floors CT at 0 when it would go negative", () => {
    const u = makeUnit({ id: "a", spd: 10, ct: 30 });
    endTurn(u);
    expect(u.ct).toBe(0);
  });

  it("ticks the unit's statuses down by one", () => {
    const u = makeUnit({ id: "a", spd: 10, ct: CT_THRESHOLD });
    u.statuses.push({ kind: "haste", turnsLeft: 2 });
    endTurn(u);
    expect(u.statuses).toHaveLength(1);
    expect(u.statuses[0].turnsLeft).toBe(1);
  });

  it("drops a status that expires this turn", () => {
    const u = makeUnit({ id: "a", spd: 10, ct: CT_THRESHOLD });
    u.statuses.push({ kind: "slow", turnsLeft: 1 });
    endTurn(u);
    expect(u.statuses).toHaveLength(0);
  });

  it("ticks multiple statuses independently", () => {
    const u = makeUnit({ id: "a", spd: 10, ct: CT_THRESHOLD });
    u.statuses.push({ kind: "haste", turnsLeft: 3 });
    u.statuses.push({ kind: "slow", turnsLeft: 1 });
    endTurn(u);
    expect(u.statuses).toHaveLength(1);
    expect(u.statuses[0].kind).toBe("haste");
    expect(u.statuses[0].turnsLeft).toBe(2);
  });
});

describe("battleWinner", () => {
  it("returns null while both teams have living units", () => {
    const units = [
      makeUnit({ id: "p", team: "player" }),
      makeUnit({ id: "e", team: "enemy" }),
    ];
    expect(battleWinner(units)).toBeNull();
  });

  it("returns 'player' when no enemies are alive", () => {
    const units = [
      makeUnit({ id: "p", team: "player" }),
      makeUnit({ id: "e", team: "enemy", alive: false }),
    ];
    expect(battleWinner(units)).toBe("player");
  });

  it("returns 'enemy' when no players are alive", () => {
    const units = [
      makeUnit({ id: "p", team: "player", alive: false }),
      makeUnit({ id: "e", team: "enemy" }),
    ];
    expect(battleWinner(units)).toBe("enemy");
  });

  it("returns 'enemy' when no players exist at all", () => {
    const units = [makeUnit({ id: "e", team: "enemy" })];
    expect(battleWinner(units)).toBe("enemy");
  });

  it("returns 'player' when no enemies exist at all", () => {
    const units = [makeUnit({ id: "p", team: "player" })];
    expect(battleWinner(units)).toBe("player");
  });

  it("returns 'enemy' on an empty battlefield (no players alive)", () => {
    // No players alive takes priority in the implementation's ordering.
    expect(battleWinner([])).toBe("enemy");
  });

  it("still reports a winner when only dead units remain on the loser's side", () => {
    const units = [
      makeUnit({ id: "p1", team: "player" }),
      makeUnit({ id: "p2", team: "player" }),
      makeUnit({ id: "e1", team: "enemy", alive: false }),
      makeUnit({ id: "e2", team: "enemy", alive: false }),
    ];
    expect(battleWinner(units)).toBe("player");
  });
});

describe("evaluateOutcome", () => {
  const party = () => makeUnit({ id: "p", team: "player" });
  const foe = (id = "e") => makeUnit({ id, team: "enemy" });

  it("defaults to rout: player wins only when all foes are down", () => {
    expect(evaluateOutcome([party(), foe()], undefined, 0)).toBeNull();
    const dead = foe();
    dead.alive = false;
    expect(evaluateOutcome([party(), dead], undefined, 0)).toBe("player");
  });

  it("enemy always wins when the party is wiped, whatever the objective", () => {
    const p = party();
    p.alive = false;
    expect(evaluateOutcome([p, foe()], { kind: "survive", turns: 99 }, 0)).toBe("enemy");
    expect(evaluateOutcome([p, foe()], { kind: "defeat", targetName: "e" }, 0)).toBe("enemy");
  });

  it("defeat: ends when the named target dies even if other foes live", () => {
    const boss = foe("boss");
    const minion = foe("minion");
    const obj = { kind: "defeat" as const, targetName: "boss" };
    expect(evaluateOutcome([party(), boss, minion], obj, 0)).toBeNull();
    boss.alive = false;
    expect(evaluateOutcome([party(), boss, minion], obj, 0)).toBe("player"); // minion still alive
  });

  it("defeat: an absent target falls back to a rout", () => {
    const obj = { kind: "defeat" as const, targetName: "ghost" };
    const live = foe();
    expect(evaluateOutcome([party(), live], obj, 0)).toBeNull();
    live.alive = false;
    expect(evaluateOutcome([party(), live], obj, 0)).toBe("player");
  });

  it("survive: player wins once the turn target is reached", () => {
    const obj = { kind: "survive" as const, turns: 5 };
    expect(evaluateOutcome([party(), foe()], obj, 4)).toBeNull();
    expect(evaluateOutcome([party(), foe()], obj, 5)).toBe("player");
  });

  it("survive: routing the enemies also wins early", () => {
    const obj = { kind: "survive" as const, turns: 99 };
    const dead = foe();
    dead.alive = false;
    expect(evaluateOutcome([party(), dead], obj, 1)).toBe("player");
  });

  it("seize: standing a living player on the marked tile wins", () => {
    const obj = { kind: "seize" as const, x: 3, y: 4 };
    const p = party();
    const live = foe();
    // Off the tile while a foe still lives: fight continues.
    p.pos = { x: 0, y: 0 };
    expect(evaluateOutcome([p, live], obj, 0)).toBeNull();
    // On the tile: instant win even though the foe is alive.
    p.pos = { x: 3, y: 4 };
    expect(evaluateOutcome([p, live], obj, 0)).toBe("player");
  });

  it("seize: a dead player on the tile does not count", () => {
    const obj = { kind: "seize" as const, x: 3, y: 4 };
    const p = party();
    p.pos = { x: 3, y: 4 };
    p.alive = false;
    // No living player at all means the party is wiped → enemy wins.
    expect(evaluateOutcome([p, foe()], obj, 0)).toBe("enemy");
  });

  it("seize: routing every foe still wins when the tile is unreached", () => {
    const obj = { kind: "seize" as const, x: 9, y: 9 };
    const p = party();
    p.pos = { x: 0, y: 0 }; // never stepped on the tile
    const dead = foe();
    dead.alive = false;
    expect(evaluateOutcome([p, dead], obj, 0)).toBe("player");
  });

  it("defend: a living enemy reaching the marked tile loses the map", () => {
    const obj = { kind: "defend" as const, x: 2, y: 2, turns: 10 };
    const e = foe();
    e.pos = { x: 0, y: 0 };
    // Holding the line: fight continues before the timer.
    expect(evaluateOutcome([party(), e], obj, 3)).toBeNull();
    // Enemy breaches the tile → enemy wins, even with turns left.
    e.pos = { x: 2, y: 2 };
    expect(evaluateOutcome([party(), e], obj, 3)).toBe("enemy");
  });

  it("defend: surviving to the turn target wins", () => {
    const obj = { kind: "defend" as const, x: 2, y: 2, turns: 5 };
    const e = foe();
    e.pos = { x: 0, y: 0 };
    expect(evaluateOutcome([party(), e], obj, 4)).toBeNull();
    expect(evaluateOutcome([party(), e], obj, 5)).toBe("player");
  });

  it("defend: routing the enemies wins early before the timer", () => {
    const obj = { kind: "defend" as const, x: 2, y: 2, turns: 99 };
    const dead = foe();
    dead.alive = false;
    dead.pos = { x: 2, y: 2 }; // dead foe on the tile must not trigger an enemy win
    expect(evaluateOutcome([party(), dead], obj, 1)).toBe("player");
  });

  it("escort: delivering the VIP to the goal tile wins", () => {
    const obj = { kind: "escort" as const, vipName: "p", x: 5, y: 6 };
    const vip = party(); // name is "p" via makeUnit's id == name
    const live = foe();
    vip.pos = { x: 0, y: 0 };
    expect(evaluateOutcome([vip, live], obj, 0)).toBeNull();
    vip.pos = { x: 5, y: 6 };
    expect(evaluateOutcome([vip, live], obj, 0)).toBe("player");
  });

  it("escort: a dead VIP hands the win to the enemy", () => {
    const obj = { kind: "escort" as const, vipName: "p", x: 5, y: 6 };
    const vip = party();
    vip.pos = { x: 5, y: 6 }; // even sitting on the goal, death loses first
    vip.alive = false;
    // Keep another living player so the wipe guard doesn't short-circuit.
    const ally = makeUnit({ id: "ally", team: "player" });
    expect(evaluateOutcome([vip, ally, foe()], obj, 0)).toBe("enemy");
  });

  it("escort: an absent VIP falls back to a rout", () => {
    const obj = { kind: "escort" as const, vipName: "ghost", x: 5, y: 6 };
    const live = foe();
    expect(evaluateOutcome([party(), live], obj, 0)).toBeNull();
    live.alive = false;
    expect(evaluateOutcome([party(), live], obj, 0)).toBe("player");
  });
});

describe("previewOrder", () => {
  it("returns an empty list when there are no living units", () => {
    const units = [makeUnit({ id: "a", alive: false })];
    expect(previewOrder(units, 5)).toEqual([]);
  });

  it("returns an empty list when count is 0", () => {
    const units = [makeUnit({ id: "a", spd: 10 })];
    expect(previewOrder(units, 0)).toEqual([]);
  });

  it("returns exactly the requested number of entries", () => {
    const units = [
      makeUnit({ id: "a", spd: 10, ct: 0 }),
      makeUnit({ id: "b", spd: 13, ct: 0 }),
      makeUnit({ id: "c", spd: 7, ct: 0 }),
    ];
    expect(previewOrder(units, 8)).toHaveLength(8);
    expect(previewOrder(units, 1)).toHaveLength(1);
  });

  it("does not mutate the real units' CT", () => {
    const a = makeUnit({ id: "a", spd: 10, ct: 25 });
    const b = makeUnit({ id: "b", spd: 13, ct: 40 });
    previewOrder([a, b], 10);
    expect(a.ct).toBe(25);
    expect(b.ct).toBe(40);
  });

  it("only references living units in the preview", () => {
    const a = makeUnit({ id: "a", spd: 20, ct: 0 });
    const dead = makeUnit({ id: "dead", spd: 999, ct: 0, alive: false });
    const order = previewOrder([a, dead], 6);
    expect(order.every((p) => p.unitId === "a")).toBe(true);
  });

  it("puts the faster unit first when both start at the same CT", () => {
    const slow = makeUnit({ id: "slow", spd: 10, ct: 0 });
    const fast = makeUnit({ id: "fast", spd: 25, ct: 0 });
    const order = previewOrder([slow, fast], 4);
    expect(order[0].unitId).toBe("fast");
  });

  it("has the faster unit act more often over a long horizon", () => {
    const slow = makeUnit({ id: "slow", spd: 8, ct: 0 });
    const fast = makeUnit({ id: "fast", spd: 24, ct: 0 });
    const order = previewOrder([slow, fast], 40);
    const fastCount = order.filter((p) => p.unitId === "fast").length;
    const slowCount = order.filter((p) => p.unitId === "slow").length;
    expect(fastCount).toBeGreaterThan(slowCount);
  });

  it("lets the faster unit reach its first turn no later than the slower one", () => {
    const slow = makeUnit({ id: "slow", spd: 8, ct: 0 });
    const fast = makeUnit({ id: "fast", spd: 24, ct: 0 });
    const order = previewOrder([slow, fast], 40);
    const firstFast = order.findIndex((p) => p.unitId === "fast");
    const firstSlow = order.findIndex((p) => p.unitId === "slow");
    expect(firstFast).toBeGreaterThanOrEqual(0);
    expect(firstFast).toBeLessThanOrEqual(firstSlow);
  });

  it("reflects status-modified speed in the ordering", () => {
    const base = makeUnit({ id: "base", spd: 16, ct: 0 });
    const hasted = makeUnit({ id: "hasted", spd: 14, ct: 0 });
    hasted.statuses.push({ kind: "haste", turnsLeft: 99 }); // 14 * 1.5 = 21 effective
    const order = previewOrder([base, hasted], 30);
    const hastedCount = order.filter((p) => p.unitId === "hasted").length;
    const baseCount = order.filter((p) => p.unitId === "base").length;
    expect(hastedCount).toBeGreaterThan(baseCount);
  });

  it("orders a single unit's repeated turns by itself", () => {
    const u = makeUnit({ id: "solo", spd: 10, ct: 0 });
    const order = previewOrder([u], 3);
    expect(order).toEqual([
      { unitId: "solo" },
      { unitId: "solo" },
      { unitId: "solo" },
    ]);
  });
});
