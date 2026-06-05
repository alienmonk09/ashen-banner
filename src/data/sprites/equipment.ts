import type { SpriteDef } from "../../engine/sprite";

// 14x14 equipment slot icons. Keyed by slot name ("armor", "accessory").
export const EQUIPMENT_SPRITES: Record<string, SpriteDef> = {
  /** A front-facing breastplate icon for the armor slot. */
  armor: {
    palette: {
      A: "#1a1a2e",
      B: "#6a7a8a",
      C: "#9ab0c0",
      D: "#c8d8e8",
      E: "#e8f0f8",
      F: "#4a5a68",
      G: "#d4a820",
    },
    rows: [
      ".....AAAA.....",
      "...ABDDDDBA...",
      "..ABDDDDDBA...",
      "..ABDDDDCBA...",
      ".ABDDDDDDDBA..",
      ".ABCDDDDCCBA..",
      ".ABCDDDDCCBA..",
      "ABDDDDDDDDDBA.",
      "ABCDDDDDDDCBA.",
      "ABCDDDDDDDCBA.",
      ".ABCDDDDCCBA..",
      "..ABCCFFCBA...",
      "...AABBBAA....",
      "....AAAAA.....",
    ],
  },
  /** A ring/amulet icon for the accessory slot. */
  accessory: {
    palette: {
      A: "#1a1a2e",
      B: "#d4a820",
      C: "#f0c840",
      D: "#fae070",
      E: "#8b5a00",
      F: "#ffffff",
      G: "#c87020",
    },
    rows: [
      "....ABBBBA....",
      "...BCDDDDCB...",
      "..BCDDDDDDCB..",
      ".BCDDDFFFFDB..",
      ".BCDDFFFFFDB..",
      "BCDDDFFFFFDB..",
      "BCDDDFFFFDB...",
      "BCDDDDDDDB....",
      ".BCDDDDDB.....",
      ".ABCDDCBA.....",
      "..ABCCBA......",
      "...ABBA.......",
      "....AEA.......",
      ".....A........",
    ],
  },
};
