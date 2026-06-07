# SP2a — Real Camera (pan / zoom / follow) — Design

**Date:** 2026-06-06 · **Branch target:** `feat/rich-battlefield-camera` (off `feat/rich-battlefield`)
**Status:** design approved (revised through 3 rounds of adversarial review; transform math
independently re-derived + numerically verified — boot is pixel-identical to SP1's `computeCamera`)

This is **sub-project 2a** of the battlefield overhaul. SP1 (`feat/rich-battlefield`, done) made
the field visually rich and added an **auto-fit** camera scale (`Renderer.computeCamera →
{origin, scale}`) as an explicit foundation for a real camera. SP2a cashes that in: it replaces
auto-fit with a navigable camera — **drag-to-pan, wheel-to-zoom (zoom-to-cursor), smart-follow of
the active unit** — without changing map dimensions, balance, or rendering. SP2b (bigger maps +
rebalance) and SP2c (terrain edge-blending) are separate later cycles; SP2a is the enabler.

---

## 1. Problem & goals

SP1's auto-fit always frames the **whole** map and shrinks tiles to fit (`scale ≤ 1`). That keeps
everything on-screen but loses the +50% chunkiness on bigger maps, with no way to look closely or
follow the action. SP2b will enlarge maps, which auto-fit would shrink further — so a real camera
is the prerequisite.

Goals (settled in brainstorming):

1. **Pan** — drag the battlefield with the mouse; arrow/WASD as an alternative.
2. **Zoom** — mouse wheel, **zoom-to-cursor**, bounded `[fitScale .. 1.0]` (never above native
   +50%, so pixel-art crispness is unaffected — the `scale ≤ 1` regime SP1 already handles).
3. **Smart follow** — auto-center on each newly-active unit (player **and** AI) at turn start and
   track its movement; manual pan/zoom on the player's turn suspends follow; a recenter key/button
   re-arms it. **Boot exception:** the **first turn** of the battle (whoever acts) keeps the
   whole-map boot framing (Goal 4); follow begins on the **second** turn, or earlier if the player
   presses recenter — see §5.
4. **Zero boot regression** — the initial framing on battle start is pixel-identical to SP1's
   auto-fit (whole map, centered).

### Approach decisions (settled during brainstorming)

- **Controls:** drag-to-pan + wheel-zoom (zoom-to-cursor), keyboard pan as alt.
- **Zoom range:** bounded `[fitScale(map,rot,viewport) .. 1.0]`. On a small map already fitting at
  1.0 (phase1 8×8), `fitScale == 1` ⇒ zoom is a no-op and pan is pinned.
- **Follow:** smart-follow with manual-suspend + first-turn boot exemption (see §5).
- **Architecture:** a **pure `engine/camera.ts` module** (no canvas) owning the state + math,
  unit-tested in vitest (node); the scene wires input → camera methods; the renderer is unchanged
  (it already consumes `{origin, scale}` + shake from SP1).
- **Out of scope:** minimap, edge-scroll, touch/pinch, inertia/momentum (→ later).

---

## 2. Coordinate model (the load-bearing contract)

Constants `TILE_W=96, TILE_H=48, TILE_Z=24`. `worldToScreen(x,y,z,origin) = ((x−y)·W/2 + origin.sx,
(x+y)·H/2 − z·Z + origin.sy)`. The **pre-origin** part is **tile-screen space**; SP2a exports it
from `iso.ts` as a shared pure helper:

```
tileScreen(x, y, z) = worldToScreen(x, y, z, {sx:0, sy:0}) = ( (x−y)·W/2 , (x+y)·H/2 − z·Z )
```

`camera.ts`, `battleScene.ts`, and the camera tests all import `tileScreen` (no private copy). A
logical tile is passed through `rotateTile(x,y,rot,w,h)` first (as `projectTile` does):
`tileScreen(v.x, v.y, z)`.

`render()` wraps the scene in `ctx.scale(zoom)` (composed with the shake translate and the DPR
transform from `resize()`), so a tile lands at **`screenPx = (tileScreen + origin) · zoom`**
(CSS px; DPR aside; **origin is inside the scale**). Confirmed against `render()` + `projectTile`.

The camera is parameterized by **`zoom`** and **`center`** (`center` = the tile-screen-space point
that must sit at the viewport middle `M = (vw/2, vh/2)`):

```
origin = M / zoom − center                       // ⇒ (center + origin)·zoom = M
```

This generalizes SP1 exactly: SP1 is the special case `zoom = fitScale`, `center = fitCenter`.

**Type note:** `center`/`target`/`followTo`/`snapTo` use a `TileScreenPoint` alias (structurally
`{sx,sy}` but **tile-screen**, pre-origin/pre-zoom). The only screen-**pixel** output is `origin`.
The alias keeps the two spaces from being silently mixed.

**Camera state (private):** `{ viewport:{w,h}, map, rot, zoom, center, target }`. `map`/`rot` are set
by `reset`/`reframeForRotation`; `viewport` by the constructor + `setViewport`; manual + follow ops
read them so they clamp/fit **without taking those as args**.

**Operations:**

- `panBy(dx, dy)` — drag delta in CSS px (grab-the-map: content follows the hand).
  `center −= (dx,dy)/zoom`, then **`clamp()` internally** (so `center` is always valid between
  frames — a pinned map shows zero drag movement, no nudge).
- `zoomAt(factor, cursor)` — `factor` is a **multiplicative ratio** (`>1` in, `<1` out; asserted
  `>0`). `zoom' = clamp(zoom·factor, fitScale, 1)`; then with the **clamped** `zoom'`,
  `center' = center + (cursor − M)·(1/zoom − 1/zoom')`; set `zoom = zoom'`; `clamp()` internally.
  The cursor-invariant (the tile-screen point under the cursor stays fixed) holds **away from clamp
  boundaries** and at the zoom bounds (`zoom'==zoom` ⇒ delta 0, no drift); **near a map edge `clamp`
  takes precedence and the under-cursor point may shift** — clamp always wins (tested, §7).
- `followTo(target: TileScreenPoint)` — stores the eased target; does **not** change `zoom`.
- `snapTo(to: TileScreenPoint)` — sets both fields immediately (`this.center = this.target = to`),
  then `clamp()` (turn-start / recenter instant jump).
- `update(dt)` — eases `center` toward `target` with **dt-correct exponential smoothing**:
  `k = 1 − exp(−dt / TAU)`, `center += (target − center)·k`; snap when within `EASE_EPSILON`; then
  `clamp()`. If `center` is within `EASE_EPSILON` of `target`, **or** the eased+clamped `center`
  equals the `center` captured at the **top of this `update()` call** (target unreachable because
  it's outside the clamp region — e.g. a unit hugging a map edge), skip the lerp this frame. This is a **per-frame comparison, not a
  sticky flag** — any new `followTo`/`snapTo`/`panBy`/`zoomAt` re-arms the ease.
- `clamp()` — **internal** (tests drive it via `panBy`/`zoomAt`/`update` + the `origin`/`center`
  getter). Keeps the map bbox within the viewport **+ `CLAMP_MARGIN`**, **per axis**:
  - **X:** symmetric — `center.sx` bounded so the bbox can't show past the margin either side; when
    `bboxW·zoom ≤ vw`, pin `center.sx = fitCenter.sx` (= the geometric bbox-X center).
  - **Y:** the pin/keep target is **`fitCenter.sy`** = `mid.sy + FRAME_NUDGE`, which sits
    `FRAME_NUDGE + mh·Z/2` **below** the geometric bbox-Y center (screen-down — screen y grows down).
    Effect: a larger `center.sy` shifts the rendered map **up** by `FRAME_NUDGE·zoom` px, leaving room
    at the **bottom** for the action menu / lower HUD (this reproduces `computeCamera`'s `−40` exactly).
    **Two regimes:** when
    the bbox is **taller** than the viewport, `center.sy` is bounded so **bbox top ≥ −CLAMP_MARGIN
    AND bottom ≤ vh + CLAMP_MARGIN** (you can't pan the map off-screen); when it **fits** vertically,
    `center.sy = fitCenter.sy` (boot framing) — this intentionally leaves extra headroom above the
    map, so the top edge can sit *higher* than `−CLAMP_MARGIN` (nothing is clipped, the whole map is
    visible). The margin bound is an anti-pan-off-screen rule, not a symmetric-centering rule.
- Getters: **`origin`**, **`scale`** (= `zoom`).

**Map bounding box (tile-screen space) — used by both `clamp` and `fitScale`, full-diamond extents
so the two agree.** With `dims = rotatedDims(rot, w, h)`, `mh = map.maxHeight()`:
```
x ∈ [ −(dims.h−1)·W/2 − W/2 , (dims.w−1)·W/2 + W/2 ]   // span = (dims.w+dims.h)·W/2 = pxW
y ∈ [ −mh·Z − H/2          , (dims.w+dims.h−2)·H/2 + H/2 ] // span = (dims.w+dims.h)·H/2 + mh·Z = pxH
```
The `±W/2`,`±H/2` expand the tile-**center** extents by half a diamond so edge tiles aren't clipped
— exactly the one-tile padding `computeCamera` bakes into `pxW`/`pxH`. `rot` affects only the
in-plane dims (w/h swap via `rotatedDims`); the `mh·Z` vertical term is rotation-invariant.

**Fit helpers (ported from `computeCamera`, use cached map/rot/viewport):**
- `fitScale = min(1, (vw·0.98)/pxW, (vh·0.94)/pxH)` — the zoom-out bound (always in `(0,1]`).
- `fitCenter = tileScreen(midX, midY, 0) + (0, FRAME_NUDGE)`, `FRAME_NUDGE = 40` a **constant in
  tile-screen (unscaled) space**, NOT `40/zoom` (computeCamera's `−40` is outside the `/scale`, so
  boot parity requires `fitCenter.sy = mid.sy + 40` at any zoom). `midX=(dims.w−1)/2, midY=(dims.h−1)/2`.

**Tunable constants (starting values; unit):** `TAU = 0.12 s`, `EASE_EPSILON = 0.5` tile-screen px,
`CLAMP_MARGIN = 48` px, `DRAG_THRESHOLD = 5` px, `PAN_SPEED = 600` px/s,
`ZOOM_SENS ≈ 0.00095` (so a normalized 100-px wheel notch gives `exp(−100·ZOOM_SENS) ≈ 1/1.1`).

---

## 3. Input extension (`engine/input.ts`)

Today `Input` exposes only `pointer`, `onLeftClick`, `onRightClick`, `onKey` (native `click`, no
wheel/drag/held-keys). Add, all inside `Input`:

- **Wheel:** a `wheel` listener (`passive:false`, `preventDefault`) → `onWheel(normDeltaY, x, y)`,
  where `normDeltaY` normalizes `WheelEvent.deltaMode` (lines/pages → px) so trackpad and notched
  wheels are comparable.
- **Drag + click disambiguation:** replace native `click` with `mousedown`/`mousemove`/`mouseup`.
  On `mousedown` record the origin; while held emit `onDrag(dx, dy)` per move; on `mouseup`, decide
  via a **pure exported** helper `isPan(downPt, upPt) = peak straightLineDist(down, current) ≥
  DRAG_THRESHOLD` (max straight-line distance from the down origin, not path length, so wobble
  cancels). Tap (`!isPan`) → `onLeftClick(x,y)` as today; pan → suppress the click.
- **Held keys:** `keysDown: Set<string>` (add on keydown, remove on keyup, clear on blur/leave) for
  per-frame keyboard pan. Discrete `onKey` stays for rotation, cancel, end-turn, recenter.

The constructor registers the new wheel/mouse/key listeners; `dispose()` removes them; `reset()`
nulls the new callbacks and clears per-frame state (`keysDown`, drag origin).

---

## 4. Camera module shape (`engine/camera.ts`)

Pure module. **Depends only on pure modules** — `iso.ts`
(`tileScreen`/`worldToScreen`/`rotateTile`/`rotatedDims`/`Rotation`/`ScreenPoint`/constants),
`Grid` from `battle/grid` (`width`/`height`/`maxHeight()`/`heightAt(x,y)`), and `Point` (`{x,y}`
from `core/types`, a pure data type); imports no canvas/DOM, so it's node-unit-testable.

```ts
type TileScreenPoint = ScreenPoint; // structurally {sx,sy}, but tile-screen (pre-origin/pre-zoom)

class Camera {
  constructor(viewport: { w: number; h: number });
  // framing (set cached map/rot/viewport)
  reset(map: Grid, rot: Rotation): void;          // center=fitCenter, zoom=fitScale, target=center (boot, no ease)
  setViewport(w: number, h: number): void;        // on resize; re-fit zoom bound + re-clamp
  reframeForRotation(map: Grid, toRot: Rotation, focusTile: Point | null): void;
  // manual (each clamps internally)
  panBy(dx: number, dy: number): void;
  zoomAt(factor: number, cursorX: number, cursorY: number): void;
  // follow
  followTo(to: TileScreenPoint): void;            // eased; no zoom change
  snapTo(to: TileScreenPoint): void;              // this.center = this.target = to, then clamp
  recenterFit(): void;                            // snap center to fitCenter (whole-map), keep current zoom; then clamp
  update(dt: number): void;                       // dt-correct ease toward target, then clamp
  // outputs
  get origin(): ScreenPoint;
  get scale(): number;
}
```

- `setViewport(w,h)` updates `viewport`, **re-derives `fitScale`** for the new size, pulls
  `zoom = clamp(zoom, fitScale, 1)` (a window **grow** raises `fitScale`, so a previously-fit stored
  zoom can fall below the new bound — the clamp pulls it back up, restoring `[fitScale..1]`; a
  **shrink** lowers `fitScale` and leaves a valid zoom unchanged), then `clamp()`. If the camera was
  at boot/whole-map framing, it re-fits to `fitCenter` too.
- `reframeForRotation(map, toRot, focusTile)` first updates cached `map`/`rot` from its args (so
  `w`/`h`/`dims` come from the now-cached map), re-derives the `fitScale` bound (clamps `zoom` into
  it), then keeps the **scene-supplied `focusTile`** centered:
  `center = tileScreen(rotateTile(focusTile.x, focusTile.y, toRot, w, h), grid.heightAt(focusTile.x, focusTile.y))`
  (snap; `z` from `heightAt` is rotation-invariant since it's the same physical tile); if
  `focusTile` is `null`, falls back to `fitCenter`. Then `clamp()`. The Camera stays
  rotation-agnostic — it never inverts `center → tile`; the scene owns which tile to keep centered.

`recenterFit()` sets `center = fitCenter` (current zoom unchanged), then `clamp()` — the whole-map
recenter the scene calls when there is no focus unit (fitCenter stays internal; the scene never
touches it directly).

`clamp`, `fitScale`, `fitCenter`, and the bbox are internal (use cached state). `tileScreen` is the
shared `iso.ts` export (not a private copy).

---

## 5. Scene wiring + follow state machine (`battleScene.ts`)

The scene owns one `Camera`, gates + wires input, and reads `camera.origin/scale` for **render,
picking, and the DOM menu anchor** (all already scale+origin aware from SP1).

**Framing events:**
- Battle start → `camera.reset(this.grid, this.rot)`; `bootFraming = true`, `followSuspended = true`.
- `onResize()` → `camera.setViewport(renderer.width, renderer.height)`, then re-anchor menu.
- Rotation (`,`/`.`) → existing rotate, then `camera.reframeForRotation(this.grid, this.rot, focusTile)`
  where `focusTile` = the focus unit's tile, else `screenToTile(viewportCenter)` taken **before** the
  rotation (so the looked-at tile stays centered).

**`focusUnit` / `focusTile` (scene helpers):** `focusUnit` = the acting enemy on an AI turn, the
active player unit on a player turn, else `null`. `focusTile = focusUnit?.pos ?? null`. All
follow/recenter calls **null-guard** on `focusUnit`.

**`unitCenter(u)` helper (scene)** — returns the EXACT tile-screen center the sprite is drawn at, so
follow and recenter share one computation:
```ts
const ap = this.ctx.animator.animPos.get(u.id) ?? u.pos;   // fractional during a move, else u.pos
const z  = this.grid.interpHeightAt(ap.x, ap.y);            // shared elevation helper (§6)
const v  = rotateTile(ap.x, ap.y, this.rot, this.grid.width, this.grid.height);
return tileScreen(v.x, v.y, z);                             // TileScreenPoint
```
Per-frame follow uses `camera.followTo(unitCenter(u))` (eased); turn-start/recenter use
`camera.snapTo(unitCenter(u))` (instant).

**Input gating:** manual pan/zoom act **only when `this.playerInControl`** (which already implies
player team, interactive phase, and `!animator.busy`). On the AI turn / during an animation they
no-op (so "AI turn always follows" never fights a manual drag). *Follow does NOT use this gate* — it
must track a unit during its move animation (when `playerInControl` is false); it gates on
`followSuspended` and `bootFraming` only.

`followSuspended` is **set** by any manual pan/zoom/keyboard-pan; **cleared** by a turn start, a
recenter, **or the player committing a move/action** — so the camera follows the committed move even
if the player panned around while planning.

- `input.onDrag(dx,dy)` → if `playerInControl`: `camera.panBy(dx,dy)`, `followSuspended=true`.
- `input.onWheel(nd,x,y)` → if `playerInControl`: `camera.zoomAt(exp(−nd·ZOOM_SENS), x, y)`, `followSuspended=true`.
- held arrows/WASD → in `update(dt)`, if `playerInControl`: **camera-move convention** (right arrow
  pans the camera right ⇒ `center.sx` increases), so negate the drag-delta:
  `camera.panBy(−dir.x·PAN_SPEED·dt, −dir.y·PAN_SPEED·dt)`, `followSuspended=true`.
- recenter (action/button) → clears `bootFraming` and `followSuspended`; `camera.snapTo(unitCenter(focusUnit))`
  if `focusUnit`, else `camera.recenterFit()` (re-fit whole map). Recenter is the explicit "start
  following / re-center now" affordance and intentionally exits boot framing. (Deliberate SP2a scope:
  recenter during an AI move is a hard `snapTo` then ease; manual zoom is unavailable on the AI turn —
  follow owns the frame.)

**Follow state machine:**

*On a turn boundary (in this order):*
1. **Turn ends** → `if (bootFraming) bootFraming = false`. (`bootFraming` IS the first-turn marker —
   true from battle start, cleared at the end of whatever turn is first; no `turnCount` compare.)
2. **Turn starts** (`focusUnit` updates: acting enemy on AI turn, active player unit on player turn)
   → `if (!bootFraming)`: `snapTo(unitCenter(focusUnit))`, `followSuspended = false`.

*Async events (any frame):*
3. Manual pan/zoom (player in control) → `followSuspended = true`.
4. **Player commits a move/action** → `followSuspended = false` (re-arms follow so per-frame step 2
   tracks the committed move animation).
5. Recenter → clear `bootFraming` + `followSuspended`, then snap (see the recenter bullet above).
   No-op before `reset()` / while `phase==='intro'` (camera not yet framed).

So the **first turn** (whoever acts — enemy-first is reachable via CT/speed order) plays under the
whole-map boot framing; `bootFraming` clears when that first turn ends; the **second** actor is the
first to be auto-centered. An auto-resolved opening turn (a Stop/Charging unit that resolves without
a player command) still counts as the first turn — its end clears `bootFraming`.

*Per-frame — runs at the **top** of scene `update(dt)`, before the existing hover-pick `screenToTile`
read and the render read, so `origin`/`scale` are fresh for picking and render in the same frame:*
1. apply held-key pan (if `playerInControl`).
2. if `focusUnit != null` **and** `!followSuspended` **and** `!bootFraming` →
   `camera.followTo(unitCenter(focusUnit))` (tracks the move animation; covers the player's own
   committed move and AI follow — AI never sets `followSuspended` because manual input is gated off).
3. `camera.update(dt)` (ease + clamp). When `focusUnit == null` (intro/over) only this runs.

**On-screen UI:** add a **recenter button** to the `.rotate-ctl` cluster
(`battleUI.showRotateControl(onLeft, onRight, onRecenter)` + the button; `styles.ts` gets the rule).
Keyboard is primary; zoom is wheel-only in SP2a.

**DOM action menu:** `anchorMenuToActive()` stores the anchor; `placeFloating()` repositions +
clamps via `getBoundingClientRect`. Today it's called on the discrete events **`refreshMenu`
(per-selection — the primary), `rotateView`, `undoMove`, `onResize`**. SP2a re-anchors **per-frame
in `update()`** but **only when `origin`/`scale` changed since last frame** (cache + compare) so a
static camera does zero work; the per-frame path keeps a **cheap clamp** using the panel's
**last-measured** width/height (cached from the previous full `placeFloating`), so the menu never
slides off-screen during a recenter ease near a map edge; a fresh `getBoundingClientRect` runs only
on menu **open / resize / content change** (the cached panel size is refreshed whenever
`showActions`/`showSubmenu` rebuilds the menu — so a multi-row menu near an edge doesn't clip during
a pan). The four discrete anchor calls (`refreshMenu`, `rotateView`, `undoMove`, `onResize`) become
redundant once the per-frame path runs — drop or no-op them.

---

## 6. Integration & removals

- **`Renderer.computeCamera` is removed** — its only caller is `battleScene`'s `camera` getter, now
  using `Camera`. The fit math moves into `camera.ts`.
- **Shared exports:**
  - `iso.ts` gains `tileScreen(x,y,z)` (= origin-less `worldToScreen`); camera, scene, and tests
    import it (one projection, no copies).
  - the renderer's private `interpHeight(grid, ap)` (bilinear height interp) is lifted to
    **`Grid.interpHeightAt(px, py)`** (pure; accepts fractional coords); the renderer is refactored
    to call it, and `unitCenter` uses the same method — so the camera centers on exactly the sprite's
    drawn position.
- `render()`, `screenToTile`, `projectTile`, `BattleView` are **unchanged** (SP1 threads
  `{origin, scale}`; `BattleView.scale` is optional with `?? 1` in `render()`, and the scene always
  supplies a concrete `cam.scale` — optionally tighten `scale` to required).
- **Picking:** `screenToTile(px, py, grid, camera.origin, rot, camera.scale)` — no `iso.ts` change
  beyond the new `tileScreen` export.
- **Screen-shake** still composes (shake translate then `ctx.scale(zoom)`).
- **`resetTileCache`** + the bake cache are untouched (camera only changes origin/scale).

---

## 7. Testing

`tests/camera.test.ts` (vitest, node — `camera.ts` is pure; imports shared `tileScreen` from iso):

- **Boot parity:** `reset()` then `origin`/`scale` reproduce SP1's `computeCamera` output for a range
  of map sizes + all 4 rotations (pixel-identical). **Pin the nudge:** `center.sy − mid.sy === 40`
  on a map with `fitScale < 1`.
- **panBy:** moves `center` by `−d/zoom`; round-trips with `origin`. **Pinned map** (`fitScale==1`):
  `panBy` then `center === fitCenter` (no transient).
- **keyboard direction:** right arrow ⇒ `center.sx` increases (camera-move convention, not inverted).
- **clamp:** large pans never push the full-diamond bbox past viewport+`CLAMP_MARGIN`; **X crossover**
  at `bboxW·zoom == vw` ⇒ `center.sx == fitCenter.sx`, no jitter; **asymmetric** (map wider than vw
  but shorter than vh) ⇒ X bounded while Y pinned to `fitCenter.sy`; **tall-map Y**: on a high-`mh` map
  that **fits** vertically, `center.sy == fitCenter.sy` (boot pin; the top edge may sit *above*
  −`CLAMP_MARGIN` by the headroom — intended, not a violation); on a map **taller** than the viewport,
  large Y-pans keep bbox top ≥ −`CLAMP_MARGIN` AND bottom ≤ vh+`CLAMP_MARGIN`.
- **zoomAt:** cursor-invariant **both directions** + **at the zoom limits** (no drift at
  `zoom==1`/`fitScale`); **at a clamp boundary** (zoom-in with cursor near a corner where the
  cursor-preserving center is out of bounds) ⇒ `clamp` wins, bbox stays within viewport+`CLAMP_MARGIN`,
  **and `cam.scale === clamp(zoom·factor, fitScale, 1)`** (assert the zoom actually changed — a silent
  zoom-no-op must fail), the result center is the clamped one (cursor invariant *yields* to clamp);
  clamps to `[fitScale..1]`; asserts `factor>0`.
- **followTo + update(dt):** converges monotonically, no overshoot; **dt-independence:** one
  `update(BIG_DT)` vs N `update(dt)` summing to `BIG_DT` land `center` at ~the same point (within
  `EASE_EPSILON`); target-outside-clamp settles (no never-terminating ease) **and a subsequent
  `followTo(new target)` re-arms the ease** (settle is a per-frame `center≈target` comparison, not a
  sticky latch). `snapTo` sets center now.
- **setViewport re-fit:** on a big map zoomed out to `fitScale` (`zoom < 1`), **grow** the viewport so
  `fitScale` rises ⇒ `zoom` pulled up to the new `fitScale`, `center` re-pinned to `fitCenter`, no
  out-of-bounds reveal; a **shrink** lowers `fitScale` and leaves a valid `zoom` unchanged.
- **reframeForRotation:** the supplied `focusTile` stays centered (within rounding) across each 90° step.
- **isPan** (pure): `down→3px→up` = tap; `down→20px→up` = pan; `down→20px→back to origin→up` = pan
  (peak straight-line distance ⇒ click suppressed).
- **origin/scale ↔ tileScreen:** the focus `center` lands at viewport middle.

Existing suite stays green (no regressions); `npm run build` (tsc strict) clean.

**Browser-verify (manual, puppeteer/CDP recipe in `TASKS.md`):** battle start shows the **whole
map** (not a unit close-up) — including an **enemy-first** opening; drag pans; wheel zooms to the
cursor; follow centers on the active unit from the **second** turn and tracks movement; AI turns
follow the acting enemy (and ignore manual pan); recenter snaps (and exits boot framing if pressed on
the opening turn); the DOM menu tracks pan/zoom and **stays fully on-screen during a recenter ease
near a map edge**; rotation preserves the focused tile; clamp stops at map edges; **picking is
accurate under arbitrary pan+zoom** — on a big map (16×16, e.g. howlingSteppe/verdantRuins) and a
small one (8×8 phase1, zoom no-op + pan pinned — confirm no jitter).

---

## 8. Files touched (SP2a)

- **New:** `src/engine/camera.ts`, `tests/camera.test.ts`.
- **Modify:**
  - `src/engine/iso.ts` — export `tileScreen(x,y,z)` (= origin-less `worldToScreen`); shared by camera/scene/tests.
  - `src/engine/input.ts` — wheel (normalized), drag + exported `isPan`, held keys.
  - `src/battle/grid.ts` — `interpHeightAt(px, py)` (lifted from the renderer's private `interpHeight`).
  - `src/engine/renderer.ts` — remove `computeCamera`; refactor its `interpHeight` use to call
    `Grid.interpHeightAt`; (optionally make `BattleView.scale` required).
  - `src/scenes/battleScene.ts` — own `Camera`; boot `reset`; `onResize → setViewport`; input gating
    + wiring; follow state machine + `bootFraming`; `focusUnit`/`focusTile`/`unitCenter`; recenter;
    per-frame guarded menu re-anchor (cached-size clamp) **and remove/no-op the four superseded
    discrete `anchorMenuToActive` calls** (`refreshMenu`, `rotateView`, `undoMove`, `onResize`);
    run the camera advance at the top of `update(dt)`; use `camera.origin/scale`.
  - `src/engine/keybindings.ts` — add `recenter` to the `Action` union, `ACTIONS`, `DEFAULT_BINDINGS`
    (key `c`), and `ACTION_LABELS` ("Recenter"); dispatched in `handleKey` **above** the
    `playerInControl` guard (view op, allowed any time).
  - `src/ui/battleUI.ts` — `showRotateControl(onLeft, onRight, onRecenter)` + recenter button (update
    the existing 2-arg `showRotateControl(onLeft, onRight)` call at `battleScene.ts:310` in lockstep,
    or make `onRecenter` optional). Add a public **`placeFloatingFast(anchor)`** that re-applies the
    menu anchor and clamps using a **cached last-measured `{w,h}`** (refreshed by the full
    `placeFloating` on open / submenu / content change), integer-px rounded — the per-frame re-anchor
    path that avoids a `getBoundingClientRect` reflow.
  - `src/ui/styles.ts` — recenter button style in the `.rotate-ctl` cluster.
  - `src/scenes/battleView.ts` — minimal/none (view already carries `origin`+`scale`).

---

## 9. Build order (for the plan)

Sequenced; each step independently buildable + verifiable. `iso.ts`/`camera.ts`/`input.ts`/
`battleScene.ts` are shared/stateful, so steps go in order.

1. **`iso.tileScreen` + `camera.ts` + tests** — export `tileScreen`; build the Camera: cached
   `{viewport,map,rot,zoom,center,target}`; `reset` (boot framing) + `fitScale`/`fitCenter`
   (`FRAME_NUDGE`, boot-parity + nudge-pin tests), full-diamond bbox, `clamp` (X-crossover,
   asymmetric, tall-map-Y, zoom-at-edge), `panBy`/`zoomAt` (cursor-invariant + at-limit +
   at-clamp-boundary + clamp-in-op), `followTo`/`snapTo`/`update` (dt-correct ease + dt-independence +
   settle), `setViewport` (re-fit), `recenterFit` (center==fitCenter @ current zoom),
   `reframeForRotation`, getters. All unit-tested. No wiring.
2. **Input extension + tests** — wheel (normalized), drag + pure `isPan` (unit-tested), held keys;
   `recenter` keybinding Action.
3. **Shared elevation + scene pan/zoom** — lift `interpHeight` → `Grid.interpHeightAt` (renderer
   refactor); replace `renderer.computeCamera` with a scene `Camera`; `reset` on boot;
   `onResize → setViewport`; wire drag/wheel/keys behind `playerInControl` (keyboard camera-move
   sign); thread `camera.origin/scale` into render + picking + `projectTile`; guarded per-frame menu
   re-anchor. Remove `Renderer.computeCamera`. Browser-verify pan/zoom + picking + menu tracking +
   boot-whole-map.
4. **Follow state machine + recenter** — `focusUnit`/`unitCenter`; turn-start `snapTo` with the
   first-turn `bootFraming` exemption + ordering; AI-turn follow; player manual-suspend; recenter
   button + key (exits boot). Browser-verify follow/recenter incl. tracking a move + enemy-first boot.
5. **Rotation reframe** — `reframeForRotation` on `,`/`.` with scene-supplied `focusTile`;
   browser-verify focus preserved + clamp at edges, big and small maps.

Each step: tsc strict clean, `npm test` green, browser-verify the interactive bits, commit with a
clear message + `Co-Authored-By`.

Run mode (per `TASKS.md` / memory): ultracode + one Workflow per task (implement → adversarial-verify),
sequential; main thread re-runs gates + browser-verifies + commits between tasks.

---

## 10. Out of scope (→ later)

- **SP2b:** bigger map dimensions (re-author all 17 maps) + enemy/spawn rebalancing — the primary
  consumer of this camera.
- **SP2c:** terrain edge/transition blending (sand→grass fringe, water foam).
- Minimap, edge-scroll, touch/pinch zoom, pan inertia/momentum, follow during scripted multi-unit sequences.
