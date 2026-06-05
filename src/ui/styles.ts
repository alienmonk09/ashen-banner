const CSS = `
.ui-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  font-family: "Segoe UI", system-ui, sans-serif;
  color: #e8e8f2;
  user-select: none;
}
.ui-layer * { pointer-events: auto; }

.panel {
  position: absolute;
  background: rgba(18, 20, 32, 0.88);
  border: 1px solid rgba(120, 140, 200, 0.35);
  border-radius: 8px;
  padding: 10px 12px;
  backdrop-filter: blur(4px);
  box-shadow: 0 6px 24px rgba(0,0,0,0.5);
}

.unit-panel { left: 14px; bottom: 14px; min-width: 200px; }
.target-panel { right: 14px; bottom: 14px; min-width: 180px; }
.panel h3 { font-size: 15px; margin-bottom: 2px; }
.panel .sub { font-size: 12px; opacity: 0.7; margin-bottom: 8px; }

.bar { height: 8px; border-radius: 4px; background: rgba(0,0,0,0.5); margin: 4px 0; overflow: hidden; }
.bar > span { display: block; height: 100%; transition: width 0.2s; }
.bar.hp > span { background: linear-gradient(90deg,#4caf6a,#7fe39a); }
.bar.mp > span { background: linear-gradient(90deg,#4a78d6,#7fb0ff); }
.stat-row { font-size: 11px; opacity: 0.85; display: flex; gap: 10px; flex-wrap: wrap; margin-top: 4px; }
.statuses { font-size: 11px; color: #ffd34d; margin-top: 4px; min-height: 14px; }
.skills-line { font-size: 11px; opacity: 0.8; margin-top: 4px; line-height: 1.35; }

.action-menu {
  left: 50%; transform: translateX(-50%); bottom: 16px;
  display: flex; gap: 8px; padding: 8px;
}
.btn {
  background: rgba(40, 50, 80, 0.95);
  border: 1px solid rgba(140,160,220,0.5);
  color: #eee; font-size: 14px; font-weight: 600;
  padding: 8px 16px; border-radius: 6px; cursor: pointer;
  transition: background 0.12s, transform 0.05s;
}
.btn:hover { background: rgba(70, 90, 140, 1); }
.btn:active { transform: translateY(1px); }
.btn[disabled] { opacity: 0.4; cursor: not-allowed; }
.btn.small { padding: 6px 10px; font-size: 13px; }
.btn.end-turn { margin-left: 12px; border-color: rgba(210,170,120,0.55); }
.btn.end-turn:hover { background: rgba(150,110,70,0.9); }

/* Action menu — icon-led buttons with per-action accent + key hints. */
.action-menu { gap: 6px; padding: 7px; align-items: stretch; border-radius: 10px; }
.btn.act { display: flex; align-items: center; gap: 8px; padding: 8px 14px 8px 12px; }
.act-dot { width: 9px; height: 9px; border-radius: 50%; background: #8aa0d0; box-shadow: 0 0 6px rgba(138,160,208,0.6); flex: none; }
.btn.act:hover { transform: translateY(-1px); }
.a-move .act-dot { background: #5a96eb; box-shadow: 0 0 6px rgba(90,150,235,0.7); }
.a-attack .act-dot { background: #e85a5a; box-shadow: 0 0 6px rgba(232,90,90,0.7); }
.a-skill .act-dot { background: #b98cff; box-shadow: 0 0 6px rgba(185,140,255,0.7); }
.a-item .act-dot { background: #5fbf72; box-shadow: 0 0 6px rgba(95,191,114,0.7); }
.a-end .act-dot { background: #e0b070; box-shadow: 0 0 6px rgba(224,176,112,0.7); }
.act-label { line-height: 1; }
.key-hint {
  margin-left: 4px; font-size: 11px; font-weight: 700; line-height: 1;
  padding: 2px 5px; border-radius: 4px; background: rgba(0,0,0,0.35);
  border: 1px solid rgba(255,255,255,0.18); opacity: 0.85;
}

.submenu {
  left: 50%; transform: translateX(-50%); bottom: 70px;
  display: flex; flex-direction: column; gap: 6px; max-height: 56vh; overflow-y: auto;
  min-width: 256px; max-width: 320px;
}
.submenu .row { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.submenu .row-left { display: flex; align-items: center; gap: 8px; }
.submenu .cost { font-size: 12px; opacity: 0.8; }
.submenu-title { font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; opacity: 0.6; margin-bottom: 2px; }

/* Rich skill cards in the cast menu. */
.skill-card {
  display: flex; flex-direction: column; gap: 5px; text-align: left; width: 100%;
  background: rgba(34, 40, 64, 0.92); border: 1px solid rgba(140,160,220,0.35);
  border-radius: 8px; padding: 8px 10px; cursor: pointer; color: #e8e8f2;
  transition: background 0.12s, border-color 0.12s, transform 0.05s;
}
.skill-card:hover { background: rgba(54, 64, 100, 1); border-color: rgba(170,190,240,0.7); transform: translateY(-1px); }
.skill-card:active { transform: translateY(0); }
.skill-card.disabled { opacity: 0.5; cursor: not-allowed; }
.skill-card.disabled:hover { transform: none; background: rgba(34,40,64,0.92); border-color: rgba(140,160,220,0.35); }
.sk-head { display: flex; align-items: center; gap: 8px; }
.sk-head .icon { background: rgba(0,0,0,0.25); border-radius: 5px; padding: 1px; }
.sk-name { font-size: 14px; font-weight: 700; }
.sk-mp { margin-left: auto; font-size: 12px; font-weight: 700; color: #7fb0ff; }
.sk-mp.short { color: #ff7a7a; }
.sk-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.sk-desc { font-size: 11px; opacity: 0.72; line-height: 1.35; }
.tag { font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 999px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); }
.tag.t-dmg { color: #ff9a9a; border-color: rgba(232,90,90,0.5); }
.tag.t-heal { color: #8fe39a; border-color: rgba(95,191,114,0.5); }
.tag.t-buff { color: #9cd0ff; border-color: rgba(90,150,235,0.5); }
.tag.t-debuff { color: #ffba8a; border-color: rgba(224,140,90,0.5); }
.tag.t-meta { opacity: 0.85; }
.tag.t-elem { text-transform: capitalize; }
.tag.t-fire { color: #ff8a5a; border-color: rgba(255,110,60,0.55); }
.tag.t-ice { color: #8fd6ff; border-color: rgba(120,200,255,0.55); }
.tag.t-bolt { color: #ffe066; border-color: rgba(255,210,70,0.55); }
.tag.t-holy { color: #fff0b0; border-color: rgba(255,230,150,0.55); }
.tag.t-nature { color: #9fe07a; border-color: rgba(120,200,90,0.55); }

/* Status chips in the info panels. */
.statuses { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; min-height: 14px; }
.st-chip { font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 999px; cursor: help; }
.st-chip.st-buff { color: #9cd0ff; background: rgba(90,150,235,0.18); border: 1px solid rgba(90,150,235,0.5); }
.st-chip.st-debuff { color: #ffba8a; background: rgba(224,140,90,0.18); border: 1px solid rgba(224,140,90,0.5); }

.icon { image-rendering: pixelated; image-rendering: crisp-edges; vertical-align: middle; flex: none; }
.weapon-line { display: flex; align-items: center; gap: 6px; }

.turn-bar {
  left: 50%; transform: translateX(-50%); top: 12px;
  display: flex; gap: 6px; align-items: center; padding: 6px 10px;
}
.turn-bar .label { font-size: 11px; opacity: 0.7; margin-right: 4px; }
.turn-chip {
  width: 30px; height: 30px; border-radius: 6px; display: flex; overflow: hidden;
  align-items: center; justify-content: center; font-weight: 700; font-size: 13px;
  border: 2px solid transparent; color: #10121c;
}
.turn-chip.first { border-color: #ffd34d; box-shadow: 0 0 8px rgba(255,211,77,0.7); }
.turn-chip.enemy { outline: 2px solid #ff5a5a; outline-offset: -2px; }
.chip-portrait { width: 100%; height: 100%; object-fit: contain; image-rendering: pixelated; image-rendering: crisp-edges; }

.objective {
  left: 50%; transform: translateX(-50%); top: 58px;
  font-size: 12px; font-weight: 600; letter-spacing: 0.02em; padding: 5px 12px;
  color: #ffe0a0; border-color: rgba(210,170,120,0.45);
}

.toast {
  left: 50%; transform: translateX(-50%); top: 92px;
  font-size: 14px; padding: 6px 14px; opacity: 0; transition: opacity 0.2s;
  background: rgba(10,12,20,0.9);
}
.toast.show { opacity: 1; }

.banner {
  inset: 0; display: flex; align-items: center; justify-content: center;
  background: rgba(6, 8, 16, 0.7);
}
.banner-card {
  background: rgba(20, 24, 40, 0.97);
  border: 1px solid rgba(140,160,220,0.5);
  border-radius: 14px; padding: 28px 36px; text-align: center; max-width: 520px;
  box-shadow: 0 12px 48px rgba(0,0,0,0.6);
}
.banner-card h1 { font-size: 28px; margin-bottom: 10px; }
.banner-card p { font-size: 15px; opacity: 0.88; line-height: 1.5; margin-bottom: 18px; white-space: pre-line; }
.banner-card .btn { font-size: 16px; padding: 10px 24px; }

.phase-select { margin-top: 18px; padding-top: 14px; border-top: 1px solid rgba(120,140,200,0.25); }
.phase-select .label { display: block; font-size: 12px; opacity: 0.6; margin-bottom: 8px; }
.phase-row { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
.phase-row .btn { min-width: 40px; }

.hint { position: absolute; left: 50%; transform: translateX(-50%); bottom: 78px;
  font-size: 12px; opacity: 0.65; }

.rotate-ctl { right: 14px; top: 12px; display: flex; gap: 6px; align-items: center; padding: 6px 8px; }
.rotate-ctl .rbtn { width: 32px; height: 32px; padding: 0; font-size: 17px; line-height: 1; display: flex; align-items: center; justify-content: center; }
.rotate-ctl .rlabel { font-size: 12px; opacity: 0.75; min-width: 40px; text-align: center; font-variant-numeric: tabular-nums; }

/* Party / intermission screen */
.party-screen { inset: 0; background: rgba(8,10,18,0.96); overflow-y: auto; padding: 24px; }
.party-screen h1 { text-align: center; font-size: 24px; margin-bottom: 6px; }
.party-screen .sub { text-align: center; opacity: 0.7; margin-bottom: 20px; }
.section-title { text-align: center; font-size: 18px; font-weight: 700; margin: 26px 0 4px; color: #9fe0a8; }
.party-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; max-width: 1100px; margin: 0 auto; }
.unit-card { background: rgba(22,26,42,0.95); border: 1px solid rgba(120,140,200,0.3); border-radius: 10px; padding: 14px; }
.unit-card.selectable { cursor: pointer; transition: border-color 0.12s, box-shadow 0.12s, transform 0.05s; }
.unit-card.selectable:hover { border-color: rgba(160,180,230,0.7); transform: translateY(-1px); }
.unit-card.selected { border-color: #ffd34d; box-shadow: 0 0 0 1px #ffd34d, 0 6px 20px rgba(0,0,0,0.5); }
.pick-badge { margin-left: auto; width: 24px; height: 24px; border-radius: 50%; background: #ffd34d; color: #1a1a2e; font-weight: 800; display: flex; align-items: center; justify-content: center; }
.unit-card h3 { font-size: 17px; margin-bottom: 2px; }
.unit-card .role { font-size: 12px; opacity: 0.7; margin-bottom: 8px; }
.card-head { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
.card-head .icon { background: rgba(0,0,0,0.25); border-radius: 6px; padding: 2px; }
.wlabel { display: flex; align-items: center; gap: 6px; }
.skill-icons { display: flex; gap: 4px; margin-top: 4px; }
.unit-card label { font-size: 12px; opacity: 0.8; display: block; margin: 8px 0 3px; }
.unit-card select { width: 100%; background: #1a1e30; color: #eee; border: 1px solid #455; border-radius: 5px; padding: 5px; }
.unit-card .skills { font-size: 12px; opacity: 0.85; margin-top: 6px; }
.unit-card .jpline { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }
.party-footer { text-align: center; margin: 24px 0 8px; }
.inv-line { text-align:center; font-size: 13px; opacity: 0.85; margin-top: 10px; }
.crit { color: #ffd34d; }
`;

let injected = false;
export function injectStyles(): void {
  if (injected) return;
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
  injected = true;
}
