import { describe, expect, it } from 'vitest'
import { hexKey, type Axial } from './coords'
import { fieldOfView, hasLineOfSight, sightRadius } from './vision'

const origin: Axial = { q: 0, r: 0 }

const field = (heights: Record<string, number> = {}, floor = 1, extent = 12) => {
  const inside = (hex: Axial): boolean =>
    Math.max(Math.abs(hex.q), Math.abs(hex.r), Math.abs(hex.q + hex.r)) <= extent

  return (hex: Axial): number | undefined => {
    if (!inside(hex)) return undefined
    return heights[hexKey(hex)] ?? floor
  }
}

const seenKeys = (...args: Parameters<typeof fieldOfView>): Set<string> =>
  new Set(fieldOfView(...args).visible.map(hexKey))

describe('sightRadius', () => {
  it('is the flat-ground radius at zero elevation', () => {
    expect(sightRadius(0, { radius: 5, perElevation: 1.2 })).toBe(5)
  })

  it('reaches further from higher ground', () => {
    const low = sightRadius(0.5, { radius: 5, perElevation: 1.2 })
    const high = sightRadius(4, { radius: 5, perElevation: 1.2 })
    expect(high).toBeGreaterThan(low)
  })

  it('stops growing at the ceiling', () => {
    expect(sightRadius(100, { radius: 5, perElevation: 1.2, maxRadius: 14 })).toBe(14)
  })

  it('never goes negative', () => {
    expect(sightRadius(0, { radius: 0, perElevation: 0 })).toBe(0)
  })

  // Levels here are the terrain's own: 0 water and sand, 1 grass, 2 forest,
  // 3 mountains, 4 peaks.
  it('buys nothing for the ground a party walks through', () => {
    const flat = [0, 1, 2].map((level) => sightRadius(level, { radius: 5 }))
    expect(new Set(flat).size).toBe(1)
    expect(flat[0]).toBe(5)
  })

  it('opens up on the mountains and again on the peaks', () => {
    expect(sightRadius(3, { radius: 5 })).toBeGreaterThan(sightRadius(2, { radius: 5 }))
    expect(sightRadius(4, { radius: 5 })).toBeGreaterThan(sightRadius(3, { radius: 5 }))
  })

  it('moves the treeline with the vantage floor', () => {
    expect(sightRadius(2, { radius: 5, vantageFloor: 0 })).toBeGreaterThan(
      sightRadius(2, { radius: 5, vantageFloor: 2 }),
    )
  })
})

describe('hasLineOfSight', () => {
  // Standing on the field's own floor, an eye's height above it.
  const onTheFlat = { ground: 1, eye: 1.4 }

  it('always sees the hex it stands on', () => {
    expect(hasLineOfSight(origin, origin, onTheFlat, field())).toBe(true)
  })

  it('sees across level ground', () => {
    expect(hasLineOfSight(origin, { q: 6, r: 0 }, onTheFlat, field())).toBe(true)
  })

  it('is blocked by a ridge in the way', () => {
    const terrain = field({ '3,0': 40 })
    expect(hasLineOfSight(origin, { q: 6, r: 0 }, onTheFlat, terrain)).toBe(false)
  })

  it('sees the ridge itself even though it hides what is behind it', () => {
    const terrain = field({ '3,0': 40 })
    expect(hasLineOfSight(origin, { q: 3, r: 0 }, onTheFlat, terrain)).toBe(true)
  })

  it('sees a peak that rises back over the ridge hiding the valley', () => {
    const terrain = field({ '3,0': 10, '6,0': 60 })
    expect(hasLineOfSight(origin, { q: 4, r: 0 }, onTheFlat, terrain)).toBe(false)
    expect(hasLineOfSight(origin, { q: 6, r: 0 }, onTheFlat, terrain)).toBe(true)
  })

  it('treats the edge of the map as opaque', () => {
    expect(hasLineOfSight(origin, { q: 20, r: 0 }, onTheFlat, field())).toBe(false)
  })

  it('looks straight over ground below it', () => {
    const terrain = field({ '3,0': 10 })
    expect(hasLineOfSight(origin, { q: 6, r: 0 }, { ground: 2, eye: 2.4 }, terrain)).toBe(false)
    expect(hasLineOfSight(origin, { q: 6, r: 0 }, { ground: 30, eye: 30.4 }, terrain)).toBe(true)
  })

  it('is not stopped by ground exactly level with the party', () => {
    const terrain = field({ '3,0': 4 })
    expect(hasLineOfSight(origin, { q: 6, r: 0 }, { ground: 4, eye: 4.4 }, terrain)).toBe(true)
  })

  it('is still stopped by a single step above the party', () => {
    const terrain = field({ '3,0': 5 })
    expect(hasLineOfSight(origin, { q: 6, r: 0 }, { ground: 4, eye: 4.4 }, terrain)).toBe(false)
  })
})

describe('fieldOfView', () => {
  const options = { radius: 4, eyeHeight: 0.4, perElevation: 0 }

  it('sees the whole disc on flat ground', () => {
    const field_ = fieldOfView(origin, field(), options)
    expect(field_.visible).toHaveLength(1 + 3 * 4 * (4 + 1))
    expect(field_.blocked).toHaveLength(0)
  })

  it('reports how far it managed to look', () => {
    expect(fieldOfView(origin, field(), options).radius).toBe(4)
  })

  it('includes the hex the party stands on', () => {
    expect(seenKeys(origin, field(), options).has('0,0')).toBe(true)
  })

  it('casts a shadow behind a mountain', () => {
    const seen = seenKeys(origin, field({ '2,0': 40 }), options)
    expect(seen.has('2,0')).toBe(true)
    expect(seen.has('3,0')).toBe(false)
    expect(seen.has('4,0')).toBe(false)
    expect(seen.has('0,3')).toBe(true)
  })

  it('hands back the shadow itself, not just what is left of the disc', () => {
    const { visible, blocked } = fieldOfView(origin, field({ '2,0': 40 }), options)
    const shadowed = new Set(blocked.map(hexKey))

    expect(shadowed.has('3,0')).toBe(true)
    expect(shadowed.has('4,0')).toBe(true)
    expect(visible.length + blocked.length).toBe(1 + 3 * 4 * (4 + 1))
  })

  it('counts ground off the edge of the map as neither seen nor blocked', () => {
    const { visible, blocked } = fieldOfView(origin, field({}, 1, 2), options)
    expect(visible.length + blocked.length).toBe(1 + 3 * 2 * (2 + 1))
  })

  it('clears the whole disc from a summit that overlooks everything', () => {
    const summit = field({ '0,0': 9, '2,0': 4, '1,2': 3 })
    const { visible, blocked } = fieldOfView(origin, summit, { radius: 4, perElevation: 0 })

    expect(blocked).toHaveLength(0)
    expect(visible).toHaveLength(1 + 3 * 4 * (4 + 1))
  })

  it('is still hemmed in by ground that overlooks the party', () => {
    const overlooked = field({ '0,0': 2, '2,0': 6 })
    const { blocked } = fieldOfView(origin, overlooked, { radius: 4, perElevation: 0 })

    expect(new Set(blocked.map(hexKey)).has('4,0')).toBe(true)
  })

  it('sees further from a summit than from the plain', () => {
    const terrain = field({ '0,0': 5 })
    const fromPlain = fieldOfView(origin, field(), { radius: 4, perElevation: 1.2 })
    const fromSummit = fieldOfView(origin, terrain, { radius: 4, perElevation: 1.2 })
    expect(fromSummit.visible.length).toBeGreaterThan(fromPlain.visible.length)
  })

  it('sees nothing from off the map', () => {
    expect(fieldOfView({ q: 40, r: 0 }, field(), options)).toEqual({
      radius: 0,
      visible: [],
      blocked: [],
    })
  })
})
