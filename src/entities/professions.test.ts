import { describe, expect, it } from 'vitest'
import { MERCHANT_TYPES } from './merchant'
import { PROFESSION_ICONS } from './professions'

describe('profession icons', () => {
  it('has a picture of its own for every merchant type, and none for anything else', () => {
    expect(Object.keys(PROFESSION_ICONS).sort()).toEqual([...MERCHANT_TYPES].sort())
    expect(new Set(Object.values(PROFESSION_ICONS)).size).toBe(MERCHANT_TYPES.length)
    for (const type of MERCHANT_TYPES) expect(PROFESSION_ICONS[type]).not.toBe('')
  })
})
