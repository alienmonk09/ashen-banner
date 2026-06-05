import { describe, it, expect } from "vitest";
import { hasAutoPotion, resolveAutoPotion } from "../src/battle/combat";
import { createUnit } from "../src/core/unit";
import type { Unit } from "../src/core/types";

function thief(overrides: Partial<Parameters<typeof createUnit>[0]> = {}): Unit {
  return createUnit({
    name: "T",
    team: "player",
    classId: "thief",
    pos: { x: 0, y: 0 },
    ...overrides,
  });
}

function knight(overrides: Partial<Parameters<typeof createUnit>[0]> = {}): Unit {
  return createUnit({
    name: "K",
    team: "player",
    classId: "knight",
    pos: { x: 1, y: 0 },
    ...overrides,
  });
}

describe("hasAutoPotion", () => {
  it("returns true for a Thief", () => {
    expect(hasAutoPotion(thief())).toBe(true);
  });

  it("returns false for a Knight", () => {
    expect(hasAutoPotion(knight())).toBe(false);
  });
});

describe("resolveAutoPotion", () => {
  it("heals and decrements inventory when a Thief is below 30% HP with potions available", () => {
    const unit = thief();
    unit.stats.maxHp = 100;
    unit.stats.hp = 20; // 20% — below threshold
    const inventory: Record<string, number> = { potion: 3 };

    const res = resolveAutoPotion(unit, inventory);

    expect(res).not.toBeNull();
    expect(res!.kind).toBe("heal");
    expect(res!.amount).toBeGreaterThan(0);
    expect(inventory["potion"]).toBe(2); // decremented by 1
    expect(unit.stats.hp).toBeGreaterThan(20); // healed
  });

  it("returns null and does NOT touch inventory when HP is above the threshold", () => {
    const unit = thief();
    unit.stats.maxHp = 100;
    unit.stats.hp = 50; // 50% — above 30%
    const inventory: Record<string, number> = { potion: 3 };

    const res = resolveAutoPotion(unit, inventory);

    expect(res).toBeNull();
    expect(inventory["potion"]).toBe(3); // untouched
  });

  it("returns null for a Knight (no autoPotion reaction)", () => {
    const unit = knight();
    unit.stats.maxHp = 100;
    unit.stats.hp = 10;
    const inventory: Record<string, number> = { potion: 5 };

    const res = resolveAutoPotion(unit, inventory);

    expect(res).toBeNull();
    expect(inventory["potion"]).toBe(5); // untouched
  });

  it("returns null and does NOT touch inventory when the unit is dead", () => {
    const unit = thief();
    unit.stats.maxHp = 100;
    unit.stats.hp = 0;
    unit.alive = false;
    const inventory: Record<string, number> = { potion: 3 };

    const res = resolveAutoPotion(unit, inventory);

    expect(res).toBeNull();
    expect(inventory["potion"]).toBe(3); // untouched
  });

  it("returns null and does NOT touch inventory when no potions are in stock", () => {
    const unit = thief();
    unit.stats.maxHp = 100;
    unit.stats.hp = 20;
    const inventory: Record<string, number> = { potion: 0, hiPotion: 0 };

    const res = resolveAutoPotion(unit, inventory);

    expect(res).toBeNull();
    expect(inventory["potion"]).toBe(0);
    expect(inventory["hiPotion"]).toBe(0);
  });

  it("prefers 'potion' over 'hiPotion' when both are present", () => {
    const unit = thief();
    unit.stats.maxHp = 100;
    unit.stats.hp = 20;
    const inventory: Record<string, number> = { potion: 2, hiPotion: 1 };

    resolveAutoPotion(unit, inventory);

    expect(inventory["potion"]).toBe(1); // potion consumed
    expect(inventory["hiPotion"]).toBe(1); // hiPotion untouched
  });

  it("falls back to 'hiPotion' when no 'potion' is available", () => {
    const unit = thief();
    unit.stats.maxHp = 100;
    unit.stats.hp = 20;
    const inventory: Record<string, number> = { potion: 0, hiPotion: 2 };

    const res = resolveAutoPotion(unit, inventory);

    expect(res).not.toBeNull();
    expect(res!.kind).toBe("heal");
    expect(inventory["potion"]).toBe(0); // unchanged
    expect(inventory["hiPotion"]).toBe(1); // decremented
  });

  it("heals the correct amount from a regular potion (18 HP)", () => {
    const unit = thief();
    unit.stats.maxHp = 100;
    unit.stats.hp = 20;
    const inventory: Record<string, number> = { potion: 1 };

    resolveAutoPotion(unit, inventory);

    // potion heals 18 HP; 20 + 18 = 38 (well under maxHp, so full amount applied)
    expect(unit.stats.hp).toBe(38);
  });

  it("heals the correct amount from a hi-potion (42 HP)", () => {
    const unit = thief();
    unit.stats.maxHp = 100;
    unit.stats.hp = 20;
    const inventory: Record<string, number> = { potion: 0, hiPotion: 1 };

    resolveAutoPotion(unit, inventory);

    // hiPotion heals 42 HP; 20 + 42 = 62 (under maxHp)
    expect(unit.stats.hp).toBe(62);
  });

  it("respects a custom threshold", () => {
    const unit = thief();
    unit.stats.maxHp = 100;
    unit.stats.hp = 40; // 40% — above default 30% but below 50%
    const inventory: Record<string, number> = { potion: 1 };

    const resDefault = resolveAutoPotion(unit, { potion: 1 });
    expect(resDefault).toBeNull(); // 40% >= 30% default threshold

    const resCustom = resolveAutoPotion(unit, inventory, 0.5);
    expect(resCustom).not.toBeNull(); // 40% < 50% custom threshold
  });
});
