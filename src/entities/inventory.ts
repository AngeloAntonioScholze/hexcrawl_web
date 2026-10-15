import type { EntityKind } from './entity'

/**
 * One line of what an entity carries. Map-level data like a merchant: the
 * clock never rewinds it, only a hand edit changes it.
 */
export interface Item {
  id: string
  /** The entity whose pack or wagons it is in. */
  ownerId: string
  name: string
  /** A whole number, never below one: an item used up is removed, not left at nought. */
  quantity: number
  notes: string
  /** Weight of one, in whatever unit the table uses; null when nobody weighed it. */
  weight: number | null
}

export type ItemFields = Pick<Item, 'name' | 'quantity' | 'notes' | 'weight'>

export const QUANTITY_LIMITS = { min: 1, max: 99999 } as const

/** Parties, caravans and ships keep a list; an npc's pockets are the DM's business. */
export const carriesInventory = (kind: EntityKind): boolean => kind !== 'npc'

export const clampQuantity = (value: number): number =>
  Number.isFinite(value)
    ? Math.min(QUANTITY_LIMITS.max, Math.max(QUANTITY_LIMITS.min, Math.round(value)))
    : QUANTITY_LIMITS.min

export const cleanWeight = (value: number | null): number | null =>
  value !== null && Number.isFinite(value) && value >= 0 ? value : null

export function newItem(ownerId: string, fields: Partial<ItemFields> & { name: string }): Item {
  return {
    id: crypto.randomUUID(),
    ownerId,
    name: fields.name.trim(),
    quantity: clampQuantity(fields.quantity ?? 1),
    notes: (fields.notes ?? '').trim(),
    weight: cleanWeight(fields.weight ?? null),
  }
}

/** What an item weighs in all, or null when it was never weighed. */
export const totalWeight = (item: Item): number | null =>
  item.weight === null ? null : item.weight * item.quantity

// Two lines of the same thing are one line: a name told apart only by case or
// spacing, at the same weight.
const sameThing = (a: Item, b: Item): boolean =>
  a.name.trim().toLowerCase() === b.name.trim().toLowerCase() && a.weight === b.weight

/**
 * Hands some of an item to another owner. What moves joins a line of the same
 * thing already there, and the line it left goes once nothing is left of it.
 * Asking for more than there is moves all of it.
 */
export function moveItem(
  items: readonly Item[],
  id: string,
  toId: string,
  quantity: number,
): readonly Item[] {
  const from = items.find((one) => one.id === id)
  if (!from || from.ownerId === toId) return items

  const moved = Math.min(from.quantity, clampQuantity(quantity))
  const into = items.find((one) => one.ownerId === toId && sameThing(one, from))
  const left = from.quantity - moved

  const next = items.flatMap((one): Item[] => {
    if (one.id === from.id) return left > 0 ? [{ ...one, quantity: left }] : []
    if (one.id === into?.id) {
      return [{ ...one, quantity: Math.min(QUANTITY_LIMITS.max, one.quantity + moved) }]
    }
    return [one]
  })

  if (into) return next
  return left > 0
    ? [...next, { ...from, id: crypto.randomUUID(), ownerId: toId, quantity: moved }]
    : [...next, { ...from, ownerId: toId, quantity: moved }]
}
