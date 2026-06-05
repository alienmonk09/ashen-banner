import { CT_THRESHOLD, type Objective, type Team, type Unit } from "../core/types";
import { effectiveSpd, tickStatuses, type HitResult } from "./combat";

/** Living units only, in their array order. */
function living(units: Unit[]): Unit[] {
  return units.filter((u) => u.alive);
}

/**
 * Advance charge time until a living unit reaches the threshold, then return it.
 * Highest CT wins; ties broken by higher speed, then unit id for determinism.
 */
export function advanceToNextActor(units: Unit[]): Unit | null {
  const alive = living(units);
  if (alive.length === 0) return null;

  // Safety bound: avoid infinite loops if every unit somehow has 0 speed.
  for (let guard = 0; guard < 100000; guard++) {
    const ready = alive.filter((u) => u.ct >= CT_THRESHOLD);
    if (ready.length > 0) {
      ready.sort((a, b) => {
        if (b.ct !== a.ct) return b.ct - a.ct;
        if (effectiveSpd(b) !== effectiveSpd(a)) return effectiveSpd(b) - effectiveSpd(a);
        return a.id < b.id ? -1 : 1;
      });
      return ready[0];
    }
    for (const u of alive) u.ct += effectiveSpd(u);
  }
  return null;
}

/**
 * End the active unit's turn: spend charge time and tick its statuses. Returns
 * any HP changes from damage/heal-over-time so the caller can show them.
 */
export function endTurn(unit: Unit): HitResult[] {
  unit.ct -= CT_THRESHOLD;
  if (unit.ct < 0) unit.ct = 0;
  return tickStatuses(unit);
}

/** Winner of a plain rout (defeat all foes), or null. */
export function battleWinner(units: Unit[]): Team | null {
  const playersAlive = units.some((u) => u.team === "player" && u.alive);
  const enemiesAlive = units.some((u) => u.team === "enemy" && u.alive);
  if (!playersAlive) return "enemy";
  if (!enemiesAlive) return "player";
  return null;
}

/**
 * Decide a battle against its objective. The player always loses when wiped out;
 * otherwise the objective sets the win: rout all foes, defeat a named target, or
 * survive a number of turns (routing also wins a survival map). Returns the
 * winning team, or null if the fight continues.
 */
export function evaluateOutcome(
  units: Unit[],
  objective: Objective | undefined,
  turnsElapsed: number,
): Team | null {
  if (!units.some((u) => u.team === "player" && u.alive)) return "enemy";
  const enemiesAlive = units.some((u) => u.team === "enemy" && u.alive);
  const obj = objective ?? { kind: "rout" };
  switch (obj.kind) {
    case "rout":
      return enemiesAlive ? null : "player";
    case "defeat": {
      const present = units.some((u) => u.team === "enemy" && u.name === obj.targetName);
      if (!present) return enemiesAlive ? null : "player"; // target absent → rout
      const targetAlive = units.some((u) => u.team === "enemy" && u.alive && u.name === obj.targetName);
      return targetAlive ? null : "player";
    }
    case "survive":
      if (!enemiesAlive) return "player";
      return turnsElapsed >= obj.turns ? "player" : null;
  }
}

export interface TurnPreview {
  unitId: string;
}

/**
 * Predict the next `count` actors without mutating real units, so the UI can
 * show an upcoming-turns bar. Uses a simple CT simulation on snapshots.
 */
export function previewOrder(units: Unit[], count: number): TurnPreview[] {
  const sim = living(units).map((u) => ({ id: u.id, ct: u.ct, spd: effectiveSpd(u) }));
  if (sim.length === 0) return [];
  const out: TurnPreview[] = [];
  let guard = 0;
  while (out.length < count && guard < 100000) {
    guard++;
    const ready = sim.filter((u) => u.ct >= CT_THRESHOLD);
    if (ready.length > 0) {
      ready.sort((a, b) => {
        if (b.ct !== a.ct) return b.ct - a.ct;
        if (b.spd !== a.spd) return b.spd - a.spd;
        return a.id < b.id ? -1 : 1;
      });
      const top = ready[0];
      out.push({ unitId: top.id });
      top.ct -= CT_THRESHOLD;
    } else {
      for (const u of sim) u.ct += u.spd;
    }
  }
  return out;
}
