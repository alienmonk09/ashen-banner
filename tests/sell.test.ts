import { describe, it, expect } from "vitest";
import { createGameState, sellItem, sellEquipment } from "../src/core/state";
import { ITEMS } from "../src/data/items";
import { EQUIPMENT } from "../src/data/equipment";
import { createUnit } from "../src/core/unit";
import { equip } from "../src/core/unit";

// ---------------------------------------------------------------------------
// sellItem
// ---------------------------------------------------------------------------

describe("sellItem", () => {
  it("decrements inventory count and adds floor(price/2) gil, returns true", () => {
    const state = createGameState();
    state.inventory["potion"] = 3;
    state.gil = 0;
    const result = sellItem(state, "potion");
    expect(result).toBe(true);
    expect(state.inventory["potion"]).toBe(2);
    expect(state.gil).toBe(Math.floor(ITEMS.potion.price / 2));
  });

  it("returns false and mutates nothing when stock is 0", () => {
    const state = createGameState();
    state.inventory["potion"] = 0;
    state.gil = 50;
    const result = sellItem(state, "potion");
    expect(result).toBe(false);
    expect(state.inventory["potion"]).toBe(0);
    expect(state.gil).toBe(50);
  });

  it("returns false and mutates nothing when item is unknown", () => {
    const state = createGameState();
    state.gil = 50;
    const result = sellItem(state, "nonexistent_item");
    expect(result).toBe(false);
    expect(state.gil).toBe(50);
  });

  it("treats a missing inventory key as count 0 and returns false", () => {
    const state = createGameState();
    delete state.inventory["phoenixDown"];
    state.gil = 0;
    const result = sellItem(state, "phoenixDown");
    expect(result).toBe(false);
    expect(state.gil).toBe(0);
  });

  it("floors the sell value (odd prices)", () => {
    // phoenixDown costs 120 → floor(120/2) = 60
    const state = createGameState();
    state.inventory["phoenixDown"] = 1;
    state.gil = 0;
    sellItem(state, "phoenixDown");
    expect(state.gil).toBe(Math.floor(ITEMS.phoenixDown.price / 2));
  });

  it("never produces negative inventory", () => {
    const state = createGameState();
    state.inventory["potion"] = 1;
    sellItem(state, "potion");
    expect(state.inventory["potion"]).toBe(0);
    // Selling again must not go negative
    const result = sellItem(state, "potion");
    expect(result).toBe(false);
    expect(state.inventory["potion"]).toBe(0);
  });

  it("accumulates gil across multiple sells", () => {
    const state = createGameState();
    state.inventory["ether"] = 3;
    state.gil = 10;
    sellItem(state, "ether");
    sellItem(state, "ether");
    expect(state.gil).toBe(10 + 2 * Math.floor(ITEMS.ether.price / 2));
    expect(state.inventory["ether"]).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// sellEquipment
// ---------------------------------------------------------------------------

describe("sellEquipment", () => {
  it("removes from ownedEquipment and adds floor(price/2) gil, returns true", () => {
    const state = createGameState();
    state.ownedEquipment.push("ironRing");
    state.gil = 0;
    const result = sellEquipment(state, "ironRing");
    expect(result).toBe(true);
    expect(state.ownedEquipment).not.toContain("ironRing");
    expect(state.gil).toBe(Math.floor(EQUIPMENT.ironRing.price / 2));
  });

  it("returns false and mutates nothing when equipment is not owned", () => {
    const state = createGameState();
    state.gil = 100;
    const result = sellEquipment(state, "ironRing");
    expect(result).toBe(false);
    expect(state.gil).toBe(100);
    expect(state.ownedEquipment).not.toContain("ironRing");
  });

  it("returns false and mutates nothing for an unknown equipment id", () => {
    const state = createGameState();
    state.gil = 100;
    const result = sellEquipment(state, "nonexistent_gear");
    expect(result).toBe(false);
    expect(state.gil).toBe(100);
    expect(state.ownedEquipment).toEqual([]);
  });

  it("unequips armor from any unit wearing it and recomputes stats", () => {
    const state = createGameState();
    state.ownedEquipment.push("leatherArmor");

    // Build a unit and equip leatherArmor
    const unit = createUnit({ name: "Tester", team: "player", classId: "knight", pos: { x: 0, y: 0 } });
    equip(unit, "armor", "leatherArmor");
    state.party = [unit];

    const statsBefore = { ...unit.stats };
    expect(unit.armorId).toBe("leatherArmor");
    expect(unit.stats.def).toBeGreaterThan(statsBefore.def - EQUIPMENT.leatherArmor.mod.def!);

    sellEquipment(state, "leatherArmor");

    expect(unit.armorId).toBeUndefined();
    // DEF should drop back by the armor's bonus
    expect(unit.stats.def).toBe(statsBefore.def - EQUIPMENT.leatherArmor.mod.def!);
    expect(state.ownedEquipment).not.toContain("leatherArmor");
    expect(state.gil).toBe(Math.floor(EQUIPMENT.leatherArmor.price / 2));
  });

  it("unequips accessory from any unit wearing it and recomputes stats", () => {
    const state = createGameState();
    state.ownedEquipment.push("ironRing");

    const unit = createUnit({ name: "Tester", team: "player", classId: "knight", pos: { x: 0, y: 0 } });
    equip(unit, "accessory", "ironRing");
    state.party = [unit];

    const hpBefore = unit.stats.maxHp;
    expect(unit.accessoryId).toBe("ironRing");

    sellEquipment(state, "ironRing");

    expect(unit.accessoryId).toBeUndefined();
    expect(unit.stats.maxHp).toBe(hpBefore - EQUIPMENT.ironRing.mod.hp!);
    expect(state.ownedEquipment).not.toContain("ironRing");
  });

  it("only unequips the sold piece, not other equipment", () => {
    const state = createGameState();
    state.ownedEquipment.push("leatherArmor", "ironRing");

    const unit = createUnit({ name: "Tester", team: "player", classId: "knight", pos: { x: 0, y: 0 } });
    equip(unit, "armor", "leatherArmor");
    equip(unit, "accessory", "ironRing");
    state.party = [unit];

    sellEquipment(state, "leatherArmor");

    expect(unit.armorId).toBeUndefined();
    expect(unit.accessoryId).toBe("ironRing"); // untouched
    expect(state.ownedEquipment).toContain("ironRing");
    expect(state.ownedEquipment).not.toContain("leatherArmor");
  });

  it("does not duplicate gil on repeated calls to sell the same id", () => {
    const state = createGameState();
    state.ownedEquipment.push("swiftBoots");
    state.gil = 0;
    sellEquipment(state, "swiftBoots");
    const gilAfterFirst = state.gil;
    // Second call should return false and not add more gil
    const result = sellEquipment(state, "swiftBoots");
    expect(result).toBe(false);
    expect(state.gil).toBe(gilAfterFirst);
  });
});
