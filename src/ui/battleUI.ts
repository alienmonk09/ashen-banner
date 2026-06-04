import type { ItemDef, SkillDef, Unit } from "../core/types";
import { getClass } from "../data/classes";
import { getWeapon } from "../data/weapons";
import { getCharacterSprite, getItemSprite, getSkillSprite, getWeaponSprite } from "../data/sprites";
import { el, clear } from "./dom";
import { iconImg, portraitImg } from "./icons";

export interface ActionState {
  canMove: boolean;
  canAct: boolean;
  onMove: () => void;
  onAttack: () => void;
  onSkill: () => void;
  onItem: () => void;
  onWait: () => void;
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
  private unitPanel: HTMLDivElement;
  private targetPanel: HTMLDivElement;
  private actionMenu: HTMLDivElement;
  private submenu: HTMLDivElement;
  private toastEl: HTMLDivElement;
  private hintEl: HTMLDivElement;
  private bannerEl: HTMLDivElement;
  private toastTimer = 0;
  /** Screen point (CSS px) the action menu/submenu anchor to; null = docked. */
  private menuAnchor: { x: number; y: number } | null = null;

  constructor(parent: HTMLElement) {
    this.layer = el("div", { className: "ui-layer" });
    this.turnBar = el("div", { className: "panel turn-bar" });
    this.unitPanel = el("div", { className: "panel unit-panel" });
    this.targetPanel = el("div", { className: "panel target-panel" });
    this.actionMenu = el("div", { className: "panel action-menu" });
    this.submenu = el("div", { className: "panel submenu" });
    this.toastEl = el("div", { className: "panel toast" });
    this.hintEl = el("div", { className: "hint" });
    this.bannerEl = el("div", { className: "banner" });
    for (const n of [
      this.turnBar,
      this.unitPanel,
      this.targetPanel,
      this.actionMenu,
      this.submenu,
      this.toastEl,
      this.hintEl,
      this.bannerEl,
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
      el("div", { className: "statuses", text: unit.statuses.map((s) => `${s.kind}(${s.turnsLeft})`).join(" ") }),
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
    const mk = (label: string, enabled: boolean, fn: () => void) =>
      el("button", {
        className: "btn",
        text: label,
        attrs: enabled ? {} : { disabled: "true" },
        onClick: enabled ? fn : undefined,
      });
    this.actionMenu.appendChild(mk("Move", state.canMove, state.onMove));
    this.actionMenu.appendChild(mk("Attack", state.canAct, state.onAttack));
    this.actionMenu.appendChild(mk("Skill", state.canAct, state.onSkill));
    this.actionMenu.appendChild(mk("Item", state.canAct, state.onItem));
    this.actionMenu.appendChild(mk("Wait", true, state.onWait));
    this.actionMenu.style.display = "flex";
    this.placeFloating(this.actionMenu);
  }

  clearActions(): void {
    this.actionMenu.style.display = "none";
  }

  // --- Submenus ---

  showSkillMenu(skills: SkillDef[], unit: Unit, onPick: (s: SkillDef) => void, onBack: () => void): void {
    clear(this.submenu);
    if (skills.length === 0) {
      this.submenu.appendChild(el("div", { text: "No skills learned.", attrs: { style: "opacity:0.7" } }));
    }
    for (const s of skills) {
      const affordable = unit.stats.mp >= s.mpCost;
      const row = el("div", { className: "row" });
      const left = el("div", { className: "row-left" });
      left.appendChild(iconImg(getSkillSprite(s.id), 22));
      left.appendChild(
        el("button", {
          className: "btn small",
          text: s.name,
          attrs: affordable ? {} : { disabled: "true" },
          onClick: affordable ? () => onPick(s) : undefined,
        }),
      );
      row.appendChild(left);
      row.appendChild(el("span", { className: "cost", text: `MP ${s.mpCost} · ${describeSkill(s)}` }));
      this.submenu.appendChild(row);
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
