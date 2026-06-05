import { describe, expect, it } from "vitest";
import {
  startMusic,
  stopMusic,
  beatsToSeconds,
  themeDuration,
  THEME_BATTLE,
  THEME_BATTLE_DRIVING,
  THEME_BATTLE_DARK,
  THEME_CAMP,
  THEME_VICTORY,
  battleThemeForPhase,
} from "../src/engine/music";

// All tests run in the node environment (no window / AudioContext available).
// Every music function must be a safe no-op and never throw.

describe("music engine — node-safe no-ops", () => {
  it("startMusic does not throw in node env (no window)", () => {
    expect(() => startMusic("battle")).not.toThrow();
    expect(() => startMusic("camp")).not.toThrow();
    expect(() => startMusic("victory")).not.toThrow();
  });

  it("stopMusic does not throw when nothing is playing", () => {
    expect(() => stopMusic()).not.toThrow();
  });

  it("stopMusic does not throw after startMusic", () => {
    startMusic("battle");
    expect(() => stopMusic()).not.toThrow();
  });

  it("calling startMusic twice in a row does not throw", () => {
    expect(() => {
      startMusic("camp");
      startMusic("battle");
    }).not.toThrow();
  });

  it("calling stopMusic multiple times does not throw", () => {
    expect(() => {
      stopMusic();
      stopMusic();
      stopMusic();
    }).not.toThrow();
  });

  it("arbitrary start/stop sequence does not throw", () => {
    expect(() => {
      startMusic("battle");
      stopMusic();
      startMusic("camp");
      startMusic("victory");
      stopMusic();
      stopMusic();
    }).not.toThrow();
  });
});

describe("beatsToSeconds — pure calculation", () => {
  it("converts 1 beat at 60 bpm to 1 second", () => {
    expect(beatsToSeconds(1, 60)).toBeCloseTo(1, 10);
  });

  it("converts 2 beats at 120 bpm to 1 second", () => {
    expect(beatsToSeconds(2, 120)).toBeCloseTo(1, 10);
  });

  it("converts 4 beats at 44 bpm to ~5.45 seconds", () => {
    expect(beatsToSeconds(4, 44)).toBeCloseTo((4 / 44) * 60, 8);
  });

  it("scales linearly with beat count", () => {
    const bpm = 80;
    expect(beatsToSeconds(2, bpm)).toBeCloseTo(beatsToSeconds(1, bpm) * 2, 10);
  });

  it("scales inversely with bpm", () => {
    const beats = 3;
    expect(beatsToSeconds(beats, 120)).toBeCloseTo(beatsToSeconds(beats, 60) / 2, 10);
  });
});

describe("themeDuration — pure calculation", () => {
  it("THEME_BATTLE total duration is positive", () => {
    expect(themeDuration(THEME_BATTLE)).toBeGreaterThan(0);
  });

  it("THEME_CAMP total duration is positive", () => {
    expect(themeDuration(THEME_CAMP)).toBeGreaterThan(0);
  });

  it("THEME_VICTORY total duration is positive", () => {
    expect(themeDuration(THEME_VICTORY)).toBeGreaterThan(0);
  });

  it("THEME_BATTLE has expected duration (8 beats @ 44 bpm ≈ 10.9 s)", () => {
    const expected = (8 / 44) * 60;
    expect(themeDuration(THEME_BATTLE)).toBeCloseTo(expected, 4);
  });

  it("THEME_CAMP has expected duration (8 beats @ 40 bpm = 12 s)", () => {
    const expected = (8 / 40) * 60;
    expect(themeDuration(THEME_CAMP)).toBeCloseTo(expected, 4);
  });

  it("THEME_VICTORY total beat count sums correctly", () => {
    // Groups: 1.5 + 1.5 + 1.5 + 2.5 = 7 beats @ 76 bpm
    const expected = (7 / 76) * 60;
    expect(themeDuration(THEME_VICTORY)).toBeCloseTo(expected, 4);
  });
});

describe("theme data integrity", () => {
  it("all themes have at least one group", () => {
    expect(THEME_BATTLE.groups.length).toBeGreaterThan(0);
    expect(THEME_CAMP.groups.length).toBeGreaterThan(0);
    expect(THEME_VICTORY.groups.length).toBeGreaterThan(0);
  });

  it("all groups in every theme have at least one note", () => {
    for (const theme of [THEME_BATTLE, THEME_CAMP, THEME_VICTORY]) {
      for (const group of theme.groups) {
        expect(group.notes.length).toBeGreaterThan(0);
      }
    }
  });

  it("all note frequencies are positive finite numbers", () => {
    for (const theme of [THEME_BATTLE, THEME_CAMP, THEME_VICTORY]) {
      for (const group of theme.groups) {
        for (const freq of group.notes) {
          expect(Number.isFinite(freq)).toBe(true);
          expect(freq).toBeGreaterThan(0);
        }
      }
    }
  });

  it("all beat durations are positive", () => {
    for (const theme of [THEME_BATTLE, THEME_CAMP, THEME_VICTORY]) {
      for (const group of theme.groups) {
        expect(group.durBeats).toBeGreaterThan(0);
      }
    }
  });

  it("battle and camp themes loop; victory does not", () => {
    expect(THEME_BATTLE.loop).toBe(true);
    expect(THEME_CAMP.loop).toBe(true);
    expect(THEME_VICTORY.loop).toBe(false);
  });

  it("theme ids match their object property", () => {
    expect(THEME_BATTLE.id).toBe("battle");
    expect(THEME_BATTLE_DRIVING.id).toBe("battle_driving");
    expect(THEME_BATTLE_DARK.id).toBe("battle_dark");
    expect(THEME_CAMP.id).toBe("camp");
    expect(THEME_VICTORY.id).toBe("victory");
  });
});

// ---------------------------------------------------------------------------
// New battle themes: structural integrity
// ---------------------------------------------------------------------------

describe("THEME_BATTLE_DRIVING — data integrity", () => {
  it("has at least one group", () => {
    expect(THEME_BATTLE_DRIVING.groups.length).toBeGreaterThan(0);
  });

  it("has a positive bpm", () => {
    expect(THEME_BATTLE_DRIVING.bpm).toBeGreaterThan(0);
  });

  it("loops", () => {
    expect(THEME_BATTLE_DRIVING.loop).toBe(true);
  });

  it("all groups have at least one note with positive finite frequency", () => {
    for (const group of THEME_BATTLE_DRIVING.groups) {
      expect(group.notes.length).toBeGreaterThan(0);
      for (const freq of group.notes) {
        expect(Number.isFinite(freq)).toBe(true);
        expect(freq).toBeGreaterThan(0);
      }
    }
  });

  it("all beat durations are positive", () => {
    for (const group of THEME_BATTLE_DRIVING.groups) {
      expect(group.durBeats).toBeGreaterThan(0);
    }
  });

  it("total duration is positive", () => {
    expect(themeDuration(THEME_BATTLE_DRIVING)).toBeGreaterThan(0);
  });
});

describe("THEME_BATTLE_DARK — data integrity", () => {
  it("has at least one group", () => {
    expect(THEME_BATTLE_DARK.groups.length).toBeGreaterThan(0);
  });

  it("has a positive bpm", () => {
    expect(THEME_BATTLE_DARK.bpm).toBeGreaterThan(0);
  });

  it("loops", () => {
    expect(THEME_BATTLE_DARK.loop).toBe(true);
  });

  it("all groups have at least one note with positive finite frequency", () => {
    for (const group of THEME_BATTLE_DARK.groups) {
      expect(group.notes.length).toBeGreaterThan(0);
      for (const freq of group.notes) {
        expect(Number.isFinite(freq)).toBe(true);
        expect(freq).toBeGreaterThan(0);
      }
    }
  });

  it("all beat durations are positive", () => {
    for (const group of THEME_BATTLE_DARK.groups) {
      expect(group.durBeats).toBeGreaterThan(0);
    }
  });

  it("total duration is positive", () => {
    expect(themeDuration(THEME_BATTLE_DARK)).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// battleThemeForPhase resolver
// ---------------------------------------------------------------------------

// All valid ThemeIds that map to themes (checked via exported THEMES via startMusic safety test)
const VALID_BATTLE_THEME_IDS = new Set(["battle", "battle_driving", "battle_dark"]);

describe("battleThemeForPhase — chapter-to-theme resolver", () => {
  it("returns a valid ThemeId for every phase index 0..6", () => {
    for (let i = 0; i <= 6; i++) {
      const id = battleThemeForPhase(i);
      expect(VALID_BATTLE_THEME_IDS.has(id)).toBe(true);
    }
  });

  it("returns a sensible default (not undefined/null) for out-of-range indices", () => {
    // Negative index → falls through to the standard "battle" default.
    const negative = battleThemeForPhase(-1);
    expect(VALID_BATTLE_THEME_IDS.has(negative)).toBe(true);
    expect(negative).toBe("battle");
    // Very large index → treated like a late chapter (battle_dark is also valid).
    const large = battleThemeForPhase(99);
    expect(VALID_BATTLE_THEME_IDS.has(large)).toBe(true);
  });

  it("phase 3 (Cinder Fields) returns battle_driving", () => {
    expect(battleThemeForPhase(3)).toBe("battle_driving");
  });

  it("phase 5 (Outer Ramparts) returns battle_dark", () => {
    expect(battleThemeForPhase(5)).toBe("battle_dark");
  });

  it("phase 6 (finale) returns battle_dark", () => {
    expect(battleThemeForPhase(6)).toBe("battle_dark");
  });

  it("early phases 0, 1, 2 return the standard battle theme", () => {
    expect(battleThemeForPhase(0)).toBe("battle");
    expect(battleThemeForPhase(1)).toBe("battle");
    expect(battleThemeForPhase(2)).toBe("battle");
  });

  it("phase 4 returns the standard battle theme", () => {
    expect(battleThemeForPhase(4)).toBe("battle");
  });

  it("startMusic does not throw for any phase's battle theme (node-safe)", () => {
    for (let i = 0; i <= 6; i++) {
      expect(() => startMusic(battleThemeForPhase(i))).not.toThrow();
    }
  });
});
