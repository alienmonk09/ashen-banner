import type { HitResult } from "./combat";
import type { StatusKind } from "../core/types";

const STATUS_WORDING: Record<StatusKind, string> = {
  poison: "afflicted with",
  slow: "afflicted with",
  stop: "afflicted with",
  guard: "blessed with",
  haste: "granted",
  regen: "blessed with",
  protect: "granted",
  shell: "granted",
};

/**
 * Format a single HitResult into a human-readable battle log line.
 * `nameOf` resolves a unit id to its display name (unknown → "Someone").
 */
export function formatHit(result: HitResult, nameOf: (id: string) => string): string {
  const name = nameOf(result.unitId);
  switch (result.kind) {
    case "damage": {
      let line = `${name} takes ${result.amount} damage`;
      if (result.crit) line += " (critical!)";
      if (result.killed) line += " — KO!";
      return line;
    }
    case "heal":
      return `${name} recovers ${result.amount} HP`;
    case "mp":
      return `${name} recovers ${result.amount} MP`;
    case "revive":
      return `${name} is revived`;
    case "status": {
      const sk = result.status as StatusKind | undefined;
      const wording = sk ? (STATUS_WORDING[sk] ?? "affected by") : "affected by";
      const statusName = sk ?? "unknown";
      return `${name} is ${wording} ${statusName}`;
    }
  }
}
