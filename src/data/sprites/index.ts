import type { ClassId, SkillDef, Unit, WeaponDef } from "../../core/types";
import type { AnimDef, SpriteDef } from "../../engine/sprite";
import { CHARACTER_SPRITES } from "./characters";
import { HERO_SPRITES } from "./heroes";
import { WEAPON_SPRITES } from "./weapons";
import { ITEM_SPRITES } from "./items";
import { SKILL_SPRITES } from "./skills";
import { EQUIPMENT_SPRITES } from "./equipment";
import { VFX } from "./vfx";

export type VfxKey =
  | "physical"
  | "arcane"
  | "fire"
  | "bolt"
  | "holy"
  | "heal"
  | "revive"
  | "status";

/** Tiny grey box shown if an id ever lacks a sprite (never expected in practice). */
const MISSING: SpriteDef = {
  palette: { o: "#888c99", x: "#cfd3dd" },
  rows: ["oooooo", "oxxxxo", "ox..xo", "oxxxxo", "oooooo"],
};

export function getCharacterSprite(classId: ClassId): SpriteDef {
  return CHARACTER_SPRITES[classId] ?? MISSING;
}
/** A roster hero's unique sprite, or undefined if none is defined for that id. */
export function getHeroSprite(id: string): SpriteDef | undefined {
  return HERO_SPRITES[id];
}
/**
 * The sprite to draw for a unit. Player units carry their roster id, so they get
 * their unique hero sprite; everyone else (enemies) uses the generic class art.
 */
export function getUnitSprite(unit: Unit): SpriteDef {
  if (unit.team === "player") {
    const hero = HERO_SPRITES[unit.id];
    if (hero) return hero;
  }
  return getCharacterSprite(unit.classId);
}
export function getWeaponSprite(id: string): SpriteDef {
  return WEAPON_SPRITES[id] ?? MISSING;
}
export function getItemSprite(id: string): SpriteDef {
  return ITEM_SPRITES[id] ?? MISSING;
}
export function getSkillSprite(id: string): SpriteDef {
  return SKILL_SPRITES[id] ?? MISSING;
}
export function getEquipmentSprite(idOrSlot: string): SpriteDef {
  return EQUIPMENT_SPRITES[idOrSlot] ?? MISSING;
}
export function getVfx(key: string): AnimDef | null {
  return VFX[key] ?? null;
}

/** Map a skill to its spell-effect family. */
export function vfxKeyForSkill(skill: SkillDef): VfxKey {
  if (skill.element === "fire") return "fire";
  if (skill.element === "bolt") return "bolt";
  if (skill.element === "holy") {
    if (skill.effect === "revive") return "revive";
    if (skill.effect === "heal") return "heal";
    return "holy";
  }
  if (skill.element === "nature") {
    if (skill.effect === "revive") return "revive";
    if (skill.effect === "heal") return "heal";
    if (skill.effect === "buff" || skill.effect === "debuff") return "status";
    return "arcane";
  }
  // element "none"
  if (skill.effect === "heal") return "heal";
  if (skill.effect === "revive") return "revive";
  if (skill.effect === "buff" || skill.effect === "debuff") return "status";
  // Non-elemental magic damage (e.g. Time Mage's Comet) reads as arcane.
  if (skill.scaling === "magical") return "arcane";
  return "physical";
}

/** Map a basic weapon attack to its hit-effect family. */
export function vfxKeyForWeapon(weapon: WeaponDef): VfxKey {
  return weapon.kind === "magical" ? "arcane" : "physical";
}

export {
  CHARACTER_SPRITES,
  HERO_SPRITES,
  WEAPON_SPRITES,
  ITEM_SPRITES,
  SKILL_SPRITES,
  EQUIPMENT_SPRITES,
  VFX,
};
export type { SpriteDef, AnimDef };
