import { describe, expect, it } from 'vitest'
import { MERCHANT_TYPES } from './merchant'
import { CARAVAN_PORTRAITS, caravanPortrait, PROFESSION_ICONS } from './portraits'

describe('caravan portraits', () => {
  // Small files come back inlined as data URLs, so a picture is told apart by
  // what it is, not by the file it came from.
  it('gives every portrait its own id, a label and a picture of its own', () => {
    const ids = CARAVAN_PORTRAITS.map((one) => one.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(CARAVAN_PORTRAITS.map((one) => one.url)).size).toBe(ids.length)
    for (const one of CARAVAN_PORTRAITS) {
      expect(one.label).not.toBe('')
      expect(one.url).not.toBe('')
    }
  })

  it('finds a portrait by its id', () => {
    expect(caravanPortrait('night-camp')?.label).toBe('Night camp')
  })

  it('finds nothing for no id, or one this build does not ship', () => {
    expect(caravanPortrait(undefined)).toBeUndefined()
    expect(caravanPortrait('the-old-painting')).toBeUndefined()
  })
})

describe('profession icons', () => {
  it('has a picture of its own for every merchant type, and none for anything else', () => {
    expect(Object.keys(PROFESSION_ICONS).sort()).toEqual([...MERCHANT_TYPES].sort())
    expect(new Set(Object.values(PROFESSION_ICONS)).size).toBe(MERCHANT_TYPES.length)
    for (const type of MERCHANT_TYPES) expect(PROFESSION_ICONS[type]).not.toBe('')
  })
})
