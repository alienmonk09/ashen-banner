# Ashen Banner

A Final Fantasy Tactics–style game: isometric, turn-based grid battles with
class progression, magic, weapons, and items. Built in **TypeScript + HTML5
Canvas**, no game engine, no art assets — every sprite is code-defined pixel art.

> *The old kingdom burned. All that's left of it is a scorched banner, and five
> who still carry it.* — A band of survivors carries the Ashen Banner from the
> border wilds to the tyrant Maldrath's shattered throne, across a seven-chapter
> campaign. Full story → **[STORY.md](STORY.md)**.

Eight classes (one unlockable via class change) across five races, seven
playable phases, a charge-time turn system, and an enemy AI that heals, focuses,
flanks, and pursues. At the start you **choose a party of four** from a roster of
seven named heroes, then gather **reinforcements** as the campaign opens
deployment slots.

## Run it

```bash
npm install
npm run dev        # open the printed localhost URL
```

Other scripts:

```bash
npm run build      # typecheck + production build to dist/
npm test           # run the Vitest suite
```

## How to play

- **New Game** opens the **party select** — pick four of the seven heroes (each a
  fixed class and race) to carry the banner, then march into Chapter I.
- On your unit's turn, use the action menu (it pops up next to the active unit):
  - **Move** — click a highlighted tile (blue). The path preview (yellow) shows
    the route; movement respects range, terrain height, and your unit's Jump.
    You may move **through** allied units, but can't stop on an occupied tile;
    enemy-held tiles block the path.
  - **Attack** — click an enemy inside weapon range (red).
  - **Skill** — pick a learned class skill (costs MP); click a target tile.
    Area skills show an AoE preview (orange). Support skills can target allies
    or yourself.
  - **Item** — use a shared consumable (Potion, Hi-Potion, Ether, Phoenix Down,
    Hourglass — grants Haste).
  - **Wait** — end the turn.
- **Right-click** cancels back to the menu. **Enter** / **E** ends the turn.
- **Rotate the camera** to see the map from another angle: the **⟲ / ⟳**
  buttons (top-right) or the **,** / **.** keys spin the board in 90° steps.
  Works any time, including the enemy's turn.
- Turn order (top bar) is driven by Speed (a charge-time system).
- **Position matters.** Striking a foe from the flank or rear, or from higher
  ground, hits harder and crits more often (a small ground arrow shows each unit's
  facing). Ranged attacks and offensive spells need **line of sight** — walls and
  tall terrain block the shot. Watch for **status pips** above a unit: Poison and
  Regen tick HP each turn, Stop costs turns, Protect/Shell blunt physical/magical
  damage, Haste/Slow bend turn speed.
- **Reactions.** Melee bruisers — **Knight** and **Monk** — strike back at any
  adjacent foe that hits them in melee, so charging a held line has a price.
- Each battle shows its **objective** (top center). Most are won by routing the
  enemy, but some differ — the finale is won by **defeating the tyrant** himself,
  his guard optional. Between phases, the **Party Camp** screen lets
  you change classes, swap weapons, spend JP to learn new skills, and **recruit
  reinforcements** from the rest of the roster as the campaign opens deployment
  slots (a fifth hero mid-campaign, a sixth for the finale). Progress is saved
  automatically (localStorage); **Continue** resumes from the camp.

## Classes

| Class | Role | Skills |
|-------|------|--------|
| Knight | Melee tank | Power Strike, Guard |
| Archer | Ranged physical | Aimed Shot, Cripple |
| Black Mage | Offensive magic | Fire, Bolt, Fireball (AoE), Poison, Stop |
| White Mage | Support / heal | Cure, Cura (AoE), Raise, Protect, Shell, Haste |
| Monk | Melee bruiser | Palm Strike, Chakra (heal), Earth Shake (AoE) |
| Thief | Fast skirmisher | Backstab, Hamstring (slow), Fan of Knives (AoE) |
| Druid | Nature hybrid | Regrowth (heal), Thorn Lash, Entangle (slow), Rejuvenate (Regen) |
| Time Mage | Control caster | Comet (non-elemental), Slow, Haste, Stop |

Knight and Monk also carry the **Counter** reaction (they strike back at melee
attackers). **Time Mage** has no default hero — retrain any unit into it at the
Party Camp.

### Races

Each hero also has a race, applying a small flat stat modifier **and an elemental
affinity** (weakness ×1.5 / resistance ×0.5 to that element's spells): **Human**
(balanced, no affinity), **Elf** (+MAG/RES/SPD, −HP; weak fire, resists nature),
**Dwarf** (+HP/DEF, −SPD; weak nature, resists fire), **Halfling** (+SPD/MOVE/JUMP,
−HP/ATK; weak fire, resists bolt), **Orc** (+ATK/HP, −MAG/RES; weak bolt, resists
nature). The damage forecast flags **weak/resist** so you can aim spells where they bite.

The seven heroes: Garan (Knight, Dwarf), Lyra (Archer, Elf), Vex (Black Mage,
Human), Mira (White Mage, Human), Bron (Monk, Orc), **Enzo** (Thief, Halfling),
and **Penelope** (Druid, Elf).

## The campaign

Seven phases of rising difficulty, from a border skirmish to the tyrant's keep.
See **[STORY.md](STORY.md)** for the full narrative.

| # | Chapter | Setting |
|---|---------|---------|
| I | Tutorial Skirmish | Grassy field, brigand camp — learn the basics |
| II | Ambush in the Hills | Enemies on high ground, a sorcerer behind them |
| III | The Bridge | A river chasm crossed by one narrow stone bridge |
| IV | The Cinder Fields | Open burned farmland — a roving company tries to surround you |
| V | Sorcerer's Court | Tiered terraces, a mage cabal and a healer |
| VI | The Outer Ramparts | The keep's fortified wall — archers and a mage on the high stone |
| VII | The Tyrant's Stand | Maldrath the Unbowed and his throne-guard |

## Project layout

```
src/
  core/     types, game state + save/load, RNG, unit/progression math
  battle/   grid, BFS pathfinding, targeting/AoE, combat, turn manager, AI
  engine/   isometric projection + picking, canvas renderer, input, loop, animator
  ui/       DOM battle HUD, menus, party screen styles
  scenes/   battle scene (turn state machine), party camp, title/victory
  data/     classes, skills, weapons, items, party, maps/ (seven chapters), sprites
tests/      unit tests per module + a full AI-vs-AI battle simulation
docs/superpowers/specs/  design spec
```

## Tests

`npm test` runs **495 tests across 21 files**: per-module unit tests (RNG,
pathfinding, targeting, combat, facing/back-attacks, line of sight, elevation /
status / elemental / counter modifiers, turn order, AI, grid, movement/pass-through,
iso projection, save/load, races, hero roster & reinforcements) plus map-data
invariants and a **full battle simulation** that auto-plays all seven phases to a
decisive winner while asserting HP/stat invariants every turn.

## Roadmap

See **[ROADMAP.md](ROADMAP.md)**. Short version: v0.2 tactics depth and most of
v0.3 have shipped (facing/back-attacks, line of sight, elevation, the full status
kit, elemental affinities, party-size progression, the Time Mage, counters,
objective variety, two larger maps) — next is a secondary-job system, equipment,
more classes, then narrative/audio.

## Known minor limitations

- The turn-order preview bar snapshots Speed, so it can briefly mispredict the
  order right as a Slow/Haste status expires (cosmetic).
- Tile picking hit-tests tile tops; clicking the vertical face of a tall cliff
  may select the tile behind it. Click the tile's top surface to be precise.

## Tech stack

TypeScript (strict), Vite 5, Vitest 2, Canvas 2D. No runtime dependencies.
