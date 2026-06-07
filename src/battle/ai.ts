import type { AIPersonality, Point, SkillDef, Unit } from "../core/types";
import { Grid, manhattan, moveBlockers, samePoint, zoneOfControl } from "./grid";
import { pathTo, reachable } from "./pathfinding";
import { aoeTiles, tilesInRange } from "./targeting";
import { forecastSkill, forecastWeapon } from "./forecast";
import { canCounter, hasStatus, isStopped, type AttackContext } from "./combat";
import { hasLineOfSight } from "./los";
import { getWeapon } from "../data/weapons";
import { getSkill } from "../data/skills";
import { terrainEffect } from "../data/terrain";

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

/**
 * Expected counterattack damage the `attacker` would eat for striking `target`
 * in melee from `stand` — 0 if the target can't counter or can't reach back from
 * that tile. Lets the AI think twice before trading into a Knight's Counter
 * instead of blindly walking onto the punish. Callers only apply it when the
 * target would SURVIVE the incoming blow (a corpse never counters).
 */
function counterRisk(attacker: Unit, target: Unit, stand: Point, grid: Grid): number {
  if (!canCounter(target)) return 0;
  const tw = getWeapon(target.weaponId);
  const dist = manhattan(stand, target.pos);
  if (dist === 0 || dist > tw.range) return 0;
  return forecastWeapon(target, attacker, tw, ctxFrom(grid, target.pos, stand)).amount;
}

/**
 * Score delta for ending the turn on `stand`'s terrain. Mirrors `terrainEffect`:
 * damage tiles (lava) sting proportional to the unit's maxHp, mire (slow) is a
 * flat nuisance, and a spring is a small lure. Keeps the AI from parking on — or
 * even suiciding into — a hazard when an equally good safe tile exists.
 */
function terrainPenalty(grid: Grid, stand: Point, unit: Unit): number {
  const eff = terrainEffect(grid.terrainAt(stand.x, stand.y));
  if (!eff) return 0;
  if (eff.kind === "damage") return -unit.stats.maxHp * eff.fracMaxHp;
  if (eff.kind === "heal") return unit.stats.maxHp * eff.fracMaxHp * 0.5;
  return -25; // status (mire/slow): flat nuisance
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
    case "guard":
      return 65;
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
  const weapon = getWeapon(unit.weaponId);

  // Best single-hit direct damage this unit could deal to each foe this turn
  // (basic swing or a damage skill, from any stand tile it can reach). Used by
  // the debuff loop to skip control on a foe it could simply kill instead.
  const bestDamageTo = new Map<string, number>();
  for (const stand of standTiles) {
    for (const target of enemies) {
      let best = bestDamageTo.get(target.id) ?? 0;
      const dw = manhattan(stand, target.pos);
      if (dw > 0 && dw <= weapon.range && (weapon.range <= 1 || hasLineOfSight(grid, stand, target.pos))) {
        best = Math.max(best, estimateWeaponDamage(unit, stand, target, grid));
      }
      for (const skill of damageSkills) {
        const ds = manhattan(stand, target.pos);
        if (ds === 0 || ds > skill.range) continue;
        if (skill.range > 1 && !skill.leap && !hasLineOfSight(grid, stand, target.pos)) continue;
        best = Math.max(best, estimateSkillDamage(unit, stand, target, skill, grid));
      }
      bestDamageTo.set(target.id, best);
    }
  }

  // --- Healing / support behavior ---
  // Personality shifts when a healer commits: aggressive units let allies ride
  // low before spending a turn on a heal; defensive/support medics top allies up
  // earlier so the line never crumbles.
  const healAt =
    unit.personality === "aggressive"
      ? 0.4
      : unit.personality === "defensive" || unit.personality === "support"
        ? 0.7
        : 0.55;
  const hurtAllies = allies.filter((a) => a.stats.hp < a.stats.maxHp * healAt);
  const deadAllies = units.filter((u) => !u.alive && u.team === unit.team);
  for (const skill of healSkills) {
    for (const ally of hurtAllies) {
      for (const stand of standTiles) {
        if (manhattan(stand, ally.pos) > skill.range) continue;
        const missing = ally.stats.maxHp - ally.stats.hp;
        // Use the shared forecast so physical-scaling heals (e.g. Monk's Chakra)
        // are scored off the right stat, matching what resolution will restore.
        const heal = Math.min(missing, forecastSkill(unit, ally, skill).amount);
        // Triage: penalize healing a fuller ally so the most wounded reachable
        // one wins — a near-dead ally would otherwise lose to a near-full one
        // whose larger absolute missing HP edges it out under the maxHp clamp.
        // Phrased as a penalty (vs a +(1 - hp/maxHp) bonus) so it only reorders
        // targets without inflating the heal-vs-attack ceiling.
        const triage = (ally.stats.hp / ally.stats.maxHp) * 40;
        options.push({
          score: 200 + heal - triage, // healing prioritized over attacking
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
  for (const stand of standTiles) {
    // Basic weapon attack.
    for (const target of enemies) {
      const d = manhattan(stand, target.pos);
      if (d > weapon.range || d === 0) continue;
      if (weapon.range > 1 && !hasLineOfSight(grid, stand, target.pos)) continue;
      const dmg = estimateWeaponDamage(unit, stand, target, grid);
      let score = scoreTarget(dmg, target);
      // A target that survives this blow and can reach back will counter — weigh
      // that punish (0.6×, so a strong trade is still worth taking).
      if (dmg < target.stats.hp) score -= counterRisk(unit, target, stand, grid) * 0.6;
      options.push({
        score,
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
        let numHit = 0;
        let allyDamage = 0;
        let allyKills = 0;
        let loneSurvivor: Unit | null = null;
        for (const cell of affected) {
          const occ = enemies.find((e) => samePoint(e.pos, cell));
          const ally = allies.find((a) => samePoint(a.pos, cell));
          if (ally && ally.id !== unit.id) {
            // Friendly fire: tally the actual hurt this blast inflicts on allies,
            // so a near-miss graze and a teammate-killing nuke aren't punished alike.
            const dmg = estimateSkillDamage(unit, stand, ally, skill, grid);
            allyDamage += Math.min(dmg, ally.stats.hp);
            if (dmg >= ally.stats.hp) allyKills += 1;
          }
          if (!occ) continue;
          const dmg = estimateSkillDamage(unit, stand, occ, skill, grid);
          total += Math.min(dmg, occ.stats.hp);
          numHit += 1;
          if (dmg >= occ.stats.hp) kills += 1;
          else loneSurvivor = occ;
        }
        if (total <= 0) continue;
        // Friendly-fire cost scales with the harm done: every HP shaved off an ally
        // plus a steep surcharge per ally the blast would outright kill.
        const penalty = allyDamage + allyKills * 120;
        // Reward clustering: each kill past the first, and catching 2+ foes, so the
        // AI saves a big AoE for a knot of enemies instead of nuking a lone target.
        const clusterBonus = (kills > 1 ? (kills - 1) * 30 : 0) + (numHit >= 3 ? 25 : numHit === 2 ? 10 : 0);
        // Melee skills face the same punish as a basic swing: if this is a point-blank
        // strike on a single foe that survives, weigh the counterattack it'll eat
        // (0.6×, matching basic attacks). Ranged/AoE skills don't expose the caster.
        let counterPenalty = 0;
        if (skill.range <= 1 && numHit === 1 && loneSurvivor && manhattan(stand, loneSurvivor.pos) === 1) {
          counterPenalty = counterRisk(unit, loneSurvivor, stand, grid) * 0.6;
        }
        options.push({
          score: total + kills * 50 + clusterBonus - penalty - counterPenalty,
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
        // A foe this unit could simply kill this turn isn't worth a debuff — don't
        // freeze or poison a corpse-in-waiting when a finishing blow is available.
        if (target.stats.hp <= (bestDamageTo.get(target.id) ?? 0)) continue;
        const hpFrac = target.stats.hp / target.stats.maxHp;
        // Control statuses (stop/slow) rob a foe of turns it won't get to spend if
        // it's already dying — scale their worth by remaining HP so the AI saves
        // them for healthy threats. Poison's drip is unaffected.
        const base =
          skill.statusKind === "stop" || skill.statusKind === "slow"
            ? debuffScore(skill) * hpFrac
            : debuffScore(skill);
        const lowHp = (1 - hpFrac) * 10;
        options.push({
          score: base + lowHp,
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

  // Terrain at the stand tile colors every option equally: ending the turn on
  // lava/mire should make an otherwise-tied action less appealing than the same
  // action from safe ground.
  for (const opt of options) {
    opt.score += terrainPenalty(grid, opt.destination, unit);
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
  // Closing distance is the primary driver (each tile of progress is worth 10),
  // with the terrain penalty folded in so the unit will give up a tile or two of
  // advance rather than park on — or suicide into — a lava/mire hazard.
  let bestTile = unit.pos;
  let bestScore = -manhattan(unit.pos, target.pos) * 10 + terrainPenalty(grid, unit.pos, unit);
  for (const stand of standTiles) {
    const score = -manhattan(stand, target.pos) * 10 + terrainPenalty(grid, stand, unit);
    if (score > bestScore) {
      bestScore = score;
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
