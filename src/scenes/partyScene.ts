import type { ClassId, EquipSlot, Unit } from "../core/types";
import { CLASSES, getClass } from "../data/classes";
import { getRace } from "../data/races";
import { getWeapon } from "../data/weapons";
import { equipmentForSlot } from "../data/equipment";
import { getSkill } from "../data/skills";
import {
  statsForLevel,
  statsForUnit,
  equip as equipUnit,
  nextLearnableSkillForClass,
  learnSkillForClass,
  xpForLevel,
} from "../core/unit";
import { saveGame } from "../core/state";
import { PHASES } from "../data/maps";
import {
  partyCapForPhase,
  recruitableHeroes,
  recruitHero,
  type HeroDef,
} from "../data/party";
import { getUnitSprite, getSkillSprite, getWeaponSprite, getEquipmentSprite, getCharacterSprite, getHeroSprite } from "../data/sprites";
import { el, clear } from "../ui/dom";
import { iconImg } from "../ui/icons";
import type { GameContext, Scene } from "./sceneManager";

/** Between-phase screen: class change, equipment, and spending JP on skills. */
export class PartyScene implements Scene {
  private root: HTMLDivElement;

  constructor(private ctx: GameContext) {
    saveGame(ctx.state); // checkpoint progress
    this.ctx.renderer.clear();
    this.root = el("div", { className: "ui-layer" });
    ctx.uiParent.appendChild(this.root);
    this.render();
  }

  private changeClass(unit: Unit, classId: ClassId): void {
    if (unit.classId === classId) return;
    unit.classId = classId;
    const cls = getClass(classId);
    // Recompute stats for the new class at the unit's level (full HP/MP),
    // keeping racial modifiers and equipment bonuses (they persist across class changes).
    unit.stats = statsForUnit(unit);
    // Re-equip a weapon this class can use.
    if (!cls.weaponIds.includes(unit.weaponId)) unit.weaponId = cls.weaponIds[0];
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
    if (learnSkillForClass(unit, classId, getSkill(next).jpCost)) this.render();
  }

  /** A "JP / Learn next" row for a given class (primary or secondary job). */
  private learnRow(unit: Unit, classId: ClassId, labelPrefix: string): HTMLElement {
    const next = nextLearnableSkillForClass(unit, classId);
    const row = el("div", { className: "jpline" });
    if (next) {
      const skill = getSkill(next);
      const affordable = unit.jp >= skill.jpCost;
      row.appendChild(
        el("button", {
          className: "btn small",
          text: `${labelPrefix}Learn ${skill.name} (${skill.jpCost} JP)`,
          attrs: affordable ? {} : { disabled: "true" },
          onClick: affordable ? () => this.learnFrom(unit, classId) : undefined,
        }),
      );
    } else {
      row.appendChild(el("span", { text: `${labelPrefix}all learned`, attrs: { style: "font-size:12px;opacity:0.6" } }));
    }
    return row;
  }

  /** Average party level (floored at 3) — new recruits join at this level. */
  private recruitLevel(): number {
    const party = this.ctx.state.party;
    if (party.length === 0) return 3;
    return Math.max(3, Math.round(party.reduce((s, u) => s + u.level, 0) / party.length));
  }

  private recruit(hero: HeroDef): void {
    const cap = partyCapForPhase(this.ctx.state.phaseIndex);
    if (this.ctx.state.party.length >= cap) return;
    if (this.ctx.state.party.some((u) => u.id === hero.id)) return;
    this.ctx.state.party.push(recruitHero(hero, this.recruitLevel()));
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

    // Equipment.
    card.appendChild(
      el("label", {
        className: "wlabel",
        children: [el("span", { text: "Weapon" }), iconImg(getWeaponSprite(unit.weaponId), 18)],
      }),
    );
    const wSel = el("select");
    for (const wid of cls.weaponIds) {
      const w = getWeapon(wid);
      const opt = el("option", { text: `${w.name} (pow ${w.power}, rng ${w.range})`, attrs: { value: w.id } });
      if (w.id === unit.weaponId) opt.selected = true;
      wSel.appendChild(opt);
    }
    wSel.addEventListener("change", () => this.equip(unit, wSel.value));
    card.appendChild(wSel);

    // Armor slot.
    card.appendChild(
      el("label", {
        className: "wlabel",
        children: [el("span", { text: "Armor" }), iconImg(getEquipmentSprite("armor"), 18)],
      }),
    );
    const armorSel = el("select");
    armorSel.appendChild(el("option", { text: "— none —", attrs: { value: "" } }));
    for (const a of equipmentForSlot("armor")) {
      const modHint = Object.entries(a.mod)
        .map(([k, v]) => `${(v as number) >= 0 ? "+" : ""}${v as number} ${k.toUpperCase()}`)
        .join(", ");
      const opt = el("option", { text: `${a.name} (${modHint})`, attrs: { value: a.id } });
      if (a.id === unit.armorId) opt.selected = true;
      armorSel.appendChild(opt);
    }
    armorSel.addEventListener("change", () => this.equipItem(unit, "armor", armorSel.value || null));
    card.appendChild(armorSel);

    // Accessory slot.
    card.appendChild(
      el("label", {
        className: "wlabel",
        children: [el("span", { text: "Accessory" }), iconImg(getEquipmentSprite("accessory"), 18)],
      }),
    );
    const accSel = el("select");
    accSel.appendChild(el("option", { text: "— none —", attrs: { value: "" } }));
    for (const acc of equipmentForSlot("accessory")) {
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

    // Spend JP: learn the next skill of the primary class and (if set) the sub-job.
    card.appendChild(el("div", { text: `JP: ${unit.jp}`, attrs: { style: "font-size:13px;margin-top:6px" } }));
    card.appendChild(this.learnRow(unit, unit.classId, ""));
    if (unit.subClassId) card.appendChild(this.learnRow(unit, unit.subClassId, `${getClass(unit.subClassId).name}: `));
    return card;
  }

  private render(): void {
    clear(this.root);
    const screen = el("div", { className: "party-screen" });
    const idx = this.ctx.state.phaseIndex;
    const nextMap = PHASES[idx];
    screen.appendChild(el("h1", { text: "Party Camp" }));
    screen.appendChild(
      el("div", {
        className: "sub",
        text: `Prepare your party. Next: Phase ${idx + 1} — ${nextMap.name}. Units are fully restored before each battle.`,
      }),
    );

    const grid = el("div", { className: "party-grid" });
    for (const u of this.ctx.state.party) grid.appendChild(this.unitCard(u));
    screen.appendChild(grid);

    // Reinforcements: fill open deployment slots from the rest of the roster.
    const cap = partyCapForPhase(idx);
    const recruits = recruitableHeroes(this.ctx.state.party);
    const openSlots = cap - this.ctx.state.party.length;
    if (openSlots > 0 && recruits.length > 0) {
      screen.appendChild(
        el("div", {
          className: "section-title",
          text: `Reinforcements — ${openSlots} slot${openSlots > 1 ? "s" : ""} open`,
        }),
      );
      screen.appendChild(
        el("div", { className: "sub", attrs: { style: "margin-bottom:14px" }, text: "Word of the banner spreads. Choose a hero to join your march." }),
      );
      const rgrid = el("div", { className: "party-grid" });
      for (const h of recruits) rgrid.appendChild(this.recruitCard(h));
      screen.appendChild(rgrid);
    }

    const inv = Object.entries(this.ctx.state.inventory)
      .filter(([, c]) => c > 0)
      .map(([id, c]) => `${id} ×${c}`)
      .join("   ");
    screen.appendChild(el("div", { className: "inv-line", text: `Inventory: ${inv || "empty"}` }));

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
  }

  update(_dt: number): void {
    // Static screen; nothing to animate.
  }

  dispose(): void {
    this.root.remove();
  }
}
