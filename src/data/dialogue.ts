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

  // The long march — Frostspire Pass (rout; iced ridges, archers, a frozen stream).
  frostspirePass: [
    { speaker: "Lyra", text: "Two ridges, archers on both crowns, a frozen stream between. Cross fast or freeze under their arrows." },
    { speaker: "Bron", text: "Mind the black water. Ice'll hold a man; those deep pools won't." },
    { speaker: "Garan", text: "Force the crossing, clear the crowns. Nobody lingers in the open." },
  ],

  // The long march — The Sunken Causeway (seize the shrine; one road through black mire).
  sunkenCauseway: [
    { speaker: "Garan", text: "One stone road through a black bog. Step off it and the mire takes you." },
    { speaker: "Mira", text: "Their wardens hold the high stones and the shrine plateau beyond." },
    { speaker: "Vex", text: "Then we push the causeway and seize the shrine before the bog swallows us." },
  ],

  // The long march — Emberfall Quarry (defend the upper landing; terraced pit, lava seams).
  emberfallQuarry: [
    { speaker: "Vex", text: "Stepped quarry, lava bleeding through the lower benches. They mean to throw us back into the fire." },
    { speaker: "Bron", text: "So we climb, take the crown of the dig, and don't give it back." },
    { speaker: "Garan", text: "Hold the upper landing. Seven turns. Let them spend themselves on the ramps." },
  ],

  // The long march — The Howling Steppe (survive; flat open ground, a horde from the north).
  howlingSteppe: [
    { speaker: "Lyra", text: "Flat ground to every horizon. A horde rolling in from the north, and nowhere to hide." },
    { speaker: "Bron", text: "Then we make our own cover. Backs to the tors, hold the rises." },
    { speaker: "Garan", text: "Weather it. Eight turns, and the storm breaks itself on us." },
  ],

  // The long march — Gravewatch Hollow (defeat Mortilex; a sunken graveyard, the dead rising).
  gravewatchHollow: [
    { speaker: "Mira", text: "A graveyard gone to mire — and that thing on the plateau, Mortilex, pulling the dead back out of it." },
    { speaker: "Mortilex the Gravewatcher", text: "More flesh for the pile. Walk in, little banner. I have room." },
    { speaker: "Garan", text: "Cut up the ramps. Put the necromancer back in the ground and the dead stay down." },
  ],

  // The long march — The Verdant Ruins (rout; a jungle temple, a sacred spring).
  verdantRuins: [
    { speaker: "Vex", text: "A whole temple swallowed by jungle. Maldrath's people hold the high terraces." },
    { speaker: "Lyra", text: "There's a clean spring at its heart. Take it and we fight from strength." },
    { speaker: "Garan", text: "Climb the steps, hold the spring, rout every last one out of the canopy." },
  ],

  // The long march — Ironhold Gate (seize the gate-control; twin towers, one gate-lane).
  ironholdGate: [
    { speaker: "Lyra", text: "Twin towers, a wall-walk full of archers, a battle-mage on the merlons. One gate-lane in." },
    { speaker: "Bron", text: "A chokepoint. They funnel us — we funnel back." },
    { speaker: "Garan", text: "Storm the lane, seize the gate-control before the garrison grinds us flat." },
  ],

  // The long march — Saltflat Mirage (rout; a white salt pan, fast skirmishers, heat-ghosts).
  saltflatMirage: [
    { speaker: "Vex", text: "Raiders, fast ones, scattering across the flats. The heat-ghosts make every count a lie." },
    { speaker: "Lyra", text: "Run them down before they melt into the glare and circle behind us." },
    { speaker: "Garan", text: "No line to hold out here. Hunt them. Don't let one slip the net." },
  ],

  // The long march — The Drowned Vault (defend the dais; a flooded vault, plank walkways).
  drownedVault: [
    { speaker: "Mira", text: "Flooded vault, chambers cut to islands. Reavers wading in for the core." },
    { speaker: "Bron", text: "Slick planks between us and them. Good — they come single-file." },
    { speaker: "Garan", text: "Hold the dais. Seven turns till the floodgates seal. Let no one set foot on it." },
  ],

  // The long march — Maldrath's Approach (defeat the Herald; basalt road, lava causeways).
  maldrathsApproach: [
    { speaker: "Garan", text: "The last ridge before the keep. Lava under every causeway, and the Herald waiting on the altar." },
    { speaker: "Maldrath's Herald", text: "You crawled this far on a dead banner. The keep ends you here, on its threshold." },
    { speaker: "Vex", text: "Cut across the moat, scale the perches. The Herald falls, the keep's door opens." },
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

  // The long march — Frostspire Pass: crowns cleared, the crossing forced.
  frostspirePass: [
    { speaker: "Bron", text: "Pass is clear. Cold work." },
    { speaker: "Lyra", text: "The crowns are ours. Move, before the wind finds us." },
  ],

  // The long march — The Sunken Causeway: the shrine seized, the bog left behind.
  sunkenCauseway: [
    { speaker: "Mira", text: "Shrine's taken. The bog can have the rest." },
    { speaker: "Garan", text: "One more road behind us. Keep to the stone." },
  ],

  // The long march — Emberfall Quarry: the upper landing held, the wardens spent.
  emberfallQuarry: [
    { speaker: "Vex", text: "Held the landing. They burned themselves out on the ramps." },
    { speaker: "Garan", text: "The crown of the dig is ours. On." },
  ],

  // The long march — The Howling Steppe: the horde weathered, the line unbroken.
  howlingSteppe: [
    { speaker: "Bron", text: "Eight turns. The storm broke on us, and we didn't." },
    { speaker: "Lyra", text: "The Steppe's quiet now. Even the wind gave up." },
  ],

  // The long march — Gravewatch Hollow: Mortilex put down, the dead laid to rest.
  gravewatchHollow: [
    { speaker: "Mira", text: "Mortilex is down. The dead are just dead again." },
    { speaker: "Garan", text: "Bury what he raised. We leave none of them standing." },
  ],

  // The long march — The Verdant Ruins: the canopy cleared, the spring taken.
  verdantRuins: [
    { speaker: "Vex", text: "Canopy's cleared. The spring runs clean for us now." },
    { speaker: "Garan", text: "The ruins are ours. Drink, then we march." },
  ],

  // The long march — Ironhold Gate: the gate-control seized, the garrison broken.
  ironholdGate: [
    { speaker: "Bron", text: "Gate's open. Took the lane, and the towers with it." },
    { speaker: "Garan", text: "Ironhold's broken. The road inward is ours." },
  ],

  // The long march — Saltflat Mirage: the raiders run down, the flats emptied.
  saltflatMirage: [
    { speaker: "Lyra", text: "Ran every last one down. No mirages left to chase." },
    { speaker: "Vex", text: "The flats are empty. Out of this glare, fast." },
  ],

  // The long march — The Drowned Vault: the dais held, the floodgates sealed.
  drownedVault: [
    { speaker: "Mira", text: "Dais held. Floodgates sealed with us still on it." },
    { speaker: "Garan", text: "The vault-core's ours. Let the water take the rest." },
  ],

  // The long march — Maldrath's Approach: the Herald cut down, the keep laid open.
  maldrathsApproach: [
    { speaker: "Garan", text: "The Herald's dead. The keep's door stands open." },
    { speaker: "Vex", text: "Only Maldrath left now. The last door." },
    { speaker: "—", text: "The Ashen Banner reaches the threshold of the dark keep. One stand remains." },
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
