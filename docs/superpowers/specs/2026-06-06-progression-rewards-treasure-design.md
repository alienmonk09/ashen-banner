# Progression, Rewards & Treasure — Design

**Date:** 2026-06-06 · **Branch target:** `feat/progression-rewards` (off `main`)
**Status:** design approved-in-flight (autonomous build under `/goal`, ultracode)

This spec turns a 10-point goal (plus 20+ extra improvements) into a buildable,
sequenced design grounded in the current code. It deliberately keeps each unit
small and isolated so work fans out across agents — except the battle core, which
is one stateful file (`battleScene.ts`) and is built sequentially on purpose.

---

## 1. Problem & goals

The campaign currently grants XP **only** at victory: `distributeBattleXp()`
pools `enemyXpValue(level)=12+level·5` over every enemy and grants the **full
pool to each** party member equally (present, fallen, or benched). There is no
per-action or per-kill XP (it was removed to stop snowballing), no mid-battle
level-up moment, no end-of-battle rewards screen, no treasure on the map, and the
pre/post-battle dialogue plays on every chapter.

Goals (verbatim from the user, condensed):

1. **In-battle level-up screen** at the moment a unit levels up mid-combat.
2. **Individual XP** distribution, *in addition to* the existing equal group split.
3. Skills/actions that affect **players (buffs) and enemies** generate XP.
4. **Per-kill XP**: every unit that interacted with a kill earns XP.
5. The **equal split** happens at battle end, a **fixed amount per battle**.
6. **Treasure chests** placed in scenarios, holding items.
7. **End-of-battle rewards**: gold + items + distributed XP.
8. **Rewards/awards screen**.
9. **Disable dialogue** on all levels (re-enable later via one switch).
10. **Improve the character-sheet screens**.

Plus **20+ additional improvements** (see §9).

---

## 2. Current-state map (verified by reading the code)

| Concern | Where | Today |
|---|---|---|
| XP curve | `unit.ts:19` `xpForLevel(l)=50+(l-1)·30` | front-loaded |
| Grant + level-up | `unit.ts:207` `grantXp(unit,amt)→levelsGained` | mutates in place, preserves HP/MP ratio |
| Battle XP | `battleScene.ts:1001` `distributeBattleXp()` | full pool to each member at victory |
| Enemy XP value | `battleScene.ts:991` `enemyXpValue(l)=12+l·5` | — |
| Kill credit | `battleScene.ts:973` `creditKill`, `:982` `awardForAction` | gold + SP only; **no XP** |
| Victory hook | `battleScene.ts:353` `endBattle("player")` | XP → recruits → permadeath → banner → outro → `toParty/toVictory` |
| Gold | `state.ts` `gold`, `goldForKill(phase)=18+phase·3` | accrues per kill in `awardGold`/`creditKill` |
| Inventory | `state.ts` `inventory: Record<id,count>` | shared party stash |
| Items | `items.ts` `ITEMS`, `ItemDef` | 8 consumables |
| Map model | `types.ts:249` `MapDef` | heights/blocked/terrain/spawns; **no objects/chests** |
| Grid | `grid.ts` `Grid` | runtime wrapper; tiles only |
| Dialogue | `dialogue.ts` `dialogueFor/outroFor(mapId)`; call sites `battleScene.ts:213,394,402` | per-chapter intro + outro |
| UI overlays | `battleUI.ts` `showBanner/showDialogue/toast` + `dom.ts` `el()/clear()` | flex overlays toggled by `display` |
| Audio | `audio.ts` `sfx.playLevelUp()` (arpeggio) + `tone()` | code-synth, no asset pipeline |
| Anim | `animator.ts` `wait(s)`, `moveAlong()` | promise-based sequencing |
| Char sheet | `partyScene.ts` (camp party card) | stats grid, gear deltas, sub-job, learn skills |

**Tests that constrain us (must stay green — 1292 total):**
`unit.test.ts` (grantXp/xpForLevel), `jobMastery`, `economy`/`state`/`sell`/`*Shop`
(gold+inventory), `dialogue.test.ts` (asserts `dialogueFor(id)` returns the real
lines, length>0 — **so the disable must be at the call site, not in the helper**),
`maps`/`mapsReach`/`battleSim` (map validity + AI-vs-AI auto-play through all 17
phases — chests must not break BFS reachability or sim convergence).

---

## 3. Core architectural decision: XP becomes live

Everything in goals 1–5 follows from one change: **XP is granted during battle,
not only at the end.** This is what makes a mid-battle level-up moment possible.

New XP economy (three channels):

- **Kill-participation XP (primary).** Track, per enemy, the set of player units
  that *interacted* with it (dealt damage OR applied a debuff). On its death, each
  participant is granted `enemyXpValue(level)`; the unit that landed the kill gets
  a **+50%** finisher bonus. Granted immediately via `grantXp` → may trigger a
  level-up card.
- **Action XP (secondary, small).** A qualifying action that doesn't kill still
  pays its actor a little XP: offensive hit on an enemy, or a **buff/heal/revive on
  an ally** (goal 3). Small flat values (e.g. offensive 4, support 4) so it nudges
  without reviving the old snowball.
- **Battle-clear XP (equalizer, fixed).** At victory, every party member — present,
  fallen, or benched — gets a **fixed** `battleClearXp(phase)` grant, split equally
  (goal 5). This is the floor that keeps supports/benched heroes on the curve. It is
  *fixed per battle*, not a pool of all enemy values.

**Balance intent:** total XP a frontline hero earns per battle stays in the same
ballpark as today's flat pool, but it now *tilts toward participation*. The clear
bonus is sized so a fully-benched hero still levels roughly every ~2 battles.
Concrete starting numbers (tunable, all in one `progression.ts` constants module):

```
enemyXpValue(level)      = 12 + level*5          (unchanged)
KILL_FINISHER_BONUS      = 0.5                    (+50% to the finisher)
ACTION_XP_OFFENSIVE      = 4
ACTION_XP_SUPPORT        = 4
battleClearXp(phase)     = 40 + phase*4
```

**Live-level-up side effect (intended):** `grantXp` recomputes stats preserving
HP/MP ratio, so a level gained mid-fight slightly raises current HP — an authentic
FFT-style reward. Risk: `battleSim.test.ts` plays player-AI vs enemy-AI to a
decisive result; mid-battle player level-ups only make the player side win *faster*,
so convergence holds — **but verify** the sim still terminates and any asserted
outcomes hold; if the sim seeds RNG and asserts exact survivors, gate live-leveling
behind the real scene (the sim drives combat directly and may bypass it).

A new pure module **`src/core/progression.ts`** owns the constants + helpers
(`xpForKill`, `actionXp`, `battleClearXp`, and a `grantXpTracked(unit, amt)` that
returns `{ levelsBefore, levelsAfter, statsBefore, statsAfter, newSkillsLearnable }`
for the level-up card). `battleScene` orchestrates; the math is unit-tested in
isolation.

---

## 4. Feature designs

### 4.1 In-battle level-up card (goal 1)
- New overlay `battleUI.showLevelUp(card, onDone)`, same pattern as `showBanner`
  (a `level-up` overlay div, CSS class, `el()` factory). Shows: portrait + name,
  `Lv X → Y`, a stat-delta grid (HP/MP/ATK/DEF/MAG/RES/SPD, `+n` highlights), and
  "New skill available" if SP now affords one. Plays `sfx.playLevelUp()`.
- **Queue.** Multiple level-ups (AoE multi-kill, +2 levels at once) enqueue and show
  sequentially; a "Skip" dismisses all. Respects the existing **reduced-motion**
  setting (no flourish animation when set).
- **Timing.** Shown after the triggering action's animation settles, before the next
  actor — `battleScene` drains the queue in `afterAction`/resolution paths, pausing
  the turn loop (`phase = "resolving"`) until the queue empties.

### 4.2–4.4 XP rework (goals 2,3,4,5)
- Add per-battle, per-enemy participation map in `battleScene`:
  `participants: Map<enemyId, Set<playerId>>`. Register on every offensive/​debuff
  resolution against an enemy (attack, damaging skill, debuff skill).
- On a `HitResult.killed` for an enemy, award kill-participation XP to each
  participant (+ finisher bonus to the actor), via `grantXpTracked` → enqueue cards.
- Action XP credited in the same resolution paths (`afterAction`, skill/item resolve).
- `distributeBattleXp()` is **replaced** by `awardBattleClearXp()` (fixed equal grant)
  and called in the same victory slot. Per-hero XP earned is accumulated into a
  per-battle ledger (`xpEarned: Map<playerId, number>`) for the rewards screen.

### 4.5 Treasure chests (goal 6)
- **Data:** extend `MapDef` with `chests?: ChestSpawn[]`,
  `ChestSpawn = { pos: Point; loot: Loot }`, `Loot = { gold?: number; items?: string[] }`.
  Authoring lives in each map file (isolated, no shared-file contention).
- **Runtime:** `battleScene.chests: Chest[]` (`{ pos, loot, opened }`). Rendered as a
  code-defined pixel sprite on the tile (extend the sprite/renderer the same way unit
  tokens/props are drawn). A subtle glint when within the active unit's move range.
- **Interaction (KISS):** a player unit that **ends its move on a chest tile** opens
  it automatically — grants loot to `state.gold`/`state.inventory`, marks `opened`,
  plays a chest jingle (`tone()` flourish), floats a `+gold / +Item` popup, logs it.
  No new action-menu entry or input path. (Adjacent "Open" action is a later option.)
- **Validity:** chests sit on walkable, reachable tiles; `maps.test.ts` gets a chest
  validity check; `mapsReach` already guards reachability. AI ignores chests.

### 4.6–4.7 Rewards screen + end rewards (goals 7,8)
- Compute a `BattleRewards` at victory: `gold` earned this battle, `items` found
  (chest contents collected + optional enemy drops), and `xpPerHero` from the ledger
  + the clear bonus, with `levelUps` per hero.
- **Rewards screen:** new full-screen overlay `battleUI.showRewards(rewards, onDone)`
  (banner-pattern). Sections: **Gold +N**, **Items** (icon list), **Party XP** (per
  hero: XP bar fill + `Lv↑` badges), and a small **MVP** line (most damage/kills/heals
  from a lightweight per-battle stat tally). "Continue" → existing nav.
- **Flow:** `endBattle("player")` → award clear XP → recruits/permadeath →
  `Victory!` banner → **rewards screen** → (dialogue disabled, so skip outro) →
  `toParty()`/`toVictory()`. Save checkpoint after rewards.

### 4.8 Disable dialogue (goal 9)
- Add `export let DIALOGUE_ENABLED = false` (or a `config.ts` flag) consumed **only**
  at the two `battleScene` call sites: `showIntro()` skips `showDialogue` and goes
  straight to `showIntroBanner()`; the outro branch skips dialogue and calls
  `proceed()`. `dialogueFor`/`outroFor` and their tests are untouched. One flag flip
  re-enables everything later.

### 4.9 Character-sheet improvements (goal 10)
- Enrich the camp party card and add a focused **character detail** view:
  - **XP progress bar** (`xp / xpForLevel(level)`).
  - **Elemental affinities** — race `weak`/`resist` as fire/ice/bolt/holy/nature icons.
  - **Derived combat values** — effective DEF/RES (Guard), crit edge, move/jump.
  - **Growth-rate bars** — which stats this class grows fastest (from `growth`).
  - **Mastery progress** — learned/total per class, mastery bonus shown.
  - **Skill list** — learned vs locked with SP cost + "affordable now" cue.
- Reuse the same component to make units **inspectable in battle** (read-only).

---

## 5. File ownership & contention

- **Sequential, single owner — `battleScene.ts`** (hot file): XP rework, level-up
  card wiring, chest runtime + interaction, rewards wiring. One agent at a time.
- **Parallel-safe (distinct files):** `core/progression.ts` (new), `types.ts`
  additions (done first, others depend), `dialogue.ts` flag, `data/loot.ts` (new) +
  `items.ts`, per-map `chests` authoring (one file each), `partyScene.ts` (char
  sheet), `battleUI.ts` new overlays (coordinate with battleScene consumer), audio
  jingles (`audio.ts`), sprites (`sprites/*` fallback-friendly).

## 6. Testing strategy
- Unit-test `progression.ts` math (xp-for-kill, finisher bonus, action xp, clear xp,
  `grantXpTracked` deltas) — pure, fast, no scene.
- Extend `maps.test.ts` with chest-validity (on-map, walkable, reachable).
- Keep `dialogue.test.ts` green by disabling at the call site only.
- Browser-verify (puppeteer-core recipe in TASKS.md): mid-battle level-up card,
  chest open, rewards screen, dialogue skipped, enriched character sheet.
- `npm run build` (tsc strict) + `npm test` green after every wave.

## 7. Non-goals / YAGNI
- No mimic/trapped chests, no chest lockpicking, no per-unit inventory, no XP for
  enemies leveling, no branching reward choices. (Captured as ideas, not built.)

## 8. Rollout waves (the plan)
- **Wave 0 — foundation (parallel):** `types.ts` additions; `progression.ts` +
  tests; dialogue flag; `loot.ts` + items; character-sheet pass (`partyScene.ts`).
- **Wave 1 — battle core (sequential, battleScene owner):** XP rework + ledger +
  participation; level-up card overlay + wiring; chest runtime + interaction;
  rewards computation + screen + flow.
- **Wave 2 — polish/the 20 (parallel where files differ):** see §9.
- After each wave: build + test + browser-verify + commit.

## 9. The 20+ additional improvements (curated)
Battle/feedback: (1) floating +gold popups on kill; (2) per-hero XP & level-up lines
in the battle log; (3) chest-in-range glint + "treasure nearby" hint; (4) chest open
VFX + jingle; (5) reduced-motion-aware level-up/rewards anims; (6) ARIA + keyboard on
new overlays. Rewards: (7) MVP badge (most dmg/kills/heals) via per-battle tally;
(8) enemy item drops (chance) folded into rewards; (9) difficulty-scaled gold/loot;
(10) chapter-scaled chest contents; (11) "collect all chests" optional bonus reward;
(12) save checkpoint after rewards. Character sheet: (13) elemental-affinity icons;
(14) derived combat values (effective DEF/RES, crit); (15) growth-rate bars;
(16) mastery progress; (17) skill list learned-vs-locked + affordability; (18) XP bar
in the in-battle unit panel; (19) in-battle read-only inspect reusing the sheet;
(20) "new skill available" indicator (camp + level-up card). Economy/UX: (21) gold
total animates up on the rewards screen; (22) dev-tools shortcuts (open all chests,
grant XP, show rewards). Stretch ideas (not committed): guarded/locked chests,
adjacent "Open" action, branching reward picks.
