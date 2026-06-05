import { describe, it, expect } from "vitest";
import { PHASES } from "../src/data/maps";
import { PHASE_DIALOGUE, dialogueFor, PHASE_OUTRO, outroFor } from "../src/data/dialogue";

describe("phase dialogue", () => {
  it("has a scene for every phase map id", () => {
    for (const map of PHASES) {
      expect(PHASE_DIALOGUE[map.id], `missing dialogue for ${map.id}`).toBeDefined();
    }
  });

  PHASES.forEach((map) => {
    describe(map.id, () => {
      const lines = PHASE_DIALOGUE[map.id];

      it("has at least one line", () => {
        expect(lines.length).toBeGreaterThanOrEqual(1);
      });

      it("every line has a non-empty speaker and text", () => {
        for (const line of lines) {
          expect(line.speaker.length).toBeGreaterThan(0);
          expect(line.text.trim().length).toBeGreaterThan(0);
        }
      });
    });
  });
});

describe("dialogueFor", () => {
  it("returns the lines for a known map id", () => {
    const first = PHASES[0];
    expect(dialogueFor(first.id)).toBe(PHASE_DIALOGUE[first.id]);
    expect(dialogueFor(first.id).length).toBeGreaterThan(0);
  });

  it("returns [] for an unknown map id", () => {
    expect(dialogueFor("no-such-map")).toEqual([]);
  });
});

describe("phase outro", () => {
  it("has an outro for every phase map id", () => {
    for (const map of PHASES) {
      expect(PHASE_OUTRO[map.id], `missing outro for ${map.id}`).toBeDefined();
    }
  });

  PHASES.forEach((map) => {
    describe(map.id, () => {
      const lines = PHASE_OUTRO[map.id];

      it("has at least one line", () => {
        expect(lines.length).toBeGreaterThanOrEqual(1);
      });

      it("every line has a non-empty speaker and text", () => {
        for (const line of lines) {
          expect(line.speaker.length).toBeGreaterThan(0);
          expect(line.text.trim().length).toBeGreaterThan(0);
        }
      });
    });
  });
});

describe("outroFor", () => {
  it("returns the lines for a known map id", () => {
    const first = PHASES[0];
    expect(outroFor(first.id)).toBe(PHASE_OUTRO[first.id]);
    expect(outroFor(first.id).length).toBeGreaterThan(0);
  });

  it("returns [] for an unknown map id", () => {
    expect(outroFor("no-such-map")).toEqual([]);
  });
});
