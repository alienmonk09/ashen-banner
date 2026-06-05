import type { EquipmentDef, EquipSlot } from "../core/types";

export const EQUIPMENT: Record<string, EquipmentDef> = {
  leatherArmor: {
    id: "leatherArmor",
    name: "Leather Armor",
    slot: "armor",
    description: "Hardened hides stitched tight. Light protection, a bit of extra health.",
    mod: { def: 3, hp: 8 },
    price: 90,
  },
  chainmail: {
    id: "chainmail",
    name: "Chainmail",
    slot: "armor",
    description: "Interlocked rings of iron. Sturdy, but the weight shaves a step off your stride.",
    mod: { def: 6, hp: 12, spd: -1 },
    price: 200,
  },
  mageRobe: {
    id: "mageRobe",
    name: "Mage Robe",
    slot: "armor",
    description: "Woven with arcane thread. Thin armor, but bolsters magical resilience and MP.",
    mod: { def: 2, res: 4, mp: 6 },
    price: 110,
  },
  plateArmor: {
    id: "plateArmor",
    name: "Plate Armor",
    slot: "armor",
    description: "Full plate steel. Formidable bulk, but severely hampers movement speed.",
    mod: { def: 9, hp: 18, spd: -2 },
    price: 260,
  },
  ironRing: {
    id: "ironRing",
    name: "Iron Ring",
    slot: "accessory",
    description: "A plain iron band that quietly bolsters the wearer's vitality.",
    mod: { hp: 10 },
    price: 80,
  },
  powerBand: {
    id: "powerBand",
    name: "Power Band",
    slot: "accessory",
    description: "A bracer etched with warrior runes. Sharpens the striking arm.",
    mod: { atk: 2 },
    price: 120,
  },
  magePendant: {
    id: "magePendant",
    name: "Mage Pendant",
    slot: "accessory",
    description: "A crystal amulet that hums with latent arcana. Heightens magical power.",
    mod: { mag: 2 },
    price: 120,
  },
  swiftBoots: {
    id: "swiftBoots",
    name: "Swift Boots",
    slot: "accessory",
    description: "Light enchanted boots that let the wearer act sooner on the battlefield.",
    mod: { spd: 2 },
    price: 100,
  },
};

export function getEquipment(id: string): EquipmentDef {
  const e = EQUIPMENT[id];
  if (!e) throw new Error(`Unknown equipment: ${id}`);
  return e;
}

export function equipmentForSlot(slot: EquipSlot): EquipmentDef[] {
  return Object.values(EQUIPMENT).filter((e) => e.slot === slot);
}
