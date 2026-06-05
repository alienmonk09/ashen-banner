import type { ClassId, Difficulty, RaceId, Reaction, Unit } from "./types";
import { createStartingParty } from "../data/party";
import { startingInventory, getItem } from "../data/items";
import { CLASSES } from "../data/classes";
import { RACES } from "../data/races";
import { WEAPONS, getWeapon } from "../data/weapons";
import { EQUIPMENT, getEquipment } from "../data/equipment";
import { equip } from "./unit";

export interface GameState {
  /** Persistent player units carried across phases. */
  party: Unit[];
  /** Shared consumable inventory: item id -> count. */
  inventory: Record<string, number>;
  /** 0-based index of the current phase. */
  phaseIndex: number;
  /** Selected difficulty; scales enemy levels. */
  difficulty: Difficulty;
  /** Party treasury in gil. Earned by defeating enemies. */
  gil: number;
  /** Equipment pieces the party has purchased; only owned gear may be equipped. */
  ownedEquipment: string[];
  /** Weapons the party has purchased; only owned weapons may be equipped. */
  ownedWeapons: string[];
  /** Save slot this run persists to (0-based). Slot 0 uses the legacy key. */
  slot: number;
  /** Number of times the campaign has been cleared in New Game+ mode. */
  ngPlus: number;
  /** Classic mode: a party member who falls in battle is lost permanently. */
  permadeath: boolean;
}

export function createGameState(): GameState {
  const party = createStartingParty();
  return {
    party,
    inventory: startingInventory(),
    phaseIndex: 0,
    difficulty: "normal",
    gil: 0,
    ownedEquipment: [],
    // Seed with the starting party's equipped weapons so they are always owned.
    ownedWeapons: [...new Set(party.map((u) => u.weaponId))],
    slot: 0,
    ngPlus: 0,
    permadeath: false,
  };
}

/**
 * Classic mode survivor filter, applied after a victory. When permadeath is on,
 * fallen heroes (alive === false at battle end) are dropped from the party for
 * good; otherwise the party is returned unchanged. Pure — does not mutate input.
 */
export function survivorsAfterBattle(party: Unit[], permadeath: boolean): Unit[] {
  if (!permadeath) return party;
  return party.filter((u) => u.alive !== false);
}

/** Total number of save slots. */
export const SAVE_SLOTS = 3;

/** Flat gil awarded per enemy defeated in battle. */
export const GIL_PER_KILL = 18;

/**
 * Attempt to purchase one unit of an item from the camp shop.
 * Deducts the item's price from `state.gil` and increments the inventory count.
 * Returns true on success; false if gil is insufficient or the item is unknown.
 */
export function buyItem(state: GameState, itemId: string): boolean {
  let item;
  try {
    item = getItem(itemId);
  } catch {
    return false;
  }
  if (state.gil < item.price) return false;
  state.gil -= item.price;
  state.inventory[itemId] = (state.inventory[itemId] ?? 0) + 1;
  return true;
}

/**
 * Check whether the party owns a particular equipment piece.
 */
export function ownsEquipment(state: GameState, id: string): boolean {
  return state.ownedEquipment.includes(id);
}

/**
 * Attempt to purchase an equipment piece from the gear shop.
 * Deducts the item's price from `state.gil` and adds its id to `ownedEquipment`.
 * Returns true on success; false if the equipment is unknown, already owned,
 * or gil is insufficient (no mutation occurs on false).
 */
export function buyEquipment(state: GameState, id: string): boolean {
  let equipment;
  try {
    equipment = getEquipment(id);
  } catch {
    return false;
  }
  if (ownsEquipment(state, id)) return false;
  if (state.gil < equipment.price) return false;
  state.gil -= equipment.price;
  state.ownedEquipment.push(id);
  return true;
}

/**
 * Attempt to sell one unit of a consumable item back to the camp shop.
 * Increments `state.gil` by half the item's price (floored) and decrements
 * the inventory count. Returns true on success; false if the item is unknown
 * or the party has none in stock (no mutation on false).
 */
export function sellItem(state: GameState, itemId: string): boolean {
  let item;
  try {
    item = getItem(itemId);
  } catch {
    return false;
  }
  const count = state.inventory[itemId] ?? 0;
  if (count <= 0) return false;
  state.inventory[itemId] = count - 1;
  state.gil += Math.floor(item.price / 2);
  return true;
}

/**
 * Attempt to sell an owned equipment piece back to the gear shop.
 * Removes it from `ownedEquipment`, unequips it from any party unit currently
 * wearing it (recomputing their stats), and increments `state.gil` by half the
 * equipment's price (floored). Returns true on success; false if the equipment
 * is unknown or not currently owned (no mutation on false).
 */
export function sellEquipment(state: GameState, id: string): boolean {
  let equipment;
  try {
    equipment = getEquipment(id);
  } catch {
    return false;
  }
  if (!ownsEquipment(state, id)) return false;
  state.ownedEquipment = state.ownedEquipment.filter((owned) => owned !== id);
  // Unequip from any party member currently wearing this piece.
  for (const unit of state.party) {
    if (unit.armorId === id) equip(unit, "armor", null);
    if (unit.accessoryId === id) equip(unit, "accessory", null);
  }
  state.gil += Math.floor(equipment.price / 2);
  return true;
}

/**
 * Check whether the party owns a particular weapon.
 */
export function ownsWeapon(state: GameState, id: string): boolean {
  return state.ownedWeapons.includes(id);
}

/**
 * Attempt to purchase a weapon from the weapon shop.
 * Deducts the weapon's price from `state.gil` and adds its id to `ownedWeapons`.
 * Returns true on success; false if the weapon is unknown, already owned,
 * or gil is insufficient (no mutation occurs on false).
 */
export function buyWeapon(state: GameState, id: string): boolean {
  let weapon;
  try {
    weapon = getWeapon(id);
  } catch {
    return false;
  }
  if (ownsWeapon(state, id)) return false;
  if (state.gil < weapon.price) return false;
  state.gil -= weapon.price;
  state.ownedWeapons.push(id);
  return true;
}

/**
 * Attempt to sell an owned weapon back to the weapon shop.
 * Refuses (returns false) if any party unit currently has this weapon equipped —
 * a unit can never be left unarmed.
 * On a valid sell, removes from `ownedWeapons` and adds floor(price/2) gil.
 * Returns false if the weapon is unknown, not owned, or currently equipped by
 * any unit.
 */
export function sellWeapon(state: GameState, id: string): boolean {
  let weapon;
  try {
    weapon = getWeapon(id);
  } catch {
    return false;
  }
  if (!ownsWeapon(state, id)) return false;
  // Refuse to sell a weapon currently equipped by any party unit (no disarming).
  if (state.party.some((u) => u.weaponId === id)) return false;
  state.ownedWeapons = state.ownedWeapons.filter((owned) => owned !== id);
  state.gil += Math.floor(weapon.price / 2);
  return true;
}

const VALID_DIFFICULTIES: Difficulty[] = ["easy", "normal", "hard"];
const VALID_REACTIONS: Reaction[] = ["counter", "autoPotion", "cover"];

/**
 * Adjust an enemy's authored level by the selected difficulty and NG+ cycle.
 * easy  → level - 1 (floored at 1)
 * normal → unchanged
 * hard  → level + 2
 * Each NG+ cycle adds an additional +3 levels on top of difficulty scaling.
 */
export function enemyLevelFor(baseLevel: number, difficulty: Difficulty, ngPlus = 0): number {
  let level: number;
  if (difficulty === "easy") level = Math.max(1, baseLevel - 1);
  else if (difficulty === "hard") level = baseLevel + 2;
  else level = baseLevel;
  return level + ngPlus * 3;
}

/**
 * Begin a New Game+ run: increment the NG+ cycle counter, reset the phase to
 * the start, refresh the consumable inventory, and keep everything else
 * (party levels / skills, gil, owned equipment, difficulty, save slot).
 */
export function startNgPlus(state: GameState): void {
  state.ngPlus += 1;
  state.phaseIndex = 0;
  state.inventory = startingInventory();
}

export const SAVE_KEY = "tactics-mvp-save";

/** Summary of a save slot for the title screen slot list. */
export interface SaveSummary {
  slot: number;
  phaseIndex: number;
  partySize: number;
}

/** Storage key for a given slot. Slot 0 uses the legacy key for back-compat. */
function slotKey(slot: number): string {
  return slot === 0 ? SAVE_KEY : `${SAVE_KEY}-${slot}`;
}

export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(slotKey(state.slot), JSON.stringify(state));
  } catch {
    // ignore (private mode / no storage)
  }
}

/** Shape-check a parsed save so a corrupt/incompatible blob can't crash the game. */
function isValidSave(data: unknown): data is GameState {
  if (!data || typeof data !== "object") return false;
  const s = data as Partial<GameState>;
  if (typeof s.phaseIndex !== "number" || s.phaseIndex < 0) return false;
  if (!s.inventory || typeof s.inventory !== "object") return false;
  if (!Array.isArray(s.party) || s.party.length === 0) return false;
  for (const u of s.party) {
    if (!u || typeof u !== "object") return false;
    if (!CLASSES[u.classId as ClassId]) return false;
    if (u.subClassId !== undefined && !CLASSES[u.subClassId as ClassId]) return false;
    if (!RACES[u.raceId as RaceId]) return false;
    if (!WEAPONS[u.weaponId]) return false;
    if (u.armorId !== undefined && (!EQUIPMENT[u.armorId] || EQUIPMENT[u.armorId].slot !== "armor")) return false;
    if (u.accessoryId !== undefined && (!EQUIPMENT[u.accessoryId] || EQUIPMENT[u.accessoryId].slot !== "accessory")) return false;
    if (u.reactionId !== undefined && !VALID_REACTIONS.includes(u.reactionId as Reaction)) return false;
    if (!u.stats || typeof u.stats.maxHp !== "number") return false;
    if (typeof u.level !== "number" || !Array.isArray(u.learnedSkillIds)) return false;
    if (!u.pos || typeof u.pos.x !== "number" || typeof u.pos.y !== "number") return false;
  }
  return true;
}

export function loadGame(slot = 0): GameState | null {
  try {
    const raw = localStorage.getItem(slotKey(slot));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidSave(parsed)) {
      clearSave(slot);
      return null;
    }
    // Back-compat: old saves lack `difficulty`; normalise any missing/invalid value.
    if (!VALID_DIFFICULTIES.includes(parsed.difficulty as Difficulty)) {
      parsed.difficulty = "normal" as Difficulty;
    }
    // Back-compat: old saves lack `gil`; normalise any missing/invalid value.
    if (typeof parsed.gil !== "number" || !isFinite(parsed.gil) || parsed.gil < 0) {
      parsed.gil = 0;
    }
    // Back-compat: old saves lack `ownedEquipment`; normalise to [].
    if (!Array.isArray(parsed.ownedEquipment)) {
      parsed.ownedEquipment = [] as string[];
    }
    // Back-compat: old saves lack `ownedWeapons`; normalise to [].
    if (!Array.isArray(parsed.ownedWeapons)) {
      parsed.ownedWeapons = [] as string[];
    }
    // Back-compat: old saves lack `slot`; normalise to the slot it was loaded from.
    if (typeof parsed.slot !== "number") {
      parsed.slot = slot;
    } else {
      parsed.slot = slot;
    }
    // Back-compat: old saves lack `ngPlus`; normalise any missing/invalid value.
    if (typeof parsed.ngPlus !== "number" || !isFinite(parsed.ngPlus) || parsed.ngPlus < 0) {
      parsed.ngPlus = 0;
    }
    // Back-compat: old saves lack `permadeath`; normalise any missing/invalid value.
    if (typeof parsed.permadeath !== "boolean") {
      parsed.permadeath = false;
    }
    // Migration: any gear a unit already has equipped should be in ownedEquipment.
    const owned = parsed.ownedEquipment as string[];
    for (const u of parsed.party as Unit[]) {
      if (u.armorId && !owned.includes(u.armorId)) owned.push(u.armorId);
      if (u.accessoryId && !owned.includes(u.accessoryId)) owned.push(u.accessoryId);
    }
    // Migration: any weapon a unit currently has equipped should be in ownedWeapons.
    const ownedWpns = parsed.ownedWeapons as string[];
    for (const u of parsed.party as Unit[]) {
      if (u.weaponId && !ownedWpns.includes(u.weaponId)) ownedWpns.push(u.weaponId);
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearSave(slot = 0): void {
  try {
    localStorage.removeItem(slotKey(slot));
  } catch {
    // ignore
  }
}

/**
 * Return a summary of every save slot (length = SAVE_SLOTS).
 * Null entries indicate an empty or invalid slot.
 */
export function listSaves(): (SaveSummary | null)[] {
  const result: (SaveSummary | null)[] = [];
  for (let i = 0; i < SAVE_SLOTS; i++) {
    const save = loadGame(i);
    if (save === null) {
      result.push(null);
    } else {
      result.push({ slot: i, phaseIndex: save.phaseIndex, partySize: save.party.length });
    }
  }
  return result;
}

/** Reset a unit's per-battle volatile state (full restore, clear CT/statuses). */
export function refreshForBattle(unit: Unit): void {
  unit.stats.hp = unit.stats.maxHp;
  unit.stats.mp = unit.stats.maxMp;
  unit.ct = 0;
  unit.statuses = [];
  unit.alive = true;
}
