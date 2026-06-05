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
- Build: clean. Tests: **946 passing across 45 files**. Working tree: clean.
- Last commit: `bf6bab8 fix: AI leap LoS (review P3)`. Shipped since the sell commit:
  battle log, undo move, save slots, settings menu, New Game+.
- ~24 features this session. Codex reviewer went DOWN mid-session (6+ "failed to output")
  then RECOVERED. Its `review --base main` ran 3 convergent passes: P2s (fall-kill credit,
  instant mute, leap forecast / forecast clamp, completed-turn counting, counter-kill rewards)
  all fixed; round 3 was only P3 (AI leap LoS fixed; a rampart-water claim was a false positive).
  ~12 real review findings total this session, all addressed.
- NOTE: the Codex reviewer started returning "Reviewer failed to output a response" on
  EVERY scope (even small diffs) partway through this session — a transient runtime fault,
  not a code signal. It worked for ~10 earlier features (caught ~9 real P2s). Recent
  features (equipment shop, cover, ZoC, fall damage, recruit/race) are verified by
  build+test+browser+self-review only; re-run Codex review on them when it recovers.
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

## Next up (prioritized)
1. **Skill charge time** (v0.4, FFT casting) — powerful magic resolves a few CT ticks later;
   charging state on Unit + turn-loop awareness + indicator + interrupt. HIGHEST RISK (core
   turn loop). ⚠ Do this when the Codex reviewer recovers (need the review backstop); lean
   hard on the AI-vs-AI sim + browser smoke.
2. **Recruitable units** (v0.5) — turn a beaten foe into a party member (capture + roster).
3. **Weapon shop / ownership** — like the Gear Shop but weapons are class-locked + never-unarmed,
   so the dropdown/migration is fiddlier; decide the model.
4. **Save slots**, **battle log / replay**, **undo-move** (v1.0 QoL); **job mastery** (v0.5);
   content: dialogue/portraits (v0.6), fog of war, weather. See `ROADMAP.md`.
2. **Cover-ally reaction** — intercept a hit for an adjacent ally. Needs: `ClassDef.reaction`
   → `reactions[]` refactor (so a tank can have counter + cover), an attack target-redirect at
   resolution (weapon + single-skill, player + AI paths), and ideally honest forecast.
3. **Zone of control** — entering a tile adjacent to a living enemy stops further movement
   (BFS change in pathfinding `reachable`). ⚠ may change the AI-vs-AI sim dynamics — watch that test.
4. **Skill charge time** (v0.4, FFT casting) — powerful magic resolves a few CT ticks later;
   charging state on Unit + turn-loop awareness + UI + interrupt. Highest risk (turn loop).
5. Escort objective (needs NPC unit concept). Job mastery, recruitable enemies, dialogue/
   portraits, fog of war — see `ROADMAP.md`.

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
