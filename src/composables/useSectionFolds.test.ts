import { describe, expect, it } from 'vitest'
import { computed } from 'vue'
import { useSectionFolds } from './useSectionFolds'

const KEY = 'hexcrawl.sectionFolds'

const memoryStorage = (seed: Record<string, string> = {}) => {
  const items = new Map(Object.entries(seed))
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  }
}

describe('useSectionFolds', () => {
  it('starts every section open', () => {
    const folds = useSectionFolds(memoryStorage())
    expect(folds.isFolded('caravan.merchants')).toBe(false)
    expect(folds.isFolded('world.terrain')).toBe(false)
  })

  it('folds on one toggle and opens on the next', () => {
    const folds = useSectionFolds(memoryStorage())
    folds.toggle('caravan.riders')
    expect(folds.isFolded('caravan.riders')).toBe(true)
    expect(folds.isFolded('caravan.merchants')).toBe(false)
    folds.toggle('caravan.riders')
    expect(folds.isFolded('caravan.riders')).toBe(false)
  })

  it('keeps the folds for the next visit, sorted', () => {
    const storage = memoryStorage()
    const first = useSectionFolds(storage)
    first.toggle('world.resources')
    first.toggle('caravan.merchants')
    expect(storage.items.get(KEY)).toBe('["caravan.merchants","world.resources"]')

    const next = useSectionFolds(storage)
    expect(next.isFolded('world.resources')).toBe(true)
    expect(next.isFolded('caravan.merchants')).toBe(true)
    expect(next.isFolded('world.maps')).toBe(false)
  })

  it('keeps stored keys of sections no longer in the app', () => {
    const storage = memoryStorage({ [KEY]: '["gone.section"]' })
    useSectionFolds(storage).toggle('world.maps')
    expect(storage.items.get(KEY)).toBe('["gone.section","world.maps"]')
  })

  it('tells a computed when a fold flips', () => {
    const folds = useSectionFolds(memoryStorage())
    const folded = computed(() => folds.isFolded('caravan.supplies'))
    expect(folded.value).toBe(false)
    folds.toggle('caravan.supplies')
    expect(folded.value).toBe(true)
  })

  it.each([['not json'], ['{"caravan.riders":true}'], ['"caravan.riders"'], ['["a",3]']])(
    'opens everything when the stored folds are %s',
    (raw) => {
      const folds = useSectionFolds(memoryStorage({ [KEY]: raw }))
      expect(folds.isFolded('caravan.riders')).toBe(false)
      expect(folds.isFolded('a')).toBe(false)
    },
  )

  it('still folds for the visit when storage throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    const folds = useSectionFolds(broken)
    folds.toggle('details.notes')
    expect(folds.isFolded('details.notes')).toBe(true)
  })

  it('still folds for the visit with no storage at all', () => {
    const folds = useSectionFolds(null)
    folds.toggle('details.notes')
    expect(folds.isFolded('details.notes')).toBe(true)
  })
})
