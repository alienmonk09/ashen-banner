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
- ✅ Progression: XP/leveling, JP skill unlocks, free class change, weapon swap
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
  jobs with JP; the first sub-job skill is granted on equip.
- 🚧 **More classes** — ✅ Time Mage (Comet + haste/slow/stop control) and ✅ Summoner
  (Ifrit/Shiva/Ramuh/Titan — wide-AoE glass cannon), retrainable at camp; ⏳ Lancer
  (jump), Geomancer still to come
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

- 🚧 **Reaction abilities** — ✅ Counter (Knight/Monk strike back at melee attackers);
  ⏳ auto-potion, cover an ally, and equippable reactions (FFT-style) still to come
- ⏳ **Knockback / forced movement** — shoves, pulls, throws; fall damage off ledges
- ⏳ **Zone of control & engagement** — passing an enemy's reach has a cost
- ⏳ **Spell charge time** — powerful magic resolves a few CT ticks later (FFT casting),
  with a charging indicator and the option to interrupt
- 🚧 **Objective variety** — ✅ rout, defeat-the-commander (the finale: kill Maldrath),
  survive-N-turns, ✅ seize-a-point and ✅ defend-a-point (gold tile marker in the HUD);
  ⏳ escort (needs an NPC unit concept)
- 🚧 **Terrain effects** — ✅ lava damage floors & healing springs (end-of-turn HP deltas);
  ⏳ slow mire, height-gated cover
- 💭 **Fog of war / vision** — sight radius, scouting, ambush
- 💭 **Weather & day/night** — accuracy/affinity shifts, timed events
- 💭 **Large / multi-tile units & mounts** — cavalry move bonus, dragons

## v0.5 — Roster, economy & meta ⏳

- ⏳ **Recruitable / capturable units** — turn beaten foes or story NPCs into party members
- ⏳ **Shop & economy** — gil drops, buy/sell weapons, armor, items between chapters
- ⏳ **Job mastery** — master a class to unlock the next; passives carried across jobs
- ⏳ **Difficulty modes & AI personalities** — aggressive/defensive/support archetypes
- 💭 **Casualty / permadeath option** — Fire-Emblem-style classic mode
- 💭 **Bravery / Faith / morale** — unit traits that scale reactions and magic
- 💭 **Weapon/class triangle** — rock-paper-scissors matchups for readable counters

## v0.6 — Narrative & presentation ⏳

Put the [story](STORY.md) on screen.

- ⏳ In-engine dialogue / cutscene system; per-chapter story beats
- ⏳ Character portraits and named-enemy intros
- 🚧 **Audio** — ✅ combat SFX (WebAudio code-synth: hit/crit/heal/magic/KO/select) + HUD
  mute toggle; ⏳ music per phase
- 💭 Light overworld / chapter-select map; branching paths (Tactics Ogre-style)

## v1.0 — Release polish 💭

- 💭 New Game+ / post-campaign content & unlockables
- 💭 Accessibility pass (color-blind palettes, input remap, text scaling)
- 💭 Settings/options menu, multiple save slots, undo-move
- 💭 Replay / battle log
- 💭 Performance pass for large maps & big rosters
- 💭 Rebalanced enemy curves across difficulties

## Project hygiene (ongoing)

- ⏳ Add a license (currently unlicensed — all rights reserved by default)
- ⏳ CI: run `npm run build` + `npm test` on push/PR
- ⏳ CONTRIBUTING guide and issue templates
- 💭 Playable build published via GitHub Pages

---

Known minor limitations are listed in the [README](README.md#known-minor-limitations).
Have an idea or found a bug? Open an issue.
