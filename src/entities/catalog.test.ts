import { describe, expect, it } from 'vitest'
import { RESOURCE_TYPES, type ResourceType } from '../terrain/resources'
import {
  applyCatalogOverrides,
  catalogFor,
  customEntry,
  DEFAULT_CATALOG,
  editOverride,
  nextUnlocks,
  removeOverride,
  resetOverride,
  unlockedServices,
  type CatalogEntry,
  type CatalogOverride,
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

describe('catalog overrides', () => {
  const defaults = [entry('a', 1, 'Alpha'), entry('b', 3, 'Beta')]
  const byId = (catalog: readonly CatalogEntry[], id: string): CatalogEntry | undefined =>
    catalog.find((one) => one.id === id)

  it('rewrites, strikes off and adds entries, defaults first', () => {
    const made: CatalogEntry = { ...entry('custom-1', 2, 'Gamma'), materials: ['iron'] }
    const merged = applyCatalogOverrides(defaults, [
      { id: 'smith.b', op: 'remove' },
      { id: 'smith.custom-1', op: 'add', entry: made },
      { id: 'smith.a', op: 'edit', patch: { price: '3 gp', level: 4 } },
    ])

    expect(merged.map((one) => one.id)).toEqual(['smith.a', 'smith.custom-1'])
    expect(byId(merged, 'smith.a')).toMatchObject({ name: 'Alpha', price: '3 gp', level: 4 })
    expect(byId(merged, 'smith.custom-1')).toEqual(made)
  })

  it('keeps unlock levels within 1 to 10 and ignores changes to entries it does not have', () => {
    const merged = applyCatalogOverrides(defaults, [
      { id: 'smith.a', op: 'edit', patch: { level: 40 } },
      { id: 'smith.gone', op: 'remove' },
      { id: 'smith.b', op: 'add', entry: entry('b', 2, 'Impostor') },
    ])
    expect(merged.map((one) => [one.id, one.level, one.name])).toEqual([
      ['smith.a', MERCHANT_LEVELS.max, 'Alpha'],
      ['smith.b', 3, 'Beta'],
    ])
  })

  it('folds edits into one patch holding only what differs from the default', () => {
    let overrides = editOverride([], 'smith.a', { price: '3 gp' }, defaults)
    overrides = editOverride(overrides, 'smith.a', { level: 0 }, defaults)
    expect(overrides).toEqual([{ id: 'smith.a', op: 'edit', patch: { price: '3 gp' } }])

    overrides = editOverride(overrides, 'smith.a', { level: 5, name: '  ' }, defaults)
    expect(overrides).toEqual([{ id: 'smith.a', op: 'edit', patch: { price: '3 gp', level: 5 } }])

    overrides = editOverride(overrides, 'smith.a', { price: '', level: 1 }, defaults)
    expect(overrides).toEqual([])
  })

  it('hands the same list back when an edit changes nothing', () => {
    const overrides = editOverride([], 'smith.a', { price: '3 gp' }, defaults)
    expect(editOverride(overrides, 'smith.a', { price: '3 gp' }, defaults)).toBe(overrides)
    expect(editOverride(overrides, 'smith.nope', { price: '1 gp' }, defaults)).toBe(overrides)
  })

  it('leaves resources the world does not have out of an edit', () => {
    const materials = ['iron', 'mithril', 'iron'] as ResourceType[]
    const overrides = editOverride([], 'smith.a', { materials }, defaults)
    expect(byId(applyCatalogOverrides(defaults, overrides), 'smith.a')?.materials).toEqual(['iron'])
  })

  it('restores the default once its override is reset', () => {
    let overrides = editOverride([], 'smith.a', { name: 'Renamed' }, defaults)
    overrides = removeOverride(overrides, 'smith.b', defaults)
    expect(applyCatalogOverrides(defaults, overrides).map((one) => one.name)).toEqual(['Renamed'])

    overrides = resetOverride(resetOverride(overrides, 'smith.a'), 'smith.b')
    expect(overrides).toEqual([])
    expect(applyCatalogOverrides(defaults, overrides)).toEqual(defaults)
  })

  it('edits and removes an entry the DM made, which a reset leaves alone', () => {
    const made = customEntry('smith', { name: 'Gamma', level: 12 })
    expect(made.id).toMatch(/^smith\.custom-[0-9a-f]{8}$/)
    expect(made.level).toBe(MERCHANT_LEVELS.max)

    let overrides: readonly CatalogOverride[] = [{ id: made.id, op: 'add', entry: made }]
    overrides = editOverride(overrides, made.id, { price: '9 gp' }, defaults)
    expect(byId(applyCatalogOverrides(defaults, overrides), made.id)?.price).toBe('9 gp')
    expect(resetOverride(overrides, made.id)).toBe(overrides)
    expect(removeOverride(overrides, made.id, defaults)).toEqual([])
  })

  it('feeds the merged catalog to what a merchant offers', () => {
    const merged = applyCatalogOverrides(
      DEFAULT_CATALOG,
      editOverride([], 'smith.sharpen', { level: 1 }),
    )
    expect(unlockedServices('smith', 1, merged).map((one) => one.id)).toContain('smith.sharpen')
    expect(unlockedServices('smith', 1).map((one) => one.id)).not.toContain('smith.sharpen')
  })
})
