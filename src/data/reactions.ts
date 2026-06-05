import type { Reaction } from "../core/types";

export interface ReactionInfo {
  name: string;
  /** A short tag for tight UI (chips, inline lists). */
  short: string;
  /** Player-facing explanation of when it triggers and what it does. Mirrors the
   *  actual resolution rules in `battle/combat.ts` — keep the two in sync. */
  description: string;
}

/**
 * Reaction abilities: passive triggers that fire automatically in response to
 * an enemy action, with no turn or input cost. A unit gets its class's innate
 * reactions plus, optionally, one extra reaction equipped at the Party Camp.
 */
export const REACTIONS: Record<Reaction, ReactionInfo> = {
  counter: {
    name: "Counter",
    short: "strikes back at melee attackers",
    description:
      "When an enemy lands a melee hit on this unit, it immediately strikes back with its own weapon — as long as the attacker is within its weapon's reach.",
  },
  autoPotion: {
    name: "Auto-Potion",
    short: "auto-heals when badly hurt",
    description:
      "The moment this unit drops below 30% HP from a hit, it automatically drinks a Potion (or Hi-Potion) from the party's shared supply — if any are in stock.",
  },
  cover: {
    name: "Cover",
    short: "shields a weaker adjacent ally",
    description:
      "Steps in front of an orthogonally-adjacent ally who has less HP, taking a single-target hit meant for them. The healthiest eligible guard intervenes.",
  },
};

const REACTION_IDS = Object.keys(REACTIONS) as Reaction[];

export function reactionInfo(r: Reaction): ReactionInfo {
  return REACTIONS[r];
}

/** Display name for a reaction id. */
export function reactionName(r: Reaction): string {
  return REACTIONS[r].name;
}

/** All reactions as `[id, name]` pairs, for building selectors/menus. */
export function reactionOptions(): [Reaction, string][] {
  return REACTION_IDS.map((id) => [id, REACTIONS[id].name]);
}
