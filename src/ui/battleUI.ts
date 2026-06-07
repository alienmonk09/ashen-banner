import type { BattleRewards, ItemDef, LevelUpInfo, SkillDef, Unit } from "../core/types";
import type { DialogueLine } from "../data/dialogue";
import { getClass } from "../data/classes";
import { getItem } from "../data/items";
import { xpForLevel, nextLearnableSkill } from "../core/unit";
import { prefersReducedMotion } from "../engine/accessibility";
import { getWeapon } from "../data/weapons";
import { getSkill } from "../data/skills";
import { describeSkill, reactionLine, skillTags, statusChips, turnChipBadge, turnChipTitle } from "./battleUiHelpers";
import { getCharacterSprite, getItemSprite, getSkillSprite, getWeaponSprite, speakerSprite } from "../data/sprites";
import { isMuted, toggleMuted, sfx } from "../engine/audio";
import { el, clear } from "./dom";
import { iconImg, portraitImg } from "./icons";

export interface ActionState {
  canMove: boolean;
  canAct: boolean;
  canUndo?: boolean;
  canRecruit?: boolean;
  onMove: () => void;
  onAttack: () => void;
  onSkill: () => void;
  onItem: () => void;
  onWait: () => void;
  onUndo?: () => void;
  onRecruit?: () => void;
}

export interface BannerOpts {
  title: string;
  body: string;
  buttonLabel: string;
  onClick: () => void;
}

/** All DOM-based battle HUD: panels, action menu, submenus, turn bar, banners. */
export class BattleUI {
  private layer: HTMLDivElement;
  private turnBar: HTMLDivElement;
  private objectivePanel: HTMLDivElement;
  private unitPanel: HTMLDivElement;
  private targetPanel: HTMLDivElement;
  private actionMenu: HTMLDivElement;
  private submenu: HTMLDivElement;
  private toastEl: HTMLDivElement;
  private hintEl: HTMLDivElement;
  private bannerEl: HTMLDivElement;
  private rotateCtl: HTMLDivElement;
  private rotLabel: HTMLDivElement;
  private dialogueEl: HTMLDivElement;
  private levelUpEl: HTMLDivElement;
  private rewardsEl: HTMLDivElement;
  private battleLogPanel: HTMLDivElement;
  private battleLogLines: HTMLDivElement;
  private toastTimer = 0;
  /** Screen point (CSS px) the action menu/submenu anchor to; null = docked. */
  private menuAnchor: { x: number; y: number } | null = null;

  constructor(parent: HTMLElement) {
    this.layer = el("div", { className: "ui-layer" });
    this.turnBar = el("div", { className: "panel turn-bar" });
    this.objectivePanel = el("div", { className: "panel objective" });
    this.unitPanel = el("div", { className: "panel unit-panel" });
    this.targetPanel = el("div", { className: "panel target-panel" });
    this.actionMenu = el("div", { className: "panel action-menu" });
    this.submenu = el("div", { className: "panel submenu" });
    this.toastEl = el("div", { className: "panel toast" });
    this.hintEl = el("div", { className: "hint" });
    this.bannerEl = el("div", { className: "banner" });
    this.dialogueEl = el("div", { className: "dialogue" });
    this.levelUpEl = el("div", { className: "level-up" });
    this.rewardsEl = el("div", { className: "rewards" });
    this.rotLabel = el("div", { className: "rlabel", text: "0°" });
    this.rotateCtl = el("div", { className: "panel rotate-ctl" });
    this.battleLogLines = el("div", { className: "battle-log-lines" });
    this.battleLogPanel = el("div", { className: "panel battle-log" });
    this.battleLogPanel.appendChild(el("div", { className: "battle-log-title", text: "Battle Log" }));
    this.battleLogPanel.appendChild(this.battleLogLines);
    for (const n of [
      this.turnBar,
      this.objectivePanel,
      this.unitPanel,
      this.targetPanel,
      this.actionMenu,
      this.submenu,
      this.toastEl,
      this.hintEl,
      this.bannerEl,
      this.dialogueEl,
      this.levelUpEl,
      this.rewardsEl,
      this.rotateCtl,
      this.battleLogPanel,
    ]) {
      n.style.display = "none";
      this.layer.appendChild(n);
    }
    parent.appendChild(this.layer);
  }

  destroy(): void {
    this.layer.remove();
  }

  // --- Unit / target info ---

  private unitPanelContent(unit: Unit, recruitHint?: string): HTMLElement[] {
    const cls = getClass(unit.classId);
    const weapon = getWeapon(unit.weaponId);
    const hpFrac = (unit.stats.hp / unit.stats.maxHp) * 100;
    const mpFrac = (unit.stats.mp / unit.stats.maxMp) * 100;
    const hpBar = el("div", { className: "bar hp" });
    hpBar.appendChild(el("span", { attrs: { style: `width:${hpFrac}%` } }));
    const mpBar = el("div", { className: "bar mp" });
    mpBar.appendChild(el("span", { attrs: { style: `width:${mpFrac}%` } }));
    // XP progress (player units only) + a "new skill ready" cue when SP affords it.
    const xpEls: HTMLElement[] = [];
    if (unit.team === "player") {
      const need = xpForLevel(unit.level);
      const xpBar = el("div", { className: "bar xp" });
      xpBar.appendChild(el("span", { attrs: { style: `width:${Math.min(100, (unit.xp / need) * 100)}%` } }));
      xpEls.push(el("div", { text: `XP ${unit.xp}/${need}`, attrs: { style: "font-size:12px" } }), xpBar);
      const nextId = nextLearnableSkill(unit);
      if (nextId && unit.sp >= getSkill(nextId).spCost) {
        xpEls.push(el("div", { className: "new-skill-cue", text: `★ New skill ready: ${getSkill(nextId).name}` }));
      }
    }
    return [
      el("h3", { text: `${unit.name}` }),
      el("div", { className: "sub", text: `${cls.name} · Lv ${unit.level} · ${unit.team === "player" ? "Ally" : "Enemy"}` }),
      el("div", { text: `HP ${unit.stats.hp}/${unit.stats.maxHp}`, attrs: { style: "font-size:12px" } }),
      hpBar,
      el("div", { text: `MP ${unit.stats.mp}/${unit.stats.maxMp}`, attrs: { style: "font-size:12px" } }),
      mpBar,
      ...xpEls,
      el("div", {
        className: "stat-row",
        text: `ATK ${unit.stats.atk}  DEF ${unit.stats.def}  MAG ${unit.stats.mag}  RES ${unit.stats.res}  SPD ${unit.stats.spd}  MOV ${unit.stats.move}`,
      }),
      el("div", {
        className: "sub weapon-line",
        children: [
          iconImg(getWeaponSprite(unit.weaponId), 16),
          el("span", { text: `${weapon.name} (pow ${weapon.power}, rng ${weapon.range})` }),
        ],
      }),
      el("div", {
        className: "skills-line",
        text: unit.learnedSkillIds.length
          ? "Skills: " +
            unit.learnedSkillIds
              .map((id) => {
                const s = getSkill(id);
                return `${s.name} (${describeSkill(s)})`;
              })
              .join(", ")
          : "",
      }),
      reactionLine(unit, cls.reactions),
      statusChips(unit),
      ...(recruitHint ? [el("div", { className: "recruit-hint", text: recruitHint })] : []),
    ];
  }

  setActiveUnit(unit: Unit | null): void {
    if (!unit) {
      this.unitPanel.style.display = "none";
      return;
    }
    clear(this.unitPanel);
    for (const n of this.unitPanelContent(unit)) this.unitPanel.appendChild(n);
    this.unitPanel.style.display = "block";
  }

  setTargetInfo(unit: Unit | null, recruitHint?: string): void {
    if (!unit) {
      this.targetPanel.style.display = "none";
      return;
    }
    clear(this.targetPanel);
    for (const n of this.unitPanelContent(unit, recruitHint)) this.targetPanel.appendChild(n);
    this.targetPanel.style.display = "block";
  }

  // --- Turn order ---

  setTurnOrder(units: Unit[]): void {
    clear(this.turnBar);
    this.turnBar.setAttribute("role", "list");
    this.turnBar.setAttribute("aria-label", "Turn order");
    this.turnBar.appendChild(el("span", { className: "label", text: "Turn order", attrs: { "aria-hidden": "true" } }));
    units.forEach((u, i) => {
      const cls = getClass(u.classId);
      const isEnemy = u.team === "enemy";
      const side = isEnemy ? "Enemy" : "Ally";
      const chip = el("div", {
        className: `turn-chip${i === 0 ? " first" : ""}${isEnemy ? " enemy" : ""}`,
        attrs: {
          style: `background:${cls.color}`,
          // Full status/charge list in the tooltip; the badge below shows the headline one.
          title: turnChipTitle(u, cls.name),
          role: "listitem",
          "aria-label": `${u.name}, ${cls.name}, ${side}${i === 0 ? ", next up" : ""}`,
        },
        children: [portraitImg(getCharacterSprite(u.classId))],
      });
      // Non-color side marker: a glyph badge so ally vs enemy reads without
      // relying on the chip's color / red outline (colorblind-safe).
      chip.appendChild(
        el("span", {
          className: `chip-side ${isEnemy ? "chip-enemy" : "chip-ally"}`,
          text: isEnemy ? "⚔" : "⛨",
          attrs: { "aria-hidden": "true" },
        }),
      );
      // A status/charge-duration badge so the player can read "poison wears off in 2"
      // / "caster fires next turn" at a glance.
      const badge = turnChipBadge(u);
      if (badge) chip.appendChild(el("span", { className: `turn-badge tb-${badge.cls}`, text: badge.text }));
      this.turnBar.appendChild(chip);
    });
    this.turnBar.style.display = "flex";
  }

  /** Show the current battle objective (or hide it with null). */
  setObjective(text: string | null): void {
    if (!text) {
      this.objectivePanel.style.display = "none";
      return;
    }
    this.objectivePanel.textContent = text;
    this.objectivePanel.style.display = "block";
  }

  // --- Battle log ---

  /** Render the battle log lines (newest at the bottom) and auto-scroll. */
  setBattleLog(lines: string[]): void {
    clear(this.battleLogLines);
    for (const line of lines) {
      const isTurnHeader = line.startsWith("—");
      this.battleLogLines.appendChild(
        el("div", { className: `log-line${isTurnHeader ? " log-turn" : ""}`, text: line }),
      );
    }
    this.battleLogPanel.style.display = lines.length > 0 ? "flex" : "none";
    // Scroll to the latest entry.
    this.battleLogLines.scrollTop = this.battleLogLines.scrollHeight;
  }

  // --- Camera rotation control ---

  /** Show the always-on rotate-camera control (two buttons + a facing label). */
  showRotateControl(onLeft: () => void, onRight: () => void): void {
    clear(this.rotateCtl);
    const muteBtn = this.audioButton();
    this.rotateCtl.appendChild(
      el("button", { className: "btn small rbtn", text: "⟲", attrs: { title: "Rotate view left (,)" }, onClick: onLeft }),
    );
    this.rotateCtl.appendChild(this.rotLabel);
    this.rotateCtl.appendChild(
      el("button", { className: "btn small rbtn", text: "⟳", attrs: { title: "Rotate view right (.)" }, onClick: onRight }),
    );
    this.rotateCtl.appendChild(muteBtn);
    this.rotateCtl.style.display = "flex";
  }

  private audioButton(): HTMLButtonElement {
    const btn = el("button", { className: "btn small rbtn audio-btn", attrs: { title: "Toggle combat sound" } });
    const sync = () => {
      btn.textContent = isMuted() ? "🔇" : "🔊";
      btn.setAttribute("aria-label", isMuted() ? "Unmute combat sound" : "Mute combat sound");
    };
    btn.addEventListener("click", () => {
      toggleMuted();
      sync();
    });
    sync();
    return btn;
  }

  hideRotateControl(): void {
    this.rotateCtl.style.display = "none";
  }

  /** Update the facing readout (rot 0..3 → 0/90/180/270°). */
  setRotationLabel(rot: number): void {
    this.rotLabel.textContent = `${(((rot % 4) + 4) % 4) * 90}°`;
  }

  // --- Action menu ---

  /** Set where the action menu/submenu should appear (CSS px, ui-layer space),
   *  or null to dock at the bottom of the screen. */
  setMenuAnchor(p: { x: number; y: number } | null): void {
    this.menuAnchor = p;
  }

  /** Re-apply floating placement to whichever menu panel is currently visible.
   *  Called after a viewport resize so the menu re-anchors and re-clamps. */
  reflowFloating(): void {
    if (this.actionMenu.style.display !== "none") this.placeFloating(this.actionMenu);
    if (this.submenu.style.display !== "none") this.placeFloating(this.submenu);
  }

  /** Position a floating panel near the anchor (clamped to the viewport), or
   *  clear inline positioning so the CSS-defined docked position applies. */
  private placeFloating(panel: HTMLDivElement): void {
    if (!this.menuAnchor) {
      panel.style.left = "";
      panel.style.top = "";
      panel.style.right = "";
      panel.style.bottom = "";
      panel.style.transform = "";
      return;
    }
    const margin = 10;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    panel.style.transform = "none";
    let x = this.menuAnchor.x + 28;
    let y = this.menuAnchor.y - 16;
    panel.style.left = `${x}px`;
    panel.style.top = `${y}px`;
    // Clamp into the viewport now that the panel has a measurable size.
    const r = panel.getBoundingClientRect();
    if (r.right > window.innerWidth - margin) x -= r.right - (window.innerWidth - margin);
    if (r.bottom > window.innerHeight - margin) y -= r.bottom - (window.innerHeight - margin);
    if (x < margin) x = margin;
    if (y < margin) y = margin;
    panel.style.left = `${x}px`;
    panel.style.top = `${y}px`;
  }

  showActions(state: ActionState): void {
    this.hideSubmenu();
    clear(this.actionMenu);
    const mk = (
      label: string,
      enabled: boolean,
      fn: () => void,
      opts: { accent: string; tip: string; key?: string; extra?: string },
    ) => {
      const b = el("button", {
        className: `btn act ${opts.accent}${opts.extra ? " " + opts.extra : ""}${enabled ? "" : " btn-disabled"}`,
        attrs: { title: opts.tip, ...(enabled ? {} : { disabled: "true", "aria-disabled": "true" }) },
        onClick: enabled ? fn : undefined,
      });
      b.appendChild(el("span", { className: "act-dot" }));
      b.appendChild(el("span", { className: "act-label", text: label }));
      if (opts.key) b.appendChild(el("span", { className: "key-hint", text: opts.key }));
      return b;
    };
    this.actionMenu.appendChild(mk("Move", state.canMove, state.onMove, { accent: "a-move", key: "M", tip: "Walk to a highlighted tile (respects range, terrain & jump) — press M" }));
    if (state.canUndo) {
      this.actionMenu.appendChild(mk("Undo Move", true, state.onUndo ?? (() => {}), { accent: "a-undo", tip: "Take back your move — resets position so you can move again or choose elsewhere" }));
    }
    this.actionMenu.appendChild(mk("Attack", state.canAct, state.onAttack, { accent: "a-attack", key: "A", tip: "Strike an enemy in weapon range — flank or rear for bonus damage — press A" }));
    this.actionMenu.appendChild(mk("Skill", state.canAct, state.onSkill, { accent: "a-skill", key: "S", tip: "Cast a learned class skill (costs MP) — press S" }));
    this.actionMenu.appendChild(mk("Item", state.canAct, state.onItem, { accent: "a-item", key: "I", tip: "Use a shared consumable — press I" }));
    if (state.canRecruit) {
      this.actionMenu.appendChild(mk("Recruit", true, state.onRecruit ?? (() => {}), { accent: "a-recruit", tip: "Recruit an adjacent weakened enemy — they join your cause and follow you into future battles" }));
    }
    // "End Turn" (genre-standard "Wait"), detached from the offensive actions to
    // avoid a reflex misclick forfeiting the whole turn.
    this.actionMenu.appendChild(mk("End Turn", true, state.onWait, { accent: "a-end", extra: "end-turn", key: "E", tip: "Finish this unit's turn (Enter / E)" }));
    this.actionMenu.style.display = "flex";
    this.placeFloating(this.actionMenu);
  }

  clearActions(): void {
    this.actionMenu.style.display = "none";
  }

  // --- Submenus ---

  showSkillMenu(skills: SkillDef[], unit: Unit, onPick: (s: SkillDef) => void, onBack: () => void): void {
    clear(this.submenu);
    this.submenu.appendChild(
      el("div", {
        className: "submenu-title",
        text: `Skills — ${unit.stats.mp}/${unit.stats.maxMp} MP`,
      }),
    );
    if (skills.length === 0) {
      this.submenu.appendChild(el("div", { text: "No skills learned. Spend Skill Points at the Party Camp.", attrs: { style: "opacity:0.7;font-size:12px" } }));
    }
    for (const s of skills) {
      const affordable = unit.stats.mp >= s.mpCost;
      const card = el("button", {
        className: `skill-card${affordable ? "" : " disabled"}`,
        attrs: affordable ? {} : { disabled: "true" },
        onClick: affordable ? () => onPick(s) : undefined,
      });
      const head = el("div", { className: "sk-head" });
      head.appendChild(iconImg(getSkillSprite(s.id), 24));
      head.appendChild(el("span", { className: "sk-name", text: s.name }));
      head.appendChild(el("span", { className: `sk-mp${affordable ? "" : " short"}`, text: `${s.mpCost} MP` }));
      card.appendChild(head);
      if (!affordable) {
        card.appendChild(
          el("div", { className: "sk-short-note", text: `Not enough MP — need ${s.mpCost - unit.stats.mp} more` }),
        );
      }
      const tags = el("div", { className: "sk-tags" });
      for (const t of skillTags(s)) tags.appendChild(el("span", { className: `tag ${t.cls}`, text: t.text }));
      card.appendChild(tags);
      card.appendChild(el("div", { className: "sk-desc", text: s.description }));
      this.submenu.appendChild(card);
    }
    this.submenu.appendChild(el("button", { className: "btn small", text: "← Back", onClick: onBack }));
    this.submenu.style.display = "flex";
    this.placeFloating(this.submenu);
  }

  showItemMenu(entries: Array<{ item: ItemDef; count: number }>, onPick: (id: string) => void, onBack: () => void): void {
    clear(this.submenu);
    const usable = entries.filter((e) => e.count > 0);
    if (usable.length === 0) {
      this.submenu.appendChild(el("div", { text: "No items left.", attrs: { style: "opacity:0.7" } }));
    }
    for (const e of usable) {
      const row = el("div", { className: "row" });
      const left = el("div", { className: "row-left" });
      left.appendChild(iconImg(getItemSprite(e.item.id), 22));
      left.appendChild(
        el("button", { className: "btn small", text: `${e.item.name} ×${e.count}`, onClick: () => onPick(e.item.id) }),
      );
      row.appendChild(left);
      row.appendChild(el("span", { className: "cost", text: e.item.description }));
      this.submenu.appendChild(row);
    }
    this.submenu.appendChild(el("button", { className: "btn small", text: "← Back", onClick: onBack }));
    this.submenu.style.display = "flex";
    this.placeFloating(this.submenu);
  }

  hideSubmenu(): void {
    this.submenu.style.display = "none";
  }

  // --- Hint / toast / banner ---

  setHint(text: string | null): void {
    if (!text) {
      this.hintEl.style.display = "none";
      return;
    }
    this.hintEl.textContent = text;
    this.hintEl.style.display = "block";
  }

  toast(text: string): void {
    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.toastEl.textContent = text;
    this.toastEl.style.display = "block";
    this.toastEl.classList.add("show");
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.classList.remove("show");
    }, 1600);
  }

  showBanner(opts: BannerOpts): void {
    clear(this.bannerEl);
    const card = el("div", { className: "banner-card" });
    card.appendChild(el("h1", { text: opts.title }));
    card.appendChild(el("p", { text: opts.body }));
    card.appendChild(el("button", { className: "btn", text: opts.buttonLabel, onClick: opts.onClick }));
    this.bannerEl.appendChild(card);
    this.bannerEl.style.display = "flex";
  }

  hideBanner(): void {
    this.bannerEl.style.display = "none";
  }

  /**
   * Play a pre-battle story scene one line at a time in a JRPG-style text box.
   * Clicking the box (or "Next") advances; "Skip" jumps to the end. Calls
   * `onDone` after the last line (or immediately if there are no lines).
   */
  showDialogue(lines: DialogueLine[], onDone: () => void): void {
    if (lines.length === 0) {
      onDone();
      return;
    }
    let i = 0;
    const speakerEl = el("div", { className: "dlg-speaker" });
    const textEl = el("div", { className: "dlg-text" });
    const progressEl = el("div", { className: "dlg-progress" });
    const finish = () => {
      this.hideDialogue();
      onDone();
    };
    const advance = () => {
      i += 1;
      if (i >= lines.length) {
        finish();
        return;
      }
      render();
    };
    const portraitEl = el("div", { className: "dlg-portrait" });
    const speakerRow = el("div", { className: "dlg-speaker-row" });
    speakerRow.appendChild(portraitEl);
    speakerRow.appendChild(speakerEl);
    const render = () => {
      const line = lines[i];
      // The narrator ("—") shows no speaker chip or portrait; characters do.
      const isNarrator = line.speaker === "—";
      speakerEl.textContent = line.speaker;
      speakerEl.style.display = isNarrator ? "none" : "block";
      // Portrait: show hero sprite when available, hide otherwise.
      const sprite = speakerSprite(line.speaker);
      clear(portraitEl);
      if (sprite) {
        portraitEl.appendChild(iconImg(sprite, 48));
        portraitEl.style.display = "flex";
      } else {
        portraitEl.style.display = "none";
      }
      speakerRow.style.display = isNarrator ? "none" : "flex";
      textEl.textContent = line.text;
      nextBtn.textContent = i >= lines.length - 1 ? "Begin ▸" : "Next ▸";
      progressEl.textContent = `${i + 1} / ${lines.length}`;
    };
    // The box itself advances on click; the explicit buttons don't double-fire.
    const box = el("div", { className: "dialogue-box", onClick: () => advance() });
    box.appendChild(speakerRow);
    box.appendChild(textEl);
    const bar = el("div", { className: "dlg-bar" });
    const skipBtn = el("button", {
      className: "btn small dlg-skip",
      text: "Skip",
      onClick: (e) => {
        e.stopPropagation();
        finish();
      },
    });
    const nextBtn = el("button", {
      className: "btn small dlg-next",
      text: "Next ▸",
      onClick: (e) => {
        e.stopPropagation();
        advance();
      },
    });
    bar.appendChild(skipBtn);
    bar.appendChild(progressEl);
    bar.appendChild(nextBtn);
    box.appendChild(bar);
    clear(this.dialogueEl);
    this.dialogueEl.appendChild(box);
    this.dialogueEl.style.display = "flex";
    render();
  }

  hideDialogue(): void {
    this.dialogueEl.style.display = "none";
    clear(this.dialogueEl);
  }

  /**
   * Pop a level-up card the moment a unit gains a level mid-battle. Shows each
   * queued card in turn (Lv↑, stat deltas, a "new skill" hint), advancing on
   * click; calls `onDone` after the last card (or immediately if none). A bright
   * chime fires on each reveal.
   */
  showLevelUp(cards: LevelUpInfo[], onDone: () => void): void {
    if (cards.length === 0) {
      onDone();
      return;
    }
    const STATS: { key: keyof LevelUpInfo["statsAfter"]; label: string }[] = [
      { key: "maxHp", label: "HP" }, { key: "maxMp", label: "MP" },
      { key: "atk", label: "ATK" }, { key: "def", label: "DEF" },
      { key: "mag", label: "MAG" }, { key: "res", label: "RES" },
      { key: "spd", label: "SPD" },
    ];
    let i = 0;
    const finish = (): void => {
      this.hideLevelUp();
      onDone();
    };
    const render = (): void => {
      const c = cards[i];
      clear(this.levelUpEl);
      sfx.playLevelUp();
      const card = el("div", { className: "level-up-card", attrs: { role: "dialog", "aria-label": "Level up" } });
      card.appendChild(el("div", { className: "lu-flash", text: "LEVEL UP!" }));
      card.appendChild(el("div", { className: "lu-name", text: c.unitName }));
      card.appendChild(el("div", {
        className: "lu-level",
        children: [
          el("span", { className: "lu-lv-from", text: `Lv ${c.fromLevel}` }),
          el("span", { className: "lu-arrow", text: "→" }),
          el("span", { className: "lu-lv-to", text: `Lv ${c.toLevel}` }),
        ],
      }));
      const grid = el("div", { className: "lu-stats" });
      for (const s of STATS) {
        const before = c.statsBefore[s.key];
        const after = c.statsAfter[s.key];
        const delta = after - before;
        const row = el("div", { className: delta > 0 ? "lu-stat up" : "lu-stat" });
        row.appendChild(el("span", { className: "lu-stat-label", text: s.label }));
        row.appendChild(el("span", { className: "lu-stat-val", text: `${after}` }));
        row.appendChild(el("span", { className: "lu-stat-delta", text: delta > 0 ? `+${delta}` : "" }));
        grid.appendChild(row);
      }
      card.appendChild(grid);
      if (c.newSkillName) {
        card.appendChild(el("div", { className: "lu-skill", text: `New skill ready: ${c.newSkillName}` }));
      }
      const more = cards.length - i - 1;
      card.appendChild(el("button", {
        className: "btn",
        text: more > 0 ? `Next (${more} more) ▸` : "Continue",
        onClick: () => {
          i += 1;
          if (i >= cards.length) finish();
          else render();
        },
      }));
      this.levelUpEl.appendChild(card);
      this.levelUpEl.style.display = "flex";
    };
    render();
  }

  hideLevelUp(): void {
    this.levelUpEl.style.display = "none";
    clear(this.levelUpEl);
  }

  /**
   * The end-of-battle spoils screen: gold earned, items found, and each hero's
   * XP gain with level-up badges, plus an optional MVP callout. "Continue"
   * resolves `onDone`.
   */
  showRewards(rewards: BattleRewards, onDone: () => void): void {
    clear(this.rewardsEl);
    const card = el("div", { className: "rewards-card", attrs: { role: "dialog", "aria-label": "Battle rewards" } });
    card.appendChild(el("h1", { className: "rewards-title", text: "Spoils of Battle" }));

    // Gold — animated count-up for a little payoff.
    const goldAmt = el("span", { className: "reward-gold-amt", text: "+0" });
    card.appendChild(el("div", {
      className: "reward-section reward-gold",
      children: [el("span", { className: "reward-label", text: "Gold" }), goldAmt],
    }));
    this.countUp(goldAmt, rewards.gold);

    // Items (collapse duplicates to "Name ×N").
    const counts = new Map<string, number>();
    for (const id of rewards.items) counts.set(id, (counts.get(id) ?? 0) + 1);
    const itemsSection = el("div", { className: "reward-section reward-items" });
    itemsSection.appendChild(el("span", { className: "reward-label", text: "Items" }));
    if (counts.size === 0) {
      itemsSection.appendChild(el("span", { className: "reward-none", text: "—" }));
    } else {
      const list = el("div", { className: "reward-item-list" });
      for (const [id, n] of counts) {
        list.appendChild(el("div", {
          className: "reward-item",
          children: [
            iconImg(getItemSprite(id), 22),
            el("span", { text: n > 1 ? `${getItem(id).name} ×${n}` : getItem(id).name }),
          ],
        }));
      }
      itemsSection.appendChild(list);
    }
    card.appendChild(itemsSection);

    // Per-hero XP.
    const xpSection = el("div", { className: "reward-section reward-xp" });
    xpSection.appendChild(el("span", { className: "reward-label", text: "Party XP" }));
    const heroList = el("div", { className: "reward-hero-list" });
    for (const h of rewards.heroes) {
      const leveled = h.toLevel > h.fromLevel;
      const row = el("div", { className: leveled ? "reward-hero leveled" : "reward-hero" });
      row.appendChild(el("span", { className: "reward-hero-name", text: h.name }));
      row.appendChild(el("span", { className: "reward-hero-xp", text: `+${h.xpGained} XP` }));
      row.appendChild(el("span", {
        className: leveled ? "reward-hero-lv up" : "reward-hero-lv",
        text: leveled ? `Lv ${h.fromLevel} → ${h.toLevel}` : `Lv ${h.toLevel}`,
      }));
      heroList.appendChild(row);
    }
    xpSection.appendChild(heroList);
    card.appendChild(xpSection);

    if (rewards.mvp) {
      card.appendChild(el("div", {
        className: "reward-mvp",
        text: `MVP: ${rewards.mvp.name} — ${rewards.mvp.reason}`,
      }));
    }

    card.appendChild(el("button", {
      className: "btn",
      text: "Continue",
      onClick: () => {
        this.hideRewards();
        onDone();
      },
    }));
    this.rewardsEl.appendChild(card);
    this.rewardsEl.style.display = "flex";
  }

  hideRewards(): void {
    this.rewardsEl.style.display = "none";
    clear(this.rewardsEl);
  }

  /** Animate a span's text from +0 up to +target (skipped for reduced motion). */
  private countUp(node: HTMLElement, target: number): void {
    if (target <= 0 || prefersReducedMotion()) {
      node.textContent = `+${target}`;
      return;
    }
    const steps = 24;
    let i = 0;
    const timer = window.setInterval(() => {
      i += 1;
      node.textContent = `+${Math.round((target * i) / steps)}`;
      if (i >= steps) window.clearInterval(timer);
    }, 22);
  }

  /** Hide all transient combat UI (used when entering banner/AI states). */
  hideCombatControls(): void {
    this.clearActions();
    this.hideSubmenu();
    this.setHint(null);
  }
}
