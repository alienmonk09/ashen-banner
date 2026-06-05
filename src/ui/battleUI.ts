import type { ItemDef, SkillDef, StatusKind, Unit } from "../core/types";
import { getClass } from "../data/classes";
import { getWeapon } from "../data/weapons";
import { getSkill } from "../data/skills";
import { getCharacterSprite, getItemSprite, getSkillSprite, getWeaponSprite } from "../data/sprites";
import { isMuted, toggleMuted } from "../engine/audio";
import { el, clear } from "./dom";
import { iconImg, portraitImg } from "./icons";

export interface ActionState {
  canMove: boolean;
  canAct: boolean;
  canUndo?: boolean;
  onMove: () => void;
  onAttack: () => void;
  onSkill: () => void;
  onItem: () => void;
  onWait: () => void;
  onUndo?: () => void;
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

  private unitPanelContent(unit: Unit): HTMLElement[] {
    const cls = getClass(unit.classId);
    const weapon = getWeapon(unit.weaponId);
    const hpFrac = (unit.stats.hp / unit.stats.maxHp) * 100;
    const mpFrac = (unit.stats.mp / unit.stats.maxMp) * 100;
    const hpBar = el("div", { className: "bar hp" });
    hpBar.appendChild(el("span", { attrs: { style: `width:${hpFrac}%` } }));
    const mpBar = el("div", { className: "bar mp" });
    mpBar.appendChild(el("span", { attrs: { style: `width:${mpFrac}%` } }));
    return [
      el("h3", { text: `${unit.name}` }),
      el("div", { className: "sub", text: `${cls.name} · Lv ${unit.level} · ${unit.team === "player" ? "Ally" : "Enemy"}` }),
      el("div", { text: `HP ${unit.stats.hp}/${unit.stats.maxHp}`, attrs: { style: "font-size:12px" } }),
      hpBar,
      el("div", { text: `MP ${unit.stats.mp}/${unit.stats.maxMp}`, attrs: { style: "font-size:12px" } }),
      mpBar,
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
      el("div", { className: "skills-line", attrs: { style: "opacity:0.7" }, text: cls.reactions?.includes("counter") ? "Reaction: Counter (strikes back at melee)" : "" }),
      statusChips(unit),
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

  setTargetInfo(unit: Unit | null): void {
    if (!unit) {
      this.targetPanel.style.display = "none";
      return;
    }
    clear(this.targetPanel);
    for (const n of this.unitPanelContent(unit)) this.targetPanel.appendChild(n);
    this.targetPanel.style.display = "block";
  }

  // --- Turn order ---

  setTurnOrder(units: Unit[]): void {
    clear(this.turnBar);
    this.turnBar.appendChild(el("span", { className: "label", text: "Turn order" }));
    units.forEach((u, i) => {
      const cls = getClass(u.classId);
      const chip = el("div", {
        className: `turn-chip${i === 0 ? " first" : ""}${u.team === "enemy" ? " enemy" : ""}`,
        attrs: { style: `background:${cls.color}`, title: `${u.name} (${cls.name})` },
        children: [portraitImg(getCharacterSprite(u.classId))],
      });
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
        className: `btn act ${opts.accent}${opts.extra ? " " + opts.extra : ""}`,
        attrs: { title: opts.tip, ...(enabled ? {} : { disabled: "true" }) },
        onClick: enabled ? fn : undefined,
      });
      b.appendChild(el("span", { className: "act-dot" }));
      b.appendChild(el("span", { className: "act-label", text: label }));
      if (opts.key) b.appendChild(el("span", { className: "key-hint", text: opts.key }));
      return b;
    };
    this.actionMenu.appendChild(mk("Move", state.canMove, state.onMove, { accent: "a-move", tip: "Walk to a highlighted tile (respects range, terrain & jump)" }));
    if (state.canUndo) {
      this.actionMenu.appendChild(mk("Undo Move", true, state.onUndo ?? (() => {}), { accent: "a-undo", tip: "Take back your move — resets position so you can move again or choose elsewhere" }));
    }
    this.actionMenu.appendChild(mk("Attack", state.canAct, state.onAttack, { accent: "a-attack", tip: "Strike an enemy in weapon range — flank or rear for bonus damage" }));
    this.actionMenu.appendChild(mk("Skill", state.canAct, state.onSkill, { accent: "a-skill", tip: "Cast a learned class skill (costs MP)" }));
    this.actionMenu.appendChild(mk("Item", state.canAct, state.onItem, { accent: "a-item", tip: "Use a shared consumable" }));
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
    this.submenu.appendChild(el("div", { className: "submenu-title", text: "Skills" }));
    if (skills.length === 0) {
      this.submenu.appendChild(el("div", { text: "No skills learned. Spend JP at the Party Camp.", attrs: { style: "opacity:0.7;font-size:12px" } }));
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

  /** Hide all transient combat UI (used when entering banner/AI states). */
  hideCombatControls(): void {
    this.clearActions();
    this.hideSubmenu();
    this.setHint(null);
  }
}

function describeSkill(s: SkillDef): string {
  const shape = s.aoe === "single" ? "" : s.aoe === "cross" ? " +cross" : " 3x3";
  const verb =
    s.effect === "heal" ? "heal" : s.effect === "revive" ? "revive" : s.effect === "damage" ? "dmg" : s.effect;
  return `rng ${s.range}${shape} · ${verb}`;
}

const STATUS_INFO: Record<StatusKind, { label: string; tip: string; cls: string }> = {
  guard: { label: "Guard", tip: "Raised defense (takes less physical damage)", cls: "st-buff" },
  protect: { label: "Protect", tip: "Takes 25% less physical damage", cls: "st-buff" },
  shell: { label: "Shell", tip: "Takes 25% less magic damage", cls: "st-buff" },
  haste: { label: "Haste", tip: "Acts more often (turn speed ×1.5)", cls: "st-buff" },
  regen: { label: "Regen", tip: "Recovers HP at the end of each of its turns", cls: "st-buff" },
  slow: { label: "Slow", tip: "Acts less often (turn speed ×0.5)", cls: "st-debuff" },
  poison: { label: "Poison", tip: "Loses HP at the end of each of its turns", cls: "st-debuff" },
  stop: { label: "Stop", tip: "Frozen — forfeits its turns until it wears off", cls: "st-debuff" },
};

/** A row of readable status chips (with hover tooltips) for the info panels. */
function statusChips(unit: Unit): HTMLElement {
  const row = el("div", { className: "statuses" });
  for (const s of unit.statuses) {
    const info = STATUS_INFO[s.kind];
    row.appendChild(
      el("span", {
        className: `st-chip ${info.cls}`,
        text: `${info.label} ${s.turnsLeft}`,
        attrs: { title: info.tip },
      }),
    );
  }
  return row;
}

/** Compact, color-coded tags describing a skill for the cast menu. */
function skillTags(s: SkillDef): Array<{ text: string; cls: string }> {
  const tags: Array<{ text: string; cls: string }> = [];
  if (s.effect === "damage") tags.push({ text: `${s.power} pow · ${s.scaling === "magical" ? "MAG" : "ATK"}`, cls: "t-dmg" });
  else if (s.effect === "heal") tags.push({ text: `${s.power} pow heal`, cls: "t-heal" });
  else if (s.effect === "revive") tags.push({ text: "revive", cls: "t-heal" });
  else if (s.statusKind) {
    const info = STATUS_INFO[s.statusKind];
    tags.push({ text: `${info.label}${s.statusDuration ? ` ${s.statusDuration}t` : ""}`, cls: s.effect === "buff" ? "t-buff" : "t-debuff" });
  }
  tags.push({ text: s.range === 0 ? "self" : `rng ${s.range}`, cls: "t-meta" });
  if (s.aoe !== "single") tags.push({ text: s.aoe === "cross" ? "cross" : "3×3", cls: "t-meta" });
  if (s.knockback) tags.push({ text: `knockback ${s.knockback}`, cls: "t-meta" });
  if (s.element !== "none") tags.push({ text: s.element, cls: `t-elem t-${s.element}` });
  return tags;
}
