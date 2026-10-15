import { describe, expect, it } from 'vitest'
import {
  carriesInventory,
  clampQuantity,
  cleanWeight,
  moveItem,
  newItem,
  QUANTITY_LIMITS,
  totalWeight,
  type Item,
} from './inventory'

const item = (
  id: string,
  ownerId: string,
  name: string,
  quantity: number,
  weight: number | null = null,
): Item => ({ id, ownerId, name, quantity, notes: '', weight })

describe('inventory', () => {
  it('is kept by parties, caravans and ships but not npcs', () => {
    expect(carriesInventory('party')).toBe(true)
    expect(carriesInventory('caravan')).toBe(true)
    expect(carriesInventory('ship')).toBe(true)
    expect(carriesInventory('npc')).toBe(false)
  })

  it('counts in whole numbers from one up', () => {
    expect(clampQuantity(0)).toBe(1)
    expect(clampQuantity(-4)).toBe(1)
    expect(clampQuantity(2.6)).toBe(3)
    expect(clampQuantity(1e9)).toBe(QUANTITY_LIMITS.max)
    expect(clampQuantity(Number.NaN)).toBe(1)
  })

  it('weighs nothing it cannot make sense of', () => {
    expect(cleanWeight(2.5)).toBe(2.5)
    expect(cleanWeight(0)).toBe(0)
    expect(cleanWeight(-1)).toBeNull()
    expect(cleanWeight(Number.NaN)).toBeNull()
    expect(cleanWeight(null)).toBeNull()
  })

  it('makes a new item tidied and defaulted', () => {
    const made = newItem('p', { name: '  rope ', notes: ' 50 ft ' })
    expect(made).toEqual({
      id: made.id,
      ownerId: 'p',
      name: 'rope',
      quantity: 1,
      notes: '50 ft',
      weight: null,
    })
  })

  it('weighs a whole stack, or nothing for an unweighed one', () => {
    expect(totalWeight(item('a', 'p', 'arrows', 20, 0.1))).toBeCloseTo(2)
    expect(totalWeight(item('a', 'p', 'arrows', 20))).toBeNull()
  })

  it('moves part of a stack as a new line', () => {
    const next = moveItem([item('a', 'p', 'torch', 5, 1)], 'a', 'c', 2)

    expect(next[0]).toEqual(item('a', 'p', 'torch', 3, 1))
    expect(next[1]).toMatchObject({ ownerId: 'c', name: 'torch', quantity: 2, weight: 1 })
    expect(next[1].id).not.toBe('a')
  })

  it('moves a whole stack as the same line', () => {
    expect(moveItem([item('a', 'p', 'torch', 5)], 'a', 'c', 5)).toEqual([
      item('a', 'c', 'torch', 5),
    ])
  })

  it('moves no more than there is', () => {
    expect(moveItem([item('a', 'p', 'torch', 5)], 'a', 'c', 50)).toEqual([
      item('a', 'c', 'torch', 5),
    ])
  })

  it('joins a line of the same thing already there', () => {
    const items = [item('a', 'p', 'Torch', 5, 1), item('b', 'c', 'torch ', 1, 1)]
    expect(moveItem(items, 'a', 'c', 5)).toEqual([item('b', 'c', 'torch ', 6, 1)])
  })

  it('keeps things of a different weight on lines of their own', () => {
    const items = [item('a', 'p', 'torch', 5, 1), item('b', 'c', 'torch', 1, 2)]
    expect(moveItem(items, 'a', 'c', 5)).toEqual([
      item('b', 'c', 'torch', 1, 2),
      item('a', 'c', 'torch', 5, 1),
    ])
  })

  it('leaves the list alone for an unknown item or the owner it already has', () => {
    const items = [item('a', 'p', 'torch', 5)]
    expect(moveItem(items, 'z', 'c', 1)).toBe(items)
    expect(moveItem(items, 'a', 'p', 1)).toBe(items)
  })
})
