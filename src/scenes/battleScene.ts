import type { BattleRewards, Direction, HeroXpResult, LevelUpInfo, Loot, MapDef, Point, SkillDef, Unit } from "../core/types";
import { RNG } from "../core/rng";
import { grantSp, createUnit, xpForLevel } from "../core/unit";
import { ACTION_XP_OFFENSIVE, ACTION_XP_SUPPORT, battleClearXp, grantXpTracked, xpForFinisher, xpForKill } from "../core/progression";
import { DIALOGUE_ENABLED } from "../core/config";
import { rollBattleDrops, rollEnemyDrop } from "../data/loot";
import { enemyLevelFor, partyAverageLevel, enemyTierOffset, refreshForBattle, survivorsAfterBattle, goldForKill } from "../core/state";
import { Grid, manhattan, moveBlockers, samePoint, zoneOfControl } from "../battle/grid";
import { pathTo, reachable } from "../battle/pathfinding";
import { aoeTiles, knockbackTo, leapLanding, tilesInRange } from "../battle/targeting";
import {
  applyTerrainEffect,
  canRecruit,
  RECRUIT_HP_FRACTION,
  coverFor,
  fallDamage,
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
import { screenToTile, worldToScreen, rotateTile, type Rotation, type ScreenPoint } from "../engine/iso";
import { sfx } from "../engine/audio";
import { startMusic, stopMusic, battleThemeForPhase } from "../engine/music";
import { actionForKey, getBinding, formatKey } from "../engine/keybindings";
import type { ActiveEffect, FloatingText } from "../engine/renderer";
import { getWeapon } from "../data/weapons";
import { getSkill } from "../data/skills";
import { getItem } from "../data/items";
import { getClass } from "../data/classes";
import { getVfx, vfxKeyForSkill, vfxKeyForWeapon } from "../data/sprites";
import { PHASES } from "../data/maps";
import { scatterProps, type PlacedProp } from "../data/props";
import type { PropSpriteId } from "../data/sprites/props";
import { dialogueFor, outroFor } from "../data/dialogue";
import { MAX_PARTY } from "../data/party";
import { BattleUI } from "../ui/battleUI";
import { formatHit } from "../battle/log";
import type { GameContext, Scene } from "./sceneManager";
import { POPUP_COLORS, SHAKE_DUR, LUNGE_DUR, SCREEN_SHAKE_DUR, buildView } from "./battleView";

type Phase =
  | "intro"
  | "starting"
  | "menu"
  | "move"
  | "attackTarget"
  | "skillTarget"
  | "itemTarget"
  | "recruitTarget"
  | "enemy"
  | "resolving"
  | "over";

export class BattleScene implements Scene {
  private grid: Grid;
  private units: Unit[] = [];
  private ui: BattleUI;
  private rng = new RNG(0x1234 + 17);

  private phase: Phase = "intro";
  private active: Unit | null = null;
  private hasMoved = false;
  private hasActed = false;
  private preMove: { pos: Point; facing: Direction } | null = null;
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
  private screenShake = 0; // seconds of whole-scene impact shake remaining
  private time = 0;

  private static readonly LOG_CAP = 60;

  private log: string[] = [];

  // --- Live progression / treasure / rewards (this battle) ---
  /** enemyId -> player unit ids that damaged or debuffed it (kill participation). */
  private participants = new Map<string, Set<string>>();
  /** playerId -> XP earned this battle (kill + action + clear), for the rewards screen. */
  private xpEarned = new Map<string, number>();
  /** Level-up events captured mid-battle, drained into the level-up card. */
  private levelUps: LevelUpInfo[] = [];
  /** playerId -> level at battle start, so the rewards screen shows net growth. */
  private startLevels = new Map<string, number>();
  /** Gold earned this battle (kill bounties + chest gold). */
  private goldEarned = 0;
  /** Item ids found this battle (chests + enemy drops + victory spoils). */
  private itemsFound: string[] = [];
  /** playerId -> contribution tally driving the MVP callout. */
  private tally = new Map<string, { damage: number; kills: number; heals: number }>();
  /** Runtime treasure chests seated from the map, with their opened state. */
  private chests: { pos: Point; loot: Loot; opened: boolean }[] = [];
  /** Decoration props (procedural scatter + authored decor) for this battle. */
  private props: PlacedProp[] = [];

  constructor(
    private ctx: GameContext,
    private map: MapDef,
    private phaseIndex: number,
  ) {
    this.grid = new Grid(map);
    this.ctx.renderer.resetTileCache();
    this.props = [
      ...scatterProps(this.map, this.grid),
      ...(this.map.decor ?? []).map((d) => ({ pos: { ...d.pos }, propId: d.propId as PropSpriteId })),
    ];
    this.ui = new BattleUI(ctx.uiParent);
    this.buildUnits();
    this.bindInput();
    // Dev cheat bar — loaded only on the local Vite dev server. The guard folds
    // to `false` in a production build, so Vite tree-shakes both the dynamic
    // import and the entire battleDevTools module out of the shipped bundle.
    if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) {
      void import("./battleDevTools").then((m) => m.setupDevBar(this));
    }
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
    // Enemies scale to the party so the fight is always winnable: their level
    // tracks the party average (a notch below on Normal), and a per-enemy tier
    // offset (relative to the map's weakest authored level) keeps the grunt/elite
    // spread without spiking far above the party.
    const partyAvg = partyAverageLevel(party);
    const mapMin = this.map.enemies.length ? Math.min(...this.map.enemies.map((e) => e.level)) : 1;
    for (const e of this.map.enemies) {
      this.units.push(
        createUnit({
          name: e.name,
          team: "enemy",
          classId: e.classId,
          level: enemyLevelFor(partyAvg, enemyTierOffset(e.level, mapMin), this.ctx.state.difficulty, this.ctx.state.ngPlus),
          pos: e.pos,
          weaponId: e.weaponId,
          learnedSkillIds: e.skillIds ?? [],
          personality: e.personality,
          raceId: e.raceId,
        }),
      );
    }
    // Seat guest allies (e.g. an escort VIP) as player-team units. Not difficulty-
    // scaled and not added to the persistent party roster.
    for (const a of this.map.allies ?? []) {
      this.units.push(
        createUnit({
          name: a.name,
          team: "player",
          classId: a.classId,
          level: a.level,
          pos: a.pos,
          weaponId: a.weaponId,
          learnedSkillIds: a.skillIds ?? [],
          personality: a.personality,
          raceId: a.raceId,
        }),
      );
    }
    // Point everyone toward the enemy they're about to fight.
    for (const u of this.units) u.facing = this.facingTowardFoes(u);
    // Snapshot every roster member's starting level (present, fallen, or benched)
    // so the rewards screen can show net growth, and seat the map's treasure chests.
    for (const u of party) this.startLevels.set(u.id, u.level);
    this.chests = (this.map.chests ?? []).map((c) => ({ pos: { ...c.pos }, loot: c.loot, opened: false }));
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

  private get camera(): { origin: ScreenPoint; scale: number } {
    return this.ctx.renderer.computeCamera(this.grid, this.rot);
  }

  /** Project a logical tile to its on-screen (CSS px) center under the current
   *  rotation + fit scale. */
  private projectTile(x: number, y: number, z: number): ScreenPoint {
    const { origin, scale } = this.camera;
    const v = rotateTile(x, y, this.rot, this.grid.width, this.grid.height);
    const p = worldToScreen(v.x, v.y, z, origin);
    return { sx: p.sx * scale, sy: p.sy * scale };
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
    // Play the chapter's story scene first (if any), then the Begin-Battle banner.
    // Dialogue is currently disabled (DIALOGUE_ENABLED) — go straight to the banner.
    const intro = DIALOGUE_ENABLED ? dialogueFor(this.map.id) : [];
    this.ui.showDialogue(intro, () => this.showIntroBanner());
  }

  private showIntroBanner(): void {
    this.ui.showBanner({
      title: `Phase ${this.phaseIndex + 1}: ${this.map.name}`,
      body: `${this.map.intro}\n\n${this.objectiveText()}`,
      buttonLabel: "Begin Battle",
      onClick: () => {
        this.ui.hideBanner();
        startMusic(battleThemeForPhase(this.phaseIndex));
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
      case "escort": {
        const vip = this.units.find((u) => u.team === "player" && u.name === obj.vipName);
        const hpStr = vip?.alive ? ` (${vip.stats.hp}/${vip.stats.maxHp} HP)` : "";
        return `Objective: escort ${obj.vipName} to the marked tile${hpStr}`;
      }
      default:
        return "Objective: defeat all enemies";
    }
  }

  private beginNextTurn(): void {
    // Already resolved (e.g. a dev shortcut ended the battle mid-animation) —
    // never re-enter the turn loop and re-show combat controls over the banner.
    if (this.phase === "over") return;
    const winner = this.outcome();
    if (winner) return this.endBattle(winner);

    this.active = advanceToNextActor(this.units);
    if (!this.active) return;
    this.ui.setObjective(this.objectiveText());
    this.hasMoved = false;
    this.hasActed = false;
    this.preMove = null;
    this.selectedSkill = null;
    this.rangeTiles = [];
    this.refreshTurnBar();
    this.ui.setActiveUnit(this.active);
    this.ui.showRotateControl(() => this.rotateView(-1), () => this.rotateView(1));
    this.ui.setRotationLabel(this.rot);
    this.pushLog(`— ${this.active.name}'s turn —`);

    // Frozen in time: the unit forfeits its turn (the Stop status still ticks).
    if (isStopped(this.active)) {
      this.pushTextPopup(this.active.pos, "Stop", POPUP_COLORS.status);
      this.phase = "resolving";
      this.ui.hideCombatControls();
      void this.ctx.animator.wait(0.55).then(() => this.endActiveTurn());
      return;
    }

    // Charged skill: tick the counter; resolve or keep waiting.
    if (this.active.charging) {
      this.active.charging.turnsLeft -= 1;
      if (this.active.charging.turnsLeft <= 0) {
        // Charge complete — resolve now.
        const stored = this.active.charging;
        this.active.charging = undefined;
        const skill = getSkill(stored.skillId);
        this.pushTextPopup(this.active.pos, `${skill.name}!`, POPUP_COLORS.damage);
        this.pushLog(`${this.active.name}'s ${skill.name} crashes down!`);
        this.phase = "resolving";
        this.ui.hideCombatControls();
        this.resolveCast(skill, this.active, stored.target, true);
      } else {
        // Still charging — show a reminder and skip the turn.
        this.pushTextPopup(this.active.pos, "Charging…", POPUP_COLORS.status);
        this.phase = "resolving";
        this.ui.hideCombatControls();
        void this.ctx.animator.wait(0.55).then(() => this.endActiveTurn());
      }
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
    // The battle may have ended underneath an in-flight async turn (e.g. a dev
    // shortcut, or a resolution that already won) — don't run the turn loop on
    // top of a finished battle.
    if (this.phase === "over") return;
    if (this.active) {
      // Damage/heal-over-time (Poison, Regen) resolve as the turn ends. A poison
      // tick can finish off an enemy — credit that kill to whoever damaged/​debuffed it.
      for (const r of endTurn(this.active)) {
        this.pushPopup(r);
        if (r.killed) this.creditEnvironmentalKill(this.active);
      }
      // Terrain effect (lava damage, spring heal) fires after status ticks.
      if (this.active.alive) {
        const terr = this.grid.terrainAt(this.active.pos.x, this.active.pos.y);
        const r = applyTerrainEffect(this.active, terr);
        if (r) {
          this.pushPopup(r);
          if (r.killed) this.creditEnvironmentalKill(this.active);
        }
      }
      // Count a COMPLETED turn (drives survive/defend objectives). The next
      // beginNextTurn's outcome check ends the battle if the count is now met,
      // before the following actor gets to act.
      this.turnCount++;
    }
    this.active = null;
    this.phase = "resolving";
    this.ui.hideCombatControls();
    this.rangeTiles = [];
    // Small beat so popups/animation settle before the next actor; drain any
    // level-up cards (e.g. from a counter-kill on the enemy's turn) unless the
    // battle just ended (the spoils screen will summarize that growth).
    void this.ctx.animator.wait(0.15).then(() => {
      if (this.outcome()) return this.beginNextTurn();
      this.drainLevelUps(() => this.beginNextTurn());
    });
  }

  private endBattle(winner: "player" | "enemy"): void {
    if (this.phase === "over") return; // idempotent — ignore repeat/late calls
    this.phase = "over";
    this.active = null;
    this.ui.hideCombatControls();
    this.ui.hideRotateControl();
    this.ui.setObjective(null);
    this.ui.setActiveUnit(null);
    this.ui.setTargetInfo(null);
    stopMusic();
    if (winner === "player") {
      // Surviving recruited units join the persistent party FIRST, so the fixed
      // battle-clear XP and the spoils screen cover them too (up to MAX_PARTY).
      for (const u of this.units) {
        if (!u.recruited || !u.alive) continue;
        if (this.ctx.state.party.some((p) => p.id === u.id)) continue;
        if (this.ctx.state.party.length >= MAX_PARTY) break;
        // Re-id so the recruit can't collide with fresh enemy ids ("eN") in a
        // later battle (createUnit's counter resets on reload). Safe here — the
        // battle is over, so no in-flight animation references this unit's id.
        // Carry its battle ledgers (earned XP, tally) onto the new id.
        const oldId = u.id;
        u.id = `recruit-${u.id}`;
        this.remapLedgers(oldId, u.id);
        this.ctx.state.party.push(u);
        this.pushLog(`${u.name} has joined the Ashen Banner permanently!`);
      }
      // Fixed battle-clear XP equally to the whole roster (present, fallen, or
      // benched — and now any fresh recruits), then the victory item drops.
      this.awardBattleClearXp();
      this.rollVictoryDrops();
      // Classic mode: fallen heroes are lost for good. Prune the dead after
      // recruits have joined (a recruit that died was already excluded above).
      if (this.ctx.state.permadeath) {
        this.ctx.state.party = survivorsAfterBattle(this.ctx.state.party, true);
      }
      startMusic("victory");
      const last = this.phaseIndex >= PHASES.length - 1;
      this.ui.showBanner({
        title: "Victory!",
        body: last
          ? "Maldrath falls. The keep is yours — and with it, peace."
          : `${this.map.name} cleared. Your party regroups and grows stronger.`,
        buttonLabel: "See Spoils",
        onClick: () => {
          this.ui.hideBanner();
          const proceed = () => {
            if (last) this.ctx.nav.toVictory();
            else {
              this.ctx.state.phaseIndex = this.phaseIndex + 1;
              this.ctx.nav.toParty();
            }
          };
          // Spoils screen (gold + items + per-hero XP), then the chapter outro
          // (currently disabled), then on to camp / the victory screen.
          sfx.playFanfare();
          this.ui.showRewards(this.computeRewards(), () => {
            const outroLines = DIALOGUE_ENABLED ? outroFor(this.map.id) : [];
            if (outroLines.length > 0) this.ui.showDialogue(outroLines, proceed);
            else proceed();
          });
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
    const hasRecruitTarget = !this.hasActed && this.active !== null &&
      this.units.some((u) => canRecruit(this.active!, u));
    this.ui.showActions({
      canMove: !this.hasMoved,
      canAct: !this.hasActed,
      canUndo: this.hasMoved && !this.hasActed && this.preMove !== null,
      canRecruit: hasRecruitTarget,
      onMove: () => this.enterMove(),
      onAttack: () => this.enterAttack(),
      onSkill: () => this.enterSkillMenu(),
      onItem: () => this.enterItemMenu(),
      onWait: () => this.endActiveTurn(),
      onUndo: () => this.undoMove(),
      onRecruit: () => this.enterRecruit(),
    });
    this.ui.setHint(`M Move · A Attack · S Skill · I Item · Enter/${formatKey(getBinding("endTurn"))} end turn · Right-click/${formatKey(getBinding("cancel"))} cancel · ${formatKey(getBinding("rotateLeft"))}/${formatKey(getBinding("rotateRight"))} rotate view`);
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
      this.phase === "itemTarget" ||
      this.phase === "recruitTarget"
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
    const zoc = zoneOfControl(this.units, this.active.team);
    const reach = reachable(this.grid, this.active.pos, this.active.stats.move, this.active.stats.jump, solid, passThrough, zoc);
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

  private enterRecruit(): void {
    if (!this.active || this.hasActed) return;
    this.phase = "recruitTarget";
    this.ui.clearActions();
    this.ui.setHint("Recruit: click an adjacent weakened enemy to bring them to your side.");
    // Only highlight enemies that satisfy canRecruit right now.
    this.rangeTiles = this.units
      .filter((u) => canRecruit(this.active!, u))
      .map((u) => ({ ...u.pos }));
  }

  private tryRecruit(tile: Point): void {
    if (!this.active || !this.inRangeTiles(tile)) return;
    const target = this.unitAt(tile);
    if (!target || !canRecruit(this.active, target)) return;
    // Flip the unit to the player's side.
    target.team = "player";
    target.recruited = true;
    target.facing = this.active.facing;
    this.ui.toast(`${target.name} joins your cause!`);
    this.pushLog(`${target.name} turns and fights for the Ashen Banner!`);
    this.afterAction();
  }

  // --- Click dispatch ---

  private handleClick(px: number, py: number): void {
    if (this.ctx.animator.busy) return;
    const cam = this.camera;
    const tile = screenToTile(px, py, this.grid, cam.origin, this.rot, cam.scale);
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
      case "recruitTarget":
        this.tryRecruit(tile);
        return;
      default:
        return;
    }
  }

  private handleKey(key: string): void {
    const action = actionForKey(key);
    // Camera rotation is a pure view operation (never mutates game state), so
    // it's allowed any time — even mid-animation or on the enemy's turn.
    if (action === "rotateLeft") return this.rotateView(-1);
    if (action === "rotateRight") return this.rotateView(1);
    // Enter always works as an end-turn shortcut regardless of bindings so
    // players aren't locked out if they rebind the "e" key to something else.
    if (key === "Enter") {
      if (this.playerInControl) this.endActiveTurn();
      return;
    }
    // Everything below changes turn state: ignore unless the player is actively
    // in control (not mid-animation/resolve, not the enemy's turn).
    if (!this.playerInControl) return;
    if (action === "cancel") return this.cancelToMenu();
    if (action === "endTurn") return this.endActiveTurn();
    // Menu-only action shortcuts: M/A/S/I open the same flows as the buttons,
    // each gated on the same canMove/canAct guard the menu uses.
    if (this.phase === "menu") {
      const k = key.toLowerCase();
      const canMove = !this.hasMoved;
      const canAct = !this.hasActed;
      if (k === "m" && canMove) return this.enterMove();
      if (k === "a" && canAct) return this.enterAttack();
      if (k === "s" && canAct) return this.enterSkillMenu();
      if (k === "i" && canAct) return this.enterItemMenu();
    }
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
    const zoc = zoneOfControl(this.units, this.active.team);
    const reach = reachable(this.grid, this.active.pos, this.active.stats.move, this.active.stats.jump, solid, passThrough, zoc);
    const path = pathTo(reach, tile);
    if (!path) return;
    this.preMove = { pos: { ...this.active.pos }, facing: this.active.facing };
    this.phase = "resolving";
    this.rangeTiles = [];
    this.ui.hideCombatControls();
    await this.ctx.animator.moveAlong(this.active.id, path);
    if (path.length > 1) this.active.facing = directionTo(path[path.length - 2], path[path.length - 1]);
    this.active.pos = { ...tile };
    this.hasMoved = true;
    // Landing on a treasure chest opens it (gold + items into the spoils).
    this.tryOpenChest();
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
    // NOTE: the damage forecast preview still shows the original target — Cover is
    // a reactive interception (like Counter), not previewed before the hit resolves.
    const actual = coverFor(target, this.units) ?? target;
    if (actual !== target) this.ui.toast(`${actual.name} covers ${target.name}!`);
    const res = resolveWeaponAttack(this.active, actual, weapon, this.rng, this.posCtx(actual.pos));
    this.pushEffect(actual.pos, vfxKeyForWeapon(weapon));
    this.pushPopup(res);
    // Credit kill-participation against the unit actually struck — Cover may have
    // redirected the hit onto `actual` rather than the originally-aimed `target`.
    this.registerHit(this.active, actual, res.kind === "damage" ? res.amount : 0);
    if (res.killed) this.awardKill(actual, this.active.id);
    this.awardForAction(this.active, { offensive: true, killed: res.killed });
    this.awardGold(res.killed ? 1 : 0);
    // A surviving melee-struck defender may strike back.
    this.tryCounter(actual, this.active);
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
    // Reaction flourish: a distinct riposte sting + a light jolt so the counter
    // reads as a deliberate strike-back, not just a second swing. (pushPopup still
    // layers the normal hit/crit/death cues for the counter's own damage.)
    sfx.playCounter();
    this.shakeScreen(0.5);
    this.pushEffect(attacker.pos, vfxKeyForWeapon(w));
    this.pushPopup(res);
    // Counter damage can drop a player attacker low enough to auto-potion.
    this.tryAutoPotion(attacker);
    // Kill-participation for a player defender countering an enemy attacker
    // (no-ops when the defender is an enemy countering a player).
    this.registerHit(defender, attacker, res.kind === "damage" ? res.amount : 0);
    // A counter kill still earns the defender its kill rewards (the active actor
    // is the attacker, so the normal award path would miss it).
    if (res.killed) {
      this.creditKill(defender);
      this.awardKill(attacker, defender.id);
    }
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

    // Validate that the cast would actually hit something before committing any
    // cost — required for both normal and charged casts.
    const affected = aoeTiles(this.grid, center, skill.aoe).flatMap((t) =>
      this.units.filter((u) => samePoint(u.pos, t)),
    );
    const hasValidTarget = affected.some((target) => {
      if (isOffensive && target.team === this.active!.team) return false;
      if (!isOffensive && target.team !== this.active!.team) return false;
      return true;
    });
    if (!hasValidTarget) {
      this.ui.toast("No valid target there.");
      return;
    }

    // Charged skill: spend MP now, store the charge, and let it resolve next turn.
    if (skill.chargeTime && skill.chargeTime > 0) {
      this.active.stats.mp = Math.max(0, this.active.stats.mp - skill.mpCost);
      this.active.charging = { skillId: skill.id, target: { ...center }, turnsLeft: skill.chargeTime };
      this.pushTextPopup(this.active.pos, `Charging ${skill.name}…`, POPUP_COLORS.status);
      this.pushLog(`${this.active.name} begins charging ${skill.name}!`);
      this.afterAction();
      return;
    }

    this.resolveCast(skill, this.active, center);
  }

  /**
   * Perform the actual hit resolution for a skill cast. Called directly for
   * instant skills, or from beginNextTurn when a charged skill's timer expires.
   * Does NOT re-enter the charging path — always resolves immediately.
   * `fromCharge` — when true, ends the active turn instead of opening a menu
   *   (the charge resolution IS the full turn activation).
   */
  private resolveCast(skill: SkillDef, caster: Unit, center: Point, fromCharge = false): void {
    const isOffensive = skill.effect === "damage" || skill.effect === "debuff";
    const affected = aoeTiles(this.grid, center, skill.aoe).flatMap((t) =>
      this.units.filter((u) => samePoint(u.pos, t)),
    );

    const results: HitResult[] = [];
    let anyKilled = false;
    let support = false;
    for (const target of affected) {
      // Damage hits enemies; heal/buff/revive affect allies.
      if (isOffensive && target.team === caster.team) continue;
      if (!isOffensive && target.team !== caster.team) continue;
      // Cover intercepts single-target offensive hits only (not AoE, not heals/buffs/revives).
      // NOTE: the damage forecast preview still shows the original target — Cover is
      // a reactive interception (like Counter), not previewed before the hit resolves.
      const actual = (isOffensive && skill.aoe === "single") ? (coverFor(target, this.units) ?? target) : target;
      if (actual !== target) this.ui.toast(`${actual.name} covers ${target.name}!`);
      const ctx: AttackContext = {
        heightDelta: this.grid.heightAt(caster.pos.x, caster.pos.y) - this.grid.heightAt(actual.pos.x, actual.pos.y),
      };
      const r = resolveSkillOnTarget(caster, actual, skill, this.rng, ctx);
      if (r) {
        results.push(r);
        if (r.killed) anyKilled = true;
        if (skill.effect !== "damage") support = true;
        // Live progression: an offensive hit/debuff registers kill-participation
        // (and credits the kill); a heal on an ally feeds the MVP tally.
        if (isOffensive) {
          this.registerHit(caster, actual, r.kind === "damage" ? r.amount : 0);
          if (r.killed) this.awardKill(actual, caster.id);
        } else if (r.kind === "heal") {
          this.bumpTally(caster.id, "heals", r.amount);
        }
      }
    }
    if (results.length === 0) {
      // Targets may have died or moved since the charge was set — silently fizzle.
      if (fromCharge) this.endActiveTurn();
      return;
    }
    // MP was already deducted at charge time for charged skills; deduct now for instant ones.
    if (!(skill.chargeTime && skill.chargeTime > 0)) {
      caster.stats.mp = Math.max(0, caster.stats.mp - skill.mpCost);
    }
    const skillVfx = vfxKeyForSkill(skill);
    for (const r of results) {
      this.pushPopup(r);
      const u = this.units.find((x) => x.id === r.unitId);
      if (u) this.pushEffect(u.pos, skillVfx);
    }
    // A single-target melee skill provokes the surviving victim's Counter, like a
    // basic attack (tryCounter self-gates on adjacency, so ranged casts don't).
    // After a possible cover redirect, the actual hit unit is found via the result
    // rather than by tile position (the redirected unit may not be at `center`).
    if (isOffensive && skill.aoe === "single") {
      const damageResult = results.find((r) => r.kind === "damage");
      const victim = damageResult
        ? this.units.find((u) => u.alive && u.id === damageResult.unitId)
        : this.units.find((u) => u.alive && u.team !== caster.team && samePoint(u.pos, center));
      if (victim) this.tryCounter(victim, caster);
    }
    this.awardGold(results.filter((r) => r.killed).length);
    // Apply knockback (single-target offensive skills only) before afterAction so
    // the new position is evaluated for terrain effects and objective checks. A
    // shove off a ledge can land the killing blow — credit that kill too.
    let fellKill = false;
    if (skill.effect === "damage" && skill.knockback) {
      const damagedTarget = results.find((r) => r.kind === "damage")
        ? this.units.find((u) => u.id === results.find((r) => r.kind === "damage")!.unitId)
        : undefined;
      if (damagedTarget) {
        fellKill = this.applyKnockback(skill, caster, damagedTarget);
        if (fellKill) this.awardKill(damagedTarget, caster.id);
      }
    }
    if (fellKill) this.awardGold(1);
    this.awardForAction(caster, { offensive: skill.effect === "damage", killed: anyKilled || fellKill, support });
    if (fromCharge) {
      // The charge resolution IS the full turn — end it directly (no menu re-open).
      this.endActiveTurn();
    } else {
      this.afterAction();
    }
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
    if (res.kind === "heal") this.bumpTally(this.active.id, "heals", res.amount);
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

  /** Shove or pull a target; returns true if the displacement fall killed it. */
  private applyKnockback(skill: SkillDef, caster: Unit, target: Unit): boolean {
    if (!skill.knockback || skill.aoe !== "single" || !target.alive) return false;
    const from = target.pos;
    const dest = knockbackTo(this.grid, this.units, caster.pos, from, skill.knockback, skill.pull ?? false, skill.throwOver ?? false);
    if (samePoint(dest, from)) return false;
    const drop = this.grid.heightAt(from.x, from.y) - this.grid.heightAt(dest.x, dest.y);
    void this.ctx.animator.moveAlong(target.id, [from, dest]);
    target.pos = { ...dest };
    // Shoved off a ledge? Take fall damage on landing.
    const fall = fallDamage(target, drop);
    if (fall) {
      this.pushPopup(fall);
      return fall.killed;
    }
    return false;
  }

  private afterAction(): void {
    this.hasActed = true;
    this.preMove = null;
    this.selectedSkill = null;
    this.selectedItemId = null;
    this.rangeTiles = [];
    this.ui.setActiveUnit(this.active);
    const outcome = this.outcome();
    if (outcome) {
      this.endBattle(outcome);
      return;
    }
    // Pop any level-up cards earned by this action before continuing the turn.
    this.drainLevelUps(() => {
      // The active unit can be felled by a counterattack — end its turn instead
      // of re-opening a menu over a corpse.
      if (!this.active?.alive) {
        this.endActiveTurn();
        return;
      }
      this.refreshMenu();
    });
  }

  private undoMove(): void {
    if (!this.active || !this.preMove || this.hasActed) return;
    this.active.pos = { ...this.preMove.pos };
    this.active.facing = this.preMove.facing;
    this.hasMoved = false;
    this.preMove = null;
    this.anchorMenuToActive();
    this.refreshMenu();
  }

  // --- Progression (live XP, kills, treasure, rewards) ---

  /** Add gold to the treasury (and this battle's tally) for enemies just
   *  defeated. The bounty scales with the chapter so the treasury keeps pace. */
  private awardGold(kills: number): void {
    if (kills > 0 && this.active?.team === "player") {
      const g = kills * goldForKill(this.ctx.state.phaseIndex);
      this.ctx.state.gold += g;
      this.goldEarned += g;
      this.pushTextPopup(this.active.pos, `+${g}g`, POPUP_COLORS.crit);
    }
  }

  /** Gold + SP for a kill landed outside the actor's own action (e.g. a
   *  counterattack on the enemy's turn). Kill XP is credited separately via
   *  awardKill at the call site. No-op for enemies. */
  private creditKill(killer: Unit): void {
    if (killer.team !== "player") return;
    const g = goldForKill(this.ctx.state.phaseIndex);
    this.ctx.state.gold += g;
    this.goldEarned += g;
    this.pushTextPopup(killer.pos, `+${g}g`, POPUP_COLORS.crit);
    grantSp(killer, 20);
  }

  /** SP + a little "action XP" credited immediately to the acting unit. The big
   *  XP reward is the per-kill share (awardKill); this just rewards engaging —
   *  an offensive hit on a foe, or a buff/heal/revive on an ally. */
  private awardForAction(unit: Unit, opts: { offensive?: boolean; killed?: boolean; support?: boolean }): void {
    if (unit.team !== "player") return;
    let sp = opts.offensive ? 8 : opts.support ? 8 : 6;
    if (opts.killed) sp += 12;
    grantSp(unit, sp);
    // Action XP only when the action didn't kill (a kill pays the richer kill XP).
    if (!opts.killed) {
      if (opts.offensive) this.gainXp(unit, ACTION_XP_OFFENSIVE);
      else if (opts.support) this.gainXp(unit, ACTION_XP_SUPPORT);
    }
  }

  /** Grant XP to a player unit: record it in the rewards ledger and, when it
   *  crosses a level and `queueCard` is set, enqueue an in-battle level-up card.
   *  No-op for enemies / non-positive amounts. */
  private gainXp(unit: Unit, amount: number, queueCard = true): void {
    if (unit.team !== "player" || amount <= 0) return;
    this.xpEarned.set(unit.id, (this.xpEarned.get(unit.id) ?? 0) + amount);
    const info = grantXpTracked(unit, amount);
    if (info) {
      this.pushLog(`${unit.name} reaches Lv ${unit.level}!`);
      if (queueCard) this.levelUps.push(info);
    }
  }

  /** Record that a player unit interacted offensively with an enemy (kill
   *  participation) and tally its damage for the MVP callout. */
  private registerHit(actor: Unit, target: Unit, damage = 0): void {
    if (actor.team === "player" && target.team === "enemy") {
      let set = this.participants.get(target.id);
      if (!set) {
        set = new Set();
        this.participants.set(target.id, set);
      }
      set.add(actor.id);
      if (damage > 0) this.bumpTally(actor.id, "damage", damage);
    }
  }

  private bumpTally(id: string, key: "damage" | "kills" | "heals", n: number): void {
    const t = this.tally.get(id) ?? { damage: 0, kills: 0, heals: 0 };
    t[key] += n;
    this.tally.set(id, t);
  }

  /** Award kill-participation XP when an enemy falls: every participant gets a
   *  base share, the finisher the bonus share. Rolls a possible item drop. */
  private awardKill(enemy: Unit, finisherId: string | null): void {
    if (enemy.team !== "enemy") return;
    const set = this.participants.get(enemy.id) ?? new Set<string>();
    if (finisherId) set.add(finisherId); // a one-shot with no prior hits still counts
    for (const pid of set) {
      const u = this.units.find((x) => x.id === pid);
      if (!u || u.team !== "player") continue;
      this.gainXp(u, pid === finisherId ? xpForFinisher(enemy.level) : xpForKill(enemy.level));
    }
    if (finisherId) this.bumpTally(finisherId, "kills", 1);
    const drop = rollEnemyDrop(enemy.level, this.rng);
    if (drop) {
      this.ctx.state.inventory[drop] = (this.ctx.state.inventory[drop] ?? 0) + 1;
      this.itemsFound.push(drop);
      this.pushLog(`${enemy.name} dropped ${getItem(drop).name}.`);
    }
    this.participants.delete(enemy.id);
  }

  /** Credit a kill with no direct finisher (poison tick, lava/terrain): the
   *  participants who softened the foe still share the kill XP + drop, and the
   *  bounty gold is banked. No-op unless the dying unit is an enemy. */
  private creditEnvironmentalKill(victim: Unit): void {
    if (victim.team !== "enemy") return;
    this.awardKill(victim, null);
    const g = goldForKill(this.ctx.state.phaseIndex);
    this.ctx.state.gold += g;
    this.goldEarned += g;
    this.pushTextPopup(victim.pos, `+${g}g`, POPUP_COLORS.crit);
  }

  /** Move this battle's per-unit ledger entries from one unit id to another
   *  (used when a recruit is re-id'd at victory, so the spoils screen still
   *  finds its earned XP). */
  private remapLedgers(oldId: string, newId: string): void {
    if (this.xpEarned.has(oldId)) {
      this.xpEarned.set(newId, this.xpEarned.get(oldId)!);
      this.xpEarned.delete(oldId);
    }
    if (this.startLevels.has(oldId)) {
      this.startLevels.set(newId, this.startLevels.get(oldId)!);
      this.startLevels.delete(oldId);
    }
    if (this.tally.has(oldId)) {
      this.tally.set(newId, this.tally.get(oldId)!);
      this.tally.delete(oldId);
    }
  }

  /** Show any queued level-up cards, then run `then`. Skipped on a battle-ending
   *  blow (the spoils screen summarizes the growth instead). */
  private drainLevelUps(then: () => void): void {
    // Drop cards for units that died before the card surfaces (e.g. a hero that
    // killed a foe, queued a level, then got counter-killed) — no celebrating a
    // corpse. The XP/level itself was already applied to the unit.
    const cards = this.levelUps.filter((c) => this.units.find((u) => u.id === c.unitId)?.alive);
    this.levelUps = [];
    if (cards.length === 0) {
      then();
      return;
    }
    this.phase = "resolving";
    this.ui.hideCombatControls();
    this.ui.showLevelUp(cards, then);
  }

  /** Fixed, equal battle-clear XP — the floor that keeps supports and the bench
   *  on the curve. Folded into the ledger (no mid-battle card; the spoils screen
   *  shows the result). Granted to the whole roster, present or benched. */
  private awardBattleClearXp(): void {
    const bonus = battleClearXp(this.phaseIndex);
    for (const member of this.ctx.state.party) this.gainXp(member, bonus, false);
  }

  /** Roll the chapter/difficulty-scaled victory item drops into the inventory. */
  private rollVictoryDrops(): void {
    for (const id of rollBattleDrops(this.phaseIndex, this.ctx.state.difficulty, this.rng)) {
      this.ctx.state.inventory[id] = (this.ctx.state.inventory[id] ?? 0) + 1;
      this.itemsFound.push(id);
    }
  }

  /** Assemble the spoils-screen payload from this battle's ledgers. */
  private computeRewards(): BattleRewards {
    const heroes: HeroXpResult[] = this.ctx.state.party.map((u) => ({
      unitId: u.id,
      name: u.name,
      classId: u.classId,
      xpGained: this.xpEarned.get(u.id) ?? 0,
      fromLevel: this.startLevels.get(u.id) ?? u.level,
      toLevel: u.level,
    }));
    return { gold: this.goldEarned, items: this.itemsFound, heroes, mvp: this.mvpFrom() };
  }

  /** The most valuable hero this battle (kills first, then damage, then heals). */
  private mvpFrom(): BattleRewards["mvp"] {
    let best: { id: string; score: number; reason: string } | null = null;
    for (const [id, t] of this.tally) {
      const score = t.kills * 1000 + t.damage + t.heals;
      if (score <= 0) continue;
      const reason =
        t.kills > 0 ? `${t.kills} kill${t.kills > 1 ? "s" : ""}` : t.heals > t.damage ? `${t.heals} HP healed` : `${t.damage} damage`;
      if (!best || score > best.score) best = { id, score, reason };
    }
    if (!best) return undefined;
    const u = this.units.find((x) => x.id === best!.id) ?? this.ctx.state.party.find((x) => x.id === best!.id);
    return u ? { unitId: u.id, name: u.name, reason: best.reason } : undefined;
  }

  /** DEV: level the active/first hero THROUGH the live level-up path (queues +
   *  drains the card), so the in-battle level-up screen can be previewed. */
  devLevelUpCard(): void {
    if (this.phase === "over") return;
    const u =
      this.active?.team === "player" && this.active.alive
        ? this.active
        : this.units.find((x) => x.team === "player" && x.alive);
    if (!u) return;
    this.gainXp(u, Math.max(1, xpForLevel(u.level) - u.xp));
    this.drainLevelUps(() => {
      if (this.phase === "over") return;
      if (this.active?.team === "player") this.refreshMenu();
    });
  }

  /** Open any unopened chest the active player unit is standing on. */
  private tryOpenChest(): void {
    if (!this.active || this.active.team !== "player") return;
    const chest = this.chests.find((c) => !c.opened && samePoint(c.pos, this.active!.pos));
    if (chest) this.openChest(chest, this.active.name);
  }

  /** Bank a chest's gold + items, mark it open, and announce it. */
  private openChest(chest: { pos: Point; loot: Loot; opened: boolean }, opener: string): void {
    chest.opened = true;
    const parts: string[] = [];
    if (chest.loot.gold) {
      this.ctx.state.gold += chest.loot.gold;
      this.goldEarned += chest.loot.gold;
      parts.push(`${chest.loot.gold}g`);
    }
    for (const id of chest.loot.items ?? []) {
      this.ctx.state.inventory[id] = (this.ctx.state.inventory[id] ?? 0) + 1;
      this.itemsFound.push(id);
      parts.push(getItem(id).name);
    }
    sfx.playTreasure();
    this.pushTextPopup(chest.pos, "Treasure!", POPUP_COLORS.crit);
    this.pushLog(`${opener} opens a chest: ${parts.join(", ") || "empty"}.`);
    this.ui.toast(`Treasure: ${parts.join(" · ") || "empty"}`);
  }

  /** DEV: open the nearest unopened chest (preview the treasure flow). */
  devOpenChest(): void {
    if (this.phase === "over") return;
    const chest = this.chests.find((c) => !c.opened);
    if (chest) this.openChest(chest, this.active?.name ?? "Someone");
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
        // NOTE: the damage forecast preview still shows the original target — Cover is
        // a reactive interception (like Counter), not previewed before the hit resolves.
        const actual = coverFor(target, this.units) ?? target;
        if (actual !== target) this.ui.toast(`${actual.name} covers ${target.name}!`);
        const res = resolveWeaponAttack(unit, actual, weapon, this.rng, heightDelta(actual.pos));
        this.pushEffect(actual.pos, vfxKeyForWeapon(weapon));
        this.pushPopup(res);
        // The struck player unit may counter the attacker.
        this.tryCounter(actual, unit);
        // A surviving low-HP player unit may auto-consume a potion.
        this.tryAutoPotion(actual);
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
        // Cover intercepts single-target offensive hits only (not AoE, not heals/buffs/revives).
        // NOTE: the damage forecast preview still shows the original target — Cover is
        // a reactive interception (like Counter), not previewed before the hit resolves.
        const actual = (isOffensive && skill.aoe === "single") ? (coverFor(target, this.units) ?? target) : target;
        if (actual !== target) this.ui.toast(`${actual.name} covers ${target.name}!`);
        const r = resolveSkillOnTarget(unit, actual, skill, this.rng, heightDelta(actual.pos));
        if (r) {
          this.pushEffect(actual.pos, skillVfx);
          this.pushPopup(r);
          // A surviving low-HP player unit hit by an offensive skill may auto-heal.
          if (r.kind === "damage") {
            this.tryAutoPotion(actual);
            if (!knockbackTarget) knockbackTarget = actual;
          }
          cast = true;
        }
      }
      // An adjacent single-target melee skill lets the struck player unit counter —
      // resolved BEFORE knockback so the victim is still next to the attacker.
      if (isOffensive && skill.aoe === "single") {
        const victim = this.units.find((u) => u.alive && u.team !== unit.team && samePoint(u.pos, center));
        // After a possible cover redirect, the actual hit target may differ from center;
        // counter keys off whoever actually took the hit (tracked via knockbackTarget).
        const counterUnit = knockbackTarget ?? victim;
        if (counterUnit) this.tryCounter(counterUnit, unit);
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

  private pushLog(line: string): void {
    this.log.push(line);
    if (this.log.length > BattleScene.LOG_CAP) this.log.splice(0, this.log.length - BattleScene.LOG_CAP);
    this.ui.setBattleLog(this.log);
  }

  /** Kick off (or refresh) the whole-scene impact shake. `strength` 0..1 scales
   *  how long it rings; full strength for the most emphatic hits. */
  private shakeScreen(strength = 1): void {
    this.screenShake = Math.max(this.screenShake, SCREEN_SHAKE_DUR * strength);
  }

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
    if (res.kind === "damage") this.hitShake.set(res.unitId, SHAKE_DUR);
    if (res.killed) this.deaths.set(res.unitId, 0);
    if (res.revived) this.deaths.delete(res.unitId);
    let text: string;
    let color: string;
    let crit = false;
    switch (res.kind) {
      case "damage":
        if (res.crit) {
          sfx.playCrit();
          // Crits punch: jolt the screen and tag the popup for emphatic rendering.
          this.shakeScreen(1);
          crit = true;
        } else sfx.playHit();
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
        // A status result with no `status` field is a cure (Remedy strips debuffs).
        text = res.status ?? "Cure";
        color = POPUP_COLORS.status;
        break;
    }
    if (res.killed) {
      sfx.playDeath();
      this.shakeScreen(0.85); // a unit falling thuds — slightly softer than a crit
    }
    this.popups.push({ tile: { ...target.pos }, text, color, age: 0, ttl: 1.1, crit });
    this.pushLog(formatHit(res, (id) => this.units.find((u) => u.id === id)?.name ?? "Someone"));
  }

  /**
   * A recruit-hint line for the info panel when hovering an enemy on the player's
   * turn: "recruit now" if the active unit is adjacent to this weakened foe, or a
   * heads-up that it can be recruited once weakened/adjacent. Null for allies,
   * healthy enemies, or when no player unit is active.
   */
  private recruitHintFor(unit: Unit): string | undefined {
    if (this.active?.team !== "player" || unit.team === "player" || !unit.alive) return undefined;
    if (canRecruit(this.active, unit)) return "✦ Recruit ready — use Recruit to turn this foe.";
    if (unit.stats.hp <= RECRUIT_HP_FRACTION * unit.stats.maxHp) {
      return "✦ Recruitable — step adjacent, then Recruit.";
    }
    return `✦ Can be recruited once worn down to ≤${Math.round(RECRUIT_HP_FRACTION * 100)}% HP & adjacent.`;
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
      if (this.lunge.age >= LUNGE_DUR) this.lunge = null;
    }
    if (this.screenShake > 0) this.screenShake = Math.max(0, this.screenShake - dt);

    // Hover + target info.
    const cam = this.camera;
    if (this.ctx.input.pointer && this.phase !== "over" && this.phase !== "intro") {
      this.hoverTile = screenToTile(this.ctx.input.pointer.x, this.ctx.input.pointer.y, this.grid, cam.origin, this.rot, cam.scale);
    } else {
      this.hoverTile = null;
    }
    if (this.hoverTile) {
      const hovered = this.unitAt(this.hoverTile);
      const shown = hovered && hovered !== this.active ? hovered : null;
      this.ui.setTargetInfo(shown, shown ? this.recruitHintFor(shown) : undefined);
    } else {
      this.ui.setTargetInfo(null);
    }

    // `this.props` (the decoration scatter) flows into the snapshot through the
    // ViewScene structural bridge in buildView; tsc can't trace that cast, so we
    // read the field here to keep the data-flow explicit (and the field "used").
    void this.props;
    this.ctx.renderer.render(buildView(this, cam.origin, cam.scale));
  }

  dispose(): void {
    stopMusic();
    this.ui.destroy();
    this.ctx.input.reset();
    this.ctx.animator.clear();
  }
}
