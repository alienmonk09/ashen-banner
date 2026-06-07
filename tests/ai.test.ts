import { describe, it, expect } from "vitest";
import type { MapDef, Point } from "../src/core/types";
import { Grid, manhattan } from "../src/battle/grid";
import { planEnemyTurn } from "../src/battle/ai";
import { createUnit } from "../src/core/unit";

/**
 * Build a minimal flat (all-height-0, fully walkable) rectangular map.
 * Flat terrain means `jump` never blocks movement, so BFS reachability is
 * purely a function of `move` and unit occupancy — easy to reason about.
 */
function flatMap(width: number, height: number): MapDef {
  return {
    id: "test",
    name: "Test",
    intro: "",
    width,
    height,
    heights: Array.from({ length: height }, () => Array(width).fill(0)),
    playerSpawns: [],
    enemies: [],
  };
}

function flatGrid(width = 12, height = 12): Grid {
  return new Grid(flatMap(width, height));
}

function samePt(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

describe("planEnemyTurn: plan shape & path invariants", () => {
  it("returns a path that starts at the unit's position", () => {
    const grid = flatGrid();
    const me = createUnit({ name: "Goblin", team: "enemy", classId: "knight", pos: { x: 1, y: 1 } });
    const foe = createUnit({ name: "Hero", team: "player", classId: "knight", pos: { x: 8, y: 8 } });

    const plan = planEnemyTurn(me, [me, foe], grid);

    expect(plan.path.length).toBeGreaterThan(0);
    expect(samePt(plan.path[0], me.pos)).toBe(true);
  });

  it("returns a path whose last tile is the destination", () => {
    const grid = flatGrid();
    const me = createUnit({ name: "Goblin", team: "enemy", classId: "knight", pos: { x: 1, y: 1 } });
    const foe = createUnit({ name: "Hero", team: "player", classId: "knight", pos: { x: 9, y: 9 } });

    const plan = planEnemyTurn(me, [me, foe], grid);

    const last = plan.path[plan.path.length - 1];
    expect(samePt(last, plan.destination)).toBe(true);
  });

  it("destination is reachable: never farther than the unit's move range", () => {
    const grid = flatGrid();
    const me = createUnit({ name: "Goblin", team: "enemy", classId: "knight", pos: { x: 1, y: 1 } });
    const foe = createUnit({ name: "Hero", team: "player", classId: "knight", pos: { x: 10, y: 10 } });

    const plan = planEnemyTurn(me, [me, foe], grid);

    // On a flat, unobstructed grid the cheapest path cost equals manhattan distance.
    expect(manhattan(me.pos, plan.destination)).toBeLessThanOrEqual(me.stats.move);
  });

  it("destination stays in bounds", () => {
    const grid = flatGrid(6, 6);
    const me = createUnit({ name: "Goblin", team: "enemy", classId: "archer", pos: { x: 0, y: 0 } });
    const foe = createUnit({ name: "Hero", team: "player", classId: "knight", pos: { x: 5, y: 5 } });

    const plan = planEnemyTurn(me, [me, foe], grid);

    expect(plan.destination.x).toBeGreaterThanOrEqual(0);
    expect(plan.destination.y).toBeGreaterThanOrEqual(0);
    expect(plan.destination.x).toBeLessThan(6);
    expect(plan.destination.y).toBeLessThan(6);
  });

  it("every step in the path is orthogonally adjacent to the previous one", () => {
    const grid = flatGrid();
    const me = createUnit({ name: "Goblin", team: "enemy", classId: "knight", pos: { x: 1, y: 1 } });
    const foe = createUnit({ name: "Hero", team: "player", classId: "knight", pos: { x: 10, y: 1 } });

    const plan = planEnemyTurn(me, [me, foe], grid);

    for (let i = 1; i < plan.path.length; i++) {
      expect(manhattan(plan.path[i - 1], plan.path[i])).toBe(1);
    }
  });
});

describe("planEnemyTurn: attacking in-range foes", () => {
  it("attacks an adjacent enemy, targeting that enemy's tile", () => {
    const grid = flatGrid();
    const me = createUnit({ name: "Goblin", team: "enemy", classId: "knight", pos: { x: 3, y: 3 } });
    const foe = createUnit({ name: "Hero", team: "player", classId: "knight", pos: { x: 4, y: 3 } });

    const plan = planEnemyTurn(me, [me, foe], grid);

    expect(plan.action.kind).toBe("attack");
    expect(plan.action.targetTile).toBeDefined();
    expect(samePt(plan.action.targetTile!, foe.pos)).toBe(true);
  });

  it("attacks without moving when already adjacent (destination is its own tile)", () => {
    const grid = flatGrid();
    const me = createUnit({ name: "Goblin", team: "enemy", classId: "knight", pos: { x: 3, y: 3 } });
    const foe = createUnit({ name: "Hero", team: "player", classId: "knight", pos: { x: 3, y: 4 } });

    const plan = planEnemyTurn(me, [me, foe], grid);

    expect(plan.action.kind).toBe("attack");
    expect(samePt(plan.destination, me.pos)).toBe(true);
  });

  it("a ranged enemy attacks a foe within weapon range without closing in", () => {
    const grid = flatGrid();
    // Archer with default short bow (range 3). Foe is 3 tiles away — in range, not adjacent.
    const me = createUnit({ name: "Sniper", team: "enemy", classId: "archer", pos: { x: 2, y: 2 } });
    const foe = createUnit({ name: "Hero", team: "player", classId: "knight", pos: { x: 5, y: 2 } });

    const plan = planEnemyTurn(me, [me, foe], grid);

    expect(plan.action.kind).toBe("attack");
    expect(samePt(plan.action.targetTile!, foe.pos)).toBe(true);
  });

  it("moves into weapon range then attacks when a foe is just outside range but reachable", () => {
    const grid = flatGrid();
    // Knight (move 4, melee range 1). Foe is 4 tiles away: out of attack range from
    // start, but the AI can step to an adjacent tile and strike.
    const me = createUnit({ name: "Goblin", team: "enemy", classId: "knight", pos: { x: 1, y: 1 } });
    const foe = createUnit({ name: "Hero", team: "player", classId: "knight", pos: { x: 5, y: 1 } });

    const plan = planEnemyTurn(me, [me, foe], grid);

    expect(plan.action.kind).toBe("attack");
    expect(samePt(plan.action.targetTile!, foe.pos)).toBe(true);
    // It had to move adjacent to the foe.
    expect(manhattan(plan.destination, foe.pos)).toBe(1);
  });

  it("targets the lower-HP foe when two are equally reachable", () => {
    const grid = flatGrid();
    const me = createUnit({ name: "Goblin", team: "enemy", classId: "knight", pos: { x: 3, y: 3 } });
    const healthy = createUnit({ name: "Healthy", team: "player", classId: "knight", pos: { x: 2, y: 3 } });
    const wounded = createUnit({ name: "Wounded", team: "player", classId: "knight", pos: { x: 4, y: 3 } });
    // Both adjacent. Wound the second one so it is the more valuable target.
    wounded.stats.hp = 5;

    const plan = planEnemyTurn(me, [me, healthy, wounded], grid);

    expect(plan.action.kind).toBe("attack");
    expect(samePt(plan.action.targetTile!, wounded.pos)).toBe(true);
  });
});

describe("planEnemyTurn: waiting / advancing when no target is reachable", () => {
  it("returns a wait action when the nearest foe is unreachable and out of range", () => {
    const grid = flatGrid(20, 20);
    // Knight move 4 + melee range 1 = can threaten at most 5 manhattan away.
    const me = createUnit({ name: "Goblin", team: "enemy", classId: "knight", pos: { x: 1, y: 1 } });
    const foe = createUnit({ name: "Hero", team: "player", classId: "knight", pos: { x: 18, y: 18 } });

    const plan = planEnemyTurn(me, [me, foe], grid);

    expect(plan.action.kind).toBe("wait");
  });

  it("advancing toward a foe does not increase distance to the nearest foe", () => {
    const grid = flatGrid(20, 20);
    const me = createUnit({ name: "Goblin", team: "enemy", classId: "knight", pos: { x: 1, y: 1 } });
    const foe = createUnit({ name: "Hero", team: "player", classId: "knight", pos: { x: 18, y: 18 } });

    const startDist = manhattan(me.pos, foe.pos);
    const plan = planEnemyTurn(me, [me, foe], grid);

    expect(plan.action.kind).toBe("wait");
    expect(manhattan(plan.destination, foe.pos)).toBeLessThanOrEqual(startDist);
  });

  it("advancing actually decreases distance when a closer tile is reachable", () => {
    const grid = flatGrid(20, 20);
    const me = createUnit({ name: "Goblin", team: "enemy", classId: "knight", pos: { x: 1, y: 1 } });
    const foe = createUnit({ name: "Hero", team: "player", classId: "knight", pos: { x: 18, y: 18 } });

    const startDist = manhattan(me.pos, foe.pos);
    const plan = planEnemyTurn(me, [me, foe], grid);

    // With open ground and move 4, it should close in by its full move budget.
    expect(manhattan(plan.destination, foe.pos)).toBeLessThan(startDist);
    expect(manhattan(me.pos, plan.destination)).toBeLessThanOrEqual(me.stats.move);
  });

  it("waits in place with no movement when there are no enemies at all", () => {
    const grid = flatGrid();
    const me = createUnit({ name: "Goblin", team: "enemy", classId: "knight", pos: { x: 3, y: 3 } });
    const ally = createUnit({ name: "Brute", team: "enemy", classId: "knight", pos: { x: 4, y: 4 } });

    const plan = planEnemyTurn(me, [me, ally], grid);

    expect(plan.action.kind).toBe("wait");
    expect(samePt(plan.destination, me.pos)).toBe(true);
    expect(plan.path.length).toBe(1);
    expect(samePt(plan.path[0], me.pos)).toBe(true);
  });

  it("ignores dead foes when deciding whether to advance", () => {
    const grid = flatGrid(20, 20);
    const me = createUnit({ name: "Goblin", team: "enemy", classId: "knight", pos: { x: 1, y: 1 } });
    const nearDead = createUnit({ name: "Corpse", team: "player", classId: "knight", pos: { x: 2, y: 1 } });
    const farAlive = createUnit({ name: "Hero", team: "player", classId: "knight", pos: { x: 18, y: 18 } });
    // The adjacent foe is dead, so it should be skipped entirely.
    nearDead.alive = false;
    nearDead.stats.hp = 0;

    const plan = planEnemyTurn(me, [me, nearDead, farAlive], grid);

    expect(plan.action.kind).toBe("wait");
    // Advances toward the only living foe, never toward the corpse.
    expect(manhattan(plan.destination, farAlive.pos)).toBeLessThanOrEqual(manhattan(me.pos, farAlive.pos));
  });
});

/** A grid from an explicit height map (optionally with a blocked mask). */
function gridFrom(heights: number[][], blocked?: boolean[][]): Grid {
  const h = heights.length;
  const w = heights[0].length;
  return new Grid({
    id: "t",
    name: "T",
    intro: "",
    width: w,
    height: h,
    heights,
    blocked,
    playerSpawns: [],
    enemies: [],
  });
}

describe("planEnemyTurn: status & line of sight", () => {
  it("a stopped unit forfeits its turn even with a foe adjacent", () => {
    const grid = flatGrid();
    const me = createUnit({ name: "Frozen", team: "enemy", classId: "knight", pos: { x: 3, y: 3 } });
    me.statuses.push({ kind: "stop", turnsLeft: 2 });
    const foe = createUnit({ name: "Hero", team: "player", classId: "knight", pos: { x: 4, y: 3 } });

    const plan = planEnemyTurn(me, [me, foe], grid);

    expect(plan.action.kind).toBe("wait");
    expect(samePt(plan.destination, me.pos)).toBe(true);
    expect(plan.path.length).toBe(1);
  });

  it("does not fire a ranged shot through a tall wall (no line of sight)", () => {
    // 1-row map; an impassable height-9 wall at x=2 sits between archer and foe.
    const heights = [[0, 0, 9, 0, 0]];
    const blocked = [[false, false, true, false, false]];
    const grid = gridFrom(heights, blocked);
    const me = createUnit({ name: "Sniper", team: "enemy", classId: "archer", pos: { x: 0, y: 0 } });
    const foe = createUnit({ name: "Hero", team: "player", classId: "knight", pos: { x: 3, y: 0 } });

    const plan = planEnemyTurn(me, [me, foe], grid);

    // The foe is within bow range but blocked by the wall — no attack is possible.
    expect(plan.action.kind).not.toBe("attack");
  });

  it("does fire when the wall is removed (control for the LOS test)", () => {
    const grid = gridFrom([[0, 0, 0, 0, 0]]);
    const me = createUnit({ name: "Sniper", team: "enemy", classId: "archer", pos: { x: 0, y: 0 } });
    const foe = createUnit({ name: "Hero", team: "player", classId: "knight", pos: { x: 3, y: 0 } });

    const plan = planEnemyTurn(me, [me, foe], grid);

    expect(plan.action.kind).toBe("attack");
    expect(samePt(plan.action.targetTile!, foe.pos)).toBe(true);
  });

  it("casts a debuff (Poison) on an in-range foe when it has nothing better", () => {
    const grid = flatGrid();
    const me = createUnit({ name: "Hexer", team: "enemy", classId: "blackMage", learnedSkillIds: ["poison"], pos: { x: 3, y: 5 } });
    const foe = createUnit({ name: "Hero", team: "player", classId: "knight", pos: { x: 3, y: 3 } });

    const plan = planEnemyTurn(me, [me, foe], grid);

    expect(plan.action.kind).toBe("skill");
    expect(plan.action.skillId).toBe("poison");
    expect(samePt(plan.action.targetTile!, foe.pos)).toBe(true);
  });

  it("does not re-apply a debuff a foe already carries", () => {
    const grid = flatGrid();
    const me = createUnit({ name: "Hexer", team: "enemy", classId: "blackMage", learnedSkillIds: ["poison"], pos: { x: 3, y: 5 } });
    const foe = createUnit({ name: "Hero", team: "player", classId: "knight", pos: { x: 3, y: 3 } });
    foe.statuses.push({ kind: "poison", turnsLeft: 2 });

    const plan = planEnemyTurn(me, [me, foe], grid);

    expect(plan.action.kind).not.toBe("skill");
  });

  it("grants a buff (Haste) to an ally when no attack is available", () => {
    const grid = flatGrid(20, 20);
    const me = createUnit({ name: "Chanter", team: "enemy", classId: "whiteMage", learnedSkillIds: ["haste"], pos: { x: 3, y: 3 } });
    const ally = createUnit({ name: "Brute", team: "enemy", classId: "knight", pos: { x: 3, y: 4 } });
    const foe = createUnit({ name: "Hero", team: "player", classId: "knight", pos: { x: 18, y: 18 } });

    const plan = planEnemyTurn(me, [me, ally, foe], grid);

    expect(plan.action.kind).toBe("skill");
    expect(plan.action.skillId).toBe("haste");
  });

  it("kills a near-dead foe with direct damage instead of wasting Stop on it", () => {
    const grid = flatGrid();
    const me = createUnit({ name: "Hexer", team: "enemy", classId: "blackMage", learnedSkillIds: ["stop", "fire"], pos: { x: 3, y: 5 } });
    const foe = createUnit({ name: "Hero", team: "player", classId: "knight", pos: { x: 3, y: 3 } });
    // Foe is at a sliver of HP, well within Fire's kill range — burning Stop here
    // is a wasted turn when the unit can simply finish the kill.
    foe.stats.hp = 3;

    const plan = planEnemyTurn(me, [me, foe], grid);

    // It goes for the kill (a damaging skill or a basic swing) and never burns Stop.
    expect(plan.action.skillId).not.toBe("stop");
    expect(samePt(plan.action.targetTile!, foe.pos)).toBe(true);
  });

  it("prefers to Stop the healthy threat over the near-dead one", () => {
    const grid = flatGrid();
    // Only Stop available (no direct damage skill, and a feeble staff swing) so the
    // skip-the-killable rule does not fire — this isolates the HP-fraction scaling.
    const me = createUnit({ name: "Hexer", team: "enemy", classId: "blackMage", learnedSkillIds: ["stop"], pos: { x: 3, y: 5 } });
    const healthy = createUnit({ name: "Tank", team: "player", classId: "knight", pos: { x: 2, y: 3 } });
    const nearDead = createUnit({ name: "Wretch", team: "player", classId: "knight", pos: { x: 4, y: 3 } });
    // Both are out of the mage's puny melee reach but inside Stop's range; the
    // near-dead one should be the worse freeze target.
    nearDead.stats.hp = Math.max(1, Math.round(nearDead.stats.maxHp * 0.05));

    const plan = planEnemyTurn(me, [me, healthy, nearDead], grid);

    expect(plan.action.kind).toBe("skill");
    expect(plan.action.skillId).toBe("stop");
    expect(samePt(plan.action.targetTile!, healthy.pos)).toBe(true);
  });
});

/** A grid from an explicit terrain map (flat, fully walkable). */
function gridFromTerrain(terrain: import("../src/core/types").TerrainType[][]): Grid {
  const h = terrain.length;
  const w = terrain[0].length;
  return new Grid({
    id: "t",
    name: "T",
    intro: "",
    width: w,
    height: h,
    heights: Array.from({ length: h }, () => Array(w).fill(0)),
    terrain,
    playerSpawns: [],
    enemies: [],
  });
}

describe("planEnemyTurn: terrain hazard avoidance", () => {
  it("prefers a safe stand tile over a lava tile when both can strike the same foe", () => {
    // Foe at (3,0). The knight can attack from (2,0) [lava] or step down to
    // (3,1) [grass] — both adjacent, equal damage. The lava penalty must steer
    // it off the hazard tile onto the safe one.
    const g: ("grass" | "lava")[][] = [
      ["grass", "grass", "lava", "grass", "grass"],
      ["grass", "grass", "grass", "grass", "grass"],
    ];
    const grid = gridFromTerrain(g as import("../src/core/types").TerrainType[][]);
    const me = createUnit({ name: "Goblin", team: "enemy", classId: "knight", pos: { x: 1, y: 0 } });
    const foe = createUnit({ name: "Hero", team: "player", classId: "knight", pos: { x: 3, y: 0 } });

    const plan = planEnemyTurn(me, [me, foe], grid);

    expect(plan.action.kind).toBe("attack");
    // It still attacks the foe, but never ends its turn on the lava tile.
    expect(grid.terrainAt(plan.destination.x, plan.destination.y)).not.toBe("lava");
  });

  it("gives up the closest tile to dodge lava when advancing to a far foe", () => {
    // 1-row map. Knight (move 4) at x=0; far foe at x=9. The tile that closes the
    // most distance (x=4) is lava — eating ~15% maxHp next turn. The advance
    // tie-break must trade one tile of progress for the safe x=3 grass tile.
    const g: ("grass" | "lava")[][] = [
      ["grass", "grass", "grass", "grass", "lava", "grass", "grass", "grass", "grass", "grass"],
    ];
    const grid = gridFromTerrain(g as import("../src/core/types").TerrainType[][]);
    const me = createUnit({ name: "Goblin", team: "enemy", classId: "knight", pos: { x: 0, y: 0 } });
    const foe = createUnit({ name: "Hero", team: "player", classId: "knight", pos: { x: 9, y: 0 } });

    const plan = planEnemyTurn(me, [me, foe], grid);

    expect(plan.action.kind).toBe("wait");
    // Without the terrain term it would stop on x=4 (lava); now it backs off one.
    expect(grid.terrainAt(plan.destination.x, plan.destination.y)).not.toBe("lava");
    expect(plan.destination.x).toBe(3);
  });
});

describe("planEnemyTurn: healer behavior", () => {
  it("a White Mage knowing Cure heals a hurt ally instead of attacking", () => {
    const grid = flatGrid();
    const healer = createUnit({
      name: "Cleric",
      team: "enemy",
      classId: "whiteMage",
      learnedSkillIds: ["cure"],
      pos: { x: 3, y: 3 },
    });
    // Hurt ally below 50% HP, within Cure's range (3).
    const ally = createUnit({ name: "Brute", team: "enemy", classId: "knight", pos: { x: 3, y: 5 } });
    ally.stats.hp = Math.floor(ally.stats.maxHp * 0.2);
    // A foe adjacent so that attacking is also a live option — heal must still win.
    const foe = createUnit({ name: "Hero", team: "player", classId: "knight", pos: { x: 2, y: 3 } });

    const plan = planEnemyTurn(healer, [healer, ally, foe], grid);

    expect(plan.action.kind).toBe("skill");
    expect(plan.action.skillId).toBe("cure");
    expect(plan.action.targetTile).toBeDefined();
    expect(samePt(plan.action.targetTile!, ally.pos)).toBe(true);
  });

  it("does not waste a heal on a full-HP ally and falls back to attacking", () => {
    const grid = flatGrid();
    const healer = createUnit({
      name: "Cleric",
      team: "enemy",
      classId: "whiteMage",
      learnedSkillIds: ["cure"],
      pos: { x: 3, y: 3 },
    });
    // Ally is at full HP (not "hurt"), so heal is not a candidate.
    const ally = createUnit({ name: "Brute", team: "enemy", classId: "knight", pos: { x: 3, y: 5 } });
    // Adjacent foe — staff range 1 lets the mage attack it.
    const foe = createUnit({ name: "Hero", team: "player", classId: "knight", pos: { x: 2, y: 3 } });

    const plan = planEnemyTurn(healer, [healer, ally, foe], grid);

    expect(plan.action.kind).toBe("attack");
    expect(samePt(plan.action.targetTile!, foe.pos)).toBe(true);
  });

  it("requires MP: a healer without enough MP for Cure attacks instead of healing", () => {
    const grid = flatGrid();
    const healer = createUnit({
      name: "Cleric",
      team: "enemy",
      classId: "whiteMage",
      learnedSkillIds: ["cure"],
      pos: { x: 3, y: 3 },
    });
    // Cure costs 5 MP; drain the mage so it cannot afford it.
    healer.stats.mp = 0;
    const ally = createUnit({ name: "Brute", team: "enemy", classId: "knight", pos: { x: 3, y: 5 } });
    ally.stats.hp = Math.floor(ally.stats.maxHp * 0.2);
    const foe = createUnit({ name: "Hero", team: "player", classId: "knight", pos: { x: 2, y: 3 } });

    const plan = planEnemyTurn(healer, [healer, ally, foe], grid);

    expect(plan.action.kind).not.toBe("skill");
    expect(plan.action.kind).toBe("attack");
  });

  it("moves into Cure range when the hurt ally starts out of reach", () => {
    const grid = flatGrid();
    const healer = createUnit({
      name: "Cleric",
      team: "enemy",
      classId: "whiteMage",
      learnedSkillIds: ["cure"],
      pos: { x: 1, y: 1 },
    });
    // Ally is 5 tiles away (Cure range is 3); mage has move 3 so it can close
    // the gap enough to bring the ally within range.
    const ally = createUnit({ name: "Brute", team: "enemy", classId: "knight", pos: { x: 6, y: 1 } });
    ally.stats.hp = 1;

    const plan = planEnemyTurn(healer, [healer, ally], grid);

    expect(plan.action.kind).toBe("skill");
    expect(plan.action.skillId).toBe("cure");
    expect(samePt(plan.action.targetTile!, ally.pos)).toBe(true);
    // Stand tile must be within Cure's range of the ally.
    expect(manhattan(plan.destination, ally.pos)).toBeLessThanOrEqual(3);
  });
});

describe("planEnemyTurn: counter risk on range-1 damage skills", () => {
  it("prefers striking the foe that cannot counter when a melee skill hits a lone survivor", () => {
    const grid = flatGrid();
    // Knight with Power Strike (range 1, single target, 4 MP) flanked by two
    // paladins it cannot one-shot. Paladins do not counter innately; we grant
    // Counter to only one of them via an equipped reaction.
    const me = createUnit({
      name: "Goblin",
      team: "enemy",
      classId: "knight",
      learnedSkillIds: ["powerStrike"],
      pos: { x: 5, y: 5 },
    });
    // Pin the attacker so both foes are struck from the same tile — this isolates
    // the counter-risk weighting from flanking/positioning bonuses.
    me.stats.move = 0;
    // The countering foe is slightly more wounded, so absent any counter-risk
    // weighting the AI would marginally prefer to hit it (lower-HP bonus). The
    // expected counter punish must overcome that edge and flip the choice.
    const counterFoe = createUnit({ name: "Punisher", team: "player", classId: "paladin", pos: { x: 4, y: 5 } });
    counterFoe.reactionId = "counter";
    counterFoe.stats.hp = 63; // maxHp 70 -> small low-HP bonus, still survives the skill
    const safeFoe = createUnit({ name: "Sitting Duck", team: "player", classId: "paladin", pos: { x: 6, y: 5 } });

    const plan = planEnemyTurn(me, [me, counterFoe, safeFoe], grid);

    // The strongest action is the skill (more damage than a basic swing); with
    // counter-risk applied it lands on the foe that won't punish back.
    expect(plan.action.kind).toBe("skill");
    expect(plan.action.skillId).toBe("powerStrike");
    expect(samePt(plan.action.targetTile!, safeFoe.pos)).toBe(true);
  });
});

describe("planEnemyTurn: AoE friendly-fire penalty scales with ally harm", () => {
  it("won't drop a Fireball that catches and kills an ally, even when it nets an extra foe", () => {
    // The blast at (3,3) catches two foes (3,2)+(4,3) — tempting — but its 3x3
    // footprint also engulfs a fragile ally at (2,3) and kills it. A second center
    // at (5,2) hits one foe (4,3) cleanly. Under the OLD flat -40 friendly-fire
    // penalty the two-foe blast wins (extra kill outweighs 40); under the new
    // allyDamage + allyKills*120 penalty, frying a teammate is far too costly,
    // so the AI must NOT pick a center whose footprint covers the ally.
    const grid = flatGrid();
    const me = createUnit({
      name: "Pyromancer",
      team: "enemy",
      classId: "blackMage",
      learnedSkillIds: ["fireball"],
      pos: { x: 3, y: 7 },
    });
    me.stats.move = 0; // pin the caster so only the AoE center varies
    me.stats.mp = 99;

    const allyVictim = createUnit({ name: "Tinder", team: "enemy", classId: "blackMage", pos: { x: 2, y: 3 } });
    allyVictim.stats.hp = 1; // any graze kills it -> allyKills surcharge bites

    const foeA = createUnit({ name: "Wretch", team: "player", classId: "blackMage", pos: { x: 3, y: 2 } });
    foeA.stats.hp = 1; // dies to the blast -> the extra-kill lure the old penalty caved to
    const foeB = createUnit({ name: "Brute", team: "player", classId: "knight", pos: { x: 4, y: 3 } });

    const plan = planEnemyTurn(me, [me, allyVictim, foeA, foeB], grid);

    expect(plan.action.kind).toBe("skill");
    expect(plan.action.skillId).toBe("fireball");
    // Whatever center it lands on, the 3x3 footprint must not cover the ally.
    const center = plan.action.targetTile!;
    const hitsAlly = Math.abs(center.x - allyVictim.pos.x) <= 1 && Math.abs(center.y - allyVictim.pos.y) <= 1;
    expect(hitsAlly).toBe(false);
  });
});
