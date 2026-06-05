import { ROSTER, PARTY_SIZE, createParty, type HeroDef } from "../data/party";
import { startingInventory } from "../data/items";
import { clearSave, SAVE_SLOTS } from "../core/state";
import type { Difficulty } from "../core/types";
import { getClass } from "../data/classes";
import { getRace } from "../data/races";
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
  private difficulty: Difficulty = "normal";
  private permadeath = false;
  private slot = 0;

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
    const order = ROSTER.filter((h) => this.selected.has(h.id)).map((h) => h.id);
    this.ctx.state.party = createParty(order);
    this.ctx.state.inventory = startingInventory();
    this.ctx.state.phaseIndex = 0;
    this.ctx.state.difficulty = this.difficulty;
    this.ctx.state.gil = 0;
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
    const cls = getClass(hero.classId);
    const race = getRace(hero.raceId);
    const s = statsForLevel(hero.classId, 3, hero.raceId);
    const chosen = this.selected.has(hero.id);
    const card = el("div", {
      className: `unit-card selectable${chosen ? " selected" : ""}`,
      onClick: () => this.toggle(hero.id),
    });

    const head = el("div", { className: "card-head" });
    head.appendChild(iconImg(getHeroSprite(hero.id) ?? getCharacterSprite(hero.classId), 44));
    const headText = el("div");
    headText.appendChild(el("h3", { text: hero.name }));
    headText.appendChild(el("div", { className: "role", text: `${cls.name} · ${race.name}` }));
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
    return card;
  }

  private render(): void {
    clear(this.root);
    const screen = el("div", { className: "party-screen" });
    screen.appendChild(el("h1", { text: "Choose Your Party" }));
    screen.appendChild(
      el("div", {
        className: "sub",
        text: `Five kingdoms fell; these seven still carry the Ashen Banner. Pick ${PARTY_SIZE} to march.`,
      }),
    );

    const grid = el("div", { className: "party-grid" });
    for (const h of ROSTER) grid.appendChild(this.heroCard(h));
    screen.appendChild(grid);

    const footer = el("div", { className: "party-footer" });
    const ready = this.selected.size === PARTY_SIZE;
    footer.appendChild(
      el("div", {
        attrs: { style: "font-size:14px;margin-bottom:10px;opacity:0.85" },
        text: `Chosen ${this.selected.size}/${PARTY_SIZE}`,
      }),
    );

    // Difficulty selector
    footer.appendChild(el("div", { attrs: { style: "font-size:13px;font-weight:700;opacity:0.7;margin-bottom:6px" }, text: "Difficulty" }));
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
    footer.appendChild(diffRow);
    footer.appendChild(el("div", { className: "diff-desc", text: DIFFICULTY_DESCS[this.difficulty] }));

    // Classic mode (permadeath) toggle
    footer.appendChild(el("div", { attrs: { style: "font-size:13px;font-weight:700;opacity:0.7;margin-bottom:6px;margin-top:10px" }, text: "Classic mode (permadeath)" }));
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
    footer.appendChild(permaRow);
    footer.appendChild(el("div", { className: "diff-desc", text: "Fallen heroes are lost for good." }));

    // Save slot selector
    footer.appendChild(el("div", { attrs: { style: "font-size:13px;font-weight:700;opacity:0.7;margin-bottom:6px;margin-top:10px" }, text: "Save Slot" }));
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
    footer.appendChild(slotRow);

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
