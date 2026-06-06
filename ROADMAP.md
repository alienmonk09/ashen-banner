# Ashen Banner — Roadmap

Where the game is and where it's going. This is a living document; items move as
priorities shift. Status legend: ✅ done · 🚧 in progress · ⏳ planned · 💭 idea.

The backlog draws on the classics of the genre — **Final Fantasy Tactics**,
**Tactics Ogre**, **Fire Emblem**, **Advance Wars**, **Disgaea**, **Wargroove**,
**Triangle Strategy** — adapted to this engine (TS + Canvas 2D, no asset pipeline).

## v0.1 — Playable MVP ✅

The complete core loop ships and is covered by the test suite (499 tests, 21
files), including a full AI-vs-AI battle simulation that auto-plays all seven
phases to a decisive result.

- ✅ Isometric Canvas 2D renderer — elevation, depth-sorting, tile picking, DPR scaling
- ✅ **Camera rotation** — view the map from 4 angles (90° steps), via on-screen
  buttons or `,` / `.`; rendering and tile-picking stay correct at every angle
- ✅ Charge-time (CT) turn order driven by Speed
- ✅ Movement: BFS pathfinding with move/jump, terrain height, blocked tiles
- ✅ **Pass-through movement** — cross allied tiles, never finish on an occupied
  one; enemies block. Symmetric for player and AI.
- ✅ Actions: Move / Attack / Skill / Item / Wait, with **near-click action menu**
- ✅ 5 classes (Knight, Archer, Black Mage, White Mage, Monk), 16 skills, 8 weapons, 4 items
- ✅ Combat: physical/magical damage, crits, ±15% variance, AoE shapes (single/cross/3×3)
- ✅ Status effects: Guard, Slow, Haste
- ✅ Damage/heal **forecast** preview (shared by UI and AI)
- ✅ Enemy AI: heal-priority, damage maximization, pursuit
- ✅ Progression: XP/leveling, Skill-Point unlocks, free class change, weapon swap
- ✅ 5-phase campaign + Party Camp interstitial, with title/victory flow
- ✅ Save/load to localStorage (with shape validation)
- ✅ Code-defined pixel-art sprites (no asset pipeline) + VFX + combat juice

## v0.2 — Tactics depth ✅

Deeper grid fights without new content pipelines.

- ✅ **Facing & back-attacks** — units track facing; flank ×1.1 / rear ×1.25 damage
  plus a crit edge. Move sets facing from the last step; attacks turn to the target.
- ✅ **Line of sight** — ranged attacks and offensive spells respect walls and
  elevation (eye-to-eye sightline); melee is exempt. AI and tile highlights obey it.
- ✅ **Elevation combat modifiers** — high ground adds damage and crit, low ground
  subtracts (±7%/level, clamped); folded into the shared forecast so the preview is honest.
- ✅ **Haste, in practice** — White Mage **Haste** skill and an **Hourglass** item both
  grant the status.
- ✅ Expanded status kit — **Poison**/**Regen** (HP each turn), **Stop** (lose turns),
  **Protect**/**Shell** (−physical/−magical taken), per-status UI pips, AI buff/debuff use.

## v0.3 — Party, clarity & content 🚧 *(current focus)*

The next push: grow the party, make the UI teach itself, and widen the campaign.

- ✅ **Party-size progression** — start with four, earn a deployment slot mid-campaign
  and another for the finale; reinforcements are recruited from the rest of the roster
  at the Party Camp, and maps seat the grown party.
- ✅ **Skill explanations in the UI** — rich skill cards (power, scaling, element, range,
  AoE, MP, status applied) in the cast menu, plus readable status chips with tooltips in
  the info panels.
- ✅ **Action-menu visual overhaul** — accent-colored icon buttons, a keyboard hint, and
  tooltips on every action.
- ✅ **More phases** — the campaign is now seven chapters (two large new battles slot in
  before the finale). *(Optional skirmishes still planned.)*
- ✅ **Larger-terrain phases** — the Cinder Fields (13×11 open field) and Outer Ramparts
  (12×12 fortified wall) bring bigger maps with cover, chokepoints, and elevation play.
- ✅ **Choose your party** — pick four heroes from a roster of seven at New Game
- ✅ **Races** — Human/Elf/Dwarf/Halfling/Orc, each with flat stat modifiers
- ✅ **Two more classes** — Thief (Enzo) and Druid (Penelope)
- ✅ **Secondary job / ability pool** — equip a second class's skill set at the camp;
  its learned skills are usable alongside the primary's (FFT-style). Learn across both
  jobs with Skill Points; the first sub-job skill is granted on equip.
- ✅ **More classes** — Time Mage (tempo control), Summoner (wide-AoE glass cannon),
  Geomancer (durable earth control caster), and Lancer (Jump leap-strike), all
  retrainable at camp. (11 classes at this milestone — 14 after v0.5.5.)
- ✅ **Elemental affinities** — races carry fire/bolt/nature weaknesses & resistances
  that scale spell damage (×1.5 / ×0.5); folded into the shared forecast, which flags
  *weak/resist*, so the AI aims spells at weaknesses too. *(Equipment/terrain affinities later.)*
- ✅ **Equipment slots** — armor & accessories with flat stat mods, folded into the unit
  stat block so they survive level-up & class change; camp UI selects *(status immunity /
  affinity later)*
- 💭 Terrain hazards & special tiles (✅ lava DoT & healing springs via terrain effects;
  deep water, traps, destructible cover still to come)

## v0.4 — Battlefield systems 🚧

Classic mechanics that change how a fight is played, not just its numbers.

- 🚧 **Reaction abilities** — ✅ Counter (Knight/Monk strike back), ✅ Auto-Potion (Thief
  self-heals when low), and ✅ Cover (a guardian intercepts a hit for a wounded adjacent
  ally; classes hold a list of reactions) and ✅ equippable reactions (equip an extra
  Counter/Auto-Potion/Cover at camp on top of innate ones — FFT-style)
- ✅ **Knockback / forced movement** — shoves (push away), pulls (Lancer Harpoon drags a
  foe adjacent), throws (Monk Body Slam hurls a foe over units onto clear ground), and fall
  damage off ledges; all stop at walls/edges and synergize with shove-into-lava
- ✅ **Zone of control & engagement** — moving into a tile adjacent to a living enemy ends
  your movement there (you can engage but not slip past the line); the AI is bound too
- ✅ **Spell charge time** (FFT casting) — a charged skill (Black Mage's Meteor) is announced
  on the cast turn (MP spent, "Charging…") and resolves on the caster's next turn; a KO
  before then interrupts it. The AI sticks to instant skills, so the sim stays convergent.
- ✅ **Objective variety** — rout, defeat-the-commander (the finale: kill Maldrath),
  survive-N-turns, seize-a-point, defend-a-point, and **escort** (deliver a map-provided
  guest VIP to a goal tile — lose if it falls; phase 4 escorts Sable the Envoy)
- 🚧 **Terrain effects** — ✅ lava damage floors, healing springs, and slow mire (end-of-turn
  HP deltas / Slow status); ⏳ height-gated cover
- 💭 **Fog of war / vision** — sight radius, scouting, ambush
- 💭 **Weather & day/night** — accuracy/affinity shifts, timed events
- 💭 **Large / multi-tile units & mounts** — cavalry move bonus, dragons

## v0.5 — Roster, economy & meta ⏳

- ✅ **Recruitable units** — a player unit adjacent to an enemy at ≤25% HP can recruit it; it
  flips sides and, if it survives, joins the party permanently (up to the roster cap)
- ✅ **Shop & economy** — gil drops from defeats; a camp shop covering consumables,
  equipment, AND weapons (own-before-equip ownership gate), with buy and sell (half-price;
  selling worn gear unequips it)
- 🚧 **Job mastery** — ✅ master a class (learn all its skills) for a permanent +HP/+SPD passive
  carried across every class; ⏳ unlock-the-next gating later
- ✅ **Difficulty modes & AI personalities** — Easy/Normal/Hard (scale enemy levels at New
  Game); per-enemy AI archetypes (aggressive/defensive/support/balanced) biasing AI scoring
- ✅ **Classic mode (permadeath)** — opt-in at New Game; a hero who falls in a won battle is
  lost from the roster for good
- 💭 **Bravery / Faith / morale** — unit traits that scale reactions and magic
- 💭 **Weapon/class triangle** — rock-paper-scissors matchups for readable counters

## v0.5.5 — Balance, content & dev velocity ✅ *(this pass)*

A tuning + content sweep aimed at a steady sense of growth, a deeper roster, and
a treasury you always want to spend — plus the scaffolding to build faster.

- ✅ **Gold, not gil** — the treasury is now **gold** everywhere (UI + code), with a
  save migration so pre-rename saves carry their balance over.
- ✅ **Smaller starting party, growing company** — you now deploy **three** heroes at
  New Game (was four) and earn slots as the campaign wears on (3 → 4 → 5 → 6 by the
  finale). The roster you pick from grew to **ten** heroes, so there's real choice up
  front and the army visibly grows.
- ✅ **Three new classes** — **Paladin** (holy tank/support hybrid), **Berserker**
  (glass wrecking-ball), and **Ninja** (fast dual-element thrower) — **14 classes total**,
  each with its own 4-skill kit, weapons, and sprite; all retrainable at camp.
- ✅ **Three new races** — **Gnome** (frail arcane tinker), **Saurian** (scaled brute,
  fire-tough / cold-weak), **Sylph** (airy fae) — **8 races total**, introducing an
  **ice** weakness that pairs with the Summoner's Shiva.
- ✅ **Smoother progression (no power spike)** — a gently rising XP curve, a trimmed
  kill bonus (so a single carry can't snowball), and **level-difference XP scaling**
  (punch up for a premium, farm weaklings for a pittance). The whole party climbs at a
  steadier cadence.
- ✅ **Enemy curve tracks the party** — late-chapter foes were re-leveled to keep pace
  with the expected party level (finale boss now Lv 14), so the challenge holds instead
  of the party turning into gods. New classes/races seed enemy spawns for variety.
- ✅ **Deeper economy** — a long tail of premium gear (legendary weapons, Dragon Mail,
  Hermes Boots, Sage Circlet…) and consumables (X-Potion, Turbo Ether, Mega Phoenix),
  with **chapter-scaled gold bounties** (later fights pay more). Affordable basics,
  always something bigger to save for.
- ✅ **Penelope, right-sized** — her hero sprite was redrawn with a normally-proportioned
  head (the old one was comically large).
- ✅ **Dev shortcut bar** — a `?dev` / dev-server-only cheat bar in battle (Win · Lose ·
  Kill foe · +Lvl · Class▸ · +500g · Heal) to cycle through states fast while testing.
- ✅ **Camp UX** — changing a card selector no longer jolts the view back to the top
  (scroll position is preserved across same-section re-renders); tighter cards; the
  smaller starting party means the camp fits the viewport for most of the run.
- ✅ **Smarter sprite fallbacks** — new skills/weapons/items inherit a same-family icon
  automatically (e.g. a new fire skill reuses the Fire icon), so adding content no longer
  needs a hand-drawn icon to avoid the grey placeholder.

### Refactor: modular data for parallel development 🚧

Goal: stop funnelling every content change through a few giant files so work can fan
out across independent files (and independent agents).

- ✅ **Per-class skill modules** — `data/skills.ts` (770 lines, edited by *every* ability
  change) is split into `data/skills/<class>.ts` files behind an `index.ts` barrel,
  mirroring the already-modular `data/maps/`. Adding a class's kit is now a new file +
  one barrel line — no shared-file contention.
- ✅ **Sprite contention removed** — the icon resolvers fall back by family, so new
  skills/weapons/items don't have to touch the big `sprites/*` records at all.
- ⏳ **Decompose `battleScene.ts` (~1.5k lines)** — the remaining god-object. Proposed
  split (deliberate, not rushed — it's stateful integration code with light direct test
  coverage): extract **combat resolution** (attack/cast/knockback/counter application),
  **AI-turn execution**, **objective/outcome + banners**, **input/selection handling**,
  and **dev tools** into collaborators the scene composes. Do this behind the test suite,
  ideally one extraction per PR.
- 💭 Split `classes.ts` / `weapons.ts` per-class next if they start to contend.

## v0.5.6 — Progression, rewards & treasure 🚧 *(current focus)*

Make growth *felt*: XP earned by fighting (not just handed out at the bell), a
level-up moment mid-battle, chests to find, and a proper spoils screen. Full design
in [`docs/superpowers/specs/2026-06-06-progression-rewards-treasure-design.md`](docs/superpowers/specs/2026-06-06-progression-rewards-treasure-design.md).

Core (the goal):
- ⏳ **Live XP economy** — XP is granted *during* battle, not only at victory. Three
  channels: **kill-participation** (every unit that damaged/​debuffed a foe shares its
  XP; the finisher gets +50%), small **action XP** (offensive hits *and* buffs/heals on
  allies pay the actor), and a **fixed battle-clear bonus** split equally to the whole
  party (present, fallen, or benched) so no one falls off the curve.
- ⏳ **In-battle level-up screen** — a card pops the moment a unit levels up mid-combat:
  Lv↑, stat deltas, "new skill available"; queues multi-level/multi-unit; reduced-motion aware.
- ⏳ **Treasure chests** — `MapDef.chests[]` of `{ pos, loot }`; a hero ending its move
  on a chest opens it (gold + items), with a glint when in range, a jingle, and a popup.
- ⏳ **End-of-battle rewards + screen** — gold, items (chests + drops), and per-hero XP
  with level-up badges on a dedicated spoils screen; MVP line; save checkpoint after.
- ⏳ **Dialogues disabled** — one call-site flag mutes intro/outro on every level
  (data + helpers kept intact; flip to re-enable later).
- ⏳ **Richer character sheets** — XP bar, elemental affinities, derived combat values,
  growth-rate bars, mastery progress, learned-vs-locked skills; reusable in-battle inspect.

Polish & the +20 (see spec §9): floating gold popups, XP/level-up log lines, chest VFX,
a11y/keyboard on new overlays, MVP badge, enemy item drops, difficulty/chapter-scaled
loot, "collect all chests" bonus, in-battle XP panel, "new skill" indicators, animated
gold tally, dev-tools shortcuts (open chests / grant XP / show rewards).

## v0.6 — Narrative & presentation ⏳

Put the [story](STORY.md) on screen.

- 🚧 In-engine dialogue — ✅ a per-chapter story scene (JRPG text box, adapted from STORY.md)
  plays before each battle; ⏳ richer cutscenes + named-enemy intros
- ⏳ Character portraits and named-enemy intros
- ✅ **Audio** — combat SFX (WebAudio code-synth: hit/crit/heal/magic/KO/select) + HUD mute
  toggle, plus soft code-synth music (battle/camp/victory themes) sharing the same engine
- 💭 Light overworld / chapter-select map; branching paths (Tactics Ogre-style)

## v1.0 — Release polish 💭

- ✅ New Game+ — clear the campaign, restart from Phase 1 keeping your leveled party, gil
  & gear; each cycle makes enemies tougher (+3 levels). 💭 more unlockables later
- ✅ **Viewport-safe menus** — the Party Camp is split into navigable sections
  (Party / Reinforcements / Shop) with a fixed header + March footer and a scrolling
  body; New Game, Title, Settings & Victory all fit the visible screen (no clipping)
- 💭 Accessibility pass (color-blind palettes, input remap, text scaling)
- ✅ Three save slots (per-slot Continue on the title; old saves load as slot 1) and
  ✅ undo-move (take back a move before acting), and ✅ a settings menu (sound/music
  toggles + master volume)
- ✅ Battle log (a scrolling record of turns + every hit/heal/KO/status); 💭 full replay later
- 💭 Performance pass for large maps & big rosters
- 💭 Rebalanced enemy curves across difficulties

## Project hygiene (ongoing)

- ⏳ Add a license (currently unlicensed — all rights reserved by default; the owner's call)
- ✅ CI: `tsc` strict + `vite build` + the full Vitest suite on every push/PR
  (`.github/workflows/ci.yml`)
- ✅ CONTRIBUTING guide (`CONTRIBUTING.md`) + GitHub issue templates (bug / idea)
- ✅ Playable build published via GitHub Pages (`.github/workflows/deploy.yml`, on `main`)

---

Known minor limitations are listed in the [README](README.md#known-minor-limitations).
Have an idea or found a bug? Open an issue.
