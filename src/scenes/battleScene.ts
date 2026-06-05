import type { MapDef, Point, SkillDef, Unit } from "../core/types";
import { RNG } from "../core/rng";
import { grantJp, grantXp, createUnit } from "../core/unit";
import { enemyLevelFor, refreshForBattle, GIL_PER_KILL } from "../core/state";
import { Grid, manhattan, moveBlockers, samePoint } from "../battle/grid";
import { pathTo, reachable } from "../battle/pathfinding";
import { aoeTiles, knockbackTo, leapLanding, tilesInRange } from "../battle/targeting";
import {
  applyTerrainEffect,
  isStopped,
  resolveAutoPotion,
  resolveCounterAttack,
  resolveItem,
  resolveSkillOnTarget,
  resolveWeaponAttack,
  type AttackContext,
  type HitResult,
} from "../battle/combat";
import { hasLineOfSight } from "../battle/los";
import { directionTo } from "../battle/facing";
import { advanceToNextActor, endTurn, evaluateOutcome, previewOrder } from "../battle/turnManager";
import { planEnemyTurn } from "../battle/ai";
import { forecastSkill, forecastWeapon } from "../battle/forecast";
import { screenToTile, worldToScreen, rotateTile, type Rotation, type ScreenPoint } from "../engine/iso";
import { sfx } from "../engine/audio";
import { startMusic, stopMusic } from "../engine/music";
import type { ActiveEffect, BattleView, FloatingText, ForecastTag, OverlaySet } from "../engine/renderer";
import { getWeapon } from "../data/weapons";
import { getSkill } from "../data/skills";
import { getItem } from "../data/items";
import { getClass } from "../data/classes";
import { getVfx, vfxKeyForSkill, vfxKeyForWeapon } from "../data/sprites";
import { PHASES } from "../data/maps";
import { BattleUI } from "../ui/battleUI";
import type { GameContext, Scene } from "./sceneManager";

type Phase =
  | "intro"
  | "starting"
  | "menu"
  | "move"
  | "attackTarget"
  | "skillTarget"
  | "itemTarget"
  | "enemy"
  | "resolving"
  | "over";

const POPUP_COLORS = {
  damage: "#ff7a7a",
  crit: "#ffd34d",
  heal: "#7fe39a",
  mp: "#7fb0ff",
  revive: "#ffffff",
  status: "#ffd34d",
};

export class BattleScene implements Scene {
  private grid: Grid;
  private units: Unit[] = [];
  private ui: BattleUI;
  private rng = new RNG(0x1234 + 17);

  private phase: Phase = "intro";
  private active: Unit | null = null;
  private hasMoved = false;
  private hasActed = false;
  /** Turns begun this battle (drives the "survive N turns" objective). */
  private turnCount = 0;
  /** Camera orientation (clockwise quarter-turns); the player can rotate freely. */
  private rot: Rotation = 0;

  private hoverTile: Point | null = null;
  private rangeTiles: Point[] = [];
  private selectedSkill: SkillDef | null = null;
  private selectedItemId: string | null = null;
  private popups: FloatingText[] = [];
  private effects: ActiveEffect[] = [];
  private hitShake = new Map<string, number>(); // unitId -> seconds of shake remaining
  private deaths = new Map<string, number>(); // unitId -> seconds since death (fade-out)
  private lunge: { id: string; tx: number; ty: number; age: number } | null = null;
  private time = 0;

  private static readonly SHAKE_DUR = 0.22;
  private static readonly LUNGE_DUR = 0.18;

  constructor(
    private ctx: GameContext,
    private map: MapDef,
    private phaseIndex: number,
  ) {
    this.grid = new Grid(map);
    this.ui = new BattleUI(ctx.uiParent);
    this.buildUnits();
    this.bindInput();
    this.showIntro();
  }

  // --- Setup ---

  private buildUnits(): void {
    const party = this.ctx.state.party;
    party.forEach((u, i) => {
      const spawn = this.map.playerSpawns[i];
      if (!spawn) return;
      refreshForBattle(u);
      u.pos = { ...spawn };
      this.units.push(u);
    });
    for (const e of this.map.enemies) {
      this.units.push(
        createUnit({
          name: e.name,
          team: "enemy",
          classId: e.classId,
          level: enemyLevelFor(e.level, this.ctx.state.difficulty),
          pos: e.pos,
          weaponId: e.weaponId,
          learnedSkillIds: e.skillIds ?? [],
          personality: e.personality,
          raceId: e.raceId,
        }),
      );
    }
    // Point everyone toward the enemy they're about to fight.
    for (const u of this.units) u.facing = this.facingTowardFoes(u);
  }

  /** Initial facing: aim at the centroid of the opposing team (south if none). */
  private facingTowardFoes(unit: Unit): Unit["facing"] {
    const foes = this.units.filter((u) => u.team !== unit.team);
    if (foes.length === 0) return "s";
    const cx = foes.reduce((s, f) => s + f.pos.x, 0) / foes.length;
    const cy = foes.reduce((s, f) => s + f.pos.y, 0) / foes.length;
    return directionTo(unit.pos, { x: cx, y: cy });
  }

  /** Positional context (elevation gap) for an attack by the active unit on a tile. */
  private posCtx(targetPos: Point): AttackContext {
    if (!this.active) return {};
    return {
      heightDelta: this.grid.heightAt(this.active.pos.x, this.active.pos.y) - this.grid.heightAt(targetPos.x, targetPos.y),
    };
  }

  private get origin(): ScreenPoint {
    return this.ctx.renderer.computeOrigin(this.grid, this.rot);
  }

  /** Project a logical tile to its on-screen center under the current rotation. */
  private projectTile(x: number, y: number, z: number): ScreenPoint {
    const v = rotateTile(x, y, this.rot, this.grid.width, this.grid.height);
    return worldToScreen(v.x, v.y, z, this.origin);
  }

  /** Rotate the camera by one quarter-turn (dir +1 = clockwise / right). The
   *  active unit's on-screen position shifts, so re-anchor the floating menu. */
  private rotateView(dir: 1 | -1): void {
    this.rot = (((this.rot + dir) % 4) + 4) % 4 as Rotation;
    this.ui.setRotationLabel(this.rot);
    this.anchorMenuToActive();
    this.ui.reflowFloating();
  }

  private bindInput(): void {
    this.ctx.input.reset();
    this.ctx.input.onLeftClick = (px, py) => this.handleClick(px, py);
    this.ctx.input.onRightClick = () => this.cancelToMenu();
    this.ctx.input.onKey = (key) => this.handleKey(key);
  }

  // --- Banners / flow ---

  private showIntro(): void {
    this.phase = "intro";
    this.ui.hideCombatControls();
    this.ui.hideRotateControl();
    this.ui.showBanner({
      title: `Phase ${this.phaseIndex + 1}: ${this.map.name}`,
      body: `${this.map.intro}\n\n${this.objectiveText()}`,
      buttonLabel: "Begin Battle",
      onClick: () => {
        this.ui.hideBanner();
        startMusic("battle");
        this.beginNextTurn();
      },
    });
  }

  /** Battle outcome against the map's objective at the current turn count. */
  private outcome(): "player" | "enemy" | null {
    return evaluateOutcome(this.units, this.map.objective, this.turnCount);
  }

  /** Human-readable objective line for the HUD (with live survival progress). */
  private objectiveText(): string {
    const obj = this.map.objective ?? { kind: "rout" };
    switch (obj.kind) {
      case "defeat":
        return `Objective: defeat ${obj.targetName}`;
      case "survive":
        return `Objective: survive ${Math.min(this.turnCount, obj.turns)}/${obj.turns} turns`;
      case "seize":
        return "Objective: seize the marked tile";
      case "defend":
        return `Objective: hold the marked tile — ${Math.min(this.turnCount, obj.turns)}/${obj.turns} turns`;
      default:
        return "Objective: defeat all enemies";
    }
  }

  /** Target tiles to highlight permanently for seize/defend objectives. */
  private objectiveTiles(): Point[] {
    const obj = this.map.objective;
    if (!obj) return [];
    if (obj.kind === "seize" || obj.kind === "defend") return [{ x: obj.x, y: obj.y }];
    return [];
  }

  private beginNextTurn(): void {
    const winner = this.outcome();
    if (winner) return this.endBattle(winner);

    this.active = advanceToNextActor(this.units);
    if (!this.active) return;
    this.turnCount++;
    // A timed objective (survive/defend) can be met the instant the count ticks
    // up — end now, before the active actor acts on the winning turn.
    const timedWinner = this.outcome();
    if (timedWinner) return this.endBattle(timedWinner);
    this.ui.setObjective(this.objectiveText());
    this.hasMoved = false;
    this.hasActed = false;
    this.selectedSkill = null;
    this.rangeTiles = [];
    this.refreshTurnBar();
    this.ui.setActiveUnit(this.active);
    this.ui.showRotateControl(() => this.rotateView(-1), () => this.rotateView(1));
    this.ui.setRotationLabel(this.rot);

    // Frozen in time: the unit forfeits its turn (the Stop status still ticks).
    if (isStopped(this.active)) {
      this.pushTextPopup(this.active.pos, "Stop", POPUP_COLORS.status);
      this.phase = "resolving";
      this.ui.hideCombatControls();
      void this.ctx.animator.wait(0.55).then(() => this.endActiveTurn());
      return;
    }

    if (this.active.team === "player") {
      this.phase = "menu";
      this.refreshMenu();
    } else {
      this.phase = "enemy";
      this.ui.hideCombatControls();
      void this.runEnemyTurn(this.active);
    }
  }

  private endActiveTurn(): void {
    if (this.active) {
      // Damage/heal-over-time (Poison, Regen) resolve as the turn ends.
      for (const r of endTurn(this.active)) this.pushPopup(r);
      // Terrain effect (lava damage, spring heal) fires after status ticks.
      if (this.active.alive) {
        const terr = this.grid.terrainAt(this.active.pos.x, this.active.pos.y);
        const r = applyTerrainEffect(this.active, terr);
        if (r) this.pushPopup(r);
      }
    }
    this.active = null;
    this.phase = "resolving";
    this.ui.hideCombatControls();
    this.rangeTiles = [];
    // Small beat so popups/animation settle before the next actor.
    void this.ctx.animator.wait(0.15).then(() => this.beginNextTurn());
  }

  private endBattle(winner: "player" | "enemy"): void {
    this.phase = "over";
    this.active = null;
    this.ui.hideCombatControls();
    this.ui.hideRotateControl();
    this.ui.setObjective(null);
    this.ui.setActiveUnit(null);
    this.ui.setTargetInfo(null);
    stopMusic();
    if (winner === "player") {
      startMusic("victory");
      const last = this.phaseIndex >= PHASES.length - 1;
      this.ui.showBanner({
        title: "Victory!",
        body: last
          ? "Maldrath falls. The keep is yours — and with it, peace."
          : `${this.map.name} cleared. Your party regroups and grows stronger.`,
        buttonLabel: last ? "See Results" : "Continue",
        onClick: () => {
          if (last) this.ctx.nav.toVictory();
          else {
            this.ctx.state.phaseIndex = this.phaseIndex + 1;
            this.ctx.nav.toParty();
          }
        },
      });
    } else {
      this.ui.showBanner({
        title: "Defeat",
        body: "Your party has fallen. Steel yourself and try again.",
        buttonLabel: "Retry Phase",
        onClick: () => this.ctx.nav.toBattle(this.phaseIndex),
      });
    }
  }

  // --- Menu & player actions ---

  private refreshMenu(): void {
    if (!this.active) return;
    sfx.playSelect();
    this.phase = "menu";
    this.selectedSkill = null;
    this.selectedItemId = null;
    this.rangeTiles = [];
    this.ui.hideSubmenu();
    this.anchorMenuToActive();
    this.ui.showActions({
      canMove: !this.hasMoved,
      canAct: !this.hasActed,
      onMove: () => this.enterMove(),
      onAttack: () => this.enterAttack(),
      onSkill: () => this.enterSkillMenu(),
      onItem: () => this.enterItemMenu(),
      onWait: () => this.endActiveTurn(),
    });
    this.ui.setHint("Left-click to act · Right-click to cancel · Enter to end turn · , / . to rotate view");
  }

  /**
   * Anchor the action menu near the active unit's on-screen position so it
   * loads next to the unit you just clicked/moved instead of docked at the
   * bottom. Submenus reuse this anchor (the unit does not move while a menu
   * is open). Off-screen clamping is handled by the UI layer.
   */
  private anchorMenuToActive(): void {
    if (!this.active) {
      this.ui.setMenuAnchor(null);
      return;
    }
    const z = this.grid.heightAt(this.active.pos.x, this.active.pos.y);
    const p = this.projectTile(this.active.pos.x, this.active.pos.y, z);
    this.ui.setMenuAnchor({ x: p.sx, y: p.sy });
  }

  /** True only when the human player may issue input right now. */
  private get playerInControl(): boolean {
    if (this.active?.team !== "player") return false;
    if (this.ctx.animator.busy) return false;
    return (
      this.phase === "menu" ||
      this.phase === "move" ||
      this.phase === "attackTarget" ||
      this.phase === "skillTarget" ||
      this.phase === "itemTarget"
    );
  }

  private cancelToMenu(): void {
    // Never cancel while mid-resolve/animation or when it's not the player's input.
    if (!this.playerInControl || this.phase === "menu") return;
    this.refreshMenu();
  }

  private enterMove(): void {
    if (!this.active || this.hasMoved) return;
    this.phase = "move";
    this.ui.clearActions();
    this.ui.setHint("Click a highlighted tile to move there.");
    const { solid, passThrough } = moveBlockers(this.units, this.active);
    const reach = reachable(this.grid, this.active.pos, this.active.stats.move, this.active.stats.jump, solid, passThrough);
    this.rangeTiles = [...reach.destinations].map((k) => {
      const [x, y] = k.split(",").map(Number);
      return { x, y };
    });
  }

  private enterAttack(): void {
    if (!this.active || this.hasActed) return;
    this.phase = "attackTarget";
    this.ui.clearActions();
    const w = getWeapon(this.active.weaponId);
    this.ui.setHint(`Attack (range ${w.range}). Click an enemy in range.`);
    let tiles = tilesInRange(this.grid, this.active.pos, w.range, false);
    // Ranged attacks respect line of sight (walls and high ground block).
    if (w.range > 1) tiles = tiles.filter((t) => hasLineOfSight(this.grid, this.active!.pos, t));
    this.rangeTiles = tiles;
  }

  private enterSkillMenu(): void {
    if (!this.active || this.hasActed) return;
    // Usable skills = those learned from the primary class plus the secondary job.
    const usable = new Set(getClass(this.active.classId).skillIds);
    if (this.active.subClassId) for (const id of getClass(this.active.subClassId).skillIds) usable.add(id);
    const skills = this.active.learnedSkillIds
      .filter((id) => usable.has(id))
      .map(getSkill);
    this.ui.clearActions();
    this.ui.setHint("Choose a skill.");
    this.ui.showSkillMenu(
      skills,
      this.active,
      (s) => this.selectSkill(s),
      () => this.refreshMenu(),
    );
  }

  private selectSkill(skill: SkillDef): void {
    if (!this.active) return;
    this.selectedSkill = skill;
    this.ui.hideSubmenu();
    // Self-target skills resolve immediately.
    if (skill.range === 0) {
      this.castSkill(skill, this.active.pos);
      return;
    }
    this.phase = "skillTarget";
    this.ui.setHint(`${skill.name}: click a target tile in range.`);
    // Support skills (heal/buff/revive) may target the caster's own tile.
    const offensive = skill.effect === "damage" || skill.effect === "debuff";
    let tiles = tilesInRange(this.grid, this.active.pos, skill.range, !offensive);
    // Offensive ranged abilities respect line of sight (leap skills jump over obstacles).
    if (offensive && skill.range > 1 && !skill.leap) tiles = tiles.filter((t) => hasLineOfSight(this.grid, this.active!.pos, t));
    this.rangeTiles = tiles;
  }

  private enterItemMenu(): void {
    if (!this.active || this.hasActed) return;
    const inv = this.ctx.state.inventory;
    const entries = Object.entries(inv)
      .filter(([, count]) => count > 0)
      .map(([id, count]) => ({ item: getItem(id), count }));
    this.ui.clearActions();
    this.ui.setHint("Choose an item.");
    this.ui.showItemMenu(
      entries,
      (id) => this.selectItem(id),
      () => this.refreshMenu(),
    );
  }

  private selectItem(itemId: string): void {
    if (!this.active) return;
    this.selectedItemId = itemId;
    const item = getItem(itemId);
    this.ui.hideSubmenu();
    this.phase = "itemTarget";
    this.ui.setHint(`${item.name}: click an ally in range (or self).`);
    this.rangeTiles = tilesInRange(this.grid, this.active.pos, item.range, true);
  }

  // --- Click dispatch ---

  private handleClick(px: number, py: number): void {
    if (this.ctx.animator.busy) return;
    const tile = screenToTile(px, py, this.grid, this.origin, this.rot);
    if (!tile) return;
    switch (this.phase) {
      case "move":
        void this.tryMove(tile);
        return;
      case "attackTarget":
        this.tryAttack(tile);
        return;
      case "skillTarget":
        this.trySkill(tile);
        return;
      case "itemTarget":
        this.tryItem(tile);
        return;
      default:
        return;
    }
  }

  private handleKey(key: string): void {
    // Camera rotation is a pure view operation (never mutates game state), so
    // it's allowed any time — even mid-animation or on the enemy's turn.
    if (key === "," || key === "<") return this.rotateView(-1);
    if (key === "." || key === ">") return this.rotateView(1);
    // Everything below changes turn state: ignore unless the player is actively
    // in control (not mid-animation/resolve, not the enemy's turn).
    if (!this.playerInControl) return;
    if (key === "Escape") return this.cancelToMenu();
    if (key === "Enter" || key === "e" || key === "E") this.endActiveTurn();
  }

  private inRangeTiles(tile: Point): boolean {
    return this.rangeTiles.some((t) => samePoint(t, tile));
  }

  private unitAt(tile: Point): Unit | null {
    return this.units.find((u) => u.alive && samePoint(u.pos, tile)) ?? null;
  }

  private async tryMove(tile: Point): Promise<void> {
    if (!this.active || !this.inRangeTiles(tile)) return;
    if (this.unitAt(tile)) return;
    const { solid, passThrough } = moveBlockers(this.units, this.active);
    const reach = reachable(this.grid, this.active.pos, this.active.stats.move, this.active.stats.jump, solid, passThrough);
    const path = pathTo(reach, tile);
    if (!path) return;
    this.phase = "resolving";
    this.rangeTiles = [];
    this.ui.hideCombatControls();
    await this.ctx.animator.moveAlong(this.active.id, path);
    if (path.length > 1) this.active.facing = directionTo(path[path.length - 2], path[path.length - 1]);
    this.active.pos = { ...tile };
    this.hasMoved = true;
    // A move alone can satisfy a position objective (e.g. seize the marked tile),
    // so end the battle at once rather than waiting for a follow-up action.
    const winner = this.outcome();
    if (winner) return this.endBattle(winner);
    this.refreshMenu();
  }

  private tryAttack(tile: Point): void {
    if (!this.active || !this.inRangeTiles(tile)) return;
    const target = this.unitAt(tile);
    if (!target || target.team === this.active.team) return;
    const weapon = getWeapon(this.active.weaponId);
    this.active.facing = directionTo(this.active.pos, target.pos);
    this.lunge = { id: this.active.id, tx: target.pos.x, ty: target.pos.y, age: 0 };
    const res = resolveWeaponAttack(this.active, target, weapon, this.rng, this.posCtx(target.pos));
    this.pushEffect(target.pos, vfxKeyForWeapon(weapon));
    this.pushPopup(res);
    this.awardForAction(this.active, { offensive: true, killed: res.killed });
    this.awardGil(res.killed ? 1 : 0);
    // A surviving melee-struck defender may strike back.
    this.tryCounter(target, this.active);
    this.afterAction();
  }

  /** Resolve an Auto-Potion reaction for a player unit that just took damage. */
  private tryAutoPotion(unit: Unit): void {
    if (unit.team !== "player" || !unit.alive) return;
    const res = resolveAutoPotion(unit, this.ctx.state.inventory);
    if (!res) return;
    this.pushPopup(res);
  }

  /** Resolve a counterattack from `defender` against `attacker` (melee only). */
  private tryCounter(defender: Unit, attacker: Unit): void {
    // Counter provokes on an ADJACENT (melee) hit — basic attack OR melee skill,
    // any weapon range — so a range-2 spear striking point-blank still gets hit back.
    if (!defender.alive || manhattan(defender.pos, attacker.pos) !== 1) return;
    const w = getWeapon(defender.weaponId);
    defender.facing = directionTo(defender.pos, attacker.pos);
    const ctx: AttackContext = {
      heightDelta: this.grid.heightAt(defender.pos.x, defender.pos.y) - this.grid.heightAt(attacker.pos.x, attacker.pos.y),
    };
    const res = resolveCounterAttack(defender, attacker, w, this.rng, ctx);
    if (!res) return;
    this.lunge = { id: defender.id, tx: attacker.pos.x, ty: attacker.pos.y, age: 0 };
    this.pushEffect(attacker.pos, vfxKeyForWeapon(w));
    this.pushPopup(res);
    // Counter damage can drop a player attacker low enough to auto-potion.
    this.tryAutoPotion(attacker);
  }

  private trySkill(tile: Point): void {
    if (!this.active || !this.selectedSkill || !this.inRangeTiles(tile)) return;
    this.castSkill(this.selectedSkill, tile);
  }

  private castSkill(skill: SkillDef, center: Point): void {
    if (!this.active) return;
    const isOffensive = skill.effect === "damage" || skill.effect === "debuff";
    // Turn to face an offensive cast (self-targeted casts keep their facing).
    if (isOffensive && !samePoint(center, this.active.pos)) {
      this.active.facing = directionTo(this.active.pos, center);
    }
    // Leap skills: validate a real enemy victim + landing, then hop the caster
    // adjacent to it — all before any damage or cost is committed (no free teleport).
    if (skill.leap && isOffensive && !this.resolveLeapMove(skill, this.active, center)) return;
    // All occupants of every affected tile (a fallen unit may share a tile with
    // a living one); resolveSkillOnTarget null-guards inapplicable targets.
    const affected = aoeTiles(this.grid, center, skill.aoe).flatMap((t) =>
      this.units.filter((u) => samePoint(u.pos, t)),
    );

    const results: HitResult[] = [];
    let anyKilled = false;
    let support = false;
    for (const target of affected) {
      // Damage hits enemies; heal/buff/revive affect allies.
      if (isOffensive && target.team === this.active.team) continue;
      if (!isOffensive && target.team !== this.active.team) continue;
      const r = resolveSkillOnTarget(this.active, target, skill, this.rng, this.posCtx(target.pos));
      if (r) {
        results.push(r);
        if (r.killed) anyKilled = true;
        if (skill.effect !== "damage") support = true;
      }
    }
    if (results.length === 0) {
      // Nothing valid hit — let the player pick again, no cost.
      this.ui.toast("No valid target there.");
      return;
    }
    this.active.stats.mp = Math.max(0, this.active.stats.mp - skill.mpCost);
    const skillVfx = vfxKeyForSkill(skill);
    for (const r of results) {
      this.pushPopup(r);
      const u = this.units.find((x) => x.id === r.unitId);
      if (u) this.pushEffect(u.pos, skillVfx);
    }
    // A single-target melee skill provokes the surviving victim's Counter, like a
    // basic attack (tryCounter self-gates on adjacency, so ranged casts don't).
    if (isOffensive && skill.aoe === "single") {
      const victim = this.units.find((u) => u.alive && u.team !== this.active!.team && samePoint(u.pos, center));
      if (victim) this.tryCounter(victim, this.active);
    }
    this.awardGil(results.filter((r) => r.killed).length);
    // Apply knockback (single-target offensive skills only) before afterAction so
    // the new position is evaluated for terrain effects and objective checks.
    if (skill.effect === "damage" && skill.knockback) {
      const damagedTarget = results.find((r) => r.kind === "damage")
        ? this.units.find((u) => u.id === results.find((r) => r.kind === "damage")!.unitId)
        : undefined;
      if (damagedTarget) this.applyKnockback(skill, this.active, damagedTarget);
    }
    this.awardForAction(this.active, { offensive: skill.effect === "damage", killed: anyKilled, support });
    this.afterAction();
  }

  private tryItem(tile: Point): void {
    if (!this.active || !this.selectedItemId || !this.inRangeTiles(tile)) return;
    const item = getItem(this.selectedItemId);
    // Pick the occupant the item applies to: a fallen ally for revive (a living
    // unit may stand on a corpse's tile), otherwise a living ally.
    const occupants = this.units.filter((u) => samePoint(u.pos, tile) && u.team === this.active!.team);
    const target =
      item.effect === "revive" ? occupants.find((u) => !u.alive) : occupants.find((u) => u.alive);
    if (!target) return;
    const res = resolveItem(target, item.effect, item.amount, item.statusKind, item.statusDuration);
    if (!res) {
      this.ui.toast("That has no effect here.");
      return;
    }
    this.ctx.state.inventory[item.id] = Math.max(0, (this.ctx.state.inventory[item.id] ?? 0) - 1);
    this.pushPopup(res);
    this.awardForAction(this.active, { support: true });
    this.afterAction();
  }

  /**
   * Resolve a leap for a leap skill before damage. If the caster is not already
   * adjacent to the target, moves it to the nearest valid adjacent tile and
   * faces it toward the target. Returns the target's position so callers can
   * recompute positional context after the move.
   */
  /**
   * For a leap skill, hop the caster onto a tile adjacent to its single-target
   * victim before any damage or cost is committed. Returns false (with a toast)
   * when the target tile holds no living enemy or there is no room to land, so
   * the caller aborts the cast without moving or spending the action. Returns
   * true (without moving) when the caster is already adjacent — strike in place.
   */
  private resolveLeapMove(skill: SkillDef, caster: Unit, center: Point): boolean {
    if (!skill.leap || skill.aoe !== "single") return true;
    const victim = this.units.find((u) => u.alive && u.team !== caster.team && samePoint(u.pos, center));
    if (!victim) {
      if (caster.team === "player") this.ui.toast("No valid target there.");
      return false;
    }
    if (manhattan(caster.pos, victim.pos) <= 1) return true; // already adjacent — strike in place
    const land = leapLanding(this.grid, this.units, caster, victim.pos);
    if (!land) {
      if (caster.team === "player") this.ui.toast("No room to land beside the target.");
      return false;
    }
    void this.ctx.animator.moveAlong(caster.id, [caster.pos, land]);
    caster.pos = { ...land };
    caster.facing = directionTo(caster.pos, victim.pos);
    return true;
  }

  /** Shove a living single-target skill's victim directly away from the caster. */
  private applyKnockback(skill: SkillDef, caster: Unit, target: Unit): void {
    if (!skill.knockback || skill.aoe !== "single" || !target.alive) return;
    const dest = knockbackTo(this.grid, this.units, caster.pos, target.pos, skill.knockback);
    if (samePoint(dest, target.pos)) return;
    void this.ctx.animator.moveAlong(target.id, [target.pos, dest]);
    target.pos = { ...dest };
  }

  private afterAction(): void {
    this.hasActed = true;
    this.selectedSkill = null;
    this.selectedItemId = null;
    this.rangeTiles = [];
    this.ui.setActiveUnit(this.active);
    const outcome = this.outcome();
    if (outcome) {
      this.endBattle(outcome);
      return;
    }
    // The active unit can be felled by a counterattack — end its turn instead of
    // re-opening a menu over a corpse.
    if (!this.active?.alive) {
      this.endActiveTurn();
      return;
    }
    this.refreshMenu();
  }

  // --- Progression ---

  /** Add gil to the party treasury for enemies the player just defeated. */
  private awardGil(kills: number): void {
    if (kills > 0 && this.active?.team === "player") this.ctx.state.gil += kills * GIL_PER_KILL;
  }

  private awardForAction(unit: Unit, opts: { offensive?: boolean; killed?: boolean; support?: boolean }): void {
    if (unit.team !== "player") return;
    let xp = opts.offensive ? 12 : opts.support ? 10 : 8;
    let jp = opts.offensive ? 8 : opts.support ? 8 : 6;
    if (opts.killed) {
      xp += 20;
      jp += 12;
    }
    const levels = grantXp(unit, xp);
    grantJp(unit, jp);
    if (levels > 0) {
      this.ui.toast(`${unit.name} reached Lv ${unit.level}!`);
      this.ui.setActiveUnit(this.active);
    }
  }

  // --- Enemy AI ---

  private async runEnemyTurn(unit: Unit): Promise<void> {
    await this.ctx.animator.wait(0.35);
    const plan = planEnemyTurn(unit, this.units, this.grid);
    if (plan.path.length > 1) {
      await this.ctx.animator.moveAlong(unit.id, plan.path);
      unit.facing = directionTo(plan.path[plan.path.length - 2], plan.path[plan.path.length - 1]);
      unit.pos = { ...plan.destination };
    }
    await this.ctx.animator.wait(0.2);

    const heightDelta = (tp: Point): AttackContext => ({
      heightDelta: this.grid.heightAt(unit.pos.x, unit.pos.y) - this.grid.heightAt(tp.x, tp.y),
    });

    if (plan.action.kind === "attack" && plan.action.targetTile) {
      const target = this.unitAt(plan.action.targetTile);
      if (target && target.team !== unit.team) {
        const weapon = getWeapon(unit.weaponId);
        unit.facing = directionTo(unit.pos, target.pos);
        this.lunge = { id: unit.id, tx: target.pos.x, ty: target.pos.y, age: 0 };
        const res = resolveWeaponAttack(unit, target, weapon, this.rng, heightDelta(target.pos));
        this.pushEffect(target.pos, vfxKeyForWeapon(weapon));
        this.pushPopup(res);
        // The struck player unit may counter the attacker.
        this.tryCounter(target, unit);
        // A surviving low-HP player unit may auto-consume a potion.
        this.tryAutoPotion(target);
      }
    } else if (plan.action.kind === "skill" && plan.action.skillId && plan.action.targetTile) {
      const skill = getSkill(plan.action.skillId);
      const skillVfx = vfxKeyForSkill(skill);
      const center = plan.action.targetTile;
      const isOffensive = skill.effect === "damage" || skill.effect === "debuff";
      if (isOffensive && !samePoint(center, unit.pos)) unit.facing = directionTo(unit.pos, center);
      // Leap skills: relocate the caster adjacent to the target before damage; if it
      // can't land (no victim / no room) the cast is aborted — no tiles are affected.
      const leapOk = !(skill.leap && isOffensive) || this.resolveLeapMove(skill, unit, center);
      const affected = leapOk
        ? aoeTiles(this.grid, center, skill.aoe).flatMap((t) =>
            this.units.filter((u) => samePoint(u.pos, t)),
          )
        : [];
      let cast = false;
      let knockbackTarget: Unit | undefined;
      for (const target of affected) {
        if (isOffensive && target.team === unit.team) continue;
        if (!isOffensive && target.team !== unit.team) continue;
        const r = resolveSkillOnTarget(unit, target, skill, this.rng, heightDelta(target.pos));
        if (r) {
          this.pushEffect(target.pos, skillVfx);
          this.pushPopup(r);
          // A surviving low-HP player unit hit by an offensive skill may auto-heal.
          if (r.kind === "damage") {
            this.tryAutoPotion(target);
            if (!knockbackTarget) knockbackTarget = target;
          }
          cast = true;
        }
      }
      // An adjacent single-target melee skill lets the struck player unit counter —
      // resolved BEFORE knockback so the victim is still next to the attacker.
      if (isOffensive && skill.aoe === "single") {
        const victim = this.units.find((u) => u.alive && u.team !== unit.team && samePoint(u.pos, center));
        if (victim) this.tryCounter(victim, unit);
      }
      if (cast) {
        unit.stats.mp = Math.max(0, unit.stats.mp - skill.mpCost);
        if (knockbackTarget) this.applyKnockback(skill, unit, knockbackTarget);
      }
    }

    this.ui.setActiveUnit(unit);
    await this.ctx.animator.wait(0.5);
    const outcome = this.outcome();
    if (outcome) return this.endBattle(outcome);
    this.endActiveTurn();
  }

  // --- Popups ---

  private pushEffect(tile: Point, vfxKey: string): void {
    const anim = getVfx(vfxKey);
    if (!anim) return;
    if (vfxKey !== "physical" && vfxKey !== "heal" && vfxKey !== "revive" && vfxKey !== "status") {
      sfx.playMagic();
    }
    this.effects.push({ tile: { ...tile }, anim, age: 0 });
  }

  /** Floating text not tied to a HitResult (e.g. a "Stop" skip notice). */
  private pushTextPopup(tile: Point, text: string, color: string): void {
    this.popups.push({ tile: { ...tile }, text, color, age: 0, ttl: 1.1 });
  }

  private pushPopup(res: HitResult): void {
    const target = this.units.find((u) => u.id === res.unitId);
    if (!target) return;
    // Visual feedback bookkeeping.
    if (res.kind === "damage") this.hitShake.set(res.unitId, BattleScene.SHAKE_DUR);
    if (res.killed) this.deaths.set(res.unitId, 0);
    if (res.revived) this.deaths.delete(res.unitId);
    let text: string;
    let color: string;
    switch (res.kind) {
      case "damage":
        if (res.crit) sfx.playCrit();
        else sfx.playHit();
        text = res.crit ? `${res.amount}!` : `${res.amount}`;
        color = res.crit ? POPUP_COLORS.crit : POPUP_COLORS.damage;
        break;
      case "heal":
        sfx.playHeal();
        text = `+${res.amount}`;
        color = POPUP_COLORS.heal;
        break;
      case "mp":
        text = `+${res.amount} MP`;
        color = POPUP_COLORS.mp;
        break;
      case "revive":
        text = `Revive +${res.amount}`;
        color = POPUP_COLORS.revive;
        break;
      case "status":
        text = res.status ?? "status";
        color = POPUP_COLORS.status;
        break;
    }
    if (res.killed) sfx.playKO();
    this.popups.push({ tile: { ...target.pos }, text, color, age: 0, ttl: 1.1 });
  }

  private refreshTurnBar(): void {
    const order = previewOrder(this.units, 8);
    const ordered = order
      .map((p) => this.units.find((u) => u.id === p.unitId))
      .filter((u): u is Unit => !!u);
    this.ui.setTurnOrder(ordered);
  }

  /** Re-anchor the floating menu to the active unit and re-clamp after a resize
   *  (the camera re-centers, so the unit's on-screen position moves). */
  onResize(): void {
    this.anchorMenuToActive();
    this.ui.reflowFloating();
  }

  // --- Loop ---

  update(dt: number): void {
    this.time += dt;
    this.ctx.animator.update(dt);

    // Age popups.
    for (let i = this.popups.length - 1; i >= 0; i--) {
      this.popups[i].age += dt;
      if (this.popups[i].age >= this.popups[i].ttl) this.popups.splice(i, 1);
    }

    // Age spell/skill effects; cull when the animation has fully played.
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.age += dt;
      if (e.age >= e.anim.frames.length * e.anim.frameDur) this.effects.splice(i, 1);
    }

    // Advance juice timers (hit shake, death fade, attack lunge).
    for (const [id, t] of this.hitShake) {
      const left = t - dt;
      if (left <= 0) this.hitShake.delete(id);
      else this.hitShake.set(id, left);
    }
    for (const [id, age] of this.deaths) this.deaths.set(id, age + dt);
    if (this.lunge) {
      this.lunge.age += dt;
      if (this.lunge.age >= BattleScene.LUNGE_DUR) this.lunge = null;
    }

    // Hover + target info.
    const origin = this.origin;
    if (this.ctx.input.pointer && this.phase !== "over" && this.phase !== "intro") {
      this.hoverTile = screenToTile(this.ctx.input.pointer.x, this.ctx.input.pointer.y, this.grid, origin, this.rot);
    } else {
      this.hoverTile = null;
    }
    if (this.hoverTile) {
      const hovered = this.unitAt(this.hoverTile);
      this.ui.setTargetInfo(hovered && hovered !== this.active ? hovered : null);
    } else {
      this.ui.setTargetInfo(null);
    }

    this.ctx.renderer.render(this.buildView(origin));
  }

  private buildView(origin: ScreenPoint): BattleView {
    const overlays: OverlaySet = { move: [], attack: [], aoe: [], path: [], objective: this.objectiveTiles() };
    if (this.phase === "move") {
      overlays.move = this.rangeTiles;
      if (this.hoverTile && this.inRangeTiles(this.hoverTile) && this.active) {
        const { solid, passThrough } = moveBlockers(this.units, this.active);
        const reach = reachable(this.grid, this.active.pos, this.active.stats.move, this.active.stats.jump, solid, passThrough);
        overlays.path = pathTo(reach, this.hoverTile) ?? [];
      }
    } else if (this.phase === "attackTarget" || this.phase === "itemTarget") {
      overlays.attack = this.rangeTiles;
    } else if (this.phase === "skillTarget") {
      overlays.attack = this.rangeTiles;
      if (this.hoverTile && this.selectedSkill && this.inRangeTiles(this.hoverTile)) {
        overlays.aoe = aoeTiles(this.grid, this.hoverTile, this.selectedSkill.aoe);
      }
    }
    let forecast: ForecastTag | null = null;
    if (this.active && this.hoverTile && this.inRangeTiles(this.hoverTile)) {
      forecast = this.computeForecast(this.hoverTile);
    }

    return {
      grid: this.grid,
      units: this.units,
      origin,
      rot: this.rot,
      activeUnitId: this.active?.id ?? null,
      hoverTile: this.hoverTile,
      overlays,
      popups: this.popups,
      animPos: this.ctx.animator.animPos,
      effects: this.effects,
      unitOffsets: this.computeUnitOffsets(),
      deathFade: this.deaths,
      forecast,
      time: this.time,
    };
  }

  /** Per-unit pixel offsets for hit shake and attack lunge. */
  private computeUnitOffsets(): Map<string, { dx: number; dy: number }> {
    const offsets = new Map<string, { dx: number; dy: number }>();
    for (const [id, remaining] of this.hitShake) {
      const amp = (remaining / BattleScene.SHAKE_DUR) * 3;
      offsets.set(id, { dx: Math.sin(this.time * 70) * amp, dy: 0 });
    }
    if (this.lunge) {
      const att = this.units.find((u) => u.id === this.lunge!.id);
      if (att) {
        const za = this.grid.heightAt(att.pos.x, att.pos.y);
        const a = this.projectTile(att.pos.x, att.pos.y, za);
        const zt = this.grid.heightAt(this.lunge.tx, this.lunge.ty);
        const t = this.projectTile(this.lunge.tx, this.lunge.ty, zt);
        let vx = t.sx - a.sx;
        let vy = t.sy - a.sy;
        const m = Math.hypot(vx, vy) || 1;
        vx /= m;
        vy /= m;
        const f = Math.sin(Math.min(1, this.lunge.age / BattleScene.LUNGE_DUR) * Math.PI) * 7;
        const prev = offsets.get(this.lunge.id) ?? { dx: 0, dy: 0 };
        offsets.set(this.lunge.id, { dx: prev.dx + vx * f, dy: prev.dy + vy * f });
      }
    }
    return offsets;
  }

  /** Damage/heal preview for the hovered target, given the current action. */
  private computeForecast(tile: Point): ForecastTag | null {
    if (!this.active) return null;
    const occupants = this.units.filter((u) => samePoint(u.pos, tile));
    const enemy = occupants.find((u) => u.alive && u.team !== this.active!.team);
    const ally = occupants.find((u) => u.alive && u.team === this.active!.team);
    const deadAlly = occupants.find((u) => !u.alive && u.team === this.active!.team);

    if (this.phase === "attackTarget") {
      if (!enemy) return null;
      const f = forecastWeapon(this.active, enemy, getWeapon(this.active.weaponId), this.posCtx(enemy.pos));
      return { tile, text: f.lethal ? `${f.amount} · KO` : `${f.amount}`, color: POPUP_COLORS.damage, strong: f.lethal };
    }

    if (this.phase === "skillTarget" && this.selectedSkill) {
      const s = this.selectedSkill;
      if (s.effect === "damage") {
        if (!enemy) return null;
        const f = forecastSkill(this.active, enemy, s, this.posCtx(enemy.pos));
        let text = f.lethal ? `${f.amount} · KO` : `${f.amount}`;
        if (f.affinity === "weak") text += " · weak";
        else if (f.affinity === "resist") text += " · resist";
        return { tile, text, color: POPUP_COLORS.damage, strong: f.lethal || f.affinity === "weak" };
      }
      if (s.effect === "heal") {
        if (!ally) return null;
        const f = forecastSkill(this.active, ally, s);
        const real = Math.min(f.amount, ally.stats.maxHp - ally.stats.hp);
        return real > 0 ? { tile, text: `+${real}`, color: POPUP_COLORS.heal, strong: false } : null;
      }
      if (s.effect === "revive") {
        if (!deadAlly) return null;
        return { tile, text: "Revive", color: POPUP_COLORS.revive, strong: false };
      }
      if (s.effect === "buff" || s.effect === "debuff") {
        const t = s.effect === "buff" ? ally : enemy;
        if (!t || !s.statusKind) return null;
        return { tile, text: s.statusKind, color: POPUP_COLORS.status, strong: false };
      }
      return null;
    }

    if (this.phase === "itemTarget" && this.selectedItemId) {
      const item = getItem(this.selectedItemId);
      if (item.effect === "healHp") {
        if (!ally) return null;
        const real = Math.min(item.amount, ally.stats.maxHp - ally.stats.hp);
        return real > 0 ? { tile, text: `+${real}`, color: POPUP_COLORS.heal, strong: false } : null;
      }
      if (item.effect === "healMp") {
        if (!ally) return null;
        const real = Math.min(item.amount, ally.stats.maxMp - ally.stats.mp);
        return real > 0 ? { tile, text: `+${real} MP`, color: POPUP_COLORS.mp, strong: false } : null;
      }
      if (item.effect === "revive") {
        if (!deadAlly) return null;
        return { tile, text: "Revive", color: POPUP_COLORS.revive, strong: false };
      }
      if (item.effect === "buff") {
        if (!ally || !item.statusKind) return null;
        return { tile, text: item.statusKind, color: POPUP_COLORS.status, strong: false };
      }
    }
    return null;
  }

  dispose(): void {
    stopMusic();
    this.ui.destroy();
    this.ctx.input.reset();
    this.ctx.animator.clear();
  }
}
