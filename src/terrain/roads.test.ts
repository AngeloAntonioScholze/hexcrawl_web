import { describe, expect, it } from 'vitest'
import type { Axial, HexKey } from '../hex/coords'
import {
  hasRoad,
  isRoadEdge,
  roadEdge,
  roadHexes,
  roadKey,
  withoutRoadAt,
  withRoad,
  type Roads,
} from './roads'

const east = (count: number): Axial[] => Array.from({ length: count + 1 }, (_, q) => ({ q, r: 0 }))

describe('road keys', () => {
  it('names a stretch the same whichever end it is walked from', () => {
    expect(roadKey({ q: 1, r: 0 }, { q: 0, r: 0 })).toBe(roadKey({ q: 0, r: 0 }, { q: 1, r: 0 }))
    expect(roadKey({ q: 0, r: 1 }, { q: 0, r: 0 })).toBe('0,0|0,1')
    expect(roadKey({ q: -1, r: 1 }, { q: -1, r: 0 })).toBe('-1,0|-1,1')
  })

  it('reads both ends back out of a key', () => {
    expect(roadEdge(roadKey({ q: 2, r: -1 }, { q: 1, r: -1 }))).toEqual({ a: '1,-1', b: '2,-1' })
  })

  it('only joins neighbouring hexes', () => {
    expect(isRoadEdge('0,0', '1,-1')).toBe(true)
    expect(isRoadEdge('0,0', '2,0')).toBe(false)
    expect(isRoadEdge('0,0', '0,0')).toBe(false)
  })
})

describe('laying and tearing up road', () => {
  it('lays one stretch between each pair of neighbours on a path', () => {
    const roads = withRoad(new Set(), east(3))
    expect(roads.size).toBe(3)
    expect(hasRoad(roads, { q: 2, r: 0 }, { q: 1, r: 0 })).toBe(true)
    expect(hasRoad(roads, { q: 0, r: 0 }, { q: 2, r: 0 })).toBe(false)
  })

  it('hands back the same set when nothing is new', () => {
    const roads = withRoad(new Set(), east(2))
    expect(withRoad(roads, [...east(2)].reverse())).toBe(roads)
    expect(withRoad(roads, [{ q: 0, r: 0 }])).toBe(roads)
  })

  it('leaves the set it was given alone', () => {
    const before: Roads = new Set()
    withRoad(before, east(2))
    expect(before.size).toBe(0)
  })

  it('tears up every stretch touching a hex and nothing else', () => {
    const roads = withRoad(withRoad(new Set(), east(3)), [
      { q: 1, r: 0 },
      { q: 1, r: 1 },
    ])
    const torn = withoutRoadAt(roads, { q: 1, r: 0 })
    expect([...torn]).toEqual([roadKey({ q: 2, r: 0 }, { q: 3, r: 0 })])
    expect(withoutRoadAt(torn, { q: 5, r: 5 })).toBe(torn)
  })

  it('lists every hex a road runs through', () => {
    expect(roadHexes(withRoad(new Set(), east(2)))).toEqual(new Set<HexKey>(['0,0', '1,0', '2,0']))
  })
})
