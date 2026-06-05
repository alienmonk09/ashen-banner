export interface DialogueLine {
  /** Who speaks. A party hero or villain by name, or "—" for the narrator. */
  speaker: string;
  text: string;
}

/**
 * A short story scene played before each battle (2–4 lines), keyed by MAP ID.
 * Lines adapt the STORY.md beats to that chapter's locale (see each map's
 * `intro`). Speakers are party heroes (Garan, Lyra, Vex, Mira, Bron), the tyrant
 * Maldrath, his court, or the narrator ("—"). Keep them terse and in-tone.
 */
export const PHASE_DIALOGUE: Record<string, DialogueLine[]> = {
  // Chapter I — Tutorial Skirmish (a grassy field, a brigand camp).
  phase1: [
    { speaker: "—", text: "The border of Calenmark. Thirty years since the banner last flew here." },
    { speaker: "Garan", text: "Brigands on the rise. Maldrath's, by the look of them." },
    { speaker: "Lyra", text: "First field of the war. Plant the banner and let them remember it." },
    { speaker: "Garan", text: "We are five. We were always going to be enough." },
  ],

  // Chapter II — Ambush in the Hills (high ground, a hill sorcerer on the ridge).
  phase2: [
    { speaker: "Lyra", text: "I know these hills. They hold the ridge, and there's a mage weaving flame behind it." },
    { speaker: "Vex", text: "Then we take the height from him before he burns us off it." },
    { speaker: "Bron", text: "Uphill into a sorcerer. My favorite kind of morning." },
  ],

  // Chapter III — The Bridge (a river chasm, one narrow stone span).
  phase3: [
    { speaker: "—", text: "A river cleaves the valley. One stone bridge, and the enemy holds the far bank." },
    { speaker: "Garan", text: "A choke. They come one at a time, or not at all." },
    { speaker: "Mira", text: "Hold the span. I'll keep the line standing on it." },
  ],

  // Chapter IV — The Cinder Fields (burned farmland, a roving company that flanks).
  cinderFields: [
    { speaker: "—", text: "Past the bridge, the land opens into black stubble — farmland the fires ate." },
    { speaker: "Vex", text: "This was wheat once. They burned the country to keep it." },
    { speaker: "Garan", text: "No chokepoint here. They mean to surround us — hold the rally point and don't break." },
    { speaker: "Lyra", text: "Watch your facing. Reinforcements are coming if we last." },
  ],

  // Chapter V — Sorcerer's Court (tiered terraces, a stack of mages and a healer).
  phase4: [
    { speaker: "—", text: "The inner court — the cabal that props the regime up, raised on its terraces." },
    { speaker: "Mira", text: "Pyromancer, stormcaller, and that abbess mending them faster than we can drop them." },
    { speaker: "Vex", text: "Then we break the healer first, or we lose the day to attrition." },
    { speaker: "Garan", text: "Spread out. Weather it. Break the court and the throne has nothing left to hide behind." },
  ],

  // Chapter VI — The Outer Ramparts (the keep's wall, archers on the high stone, one gate).
  outerRamparts: [
    { speaker: "—", text: "The keep's outer wall rears out of the ash — merlons manned, one gate at its center." },
    { speaker: "Lyra", text: "They've got the high stone and every angle on the courtyard." },
    { speaker: "Bron", text: "So we don't stand in the open. Force the gate, take the wall." },
    { speaker: "Garan", text: "Seize the gatehouse and the garrison's hold breaks. Then it's only Maldrath." },
  ],

  // Chapter VII — The Tyrant's Stand (the shattered throne, two chasms, the killing floor).
  phase5: [
    { speaker: "—", text: "The shattered keep. Two chasms, one narrow approach, and the throne at the end of it." },
    { speaker: "Maldrath", text: "The ash banner. Thirty years, and a handful still carries that rag to my floor." },
    { speaker: "Garan", text: "It never burned through, Maldrath. Neither did we." },
    { speaker: "Maldrath", text: "Then plant it here. I'll bury it with you." },
  ],
};

/** Lines for a map's pre-battle scene, or `[]` if the map has none. */
export function dialogueFor(mapId: string): DialogueLine[] {
  return PHASE_DIALOGUE[mapId] ?? [];
}

/**
 * A short story beat played after a player victory (1–3 lines), keyed by MAP ID.
 * Reflects on the battle just won — the banner planted, the cost, the road still
 * ahead — in STORY.md's grim/terse/underdog tone.
 */
export const PHASE_OUTRO: Record<string, DialogueLine[]> = {
  // Chapter I — Tutorial Skirmish: first blood, banner raised on the border.
  phase1: [
    { speaker: "Garan", text: "Banner's up. First field of the war. They'll remember it." },
    { speaker: "Lyra", text: "Thirty years' worth of nothing, and now they know we're here." },
    { speaker: "—", text: "The Ashen Banner flies over Calenmark for the first time in a generation." },
  ],

  // Chapter II — Ambush in the Hills: height taken, the ridge mage dead.
  phase2: [
    { speaker: "Bron", text: "Uphill into a sorcerer. We survived it." },
    { speaker: "Vex", text: "The hill sorcerer studied fire for years. It took him seconds to lose it." },
    { speaker: "Lyra", text: "Keep moving. The hills are ours now." },
  ],

  // Chapter III — The Bridge: the span forced, the far bank crossed.
  phase3: [
    { speaker: "—", text: "The bridge holds. The far bank falls silent." },
    { speaker: "Mira", text: "We crossed. That's more than they expected of us." },
    { speaker: "Garan", text: "Past the river now. No going back." },
  ],

  // Chapter IV — The Cinder Fields: a roving company surrounded and broken.
  cinderFields: [
    { speaker: "—", text: "The cinder fields are quiet again — or as quiet as ash ever is." },
    { speaker: "Vex", text: "They tried to envelop us on open ground. Should have known better." },
    { speaker: "Garan", text: "Hold the line. The inner court is next." },
  ],

  // Chapter V — Sorcerer's Court: the cabal broken, the regime's spine cut.
  phase4: [
    { speaker: "—", text: "The court that propped up a tyrant's throne — dust and embers now." },
    { speaker: "Mira", text: "Mirelle was a healer once. I wonder when she stopped." },
    { speaker: "Vex", text: "The throne has nothing left to hide behind. We move at dawn." },
  ],

  // Chapter VI — The Outer Ramparts: the gate seized, the garrison routed.
  outerRamparts: [
    { speaker: "—", text: "The gatehouse falls. The keep's last wall is breached." },
    { speaker: "Bron", text: "Took some hits getting over that stone. Worth it." },
    { speaker: "Garan", text: "One door left. And Maldrath knows we're coming." },
  ],

  // Chapter VII — The Tyrant's Stand: Maldrath dead, the war over, the banner standing.
  phase5: [
    { speaker: "—", text: "Maldrath the Unbowed, Lord-Marshal of a burned kingdom — fallen at last." },
    { speaker: "Garan", text: "Thirty years, and it ends here. The banner holds." },
    { speaker: "—", text: "Five survivors crossed a broken country and refused to kneel. Calenmark remembers." },
  ],
};

/** Lines for a map's post-victory scene, or `[]` if the map has none. */
export function outroFor(mapId: string): DialogueLine[] {
  return PHASE_OUTRO[mapId] ?? [];
}
