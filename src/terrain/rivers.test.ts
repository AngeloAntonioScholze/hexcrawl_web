import { describe, expect, it } from 'vitest'
import { hasRiver, isRiverEdge, riverEdge, riverKey, withRiverToggled, type Rivers } from './rivers'
import { roadKey } from './roads'

describe('rivers', () => {
  it('names a side the same from either bank, and as the road across it', () => {
    expect(riverKey({ q: 1, r: 0 }, { q: 0, r: 0 })).toBe(riverKey({ q: 0, r: 0 }, { q: 1, r: 0 }))
    expect(riverKey({ q: 0, r: 1 }, { q: 1, r: 0 })).toBe(roadKey({ q: 0, r: 1 }, { q: 1, r: 0 }))
    expect(riverEdge(riverKey({ q: 0, r: 1 }, { q: 0, r: 0 }))).toEqual({ a: '0,0', b: '0,1' })
  })

  it('only runs between neighbours', () => {
    expect(isRiverEdge('0,0', '0,1')).toBe(true)
    expect(isRiverEdge('0,0', '0,2')).toBe(false)
  })

  it('lays river on a bare side and lifts it from one that has it', () => {
    const empty: Rivers = new Set()
    const laid = withRiverToggled(empty, { q: 0, r: 0 }, { q: 1, r: 0 })
    expect(empty.size).toBe(0)
    expect(hasRiver(laid, { q: 1, r: 0 }, { q: 0, r: 0 })).toBe(true)

    const lifted = withRiverToggled(laid, { q: 1, r: 0 }, { q: 0, r: 0 })
    expect(lifted.size).toBe(0)
  })

  it('hands back the same set for hexes that share no side', () => {
    const rivers: Rivers = new Set()
    expect(withRiverToggled(rivers, { q: 0, r: 0 }, { q: 2, r: 0 })).toBe(rivers)
    expect(withRiverToggled(rivers, { q: 0, r: 0 }, { q: 0, r: 0 })).toBe(rivers)
  })
})
