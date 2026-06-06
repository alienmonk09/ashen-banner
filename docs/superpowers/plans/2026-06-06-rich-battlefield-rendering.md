# Rich Battlefield Rendering (SP1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the battlefield visually rich at current map sizes — textured procedural terrain, a `SpriteDef` prop layer (vegetation/rocks/walls), +50% bigger tiles with auto-fit, and a per-tile bake cache — with one opt-in LOS hook for tall props and no other gameplay change.

**Architecture:** Terrain stays procedural (free at any height/rotation/scale). Per-terrain "motif" drawing replaces the 3-pixel speckle. Props are code pixel-art (`SpriteDef`), placed procedurally (cosmetic) + hand-authored (structural, can block), and baked into each tile's cached canvas so they ride the existing depth-sorted pass (correct occlusion, like the chest). Bigger tiles plus an auto-fit camera scale keep maps on-screen; real pan/zoom is SP2.

**Tech Stack:** TypeScript (strict), HTML5 Canvas 2D, Vite, Vitest (node env — **no canvas in tests**, so rendering is verified by in-engine screenshots; pure logic is unit-tested). No art assets.

**Spec:** `docs/superpowers/specs/2026-06-06-rich-battlefield-rendering-design.md`

**Conventions for every task:**
- Type check: `npx tsc --noEmit` (must be clean).
- Tests: `npx vitest run tests/<file>` (single) / `npm test` (full suite, currently **1333** passing — keep green).
- Build before a task's final commit: `npm run build`.
- **Browser-verify** = run the app and screenshot via the puppeteer-core recipe in `TASKS.md` (drives system Edge/Brave; vitest can't render canvas). Do this for every step marked *(screenshot)*.
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

**Shared type contracts (defined once, referenced by later tasks):**
- `Renderer.computeCamera(grid, rot): { origin: ScreenPoint; scale: number }` — Task 1.
- `screenToTile(px, py, grid, origin, rot=0, scale=1)` — Task 1.
- `BattleView.scale?: number` — Task 1.
- `Grid.maxHeight(): number` — Task 1.
- `PropDef`, `PlacedProp`, `PROPS` catalog, `scatterProps(map, grid): PlacedProp[]` — Task 4.
- `MapDef.decor?: { pos: Point; propId: string }[]` — Task 5.
- `Grid.sightBlockAt(x, y): number` — Task 5.
- `BattleView.props?: PlacedProp[]` — Task 4.

---

## Task 1: Bigger tiles + auto-fit camera

**Files:**
- Modify: `src/engine/iso.ts` (constants + `screenToTile` scale param)
- Modify: `src/battle/grid.ts` (`maxHeight`)
- Modify: `src/engine/renderer.ts` (`computeCamera`, `render()` scale, re-tuned offsets, `BattleView.scale`)
- Modify: `src/scenes/battleScene.ts` (camera getter, `projectTile` scale, picking, render call)
- Modify: `src/scenes/battleView.ts` (`buildView` passes scale)
- Test: `tests/iso.test.ts`, `tests/grid.test.ts`

- [ ] **Step 1: Bump tile constants**

`src/engine/iso.ts` lines 5-7:

```ts
export const TILE_W = 96;
export const TILE_H = 48;
export const TILE_Z = 24;
```

- [ ] **Step 2: Run the suite to see what the size change moves**

Run: `npm test`
Expected: `iso.test.ts` still PASSES (its assertions use `worldToScreen`/`screenToTile` symmetrically, so they're size-agnostic). If anything fails, it pins a hard-coded pixel literal — note it; do not "fix" by reverting constants.

- [ ] **Step 3: Write the failing test for `Grid.maxHeight`**

Add to `tests/grid.test.ts` (inside the top-level `describe` or a new one):

```ts
import { Grid } from "../src/battle/grid";
import type { MapDef } from "../src/core/types";

function gridOf(heights: number[][]): Grid {
  const map: MapDef = {
    id: "h", name: "h", intro: "",
    width: heights[0].length, height: heights.length,
    heights, playerSpawns: [], enemies: [],
  };
  return new Grid(map);
}

describe("Grid.maxHeight", () => {
  it("returns the tallest tile height", () => {
    expect(gridOf([[0, 1, 2], [3, 0, 1]]).maxHeight()).toBe(3);
  });
  it("is 0 for an all-flat grid", () => {
    expect(gridOf([[0, 0], [0, 0]]).maxHeight()).toBe(0);
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npx vitest run tests/grid.test.ts`
Expected: FAIL — `grid.maxHeight is not a function`.

- [ ] **Step 5: Implement `maxHeight`**

In `src/battle/grid.ts`, add a field and compute it in the constructor (after `this.heights = map.heights;`):

```ts
  private readonly _maxHeight: number;
```

In the constructor body (end), add:

```ts
    let mx = 0;
    for (const row of this.heights) for (const z of row) if (z > mx) mx = z;
    this._maxHeight = mx;
```

And the accessor (next to `heightAt`):

```ts
  /** Tallest tile height on the map (for camera fit). Computed once. */
  maxHeight(): number {
    return this._maxHeight;
  }
```

- [ ] **Step 6: Run it to verify it passes**

Run: `npx vitest run tests/grid.test.ts`
Expected: PASS.

- [ ] **Step 7: Add the `scale` param to `screenToTile`**

`src/engine/iso.ts` `screenToTile` signature + first lines:

```ts
export function screenToTile(
  px: number,
  py: number,
  grid: Grid,
  origin: ScreenPoint,
  rot: Rotation = 0,
  scale = 1,
): Point | null {
  // Pointer arrives in CSS px; the scene draws under ctx.scale(scale), so invert
  // it back into the unscaled tile space the diamond test operates in.
  px /= scale;
  py /= scale;
  let best: Point | null = null;
  // ...unchanged body...
```

- [ ] **Step 8: Write the failing test for scale-aware picking**

Add to `tests/iso.test.ts` inside `describe("screenToTile round-trips through rotation", ...)`:

```ts
  it("round-trips when the scene is drawn at a fit scale < 1", () => {
    const grid = flatGrid(4, 3);
    const origin = { sx: 137, sy: 91 };
    const scale = 0.5;
    for (const rot of ROTS) {
      for (let y = 0; y < grid.height; y++) {
        for (let x = 0; x < grid.width; x++) {
          const v = rotateTile(x, y, rot, grid.width, grid.height);
          const c = worldToScreen(v.x, v.y, 0, origin); // unscaled tile-space center
          const picked = screenToTile(c.sx * scale, c.sy * scale, grid, origin, rot, scale);
          expect(picked).toEqual({ x, y });
        }
      }
    }
  });
```

- [ ] **Step 9: Run it to verify it passes**

Run: `npx vitest run tests/iso.test.ts`
Expected: PASS (the `px/=scale` from Step 7 makes it green). If it fails, the inverse is wrong.

- [ ] **Step 10: Add `BattleView.scale` and apply it in `render()`**

In `src/engine/renderer.ts`, add to the `BattleView` interface (near `screenShake`):

```ts
  /** Uniform fit-to-viewport scale applied to the whole scene (1 = no scaling). */
  scale?: number;
```

Replace `render()` (lines ~205-219) with:

```ts
  render(view: BattleView): void {
    this.clear();
    const shake = view.screenShake;
    const scale = view.scale ?? 1;
    const transformed = !!shake || scale !== 1;
    if (transformed) {
      this.ctx.save();
      if (shake) this.ctx.translate(shake.dx, shake.dy);
      if (scale !== 1) this.ctx.scale(scale, scale);
    }
    this.drawScene(view);
    this.drawEffects(view);
    this.drawPopups(view);
    this.drawForecast(view);
    if (transformed) this.ctx.restore();
  }
```

- [ ] **Step 11: Replace `computeOrigin` with `computeCamera`**

In `src/engine/renderer.ts`, replace `computeOrigin` (lines ~167-173) with:

```ts
  /** Center the camera and pick a uniform scale so the whole (rotated) map fits
   *  the viewport. Scale never exceeds 1 (tiles render at most at their native
   *  +50% size); it shrinks only enough to fit. Origin is in unscaled tile space;
   *  render() applies the scale. SP2 replaces this with pan/zoom/follow. */
  computeCamera(grid: Grid, rot: Rotation = 0): { origin: ScreenPoint; scale: number } {
    const dims = rotatedDims(rot, grid.width, grid.height);
    const pxW = (dims.w + dims.h) * (TILE_W / 2);
    const pxH = (dims.w + dims.h) * (TILE_H / 2) + grid.maxHeight() * TILE_Z;
    const scale = Math.min(1, (this.width * 0.98) / pxW, (this.height * 0.94) / pxH);
    const midX = (dims.w - 1) / 2;
    const midY = (dims.h - 1) / 2;
    const mid = worldToScreen(midX, midY, 0, { sx: 0, sy: 0 });
    const origin: ScreenPoint = {
      sx: this.width / 2 / scale - mid.sx,
      sy: this.height / 2 / scale - mid.sy - 40,
    };
    return { origin, scale };
  }
```

- [ ] **Step 12: Thread the camera through `battleScene.ts`**

In `src/scenes/battleScene.ts`, replace the `origin` getter (lines ~203-205) with a `camera` getter:

```ts
  private get camera(): { origin: ScreenPoint; scale: number } {
    return this.ctx.renderer.computeCamera(this.grid, this.rot);
  }
```

Replace `projectTile` (lines ~207-211) so it returns CSS-px coords (scaled), which the DOM menu anchor needs:

```ts
  /** Project a logical tile to its on-screen (CSS px) center under the current
   *  rotation + fit scale. */
  private projectTile(x: number, y: number, z: number): ScreenPoint {
    const { origin, scale } = this.camera;
    const v = rotateTile(x, y, this.rot, this.grid.width, this.grid.height);
    const p = worldToScreen(v.x, v.y, z, origin);
    return { sx: p.sx * scale, sy: p.sy * scale };
  }
```

Update the click picker (line ~637):

```ts
    const cam = this.camera;
    const tile = screenToTile(px, py, this.grid, cam.origin, this.rot, cam.scale);
```

Update the per-frame hover + render block (lines ~1485-1499):

```ts
    const cam = this.camera;
    if (this.ctx.input.pointer && this.phase !== "over" && this.phase !== "intro") {
      this.hoverTile = screenToTile(this.ctx.input.pointer.x, this.ctx.input.pointer.y, this.grid, cam.origin, this.rot, cam.scale);
    } else {
      this.hoverTile = null;
    }
```
...and the final render line:

```ts
    this.ctx.renderer.render(buildView(this, cam.origin, cam.scale));
```

- [ ] **Step 13: Update `buildView` to accept + set scale**

In `src/scenes/battleView.ts`, change the signature (line 75) and the returned object (add `scale`):

```ts
export function buildView(scene: BattleScene, origin: ScreenPoint, scale: number): BattleView {
```

In the returned object (after `origin,` on line ~110):

```ts
    origin,
    scale,
```

- [ ] **Step 14: Type-check the wiring**

Run: `npx tsc --noEmit`
Expected: clean. (Catches any missed `computeOrigin` caller or arg mismatch.)

- [ ] **Step 15: Re-tune tile-relative pixel offsets in the renderer**

Bigger tiles need bigger characters/UI to keep proportion. In `src/engine/renderer.ts`:

- Line 22: `const CHAR_PX_H = 90;` (was 60).
- `drawUnit` `feetY` (line ~506): `const feetY = center.sy + 6;` (was +4).
- Shadow + ring centers `center.sy + 2` (lines ~512, ~527, ~532): change the `+ 2` to `+ 3`.
- HP bar (lines ~547-554): `const barW = 42;` (was 28); `const barY = topY - 10;` (was -8).
- Status pips (lines ~558-563): `const pipW = 13;` (was 9); `const py = barY - 15;` (was -11); font `"bold 11px system-ui"` (was 8px).
- Active arrow (lines ~580-587): `topY - 14` and `topY - 26` (were -10/-18); width `±9` (was ±6).
- `drawEffects` vertical offset (line ~251): `center.sy - 39` (was -26).
- `drawForecast` (line ~228): `center.sy - 96` (was -64).
- `drawPopups` (line ~599): `const yOff = -60 - t * 36;` (was `-40 - t*24`).
- `drawChest` already uses `TILE_W`/`TILE_H` ratios — leave it.

These are starting values (~×1.5); final values are set by eye in the next step.

- [ ] **Step 16: Browser-verify proportions *(screenshot)***

Build + run, load an early map (phase1) and a big one (verdantRuins).
Run: `npm run build` then the puppeteer-core recipe from `TASKS.md`.
Expected: phase1 renders chunky (full +50%), verdantRuins auto-shrinks to fit with no clipping; characters/HP-bars/pips look proportional; clicking a tile selects the correct tile (picking accurate under scale); the floating action menu sits over the active unit; camera rotation (Q/E or the rotate control) keeps the map centered. Tune the Step-15 literals if anything looks off.

- [ ] **Step 17: Full suite + commit**

Run: `npm test` (expect 1333+ green) and `npm run build` (clean).

```bash
git add src/engine/iso.ts src/battle/grid.ts src/engine/renderer.ts src/scenes/battleScene.ts src/scenes/battleView.ts tests/iso.test.ts tests/grid.test.ts
git commit -m "feat(render): +50% tiles + auto-fit camera scale

Bump TILE_W/H/Z by 50%; add Renderer.computeCamera (origin + fit-to-
viewport scale), scale-aware screenToTile picking, scaled projectTile for
the DOM menu anchor, and BattleView.scale applied in render(). Re-tune
character + UI pixel offsets to the larger tiles. Foundation for SP2 pan/zoom.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Per-terrain motifs

Replaces the 3-pixel speckle with a per-terrain texture routine. Pure rendering — verified by screenshot (no canvas in vitest). Keep height shading, grid line, sunlit rim, cliff walls.

**Files:**
- Modify: `src/engine/renderer.ts`

- [ ] **Step 1: Add the motif dispatcher, replacing the speckle block**

In `src/engine/renderer.ts`, in `drawTileTop`, delete the speckle loop (lines ~462-470, the `const seed = ...` block through its `for` loop) and call a new method in its place, passing `view.time` (thread `time` into `drawTileTop` — add a `time: number` param to `drawTileTop` and pass it from the `drawScene` tile branch where `drawTileTop` is called, line ~322):

```ts
    this.terrainMotif(center, terrain, tx, ty, lit, time);
```

- [ ] **Step 2: Implement `terrainMotif` + per-terrain helpers**

Add to `Renderer` (private methods). Deterministic via the existing tile hash; only water/lava/spring read `time`.

```ts
  /** Deterministic 0..1 hash for tile (tx,ty) at channel `i`. */
  private tileHash(tx: number, ty: number, i: number): number {
    let h = (((tx * 73856093) ^ (ty * 19349663) ^ (i * 83492791)) >>> 0);
    h = (h ^ (h >>> 13)) >>> 0;
    return (h % 1000) / 1000;
  }

  private dot(cx: number, cy: number, st: { h: number; s: number }, l: number, sz = 2): void {
    this.ctx.fillStyle = `hsl(${st.h}, ${st.s}%, ${clampL(l)}%)`;
    this.ctx.fillRect(Math.round(cx), Math.round(cy), sz, sz);
  }

  /** Per-terrain texture drawn within the tile diamond (replaces the speckle). */
  private terrainMotif(center: ScreenPoint, terrain: TerrainType, tx: number, ty: number, lit: number, time: number): void {
    const st = TERRAIN[terrain];
    const cx = center.sx;
    const cy = center.sy;
    // Random points stay inside the diamond: |dx|/HW + |dy|/HH <= ~0.7.
    const HW = TILE_W * 0.32;
    const HH = TILE_H * 0.32;
    const p = (i: number) => {
      const a = this.tileHash(tx, ty, i) * 2 - 1;
      const b = this.tileHash(tx, ty, i + 50) * 2 - 1;
      // contract toward center so points land on the tile, not the edge
      return { x: cx + a * HW * (1 - Math.abs(b) * 0.5), y: cy + b * HH * (1 - Math.abs(a) * 0.5) };
    };
    switch (terrain) {
      case "grass": {
        for (let i = 0; i < 5; i++) {
          const q = p(i);
          this.ctx.fillStyle = `hsl(${st.h}, ${st.s + 8}%, ${clampL(lit + (i % 2 ? 10 : -8))}%)`;
          this.ctx.fillRect(Math.round(q.x), Math.round(q.y), 1, 2 + (i % 2)); // blade tick
        }
        if (this.tileHash(tx, ty, 7) > 0.82) { const q = p(9); this.dot(q.x, q.y, { h: 48, s: 70 }, 70); } // flower
        break;
      }
      case "dirt": {
        for (let i = 0; i < 4; i++) { const q = p(i); this.dot(q.x, q.y, st, lit + (i % 2 ? 8 : -10)); }
        const c = p(6); this.ctx.strokeStyle = `hsl(${st.h}, ${st.s}%, ${clampL(lit - 12)}%)`;
        this.ctx.lineWidth = 1; this.ctx.beginPath(); this.ctx.moveTo(c.x, c.y); this.ctx.lineTo(c.x + 4, c.y + 2); this.ctx.stroke();
        break;
      }
      case "rock": {
        for (let i = 0; i < 3; i++) {
          const a = p(i), b = p(i + 20);
          this.ctx.strokeStyle = `hsl(${st.h}, ${st.s}%, ${clampL(lit + (i % 2 ? 12 : -16))}%)`;
          this.ctx.lineWidth = 1; this.ctx.beginPath(); this.ctx.moveTo(a.x, a.y); this.ctx.lineTo(b.x, b.y); this.ctx.stroke();
        }
        break;
      }
      case "sand": {
        for (let i = 0; i < 3; i++) {
          const q = p(i); this.ctx.strokeStyle = `hsl(${st.h}, ${st.s}%, ${clampL(lit - 8)}%)`;
          this.ctx.lineWidth = 1; this.ctx.beginPath(); this.ctx.moveTo(q.x - 4, q.y); this.ctx.lineTo(q.x + 4, q.y + 1); this.ctx.stroke();
        }
        break;
      }
      case "wood": {
        for (let i = -1; i <= 1; i++) {
          this.ctx.strokeStyle = `hsl(${st.h}, ${st.s}%, ${clampL(lit - 12)}%)`;
          this.ctx.lineWidth = 1; this.ctx.beginPath();
          this.ctx.moveTo(cx - HW, cy + i * HH * 0.5); this.ctx.lineTo(cx + HW, cy + i * HH * 0.5); this.ctx.stroke();
        }
        break;
      }
      case "water":
      case "spring": {
        const drift = Math.sin(time * 1.6 + (tx + ty)) * 3;
        for (let i = -1; i <= 1; i++) {
          this.ctx.strokeStyle = `hsla(${st.h}, ${st.s}%, ${clampL(lit + 18)}%, 0.5)`;
          this.ctx.lineWidth = 1; this.ctx.beginPath();
          this.ctx.moveTo(cx - HW * 0.7 + drift, cy + i * HH * 0.45);
          this.ctx.lineTo(cx + HW * 0.7 + drift, cy + i * HH * 0.45); this.ctx.stroke();
        }
        if (this.tileHash(tx, ty, 3) > 0.6) { const q = p(4); this.dot(q.x, q.y, st, lit + 28, 1); }
        break;
      }
      case "lava": {
        const pulse = 0.5 + 0.5 * Math.sin(time * 3 + (tx * 2 + ty));
        for (let i = 0; i < 2; i++) {
          const a = p(i), b = p(i + 30);
          this.ctx.strokeStyle = `hsla(40, 100%, ${clampL(60 + pulse * 20)}%, ${0.6 + pulse * 0.3})`;
          this.ctx.lineWidth = 1.5; this.ctx.beginPath(); this.ctx.moveTo(a.x, a.y); this.ctx.lineTo(b.x, b.y); this.ctx.stroke();
        }
        break;
      }
      case "mire": {
        for (let i = 0; i < 4; i++) { const q = p(i); this.dot(q.x, q.y, st, lit + (i % 2 ? 6 : -10)); }
        if (this.tileHash(tx, ty, 5) > 0.7) { const q = p(8); this.dot(q.x, q.y, st, lit + 16, 1); }
        break;
      }
    }
  }
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Browser-verify each terrain *(screenshot)***

Run: `npm run build` + puppeteer recipe. Load maps that exercise each terrain (verdantRuins has grass/water/spring/wood/mire; an ember/lava map for lava; a sand/rock map for those). Confirm: water/lava/spring shimmer animates; static terrains have stable texture; nothing bleeds outside tile diamonds; performance steady. Tweak counts/shades to taste.

- [ ] **Step 5: Commit**

```bash
git add src/engine/renderer.ts
git commit -m "feat(render): per-terrain texture motifs (replace speckle)

Per-terrain drawing — grass blades/flowers, dirt clods, rock facets, sand
ripples, wood planks, animated water/spring shimmer + lava veins, mire
bubbles — driven by the deterministic tile hash; water/lava/spring read time.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Per-tile bake cache

Bake each tile's static art (walls + textured top + baked-in props) to an offscreen canvas keyed by appearance; blit it in the depth-sorted pass instead of redrawing. Preserves the front-tile-occludes-unit ordering. Animated terrain (water/lava/spring) stays live. (Props are added to the bake in Task 4 — here the cache covers terrain only.)

**Files:**
- Modify: `src/engine/renderer.ts`

- [ ] **Step 1: Add the cache + a per-tile bake method**

In `src/engine/renderer.ts`, add a field to the `Renderer` class:

```ts
  /** Cache of baked static tile art, keyed by appearance (terrain|z|ao|prop). */
  private tileBakes = new Map<string, HTMLCanvasElement>();
```

Add a helper that knows which terrains animate (never cached):

```ts
  private static readonly ANIMATED: ReadonlySet<TerrainType> = new Set(["water", "spring", "lava"]);
```

Add the bake method. It draws walls + top + motif into a local offscreen canvas whose origin is placed so the tile-top center sits at a fixed anchor `(AX, AY)`; the blit later subtracts that anchor.

```ts
  /** Bake the static art for one tile (walls + textured top) to an offscreen
   *  canvas. The tile-top center is anchored at (anchorX, anchorY) within the
   *  canvas so the caller can blit by subtracting that anchor from screen center. */
  private bakeTile(terrain: TerrainType, z: number, ao: number): { canvas: HTMLCanvasElement; ax: number; ay: number } {
    const key = `${terrain}|${z}|${ao}`;
    const wallH = z * TILE_Z;
    const ax = TILE_W / 2 + 2;
    const ay = TILE_H / 2 + 2;
    const cached = this.tileBakes.get(key);
    if (cached) return { canvas: cached, ax, ay };
    const canvas = document.createElement("canvas");
    canvas.width = TILE_W + 4;
    canvas.height = TILE_H + wallH + 4;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      const saved = this.ctxOverride;
      this.ctxOverride = ctx;
      const center: ScreenPoint = { sx: ax, sy: ay };
      this.drawTileWalls(center, z, terrain);
      this.drawTileTop(center, z, terrain, 0, 0, ao, 0); // tx,ty=0 → stable bake texture; time=0
      this.ctxOverride = saved;
    }
    this.tileBakes.set(key, canvas);
    return { canvas, ax, ay };
  }
```

- [ ] **Step 2: Route renderer drawing through an overridable context**

The bake reuses `drawTileWalls`/`drawTileTop`, which currently hard-reference `this.ctx`. Add an override slot and a getter, and replace `this.ctx` **inside `drawTileWalls`, `drawTileTop`, `terrainMotif`, `dot`** with `this.cx`.

Add the field + getter:

```ts
  private ctxOverride: CanvasRenderingContext2D | null = null;
  /** The context current drawing should target (an offscreen bake or the screen).
   *  Named drawCtx (not cx) to avoid colliding with the cx/cy coord locals. */
  private get drawCtx(): CanvasRenderingContext2D {
    return this.ctxOverride ?? this.ctx;
  }
```

For each of `drawTileWalls`, `drawTileTop`, `terrainMotif`, and `dot`: add `const ctx = this.drawCtx;` at the top (replacing an existing `const ctx = this.ctx;` if present), then replace every remaining `this.ctx` inside that method with `ctx`. Do **not** change `paintDiamond`, `drawUnit`, `drawChest`, effects/popups — those always draw to screen.

> Note: per-tile texture uses fixed `tx=ty=0` inside the bake, so every tile of the same `terrain|z|ao` shares one bake (motif is identical). This trades per-tile texture variety for cache reuse — acceptable and the variety still reads via `ao`/`z` shading. (If more variety is wanted later, widen the key with a small `tx,ty`-derived bucket.)

- [ ] **Step 3: Blit cached tiles in `drawScene`; keep animated terrain live**

In `src/engine/renderer.ts` `drawScene`, replace the tile branch (lines ~317-324) with:

```ts
      if (it.kind === "tile") {
        const z = grid.heightAt(it.x, it.y);
        const center = this.project(view, it.x, it.y, z);
        const terrain = grid.terrainAt(it.x, it.y);
        const ao = this.neighborShade(grid, it.x, it.y, z);
        if (Renderer.ANIMATED.has(terrain)) {
          // Animated terrain can't be cached — draw live each frame.
          this.drawTileWalls(center, z, terrain);
          this.drawTileTop(center, z, terrain, it.x, it.y, ao, view.time);
        } else {
          const { canvas, ax, ay } = this.bakeTile(terrain, z, ao);
          this.ctx.drawImage(canvas, Math.round(center.sx - ax), Math.round(center.sy - ay));
        }
        const cols = overlays.get(`${it.x},${it.y}`);
        if (cols) for (const c of cols) this.paintDiamond(center, c);
      } else if (it.kind === "chest") {
```

`drawTileTop` already takes `(center, z, terrain, tx, ty, ao, time)` from Task 2. The live branch above passes `view.time`; the bake (`bakeTile`) passes `time=0`. No signature change needed here.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Browser-verify cache correctness *(screenshot)***

Run: `npm run build` + puppeteer recipe on verdantRuins (mixed heights + water/spring).
Expected: identical look to Task 2 (static tiles via blit, water/spring still shimmer live); a tall tile in front of a unit still overdraws the unit's lower body (occlusion preserved); rotating the camera looks correct (one bake serves all rotations); framerate steady or better. New battle → fresh cache (no stale tiles when switching maps — the `Renderer` instance persists, so **clear the cache on map load**: see next step).

- [ ] **Step 6: Clear the bake cache when a battle starts**

The `Renderer` is reused across battles, so a new map must not reuse the prior map's bakes (heights/terrain differ). Add a public method:

```ts
  /** Drop cached tile bakes (call when a new battle/map loads). */
  resetTileCache(): void {
    this.tileBakes.clear();
  }
```

Call it once when a battle scene initializes. In `src/scenes/battleScene.ts`, find the scene `enter()`/constructor where `this.grid` is built (search for `new Grid(`), and immediately after, add:

```ts
    this.ctx.renderer.resetTileCache();
```

- [ ] **Step 7: Type-check, full suite, commit**

Run: `npx tsc --noEmit`, `npm test` (1333+ green), `npm run build`.

```bash
git add src/engine/renderer.ts src/scenes/battleScene.ts
git commit -m "perf(render): per-tile bake cache + interleaved blit

Bake static tile art (walls + textured top) to an offscreen canvas keyed by
terrain|z|ao and blit it in the depth-sorted pass; animated water/spring/lava
draw live. Preserves front-tile-occludes-unit ordering; one bake serves all
rotations. Cache cleared on battle start.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Prop data model + catalog + procedural scatter

**Files:**
- Create: `src/data/sprites/props.ts` (prop `SpriteDef`s)
- Create: `src/data/props.ts` (`PropDef`, `PROPS` catalog, `PlacedProp`, `scatterProps`)
- Modify: `src/engine/renderer.ts` (`BattleView.props`, bake props into tiles)
- Modify: `src/scenes/battleScene.ts` + `src/scenes/battleView.ts` (compute scatter at setup, pass props)
- Test: `tests/props.test.ts`

- [ ] **Step 1: Author prop sprites**

Create `src/data/sprites/props.ts`. Props are small front-facing `SpriteDef`s (same format as `CHARACTER_SPRITES`). Author the full first-pass set via the same sprite-authoring workflow used for characters (the comment in `characters.ts` notes "Authored via workflow"); each must pass `validateSprite`. Concrete examples to fix the format and scale (cosmetic props ~6-10px tall; trees ~18-22px tall):

```ts
import type { SpriteDef } from "../../engine/sprite";

export const PROP_SPRITES = {
  grassTuft: {
    palette: { A: "#2f6b22", B: "#3f8a2c", C: "#56a838" },
    rows: ["...B...", "..BCB..", ".ABCBA.", "ABACABA"],
  },
  flowerCluster: {
    palette: { A: "#2f6b22", B: "#e8d24a", C: "#d96a8f" },
    rows: ["B.C.B..", ".ABA.C.", "AABAAB.", ".AAAA.."],
  },
  pebbles: {
    palette: { A: "#6b6f78", B: "#8b9099", C: "#4a4e56" },
    rows: [".B...", "ABCA.", "..ABB"],
  },
  rubble: {
    palette: { A: "#6b6258", B: "#8a7f70", C: "#4a443c" },
    rows: ["..B..A", "ABCBA.", "BACABB", ".ABAA."],
  },
  reeds: {
    palette: { A: "#3a6b2c", B: "#5aa83c", C: "#caa64a" },
    rows: ["B.C.B", "B.B.B", "AABAA", ".ABA."],
  },
  cattail: {
    palette: { A: "#3a6b2c", B: "#7a4a22", C: "#5aa83c" },
    rows: [".B.", "CBC", "CBC", ".A.", "AAA"],
  },
  mushroom: {
    palette: { A: "#b4452f", B: "#e8e0d0", C: "#caa", D: "#8a8278" },
    rows: [".AAA.", "ABABA", ".DDD.", ".DDD."],
  },
  tree: {
    palette: { A: "#1c3a16", B: "#2f6b22", C: "#3f8a2c", D: "#5a3a1c", E: "#7a4f28" },
    rows: [
      "...AABAA...", "..ABCCBA..", ".ABCCCCBA.", "ABCCCCCCBA",
      ".ABCCCCBA.", "..ABCCBA..", "...ADEA...", "...ADEA...",
      "...ADEA...", "...DDEE...",
    ],
  },
  pineTree: {
    palette: { A: "#14401a", B: "#256b2c", C: "#3a8a3c", D: "#5a3a1c" },
    rows: ["..A..", ".ABA.", ".BCB.", "ABCBA", "BCCCB", "ABCBA", "..D..", "..D.."],
  },
  boulder: {
    palette: { A: "#4a4e56", B: "#6b6f78", C: "#8b9099", D: "#33363c" },
    rows: ["..BBB..", ".BCCBB.", "BCCCBBA", "BCCBBBA", "DABBBAD", ".DAAAD."],
  },
  stump: {
    palette: { A: "#5a3a1c", B: "#7a4f28", C: "#9a6a38" },
    rows: [".ABCA.", "ABCCBA", "ABBBBA", ".AAAA."],
  },
  deadTree: {
    palette: { A: "#3a2c1c", B: "#5a4632" },
    rows: ["..A.B.", "A.AB..", ".AAB.A", "..AB..", "..AB..", "..AB.."],
  },
  wallSegment: {
    palette: { A: "#5a5650", B: "#7a766e", C: "#403c38", D: "#9a958c" },
    rows: ["DDDDDDDD", "ABBABBAB", "BABBABBA", "ABBABBAB", "CCCCCCCC", "ABBABBAB"],
  },
} satisfies Record<string, SpriteDef>;

export type PropSpriteId = keyof typeof PROP_SPRITES;
```

- [ ] **Step 2: Write the failing test for the catalog + scatter**

Create `tests/props.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { MapDef } from "../src/core/types";
import { Grid } from "../src/battle/grid";
import { PROPS, scatterProps } from "../src/data/props";
import { PROP_SPRITES } from "../src/data/sprites/props";
import { validateSprite } from "../src/engine/sprite";

const baseMap = (over: Partial<MapDef> = {}): MapDef => ({
  id: "t", name: "t", intro: "",
  width: 6, height: 6,
  heights: Array.from({ length: 6 }, () => Array(6).fill(0)),
  terrain: Array.from({ length: 6 }, () => Array(6).fill("grass")),
  playerSpawns: [{ x: 0, y: 5 }],
  enemies: [{ name: "E", classId: "knight", level: 1, weaponId: "ironSword", pos: { x: 5, y: 0 } }],
  ...over,
});

describe("prop catalog", () => {
  it("every PropDef sprite is valid and every catalog entry has a sprite", () => {
    for (const id of Object.keys(PROPS)) {
      expect(PROP_SPRITES[id as keyof typeof PROP_SPRITES]).toBeDefined();
      expect(validateSprite(PROPS[id].sprite)).toEqual([]);
    }
  });
  it("cosmetic scatter props are never solid", () => {
    for (const id of Object.keys(PROPS)) {
      if (PROPS[id].scatter) expect(PROPS[id].solid ?? false).toBe(false);
    }
  });
});

describe("scatterProps", () => {
  it("is deterministic for the same map", () => {
    const m = baseMap();
    const g = new Grid(m);
    const a = scatterProps(m, g);
    const b = scatterProps(m, g);
    expect(a).toEqual(b);
  });
  it("never places on a spawn, enemy, blocked, or decor tile", () => {
    const m = baseMap({
      blocked: Array.from({ length: 6 }, (_, y) => Array.from({ length: 6 }, (_, x) => x === 2 && y === 2)),
      decor: [{ pos: { x: 3, y: 3 }, propId: "tree" }],
    });
    const g = new Grid(m);
    const forbidden = new Set(["0,5", "5,0", "2,2", "3,3"]);
    for (const pl of scatterProps(m, g)) {
      expect(forbidden.has(`${pl.pos.x},${pl.pos.y}`)).toBe(false);
      expect(PROPS[pl.propId].solid ?? false).toBe(false); // scatter only places cosmetic props
    }
  });
  it("places nothing on a terrain with no scatter weights", () => {
    const m = baseMap({ terrain: Array.from({ length: 6 }, () => Array(6).fill("lava")) });
    expect(scatterProps(m, new Grid(m))).toEqual([]);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run tests/props.test.ts`
Expected: FAIL — `Cannot find module '../src/data/props'`.

- [ ] **Step 4: Implement `src/data/props.ts`**

```ts
import type { MapDef, Point, TerrainType } from "../core/types";
import type { SpriteDef } from "../engine/sprite";
import type { Grid } from "../battle/grid";
import { PROP_SPRITES, type PropSpriteId } from "./sprites/props";

export interface PropDef {
  id: PropSpriteId;
  sprite: SpriteDef;
  /** Extra z added to LOS occlusion when present on a tile (0/absent = none). */
  sightBlock?: number;
  /** True ⇒ implies an impassable tile; only valid hand-authored on a blocked tile. */
  solid?: boolean;
  /** Per-terrain scatter probability (0..1). Absent ⇒ never scattered (authored only). */
  scatter?: Partial<Record<TerrainType, number>>;
}

export interface PlacedProp {
  pos: Point;
  propId: PropSpriteId;
}

const def = (id: PropSpriteId, extra: Omit<PropDef, "id" | "sprite">): PropDef => ({
  id,
  sprite: PROP_SPRITES[id],
  ...extra,
});

export const PROPS: Record<string, PropDef> = {
  // Cosmetic — procedurally scattered, never solid.
  grassTuft: def("grassTuft", { scatter: { grass: 0.16, mire: 0.06 } }),
  flowerCluster: def("flowerCluster", { scatter: { grass: 0.05 } }),
  pebbles: def("pebbles", { scatter: { dirt: 0.12, rock: 0.16, sand: 0.08 } }),
  rubble: def("rubble", { scatter: { rock: 0.1, dirt: 0.06 } }),
  reeds: def("reeds", { scatter: { mire: 0.18 } }),
  cattail: def("cattail", { scatter: { mire: 0.08 } }),
  mushroom: def("mushroom", { scatter: { mire: 0.08, grass: 0.02 } }),
  // Structural — hand-authored accents (MapDef.decor). Can block.
  tree: def("tree", { solid: true, sightBlock: 2 }),
  pineTree: def("pineTree", { solid: true, sightBlock: 2 }),
  boulder: def("boulder", { solid: true, sightBlock: 1 }),
  stump: def("stump", {}),
  deadTree: def("deadTree", { sightBlock: 1 }),
  wallSegment: def("wallSegment", { solid: true, sightBlock: 2 }),
};

/** Deterministic 0..1 hash from a map id + tile coords + channel. */
function hash01(id: string, x: number, y: number, ch: number): number {
  let h = 2166136261 >>> 0;
  const s = `${id}:${x}:${y}:${ch}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h % 100000) / 100000;
}

/**
 * Deterministically scatter cosmetic props across a map's walkable tiles. Never
 * places on a spawn, enemy, ally, chest, objective, blocked, or hand-decorated
 * tile, and never places a `solid` prop. Same map ⇒ same layout (no RNG).
 */
export function scatterProps(map: MapDef, grid: Grid): PlacedProp[] {
  const taken = new Set<string>();
  for (const s of map.playerSpawns) taken.add(`${s.x},${s.y}`);
  for (const e of map.enemies) taken.add(`${e.pos.x},${e.pos.y}`);
  for (const a of map.allies ?? []) taken.add(`${a.pos.x},${a.pos.y}`);
  for (const c of map.chests ?? []) taken.add(`${c.pos.x},${c.pos.y}`);
  for (const d of map.decor ?? []) taken.add(`${d.pos.x},${d.pos.y}`);
  const o = map.objective;
  if (o && (o.kind === "seize" || o.kind === "defend" || o.kind === "escort")) taken.add(`${o.x},${o.y}`);

  // Cosmetic props eligible per terrain, in stable id order.
  const cosmetic = Object.values(PROPS).filter((p) => p.scatter);

  const placed: PlacedProp[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (taken.has(`${x},${y}`)) continue;
      if (grid.isBlocked(x, y)) continue;
      const terrain = grid.terrainAt(x, y);
      const eligible = cosmetic.filter((p) => (p.scatter?.[terrain] ?? 0) > 0);
      if (eligible.length === 0) continue;
      const total = eligible.reduce((sum, p) => sum + (p.scatter?.[terrain] ?? 0), 0);
      if (hash01(map.id, x, y, 0) >= total) continue; // no prop on this tile
      // Pick which eligible prop, weighted by its terrain probability.
      let roll = hash01(map.id, x, y, 1) * total;
      for (const p of eligible) {
        roll -= p.scatter?.[terrain] ?? 0;
        if (roll <= 0) { placed.push({ pos: { x, y }, propId: p.id }); break; }
      }
    }
  }
  return placed;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/props.test.ts`
Expected: PASS. If "every PropDef sprite is valid" fails, fix the offending `PROP_SPRITES` rows (equal-length, palette chars).

- [ ] **Step 6: Carry props in the view and bake them into tiles**

In `src/engine/renderer.ts`:

Add the import at top:

```ts
import { PROPS, type PlacedProp } from "../data/props";
```

Add to `BattleView`:

```ts
  /** Decoration props to draw on the field (baked into their tile's canvas). */
  props?: PlacedProp[];
```

In `drawScene`, before the item loop, build a tile→propId map:

```ts
    const propByTile = new Map<string, string>();
    for (const pr of view.props ?? []) propByTile.set(`${pr.pos.x},${pr.pos.y}`, pr.propId);
```

Extend the cache key + bake to include the prop. Change `bakeTile` to accept an optional `propId` and draw the prop sprite (baked) above the tile top:

```ts
  private bakeTile(terrain: TerrainType, z: number, ao: number, propId?: string): { canvas: HTMLCanvasElement; ax: number; ay: number } {
    const key = `${terrain}|${z}|${ao}|${propId ?? ""}`;
    const wallH = z * TILE_Z;
    const prop = propId ? PROPS[propId] : undefined;
    const propCanvas = prop ? bakeSprite(prop.sprite, PROP_SCALE) : null;
    const propH = propCanvas ? propCanvas.height : 0;
    const ax = TILE_W / 2 + 2;
    const ay = TILE_H / 2 + 2 + propH; // headroom above the top for a tall prop
    const cached = this.tileBakes.get(key);
    if (cached) return { canvas: cached, ax, ay };
    const canvas = document.createElement("canvas");
    canvas.width = TILE_W + 4;
    canvas.height = TILE_H + wallH + 4 + propH;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      const saved = this.ctxOverride;
      this.ctxOverride = ctx;
      const center: ScreenPoint = { sx: ax, sy: ay };
      this.drawTileWalls(center, z, terrain);
      this.drawTileTop(center, z, terrain, 0, 0, ao, 0);
      this.ctxOverride = saved;
      if (propCanvas) ctx.drawImage(propCanvas, Math.round(ax - propCanvas.width / 2), Math.round(ay - propCanvas.height + 4));
    }
    this.tileBakes.set(key, canvas);
    return { canvas, ax, ay };
  }
```

Add the prop bake scale constant near `VFX_SCALE` (line ~23):

```ts
const PROP_SCALE = 3;
```

In the `drawScene` tile branch, pass the prop id and use the (now prop-aware) anchor for both branches. Replace the tile branch body's bake/draw to:

```ts
        const propId = propByTile.get(`${it.x},${it.y}`);
        if (Renderer.ANIMATED.has(terrain) && !propId) {
          this.drawTileWalls(center, z, terrain);
          this.drawTileTop(center, z, terrain, it.x, it.y, ao, view.time);
        } else {
          const { canvas, ax, ay } = this.bakeTile(terrain, z, ao, propId);
          this.ctx.drawImage(canvas, Math.round(center.sx - ax), Math.round(center.sy - ay));
        }
```

> Animated terrain that also has a prop falls into the baked path (loses the shimmer on that one tile) — an accepted rare case (props rarely sit on water/lava).

- [ ] **Step 7: Compute scatter at battle setup and pass it through**

In `src/scenes/battleScene.ts`, add a field and populate it where the grid is built (right after `this.ctx.renderer.resetTileCache();` from Task 3 Step 6):

```ts
  private props: PlacedProp[] = [];
```
```ts
    this.props = [
      ...scatterProps(this.map, this.grid),
      ...(this.map.decor ?? []).map((d) => ({ pos: { ...d.pos }, propId: d.propId as PropSpriteId })),
    ];
```

Add imports to `battleScene.ts`:

```ts
import { scatterProps, type PlacedProp } from "../data/props";
import type { PropSpriteId } from "../data/sprites/props";
```

> `map.decor` does not exist as a type yet — it is added in Task 5. Until then `this.map.decor` is `undefined` and the spread is empty. If `tsc` complains here before Task 5, add the `MapDef.decor?` field (Task 5 Step 1) first — the two tasks share that field. To keep this task self-contained, do Task 5 Step 1 (the type) now, then return.

Expose `props` to the view: in the `ViewScene` interface in `battleView.ts` add `props: PlacedProp[];` (import `PlacedProp`), and in the returned object of `buildView` add `props: s.props,`.

- [ ] **Step 8: Type-check + tests**

Run: `npx tsc --noEmit` and `npx vitest run tests/props.test.ts` and `npm test`.
Expected: clean + green.

- [ ] **Step 9: Browser-verify props *(screenshot)***

Run: `npm run build` + puppeteer recipe on verdantRuins.
Expected: cosmetic props (tufts/flowers/reeds/pebbles) appear scattered, deterministic across reloads, never under a unit/chest/spawn; a unit walking in front of a baked prop overdraws it correctly. Tune scatter probabilities in `props.ts` if too dense/sparse.

- [ ] **Step 10: Commit**

```bash
git add src/data/props.ts src/data/sprites/props.ts src/engine/renderer.ts src/scenes/battleScene.ts src/scenes/battleView.ts tests/props.test.ts
git commit -m "feat(render): SpriteDef prop layer + deterministic scatter

Add PropDef catalog + prop sprites; scatterProps places cosmetic props
(tufts, flowers, reeds, pebbles, rubble, mushrooms) deterministically on
walkable tiles, never on spawns/enemies/chests/decor/blocked. Props bake into
their tile's cached canvas so they ride the depth-sorted pass (occlusion ok).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: LOS + movement hook + authored decor

**Files:**
- Modify: `src/core/types.ts` (`MapDef.decor?`)
- Modify: `src/battle/grid.ts` (`sightBlock[][]`, `sightBlockAt`)
- Modify: `src/battle/los.ts` (add `sightBlockAt` to the height test)
- Modify: 1-2 map files under `src/data/maps/` (seed structural accents)
- Test: `tests/los.test.ts`, `tests/maps.test.ts`

- [ ] **Step 1: Add `MapDef.decor` to the type**

In `src/core/types.ts`, inside `interface MapDef` (after `chests?`):

```ts
  /** Hand-authored decoration accents. A `solid` prop (see PROPS) MUST sit on a
   *  blocked tile; a `sightBlock` prop raises LOS occlusion on its tile. */
  decor?: { pos: Point; propId: string }[];
```

- [ ] **Step 2: Write the failing test for `Grid.sightBlockAt`**

Add to `tests/grid.test.ts`:

```ts
import { PROPS } from "../src/data/props";

describe("Grid.sightBlockAt", () => {
  it("is 0 where there is no sight-blocking decor", () => {
    const g = gridOf([[0, 0], [0, 0]]);
    expect(g.sightBlockAt(0, 0)).toBe(0);
  });
  it("returns a tree's sightBlock on its tile", () => {
    const map: MapDef = {
      id: "d", name: "d", intro: "", width: 3, height: 1,
      heights: [[0, 0, 0]],
      blocked: [[false, true, false]],
      decor: [{ pos: { x: 1, y: 0 }, propId: "tree" }],
      playerSpawns: [], enemies: [],
    };
    const g = new Grid(map);
    expect(g.sightBlockAt(1, 0)).toBe(PROPS.tree.sightBlock);
    expect(g.sightBlockAt(0, 0)).toBe(0);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run tests/grid.test.ts`
Expected: FAIL — `grid.sightBlockAt is not a function`.

- [ ] **Step 4: Implement `sightBlockAt` in `Grid`**

In `src/battle/grid.ts`, import the catalog at top:

```ts
import { PROPS } from "../data/props";
```

Add a field:

```ts
  private readonly sightBlock: number[][];
```

Build it in the constructor (after terrain is built):

```ts
    this.sightBlock = Array.from({ length: this.height }, () => Array(this.width).fill(0));
    for (const d of map.decor ?? []) {
      const sb = PROPS[d.propId]?.sightBlock ?? 0;
      if (sb > 0 && this.inBounds(d.pos.x, d.pos.y)) this.sightBlock[d.pos.y][d.pos.x] = sb;
    }
```

Add the accessor (next to `heightAt`):

```ts
  /** Extra LOS occlusion (in tile-z) from a sight-blocking prop on this tile. */
  sightBlockAt(x: number, y: number): number {
    return this.inBounds(x, y) ? this.sightBlock[y][x] : 0;
  }
```

> `grid.ts` importing `data/props.ts` which imports `engine/sprite` (a `SpriteDef` type only) and `sprites/props` (data) is fine — no canvas at import time (`bakeSprite` is only called at draw time). Verify no circular-import runtime error in Step 6.

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run tests/grid.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing LOS test, then wire `los.ts`**

Add to `tests/los.test.ts` (it imports `Grid` + `hasLineOfSight`; follow the file's existing helpers):

```ts
import { PROPS } from "../src/data/props";

describe("line of sight blocked by a tall prop on flat ground", () => {
  const flat3 = (decor?: MapDef["decor"]): Grid => new Grid({
    id: "l", name: "l", intro: "", width: 3, height: 1,
    heights: [[0, 0, 0]], blocked: [[false, true, false]],
    decor, playerSpawns: [], enemies: [],
  });

  it("sees across flat ground with no prop", () => {
    expect(hasLineOfSight(flat3(), { x: 0, y: 0 }, { x: 2, y: 0 })).toBe(true);
  });
  it("is blocked by a tree (sightBlock) in the middle", () => {
    const g = flat3([{ pos: { x: 1, y: 0 }, propId: "tree" }]);
    expect(PROPS.tree.sightBlock).toBeGreaterThan(0);
    expect(hasLineOfSight(g, { x: 0, y: 0 }, { x: 2, y: 0 })).toBe(false);
  });
});
```

(Add `import type { MapDef } from "../src/core/types";` if not present.)

- [ ] **Step 7: Run it to verify it fails**

Run: `npx vitest run tests/los.test.ts`
Expected: FAIL on the "blocked by a tree" case (LOS is height-only; sightBlock not consulted yet).

- [ ] **Step 8: Add `sightBlockAt` to the LOS height test**

In `src/battle/los.ts`, in the `blocks` closure (line ~33), change:

```ts
    return grid.heightAt(cx, cy) > lineZ + 1e-6;
```
to:
```ts
    return grid.heightAt(cx, cy) + grid.sightBlockAt(cx, cy) > lineZ + 1e-6;
```

- [ ] **Step 9: Run the LOS tests to verify they pass + regression**

Run: `npx vitest run tests/los.test.ts`
Expected: PASS — the new cases pass and all pre-existing LOS cases still pass (no decor ⇒ `sightBlockAt` is 0 ⇒ identical behavior).

- [ ] **Step 10: Extend `maps.test.ts` to validate decor**

Add a new `it` inside the per-map `describe` in `tests/maps.test.ts` (alongside the chest validation):

```ts
      it("places decor on valid tiles (solid props on blocked tiles)", () => {
        if (!map.decor) return;
        const grid = new Grid(map);
        const taken = new Set<string>();
        for (const s of map.playerSpawns) taken.add(`${s.x},${s.y}`);
        for (const e of map.enemies) taken.add(`${e.pos.x},${e.pos.y}`);
        for (const a of map.allies ?? []) taken.add(`${a.pos.x},${a.pos.y}`);
        for (const c of map.chests ?? []) taken.add(`${c.pos.x},${c.pos.y}`);
        const o = map.objective;
        if (o && (o.kind === "seize" || o.kind === "defend" || o.kind === "escort")) taken.add(`${o.x},${o.y}`);
        const seen = new Set<string>();
        for (const d of map.decor) {
          expect(d.pos.x).toBeGreaterThanOrEqual(0);
          expect(d.pos.y).toBeGreaterThanOrEqual(0);
          expect(d.pos.x).toBeLessThan(map.width);
          expect(d.pos.y).toBeLessThan(map.height);
          const prop = PROPS[d.propId];
          expect(prop).toBeDefined();
          if (prop.solid) expect(grid.isBlocked(d.pos.x, d.pos.y)).toBe(true);
          const k = `${d.pos.x},${d.pos.y}`;
          expect(taken.has(k)).toBe(false);
          expect(seen.has(k)).toBe(false);
          seen.add(k);
        }
      });
```

Add `import { PROPS } from "../src/data/props";` at the top of `maps.test.ts`.

- [ ] **Step 11: Seed structural accents on 1-2 maps**

Pick maps with existing blocked tiles. In `src/data/maps/verdantRuins.ts`, the blocked corners (e.g. `{x:0,y:0}`,`{x:14,y:0}` per the `blocked` mask) and the two height-3 pillars at `{x:4,y:6}`/`{x:10,y:6}` (row 6 has `true` at x=4 and x=10) are natural spots. Add after `chests`:

```ts
  decor: [
    { pos: { x: 0, y: 0 }, propId: "tree" },
    { pos: { x: 14, y: 0 }, propId: "tree" },
    { pos: { x: 4, y: 6 }, propId: "boulder" },
    { pos: { x: 10, y: 6 }, propId: "boulder" },
  ],
```

Verify each `pos` is `true` in that map's `blocked` mask (solid props require it) — the `maps.test.ts` rule from Step 10 enforces it. Optionally add a few cosmetic-but-authored accents on walkable tiles (e.g. `stump` on grass) to taste.

- [ ] **Step 12: Full suite + reachability + type-check**

Run: `npx tsc --noEmit`, `npm test` (expect 1333+ new-tests green; `mapsReach.test.ts` still passes — solid decor sits only on already-blocked tiles, so reachability is unchanged), `npm run build`.

- [ ] **Step 13: Browser-verify decorated map + LOS *(screenshot)***

Run: puppeteer recipe on verdantRuins.
Expected: trees/boulders render on the blocked corners/pillars; a ranged unit cannot target through a tree on flat ground (LOS blocked), but can over open ground; movement routes around them as before (they were already blocked).

- [ ] **Step 14: Commit**

```bash
git add src/core/types.ts src/battle/grid.ts src/battle/los.ts src/data/maps/verdantRuins.ts tests/los.test.ts tests/maps.test.ts tests/grid.test.ts
git commit -m "feat(battle): authored decor + LOS-blocking props

Add MapDef.decor (hand-authored accents); Grid builds a sightBlock map and
exposes sightBlockAt; los.ts adds it to the height test so a tall prop on flat
ground blocks sight (no decor ⇒ identical LOS). Movement-blocking via the
existing blocked mask. Seed verdantRuins with trees + boulders.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Done / Out of scope (→ SP2)

SP1 ships: +50% tiles with auto-fit, textured procedural terrain, a prop layer
(procedural cosmetic + authored structural), per-tile bake cache, and an opt-in
LOS hook — on current map sizes.

**SP2 (separate spec/plan/branch):** bigger map dimensions (re-author all 17 maps),
real camera (pan/drag, zoom toggle, follow active unit — replaces auto-fit),
enemy/spawn rebalancing, and edge/transition blending between terrains.
