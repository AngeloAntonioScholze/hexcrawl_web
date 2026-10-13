export const MERCHANT_TYPES = [
  'smith',
  'woodworker',
  'hunter',
  'apothecary',
  'doctor',
  'leatherworker',
  'cook',
  'cartographer',
  'herbalist',
  'alchemist',
  'enchanter',
  'stablemaster',
  'curio',
  'priest',
  'mage',
] as const

export type MerchantType = (typeof MERCHANT_TYPES)[number]

export interface MerchantInfo {
  label: string
  blurb: string
  icon: string
  color: string
}

export const MERCHANT_INFO: Readonly<Record<MerchantType, MerchantInfo>> = {
  smith: {
    label: 'Smith',
    blurb: 'Metal weapons, armour and tools; repairs.',
    icon: '🔨',
    color: '#a9b4c2',
  },
  woodworker: {
    label: 'Woodworker',
    blurb: 'Bows, shafts, shields, carts and wooden gear.',
    icon: '🪓',
    color: '#d4a76a',
  },
  hunter: {
    label: 'Hunter',
    blurb: 'Game and hides; tracking and trapping.',
    icon: '🏹',
    color: '#98a85a',
  },
  apothecary: {
    label: 'Apothecary',
    blurb: 'Remedies, poultices and antidotes.',
    icon: '💊',
    color: '#5ec4a8',
  },
  doctor: {
    label: 'Doctor',
    blurb: 'Treats wounds and disease; performs surgery.',
    icon: '🩺',
    color: '#e5736f',
  },
  leatherworker: {
    label: 'Leatherworker',
    blurb: 'Armour, packs, saddles and boots.',
    icon: '🥾',
    color: '#b5784f',
  },
  cook: {
    label: 'Cook',
    blurb: 'Preserves rations, stretches food, lays on feasts.',
    icon: '🍲',
    color: '#f0a44a',
  },
  cartographer: {
    label: 'Cartographer',
    blurb: 'Maps and charting; reveals rumoured sites.',
    icon: '🧭',
    color: '#e3d27a',
  },
  herbalist: {
    label: 'Herbalist',
    blurb: 'A specialist in herbs and plants.',
    icon: '🌿',
    color: '#7ccf6f',
  },
  alchemist: {
    label: 'Alchemist',
    blurb: 'Potions and bombs; refines materials.',
    icon: '🧪',
    color: '#4fc0e0',
  },
  enchanter: {
    label: 'Enchanter',
    blurb: 'Works magic items; unlocks more at higher levels.',
    icon: '✨',
    color: '#a88cf0',
  },
  stablemaster: {
    label: 'Stablemaster',
    blurb: 'Mounts, pack animals and animal care.',
    icon: '🐎',
    color: '#f08fb0',
  },
  curio: {
    label: 'Curio',
    blurb: 'Random trinkets and unusual items.',
    icon: '🏺',
    color: '#c56fd8',
  },
  priest: {
    label: 'Priest',
    blurb: 'Blessings, curse removal and rites.',
    icon: '📿',
    color: '#f4f0e0',
  },
  mage: {
    label: 'Mage',
    blurb: 'Casts spells; works magic items.',
    icon: '🪄',
    color: '#6b8cf0',
  },
}

export const MERCHANT_LEVELS = { min: 1, max: 10 } as const

/**
 * One of a caravan's crew. Map-level data like a hex note: the turn clock
 * never rewinds a merchant's level, only the DM changes it.
 */
export interface Merchant {
  id: string
  /** The caravan entity whose crew this merchant is. */
  caravanId: string
  name: string
  type: MerchantType
  /** A whole number from 1 to 10; what the merchant's services are worth. */
  level: number
}

export const clampLevel = (level: number): number =>
  Math.min(MERCHANT_LEVELS.max, Math.max(MERCHANT_LEVELS.min, Math.round(level)))

export function newMerchant(
  caravanId: string,
  name: string,
  type: MerchantType,
  level: number = MERCHANT_LEVELS.min,
): Merchant {
  return { id: crypto.randomUUID(), caravanId, name, type, level: clampLevel(level) }
}
