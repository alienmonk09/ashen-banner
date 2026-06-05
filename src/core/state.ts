import type { ClassId, Difficulty, RaceId, Reaction, Unit } from "./types";
import { createStartingParty } from "../data/party";
import { startingInventory, getItem } from "../data/items";
import { CLASSES } from "../data/classes";
import { RACES } from "../data/races";
import { WEAPONS } from "../data/weapons";
import { EQUIPMENT, getEquipment } from "../data/equipment";

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
}

export function createGameState(): GameState {
  return {
    party: createStartingParty(),
    inventory: startingInventory(),
    phaseIndex: 0,
    difficulty: "normal",
    gil: 0,
    ownedEquipment: [],
  };
}

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

const VALID_DIFFICULTIES: Difficulty[] = ["easy", "normal", "hard"];
const VALID_REACTIONS: Reaction[] = ["counter", "autoPotion", "cover"];

/**
 * Adjust an enemy's authored level by the selected difficulty.
 * easy  → level - 1 (floored at 1)
 * normal → unchanged
 * hard  → level + 2
 */
export function enemyLevelFor(baseLevel: number, difficulty: Difficulty): number {
  if (difficulty === "easy") return Math.max(1, baseLevel - 1);
  if (difficulty === "hard") return baseLevel + 2;
  return baseLevel;
}

const SAVE_KEY = "tactics-mvp-save";

export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
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

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidSave(parsed)) {
      clearSave();
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
    // Migration: any gear a unit already has equipped should be in ownedEquipment.
    const owned = parsed.ownedEquipment as string[];
    for (const u of parsed.party as Unit[]) {
      if (u.armorId && !owned.includes(u.armorId)) owned.push(u.armorId);
      if (u.accessoryId && !owned.includes(u.accessoryId)) owned.push(u.accessoryId);
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}

/** Reset a unit's per-battle volatile state (full restore, clear CT/statuses). */
export function refreshForBattle(unit: Unit): void {
  unit.stats.hp = unit.stats.maxHp;
  unit.stats.mp = unit.stats.maxMp;
  unit.ct = 0;
  unit.statuses = [];
  unit.alive = true;
}
