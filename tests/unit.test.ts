import { describe, it, expect } from "vitest";
import {
  xpForLevel,
  statsForLevel,
  createUnit,
  grantXp,
  grantJp,
  nextLearnableSkill,
  nextLearnableSkillForClass,
  learnNextSkill,
  learnSkillForClass,
} from "../src/core/unit";
import { getClass } from "../src/data/classes";
import type { Unit } from "../src/core/types";

describe("secondary-job skill learning", () => {
  const mk = () => createUnit({ name: "U", team: "player", classId: "knight", pos: { x: 0, y: 0 } });

  it("nextLearnableSkillForClass walks a given class's skills in order", () => {
    const u = mk();
    const wm = getClass("whiteMage").skillIds;
    // Knows nothing of White Mage yet → first WM skill is next.
    expect(nextLearnableSkillForClass(u, "whiteMage")).toBe(wm[0]);
    u.learnedSkillIds.push(wm[0]);
    expect(nextLearnableSkillForClass(u, "whiteMage")).toBe(wm[1]);
  });

  it("learnSkillForClass spends JP to learn a secondary job's skill", () => {
    const u = mk();
    u.jp = 100000;
    const wm0 = getClass("whiteMage").skillIds[0];
    const before = u.jp;
    const learned = learnSkillForClass(u, "whiteMage", 100);
    expect(learned).toBe(wm0);
    expect(u.learnedSkillIds).toContain(wm0);
    expect(u.jp).toBe(before - 100);
  });

  it("won't learn across classes without enough JP", () => {
    const u = mk();
    u.jp = 0;
    expect(learnSkillForClass(u, "whiteMage", 100)).toBeNull();
    expect(u.learnedSkillIds).not.toContain(getClass("whiteMage").skillIds[0]);
  });

  it("returns null once a class is fully learned", () => {
    const u = mk();
    for (const id of getClass("archer").skillIds) u.learnedSkillIds.push(id);
    expect(nextLearnableSkillForClass(u, "archer")).toBeNull();
    u.jp = 100000;
    expect(learnSkillForClass(u, "archer", 100)).toBeNull();
  });
});

describe("xpForLevel", () => {
  it("returns 100 at level 1", () => {
    expect(xpForLevel(1)).toBe(100);
  });

  it("grows by 40 per level", () => {
    expect(xpForLevel(2)).toBe(140);
    expect(xpForLevel(3)).toBe(180);
    expect(xpForLevel(10)).toBe(100 + 9 * 40);
  });

  it("is strictly increasing across levels", () => {
    for (let lv = 1; lv < 20; lv++) {
      expect(xpForLevel(lv + 1)).toBeGreaterThan(xpForLevel(lv));
    }
  });
});

describe("statsForLevel", () => {
  it("at level 1 equals the class base stats", () => {
    const c = getClass("knight");
    const s = statsForLevel("knight", 1);
    expect(s.maxHp).toBe(c.base.hp);
    expect(s.hp).toBe(c.base.hp);
    expect(s.maxMp).toBe(c.base.mp);
    expect(s.mp).toBe(c.base.mp);
    expect(s.atk).toBe(c.base.atk);
    expect(s.def).toBe(c.base.def);
    expect(s.mag).toBe(c.base.mag);
    expect(s.res).toBe(c.base.res);
    expect(s.spd).toBe(c.base.spd);
    expect(s.move).toBe(c.base.move);
    expect(s.jump).toBe(c.base.jump);
  });

  it("at level 1, current equals max for hp and mp", () => {
    const s = statsForLevel("blackMage", 1);
    expect(s.hp).toBe(s.maxHp);
    expect(s.mp).toBe(s.maxMp);
  });

  it("applies growth at higher levels (rounded)", () => {
    const c = getClass("knight");
    const lv = 5;
    const g = c.growth;
    const factor = lv - 1; // 4
    const s = statsForLevel("knight", lv);
    expect(s.maxHp).toBe(Math.round(c.base.hp + g.hp * factor));
    expect(s.maxMp).toBe(Math.round(c.base.mp + g.mp * factor));
    expect(s.atk).toBe(Math.round(c.base.atk + g.atk * factor));
    expect(s.def).toBe(Math.round(c.base.def + g.def * factor));
    expect(s.mag).toBe(Math.round(c.base.mag + g.mag * factor));
    expect(s.res).toBe(Math.round(c.base.res + g.res * factor));
    expect(s.spd).toBe(Math.round(c.base.spd + g.spd * factor));
  });

  it("rounds fractional growth correctly (archer atk at level 3)", () => {
    // base.atk 11, growth.atk 1.8, level 3 -> 11 + 1.8*2 = 14.6 -> 15
    const s = statsForLevel("archer", 3);
    expect(s.atk).toBe(15);
  });

  it("keeps move and jump constant across levels", () => {
    const c = getClass("monk");
    const s10 = statsForLevel("monk", 10);
    expect(s10.move).toBe(c.base.move);
    expect(s10.jump).toBe(c.base.jump);
  });

  it("produces higher max stats at higher levels", () => {
    const lo = statsForLevel("whiteMage", 1);
    const hi = statsForLevel("whiteMage", 8);
    expect(hi.maxHp).toBeGreaterThan(lo.maxHp);
    expect(hi.maxMp).toBeGreaterThan(lo.maxMp);
    expect(hi.mag).toBeGreaterThan(lo.mag);
  });
});

describe("createUnit", () => {
  it("creates a level-1 unit by default with full stats", () => {
    const u = createUnit({
      name: "Cecil",
      team: "player",
      classId: "knight",
      pos: { x: 1, y: 2 },
    });
    expect(u.level).toBe(1);
    expect(u.xp).toBe(0);
    expect(u.jp).toBe(0);
    expect(u.alive).toBe(true);
    expect(u.statuses).toEqual([]);
    expect(u.ct).toBe(0);
    expect(u.stats.hp).toBe(u.stats.maxHp);
    expect(u.stats.mp).toBe(u.stats.maxMp);
  });

  it("respects an explicit level", () => {
    const u = createUnit({
      name: "Veteran",
      team: "player",
      classId: "knight",
      level: 5,
      pos: { x: 0, y: 0 },
    });
    expect(u.level).toBe(5);
    expect(u.stats.maxHp).toBe(statsForLevel("knight", 5).maxHp);
  });

  it("defaults the weapon to the class's first weapon", () => {
    const c = getClass("knight");
    const u = createUnit({
      name: "Default",
      team: "player",
      classId: "knight",
      pos: { x: 0, y: 0 },
    });
    expect(u.weaponId).toBe(c.weaponIds[0]);
  });

  it("keeps a valid weapon that belongs to the class", () => {
    const u = createUnit({
      name: "GreatswordKnight",
      team: "player",
      classId: "knight",
      pos: { x: 0, y: 0 },
      weaponId: "greatsword",
    });
    expect(u.weaponId).toBe("greatsword");
  });

  it("falls back to class default when given a foreign weapon", () => {
    const c = getClass("knight");
    const u = createUnit({
      name: "WrongWeapon",
      team: "player",
      classId: "knight",
      pos: { x: 0, y: 0 },
      weaponId: "bow", // archer weapon, not valid for knight
    });
    expect(u.weaponId).toBe(c.weaponIds[0]);
  });

  it("copies learnedSkillIds into a new array (no shared reference)", () => {
    const learned = ["powerStrike"];
    const u = createUnit({
      name: "Skilled",
      team: "player",
      classId: "knight",
      pos: { x: 0, y: 0 },
      learnedSkillIds: learned,
    });
    expect(u.learnedSkillIds).toEqual(["powerStrike"]);
    expect(u.learnedSkillIds).not.toBe(learned);
    learned.push("guard");
    expect(u.learnedSkillIds).toEqual(["powerStrike"]);
  });

  it("defaults learnedSkillIds to an empty array", () => {
    const u = createUnit({
      name: "Fresh",
      team: "player",
      classId: "knight",
      pos: { x: 0, y: 0 },
    });
    expect(u.learnedSkillIds).toEqual([]);
  });

  it("copies pos into a new object (no shared reference)", () => {
    const pos = { x: 3, y: 4 };
    const u = createUnit({
      name: "Positioned",
      team: "player",
      classId: "knight",
      pos,
    });
    expect(u.pos).toEqual({ x: 3, y: 4 });
    expect(u.pos).not.toBe(pos);
    pos.x = 99;
    expect(u.pos.x).toBe(3);
  });

  it("uses an explicit id when provided", () => {
    const u = createUnit({
      name: "Fixed",
      team: "player",
      classId: "knight",
      pos: { x: 0, y: 0 },
      id: "hero-1",
    });
    expect(u.id).toBe("hero-1");
  });

  it("generates team-prefixed ids when none provided", () => {
    const p = createUnit({
      name: "P",
      team: "player",
      classId: "knight",
      pos: { x: 0, y: 0 },
    });
    const e = createUnit({
      name: "E",
      team: "enemy",
      classId: "knight",
      pos: { x: 0, y: 0 },
    });
    expect(p.id.startsWith("p")).toBe(true);
    expect(e.id.startsWith("e")).toBe(true);
    expect(p.id).not.toBe(e.id);
  });
});

describe("grantXp", () => {
  function freshKnight(level = 1): Unit {
    return createUnit({
      name: "Trainee",
      team: "player",
      classId: "knight",
      level,
      pos: { x: 0, y: 0 },
    });
  }

  it("accumulates xp without leveling when below threshold", () => {
    const u = freshKnight();
    const gained = grantXp(u, 50);
    expect(gained).toBe(0);
    expect(u.level).toBe(1);
    expect(u.xp).toBe(50);
  });

  it("levels up exactly once at the threshold and carries remainder", () => {
    const u = freshKnight();
    const gained = grantXp(u, 120); // threshold at lv1 is 100
    expect(gained).toBe(1);
    expect(u.level).toBe(2);
    expect(u.xp).toBe(20); // 120 - 100
  });

  it("returns the number of levels gained", () => {
    const u = freshKnight();
    // lv1 needs 100, lv2 needs 140 -> 240 total reaches level 3 exactly
    const gained = grantXp(u, 240);
    expect(gained).toBe(2);
    expect(u.level).toBe(3);
    expect(u.xp).toBe(0);
  });

  it("handles multiple level-ups in a single grant", () => {
    const u = freshKnight();
    // 100 + 140 + 180 = 420 to reach level 4
    const gained = grantXp(u, 500);
    expect(gained).toBe(3);
    expect(u.level).toBe(4);
    expect(u.xp).toBe(80); // 500 - 420
  });

  it("raises max stats on level up", () => {
    const u = freshKnight();
    const beforeMaxHp = u.stats.maxHp;
    grantXp(u, 100);
    expect(u.stats.maxHp).toBe(statsForLevel("knight", 2).maxHp);
    expect(u.stats.maxHp).toBeGreaterThan(beforeMaxHp);
  });

  it("a full-HP unit stays at full HP after leveling", () => {
    const u = freshKnight();
    grantXp(u, 100);
    expect(u.stats.hp).toBe(u.stats.maxHp);
    expect(u.stats.mp).toBe(u.stats.maxMp);
  });

  it("preserves the HP ratio so a wounded unit stays wounded", () => {
    const u = freshKnight();
    // Wound to ~half HP.
    u.stats.hp = Math.round(u.stats.maxHp / 2);
    const ratioBefore = u.stats.hp / u.stats.maxHp;
    grantXp(u, 100);
    const ratioAfter = u.stats.hp / u.stats.maxHp;
    // Ratio approximately preserved (rounding tolerance).
    expect(Math.abs(ratioAfter - ratioBefore)).toBeLessThan(0.05);
    // And still wounded, not full.
    expect(u.stats.hp).toBeLessThan(u.stats.maxHp);
  });

  it("preserves the MP ratio across a level up", () => {
    const u = freshKnight();
    u.stats.mp = Math.round(u.stats.maxMp / 2);
    const ratioBefore = u.stats.mp / u.stats.maxMp;
    grantXp(u, 100);
    const ratioAfter = u.stats.mp / u.stats.maxMp;
    expect(Math.abs(ratioAfter - ratioBefore)).toBeLessThan(0.1);
  });

  it("never drops current HP below 1 on level up", () => {
    const u = freshKnight();
    u.stats.hp = 1; // barely alive, tiny ratio
    grantXp(u, 100);
    expect(u.stats.hp).toBeGreaterThanOrEqual(1);
  });

  it("granting zero xp does nothing", () => {
    const u = freshKnight();
    const gained = grantXp(u, 0);
    expect(gained).toBe(0);
    expect(u.level).toBe(1);
    expect(u.xp).toBe(0);
  });
});

describe("grantJp", () => {
  it("adds JP to the unit", () => {
    const u = createUnit({
      name: "Jp",
      team: "player",
      classId: "knight",
      pos: { x: 0, y: 0 },
    });
    grantJp(u, 100);
    expect(u.jp).toBe(100);
    grantJp(u, 50);
    expect(u.jp).toBe(150);
  });

  it("granting zero JP leaves the total unchanged", () => {
    const u = createUnit({
      name: "Jp0",
      team: "player",
      classId: "knight",
      pos: { x: 0, y: 0 },
    });
    grantJp(u, 0);
    expect(u.jp).toBe(0);
  });
});

describe("nextLearnableSkill", () => {
  it("returns the first class skill when none are learned", () => {
    const u = createUnit({
      name: "Learner",
      team: "player",
      classId: "knight",
      pos: { x: 0, y: 0 },
    });
    expect(nextLearnableSkill(u)).toBe("powerStrike");
  });

  it("returns the next unlearned skill in class order", () => {
    const u = createUnit({
      name: "Learner",
      team: "player",
      classId: "knight",
      pos: { x: 0, y: 0 },
      learnedSkillIds: ["powerStrike"],
    });
    expect(nextLearnableSkill(u)).toBe("guard");
  });

  it("returns null when all class skills are learned", () => {
    const c = getClass("knight");
    const u = createUnit({
      name: "Master",
      team: "player",
      classId: "knight",
      pos: { x: 0, y: 0 },
      learnedSkillIds: [...c.skillIds],
    });
    expect(nextLearnableSkill(u)).toBeNull();
  });

  it("skips an out-of-order learned skill and returns the earliest unlearned", () => {
    const u = createUnit({
      name: "Partial",
      team: "player",
      classId: "knight",
      pos: { x: 0, y: 0 },
      learnedSkillIds: ["guard"], // second skill learned, first not
    });
    expect(nextLearnableSkill(u)).toBe("powerStrike");
  });
});

describe("learnNextSkill", () => {
  function knightWithJp(jp: number, learned: string[] = []): Unit {
    const u = createUnit({
      name: "Student",
      team: "player",
      classId: "knight",
      pos: { x: 0, y: 0 },
      learnedSkillIds: learned,
    });
    grantJp(u, jp);
    return u;
  }

  it("learns the next skill and spends JP when affordable", () => {
    const u = knightWithJp(100);
    const learned = learnNextSkill(u, 100);
    expect(learned).toBe("powerStrike");
    expect(u.learnedSkillIds).toContain("powerStrike");
    expect(u.jp).toBe(0);
  });

  it("learns with surplus JP and leaves the remainder", () => {
    const u = knightWithJp(250);
    const learned = learnNextSkill(u, 100);
    expect(learned).toBe("powerStrike");
    expect(u.jp).toBe(150);
  });

  it("refuses and returns null when JP is insufficient", () => {
    const u = knightWithJp(99);
    const learned = learnNextSkill(u, 100);
    expect(learned).toBeNull();
    expect(u.learnedSkillIds).toEqual([]);
    expect(u.jp).toBe(99); // JP not spent
  });

  it("learns when JP exactly equals the cost (boundary)", () => {
    const u = knightWithJp(100);
    const learned = learnNextSkill(u, 100);
    expect(learned).toBe("powerStrike");
    expect(u.jp).toBe(0);
  });

  it("refuses and returns null when nothing is left to learn", () => {
    const c = getClass("knight");
    const u = knightWithJp(1000, [...c.skillIds]);
    const learned = learnNextSkill(u, 0);
    expect(learned).toBeNull();
    expect(u.jp).toBe(1000); // JP not spent
  });

  it("learns skills in class order across multiple calls", () => {
    const u = knightWithJp(1000);
    expect(learnNextSkill(u, 100)).toBe("powerStrike");
    expect(learnNextSkill(u, 100)).toBe("guard");
    expect(learnNextSkill(u, 100)).toBeNull(); // all learned
    expect(u.learnedSkillIds).toEqual(["powerStrike", "guard"]);
    expect(u.jp).toBe(800); // only two skills cost 100 each
  });

  it("checks 'nothing left' before checking JP", () => {
    const c = getClass("knight");
    // No JP, but also nothing left to learn -> null regardless of cost.
    const u = knightWithJp(0, [...c.skillIds]);
    expect(learnNextSkill(u, 100)).toBeNull();
  });
});
