import { describe, expect, it } from "vitest";
import { isMuted, noteToFreq, setMuted, sfx, toggleMuted } from "../src/engine/audio";

describe("audio engine", () => {
  it("keeps mute state in memory when browser storage is unavailable", () => {
    setMuted(false);
    expect(isMuted()).toBe(false);

    expect(toggleMuted()).toBe(true);
    expect(isMuted()).toBe(true);

    setMuted(false);
    expect(isMuted()).toBe(false);
  });

  it("exposes node-safe no-op SFX calls", () => {
    setMuted(false);

    expect(() => sfx.playHit()).not.toThrow();
    expect(() => sfx.playCrit()).not.toThrow();
    expect(() => sfx.playHeal()).not.toThrow();
    expect(() => sfx.playMagic()).not.toThrow();
    expect(() => sfx.playKO()).not.toThrow();
    expect(() => sfx.playSelect()).not.toThrow();
  });

  it("converts note names to frequencies", () => {
    expect(noteToFreq("A4")).toBeCloseTo(440, 5);
    expect(noteToFreq("C4")).toBeCloseTo(261.625565, 5);
    expect(noteToFreq("F#3")).toBeCloseTo(184.997211, 5);
    expect(noteToFreq("Bb5")).toBeCloseTo(932.327523, 5);
  });
});
