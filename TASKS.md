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
- Branch: **`feat/balance-and-terrain`** (off the prior `feat/skill-points-devpanel-explanations`,
  which is off `main`; neither merged nor pushed). Build: clean. Tests: **1292 passing**.
- Latest session (20 improvements + content + a11y/UX, multi-agent designed, all browser-verified):
  - **Wave 1 — battle core**: `effectiveRes` (Guard +50% RES, mirrors DEF); death/revive clear
    `charging`; magical skills use `effectiveRes`. Forecast shows positional mods (flank/rear/
    high/low) + terrain hazard overlays on move tiles.
  - **Wave 2 — smarter AI**: `counterRisk` discounts provoking a counter; per-personality heal
    thresholds; AoE cluster bonus rewards multi-hits/kills.
  - **Wave 3 — juice**: crit screen-shake + pop-scaled popup + 3-voice sting; dedicated death
    sting + thud; counter riposte sting + jolt; elevation-aware movement (bilinear height interp).
  - **Wave 4 — accessibility**: reduced-motion setting (OS-default, gates hit-shake + screen-shake
    + CSS animations); colorblind-safe turn chips (⛨/⚔ glyph + dashed disabled cue); ARIA across
    settings + turn bar.
  - **Wave 5 — camp overhaul**: full stat grid w/ boosted/lowered tinting, gear deltas (±pow/rng,
    [Δ] vs equipped), class/sub-job preview, SP "N left / need X" on learn rows.
  - **Wave 6 — party customizer**: New Game "Choose Your Party" re-classes + re-races chosen heroes
    (`createCustomParty`); verified in-browser (Garan→Black Mage/elf persisted into battle).
  - **Wave 7 — 10 bigger maps**: frostspire→Maldrath's-approach (14×14–16×16), inserted before
    phase5 (17 phases total); BFS-reachable, party-relative levels (mapMin 6, +3 boss), intro+outro
    dialogue each.
  - **Wave 8 — battle UX**: turn-chip status/charge-duration badge + full hover tooltip; recruit
    hint on hovered enemies; Skills menu shows MP pool + "need X more MP" on unaffordable skills.
- Earlier session (combat balance overhaul, multi-agent diagnosed + reviewed) — fixes the
  reported wall (L1 party met L3 enemies in phase 2 and fell further behind every chapter):
  - **Enemy levels are now PARTY-RELATIVE** (`enemyLevelFor(partyAvg, offset, difficulty, ngPlus)`
    in state.ts; `partyAverageLevel`/`enemyTierOffset` helpers). Foes sit a notch below the party
    (normal −1, easy −2, hard +0), with a clamped per-map tier offset (≤+1) preserving grunt/elite
    spread. Authored map levels became the spread template (derived in `buildUnits`). Enemies can
    never out-scale into an unwinnable wall; NG+ adds +3/cycle.
  - **Battle XP pooled + split EQUALLY** across the whole party at victory (`distributeBattleXp`,
    `enemyXpValue=12+5·level`, counts all foes). Removed per-action XP + `xpLevelMult`; SP/gold
    stay per-action. Verified in-browser: fresh L1 party → win phase 1 → all heroes hit L2 evenly.
  - difficulty.test.ts + newGamePlus.test.ts rewritten for the new signature.
- Prior session (balance + terrain pass, multi-agent reviewed):
  - **Lower HP / faster fights**: all 14 classes' `base.hp` ×0.6 and `growth.hp` ×0.5
    (sim: avg battle 26→15 turns). Damage stats untouched → ~3-5 hits to kill.
  - **Start at level 1** (was 3) in `party.ts buildHero` — smaller opening stats, the
    player feels the early level-ups. Enemy map levels unchanged (phase1 already L1-2).
  - **Faster leveling**: `xpForLevel` 100+(L-1)·45 → 50+(L-1)·30 (front-loaded); the
    early party keeps pace via the existing `xpLevelMult` premium on higher-level foes.
  - **Heal items rescaled** to the new HP (potion 30→18, hiPotion 70→42, xPotion 140→84);
    revives/MP untouched.
  - **Terrain visuals**: `renderer.ts` cliffs now gradient-shaded with a contact seam,
    tile tops get a steeper height ramp + ambient occlusion (taller-neighbor shade) + a
    sunlit rim on raised edges — elevation reads as 3D mass.
  - **More elevation**: every campaign map's `heights` grid reworked (one agent per map,
    Workflow tool) with plateaus/ridges/ramps; a BFS check confirmed spawns/enemies/
    objectives reachable at jump 2, and `battleSim` still resolves every phase.
  - Browser-verified (Edge headless) on Cinder Fields & Outer Ramparts.
- Prior session (terminology + hygiene + refactor pass, multi-agent reviewed):
  - **JP → Skill Points (SP)** everywhere: field `jp`→`sp`, `jpCost`→`spCost`,
    `grantJp`→`grantSp`, all UI copy + playable docs. Saves use a fresh field (pre-release).
  - **Dev cheat bar is local-only / out of the dist**: extracted from `battleScene.ts`
    into `src/scenes/battleDevTools.ts`, loaded via a `import.meta.env.DEV`-gated dynamic
    `import()` so Vite tree-shakes it (verified: zero dev strings/chunk in `dist/`). The
    `?dev` URL escape hatch was removed.
  - **Reaction explanations**: new `src/data/reactions.ts` (name/short/description mirroring
    `combat.ts`); Party Camp lists every reaction a unit has with plain-language text, and
    the battle unit panel shows all reactions (was Counter-only) with hover details.
  - **Smaller files**: `battleScene.ts` 1478→1218 (also `battleView.ts` render projection +
    `battleDevTools.ts`); `battleUI.ts` 597→531 (`battleUiHelpers.ts` pure helpers).
  - Browser-verified (Edge headless): camp reaction help renders, battle renders + camera
    rotation re-renders, no page errors, UI shows "SP" not "JP".
- **The committed roadmap is essentially COMPLETE.** v0.3 ✅ (11 classes), v0.4 ✅
  (reactions incl. equippable, knockback+fall, ZoC, charge time, terrain lava/spring/mire,
  **objective variety COMPLETE incl. escort** — guest-VIP via `MapDef.allies`, phase4),
  v0.5 ✅ (recruitable, full shop buy/sell/ownership items+gear+weapons, job mastery,
  difficulty, AI personalities, permadeath), v0.6 (audio + **per-chapter battle music** +
  settings + dialogue intro/outro + portraits), v1.0 QoL (save slots, undo, battle log,
  NG+, accessibility), hygiene ✅ (CI, CONTRIBUTING, issue templates, Pages).
- **Viewport-safe menus DONE** (Party Camp split into navigable Party/Reinforcements/Shop
  tabs with fixed header + March footer; Party-Select/Title/Settings/Victory all fit; the
  pre-battle dialogue box now docks at the bottom). Root cause was `inset:0` without
  `position` (inert) — swept all four such rules; only `.ui-layer`/`.banner`/`.dialogue`/
  `.party-screen` use it and all now have `position:absolute`.
- **REMAINING = content/art/niche/legal tail needing the user's direction**: full character
  portraits + richer cutscenes, niche mechanics (fog of war, weather, large/multi-tile units,
  bravery/faith, weapon triangle, deep water/traps), perf pass, rebalance, LICENSE choice.
- Working mode (ultracode): orchestrate via the **Workflow tool** — one coherent impl agent
  (single writer for coupled changes), then **adversarial review fan-out** (distinct lenses:
  logic/sim, state-leak, playability) with structured verdicts; main thread verifies
  (build+test+browser), synthesizes (verify before fixing — skip false positives), commits.
  Sequential when core files (`types/combat/battleScene/turnManager`) overlap. ⚠ Do NOT use
  the Codex `codex:rescue` forwarder for impl (it duplicated jobs → concurrent writers).
- Browser verify: puppeteer-core + system Edge headless; DEV-only `window.__game` hook in
  `main.ts` (tree-shaken from prod) jumps to camp/victory for headless layout checks.

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
