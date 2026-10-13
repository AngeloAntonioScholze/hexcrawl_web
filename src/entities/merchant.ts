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
