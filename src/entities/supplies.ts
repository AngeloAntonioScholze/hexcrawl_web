import type { EntityKind } from './entity'

/** What a caravan has in its wagons. */
export interface Supplies {
  food: number
  gold: number
}

export type Supply = keyof Supplies

/** What the DM set a caravan's supplies to on one turn. */
export interface SupplyEntry extends Supplies {
  turn: number
}

/**
 * Every hand edit to every caravan's supplies, entity by entity, oldest turn
 * first. A turn reads the last edit made at or before it, so winding the clock
 * back hands back what the wagons held then.
 */
export type SupplyLedger = ReadonlyMap<string, readonly SupplyEntry[]>

/** How full a bar is at the top: food in days of rations, gold in coin. */
export const SUPPLY_LIMITS: Readonly<Record<Supply, { max: number }>> = {
  food: { max: 100 },
  gold: { max: 1000 },
}

export const NO_SUPPLIES: Supplies = { food: 0, gold: 0 }

/** Only caravans carry stores; a party's pack is not worth the bookkeeping. */
export const carriesSupplies = (kind: EntityKind): boolean => kind === 'caravan'

export const clampSupply = (supply: Supply, value: number): number =>
  Number.isFinite(value) ? Math.min(SUPPLY_LIMITS[supply].max, Math.max(0, Math.round(value))) : 0

export function suppliesAt(ledger: SupplyLedger, id: string, turn: number): Supplies {
  let found: Supplies = NO_SUPPLIES
  for (const entry of ledger.get(id) ?? []) {
    if (entry.turn > turn) break
    found = entry
  }
  return { food: found.food, gold: found.gold }
}

/**
 * Sets one supply from this turn on. Edits made later in the record still
 * stand: they were the DM's word for those turns, and correcting the past
 * does not overrule it.
 */
export function editSupply(
  ledger: SupplyLedger,
  id: string,
  turn: number,
  supply: Supply,
  value: number,
): SupplyLedger {
  const next: SupplyEntry = {
    ...suppliesAt(ledger, id, turn),
    [supply]: clampSupply(supply, value),
    turn,
  }
  const kept = (ledger.get(id) ?? []).filter((entry) => entry.turn !== turn)
  const entries = [...kept, next].sort((a, b) => a.turn - b.turn)
  return new Map(ledger).set(id, entries)
}

/** Drops what was set on turns a cut record no longer reaches. */
export function cutSupplies(ledger: SupplyLedger, after: number): SupplyLedger {
  let changed = false
  const next = new Map<string, readonly SupplyEntry[]>()
  for (const [id, entries] of ledger) {
    const kept = entries.filter((entry) => entry.turn <= after)
    if (kept.length !== entries.length) changed = true
    if (kept.length > 0) next.set(id, kept)
  }
  return changed ? next : ledger
}
