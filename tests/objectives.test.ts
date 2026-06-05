import { describe, it, expect } from "vitest";
import { evaluateOutcome } from "../src/battle/turnManager";
import { createUnit } from "../src/core/unit";
import { PHASES } from "../src/data/maps";
import type { ClassId, Team, Unit } from "../src/core/types";

function makeUnit(opts: {
  id: string;
  team?: Team;
  classId?: ClassId;
  alive?: boolean;
  x?: number;
  y?: number;
}): Unit {
  const u = createUnit({
    id: opts.id,
    name: opts.id,
    team: opts.team ?? "player",
    classId: opts.classId ?? "knight",
    pos: { x: opts.x ?? 0, y: opts.y ?? 0 },
  });
  if (opts.alive !== undefined) u.alive = opts.alive;
  return u;
}

describe("evaluateOutcome — seize", () => {
  const obj = { kind: "seize" as const, x: 3, y: 4 };

  it("player wins when a living player unit stands on the tile", () => {
    const p = makeUnit({ id: "p", team: "player", x: 3, y: 4 });
    const e = makeUnit({ id: "e", team: "enemy" });
    expect(evaluateOutcome([p, e], obj, 0)).toBe("player");
  });

  it("returns null when no player unit is on the tile (enemies alive)", () => {
    const p = makeUnit({ id: "p", team: "player", x: 0, y: 0 });
    const e = makeUnit({ id: "e", team: "enemy" });
    expect(evaluateOutcome([p, e], obj, 0)).toBeNull();
  });

  it("returns null when no player unit is on the tile (enemies alive) even with a dead player on it", () => {
    const p = makeUnit({ id: "p", team: "player", x: 3, y: 4, alive: false });
    const e = makeUnit({ id: "e", team: "enemy" });
    expect(evaluateOutcome([p, e], obj, 0)).toBe("enemy"); // player wiped → enemy wins
  });

  it("returns enemy when the player team is wiped", () => {
    const p = makeUnit({ id: "p", team: "player", x: 3, y: 4, alive: false });
    const e = makeUnit({ id: "e", team: "enemy" });
    expect(evaluateOutcome([p, e], obj, 0)).toBe("enemy");
  });

  it("an enemy standing on the seize tile does NOT win it for anyone while a player lives", () => {
    const p = makeUnit({ id: "p", team: "player", x: 0, y: 0 });
    const e = makeUnit({ id: "e", team: "enemy", x: 3, y: 4 });
    expect(evaluateOutcome([p, e], obj, 0)).toBeNull();
  });

  it("a dead player unit on the tile does not trigger the win", () => {
    const p = makeUnit({ id: "p1", team: "player", x: 3, y: 4, alive: false });
    const p2 = makeUnit({ id: "p2", team: "player", x: 0, y: 0 });
    const e = makeUnit({ id: "e", team: "enemy" });
    expect(evaluateOutcome([p, p2, e], obj, 0)).toBeNull();
  });

  it("also wins by routing every foe even with no unit on the tile (no soft-lock)", () => {
    const p = makeUnit({ id: "p", team: "player", x: 0, y: 0 });
    const e = makeUnit({ id: "e", team: "enemy", x: 5, y: 5, alive: false });
    expect(evaluateOutcome([p, e], obj, 0)).toBe("player");
  });
});

describe("evaluateOutcome — defend", () => {
  const obj = { kind: "defend" as const, x: 2, y: 3, turns: 6 };

  it("returns enemy when a living enemy occupies the defended tile", () => {
    const p = makeUnit({ id: "p", team: "player" });
    const e = makeUnit({ id: "e", team: "enemy", x: 2, y: 3 });
    expect(evaluateOutcome([p, e], obj, 0)).toBe("enemy");
  });

  it("returns null when no enemy is on the tile and turns < required (enemies alive)", () => {
    const p = makeUnit({ id: "p", team: "player" });
    const e = makeUnit({ id: "e", team: "enemy", x: 0, y: 0 });
    expect(evaluateOutcome([p, e], obj, 3)).toBeNull();
  });

  it("returns player when turnsElapsed >= required and no enemy on the tile", () => {
    const p = makeUnit({ id: "p", team: "player" });
    const e = makeUnit({ id: "e", team: "enemy", x: 0, y: 0 });
    expect(evaluateOutcome([p, e], obj, 6)).toBe("player");
  });

  it("returns player when all enemies are dead (early rout)", () => {
    const p = makeUnit({ id: "p", team: "player" });
    const e = makeUnit({ id: "e", team: "enemy", alive: false });
    expect(evaluateOutcome([p, e], obj, 1)).toBe("player");
  });

  it("returns enemy when the player team is wiped", () => {
    const p = makeUnit({ id: "p", team: "player", alive: false });
    const e = makeUnit({ id: "e", team: "enemy" });
    expect(evaluateOutcome([p, e], obj, 10)).toBe("enemy");
  });

  it("enemy on the tile beats the turn threshold (enemy wins)", () => {
    const p = makeUnit({ id: "p", team: "player" });
    const e = makeUnit({ id: "e", team: "enemy", x: 2, y: 3 });
    expect(evaluateOutcome([p, e], obj, 99)).toBe("enemy");
  });
});

describe("evaluateOutcome — escort", () => {
  const VIP = "Sable the Envoy";
  const obj = { kind: "escort" as const, vipName: VIP, x: 5, y: 1 };

  it("returns player when the vip reaches the goal tile alive", () => {
    const vip = makeUnit({ id: VIP, team: "player", x: 5, y: 1 });
    const ally = makeUnit({ id: "p2", team: "player", x: 0, y: 0 });
    const e = makeUnit({ id: "e", team: "enemy", x: 3, y: 3 });
    expect(evaluateOutcome([vip, ally, e], obj, 0)).toBe("player");
  });

  it("returns null when vip is alive but not at goal and enemies are alive", () => {
    const vip = makeUnit({ id: VIP, team: "player", x: 3, y: 5 });
    const e = makeUnit({ id: "e", team: "enemy", x: 3, y: 3 });
    expect(evaluateOutcome([vip, e], obj, 0)).toBeNull();
  });

  it("returns enemy when the vip dies (even if other player units live)", () => {
    const vip = makeUnit({ id: VIP, team: "player", x: 3, y: 5, alive: false });
    const ally = makeUnit({ id: "p2", team: "player", x: 0, y: 0 });
    const e = makeUnit({ id: "e", team: "enemy", x: 3, y: 3 });
    expect(evaluateOutcome([vip, ally, e], obj, 0)).toBe("enemy");
  });

  it("returns enemy when the dead vip is on the goal tile", () => {
    const vip = makeUnit({ id: VIP, team: "player", x: 5, y: 1, alive: false });
    const ally = makeUnit({ id: "p2", team: "player", x: 0, y: 0 });
    const e = makeUnit({ id: "e", team: "enemy", x: 3, y: 3 });
    expect(evaluateOutcome([vip, ally, e], obj, 0)).toBe("enemy");
  });

  it("returns enemy when the player team is wiped (vip not present)", () => {
    const p = makeUnit({ id: "p", team: "player", alive: false });
    const e = makeUnit({ id: "e", team: "enemy" });
    expect(evaluateOutcome([p, e], obj, 0)).toBe("enemy");
  });

  it("falls back to rout when vip is absent and enemies are alive (null)", () => {
    const ally = makeUnit({ id: "p", team: "player", x: 0, y: 0 });
    const e = makeUnit({ id: "e", team: "enemy", x: 3, y: 3 });
    expect(evaluateOutcome([ally, e], obj, 0)).toBeNull();
  });

  it("falls back to rout when vip is absent and all enemies are dead (player wins)", () => {
    const ally = makeUnit({ id: "p", team: "player", x: 0, y: 0 });
    const e = makeUnit({ id: "e", team: "enemy", alive: false });
    expect(evaluateOutcome([ally, e], obj, 0)).toBe("player");
  });
});

describe("map objective sanity — escort (phase4)", () => {
  const map = PHASES.find((m) => m.id === "phase4");

  it("phase4 exists and has an escort objective", () => {
    expect(map).toBeDefined();
    expect(map!.objective).toBeDefined();
    expect(map!.objective!.kind).toBe("escort");
  });

  it("goal tile is in-bounds", () => {
    const obj = map!.objective as { kind: "escort"; vipName: string; x: number; y: number };
    expect(obj.x).toBeGreaterThanOrEqual(0);
    expect(obj.x).toBeLessThan(map!.width);
    expect(obj.y).toBeGreaterThanOrEqual(0);
    expect(obj.y).toBeLessThan(map!.height);
  });

  it("goal tile is not blocked", () => {
    const obj = map!.objective as { kind: "escort"; vipName: string; x: number; y: number };
    expect(map!.blocked?.[obj.y][obj.x] ?? false).toBe(false);
  });

  it("goal tile is not on a player spawn", () => {
    const obj = map!.objective as { kind: "escort"; vipName: string; x: number; y: number };
    const onSpawn = map!.playerSpawns.some((s) => s.x === obj.x && s.y === obj.y);
    expect(onSpawn).toBe(false);
  });

  it("goal tile is not on an enemy spawn", () => {
    const obj = map!.objective as { kind: "escort"; vipName: string; x: number; y: number };
    const onEnemy = map!.enemies.some((e) => e.pos.x === obj.x && e.pos.y === obj.y);
    expect(onEnemy).toBe(false);
  });

  it("goal tile is not on the guest's starting position", () => {
    const obj = map!.objective as { kind: "escort"; vipName: string; x: number; y: number };
    const onAlly = (map!.allies ?? []).some((a) => a.pos.x === obj.x && a.pos.y === obj.y);
    expect(onAlly).toBe(false);
  });

  it("the named vip exists in map.allies", () => {
    const obj = map!.objective as { kind: "escort"; vipName: string; x: number; y: number };
    const vip = (map!.allies ?? []).find((a) => a.name === obj.vipName);
    expect(vip).toBeDefined();
  });

  it("every ally spawn is in-bounds, unblocked, and does not collide with player/enemy spawns or other allies", () => {
    const allies = map!.allies ?? [];
    const seen = new Set<string>([
      ...map!.playerSpawns.map((s) => `${s.x},${s.y}`),
      ...map!.enemies.map((e) => `${e.pos.x},${e.pos.y}`),
    ]);
    for (const a of allies) {
      expect(a.pos.x).toBeGreaterThanOrEqual(0);
      expect(a.pos.y).toBeGreaterThanOrEqual(0);
      expect(a.pos.x).toBeLessThan(map!.width);
      expect(a.pos.y).toBeLessThan(map!.height);
      expect(map!.blocked?.[a.pos.y][a.pos.x] ?? false).toBe(false);
      const k = `${a.pos.x},${a.pos.y}`;
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    }
  });
});

describe("map objective sanity — seize (outerRamparts)", () => {
  const map = PHASES.find((m) => m.id === "outerRamparts");

  it("outerRamparts exists and has a seize objective", () => {
    expect(map).toBeDefined();
    expect(map!.objective).toBeDefined();
    expect(map!.objective!.kind).toBe("seize");
  });

  it("seize tile is in-bounds", () => {
    const obj = map!.objective as { kind: "seize"; x: number; y: number };
    expect(obj.x).toBeGreaterThanOrEqual(0);
    expect(obj.x).toBeLessThan(map!.width);
    expect(obj.y).toBeGreaterThanOrEqual(0);
    expect(obj.y).toBeLessThan(map!.height);
  });

  it("seize tile is not blocked", () => {
    const obj = map!.objective as { kind: "seize"; x: number; y: number };
    expect(map!.blocked?.[obj.y][obj.x] ?? false).toBe(false);
  });

  it("seize tile is not on a player spawn", () => {
    const obj = map!.objective as { kind: "seize"; x: number; y: number };
    const onSpawn = map!.playerSpawns.some((s) => s.x === obj.x && s.y === obj.y);
    expect(onSpawn).toBe(false);
  });

  it("seize tile is not on an enemy spawn", () => {
    const obj = map!.objective as { kind: "seize"; x: number; y: number };
    const onEnemy = map!.enemies.some((e) => e.pos.x === obj.x && e.pos.y === obj.y);
    expect(onEnemy).toBe(false);
  });
});

describe("map objective sanity — defend (cinderFields)", () => {
  const map = PHASES.find((m) => m.id === "cinderFields");

  it("cinderFields exists and has a defend objective", () => {
    expect(map).toBeDefined();
    expect(map!.objective).toBeDefined();
    expect(map!.objective!.kind).toBe("defend");
  });

  it("defend tile is in-bounds", () => {
    const obj = map!.objective as { kind: "defend"; x: number; y: number; turns: number };
    expect(obj.x).toBeGreaterThanOrEqual(0);
    expect(obj.x).toBeLessThan(map!.width);
    expect(obj.y).toBeGreaterThanOrEqual(0);
    expect(obj.y).toBeLessThan(map!.height);
  });

  it("defend tile is not blocked", () => {
    const obj = map!.objective as { kind: "defend"; x: number; y: number; turns: number };
    expect(map!.blocked?.[obj.y][obj.x] ?? false).toBe(false);
  });

  it("defend tile is not on a player spawn", () => {
    const obj = map!.objective as { kind: "defend"; x: number; y: number; turns: number };
    const onSpawn = map!.playerSpawns.some((s) => s.x === obj.x && s.y === obj.y);
    expect(onSpawn).toBe(false);
  });

  it("defend tile is not on an enemy spawn", () => {
    const obj = map!.objective as { kind: "defend"; x: number; y: number; turns: number };
    const onEnemy = map!.enemies.some((e) => e.pos.x === obj.x && e.pos.y === obj.y);
    expect(onEnemy).toBe(false);
  });

  it("defend turns requirement is between 6 and 8 (inclusive)", () => {
    const obj = map!.objective as { kind: "defend"; x: number; y: number; turns: number };
    expect(obj.turns).toBeGreaterThanOrEqual(6);
    expect(obj.turns).toBeLessThanOrEqual(8);
  });
});
