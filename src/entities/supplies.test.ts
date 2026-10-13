import { describe, expect, it } from 'vitest'
import {
  carriesSupplies,
  clampSupply,
  cutSupplies,
  editSupply,
  SUPPLY_LIMITS,
  suppliesAt,
  type SupplyLedger,
} from './supplies'

const empty: SupplyLedger = new Map()

describe('supplies', () => {
  it('are carried by caravans alone', () => {
    expect(carriesSupplies('caravan')).toBe(true)
    expect(carriesSupplies('party')).toBe(false)
    expect(carriesSupplies('npc')).toBe(false)
    expect(carriesSupplies('ship')).toBe(false)
  })

  it('start empty', () => {
    expect(suppliesAt(empty, 'c', 5)).toEqual({ food: 0, gold: 0 })
  })

  it('are clamped to whole amounts between nothing and a full bar', () => {
    expect(clampSupply('food', -3)).toBe(0)
    expect(clampSupply('food', 12.6)).toBe(13)
    expect(clampSupply('gold', 1e9)).toBe(SUPPLY_LIMITS.gold.max)
    expect(clampSupply('gold', Number.NaN)).toBe(0)
  })

  it('hold an edit from its turn on, and not before', () => {
    const ledger = editSupply(empty, 'c', 3, 'food', 40)

    expect(suppliesAt(ledger, 'c', 2)).toEqual({ food: 0, gold: 0 })
    expect(suppliesAt(ledger, 'c', 3)).toEqual({ food: 40, gold: 0 })
    expect(suppliesAt(ledger, 'c', 9)).toEqual({ food: 40, gold: 0 })
  })

  it('keep the other supply when one is edited', () => {
    let ledger = editSupply(empty, 'c', 0, 'food', 40)
    ledger = editSupply(ledger, 'c', 2, 'gold', 75)

    expect(suppliesAt(ledger, 'c', 1)).toEqual({ food: 40, gold: 0 })
    expect(suppliesAt(ledger, 'c', 2)).toEqual({ food: 40, gold: 75 })
  })

  it('replace an edit made on the same turn', () => {
    let ledger = editSupply(empty, 'c', 1, 'food', 40)
    ledger = editSupply(ledger, 'c', 1, 'food', 10)

    expect(ledger.get('c')).toHaveLength(1)
    expect(suppliesAt(ledger, 'c', 1).food).toBe(10)
  })

  it('leave a later edit standing when the past is corrected', () => {
    let ledger = editSupply(empty, 'c', 5, 'food', 50)
    ledger = editSupply(ledger, 'c', 2, 'food', 20)

    expect(suppliesAt(ledger, 'c', 3).food).toBe(20)
    expect(suppliesAt(ledger, 'c', 5).food).toBe(50)
  })

  it('keep caravans apart', () => {
    const ledger = editSupply(empty, 'a', 0, 'gold', 9)

    expect(suppliesAt(ledger, 'b', 0).gold).toBe(0)
  })

  it('forget edits on turns a cut record no longer reaches', () => {
    let ledger = editSupply(empty, 'c', 1, 'food', 10)
    ledger = editSupply(ledger, 'c', 4, 'food', 40)
    ledger = editSupply(ledger, 'd', 6, 'gold', 5)

    const cut = cutSupplies(ledger, 3)

    expect(suppliesAt(cut, 'c', 9).food).toBe(10)
    expect(cut.has('d')).toBe(false)
    expect(cutSupplies(cut, 3)).toBe(cut)
  })
})
