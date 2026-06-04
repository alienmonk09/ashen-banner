import type { Point, SkillDef, Unit } from "../core/types";
import { Grid, manhattan, moveBlockers, samePoint } from "./grid";
import { pathTo, reachable } from "./pathfinding";
import { aoeTiles, tilesInRange } from "./targeting";
import { forecastSkill, forecastWeapon } from "./forecast";
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

/** Deterministic estimate of a basic weapon attack (shared with the UI preview). */
function estimateWeaponDamage(attacker: Unit, target: Unit): number {
  return forecastWeapon(attacker, target, getWeapon(attacker.weaponId)).amount;
}

interface Option {
  score: number;
  destination: Point;
  action: AIAction;
}

/**
 * Decide an enemy unit's turn. Returns a move path and an action.
 * Priorities: healers heal hurt allies; everyone else maximizes damage on the
 * most killable enemy; if nothing is reachable, advance toward the nearest foe.
 */
export function planEnemyTurn(unit: Unit, units: Unit[], grid: Grid): AIPlan {
  const { solid, passThrough } = moveBlockers(units, unit);
  const reach = reachable(grid, unit.pos, unit.stats.move, unit.stats.jump, solid, passThrough);

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
  const damageSkills = knownSkills.filter((s) => s.effect === "damage" && s.mpCost <= unit.stats.mp);
  const healSkills = knownSkills.filter((s) => s.effect === "heal" && s.mpCost <= unit.stats.mp);
  const reviveSkills = knownSkills.filter((s) => s.effect === "revive" && s.mpCost <= unit.stats.mp);

  const options: Option[] = [];

  // --- Healing / support behavior ---
  const hurtAllies = allies.filter((a) => a.stats.hp < a.stats.maxHp * 0.5);
  const deadAllies = units.filter((u) => !u.alive && u.team === unit.team);
  for (const skill of healSkills) {
    for (const ally of hurtAllies) {
      for (const stand of standTiles) {
        if (manhattan(stand, ally.pos) > skill.range) continue;
        const missing = ally.stats.maxHp - ally.stats.hp;
        const heal = Math.min(missing, Math.round((unit.stats.mag * skill.power) / 10));
        options.push({
          score: 200 + heal, // healing prioritized over attacking
          destination: stand,
          action: { kind: "skill", skillId: skill.id, targetTile: { ...ally.pos } },
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
        });
      }
    }
  }

  // --- Offensive behavior ---
  for (const stand of standTiles) {
    // Basic weapon attack
    const w = getWeapon(unit.weaponId);
    for (const target of enemies) {
      if (manhattan(stand, target.pos) > w.range || manhattan(stand, target.pos) === 0) continue;
      const dmg = estimateWeaponDamage(unit, target);
      options.push({
        score: scoreTarget(dmg, target),
        destination: stand,
        action: { kind: "attack", targetTile: { ...target.pos } },
      });
    }
    // Damage skills (incl. AoE)
    for (const skill of damageSkills) {
      const cells = tilesInRange(grid, stand, skill.range, false);
      for (const center of cells) {
        const affected = aoeTiles(grid, center, skill.aoe);
        let total = 0;
        let kills = 0;
        let hitAlly = false;
        for (const cell of affected) {
          const occ = enemies.find((e) => samePoint(e.pos, cell));
          const ally = allies.find((a) => samePoint(a.pos, cell));
          if (ally && a_isNotSelf(ally, unit)) hitAlly = true;
          if (!occ) continue;
          const dmg = estimateSkillDamageSafe(unit, occ, skill);
          total += Math.min(dmg, occ.stats.hp);
          if (dmg >= occ.stats.hp) kills += 1;
        }
        if (total <= 0) continue;
        const penalty = hitAlly ? 40 : 0;
        options.push({
          score: total + kills * 50 - penalty,
          destination: stand,
          action: { kind: "skill", skillId: skill.id, targetTile: { ...center } },
        });
      }
    }
  }

  if (options.length > 0) {
    options.sort((a, b) => b.score - a.score);
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

function a_isNotSelf(ally: Unit, unit: Unit): boolean {
  return ally.id !== unit.id;
}

function estimateSkillDamageSafe(attacker: Unit, target: Unit, skill: SkillDef): number {
  return forecastSkill(attacker, target, skill).amount;
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
