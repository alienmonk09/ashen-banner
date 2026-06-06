# Rich Battlefield Rendering (SP1) — Design

**Date:** 2026-06-06 · **Branch target:** `feat/rich-battlefield` (off `main`)
**Status:** design approved

This is **sub-project 1 of 2** of a battlefield visual overhaul. SP1 makes the
battlefield visually rich at the **current** map sizes — textured procedural
terrain, a layer of code-art props (vegetation, rocks, walls), bigger tiles, and
a per-tile bake cache — without changing map dimensions, balance, or movement
rules (one opt-in LOS hook for tall props is the only gameplay-adjacent change).
**SP2** (separate spec/plan/branch) handles bigger maps + a pan/zoom/follow
camera + rebalancing; it builds on SP1's visuals.

The game has **no image assets** — every sprite is code-defined pixel art
(`SpriteDef`). Terrain today is the *least* sprite-like part: it's raw canvas math
(one HSL per terrain + height shading + 3 speckle pixels). SP1 keeps terrain
procedural (so it stays free at any height / rotation / scale) and adds richness
in the project's native idiom: procedural texture + `SpriteDef` props drawn in the
existing depth-sorted pass, exactly like the treasure chest already is.

---

## 1. Problem & goals

The battlefield reads flat. Each terrain is a single flat-shaded diamond with a
3-pixel speckle; there are no props (trees, rocks, bushes, walls) — "river" is
just `water` tiles, "wall/cliff" is just height. Tiles are also small (64×32),
so the new detail would have little room to read.

Goals (from the user, condensed):

1. **Better terrain "sprites"** — richer per-terrain rendering than flat color + 3 dots.
2. **Richer map detail** — floor vegetation, rocks, walls, trees, river edges, etc.
3. **Bigger blocks** — each tile ~**+50%** larger.
4. (SP2) bigger maps overall — out of SP1 scope.

### Approach decisions (settled during brainstorming)

- **Hybrid, not image tilesets.** Terrain stays procedural; richness comes from
  procedural texture + `SpriteDef` props. Image tilesets were rejected: they fight
  the engine's free 90° rotation + arbitrary tile heights (asset explosion), need
  an artist the project doesn't have, and would clash with the blocky code-sprite
  characters.
- **Props placement = procedural base + hand-authored accents.**
- **Some props block LOS/movement** — implemented through *existing* systems, not a
  new one (see §5).
- **+50% tiles now**, with an **auto-fit** scale so nothing clips; real pan/zoom
  is SP2.
- **Perf: per-tile bake cache** is in SP1 (user call), designed to preserve the
  current front-tile-occludes-unit behavior (see §6).
- **Edge/transition blending** (sand→grass fringe, water foam line) is **out** —
  deferred to polish.

---

## 2. Bigger tiles + auto-fit

### 2.1 Tile size (+50%)

In `engine/iso.ts`, bump the three constants by ~50%:

| const | now | new |
|-------|-----|-----|
| `TILE_W` | 64 | **96** |
| `TILE_H` | 32 | **48** |
| `TILE_Z` | 16 | **24** |

These are the single source of truth for projection, picking, and depth sorting,
so geometry cascades. But several **tile-relative magic numbers** must be re-tuned
to keep proportion:

- `renderer.ts`: `CHAR_PX_H` (60 → ~90) so characters don't shrink against bigger
  tiles; shadow/ring radii (`TILE_W*0.26` etc. are already ratio-based — verify),
  feet offset (`center.sy + 4`), HP-bar width (28), status-pip sizes, popup
  offsets (`-40`), forecast offset (`-64`), active-arrow offsets. Audit every
  literal pixel offset and scale it to the new tile size.
- `computeOrigin`'s `-40` vertical nudge → scale proportionally.

### 2.2 Auto-fit scale

At +50%, the larger current maps overflow the viewport (a 16×16 map ≈ 1536px wide
at 96px tiles, clips on smaller screens). SP1 adds a uniform **fit-to-viewport**
scale so the whole battlefield always shows, centered:

- `Renderer.computeOrigin` becomes `computeCamera(grid, rot) → { origin, scale }`.
  `scale = min(1, viewportW / mapPixelW, viewportH / mapPixelH)` over the rotated
  map's iso bounding box (account for max height in the vertical extent). Tiles
  never scale **up** past +50%; they scale **down** only enough to fit.
- `render(view)` applies `ctx.scale(scale, scale)` around the existing
  save/restore (composing with DPR + shake transforms). `origin` stays in
  pre-scale tile space.
- **Picking** (`scenes/battleScene.ts` → `screenToTile`) must invert the scale:
  divide the pointer by `scale` before the diamond test. The scene already owns
  the origin via a getter; extend it to own `{ origin, scale }` and thread both
  into render + picking.

Practical effect: small maps (phase1–5) render visibly chunkier (full +50%); big
current maps auto-shrink just enough to fit. **SP2 replaces auto-fit with
pan/zoom/follow** — this scale is the foundation, not throwaway.

---

## 3. Procedural terrain tops

Replace the 3-pixel speckle (`drawTileTop`) with a **per-terrain motif** routine —
`terrainMotif(ctx, center, terrain, tx, ty, time, lit)` — dispatched per terrain.
Keep the existing height shading (`l + z*6 − ao*4`), grid line, sunlit rim, and
cliff-wall gradient (they're good).

Motifs (all driven by the existing per-tile hash `(tx*73856093)^(ty*19349663)`
for determinism, except the `time`-animated ones):

- **grass** — scattered short blade ticks in 2–3 green shades; occasional flower dot.
- **dirt** — mottled clods, hairline cracks, a few pebble dots.
- **rock** — angular facet lines + light/dark grain.
- **sand** — fine dither + faint dune ripple lines.
- **wood** — parallel plank grooves + grain ticks.
- **water** — **animated** drifting highlight lines (sine on `time`) over darker
  troughs + sparkle dots.
- **spring** — like water, brighter/teal, gentle shimmer (animated).
- **lava** — glowing crack veins on dark crust, pulsing with `time` (animated);
  existing hazard tint stays.
- **mire** — murky mottle + occasional bubble dots.

Each motif is a small self-contained drawing routine, bounded to the tile's
diamond. Animated terrains are the only ones that change frame-to-frame.

---

## 4. Prop system

### 4.1 Data model

New `PropDef` (in `data/props.ts`):

```ts
interface PropDef {
  id: string;
  sprite: SpriteDef;                 // code pixel-art, baked like a character
  /** extra z added to LOS occlusion when present on a tile (0 = doesn't block sight) */
  sightBlock?: number;
  /** true ⇒ tile is impassable; MUST be authored on a `blocked` tile (validated) */
  solid?: boolean;
  /** procedural-scatter weight per terrain (0/absent = never scattered) */
  scatter?: Partial<Record<TerrainType, number>>;
}
```

New optional field on `MapDef` (in `core/types.ts`):

```ts
/** Hand-authored decoration accents. `solid` props must sit on a blocked tile. */
decor?: { pos: Point; propId: string }[];
```

### 4.2 Catalog (first pass)

`data/sprites/props.ts` holds the `SpriteDef`s; `data/props.ts` wires the catalog.

- **Cosmetic (scatter, never solid):** `grassTuft`, `flowerCluster`, `pebbles`,
  `reeds`, `cattail`, `mushroom`, `rubble`.
- **Structural (authored accents):** `tree`, `pineTree`, `boulder`, `stump`,
  `deadTree`, `wallSegment` — carry `solid` and/or `sightBlock`.

Scatter weights wired per terrain (grass → tuft/flower; rock → pebbles/rubble;
mire → mushroom; water/spring-adjacent → reeds/cattail; sand → sparse).

### 4.3 Placement

- **Procedural (cosmetic):** pure, deterministic
  `scatterProps(map, seed) → { pos, propId }[]`. Per walkable tile, hash
  `(mapId, x, y)` → roll against the terrain's scatter weights → maybe place **≤1**
  cosmetic prop. **Never** on a spawn / enemy / ally / chest / objective tile, never
  `solid`. Density tunable by a single constant. Seeded by a stable hash of the
  map id (no `Math.random` / `Date.now`) so a battle always looks the same.
- **Authored (accents):** `MapDef.decor[]`. May be `solid`/`sightBlock`. Authored
  decor **suppresses** procedural scatter on its tile.
- Scatter is computed **once at battle setup** (in `battleScene`, alongside the
  other per-battle init) and handed to the view.

### 4.4 Rendering

Props are **baked into their tile's cache canvas** (§6), so they ride the existing
depth-sorted pass for free: a unit on a front/adjacent tile correctly overdraws a
prop behind it via painter's order (the same mechanism the chest relies on). Props
are billboards (drawn upright) → read fine at all 4 rotations, like units. Perfect
occlusion of a tall canopy by a unit two tiles back at higher elevation is an
accepted edge-case miss.

---

## 5. LOS + movement integration

- **Movement: no new code.** A `solid` prop lives on a tile already in the
  `blocked` mask, which `pathfinding.reachable` already routes around. The prop is
  just the visual reason the tile is impassable. (Validated: every `solid` decor
  sits on a blocked tile.)
- **LOS: one-line change + plumbing.** `los.ts` is purely height-based today
  (`grid.heightAt(cx,cy) > lineZ`). Add per-tile occlusion from props:
  - `Grid` builds a `sightBlock[][]` from `map.decor` in its constructor and
    exposes `sightBlockAt(x, y): number` (0 where no `sightBlock` prop).
  - `los.ts` `blocks()` compares against `heightAt(cx,cy) + sightBlockAt(cx,cy)`.
  - Maps with no decor → `sightBlockAt` is 0 everywhere → **LOS identical to
    today** (full backward-compat; existing `los.test.ts` stays green).

---

## 6. Performance: per-tile bake cache

User-requested for SP1. Designed to **preserve** the current
front-tile-occludes-unit behavior (which a naive "blit one flat terrain image,
draw units on top" cache would break).

- **`TileBakeCache`**: bakes a tile's *static* art (cliff walls + textured top +
  any cosmetic/structural prop) to an offscreen canvas, keyed by
  `` `${terrain}|${z}|${ao}|${propId ?? ''}` ``. Identical tiles share one bake;
  reused across frames. Bake canvas spans the tile diamond + wall drop
  (`z*TILE_Z`) + prop height; blit anchored to the tile-top center.
- **Rotation-independent:** the iso tile top is a symmetric diamond and wall
  shading is screen-relative, so **one bake serves all 4 rotations** — only the
  blit position changes.
- **`drawScene`** keeps the same depth-sorted item list (tiles, props-in-tiles,
  chests, units). For each tile item it **blits the cached canvas** instead of
  re-running the motif math. Overlays (move/attack/path/aoe/hover/objective +
  hazard tints) and effects/popups stay **live** on top, as today.
- **Animated terrain** (`water`, `lava`, `spring`) is **not** cached — drawn live
  each frame (small subset). Everything else is a blit.
- The cache effectively never invalidates within a battle (terrain/heights are
  static); built lazily on first draw. New battle → new cache.

This is what makes both the richer per-tile motifs *and* SP2's big maps affordable.

---

## 7. Testing

- **`props.test.ts` (new):** scatter determinism (same seed ⇒ same layout);
  cosmetic props never land on spawn/enemy/ally/chest/objective/`solid` tiles;
  scatter respects terrain weights; density within a sane band; every catalog
  `propId` referenced resolves.
- **`los.test.ts` (extend):** a `sightBlock` prop blocks a sightline that height
  alone would not; with no decor, results are identical to today (regression).
- **`maps.test.ts` (extend):** every `solid` `decor` entry is in-bounds and on a
  `blocked` tile; every `decor.propId` exists; no `decor` overlaps a
  unit/chest/objective tile; `mapsReach` reachability still passes (solid decor
  only on already-blocked tiles ⇒ unchanged).
- **`iso.test.ts` (verify/extend):** projection + picking still consistent at the
  new tile size and under the auto-fit scale (inverse-scale round-trip).
- Full suite (currently **1333**) stays green; `npm run build` (tsc strict) clean.
- **Visual validation (manual):** in-engine screenshots via the puppeteer-core
  browser-verify recipe — one per terrain + one decorated map — for eyeball
  approval. Not automated.

---

## 8. Files touched (SP1)

- `src/engine/iso.ts` — +50% tile constants.
- `src/engine/renderer.ts` — terrain motifs, prop bake-in, `TileBakeCache`,
  blit-instead-of-redraw, `computeCamera` (origin + scale), re-tuned offsets.
- `src/engine/sprite.ts` — bake helpers if a prop-specific bake path is needed.
- `src/data/props.ts` *(new)* — `PropDef`, catalog, scatter weights, `scatterProps`.
- `src/data/sprites/props.ts` *(new)* — prop `SpriteDef`s.
- `src/battle/grid.ts` — build `sightBlock[][]` from `decor`; `sightBlockAt`.
- `src/battle/los.ts` — add `sightBlockAt` to the height test.
- `src/core/types.ts` — `MapDef.decor?`.
- `src/scenes/battleScene.ts` + `src/scenes/battleView.ts` — own `{origin, scale}`,
  compute scatter at setup, scale-aware picking, pass props into the view.
- `tests/props.test.ts` *(new)*, extend `los.test.ts` / `maps.test.ts` / `iso.test.ts`.

---

## 9. Build order (for the plan)

Sequenced so each step is independently buildable + verifiable; renderer is one
stateful file so its steps go in order.

1. **Tiles +50% + auto-fit** — bump constants, `computeCamera`, `ctx.scale`,
   scale-aware picking, re-tune offsets. Verify: existing maps render centered,
   nothing clips, picking accurate. (No visual richness yet.)
2. **Terrain motifs** — per-terrain `terrainMotif`, animated water/lava/spring.
   Verify: screenshot each terrain.
3. **Per-tile bake cache** — `TileBakeCache` + blit path + live animated terrain.
   Verify: visuals unchanged from step 2, framerate steady.
4. **Prop data model + catalog + scatter** — types, `SpriteDef`s, `scatterProps`,
   bake props into tiles. Verify: cosmetic props appear, deterministic, off
   forbidden tiles; screenshot a decorated map.
5. **LOS/movement hook + authored decor** — `Grid.sightBlockAt`, `los.ts` line,
   `MapDef.decor`, seed a couple maps with structural accents. Verify: LOS tests,
   reachability, no regression on undecorated maps.

Each step: tsc strict clean, `npm test` green, browser-verify, commit with a clear
message + Co-Authored-By.

---

## 10. Out of scope (→ SP2)

- Bigger map dimensions (re-authoring all 17 maps' heights/blocked/terrain/spawns).
- Real camera: pan (scroll/drag), zoom toggle, follow active unit (replaces SP1's
  auto-fit).
- Enemy-count / spawn rebalancing for larger maps.
- Edge/transition blending between adjacent terrains (polish).
