import { createStartingParty } from "../data/party";
import { startingInventory } from "../data/items";
import { clearSave, listSaves, loadGame, saveGame, startNgPlus, SAVE_SLOTS, type GameState } from "../core/state";
import { PHASES } from "../data/maps";
import { el } from "../ui/dom";
import type { GameContext, Scene } from "./sceneManager";
import { isMuted, setMuted, getVolume, setVolume } from "../engine/audio";
import { isMusicMuted, setMusicMuted } from "../engine/music";
import {
  getTextScale,
  setTextScale,
  isHighContrast,
  setHighContrast,
  prefersReducedMotion,
  setReducedMotion,
  type TextScale,
} from "../engine/accessibility";
import {
  ACTIONS,
  ACTION_LABELS,
  getBinding,
  setBinding,
  resetBindings,
  formatKey,
  type Action,
} from "../engine/keybindings";

function resetState(state: GameState): void {
  state.party = createStartingParty();
  state.inventory = startingInventory();
  state.phaseIndex = 0;
  state.difficulty = "normal";
  state.gold = 0;
  state.ownedEquipment = [];
  state.ownedWeapons = [];
  state.slot = 0;
  state.ngPlus = 0;
  state.permadeath = false;
}

function applyLoaded(state: GameState, loaded: GameState): void {
  state.party = loaded.party;
  state.inventory = loaded.inventory;
  state.phaseIndex = loaded.phaseIndex;
  state.difficulty = loaded.difficulty;
  state.gold = loaded.gold;
  state.ownedEquipment = loaded.ownedEquipment;
  state.ownedWeapons = loaded.ownedWeapons;
  state.slot = loaded.slot;
  state.ngPlus = loaded.ngPlus;
  state.permadeath = loaded.permadeath;
}

/** A simple full-screen menu built from a banner card. */
class BannerScene implements Scene {
  protected root: HTMLDivElement;

  constructor(protected ctx: GameContext) {
    this.ctx.renderer.clear();
    this.root = el("div", { className: "ui-layer" });
    ctx.uiParent.appendChild(this.root);
  }

  protected showCard(
    title: string,
    body: string,
    buttons: Array<{ label: string; onClick: () => void }>,
    extra?: HTMLElement,
  ): void {
    const banner = el("div", { className: "banner" });
    const card = el("div", { className: "banner-card" });
    card.appendChild(el("h1", { text: title }));
    card.appendChild(el("p", { text: body }));
    const row = el("div", { attrs: { style: "display:flex;gap:10px;justify-content:center;flex-wrap:wrap" } });
    for (const b of buttons) row.appendChild(el("button", { className: "btn", text: b.label, onClick: b.onClick }));
    card.appendChild(row);
    if (extra) card.appendChild(extra);
    banner.appendChild(card);
    this.root.appendChild(banner);
  }

  update(_dt: number): void {}

  dispose(): void {
    this.root.remove();
  }
}

/**
 * Build the settings panel as a banner-card DOM element.
 * `onBack` is called when the user presses "Back".
 */
function buildSettingsPanel(onBack: () => void): HTMLElement {
  const banner = el("div", { className: "banner" });
  const card = el("div", { className: "banner-card", attrs: { role: "dialog", "aria-label": "Settings" } });
  card.appendChild(el("h1", { text: "Settings", attrs: { id: "settings-title" } }));

  const settingsBody = el("div", { className: "settings-body", attrs: { role: "group", "aria-labelledby": "settings-title" } });

  // --- Sound (master mute) toggle ---
  const soundRow = el("div", { className: "settings-row" });
  soundRow.appendChild(el("span", { className: "settings-label", text: "Sound" }));
  const soundToggle = el("button", {
    className: `btn small settings-toggle${isMuted() ? " settings-toggle-off" : ""}`,
    text: isMuted() ? "Off" : "On",
    attrs: { role: "switch", "aria-label": "Sound", "aria-checked": isMuted() ? "false" : "true" },
    onClick: () => {
      const nowMuted = !isMuted();
      setMuted(nowMuted);
      soundToggle.textContent = nowMuted ? "Off" : "On";
      soundToggle.setAttribute("aria-checked", nowMuted ? "false" : "true");
      soundToggle.className = `btn small settings-toggle${nowMuted ? " settings-toggle-off" : ""}`;
    },
  });
  soundRow.appendChild(soundToggle);
  settingsBody.appendChild(soundRow);

  // --- Music toggle ---
  const musicRow = el("div", { className: "settings-row" });
  musicRow.appendChild(el("span", { className: "settings-label", text: "Music" }));
  const musicToggle = el("button", {
    className: `btn small settings-toggle${isMusicMuted() ? " settings-toggle-off" : ""}`,
    text: isMusicMuted() ? "Off" : "On",
    attrs: { role: "switch", "aria-label": "Music", "aria-checked": isMusicMuted() ? "false" : "true" },
    onClick: () => {
      const nowMuted = !isMusicMuted();
      setMusicMuted(nowMuted);
      musicToggle.textContent = nowMuted ? "Off" : "On";
      musicToggle.setAttribute("aria-checked", nowMuted ? "false" : "true");
      musicToggle.className = `btn small settings-toggle${nowMuted ? " settings-toggle-off" : ""}`;
    },
  });
  musicRow.appendChild(musicToggle);
  settingsBody.appendChild(musicRow);

  // --- Volume slider ---
  const volumeRow = el("div", { className: "settings-row" });
  volumeRow.appendChild(el("span", { className: "settings-label", text: "Volume" }));
  const sliderWrap = el("div", { className: "settings-slider-wrap" });
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "100";
  slider.value = String(Math.round(getVolume() * 100));
  slider.className = "settings-slider";
  slider.setAttribute("aria-label", "Volume");
  slider.setAttribute("aria-valuetext", `${slider.value} percent`);
  slider.addEventListener("input", () => {
    setVolume(Number(slider.value) / 100);
    volLabel.textContent = slider.value;
    slider.setAttribute("aria-valuetext", `${slider.value} percent`);
  });
  const volLabel = el("span", {
    className: "settings-vol-label",
    text: String(Math.round(getVolume() * 100)),
  });
  sliderWrap.appendChild(slider);
  sliderWrap.appendChild(volLabel);
  volumeRow.appendChild(sliderWrap);
  settingsBody.appendChild(volumeRow);

  // --- Text size selector ---
  const textSizeRow = el("div", { className: "settings-row" });
  textSizeRow.appendChild(el("span", { className: "settings-label", text: "Text size" }));
  const scales: Array<{ value: TextScale; label: string }> = [
    { value: "normal", label: "Normal" },
    { value: "large", label: "Large" },
    { value: "larger", label: "Larger" },
  ];
  const scaleGroup = el("div", { className: "settings-scale-group", attrs: { role: "radiogroup", "aria-label": "Text size" } });
  const scaleButtons: HTMLButtonElement[] = [];
  for (const s of scales) {
    const btn = el("button", {
      className: `btn small${getTextScale() === s.value ? " settings-toggle" : ""}`,
      text: s.label,
      attrs: { role: "radio", "aria-label": s.label, "aria-checked": getTextScale() === s.value ? "true" : "false" },
      onClick: () => {
        setTextScale(s.value);
        for (const b of scaleButtons) {
          const active = b.textContent === s.label;
          b.className = `btn small${active ? " settings-toggle" : ""}`;
          b.setAttribute("aria-checked", active ? "true" : "false");
        }
      },
    });
    scaleButtons.push(btn as HTMLButtonElement);
    scaleGroup.appendChild(btn);
  }
  textSizeRow.appendChild(scaleGroup);
  settingsBody.appendChild(textSizeRow);

  // --- High contrast toggle ---
  const hcRow = el("div", { className: "settings-row" });
  hcRow.appendChild(el("span", { className: "settings-label", text: "High contrast" }));
  const hcToggle = el("button", {
    className: `btn small settings-toggle${isHighContrast() ? "" : " settings-toggle-off"}`,
    text: isHighContrast() ? "On" : "Off",
    attrs: { role: "switch", "aria-label": "High contrast", "aria-checked": isHighContrast() ? "true" : "false" },
    onClick: () => {
      const nowOn = !isHighContrast();
      setHighContrast(nowOn);
      hcToggle.textContent = nowOn ? "On" : "Off";
      hcToggle.setAttribute("aria-checked", nowOn ? "true" : "false");
      hcToggle.className = `btn small settings-toggle${nowOn ? "" : " settings-toggle-off"}`;
    },
  });
  hcRow.appendChild(hcToggle);
  settingsBody.appendChild(hcRow);

  // --- Reduced motion toggle ---
  const rmRow = el("div", { className: "settings-row" });
  rmRow.appendChild(el("span", { className: "settings-label", text: "Reduced motion" }));
  const rmToggle = el("button", {
    className: `btn small settings-toggle${prefersReducedMotion() ? "" : " settings-toggle-off"}`,
    text: prefersReducedMotion() ? "On" : "Off",
    attrs: { role: "switch", "aria-label": "Reduced motion", "aria-checked": prefersReducedMotion() ? "true" : "false" },
    onClick: () => {
      const nowOn = !prefersReducedMotion();
      setReducedMotion(nowOn);
      rmToggle.textContent = nowOn ? "On" : "Off";
      rmToggle.setAttribute("aria-checked", nowOn ? "true" : "false");
      rmToggle.className = `btn small settings-toggle${nowOn ? "" : " settings-toggle-off"}`;
    },
  });
  rmRow.appendChild(rmToggle);
  settingsBody.appendChild(rmRow);

  card.appendChild(settingsBody);

  // --- Controls section ---
  const controlsSection = el("div", { className: "settings-controls-section" });
  controlsSection.appendChild(el("div", { className: "settings-section-title", text: "Controls" }));

  /** Rebuild the controls section after a binding change. */
  const rebuildControls = (): void => {
    controlsSection.innerHTML = "";
    controlsSection.appendChild(el("div", { className: "settings-section-title", text: "Controls" }));

    let pendingAction: Action | null = null;
    let pendingBtn: HTMLButtonElement | null = null;
    let keydownHandler: ((e: KeyboardEvent) => void) | null = null;

    const cancelCapture = (): void => {
      if (!pendingAction || !pendingBtn) return;
      keydownHandler && window.removeEventListener("keydown", keydownHandler, true);
      pendingBtn.textContent = formatKey(getBinding(pendingAction));
      pendingBtn.className = "btn small settings-rebind-btn";
      pendingAction = null;
      pendingBtn = null;
      keydownHandler = null;
    };

    for (const action of ACTIONS) {
      const row = el("div", { className: "settings-row" });
      row.appendChild(el("span", { className: "settings-label", text: ACTION_LABELS[action] }));

      const rebindBtn = el("button", {
        className: "btn small settings-rebind-btn",
        text: formatKey(getBinding(action)),
        attrs: { "aria-label": `${ACTION_LABELS[action]} key: ${formatKey(getBinding(action))}` },
        onClick: () => {
          if (pendingAction === action) {
            // Second click cancels capture.
            cancelCapture();
            return;
          }
          cancelCapture();
          pendingAction = action;
          pendingBtn = rebindBtn as HTMLButtonElement;
          rebindBtn.textContent = "…press a key";
          rebindBtn.className = "btn small settings-rebind-btn settings-rebind-listening";

          keydownHandler = (e: KeyboardEvent): void => {
            e.preventDefault();
            e.stopPropagation();
            // Escape is the universal abort: cancel the rebind without binding it.
            if (e.key === "Escape") {
              cancelCapture();
              return;
            }
            window.removeEventListener("keydown", keydownHandler!, true);
            keydownHandler = null;
            const captured = e.key;
            setBinding(action, captured);
            pendingAction = null;
            pendingBtn = null;
            rebuildControls();
          };
          window.addEventListener("keydown", keydownHandler, true);
        },
      });
      row.appendChild(rebindBtn);
      controlsSection.appendChild(row);
    }

    const resetRow = el("div", { attrs: { style: "display:flex;justify-content:flex-end;margin-top:4px" } });
    resetRow.appendChild(el("button", {
      className: "btn small",
      text: "Reset to defaults",
      onClick: () => {
        resetBindings();
        rebuildControls();
      },
    }));
    controlsSection.appendChild(resetRow);
  };

  rebuildControls();
  card.appendChild(controlsSection);

  // --- Back button ---
  const backRow = el("div", { attrs: { style: "display:flex;gap:10px;justify-content:center;margin-top:18px" } });
  backRow.appendChild(el("button", { className: "btn", text: "Back", onClick: onBack }));
  card.appendChild(backRow);

  banner.appendChild(card);
  return banner;
}

export class TitleScene extends BannerScene {
  constructor(ctx: GameContext) {
    super(ctx);

    const isDev = (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;

    /** Fresh party, then jump straight into the chosen phase's battle. */
    const startAtPhase = (index: number) => {
      resetState(this.ctx.state);
      clearSave();
      this.ctx.state.phaseIndex = index;
      this.ctx.nav.toBattle(index);
    };

    /** Load a save slot and continue the campaign from the camp. */
    const continueSlot = (slot: number) => {
      const save = loadGame(slot);
      if (save) {
        applyLoaded(this.ctx.state, save);
        this.ctx.nav.toParty();
      }
    };

    const rebuildTitle = () => {
      this.root.innerHTML = "";

      const banner = el("div", { className: "banner" });
      const card = el("div", { className: "banner-card" });

      // --- Brand mark ---
      const mark = el("div", { className: "title-mark" });
      mark.appendChild(el("h1", { text: "Ashen Banner" }));
      const rule = el("div", { className: "title-rule" });
      rule.appendChild(el("span", { className: "diamond" }));
      mark.appendChild(rule);
      card.appendChild(mark);

      card.appendChild(
        el("div", {
          className: "title-tagline",
          text: "The kingdom burned. A scorched banner, and those who still carry it.",
        }),
      );
      card.appendChild(
        el("p", {
          text: "An isometric, turn-based tactics campaign. Muster a company of heroes and lead them through seven battles of rising peril — move, strike, cast, and grow as the realm closes in.",
        }),
      );

      // --- Primary actions, with hierarchy ---
      const saves = listSaves();
      const firstSaved = saves.findIndex((s) => !!s);
      const hasSave = firstSaved >= 0;

      const actions = el("div", { className: "title-actions" });
      if (hasSave) {
        actions.appendChild(
          el("button", {
            className: "btn btn-primary",
            text: "Continue",
            onClick: () => continueSlot(firstSaved),
          }),
        );
        actions.appendChild(
          el("button", { className: "btn btn-ghost", text: "New Game", onClick: () => this.ctx.nav.toPartySelect() }),
        );
      } else {
        actions.appendChild(
          el("button", { className: "btn btn-primary", text: "New Game", onClick: () => this.ctx.nav.toPartySelect() }),
        );
      }
      actions.appendChild(el("button", { className: "btn btn-ghost", text: "Settings", onClick: openSettings }));
      card.appendChild(actions);

      // --- Save slots (only meaningful when at least one exists) ---
      if (hasSave) {
        const slotsEl = el("div", { className: "save-slots" });
        slotsEl.appendChild(el("div", { className: "save-slots-label", text: "Saved Campaigns" }));
        for (let i = 0; i < SAVE_SLOTS; i++) {
          const summary = saves[i];
          const row = el("div", { className: "save-slot-row" });
          if (summary) {
            row.appendChild(
              el("button", {
                className: "btn small",
                text: `Slot ${i + 1} — Phase ${summary.phaseIndex + 1} · ${summary.partySize} heroes`,
                onClick: () => continueSlot(i),
              }),
            );
          } else {
            row.appendChild(el("div", { className: "save-slot-empty", text: `Slot ${i + 1} — empty` }));
          }
          slotsEl.appendChild(row);
        }
        card.appendChild(slotsEl);
      }

      // --- Dev-only: jump straight into any phase with a fresh party. ---
      if (isDev) {
        const selector = el("div", { className: "phase-select" });
        selector.appendChild(el("span", { className: "label", text: "Jump to phase (dev):" }));
        const row = el("div", { className: "phase-row" });
        PHASES.forEach((p, i) => {
          row.appendChild(
            el("button", {
              className: "btn small",
              text: `${i + 1}`,
              attrs: { title: `Phase ${i + 1}: ${p.name}` },
              onClick: () => startAtPhase(i),
            }),
          );
        });
        selector.appendChild(row);
        card.appendChild(selector);
      }

      banner.appendChild(card);
      this.root.appendChild(banner);
    };

    const openSettings = () => {
      this.root.innerHTML = "";
      const settingsEl = buildSettingsPanel(() => rebuildTitle());
      this.root.appendChild(settingsEl);
    };

    rebuildTitle();
  }
}

export class VictoryScene extends BannerScene {
  constructor(ctx: GameContext) {
    super(ctx);
    clearSave(ctx.state.slot);
    const survivors = ctx.state.party.filter((u) => u.alive).length;
    const maxLevel = Math.max(...ctx.state.party.map((u) => u.level));
    const currentCycle = ctx.state.ngPlus;
    const nextCycle = currentCycle + 1;
    const ngPlusLabel = currentCycle > 0 ? `New Game+ (cycle ${nextCycle})` : "New Game+";
    this.showCard(
      "Campaign Complete",
      `The tyrant is undone and the realm breathes free. Your party reached level ${maxLevel}, with ${survivors} heroes standing at the end. New Game+ is available — keep your leveled party and face enemies ${nextCycle * 3} levels tougher. Thank you for playing.`,
      [
        {
          label: ngPlusLabel,
          onClick: () => {
            startNgPlus(this.ctx.state);
            saveGame(this.ctx.state);
            this.ctx.nav.toParty();
          },
        },
        {
          label: "Play Again",
          onClick: () => {
            resetState(this.ctx.state);
            this.ctx.nav.toTitle();
          },
        },
      ],
    );
  }
}
