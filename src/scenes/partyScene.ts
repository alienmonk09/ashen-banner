import type { ClassId, EquipSlot, Reaction, Unit } from "../core/types";
import { CLASSES, getClass } from "../data/classes";
import { getRace } from "../data/races";
import { WEAPONS } from "../data/weapons";
import { equipmentForSlot, EQUIPMENT } from "../data/equipment";
import { getSkill } from "../data/skills";
import {
  statsForLevel,
  statsForUnit,
  equip as equipUnit,
  nextLearnableSkillForClass,
  learnSkillForClass,
  xpForLevel,
  masteredClasses,
  MASTERY_HP_BONUS,
  MASTERY_SPD_BONUS,
} from "../core/unit";
import { saveGame, buyItem, buyEquipment, ownsEquipment, sellItem, sellEquipment, ownsWeapon, buyWeapon, sellWeapon, partyAverageLevel } from "../core/state";
import { PHASES } from "../data/maps";
import {
  partyCapForPhase,
  recruitableHeroes,
  recruitHero,
  type HeroDef,
} from "../data/party";
import { ITEMS } from "../data/items";
import { getUnitSprite, getSkillSprite, getWeaponSprite, getEquipmentSprite, getCharacterSprite, getHeroSprite } from "../data/sprites";
import { el, clear } from "../ui/dom";
import { iconImg } from "../ui/icons";
import { startMusic, stopMusic } from "../engine/music";
import { REACTIONS, reactionName, reactionOptions } from "../data/reactions";
import type { GameContext, Scene } from "./sceneManager";

/** Between-phase screen: class change, equipment, and spending SP on skills. */
type CampTab = "party" | "reinforcements" | "shop";

export class PartyScene implements Scene {
  private root: HTMLDivElement;
  /** Which camp section is on screen. Persists across re-renders (buy/equip/etc). */
  private activeTab: CampTab = "party";
  /** The tab the last render painted — used to keep scroll position when a
   *  re-render stays on the same section (e.g. changing a card selector), and
   *  reset it only when the section actually changes. */
  private renderedTab: CampTab | null = null;

  constructor(private ctx: GameContext) {
    saveGame(ctx.state); // checkpoint progress
    this.ctx.renderer.clear();
    this.root = el("div", { className: "ui-layer" });
    ctx.uiParent.appendChild(this.root);
    startMusic("camp");
    this.render();
  }

  private changeClass(unit: Unit, classId: ClassId): void {
    if (unit.classId === classId) return;
    unit.classId = classId;
    const cls = getClass(classId);
    // Recompute stats for the new class at the unit's level (full HP/MP),
    // keeping racial modifiers and equipment bonuses (they persist across class changes).
    unit.stats = statsForUnit(unit);
    // Re-equip a weapon this class can use; keep the current one if usable.
    if (!cls.weaponIds.includes(unit.weaponId)) {
      unit.weaponId = cls.weaponIds[0];
      // Ensure the new default weapon is owned so the unit stays armed.
      if (!this.ctx.state.ownedWeapons.includes(unit.weaponId)) {
        this.ctx.state.ownedWeapons.push(unit.weaponId);
      }
    }
    // Ensure at least the first class skill is known so the class is usable.
    if (!unit.learnedSkillIds.includes(cls.skillIds[0])) unit.learnedSkillIds.push(cls.skillIds[0]);
    // A unit can't sub-job its own primary.
    if (unit.subClassId === classId) unit.subClassId = undefined;
    this.render();
  }

  private setSubJob(unit: Unit, classId: ClassId | ""): void {
    if (classId === "" || classId === unit.classId) {
      unit.subClassId = undefined;
    } else {
      unit.subClassId = classId;
      // Auto-learn the first sub-job skill so the secondary set is usable at once.
      const first = getClass(classId).skillIds[0];
      if (first && !unit.learnedSkillIds.includes(first)) unit.learnedSkillIds.push(first);
    }
    this.render();
  }

  private setReaction(unit: Unit, value: string): void {
    unit.reactionId = value ? (value as Reaction) : undefined;
    this.render();
  }

  private equip(unit: Unit, weaponId: string): void {
    unit.weaponId = weaponId;
    this.render();
  }

  private equipItem(unit: Unit, slot: EquipSlot, id: string | null): void {
    equipUnit(unit, slot, id);
    this.render();
  }

  private learnFrom(unit: Unit, classId: ClassId): void {
    const next = nextLearnableSkillForClass(unit, classId);
    if (!next) return;
    if (learnSkillForClass(unit, classId, getSkill(next).spCost)) this.render();
  }

  /** A "SP / Learn next" row for a given class (primary or secondary job). */
  private learnRow(unit: Unit, classId: ClassId, labelPrefix: string): HTMLElement {
    const next = nextLearnableSkillForClass(unit, classId);
    const row = el("div", { className: "learn-row" });
    if (next) {
      const skill = getSkill(next);
      const affordable = unit.sp >= skill.spCost;
      row.appendChild(
        el("button", {
          className: "btn small",
          text: `${labelPrefix}Learn ${skill.name} (${skill.spCost} SP)`,
          attrs: affordable ? {} : { disabled: "true" },
          onClick: affordable ? () => this.learnFrom(unit, classId) : undefined,
        }),
      );
    } else {
      row.appendChild(el("span", { text: `${labelPrefix}all learned`, attrs: { style: "font-size:12px;opacity:0.6" } }));
    }
    return row;
  }

  /** New recruits join at the party's average level — the shared-XP flow keeps
   *  the whole party uniform, so a recruit lands right on the team's curve. */
  private recruitLevel(): number {
    return partyAverageLevel(this.ctx.state.party);
  }

  private recruit(hero: HeroDef): void {
    const cap = partyCapForPhase(this.ctx.state.phaseIndex);
    if (this.ctx.state.party.length >= cap) return;
    if (this.ctx.state.party.some((u) => u.id === hero.id)) return;
    const newUnit = recruitHero(hero, this.recruitLevel());
    this.ctx.state.party.push(newUnit);
    // Ensure the recruit's starting weapon is owned.
    if (!this.ctx.state.ownedWeapons.includes(newUnit.weaponId)) {
      this.ctx.state.ownedWeapons.push(newUnit.weaponId);
    }
    saveGame(this.ctx.state);
    this.render();
  }

  private recruitCard(hero: HeroDef): HTMLElement {
    const cls = getClass(hero.classId);
    const race = getRace(hero.raceId);
    const s = statsForLevel(hero.classId, this.recruitLevel(), hero.raceId);
    const card = el("div", { className: "unit-card selectable", onClick: () => this.recruit(hero) });
    const head = el("div", { className: "card-head" });
    head.appendChild(iconImg(getHeroSprite(hero.id) ?? getCharacterSprite(hero.classId), 44));
    const headText = el("div");
    headText.appendChild(el("h3", { text: hero.name }));
    headText.appendChild(el("div", { className: "role", text: `${cls.name} · ${race.name} · joins at Lv ${this.recruitLevel()}` }));
    head.appendChild(headText);
    head.appendChild(el("div", { className: "pick-badge", attrs: { style: "background:#5fbf72" }, text: "+" }));
    card.appendChild(head);
    card.appendChild(
      el("div", {
        attrs: { style: "font-size:12px;opacity:0.85" },
        text: `HP ${s.maxHp} · MP ${s.maxMp} · ATK ${s.atk} · DEF ${s.def} · MAG ${s.mag} · RES ${s.res} · SPD ${s.spd}`,
      }),
    );
    return card;
  }

  private unitCard(unit: Unit): HTMLElement {
    const cls = getClass(unit.classId);
    const card = el("div", { className: "unit-card" });
    const head = el("div", { className: "card-head" });
    head.appendChild(iconImg(getUnitSprite(unit), 44));
    const headText = el("div");
    headText.appendChild(el("h3", { text: unit.name }));
    headText.appendChild(
      el("div", { className: "role", text: `${cls.name} · ${getRace(unit.raceId).name} · Lv ${unit.level}` }),
    );
    head.appendChild(headText);
    card.appendChild(head);
    card.appendChild(
      el("div", { className: "role", attrs: { style: "opacity:0.6;margin-bottom:4px" }, text: cls.description }),
    );
    card.appendChild(
      el("div", {
        attrs: { style: "font-size:12px;opacity:0.85" },
        text: `HP ${unit.stats.maxHp} · MP ${unit.stats.maxMp} · ATK ${unit.stats.atk} · DEF ${unit.stats.def} · MAG ${unit.stats.mag} · RES ${unit.stats.res} · SPD ${unit.stats.spd}`,
      }),
    );
    card.appendChild(
      el("div", {
        attrs: { style: "font-size:12px;opacity:0.7;margin-top:4px" },
        text: `XP ${unit.xp}/${xpForLevel(unit.level)}`,
      }),
    );

    // Job mastery passive: show mastered classes if any.
    const mastered = masteredClasses(unit);
    if (mastered.length > 0) {
      const names = mastered.map((id) => getClass(id).name).join(", ");
      const hpGain = mastered.length * MASTERY_HP_BONUS;
      const spdGain = mastered.length * MASTERY_SPD_BONUS;
      card.appendChild(
        el("div", {
          attrs: { style: "font-size:12px;color:#f0c060;margin-top:2px" },
          text: `Mastered: ${names} (+${hpGain} HP, +${spdGain} SPD)`,
        }),
      );
    }

    // Class change.
    card.appendChild(el("label", { text: "Class" }));
    const classSel = el("select");
    for (const c of Object.values(CLASSES)) {
      const opt = el("option", { text: c.name, attrs: { value: c.id } });
      if (c.id === unit.classId) opt.selected = true;
      classSel.appendChild(opt);
    }
    classSel.addEventListener("change", () => this.changeClass(unit, classSel.value as ClassId));
    card.appendChild(classSel);

    // Secondary job — a second class's skill set, usable alongside the primary.
    card.appendChild(el("label", { text: "Sub-job (second skill set)" }));
    const subSel = el("select");
    const noneOpt = el("option", { text: "— none —", attrs: { value: "" } });
    if (!unit.subClassId) noneOpt.selected = true;
    subSel.appendChild(noneOpt);
    for (const c of Object.values(CLASSES)) {
      if (c.id === unit.classId) continue; // can't sub your own primary
      const opt = el("option", { text: c.name, attrs: { value: c.id } });
      if (c.id === unit.subClassId) opt.selected = true;
      subSel.appendChild(opt);
    }
    subSel.addEventListener("change", () => this.setSubJob(unit, subSel.value as ClassId | ""));
    card.appendChild(subSel);

    // Equippable reaction — one extra reaction ability on top of class-innate
    // reactions. Reactions are passive triggers that fire automatically (no turn
    // cost) in response to an enemy action.
    const innate = getClass(unit.classId).reactions ?? [];
    const innateNote = innate.length
      ? `Innate: ${innate.map(reactionName).join(", ")}`
      : "No innate reactions";
    card.appendChild(
      el("label", { text: `Reaction (${innateNote})` }),
    );
    const reactionSel = el("select");
    const reactionNoneOpt = el("option", { text: "— none —", attrs: { value: "" } });
    if (!unit.reactionId) reactionNoneOpt.selected = true;
    reactionSel.appendChild(reactionNoneOpt);
    for (const [id, label] of reactionOptions()) {
      const opt = el("option", { text: label, attrs: { value: id } });
      if (unit.reactionId === id) opt.selected = true;
      reactionSel.appendChild(opt);
    }
    reactionSel.addEventListener("change", () => this.setReaction(unit, reactionSel.value));
    card.appendChild(reactionSel);

    // Explain every reaction the unit actually has (innate + equipped), so the
    // player knows what each one does rather than just its name.
    const activeReactions = [...new Set([...innate, ...(unit.reactionId ? [unit.reactionId] : [])])];
    if (activeReactions.length > 0) {
      const help = el("div", { className: "reaction-help" });
      for (const r of activeReactions) {
        const info = REACTIONS[r];
        help.appendChild(
          el("div", {
            className: "reaction-help-row",
            children: [
              el("span", { className: "reaction-help-name", text: info.name }),
              el("span", { className: "reaction-help-desc", text: info.description }),
            ],
          }),
        );
      }
      card.appendChild(help);
    }

    // Equipment.
    card.appendChild(
      el("label", {
        className: "wlabel",
        children: [el("span", { text: "Weapon" }), iconImg(getWeaponSprite(unit.weaponId), 18)],
      }),
    );
    const wSel = el("select");
    // List owned weapons usable by this class, always including the currently equipped one.
    const usableWeapons = Object.values(WEAPONS).filter(
      (w) => w.classes.includes(unit.classId) &&
        (ownsWeapon(this.ctx.state, w.id) || w.id === unit.weaponId),
    );
    for (const w of usableWeapons) {
      const opt = el("option", { text: `${w.name} (pow ${w.power}, rng ${w.range})`, attrs: { value: w.id } });
      if (w.id === unit.weaponId) opt.selected = true;
      wSel.appendChild(opt);
    }
    wSel.addEventListener("change", () => this.equip(unit, wSel.value));
    card.appendChild(wSel);

    // Armor slot — only list owned pieces (plus the currently-equipped one as a safe guard).
    card.appendChild(
      el("label", {
        className: "wlabel",
        children: [el("span", { text: "Armor" }), iconImg(getEquipmentSprite("armor"), 18)],
      }),
    );
    const armorSel = el("select");
    armorSel.appendChild(el("option", { text: "— none —", attrs: { value: "" } }));
    for (const a of equipmentForSlot("armor").filter(
      (e) => ownsEquipment(this.ctx.state, e.id) || e.id === unit.armorId,
    )) {
      const modHint = Object.entries(a.mod)
        .map(([k, v]) => `${(v as number) >= 0 ? "+" : ""}${v as number} ${k.toUpperCase()}`)
        .join(", ");
      const opt = el("option", { text: `${a.name} (${modHint})`, attrs: { value: a.id } });
      if (a.id === unit.armorId) opt.selected = true;
      armorSel.appendChild(opt);
    }
    armorSel.addEventListener("change", () => this.equipItem(unit, "armor", armorSel.value || null));
    card.appendChild(armorSel);

    // Accessory slot — only list owned pieces (plus the currently-equipped one as a safe guard).
    card.appendChild(
      el("label", {
        className: "wlabel",
        children: [el("span", { text: "Accessory" }), iconImg(getEquipmentSprite("accessory"), 18)],
      }),
    );
    const accSel = el("select");
    accSel.appendChild(el("option", { text: "— none —", attrs: { value: "" } }));
    for (const acc of equipmentForSlot("accessory").filter(
      (e) => ownsEquipment(this.ctx.state, e.id) || e.id === unit.accessoryId,
    )) {
      const modHint = Object.entries(acc.mod)
        .map(([k, v]) => `${(v as number) >= 0 ? "+" : ""}${v as number} ${k.toUpperCase()}`)
        .join(", ");
      const opt = el("option", { text: `${acc.name} (${modHint})`, attrs: { value: acc.id } });
      if (acc.id === unit.accessoryId) opt.selected = true;
      accSel.appendChild(opt);
    }
    accSel.addEventListener("change", () => this.equipItem(unit, "accessory", accSel.value || null));
    card.appendChild(accSel);

    // Skills usable now = learned skills from the primary class + secondary job.
    const usable = new Set(cls.skillIds);
    if (unit.subClassId) for (const id of getClass(unit.subClassId).skillIds) usable.add(id);
    const knownIds = unit.learnedSkillIds.filter((id) => usable.has(id));
    card.appendChild(
      el("div", {
        className: "skills",
        text: `Skills: ${knownIds.length ? knownIds.map((id) => getSkill(id).name).join(", ") : "—"}`,
      }),
    );
    if (knownIds.length) {
      const srow = el("div", { className: "skill-icons" });
      for (const id of knownIds) srow.appendChild(iconImg(getSkillSprite(id), 20));
      card.appendChild(srow);
    }

    // Spend SP: learn the next skill of the primary class and (if set) the sub-job.
    card.appendChild(el("div", { text: `Skill Points: ${unit.sp}`, attrs: { style: "font-size:13px;margin-top:6px" } }));
    card.appendChild(this.learnRow(unit, unit.classId, ""));
    if (unit.subClassId) card.appendChild(this.learnRow(unit, unit.subClassId, `${getClass(unit.subClassId).name}: `));
    return card;
  }

  /** Open slots available for reinforcements at the current phase. */
  private openSlots(): number {
    return partyCapForPhase(this.ctx.state.phaseIndex) - this.ctx.state.party.length;
  }

  private hasReinforcements(): boolean {
    return this.openSlots() > 0 && recruitableHeroes(this.ctx.state.party).length > 0;
  }

  private setTab(tab: CampTab): void {
    this.activeTab = tab;
    this.render();
  }

  private render(): void {
    // Preserve the body's scroll position across a same-section re-render so that
    // changing a selector (class / weapon / equipment) on a card doesn't jolt the
    // whole screen back to the top. A genuine section change starts at the top.
    const prevBody = this.root.querySelector(".party-body") as HTMLElement | null;
    const keepScroll = prevBody && this.renderedTab === this.activeTab ? prevBody.scrollTop : 0;
    clear(this.root);
    const screen = el("div", { className: "party-screen" });
    const idx = this.ctx.state.phaseIndex;
    const nextMap = PHASES[idx];

    // Reinforcements tab only exists while slots are open; fall back if it vanished.
    const showReinforce = this.hasReinforcements();
    if (this.activeTab === "reinforcements" && !showReinforce) this.activeTab = "party";

    // --- Header: title, status, gold, and the section tab bar (all fixed). ---
    const head = el("div", { className: "party-head" });
    head.appendChild(el("h1", { text: "Party Camp" }));
    if (this.ctx.state.permadeath) {
      head.appendChild(el("div", { className: "diff-desc", attrs: { style: "color:#ff9a9a;font-weight:700;margin:0" }, text: "⚑ Classic mode — fallen heroes are lost for good." }));
    }
    head.appendChild(
      el("div", {
        className: "sub",
        text: `Next: Phase ${idx + 1} — ${nextMap.name}. Units are fully restored before each battle.`,
      }),
    );
    head.appendChild(el("div", { className: "camp-gold", text: `Gold: ${this.ctx.state.gold}` }));

    const tabs = el("div", { className: "camp-tabs" });
    const tabDef: { id: CampTab; label: string; badge?: string }[] = [
      { id: "party", label: "Party" },
      ...(showReinforce ? [{ id: "reinforcements" as CampTab, label: "Reinforcements", badge: String(this.openSlots()) }] : []),
      { id: "shop", label: "Shop" },
    ];
    for (const t of tabDef) {
      const btn = el("button", {
        className: `camp-tab${this.activeTab === t.id ? " active" : ""}`,
        onClick: () => this.setTab(t.id),
      });
      btn.appendChild(el("span", { text: t.label }));
      if (t.badge) btn.appendChild(el("span", { className: "tab-badge", text: t.badge }));
      tabs.appendChild(btn);
    }
    head.appendChild(tabs);
    screen.appendChild(head);

    // --- Body: the active section scrolls within the bounded viewport. ---
    const body = el("div", { className: "party-body" });
    if (this.activeTab === "party") this.renderPartySection(body);
    else if (this.activeTab === "reinforcements") this.renderReinforcementsSection(body);
    else this.renderShopSection(body);
    screen.appendChild(body);

    // --- Footer: March button, always reachable. ---
    const footer = el("div", { className: "party-footer" });
    footer.appendChild(
      el("button", {
        className: "btn",
        text: `March to Phase ${idx + 1} →`,
        onClick: () => this.ctx.nav.toBattle(idx),
      }),
    );
    screen.appendChild(footer);
    this.root.appendChild(screen);
    // Restore scroll now the new body is in the DOM and laid out.
    body.scrollTop = keepScroll;
    this.renderedTab = this.activeTab;
  }

  /** Party section: the editable roster of unit cards. */
  private renderPartySection(body: HTMLElement): void {
    const grid = el("div", { className: "party-grid" });
    for (const u of this.ctx.state.party) grid.appendChild(this.unitCard(u));
    body.appendChild(grid);
  }

  /** Reinforcements section: recruit heroes into open deployment slots. */
  private renderReinforcementsSection(body: HTMLElement): void {
    const open = this.openSlots();
    const recruits = recruitableHeroes(this.ctx.state.party);
    body.appendChild(
      el("div", {
        className: "section-title",
        text: `Reinforcements — ${open} slot${open !== 1 ? "s" : ""} open`,
      }),
    );
    body.appendChild(
      el("div", { className: "sub", attrs: { style: "margin-bottom:14px" }, text: "Word of the banner spreads. Choose a hero to join your march." }),
    );
    const rgrid = el("div", { className: "party-grid" });
    for (const h of recruits) rgrid.appendChild(this.recruitCard(h));
    body.appendChild(rgrid);
  }

  /** Shop section: inventory plus the consumable, gear, and weapon shops. */
  private renderShopSection(body: HTMLElement): void {
    const screen = body;
    const inv = Object.entries(this.ctx.state.inventory)
      .filter(([, c]) => c > 0)
      .map(([id, c]) => `${id} ×${c}`)
      .join("   ");
    screen.appendChild(el("div", { className: "inv-line", text: `Inventory: ${inv || "empty"}` }));

    // Shop section.
    screen.appendChild(el("div", { className: "section-title", text: "Camp Supply" }));
    const shopGrid = el("div", { className: "shop-grid" });
    for (const item of Object.values(ITEMS)) {
      const owned = this.ctx.state.inventory[item.id] ?? 0;
      const canAfford = this.ctx.state.gold >= item.price;
      const row = el("div", { className: "shop-row" });
      row.appendChild(
        el("div", {
          className: "shop-item-info",
          children: [
            el("span", { className: "shop-item-name", text: item.name }),
            el("span", { className: "shop-item-desc", text: item.description }),
          ],
        }),
      );
      const sellValue = Math.floor(item.price / 2);
      const canSell = owned > 0;
      row.appendChild(
        el("div", {
          className: "shop-item-meta",
          children: [
            el("span", { className: "shop-item-price", text: `${item.price} gold` }),
            el("span", { className: "shop-item-owned", text: `×${owned}` }),
            el("button", {
              className: "btn small",
              text: "Buy",
              attrs: canAfford ? {} : { disabled: "true" },
              onClick: canAfford
                ? () => {
                    buyItem(this.ctx.state, item.id);
                    saveGame(this.ctx.state);
                    this.render();
                  }
                : undefined,
            }),
            el("button", {
              className: "btn small",
              text: `Sell +${sellValue}`,
              attrs: canSell ? {} : { disabled: "true" },
              onClick: canSell
                ? () => {
                    sellItem(this.ctx.state, item.id);
                    saveGame(this.ctx.state);
                    this.render();
                  }
                : undefined,
            }),
          ],
        }),
      );
      shopGrid.appendChild(row);
    }
    screen.appendChild(shopGrid);

    // Gear shop section.
    screen.appendChild(el("div", { className: "section-title", text: "Gear Shop" }));
    screen.appendChild(
      el("div", { className: "inv-line", attrs: { style: "margin-bottom:10px" }, text: "Buy equipment once — any unit can equip it." }),
    );
    const gearGrid = el("div", { className: "shop-grid" });
    for (const equip of Object.values(EQUIPMENT)) {
      const owned = ownsEquipment(this.ctx.state, equip.id);
      const canAfford = this.ctx.state.gold >= equip.price;
      const modHint = Object.entries(equip.mod)
        .map(([k, v]) => `${(v as number) >= 0 ? "+" : ""}${v as number} ${k.toUpperCase()}`)
        .join(", ");
      const row = el("div", { className: "shop-row" });
      row.appendChild(
        el("div", {
          className: "shop-item-info",
          children: [
            el("span", {
              className: "shop-item-name",
              text: `${equip.name} (${equip.slot === "armor" ? "Armor" : "Accessory"})`,
            }),
            el("span", { className: "shop-item-desc", text: `${modHint} — ${equip.description}` }),
          ],
        }),
      );
      const gearSellValue = Math.floor(equip.price / 2);
      row.appendChild(
        el("div", {
          className: "shop-item-meta",
          children: [
            el("span", { className: "shop-item-price", text: `${equip.price} gold` }),
            el("span", {
              className: "shop-item-owned",
              text: owned ? "owned" : "",
              attrs: owned ? { style: "color:#5fbf72;font-size:12px" } : {},
            }),
            owned
              ? el("button", {
                  className: "btn small",
                  text: `Sell +${gearSellValue}`,
                  onClick: () => {
                    sellEquipment(this.ctx.state, equip.id);
                    saveGame(this.ctx.state);
                    this.render();
                  },
                })
              : el("button", {
                  className: "btn small",
                  text: "Buy",
                  attrs: canAfford ? {} : { disabled: "true" },
                  onClick: canAfford
                    ? () => {
                        buyEquipment(this.ctx.state, equip.id);
                        saveGame(this.ctx.state);
                        this.render();
                      }
                    : undefined,
                }),
          ],
        }),
      );
      gearGrid.appendChild(row);
    }
    screen.appendChild(gearGrid);

    // Weapon shop section.
    screen.appendChild(el("div", { className: "section-title", text: "Weapon Shop" }));
    screen.appendChild(
      el("div", { className: "inv-line", attrs: { style: "margin-bottom:10px" }, text: "Buy upgrade weapons — class-locked; a unit can never be left unarmed." }),
    );
    const weaponGrid = el("div", { className: "shop-grid" });
    for (const weapon of Object.values(WEAPONS)) {
      // Only show weapons with a positive price (starter weapons are free / default-owned).
      if (weapon.price <= 0) continue;
      const owned = ownsWeapon(this.ctx.state, weapon.id);
      const canAfford = this.ctx.state.gold >= weapon.price;
      const isEquipped = this.ctx.state.party.some((u) => u.weaponId === weapon.id);
      const classNames = weapon.classes.map((c) => CLASSES[c].name).join(", ");
      const row = el("div", { className: "shop-row" });
      row.appendChild(
        el("div", {
          className: "shop-item-info",
          children: [
            el("span", { className: "shop-item-name", text: weapon.name }),
            el("span", { className: "shop-item-desc", text: `POW ${weapon.power}, RNG ${weapon.range} — ${classNames}` }),
          ],
        }),
      );
      const weaponSellValue = Math.floor(weapon.price / 2);
      row.appendChild(
        el("div", {
          className: "shop-item-meta",
          children: [
            el("span", { className: "shop-item-price", text: `${weapon.price} gold` }),
            el("span", {
              className: "shop-item-owned",
              text: owned ? "owned" : "",
              attrs: owned ? { style: "color:#5fbf72;font-size:12px" } : {},
            }),
            owned
              ? el("button", {
                  className: "btn small",
                  text: `Sell +${weaponSellValue}`,
                  attrs: isEquipped ? { disabled: "true" } : {},
                  onClick: isEquipped
                    ? undefined
                    : () => {
                        sellWeapon(this.ctx.state, weapon.id);
                        saveGame(this.ctx.state);
                        this.render();
                      },
                })
              : el("button", {
                  className: "btn small",
                  text: "Buy",
                  attrs: canAfford ? {} : { disabled: "true" },
                  onClick: canAfford
                    ? () => {
                        buyWeapon(this.ctx.state, weapon.id);
                        saveGame(this.ctx.state);
                        this.render();
                      }
                    : undefined,
                }),
          ],
        }),
      );
      weaponGrid.appendChild(row);
    }
    screen.appendChild(weaponGrid);
  }

  update(_dt: number): void {
    // Static screen; nothing to animate.
  }

  dispose(): void {
    stopMusic();
    this.root.remove();
  }
}
