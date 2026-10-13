import { describe, expect, it } from 'vitest'
import { crossesRiver, isRiverEdge, riverEdge, riverKey, wet, type Rivers } from './rivers'
import { roadKey, withRoad } from './roads'

describe('rivers', () => {
  it('names a stretch the same from either end, and as the road between the same hexes', () => {
    expect(riverKey({ q: 1, r: 0 }, { q: 0, r: 0 })).toBe(riverKey({ q: 0, r: 0 }, { q: 1, r: 0 }))
    expect(riverKey({ q: 0, r: 1 }, { q: 1, r: 0 })).toBe(roadKey({ q: 0, r: 1 }, { q: 1, r: 0 }))
    expect(riverEdge(riverKey({ q: 0, r: 1 }, { q: 0, r: 0 }))).toEqual({ a: '0,0', b: '0,1' })
  })

  it('only runs between neighbours', () => {
    expect(isRiverEdge('0,0', '0,1')).toBe(true)
    expect(isRiverEdge('0,0', '0,2')).toBe(false)
  })

  // North to south through 1,0.
  const rivers: Rivers = withRoad(new Set(), [
    { q: 1, r: -1 },
    { q: 1, r: 0 },
    { q: 1, r: 1 },
  ])

  it('wets every hex it runs through and no other', () => {
    expect(wet(rivers, { q: 1, r: 0 })).toBe(true)
    expect(wet(rivers, { q: 1, r: -1 })).toBe(true)
    expect(wet(rivers, { q: 0, r: 0 })).toBe(false)
  })

  it('is crossed stepping into its hex from the side, not following it or leaving', () => {
    expect(crossesRiver(rivers, { q: 0, r: 0 }, { q: 1, r: 0 })).toBe(true)
    expect(crossesRiver(rivers, { q: 1, r: -1 }, { q: 1, r: 0 })).toBe(false)
    expect(crossesRiver(rivers, { q: 1, r: 0 }, { q: 2, r: 0 })).toBe(false)
  })
})
