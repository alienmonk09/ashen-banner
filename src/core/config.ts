// Feature flags. Small, central, and boring on purpose — flip one boolean to
// change a cross-cutting behavior without hunting through call sites.

/**
 * Pre-battle and post-victory story scenes (see `data/dialogue.ts`).
 * Disabled for now per design — the dialogue data and helpers are kept intact,
 * so flipping this back to `true` re-enables every chapter's intro/outro.
 */
export const DIALOGUE_ENABLED = false;
