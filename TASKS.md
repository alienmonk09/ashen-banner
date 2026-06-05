# Working backlog & session handoff

Living task list for the autonomous build. The roadmap (`ROADMAP.md`) is the
"what"; this file is the "what's next + how we're working + where we left off".

## Working mode
- **Code via subagents; the main thread only coordinates** (verify, integrate, commit).
  Dispatch one feature per subagent (the core files — `combat.ts`, `battleScene.ts`,
  `ai.ts`, `forecast.ts`, `types.ts` — are shared, so parallel edits conflict; go
  sequential, or use worktree isolation if truly independent).
- Every change: keep TS strict happy (`npm run build`), keep `npm test` green, match
  codebase style, and browser-verify UI/gameplay (puppeteer-core recipe below).
- Commit each finished feature on the branch with a clear message + Co-Authored-By.

## Current state (resume point)
- Branch: **`feat/tactics-depth-and-progression`** (off `main`; not merged, not pushed).
- Build: clean. Tests: **618 passing across 26 files**. Working tree: clean.
- Last commit: `94b7c8f feat(v0.4): objective variety — seize & defend`.
- Commits: v0.2+v0.3 base → Counter → Time Mage → objectives(rout/defeat/survive)
  → secondary job → **audio → equipment slots → terrain effects → Summoner →
  objective variety(seize/defend)**.
- Working mode this session: code via subagents (Claude Sonnet for impl, Codex for
  review). Sequential per feature when core files (`types/combat/battleScene`) overlap;
  parallel only when file-sets are disjoint. Each feature: build+test+browser-verify+
  codex-review then commit. ⚠ the Codex `codex:rescue` *agent forwarder* duplicated
  jobs (2× per dispatch) — drove 4 concurrent writers into one tree; prefer Claude
  agents for impl (clean completion signal) and Codex via direct `codex-companion`
  calls for review.

## Done (verified: build + tests + browser)
- **v0.2 Tactics depth** (multi-agent reviewed; 5 findings fixed): facing/back-attacks,
  line of sight, elevation modifiers, full status kit (poison/regen/stop/protect/shell,
  haste in practice), shared combat/forecast damage pipeline, AI buff/debuff+LOS.
- **v0.3**: classic-TBS roadmap; skill-card explanations + status chips; action-menu
  overhaul; party-size progression (recruit at camp, cap 4→5→6); 7 chapters + 2 larger
  maps (Cinder Fields 13×11, Outer Ramparts 12×12); elemental affinities; Time Mage
  (8th class); secondary job (sub-ability pool).
- **v0.4 (partial)**: Counter reaction (Knight/Monk); objective variety (rout / defeat
  Maldrath / survive).

## Done this session (build+test+browser+codex-review, all committed)
- **Audio** (v0.6) — WebAudio code-synth SFX + HUD mute toggle. `90e8b12`.
- **Equipment slots** (v0.3) — armor+accessory folded into `unit.stats` via single
  `statsForUnit()` source of truth (survives level-up/class-change); camp selects. `ef9d12d`.
- **Terrain effects** (v0.4) — `lava` (−15%/turn) & `spring` (+12%/turn) tiles,
  `applyTerrainEffect` after status ticks. `70f27e0`.
- **Summoner** (v0.3, 9th class) — wide-AoE glass-cannon caster, 4 summons + sprite/icons,
  retrainable at camp (no roster change). `db6fdbd`.
- **Objective variety** (v0.4) — `seize` (reach tile; routs also win → no soft-lock) &
  `defend` (hold tile N turns) + gold tile overlay marker. `94b7c8f`.

## Next up (prioritized)
1. **Reaction abilities — finish** (v0.4): auto-potion (consume a potion when low HP),
   cover-an-ally (intercept a hit for an adjacent ally); later equippable reactions
   (pairs with equipment). Builds on the existing Counter pattern (combat.ts + `Reaction`
   union + classes assignment + battleScene trigger).
2. **More classes** (v0.3) — Lancer (Jump: leap-attack ignoring intervening units/height —
   needs a movement/targeting mechanic, not just data), Geomancer (terrain-themed, now that
   terrain exists). 16×20 char sprite + skills + icons; follow the Summoner/Time Mage pattern.
3. **Skill charge time** (v0.4, FFT casting) — powerful magic resolves a few CT ticks later,
   with a charging indicator + interrupt. Deeper turn-loop change (turnManager CT state).
4. **Knockback / forced movement** — shoves/pulls/throws; fall damage off ledges.
5. **Zone of control & engagement** — passing an enemy's reach has a cost.
6. Escort objective (needs an NPC/escort-unit concept first — skipped for now).
7. Later: shop/economy (gil), job mastery, recruitable enemies, difficulty modes,
   dialogue/cutscenes, fog of war. See `ROADMAP.md`.

## Known issues / cleanups
- AI doesn't account for walking into a Counter when scoring attacks (minor; counters
  just punish — acceptable, revisit with reaction depth).
- Optional skirmish maps still planned (more-phases item left them out).

## Browser verify recipe (from memory `browser-verification`)
`npm run dev` (port 5173, bg); temp dir `/tmp/tg-verify`, `npm i puppeteer-core --no-save`;
`.mjs` driver `import puppeteer from "puppeteer-core"`, Edge at
`/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge`, `headless:"new"`.
Flow: New Game → `.unit-card.selectable`×4 → "Begin Campaign →" → "Begin Battle".
Camp at phase N: inject `localStorage["tactics-mvp-save"]` (units need `facing`) → "Continue".
Title has a "Jump to phase (test)" `.phase-row`. Cleanup: `pkill -f vite; rm -rf /tmp/tg-verify`.
Favicon 404 in console is benign.
