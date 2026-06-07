# SP2a — Real Camera (pan / zoom / follow) — Design

**Date:** 2026-06-06 · **Branch target:** `feat/rich-battlefield-camera` (off `feat/rich-battlefield`)
**Status:** design approved

This is **sub-project 2a** of the battlefield overhaul. SP1 (`feat/rich-battlefield`,
done) made the field visually rich at current map sizes and added an **auto-fit**
camera scale (`computeCamera → {origin, scale}`) as an explicit foundation for a
real camera. SP2a cashes that in: it replaces auto-fit with a navigable camera —
**drag-to-pan, wheel-to-zoom (zoom-to-cursor), smart-follow of the active unit** —
without changing map dimensions, balance, or rendering. SP2b (bigger maps +
rebalance) and SP2c (terrain edge-blending) are separate later cycles; SP2a is the
enabler they depend on.

---

## 1. Problem & goals

SP1's auto-fit always frames the **whole** map and shrinks tiles to fit (`scale ≤ 1`).
That keeps everything on-screen but means the +50% chunkiness is lost on bigger maps,
and there's no way to look closely or to follow the action. SP2b will enlarge maps,
which auto-fit would simply shrink further — so a real camera is the prerequisite.

Goals (settled in brainstorming):

1. **Pan** — drag the battlefield with the mouse; arrow/WASD as an alternative.
2. **Zoom** — mouse wheel, **zoom-to-cursor**, bounded `[fitScale .. 1.0]` (never
   above native +50%, so pixel-art crispness is unaffected — the same `scale ≤ 1`
   regime SP1 already handles).
3. **Smart follow** — auto-center on each newly-active unit (player **and** AI) at
   turn start and track its movement; manual pan/zoom on the player's own turn
   suspends follow until the next turn; a recenter key/button re-arms it.
4. **Zero boot regression** — the initial framing on battle start is pixel-identical
   to SP1's auto-fit (whole map, centered).

### Approach decisions (settled during brainstorming)

- **Controls:** drag-to-pan + wheel-zoom (zoom-to-cursor), keyboard pan as alt.
- **Zoom range:** bounded `[fitScale(map,rot,viewport) .. 1.0]`. On a small map that
  already fits at 1.0 (phase1 8×8), `fitScale == 1` ⇒ zoom is a no-op and pan is
  effectively pinned — correct, those maps need neither.
- **Follow:** smart-follow with manual-suspend (see §5).
- **Architecture:** a **pure `engine/camera.ts` module** (no canvas) owning the state
  + math, unit-tested in vitest (node); the scene only wires input → camera methods;
  the renderer is unchanged (it already consumes `{origin, scale}` + shake from SP1).
- **Out of scope:** minimap, edge-scroll, touch/pinch, inertia/momentum (→ later).

---

## 2. Coordinate model (the load-bearing contract)

Unchanged from SP1 and reused verbatim:

- `worldToScreen(x,y,z,origin) = ( (x−y)·W/2 + origin.sx , (x+y)·H/2 − z·Z + origin.sy )`
  (call the pre-origin part **tile-screen space**: `T(x,y,z) = ((x−y)·W/2, (x+y)·H/2 − z·Z)`).
- `render()` wraps the scene in `ctx.scale(zoom)` (composed with the shake translate
  and the DPR transform from `resize()`), so a tile lands on screen at
  **`screenPx = (T + origin) · zoom`** (CSS px; DPR aside).

The camera is parameterized by **`zoom`** and **`center`**, where `center` is the
tile-screen-space point that must sit at the viewport middle `M = (vw/2, vh/2)`:

```
origin = M / zoom − center                       // ⇒ (center + origin)·zoom = M
```

This generalizes SP1 exactly: SP1 is the special case `zoom = fitScale`,
`center = fitCenter` (the map mid-point + SP1's small vertical framing nudge).

**Operations (all pure, all in `camera.ts`):**

- `panBy(dx, dy)` — drag delta in CSS px. Content should move 1:1 under the cursor,
  i.e. `origin += (dx,dy)/zoom`, so **`center −= (dx,dy)/zoom`**.
- `zoomAt(factor, cursor)` — the world point under the cursor stays fixed.
  Pre-zoom that point is `U = (cursor − M)/zoom + center`. With
  `zoom' = clamp(zoom·factor, fitScale, 1)`, set
  **`center' = center + (cursor − M)·(1/zoom − 1/zoom')`** (leaves `U` invariant).
- `clamp(map, rot, viewport)` — constrain `center` so the rotated map's tile-screen
  bounding box stays within the viewport **+ a margin** (you can't pan the map fully
  off-screen). Degenerate when the map is smaller than the viewport at the current
  zoom (small maps / zoomed out): center is pinned to `fitCenter`.
- `followTo(target)` — `target` is a **tile-screen-space point** (a `center` value),
  which the scene derives from a unit's current animated tile position via `T(x,y,z)`.
  Sets an eased target; `update(dt)` lerps `center` (and, only when a recenter
  explicitly requests it, `zoom`) toward it with a fixed smoothing factor, snapping
  when within an epsilon.
- Getters: **`origin`**, **`scale`** (= `zoom`) — exactly what `render()`,
  `screenToTile`, and `projectTile` already accept from SP1.
- Helpers: **`fitScale(map, rot, viewport)`** and **`fitCenter(map, rot, viewport)`** —
  the math currently in `Renderer.computeCamera`, moved here. `fitScale` is the
  zoom-out bound; `fitCenter` is the default/boot center and the clamp anchor.

---

## 3. Input extension (`engine/input.ts`)

Today `Input` exposes only `pointer` (position), `onLeftClick`, `onRightClick`,
`onKey`. It needs three additions, kept inside `Input` so the scene stays thin:

- **Wheel:** a `wheel` listener (passive:false, `preventDefault` to stop page
  scroll) → `onWheel(deltaY, x, y)`.
- **Drag + click disambiguation:** replace reliance on the native `click` event with
  `mousedown`/`mousemove`/`mouseup`. On `mousedown` record the origin; while the
  button is held, emit drag deltas via `onDrag(dx, dy)`; on `mouseup`, if total
  movement `< DRAG_THRESHOLD` (≈5 px) treat it as a tap → fire `onLeftClick(x,y)`
  exactly as today, otherwise it was a pan and the click is suppressed. This resolves
  the pan-vs-select conflict **inside the input layer**, so picking logic is untouched.
- **Held keys:** track `keysDown: Set<string>` (add on keydown, remove on keyup,
  clear on blur/leave) for smooth per-frame keyboard pan. The discrete `onKey` path
  stays for rotation (`,`/`.`), cancel, and recenter (`c`).

`reset()` / `dispose()` extended to register/clear the new handlers and state.

---

## 4. Camera module shape

`engine/camera.ts` exports a `Camera` class (or a pure state + functions — impl
choice, but the public surface is the ops in §2):

```ts
class Camera {
  constructor(viewport: { w: number; h: number });
  // framing
  reset(map, rot): void;                 // center = fitCenter, zoom = fitScale (boot)
  setViewport(w, h): void;               // on resize; re-clamp
  // input-driven (manual)
  panBy(dx, dy): void;                   // suspends follow (caller decides)
  zoomAt(factor, cursorX, cursorY): void;
  // follow
  followTo(target: ScreenPoint): void;   // eased target in tile-screen space (a center value)
  update(dt): void;                      // ease toward target, then clamp
  // rotation
  reframeForRotation(map, fromRot, toRot): void; // keep focused tile centered
  // outputs
  get origin(): ScreenPoint;
  get scale(): number;
}
```

`Camera` depends only on `iso.ts` constants/`worldToScreen` (pure); it imports no
canvas/DOM. `reframeForRotation` recomputes `fitScale` for the new rotation and maps
the currently-centered tile to the new rotation's tile-screen point so the focus is
preserved across a 90° turn, then clamps.

---

## 5. Scene wiring + follow state machine (`battleScene.ts`)

The scene owns one `Camera`, wires input to it, and reads `camera.origin/scale` for
**render, picking, and the DOM menu anchor** (all already scale+origin aware from SP1):

- `input.onDrag(dx,dy)` → `camera.panBy(dx,dy)`; set `followSuspended = true` (player
  turn only).
- `input.onWheel(dy,x,y)` → `camera.zoomAt(dy < 0 ? zoomInStep : zoomOutStep, x, y)`;
  `followSuspended = true` (player turn only).
- held arrows/WASD → per-frame `camera.panBy(±step, ±step)`; `followSuspended = true`.
- `onKey('c')` / recenter button → `followTo(activeUnit)` immediately and clear
  `followSuspended`.
- `onKey(',' | '.')` → existing rotation, then `camera.reframeForRotation(...)`.

**Follow state machine** (evaluated in the scene's per-frame update):

| Situation | Behavior |
|-----------|----------|
| New unit becomes active (player or AI), turn start | `followTo(unit)`, `followSuspended = false` |
| AI turn, unit acting/moving | always `followTo(actingUnit)` each frame (player isn't planning) |
| Player turn, `followSuspended == false` | `followTo(activeUnit)` each frame (tracks its move animation) |
| Player turn, `followSuspended == true` | no auto-follow; camera stays put |
| Every frame | `camera.update(dt)` (ease + clamp) |

`followTo` targets the unit's **current animated** position (same source the renderer
uses for the unit sprite), so the camera tracks movement smoothly.

**On-screen UI:** add a **recenter button** (e.g. `⊙`) to the existing `.rotate-ctl`
cluster for discoverability; keyboard `c` is the primary. Zoom is wheel-only (no +/−
buttons in SP2a — wheel suffices; can add later).

**DOM action menu:** it anchors via `projectTile` (already origin+scale aware). The
only change: re-anchor it **every frame while open** (today it recomputes on
selection), so it tracks live pan/zoom/follow. Cheap (one `projectTile` + style write).

---

## 6. Integration & removals

- **`Renderer.computeCamera` is removed** — its only caller is `battleScene`, which now
  uses `Camera`. The fit math moves to `camera.ts` (`fitScale`/`fitCenter`). `render()`,
  `screenToTile`, `projectTile`, and `BattleView.scale` are **unchanged** (SP1 already
  threads `{origin, scale}`).
- **Picking:** `screenToTile(px, py, grid, camera.origin, rot, camera.scale)` — no
  change to `iso.ts`.
- **Screen-shake** still composes (shake translate then `ctx.scale(zoom)` in `render()`).
- **`resetTileCache`** and the bake cache are untouched (terrain/props are static; the
  camera only changes origin/scale, which never invalidates a bake).
- **Rotation** (`reframeForRotation`) keeps the focused tile centered and re-fits.

---

## 7. Testing

`tests/camera.test.ts` (vitest, node — `camera.ts` is pure, no canvas):

- **Boot parity:** `fitScale`/`fitCenter` reproduce SP1's `computeCamera` output for a
  range of map sizes + all 4 rotations (so battle-start framing is pixel-identical).
- **panBy:** moves `center` by exactly `−d/zoom`; round-trips with `origin`.
- **clamp:** after large pans, the rotated map bbox never leaves viewport+margin; small
  map / zoomed-out pins `center` to `fitCenter`.
- **zoomAt:** the tile-screen point under the cursor is invariant across a zoom
  (the defining property); `zoom` clamps to `[fitScale .. 1]`; zoom-to-cursor at
  viewport center reduces to a pure scale change.
- **followTo + update(dt):** `center` converges monotonically to the target and snaps
  within epsilon; never overshoots.
- **reframeForRotation:** the centered tile stays centered (within rounding) across
  each 90° step.
- **origin/scale ↔ worldToScreen:** the focus `center` lands at viewport middle.

Full suite (currently **1362**) stays green; `npm run build` (tsc strict) clean.

**Browser-verify (manual, puppeteer/CDP recipe in `TASKS.md`):**
drag pans; wheel zooms to the cursor; follow centers on the active unit at turn start
and tracks movement; AI turns follow the acting enemy; `c`/button recenters; the DOM
action menu tracks pan/zoom; rotation preserves the focused tile; clamp stops at map
edges; **picking is accurate under arbitrary pan+zoom**; verified on a big map
(16×16, e.g. howlingSteppe/verdantRuins) and a small one (8×8 phase1, where zoom is a
no-op and pan is pinned — confirm no jitter).

---

## 8. Files touched (SP2a)

- **New:** `src/engine/camera.ts`, `tests/camera.test.ts`.
- **Modify:** `src/engine/input.ts` (wheel + drag/click disambiguation + held keys);
  `src/scenes/battleScene.ts` (own `Camera`, wire input, follow state machine, recenter
  button, per-frame menu re-anchor, use `camera.origin/scale`); `src/engine/renderer.ts`
  (remove `computeCamera`); `src/scenes/battleView.ts` (minimal/none — view already
  carries `origin`+`scale`).

---

## 9. Build order (for the plan)

Sequenced so each step is independently buildable + verifiable. `battleScene.ts`,
`input.ts`, and `camera.ts` are the shared/stateful files; steps go in order.

1. **`camera.ts` + tests** — pure module: state, `fitScale`/`fitCenter` (ported from
   `computeCamera`, with boot-parity test), `panBy`, `zoomAt`, `clamp`, `followTo`/
   `update`, `reframeForRotation`, getters. All unit-tested. No wiring yet.
2. **Input extension + tests where pure** — wheel, drag/click disambiguation, held
   keys; unit-test the click-vs-drag threshold logic if extractable, else browser-verify.
3. **Scene wiring: pan + zoom** — replace `renderer.computeCamera` usage with a scene
   `Camera`; wire drag/wheel/keys; thread `camera.origin/scale` into render + picking +
   `projectTile`; per-frame menu re-anchor. Remove `Renderer.computeCamera`. Browser-
   verify pan/zoom + picking + menu tracking; boot framing unchanged.
4. **Follow state machine + recenter** — turn-start centering, AI-turn follow, player
   manual-suspend, `c`/button recenter. Browser-verify follow + recenter.
5. **Rotation reframe** — `reframeForRotation` on `,`/`.`; browser-verify focus
   preserved + clamp at edges, on big and small maps.

Each step: tsc strict clean, `npm test` green, browser-verify the interactive bits,
commit with a clear message + `Co-Authored-By`.

Run mode (per `TASKS.md` / memory): ultracode + one Workflow per task
(implement → adversarial-verify), sequential; main thread re-runs gates +
browser-verifies + commits between tasks.

---

## 10. Out of scope (→ later)

- **SP2b:** bigger map dimensions (re-author all 17 maps) + enemy/spawn rebalancing —
  the primary consumer of this camera.
- **SP2c:** terrain edge/transition blending (sand→grass fringe, water foam).
- Minimap, edge-scroll, touch/pinch zoom, pan inertia/momentum, follow during scripted
  multi-unit sequences.
