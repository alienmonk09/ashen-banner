// Shared types for the Tactics MVP.

export type Team = "player" | "enemy";

export interface Point {
  x: number;
  y: number;
}

/** Cardinal facing on the grid (n = -y, s = +y, e = +x, w = -x). */
export type Direction = "n" | "e" | "s" | "w";

/** Mutable stat block for a unit. */
export interface Stats {
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  atk: number;
  def: number;
  mag: number;
  res: number;
  spd: number;
  move: number;
  jump: number;
}

export type ClassId = "knight" | "archer" | "blackMage" | "whiteMage" | "monk" | "thief" | "druid" | "timeMage";

export type RaceId = "human" | "elf" | "dwarf" | "halfling" | "orc";

/** Flat stat deltas a race applies on top of class stats (omitted = 0). */
export type RaceMod = Partial<Pick<Stats, "hp" | "mp" | "atk" | "def" | "mag" | "res" | "spd" | "move" | "jump">>;

export interface RaceDef {
  id: RaceId;
  name: string;
  description: string;
  /** Additive modifiers applied to every level's stat block. */
  mod: RaceMod;
  /** Elements this race takes extra damage from (×1.5). */
  weak?: Element[];
  /** Elements this race shrugs off (×0.5). */
  resist?: Element[];
}

/** Per-level stat growth applied on level up. */
export interface StatGrowth {
  hp: number;
  mp: number;
  atk: number;
  def: number;
  mag: number;
  res: number;
  spd: number;
}

/** Level-1 base stats for a class (no current/max split — derived per level). */
export interface BaseStats {
  hp: number;
  mp: number;
  atk: number;
  def: number;
  mag: number;
  res: number;
  spd: number;
  move: number;
  jump: number;
}

export interface ClassDef {
  id: ClassId;
  name: string;
  description: string;
  base: BaseStats;
  growth: StatGrowth;
  /** Skills in unlock order. JP spent learns the next one. */
  skillIds: string[];
  /** Weapon ids this class can equip. */
  weaponIds: string[];
  /** Innate reaction ability, if any (e.g. "counter" strikes back at melee attackers). */
  reaction?: Reaction;
  /** Color used to tint the unit token. */
  color: string;
}

export type Reaction = "counter";

export type Element = "none" | "fire" | "ice" | "bolt" | "holy" | "nature";

export type AoeShape = "single" | "cross" | "square3";

/** Visual terrain kind for a tile (cosmetic + derives default walkability tint). */
export type TerrainType = "grass" | "dirt" | "rock" | "sand" | "water" | "wood";

export type SkillEffect = "damage" | "heal" | "buff" | "debuff" | "revive";

export interface SkillDef {
  id: string;
  name: string;
  description: string;
  mpCost: number;
  jpCost: number;
  range: number;
  aoe: AoeShape;
  power: number;
  element: Element;
  effect: SkillEffect;
  /** physical skills scale on ATK, magical on MAG. */
  scaling: "physical" | "magical";
  /** For buff/debuff: which status this skill applies. */
  statusKind?: StatusKind;
  /** For buff/debuff: how many turns the status lasts (defaults: buff 2, debuff 3). */
  statusDuration?: number;
}

export type WeaponKind = "physical" | "magical";

export interface WeaponDef {
  id: string;
  name: string;
  power: number;
  range: number;
  kind: WeaponKind;
  classes: ClassId[];
}

export type ItemEffect = "healHp" | "healMp" | "revive" | "buff";

export interface ItemDef {
  id: string;
  name: string;
  description: string;
  effect: ItemEffect;
  amount: number;
  range: number;
  /** For buff items: which status to grant and for how long. */
  statusKind?: StatusKind;
  statusDuration?: number;
}

/**
 * Combat statuses. `guard` (+def, self), `slow`/`haste` (turn speed),
 * `poison` (HP drain each turn), `regen` (HP heal each turn), `stop` (lose
 * turns), `protect` (−physical taken), `shell` (−magical taken).
 */
export type StatusKind =
  | "guard"
  | "slow"
  | "haste"
  | "poison"
  | "regen"
  | "stop"
  | "protect"
  | "shell";

export interface ActiveStatus {
  kind: StatusKind;
  turnsLeft: number;
}

export interface Unit {
  id: string;
  name: string;
  team: Team;
  classId: ClassId;
  raceId: RaceId;
  level: number;
  xp: number;
  jp: number;
  learnedSkillIds: string[];
  weaponId: string;
  pos: Point;
  /** Which way the unit faces; drives flank/rear attack bonuses. Per-battle volatile. */
  facing: Direction;
  ct: number;
  stats: Stats;
  statuses: ActiveStatus[];
  /** false once HP hits 0; can be revived. */
  alive: boolean;
}

export interface Tile {
  x: number;
  y: number;
  z: number;
  walkable: boolean;
}

/**
 * Win condition for a battle. The player always loses if wiped out; the
 * objective decides what counts as a win. Defaults to "rout" (defeat all foes).
 */
export type Objective =
  | { kind: "rout" }
  | { kind: "defeat"; targetName: string }
  | { kind: "survive"; turns: number };

export interface MapDef {
  id: string;
  name: string;
  intro: string;
  /** Win condition; omitted = defeat all enemies. */
  objective?: Objective;
  width: number;
  height: number;
  /** Height per tile, row-major [y][x]. */
  heights: number[][];
  /** Optional unwalkable mask [y][x]; true = blocked. */
  blocked?: boolean[][];
  /** Optional cosmetic terrain map [y][x]. Falls back to water (blocked) / grass. */
  terrain?: TerrainType[][];
  playerSpawns: Point[];
  enemies: EnemySpawn[];
}

export interface EnemySpawn {
  name: string;
  classId: ClassId;
  level: number;
  weaponId: string;
  pos: Point;
  /** Skills this enemy knows (subset of class skills). */
  skillIds?: string[];
}

export const CT_THRESHOLD = 100;
