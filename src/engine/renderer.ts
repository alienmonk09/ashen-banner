import type { Point, StatusKind, TerrainType, Unit } from "../core/types";
import type { Grid } from "../battle/grid";
import { dirVector } from "../battle/facing";
import { bakeSprite, spriteHeight, type AnimDef, type SpriteDef } from "./sprite";
import { getUnitSprite } from "../data/sprites";
import { TERRAIN } from "../data/terrain";
import {
  TILE_W,
  TILE_H,
  TILE_Z,
  worldToScreen,
  diamondCorners,
  depthKey,
  rotateTile,
  rotatedDims,
  type Rotation,
  type ScreenPoint,
} from "./iso";

/** Target on-screen sprite height (px) — bake scale is derived per sprite so
 *  16x20 class art and 24x30 hero art render to the same footprint. */
const CHAR_PX_H = 60;
const VFX_SCALE = 3;
/** Bake scale for a sprite so it lands near CHAR_PX_H tall. */
function charScale(def: SpriteDef): number {
  return Math.max(1, Math.round(CHAR_PX_H / spriteHeight(def)));
}
/** Clamp a lightness percentage to a sane range. */
function clampL(l: number): number {
  return Math.max(6, Math.min(92, l));
}
/** Seconds for a slain unit to fade from full to ghosted. */
const DEATH_FADE = 0.45;

export interface FloatingText {
  /** Anchor tile. */
  tile: Point;
  text: string;
  color: string;
  /** seconds elapsed. */
  age: number;
  ttl: number;
  /** Critical hit — drawn larger with a brief pop-in scale for emphasis. */
  crit?: boolean;
}

export interface OverlaySet {
  move: Point[];
  attack: Point[];
  aoe: Point[];
  path: Point[];
  objective?: Point[];
  /** Reachable tiles whose terrain has a per-turn effect, so the player can see
   *  the hazard (lava) / boon (spring) / snare (mire) BEFORE stepping onto it. */
  hazards?: { tile: Point; kind: "damage" | "heal" | "slow" }[];
}

/** A transient spell/skill effect animation playing over a tile. */
export interface ActiveEffect {
  tile: Point;
  anim: AnimDef;
  /** Seconds elapsed. */
  age: number;
}

/** A damage/heal preview shown over the hovered target while choosing a target. */
export interface ForecastTag {
  tile: Point;
  text: string;
  color: string;
  /** Emphasize (e.g. a lethal hit). */
  strong: boolean;
}

export interface BattleView {
  grid: Grid;
  units: Unit[];
  origin: ScreenPoint;
  /** Camera orientation (clockwise quarter-turns). */
  rot: Rotation;
  activeUnitId: string | null;
  hoverTile: Point | null;
  overlays: OverlaySet;
  popups: FloatingText[];
  /** Override drawn position (fractional tile coords) for animating units. */
  animPos: Map<string, Point>;
  /** Active spell/skill effect animations. */
  effects: ActiveEffect[];
  /** Per-unit pixel offsets for juice (hit shake, attack lunge). */
  unitOffsets: Map<string, { dx: number; dy: number }>;
  /** Seconds since a unit died, for the death fade-out. */
  deathFade: Map<string, number>;
  /** Damage/heal preview over the hovered target, if any. */
  forecast: ForecastTag | null;
  /** Bob phase for the active-unit indicator (seconds accumulator). */
  time: number;
  /** Whole-scene pixel offset for impact shake (crits, deaths, counters). */
  screenShake?: { dx: number; dy: number };
}

const COLOR = {
  move: "rgba(80,150,235,0.40)",
  attack: "rgba(230,80,80,0.40)",
  aoe: "rgba(245,150,40,0.55)",
  path: "rgba(245,225,90,0.65)",
  hover: "rgba(255,255,255,0.22)",
  gridLine: "rgba(0,0,0,0.18)",
  objective: "rgba(255,210,80,0.55)",
  hazardDamage: "rgba(255,90,40,0.45)",
  hazardHeal: "rgba(80,235,150,0.45)",
  hazardSlow: "rgba(150,110,60,0.5)",
};

/** One-glyph badge + color per status, drawn as a pip over the unit's HP bar.
 *  Letters are picked distinct (slow=L, stop=X, poison=T) so colors + glyphs
 *  never collide. */
const STATUS_UI: Record<StatusKind, { letter: string; color: string }> = {
  guard: { letter: "G", color: "#7fb0ff" },
  protect: { letter: "P", color: "#5fd0ff" },
  shell: { letter: "S", color: "#b98cff" },
  haste: { letter: "H", color: "#ffd34d" },
  slow: { letter: "L", color: "#ff9f4d" },
  stop: { letter: "X", color: "#c8ccd6" },
  poison: { letter: "T", color: "#8fe39a" },
  regen: { letter: "R", color: "#5fff9a" },
};

function key(p: Point): string {
  return `${p.x},${p.y}`;
}

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  width = 0;
  height = 0;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
  }

  resize(cssWidth: number, cssHeight: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(cssWidth * dpr);
    this.canvas.height = Math.floor(cssHeight * dpr);
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Assigning canvas.width/height above resets the context, re-enabling image
    // smoothing (default true) — which bilinearly blurs the baked pixel-art on
    // HiDPI/retina blits. Disable it here, not just on the offscreen bake canvas.
    this.ctx.imageSmoothingEnabled = false;
    this.width = cssWidth;
    this.height = cssHeight;
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  /** Center the camera so the map's middle sits at the screen middle. The map's
   *  logical center maps to the center of the (possibly swapped) rotated grid,
   *  so rotation keeps the map centered. */
  computeOrigin(grid: Grid, rot: Rotation = 0): ScreenPoint {
    const dims = rotatedDims(rot, grid.width, grid.height);
    const midX = (dims.w - 1) / 2;
    const midY = (dims.h - 1) / 2;
    const center = worldToScreen(midX, midY, 0, { sx: 0, sy: 0 });
    return { sx: this.width / 2 - center.sx, sy: this.height / 2 - center.sy - 40 };
  }

  /** Project a logical tile (x, y, z) to its screen center, honoring rotation. */
  private project(view: BattleView, x: number, y: number, z: number): ScreenPoint {
    const v = rotateTile(x, y, view.rot, view.grid.width, view.grid.height);
    return worldToScreen(v.x, v.y, z, view.origin);
  }

  /**
   * Interpolated tile height for a unit at a possibly-fractional position, so a
   * unit visually climbs/descends as it steps across tiles of differing height
   * instead of popping to the next tile's z. Bilinear over the four surrounding
   * integer tiles — for the axis-aligned, one-tile-at-a-time movement the animator
   * produces, the off-axis weights fall to zero, giving a clean per-step ramp.
   */
  private interpHeight(grid: Grid, ap: Point): number {
    const x0 = Math.floor(ap.x);
    const y0 = Math.floor(ap.y);
    const fx = ap.x - x0;
    const fy = ap.y - y0;
    const h00 = grid.heightAt(x0, y0);
    const h10 = grid.heightAt(x0 + 1, y0);
    const h01 = grid.heightAt(x0, y0 + 1);
    const h11 = grid.heightAt(x0 + 1, y0 + 1);
    return (
      h00 * (1 - fx) * (1 - fy) +
      h10 * fx * (1 - fy) +
      h01 * (1 - fx) * fy +
      h11 * fx * fy
    );
  }

  render(view: BattleView): void {
    this.clear();
    // Impact shake: nudge the whole scene a few pixels. Save/restore so the DPR
    // transform set in resize() is preserved across frames.
    const shake = view.screenShake;
    if (shake) {
      this.ctx.save();
      this.ctx.translate(shake.dx, shake.dy);
    }
    this.drawScene(view);
    this.drawEffects(view);
    this.drawPopups(view);
    this.drawForecast(view);
    if (shake) this.ctx.restore();
  }

  private drawForecast(view: BattleView): void {
    const f = view.forecast;
    if (!f) return;
    const ctx = this.ctx;
    const z = view.grid.heightAt(f.tile.x, f.tile.y);
    const center = this.project(view, f.tile.x, f.tile.y, z);
    const x = center.sx;
    const y = center.sy - 64;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = f.strong ? "bold 18px system-ui" : "bold 15px system-ui";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.strokeText(f.text, x, y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, x, y);
  }

  private drawEffects(view: BattleView): void {
    const ctx = this.ctx;
    for (const e of view.effects) {
      const frames = e.anim.frames;
      const idx = Math.min(Math.floor(e.age / e.anim.frameDur), frames.length - 1);
      if (idx < 0) continue;
      const canvas = bakeSprite(frames[idx], VFX_SCALE);
      const z = view.grid.heightAt(e.tile.x, e.tile.y);
      const center = this.project(view, e.tile.x, e.tile.y, z);
      ctx.drawImage(
        canvas,
        Math.round(center.sx - canvas.width / 2),
        Math.round(center.sy - 26 - canvas.height / 2),
      );
    }
  }

  /** Map each tile key to the overlay colors to paint on its top, in z-order. */
  private overlayColors(view: BattleView): Map<string, string[]> {
    const m = new Map<string, string[]>();
    const push = (t: Point, color: string): void => {
      const k = `${t.x},${t.y}`;
      const arr = m.get(k);
      if (arr) arr.push(color);
      else m.set(k, [color]);
    };
    for (const t of view.overlays.move) push(t, COLOR.move);
    // Hazard tints sit on top of the move shade so a lava/spring/mire tile inside
    // the move range reads as its hazard color, not plain "reachable" blue.
    for (const hz of view.overlays.hazards ?? []) {
      push(hz.tile, hz.kind === "damage" ? COLOR.hazardDamage : hz.kind === "heal" ? COLOR.hazardHeal : COLOR.hazardSlow);
    }
    for (const t of view.overlays.attack) push(t, COLOR.attack);
    for (const t of view.overlays.path) push(t, COLOR.path);
    for (const t of view.overlays.aoe) push(t, COLOR.aoe);
    if (view.hoverTile) push(view.hoverTile, COLOR.hover);
    for (const t of view.overlays.objective ?? []) push(t, COLOR.objective);
    return m;
  }

  /**
   * Draw tiles and units interleaved in one back-to-front pass so a taller tile
   * in front of a unit overdraws the unit's lower body (occlusion). A unit is
   * depth-keyed to its own tile + 0.5, so it sits just above its tile top but
   * behind any closer/higher tile. Painter's order is computed in VIEW space so
   * it stays correct at every rotation.
   */
  private drawScene(view: BattleView): void {
    const { grid, rot } = view;
    const w = grid.width;
    const h = grid.height;
    const overlays = this.overlayColors(view);

    type Item =
      | { kind: "tile"; depth: number; x: number; y: number }
      | { kind: "unit"; depth: number; unit: Unit; dx: number; dy: number };
    const items: Item[] = [];

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        items.push({ kind: "tile", depth: depthKey(x, y, grid.heightAt(x, y), rot, w, h), x, y });
      }
    }
    for (const unit of view.units) {
      const ap = view.animPos.get(unit.id) ?? unit.pos;
      // Interpolated height so a mid-step unit climbs/descends smoothly (and sorts
      // at its true in-between elevation rather than snapping to a tile's z).
      const z = this.interpHeight(grid, ap);
      items.push({ kind: "unit", depth: depthKey(ap.x, ap.y, z, rot, w, h) + 0.5, unit, dx: ap.x, dy: ap.y });
    }
    items.sort((a, b) => a.depth - b.depth);

    for (const it of items) {
      if (it.kind === "tile") {
        const z = grid.heightAt(it.x, it.y);
        const center = this.project(view, it.x, it.y, z);
        const terrain = grid.terrainAt(it.x, it.y);
        this.drawTileWalls(center, z, terrain);
        this.drawTileTop(center, z, terrain, it.x, it.y, this.neighborShade(grid, it.x, it.y, z));
        const cols = overlays.get(`${it.x},${it.y}`);
        if (cols) for (const c of cols) this.paintDiamond(center, c);
      } else {
        const z = this.interpHeight(grid, { x: it.dx, y: it.dy });
        const center = this.project(view, it.dx, it.dy, z);
        // Screen-space facing vector: project one tile ahead and normalize, so the
        // marker rotates correctly with the camera.
        const ahead = dirVector(it.unit.facing);
        const pa = this.project(view, it.dx + ahead.x, it.dy + ahead.y, z);
        let fx = pa.sx - center.sx;
        let fy = pa.sy - center.sy;
        const mag = Math.hypot(fx, fy) || 1;
        fx /= mag;
        fy /= mag;
        const off = view.unitOffsets.get(it.unit.id);
        if (off) {
          center.sx += off.dx;
          center.sy += off.dy;
        }
        this.drawUnit(it.unit, center, it.unit.id === view.activeUnitId, view.time, view.deathFade.get(it.unit.id), { x: fx, y: fy });
      }
    }
  }

  private paintDiamond(center: ScreenPoint, color: string): void {
    const corners = diamondCorners(center);
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(corners[0].sx, corners[0].sy);
    for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].sx, corners[i].sy);
    ctx.closePath();
    ctx.fill();
  }

  private drawTileWalls(center: ScreenPoint, z: number, terrain: TerrainType): void {
    if (z <= 0) return;
    const ctx = this.ctx;
    const corners = diamondCorners(center);
    const wallH = z * TILE_Z;
    const st = TERRAIN[terrain];
    // Two cliff faces, each shaded with a vertical gradient (lit near the top
    // edge, sinking into shadow at the base) so tall cliffs read as solid mass.
    // The left face is darker than the right to fake a top-right key light.
    const face = (a: ScreenPoint, b: ScreenPoint, topL: number, botL: number) => {
      const g = ctx.createLinearGradient(0, a.sy, 0, a.sy + wallH);
      g.addColorStop(0, `hsl(${st.h}, ${st.s}%, ${clampL(topL)}%)`);
      g.addColorStop(1, `hsl(${st.h}, ${st.s}%, ${clampL(botL)}%)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
      ctx.lineTo(b.sx, b.sy + wallH);
      ctx.lineTo(a.sx, a.sy + wallH);
      ctx.closePath();
      ctx.fill();
    };
    face(corners[3], corners[2], st.l - 16, st.l - 34); // left (shadow) face
    face(corners[2], corners[1], st.l - 8, st.l - 24); // right (lit) face
    // Crisp shadow seam where the two faces meet, and a dark contact line at the
    // very base — grounds the cliff instead of letting it float.
    ctx.strokeStyle = `hsla(${st.h}, ${st.s}%, ${clampL(st.l - 40)}%, 0.9)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(corners[2].sx, corners[2].sy);
    ctx.lineTo(corners[2].sx, corners[2].sy + wallH);
    ctx.moveTo(corners[3].sx, corners[3].sy + wallH);
    ctx.lineTo(corners[2].sx, corners[2].sy + wallH);
    ctx.lineTo(corners[1].sx, corners[1].sy + wallH);
    ctx.stroke();
  }

  /** Ambient-occlusion weight: how strongly taller orthogonal neighbors shade
   *  this tile's top, so tiles nestled below cliffs sink into shadow. */
  private neighborShade(grid: Grid, x: number, y: number, z: number): number {
    let s = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const dh = grid.heightAt(x + dx, y + dy) - z;
      if (dh > 0) s += Math.min(2, dh);
    }
    return s; // 0..8 (typically 0..4)
  }

  private drawTileTop(center: ScreenPoint, z: number, terrain: TerrainType, tx: number, ty: number, ao: number): void {
    const ctx = this.ctx;
    const corners = diamondCorners(center);
    const st = TERRAIN[terrain];
    // Steeper height ramp so elevation reads at a glance, minus an ambient-
    // occlusion term so tiles under cliffs darken toward their taller neighbors.
    const lit = clampL(st.l + z * 6 - ao * 4);
    ctx.fillStyle = `hsl(${st.h}, ${st.s}%, ${lit}%)`;
    ctx.beginPath();
    ctx.moveTo(corners[0].sx, corners[0].sy);
    for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].sx, corners[i].sy);
    ctx.closePath();
    ctx.fill();
    // Cheap deterministic speckle so flat ground isn't a single dead color.
    const seed = ((tx * 73856093) ^ (ty * 19349663)) >>> 0;
    for (let i = 0; i < 3; i++) {
      const r = (seed >> (i * 5)) & 31;
      const dx = ((r & 3) - 1.5) * (TILE_W * 0.16);
      const dy = (((r >> 2) & 3) - 1.5) * (TILE_H * 0.16);
      ctx.fillStyle = `hsl(${st.h}, ${st.s}%, ${clampL(lit + (r & 1 ? 7 : -7))}%)`;
      ctx.fillRect(Math.round(center.sx + dx), Math.round(center.sy + dy), 2, 2);
    }
    ctx.strokeStyle = COLOR.gridLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(corners[0].sx, corners[0].sy);
    for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].sx, corners[i].sy);
    ctx.closePath();
    ctx.stroke();
    // Sunlit rim on a raised tile's two upper edges (top→right, top→left) — a
    // bright lip that makes plateaus and steps pop against the tiles below.
    if (z > 0) {
      ctx.strokeStyle = `hsla(${st.h}, ${st.s}%, ${clampL(lit + 22)}%, 0.7)`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(corners[3].sx, corners[3].sy);
      ctx.lineTo(corners[0].sx, corners[0].sy);
      ctx.lineTo(corners[1].sx, corners[1].sy);
      ctx.stroke();
    }
  }

  private drawUnit(
    unit: Unit,
    center: ScreenPoint,
    active: boolean,
    time: number,
    deathAge: number | undefined,
    facingDir: { x: number; y: number },
  ): void {
    const ctx = this.ctx;
    const def = getUnitSprite(unit);
    const canvas = bakeSprite(def, charScale(def));
    const w = canvas.width;
    const h = canvas.height;
    const bob = active ? Math.sin(time * 6) * 2 : 0;
    const drawX = Math.round(center.sx - w / 2);
    const feetY = center.sy + 4; // a touch below the tile-top center
    const drawY = Math.round(feetY - h + bob);

    // Shadow.
    ctx.fillStyle = "rgba(0,0,0,0.30)";
    ctx.beginPath();
    ctx.ellipse(center.sx, center.sy + 2, TILE_W * 0.26, TILE_H * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();

    if (!unit.alive) {
      const a = deathAge === undefined ? 0.3 : Math.max(0.3, 1 - (deathAge / DEATH_FADE) * 0.7);
      ctx.globalAlpha = a;
      ctx.drawImage(canvas, drawX, drawY);
      ctx.globalAlpha = 1;
      return;
    }

    // Team-colored ground ring.
    ctx.strokeStyle = unit.team === "player" ? "#5fe3ff" : "#ff5a5a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(center.sx, center.sy + 2, TILE_W * 0.28, TILE_H * 0.28, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Facing arrowhead on the ring — shows which way the unit looks (for flanks).
    const tipX = center.sx + facingDir.x * TILE_W * 0.32;
    const tipY = center.sy + 2 + facingDir.y * TILE_H * 0.32;
    const perpX = -facingDir.y;
    const perpY = facingDir.x;
    ctx.fillStyle = unit.team === "player" ? "#aef0ff" : "#ffb0b0";
    ctx.beginPath();
    ctx.moveTo(tipX + facingDir.x * 4, tipY + facingDir.y * 4);
    ctx.lineTo(tipX + perpX * 4, tipY + perpY * 4);
    ctx.lineTo(tipX - perpX * 4, tipY - perpY * 4);
    ctx.closePath();
    ctx.fill();

    ctx.drawImage(canvas, drawX, drawY);

    const topY = drawY;
    // HP bar.
    const barW = 28;
    const barX = center.sx - barW / 2;
    const barY = topY - 8;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(barX - 1, barY - 1, barW + 2, 5);
    const hpFrac = unit.stats.hp / unit.stats.maxHp;
    ctx.fillStyle = hpFrac > 0.5 ? "#5fbf72" : hpFrac > 0.25 ? "#d6cf5f" : "#d65f5f";
    ctx.fillRect(barX, barY, barW * hpFrac, 3);

    // Status pips: one colored badge per active status.
    if (unit.statuses.length > 0) {
      const pipW = 9;
      const gap = 1;
      const total = unit.statuses.length * pipW + (unit.statuses.length - 1) * gap;
      let px = center.sx - total / 2;
      const py = barY - 11;
      ctx.font = "bold 8px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const s of unit.statuses) {
        const ui = STATUS_UI[s.kind];
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(px - 0.5, py - 0.5, pipW + 1, 9);
        ctx.fillStyle = ui.color;
        ctx.fillRect(px, py, pipW, 8);
        ctx.fillStyle = "#14151c";
        ctx.fillText(ui.letter, px + pipW / 2, py + 4.5);
        px += pipW + gap;
      }
    }

    // Active indicator: bobbing arrow above the sprite.
    if (active) {
      const ab = Math.sin(time * 6) * 3;
      ctx.fillStyle = "#ffd34d";
      ctx.beginPath();
      ctx.moveTo(center.sx, topY - 10 + ab);
      ctx.lineTo(center.sx - 6, topY - 18 + ab);
      ctx.lineTo(center.sx + 6, topY - 18 + ab);
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawPopups(view: BattleView): void {
    const ctx = this.ctx;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const p of view.popups) {
      const z = view.grid.heightAt(p.tile.x, p.tile.y);
      const center = this.project(view, p.tile.x, p.tile.y, z);
      const t = p.age / p.ttl;
      const yOff = -40 - t * 24;
      ctx.globalAlpha = Math.max(0, 1 - t);
      if (p.crit) {
        // Crit popups read bigger and "pop": a brief overshoot scale at spawn that
        // settles to a still-larger-than-normal size, drawn from the popup's center.
        const pop = 1.5 + Math.max(0, 0.6 - t * 6);
        const px = center.sx;
        const py = center.sy + yOff;
        ctx.save();
        ctx.translate(px, py);
        ctx.scale(pop, pop);
        ctx.font = "bold 16px system-ui";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(0,0,0,0.8)";
        ctx.strokeText(p.text, 0, 0);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, 0, 0);
        ctx.restore();
      } else {
        ctx.font = "bold 16px system-ui";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(0,0,0,0.8)";
        ctx.strokeText(p.text, center.sx, center.sy + yOff);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, center.sx, center.sy + yOff);
      }
      ctx.globalAlpha = 1;
    }
  }
}

export { key as tileKey };
