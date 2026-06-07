import type { SkillDef, Unit, WeaponDef, WeaponKind } from "../core/types";
import {
  effectiveDef,
  effectiveRes,
  defenseDamageMult,
  elementAffinity,
  elementDamageMult,
  positionalDamageMult,
  positionalCritBonus,
  CRIT_CHANCE,
  CRIT_MULT,
  type AttackContext,
  type Affinity,
} from "./combat";

/**
 * Expected crit multiplier folded into a no-variance forecast: a physical hit
 * lands a CRIT_MULT crit with probability (CRIT_CHANCE + positional bonus), so
 * its mean damage is base × (1 + chance·(CRIT_MULT-1)). Magic never crits, so
 * this returns 1 for it — matching applyVarianceAndCrit's `allowCrit` gate.
 */
function expectedCritMult(
  attacker: Unit,
  target: Unit,
  kind: WeaponKind,
  ctx?: AttackContext,
): number {
  if (kind !== "physical") return 1;
  const chance = CRIT_CHANCE + positionalCritBonus(attacker, target, kind, ctx);
  return 1 + chance * (CRIT_MULT - 1);
}

export interface Forecast {
  kind: "damage" | "heal" | "revive" | "status";
  /** Expected (no-variance) magnitude. */
  amount: number;
  /** True if the expected hit would drop the target to 0 HP. */
  lethal: boolean;
  /** Elemental stance of the target vs this hit (for a UI weak/resist hint). */
  affinity?: Affinity;
}

/**
 * No-variance expected results, mirroring combat.ts resolution minus the RNG
 * roll (crit included). The same positional context the attack will use feeds
 * in here, so the preview and the AI see the real flank/elevation-adjusted
 * number. Single source of truth for both the UI damage preview and the AI.
 */
export function forecastWeapon(attacker: Unit, target: Unit, weapon: WeaponDef, ctx?: AttackContext): Forecast {
  const stat = weapon.kind === "magical" ? attacker.stats.mag : attacker.stats.atk;
  const element = weapon.element ?? "none";
  let amount = Math.max(1, stat + weapon.power - effectiveDef(target));
  amount *= positionalDamageMult(attacker, target, weapon.kind, ctx);
  amount *= defenseDamageMult(target, weapon.kind);
  amount *= elementDamageMult(target, element);
  amount *= expectedCritMult(attacker, target, weapon.kind, ctx);
  amount = Math.max(1, Math.round(amount));
  return { kind: "damage", amount, lethal: amount >= target.stats.hp, affinity: elementAffinity(target, element) };
}

export function forecastSkill(caster: Unit, target: Unit, skill: SkillDef, ctx?: AttackContext): Forecast {
  const power = skill.scaling === "magical" ? caster.stats.mag : caster.stats.atk;
  switch (skill.effect) {
    case "damage": {
      // Clamp the raw base to 1 BEFORE the multipliers, exactly as resolveSkillOnTarget
      // does — otherwise a weak-element ×1.5 on a sub-1 base under-reports the real hit.
      let base = Math.max(1, (power * skill.power) / 10 - (skill.scaling === "magical" ? effectiveRes(target) : effectiveDef(target)));
      base *= positionalDamageMult(caster, target, skill.scaling, ctx);
      base *= defenseDamageMult(target, skill.scaling);
      base *= elementDamageMult(target, skill.element);
      base *= expectedCritMult(caster, target, skill.scaling, ctx);
      const amount = Math.max(1, Math.round(base));
      return { kind: "damage", amount, lethal: amount >= target.stats.hp, affinity: elementAffinity(target, skill.element) };
    }
    case "heal": {
      const amount = Math.max(1, Math.round((power * skill.power) / 10));
      return { kind: "heal", amount, lethal: false };
    }
    case "revive": {
      const amount = Math.max(1, Math.round((power * skill.power) / 20));
      return { kind: "revive", amount, lethal: false };
    }
    default:
      return { kind: "status", amount: 0, lethal: false };
  }
}
