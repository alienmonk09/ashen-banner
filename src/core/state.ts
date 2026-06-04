import type { ClassId, Unit } from "./types";
import { createStartingParty } from "../data/party";
import { startingInventory } from "../data/items";
import { CLASSES } from "../data/classes";
import { WEAPONS } from "../data/weapons";

export interface GameState {
  /** Persistent player units carried across phases. */
  party: Unit[];
  /** Shared consumable inventory: item id -> count. */
  inventory: Record<string, number>;
  /** 0-based index of the current phase. */
  phaseIndex: number;
}

export function createGameState(): GameState {
  return {
    party: createStartingParty(),
    inventory: startingInventory(),
    phaseIndex: 0,
  };
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
    if (!WEAPONS[u.weaponId]) return false;
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
