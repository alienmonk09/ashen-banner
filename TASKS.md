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
- Build: clean. Tests: **1021 passing across 50 files**. Working tree: clean.
- Last commit: `d468134 feat(v0.6): in-engine story dialogue`. Recently shipped: skill charge
  time, weapon shop/ownership, recruitable units, job mastery, and per-phase story dialogue.
- ~26 features this session. The Codex `codex-companion review` is INTERMITTENT — it
  alternates between producing verdicts and "Reviewer failed to output a response" (a
  transient runtime fault, not a code signal). Across its ~5 working `review --base main`
  passes it caught **~19 real P2/P3 findings — all fixed** (counter-on-melee-skills, gil
  per-AoE-kill, save-field propagation, fall-kill credit, instant mute, leap/forecast clamps,
  completed-turn counting, counter-kill rewards, AI-leap-LoS, music-voice lifecycle, cover-on-
  dead-target…). Skill charge time's player flow was verified by static trace + the sim +
  smoke (the review was flaky when it landed). A final `review --base main` before any merge
  is the standing diligence gate — re-run it until it yields a clean verdict.
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
  `defend` (hold tile N turns) + gold tile overlay marker. `94b7c8f` (+seize-on-move fix `e869bd5`).
- **Auto-Potion reaction** (v0.4) — Thief self-heals from shared inventory when an enemy hit
  drops it below 30% HP. `0f3b80a`.
- **Knockback** (v0.4) — single-target skills shove the victim N tiles (Power Strike, Palm
  Strike); pure `knockbackTo` helper, player+AI; shove-into-lava synergy. `eb86c87`.
- **Geomancer** (v0.3, 10th class) — durable earth control caster (Boulder/Tremor/Quagmire/
  Petrify). `a6934ed`.
- **Lancer** (v0.3, 11th class — completes the named-class roster) — Jump leap-strike (LOS-
  ignoring, lands adjacent; validates victim+landing, routs-on-no-cost). `4297798` (+`f51b1f9`).
- **Difficulty modes** (v0.5) — Easy/Normal/Hard scale enemy level at New Game; save back-compat. `2eb3d3f`.
- **Music** (v0.6) — soft code-synth battle/camp/victory themes on the SFX engine. `f7bedd2`.
- **Gil economy + consumables shop** (v0.5) — enemies drop gil; buy potions at camp. `4188faa`.
- **Branch-review fixes** (`d1ed01a`): Counter now fires on melee SKILLS + gates on real
  adjacency (range-2 spear), gil paid per AoE kill, save resets clear gil/difficulty. Also
  fixed `applyLoaded` dropping difficulty/gil on Continue.
- Combat smoke-tested in-browser 3× (Cinder Fields defend → Victory 7/7, with music; no errors).
- A consolidated Codex branch review (vs main) caught the above before merge.
- **AI personalities** (v0.5) — per-enemy aggressive/defensive/support/balanced archetypes
  bias AI scoring (pure personalityWeight); sim still converges. `380c5a7` (+3 review fixes).
- **Knockback fall damage** (v0.4) — a shove onto a tile 2+ levels lower deals fall damage. `16ef81a`.
- **Enemy races + recruit-timing fix** (v0.5 polish) — varied enemy races make elemental
  affinities matter for players; 6th deployment slot held for the finale. `6740882`.
- **Equipment ownership + Gear Shop** (v0.5) — own-before-equip; buy gear with gil; dropdowns
  list only owned; old saves migrate equipped gear. `9eb9c3a`.
- **Cover reaction** (v0.4) — a guardian (Knight) intercepts a single-target hit for a wounded
  adjacent ally; reactions[] refactor. Reaction line complete (Counter/Auto-Potion/Cover). `df7b84a`.
- **Zone of control** (v0.4) — enemy-adjacent tiles halt movement; AI bound too; sim converges. `3ab14c6`.
- **Equippable reactions** (v0.4) — equip Counter/Auto-Potion/Cover at camp on top of innate;
  unitHasReaction = innate ∪ equipped. FFT reaction system complete. `88b598b`.
- **Sell** (v0.5) — sell consumables & owned gear for half price; selling gear unequips it. `1f5ba27`.

## Next up — the CONTENT / NICHE / POLISH tail
The reliably code-deliverable roadmap is essentially DONE (~30 features this session). What
remains needs human design/art/writing judgment or is niche:
1. **Content (v0.6)** — character PORTRAITS (pixel art — high blind-art risk), named-enemy/boss
   intros (could extend the new dialogue system — agent-deliverable), more/optional maps
   (balance + design risk). The dialogue SYSTEM ships; portraits + cutscene polish are next.
2. **Niche mechanics** — weather/day-night (accuracy/affinity shifts), fog of war/vision,
   large/multi-tile units & mounts, bravery/faith traits, weapon triangle (NB: weapons are
   only physical/magical today — a triangle needs weapon TYPES first). Each is a design call.
3. **Polish (v1.0)** — accessibility (colorblind palette, text scaling, input remap),
   performance pass, enemy-curve rebalance, full replay.
5. **Content** (v0.6) — in-engine dialogue/cutscenes, character portraits, named-enemy intros,
   optional skirmish maps. (Agent-authored map balance/art is the risk here.)
6. **Niche / later** — escort objective (needs an NPC unit concept), fog of war, weather/
   day-night, large/multi-tile units & mounts, bravery/faith, weapon triangle, accessibility
   pass, performance pass, rebalance. See `ROADMAP.md`.

## Done this session — also (post the list above)
- AI personalities, knockback fall damage, enemy races + recruit-timing, equipment ownership +
  Gear Shop, Cover reaction, Zone of control, equippable reactions, sell, battle log, undo-move,
  save slots, settings menu, New Game+ — plus ~12 Codex review fixes (forecast clamp, completed-
  turn counting, counter-kill rewards, fall-kill credit, instant mute, leap forecast, AI leap LoS…).
  Run `git log main..HEAD` for the full ordered list.

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
