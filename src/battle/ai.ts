import type { AIPersonality, Point, SkillDef, Unit } from "../core/types";
import { Grid, manhattan, moveBlockers, samePoint, zoneOfControl } from "./grid";
import { pathTo, reachable } from "./pathfinding";
import { aoeTiles, tilesInRange } from "./targeting";
import { forecastSkill, forecastWeapon } from "./forecast";
import { hasStatus, isStopped, type AttackContext } from "./combat";
import { hasLineOfSight } from "./los";
import { getWeapon } from "../data/weapons";
import { getSkill } from "../data/skills";

export type AIActionKind = "attack" | "skill" | "wait";

export interface AIAction {
  kind: AIActionKind;
  /** Center tile of the action (target unit's tile, or AoE center). */
  targetTile?: Point;
  skillId?: string;
}

export interface AIPlan {
  path: Point[];
  destination: Point;
  action: AIAction;
}

type OptionKind = "damage" | "heal" | "buff" | "debuff" | "move";

interface Option {
  score: number;
  destination: Point;
  action: AIAction;
  kind: OptionKind;
}

/**
 * Score multiplier applied to an option based on the unit's AI personality.
 * "balanced" (or undefined) returns 1.0 everywhere — no change to existing behavior.
 */
export function personalityWeight(personality: AIPersonality | undefined, kind: OptionKind): number {
  switch (personality) {
    case "aggressive":
      switch (kind) {
        case "damage": return 1.5;
        case "move":   return 1.3;
        case "heal":   return 0.4;
        case "buff":   return 0.6;
        case "debuff": return 0.9;
      }
      break;
    case "defensive":
      switch (kind) {
        case "damage": return 0.9;
        case "move":   return 0.7;
        case "heal":   return 1.1;
        case "buff":   return 1.3;
        case "debuff": return 1.1;
      }
      break;
    case "support":
      switch (kind) {
        case "heal":   return 1.8;
        case "buff":   return 1.6;
        case "debuff": return 1.2;
        case "damage": return 0.7;
        case "move":   return 0.9;
      }
      break;
    default:
      return 1.0;
  }
}

/** Positional context for an attack launched from `stand` against `target`. */
function ctxFrom(grid: Grid, stand: Point, target: Point): AttackContext {
  return { fromPos: stand, heightDelta: grid.heightAt(stand.x, stand.y) - grid.heightAt(target.x, target.y) };
}

/** Deterministic estimate of a basic weapon attack from a candidate stand tile. */
function estimateWeaponDamage(attacker: Unit, stand: Point, target: Unit, grid: Grid): number {
  return forecastWeapon(attacker, target, getWeapon(attacker.weaponId), ctxFrom(grid, stand, target.pos)).amount;
}

function estimateSkillDamage(attacker: Unit, stand: Point, target: Unit, skill: SkillDef, grid: Grid): number {
  return forecastSkill(attacker, target, skill, ctxFrom(grid, stand, target.pos)).amount;
}

/** Worth of landing a debuff (no effect if the target already carries it). */
function debuffScore(skill: SkillDef): number {
  switch (skill.statusKind) {
    case "stop":
      return 95;
    case "poison":
      return 75;
    case "slow":
      return 60;
    default:
      return 50;
  }
}

/** Worth of granting a buff to an ally. */
function buffScore(skill: SkillDef): number {
  switch (skill.statusKind) {
    case "haste":
      return 80;
    case "protect":
    case "shell":
      return 70;
    case "regen":
      return 60;
    default:
      return 55;
  }
}

/**
 * Decide an enemy unit's turn. Returns a move path and an action.
 * Priorities: a stopped unit forfeits its turn; healers heal hurt allies and
 * revive the dead; otherwise maximize damage on the most killable foe (valuing
 * flanks, the high ground, and line of sight), apply control/buffs when no
 * strong strike is available, and advance toward the nearest foe as a fallback.
 */
export function planEnemyTurn(unit: Unit, units: Unit[], grid: Grid): AIPlan {
  // Frozen in time: skip the turn entirely.
  if (isStopped(unit)) {
    return { path: [unit.pos], destination: unit.pos, action: { kind: "wait" } };
  }

  const { solid, passThrough } = moveBlockers(units, unit);
  const zoc = zoneOfControl(units, unit.team);
  const reach = reachable(grid, unit.pos, unit.stats.move, unit.stats.jump, solid, passThrough, zoc);

  // Stand tiles: every tile the unit may actually stop on (includes its own
  // position at cost 0; excludes ally-occupied pass-through tiles).
  const standTiles: Point[] = [];
  for (const k of reach.destinations) {
    const [x, y] = k.split(",").map(Number);
    standTiles.push({ x, y });
  }

  const enemies = units.filter((u) => u.alive && u.team !== unit.team);
  const allies = units.filter((u) => u.alive && u.team === unit.team);

  const knownSkills = unit.learnedSkillIds.map(getSkill);
  // Exclude charged skills: the AI never enters the charging state (keeps the sim simple and convergent).
  const damageSkills = knownSkills.filter((s) => s.effect === "damage" && s.mpCost <= unit.stats.mp && !(s.chargeTime && s.chargeTime > 0));
  const healSkills = knownSkills.filter((s) => s.effect === "heal" && s.mpCost <= unit.stats.mp);
  const reviveSkills = knownSkills.filter((s) => s.effect === "revive" && s.mpCost <= unit.stats.mp);
  const debuffSkills = knownSkills.filter((s) => s.effect === "debuff" && s.statusKind && s.mpCost <= unit.stats.mp);
  const buffSkills = knownSkills.filter((s) => s.effect === "buff" && s.statusKind && s.mpCost <= unit.stats.mp);

  const options: Option[] = [];

  // --- Healing / support behavior ---
  const hurtAllies = allies.filter((a) => a.stats.hp < a.stats.maxHp * 0.5);
  const deadAllies = units.filter((u) => !u.alive && u.team === unit.team);
  for (const skill of healSkills) {
    for (const ally of hurtAllies) {
      for (const stand of standTiles) {
        if (manhattan(stand, ally.pos) > skill.range) continue;
        const missing = ally.stats.maxHp - ally.stats.hp;
        // Use the shared forecast so physical-scaling heals (e.g. Monk's Chakra)
        // are scored off the right stat, matching what resolution will restore.
        const heal = Math.min(missing, forecastSkill(unit, ally, skill).amount);
        options.push({
          score: 200 + heal, // healing prioritized over attacking
          destination: stand,
          action: { kind: "skill", skillId: skill.id, targetTile: { ...ally.pos } },
          kind: "heal",
        });
      }
    }
  }
  for (const skill of reviveSkills) {
    for (const ally of deadAllies) {
      for (const stand of standTiles) {
        if (manhattan(stand, ally.pos) > skill.range) continue;
        options.push({
          score: 300,
          destination: stand,
          action: { kind: "skill", skillId: skill.id, targetTile: { ...ally.pos } },
          kind: "heal",
        });
      }
    }
  }

  // --- Offensive behavior ---
  const weapon = getWeapon(unit.weaponId);
  for (const stand of standTiles) {
    // Basic weapon attack.
    for (const target of enemies) {
      const d = manhattan(stand, target.pos);
      if (d > weapon.range || d === 0) continue;
      if (weapon.range > 1 && !hasLineOfSight(grid, stand, target.pos)) continue;
      const dmg = estimateWeaponDamage(unit, stand, target, grid);
      options.push({
        score: scoreTarget(dmg, target),
        destination: stand,
        action: { kind: "attack", targetTile: { ...target.pos } },
        kind: "damage",
      });
    }
    // Damage skills (incl. AoE).
    for (const skill of damageSkills) {
      const cells = tilesInRange(grid, stand, skill.range, false);
      for (const center of cells) {
        // Leap skills jump over obstacles, so they ignore line of sight (matching
        // the player targeting path); other ranged skills still need a clear line.
        if (skill.range > 1 && !skill.leap && !hasLineOfSight(grid, stand, center)) continue;
        const affected = aoeTiles(grid, center, skill.aoe);
        let total = 0;
        let kills = 0;
        let hitAlly = false;
        for (const cell of affected) {
          const occ = enemies.find((e) => samePoint(e.pos, cell));
          const ally = allies.find((a) => samePoint(a.pos, cell));
          if (ally && ally.id !== unit.id) hitAlly = true;
          if (!occ) continue;
          const dmg = estimateSkillDamage(unit, stand, occ, skill, grid);
          total += Math.min(dmg, occ.stats.hp);
          if (dmg >= occ.stats.hp) kills += 1;
        }
        if (total <= 0) continue;
        const penalty = hitAlly ? 40 : 0;
        options.push({
          score: total + kills * 50 - penalty,
          destination: stand,
          action: { kind: "skill", skillId: skill.id, targetTile: { ...center } },
          kind: "damage",
        });
      }
    }
    // Debuffs: afflict a foe that does not already carry the status.
    for (const skill of debuffSkills) {
      for (const target of enemies) {
        if (hasStatus(target, skill.statusKind!)) continue;
        const d = manhattan(stand, target.pos);
        if (d === 0 || d > skill.range) continue;
        if (skill.range > 1 && !hasLineOfSight(grid, stand, target.pos)) continue;
        const lowHp = (1 - target.stats.hp / target.stats.maxHp) * 10;
        options.push({
          score: debuffScore(skill) + lowHp,
          destination: stand,
          action: { kind: "skill", skillId: skill.id, targetTile: { ...target.pos } },
          kind: "debuff",
        });
      }
    }
    // Buffs: shore up an ally (or self) that lacks the status.
    for (const skill of buffSkills) {
      for (const ally of allies) {
        if (hasStatus(ally, skill.statusKind!)) continue;
        if (manhattan(stand, ally.pos) > skill.range) continue;
        options.push({
          score: buffScore(skill),
          destination: stand,
          action: { kind: "skill", skillId: skill.id, targetTile: { ...ally.pos } },
          kind: "buff",
        });
      }
    }
  }

  if (options.length > 0) {
    options.sort((a, b) =>
      b.score * personalityWeight(unit.personality, b.kind) -
      a.score * personalityWeight(unit.personality, a.kind),
    );
    const best = options[0];
    return {
      path: pathTo(reach, best.destination) ?? [unit.pos],
      destination: best.destination,
      action: best.action,
    };
  }

  // --- No action available: advance toward nearest enemy ---
  const target = nearestEnemy(unit, enemies);
  if (!target) {
    return { path: [unit.pos], destination: unit.pos, action: { kind: "wait" } };
  }
  let bestTile = unit.pos;
  let bestDist = manhattan(unit.pos, target.pos);
  for (const stand of standTiles) {
    const d = manhattan(stand, target.pos);
    if (d < bestDist) {
      bestDist = d;
      bestTile = stand;
    }
  }
  return {
    path: pathTo(reach, bestTile) ?? [unit.pos],
    destination: bestTile,
    action: { kind: "wait" },
  };
}

/** Lower-HP targets are worth more; lethal hits get a big bonus. */
function scoreTarget(dmg: number, target: Unit): number {
  const effective = Math.min(dmg, target.stats.hp);
  const lethal = dmg >= target.stats.hp ? 50 : 0;
  const lowHpBonus = (1 - target.stats.hp / target.stats.maxHp) * 20;
  return effective + lethal + lowHpBonus;
}

function nearestEnemy(unit: Unit, enemies: Unit[]): Unit | null {
  let best: Unit | null = null;
  let bestDist = Infinity;
  for (const e of enemies) {
    const d = manhattan(unit.pos, e.pos);
    if (d < bestDist) {
      bestDist = d;
      best = e;
    }
  }
  return best;
}
