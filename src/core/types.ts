// Shared types for the Tactics MVP.

export type Team = "player" | "enemy";

export type AIPersonality = "balanced" | "aggressive" | "defensive" | "support";

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

export type ClassId = "knight" | "archer" | "blackMage" | "whiteMage" | "monk" | "thief" | "druid" | "timeMage" | "summoner" | "geomancer" | "lancer" | "paladin" | "berserker" | "ninja";

export type RaceId = "human" | "elf" | "dwarf" | "halfling" | "orc" | "gnome" | "saurian" | "sylph";

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
  /** Skills in unlock order. SP spent learns the next one. */
  skillIds: string[];
  /** Weapon ids this class can equip. */
  weaponIds: string[];
  /** Innate reaction abilities, if any (e.g. "counter" strikes back at melee attackers). */
  reactions?: Reaction[];
  /** Color used to tint the unit token. */
  color: string;
}

export type Reaction = "counter" | "autoPotion" | "cover";

export type Element = "none" | "fire" | "ice" | "bolt" | "holy" | "nature";

export type AoeShape = "single" | "cross" | "square3";

/** Visual terrain kind for a tile (cosmetic + derives default walkability tint). */
export type TerrainType = "grass" | "dirt" | "rock" | "sand" | "water" | "wood" | "lava" | "spring" | "mire";

export type SkillEffect = "damage" | "heal" | "buff" | "debuff" | "revive";

export interface SkillDef {
  id: string;
  name: string;
  description: string;
  mpCost: number;
  spCost: number;
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
  /** Tiles to shove the target directly away from the caster after the hit resolves (single-target only). */
  knockback?: number;
  /** When true, the skill's `knockback` distance pulls the target TOWARD the caster instead of away. */
  pull?: boolean;
  /** When true, the knockback hurls the target OVER intervening units, landing on the farthest
   *  reachable unoccupied tile. Grid edge and blocked tiles still stop the throw. Do not combine
   *  with `pull` (a throw is always away from the caster). */
  throwOver?: boolean;
  /** Leap skills: the caster jumps adjacent to the target before striking, ignoring line-of-sight. */
  leap?: boolean;
  /** FFT-style charge delay: the skill is announced now but resolves on the caster's next turn.
   *  Value is the number of turns to wait (1 = resolves next turn). */
  chargeTime?: number;
}

export type EquipSlot = "armor" | "accessory";

/** Flat stat deltas an equipment piece applies on top of class+race stats (omitted = 0). */
export type EquipMod = Partial<Pick<Stats, "hp" | "mp" | "atk" | "def" | "mag" | "res" | "spd" | "move" | "jump">>;

export interface EquipmentDef {
  id: string;
  name: string;
  slot: EquipSlot;
  description: string;
  mod: EquipMod;
  /** Gold cost to purchase from the gear shop. */
  price: number;
}

export type WeaponKind = "physical" | "magical";

export interface WeaponDef {
  id: string;
  name: string;
  power: number;
  range: number;
  kind: WeaponKind;
  classes: ClassId[];
  /** Gold cost to purchase from the weapon shop. */
  price: number;
}

export type ItemEffect = "healHp" | "healMp" | "revive" | "buff";

export interface ItemDef {
  id: string;
  name: string;
  description: string;
  effect: ItemEffect;
  amount: number;
  range: number;
  /** Gold cost to purchase from the camp shop. */
  price: number;
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
  /** AI behavioral archetype; only set on enemy units. Absent = "balanced". */
  personality?: AIPersonality;
  classId: ClassId;
  raceId: RaceId;
  level: number;
  xp: number;
  sp: number;
  learnedSkillIds: string[];
  /** Optional secondary job: its learned skills are usable alongside the primary's. */
  subClassId?: ClassId;
  /** Optional extra reaction ability equipped at the Party Camp (stacks with class-innate reactions). */
  reactionId?: Reaction;
  weaponId: string;
  armorId?: string;
  accessoryId?: string;
  pos: Point;
  /** Which way the unit faces; drives flank/rear attack bonuses. Per-battle volatile. */
  facing: Direction;
  ct: number;
  stats: Stats;
  statuses: ActiveStatus[];
  /** false once HP hits 0; can be revived. */
  alive: boolean;
  /** Per-battle volatile: set when a charged skill has been announced but not yet resolved. */
  charging?: { skillId: string; target: Point; turnsLeft: number };
  /** Marks a unit that was recruited from the enemy side this battle. */
  recruited?: boolean;
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
  | { kind: "survive"; turns: number }
  | { kind: "seize"; x: number; y: number }
  | { kind: "defend"; x: number; y: number; turns: number }
  /** Protect the named guest unit and deliver it to the goal tile (x, y). */
  | { kind: "escort"; vipName: string; x: number; y: number };

/** Contents of a treasure chest: gold and/or item ids granted to the party. */
export interface Loot {
  /** Gold added to the treasury when opened. */
  gold?: number;
  /** Item ids added (one each) to the shared consumable inventory when opened. */
  items?: string[];
}

/** A treasure chest seated on a map tile, holding loot. Opened by a player unit
 *  that ends its move on the chest's tile. */
export interface ChestSpawn {
  pos: Point;
  loot: Loot;
}

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
  /** Extra player-team guest units seated by the map (e.g. an escort VIP).
   *  Distinct from the party that fills playerSpawns; never persists to the roster. */
  allies?: EnemySpawn[];
  /** Optional treasure chests placed on the map. Each must sit on a walkable,
   *  reachable tile (validated in tests). */
  chests?: ChestSpawn[];
}

export interface EnemySpawn {
  name: string;
  classId: ClassId;
  level: number;
  weaponId: string;
  pos: Point;
  /** Skills this enemy knows (subset of class skills). */
  skillIds?: string[];
  /** AI behavioral archetype for this spawn. Absent = "balanced". */
  personality?: AIPersonality;
  /** Race of this enemy. Absent = "human". */
  raceId?: RaceId;
}

export const CT_THRESHOLD = 100;

export type Difficulty = "easy" | "normal" | "hard";

/**
 * A single level-up event, captured at the moment a unit crosses one or more
 * level thresholds mid-battle. Drives the in-battle level-up card.
 */
export interface LevelUpInfo {
  unitId: string;
  unitName: string;
  classId: ClassId;
  fromLevel: number;
  toLevel: number;
  /** Effective stat block before the level-up (snapshot copy). */
  statsBefore: Stats;
  /** Effective stat block after the level-up (snapshot copy). */
  statsAfter: Stats;
  /** Name of a class skill the unit can now afford to learn, if any. */
  newSkillName?: string;
}

/** Per-hero XP outcome accumulated over a battle, shown on the rewards screen. */
export interface HeroXpResult {
  unitId: string;
  name: string;
  classId: ClassId;
  xpGained: number;
  fromLevel: number;
  toLevel: number;
}

/** End-of-battle spoils presented on the rewards screen. */
export interface BattleRewards {
  /** Gold earned this battle (kill bounties + chest gold). */
  gold: number;
  /** Item ids found this battle (chests + enemy drops). */
  items: string[];
  /** Per-hero XP + level results, in party order. */
  heroes: HeroXpResult[];
  /** Optional "most valuable" callout from the per-battle stat tally. */
  mvp?: { unitId: string; name: string; reason: string };
}
