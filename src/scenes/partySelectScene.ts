import { ROSTER, PARTY_SIZE, createCustomParty, type HeroDef } from "../data/party";
import { startingInventory } from "../data/items";
import { clearSave, SAVE_SLOTS } from "../core/state";
import type { ClassId, Difficulty, RaceId } from "../core/types";
import { CLASSES, getClass } from "../data/classes";
import { RACES, getRace } from "../data/races";
import { statsForLevel } from "../core/unit";
import { getCharacterSprite, getHeroSprite } from "../data/sprites";
import { el, clear } from "../ui/dom";
import { iconImg } from "../ui/icons";
import type { GameContext, Scene } from "./sceneManager";

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: "Easy",
  normal: "Normal",
  hard: "Hard",
};

const DIFFICULTY_DESCS: Record<Difficulty, string> = {
  easy: "Easy — enemies are one level lower",
  normal: "Normal — as designed",
  hard: "Hard — enemies are two levels higher and tougher",
};

/** New Game flow: pick PARTY_SIZE heroes from the roster, then march to Phase I. */
export class PartySelectScene implements Scene {
  private root: HTMLDivElement;
  private selected = new Set<string>();
  /** Per-hero class/race overrides for the optional party customizer. Absent =
   *  the roster default. Only the selected heroes' picks matter at Begin. */
  private custom = new Map<string, { classId: ClassId; raceId: RaceId }>();
  private difficulty: Difficulty = "normal";
  private permadeath = false;
  private slot = 0;

  /** The hero's current class/race choice (override if customized, else roster). */
  private pickFor(hero: HeroDef): { classId: ClassId; raceId: RaceId } {
    return this.custom.get(hero.id) ?? { classId: hero.classId, raceId: hero.raceId };
  }

  private setHeroClass(hero: HeroDef, classId: ClassId): void {
    const cur = this.pickFor(hero);
    this.custom.set(hero.id, { ...cur, classId });
    this.render();
  }

  private setHeroRace(hero: HeroDef, raceId: RaceId): void {
    const cur = this.pickFor(hero);
    this.custom.set(hero.id, { ...cur, raceId });
    this.render();
  }

  constructor(private ctx: GameContext) {
    this.ctx.renderer.clear();
    this.root = el("div", { className: "ui-layer" });
    ctx.uiParent.appendChild(this.root);
    this.render();
  }

  private toggle(id: string): void {
    if (this.selected.has(id)) {
      this.selected.delete(id);
    } else if (this.selected.size < PARTY_SIZE) {
      this.selected.add(id);
    }
    this.render();
  }

  private setDifficulty(d: Difficulty): void {
    this.difficulty = d;
    this.render();
  }

  private setPermadeath(on: boolean): void {
    this.permadeath = on;
    this.render();
  }

  private setSlot(s: number): void {
    this.slot = s;
    this.render();
  }

  private begin(): void {
    if (this.selected.size !== PARTY_SIZE) return;
    const picks = ROSTER.filter((h) => this.selected.has(h.id)).map((h) => {
      const p = this.pickFor(h);
      return { id: h.id, classId: p.classId, raceId: p.raceId };
    });
    this.ctx.state.party = createCustomParty(picks);
    this.ctx.state.inventory = startingInventory();
    this.ctx.state.phaseIndex = 0;
    this.ctx.state.difficulty = this.difficulty;
    this.ctx.state.gold = 0;
    this.ctx.state.ownedEquipment = [];
    // Seed ownedWeapons from the starting party's equipped weapons.
    this.ctx.state.ownedWeapons = [...new Set(this.ctx.state.party.map((u) => u.weaponId))];
    this.ctx.state.slot = this.slot;
    this.ctx.state.ngPlus = 0;
    this.ctx.state.permadeath = this.permadeath;
    clearSave(this.slot);
    this.ctx.nav.toBattle(0);
  }

  private heroCard(hero: HeroDef): HTMLElement {
    const pick = this.pickFor(hero);
    const customized = this.custom.has(hero.id) && (pick.classId !== hero.classId || pick.raceId !== hero.raceId);
    const cls = getClass(pick.classId);
    const race = getRace(pick.raceId);
    const s = statsForLevel(pick.classId, 3, pick.raceId);
    const chosen = this.selected.has(hero.id);
    const card = el("div", {
      className: `unit-card selectable${chosen ? " selected" : ""}`,
      onClick: () => this.toggle(hero.id),
    });

    const head = el("div", { className: "card-head" });
    head.appendChild(iconImg(getHeroSprite(hero.id) ?? getCharacterSprite(pick.classId), 44));
    const headText = el("div");
    headText.appendChild(el("h3", { text: hero.name }));
    headText.appendChild(el("div", { className: "role", text: `${cls.name} · ${race.name}${customized ? " ·" : ""}` }));
    head.appendChild(headText);
    if (chosen) head.appendChild(el("div", { className: "pick-badge", text: "✓" }));
    card.appendChild(head);

    card.appendChild(
      el("div", { className: "role", attrs: { style: "opacity:0.6;margin-bottom:4px" }, text: cls.description }),
    );
    card.appendChild(
      el("div", { attrs: { style: "font-size:11px;opacity:0.6;margin-bottom:4px" }, text: race.description }),
    );
    card.appendChild(
      el("div", {
        attrs: { style: "font-size:12px;opacity:0.85" },
        text: `HP ${s.maxHp} · MP ${s.maxMp} · ATK ${s.atk} · DEF ${s.def} · MAG ${s.mag} · RES ${s.res} · SPD ${s.spd} · MOV ${s.move}`,
      }),
    );

    // Customizer: re-class / re-race a chosen hero. Only shown once the hero is
    // picked, to keep the roster grid scannable. Interacting with the selects must
    // not toggle the card's selection, so the controls swallow their own clicks.
    if (chosen) {
      const controls = el("div", { attrs: { style: "display:flex;gap:6px;margin-top:8px" } });
      controls.addEventListener("click", (e) => e.stopPropagation());
      controls.addEventListener("mousedown", (e) => e.stopPropagation());

      const classSel = el("select", { attrs: { style: "flex:1;min-width:0" } }) as HTMLSelectElement;
      for (const c of Object.values(CLASSES)) {
        const opt = el("option", { text: c.name, attrs: { value: c.id } });
        if (c.id === pick.classId) opt.selected = true;
        classSel.appendChild(opt);
      }
      classSel.addEventListener("change", () => this.setHeroClass(hero, classSel.value as ClassId));

      const raceSel = el("select", { attrs: { style: "flex:1;min-width:0" } }) as HTMLSelectElement;
      for (const r of Object.values(RACES)) {
        const opt = el("option", { text: r.name, attrs: { value: r.id } });
        if (r.id === pick.raceId) opt.selected = true;
        raceSel.appendChild(opt);
      }
      raceSel.addEventListener("change", () => this.setHeroRace(hero, raceSel.value as RaceId));

      controls.appendChild(classSel);
      controls.appendChild(raceSel);
      card.appendChild(controls);
    }
    return card;
  }

  private render(): void {
    clear(this.root);
    const screen = el("div", { className: "party-screen" });
    const ready = this.selected.size === PARTY_SIZE;

    // --- Header (fixed) ---
    const head = el("div", { className: "party-head" });
    head.appendChild(el("h1", { text: "Choose Your Party" }));
    head.appendChild(
      el("div", {
        className: "sub",
        text: `Five kingdoms fell; these ten still carry the Ashen Banner. Pick ${PARTY_SIZE} to march — and re-class or re-race any you choose. Your company grows as the campaign wears on.`,
      }),
    );
    screen.appendChild(head);

    // --- Body (scrolls): roster grid + campaign config ---
    const body = el("div", { className: "party-body" });
    const grid = el("div", { className: "party-grid" });
    for (const h of ROSTER) grid.appendChild(this.heroCard(h));
    body.appendChild(grid);

    // Difficulty selector
    body.appendChild(el("div", { attrs: { style: "font-size:13px;font-weight:700;opacity:0.7;margin:16px 0 6px;text-align:center" }, text: "Difficulty" }));
    const diffRow = el("div", { className: "difficulty-row" });
    for (const d of ["easy", "normal", "hard"] as Difficulty[]) {
      const active = this.difficulty === d;
      diffRow.appendChild(
        el("button", {
          className: `diff-btn ${d}${active ? " active" : ""}`,
          text: DIFFICULTY_LABELS[d],
          onClick: () => this.setDifficulty(d),
        }),
      );
    }
    body.appendChild(diffRow);
    body.appendChild(el("div", { className: "diff-desc", text: DIFFICULTY_DESCS[this.difficulty] }));

    // Classic mode (permadeath) toggle
    body.appendChild(el("div", { attrs: { style: "font-size:13px;font-weight:700;opacity:0.7;margin-bottom:6px;margin-top:10px;text-align:center" }, text: "Classic mode (permadeath)" }));
    const permaRow = el("div", { className: "difficulty-row" });
    for (const [label, on] of [["Off", false], ["On", true]] as [string, boolean][]) {
      const active = this.permadeath === on;
      permaRow.appendChild(
        el("button", {
          className: `diff-btn${active ? (on ? " active hard" : " active normal") : ""}`,
          text: label,
          onClick: () => this.setPermadeath(on),
        }),
      );
    }
    body.appendChild(permaRow);
    body.appendChild(el("div", { className: "diff-desc", text: "Fallen heroes are lost for good." }));

    // Save slot selector
    body.appendChild(el("div", { attrs: { style: "font-size:13px;font-weight:700;opacity:0.7;margin-bottom:6px;margin-top:10px;text-align:center" }, text: "Save Slot" }));
    const slotRow = el("div", { className: "difficulty-row" });
    for (let s = 0; s < SAVE_SLOTS; s++) {
      const active = this.slot === s;
      slotRow.appendChild(
        el("button", {
          className: `diff-btn${active ? " active normal" : ""}`,
          text: `Slot ${s + 1}`,
          onClick: () => this.setSlot(s),
        }),
      );
    }
    body.appendChild(slotRow);
    screen.appendChild(body);

    // --- Footer (fixed): selection count + the Begin action, always reachable ---
    const footer = el("div", { className: "party-footer" });
    footer.appendChild(
      el("div", {
        attrs: { style: "font-size:14px;margin-bottom:8px;opacity:0.85" },
        text: `Chosen ${this.selected.size}/${PARTY_SIZE}`,
      }),
    );
    footer.appendChild(
      el("button", {
        className: "btn",
        text: "Begin Campaign →",
        attrs: ready ? {} : { disabled: "true" },
        onClick: ready ? () => this.begin() : undefined,
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
