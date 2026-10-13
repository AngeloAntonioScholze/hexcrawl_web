import { describe, expect, it } from 'vitest'
import { RESOURCE_TYPES } from '../terrain/resources'
import {
  catalogFor,
  DEFAULT_CATALOG,
  nextUnlocks,
  unlockedServices,
  type CatalogEntry,
} from './catalog'
import { MERCHANT_LEVELS, MERCHANT_TYPES } from './merchant'

const entry = (id: string, level: number, name = id): CatalogEntry => ({
  id: `smith.${id}`,
  merchant: 'smith',
  level,
  kind: 'service',
  name,
  description: '',
  price: '',
})

describe('default catalog', () => {
  it('gives every merchant type a spread of entries starting at level 1', () => {
    for (const type of MERCHANT_TYPES) {
      const entries = catalogFor(type)
      expect(entries.length).toBeGreaterThanOrEqual(5)
      expect(entries.length).toBeLessThanOrEqual(8)
      expect(entries[0]?.level).toBe(MERCHANT_LEVELS.min)
      expect(entries.at(-1)?.level).toBeGreaterThanOrEqual(8)
    }
  })

  it('keeps every unlock level a whole number within the merchant levels', () => {
    for (const { level } of DEFAULT_CATALOG) {
      expect(Number.isInteger(level)).toBe(true)
      expect(level).toBeGreaterThanOrEqual(MERCHANT_LEVELS.min)
      expect(level).toBeLessThanOrEqual(MERCHANT_LEVELS.max)
    }
  })

  it('gives each entry a unique id namespaced by its merchant', () => {
    const ids = DEFAULT_CATALOG.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const { id, merchant } of DEFAULT_CATALOG) {
      expect(id).toMatch(new RegExp(`^${merchant}\\.[a-z0-9]+(-[a-z0-9]+)*$`))
    }
  })

  it('fills in every text field and only names real resources', () => {
    for (const { name, description, price, materials } of DEFAULT_CATALOG) {
      expect(name.trim()).not.toBe('')
      expect(description.trim()).not.toBe('')
      expect(price.trim()).not.toBe('')
      for (const material of materials ?? []) expect(RESOURCE_TYPES).toContain(material)
      if (materials) expect(new Set(materials).size).toBe(materials.length)
    }
  })

  it('offers both trade and services across the catalog', () => {
    const kinds = new Set(DEFAULT_CATALOG.map((e) => e.kind))
    expect([...kinds].sort()).toEqual(['service', 'trade'])
  })
})

describe('catalogFor', () => {
  it('sorts by unlock level, then name', () => {
    const catalog = [entry('c', 3), entry('b', 1, 'Zed'), entry('a', 1, 'Axe')]
    expect(catalogFor('smith', catalog).map((e) => e.id)).toEqual(['smith.a', 'smith.b', 'smith.c'])
    expect(catalogFor('cook', catalog)).toEqual([])
  })
})

describe('unlockedServices', () => {
  const catalog = [entry('one', 1), entry('three', 3), entry('five', 5)]

  it('includes entries unlocking at exactly the merchant level', () => {
    expect(unlockedServices('smith', 1, catalog).map((e) => e.id)).toEqual(['smith.one'])
    expect(unlockedServices('smith', 3, catalog).map((e) => e.id)).toEqual([
      'smith.one',
      'smith.three',
    ])
    expect(unlockedServices('smith', 10, catalog)).toHaveLength(3)
  })

  it('grows monotonically with level in the default catalog', () => {
    for (const type of MERCHANT_TYPES) {
      let previous = 0
      for (let level = MERCHANT_LEVELS.min; level <= MERCHANT_LEVELS.max; level++) {
        const count = unlockedServices(type, level).length
        expect(count).toBeGreaterThanOrEqual(previous)
        previous = count
      }
      expect(previous).toBe(catalogFor(type).length)
    }
  })
})

describe('nextUnlocks', () => {
  const catalog = [entry('one', 1), entry('a', 4), entry('b', 4), entry('far', 9)]

  it('returns everything at the next level that unlocks anything', () => {
    expect(nextUnlocks('smith', 1, catalog).map((e) => e.id)).toEqual(['smith.a', 'smith.b'])
    expect(nextUnlocks('smith', 0, catalog).map((e) => e.id)).toEqual(['smith.one'])
    expect(nextUnlocks('smith', 4, catalog).map((e) => e.id)).toEqual(['smith.far'])
  })

  it('is empty once nothing is left to unlock', () => {
    expect(nextUnlocks('smith', 9, catalog)).toEqual([])
    expect(nextUnlocks('smith', MERCHANT_LEVELS.max)).toEqual([])
  })
})
