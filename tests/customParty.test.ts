import { describe, it, expect } from "vitest";
import { createCustomParty, getHero } from "../src/data/party";
import { getClass } from "../src/data/classes";

describe("createCustomParty (New Game party customizer)", () => {
  it("re-classes and re-races a hero while keeping its identity", () => {
    const [u] = createCustomParty([{ id: "garan", classId: "blackMage", raceId: "elf" }]);
    expect(u.id).toBe("garan");
    expect(u.name).toBe("Garan");
    expect(u.classId).toBe("blackMage");
    expect(u.raceId).toBe("elf");
    // Learns its new class's opening skill, not the old knight's.
    expect(u.learnedSkillIds).toContain(getClass("blackMage").skillIds[0]);
  });

  it("falls back to the roster default when class/race omitted", () => {
    const base = getHero("lyra")!;
    const [u] = createCustomParty([{ id: "lyra" }]);
    expect(u.classId).toBe(base.classId);
    expect(u.raceId).toBe(base.raceId);
  });

  it("skips unknown hero ids", () => {
    const party = createCustomParty([{ id: "nobody", classId: "knight" }, { id: "vex" }]);
    expect(party).toHaveLength(1);
    expect(party[0].id).toBe("vex");
  });
});
