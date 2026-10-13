import { distance, hexKey, parseKey, type Axial, type HexKey } from '../hex/coords'

/** A road between two neighbouring hexes, its ends always in the same order. */
export type RoadKey = `${HexKey}|${HexKey}`

/** Every stretch of road on the map; replaced whole on every change, never mutated. */
export type Roads = ReadonlySet<RoadKey>

export interface RoadEdge {
  a: HexKey
  b: HexKey
}

const before = (a: Axial, b: Axial): boolean => a.q < b.q || (a.q === b.q && a.r < b.r)

/** The same key whichever end the road is walked from. */
export const roadKey = (a: Axial, b: Axial): RoadKey =>
  before(a, b) ? `${hexKey(a)}|${hexKey(b)}` : `${hexKey(b)}|${hexKey(a)}`

export const roadEdge = (key: RoadKey): RoadEdge => {
  const bar = key.indexOf('|')
  return { a: key.slice(0, bar) as HexKey, b: key.slice(bar + 1) as HexKey }
}

export const hasRoad = (roads: Roads, a: Axial, b: Axial): boolean => roads.has(roadKey(a, b))

/** Lays road along a path, one stretch per pair of neighbours; the same set if nothing is new. */
export function withRoad(roads: Roads, path: readonly Axial[]): Roads {
  let next: Set<RoadKey> | null = null
  for (let i = 1; i < path.length; i++) {
    if (distance(path[i - 1], path[i]) !== 1) continue
    const key = roadKey(path[i - 1], path[i])
    if (roads.has(key)) continue
    next ??= new Set(roads)
    next.add(key)
  }
  return next ?? roads
}

/** Tears up every stretch of road that touches a hex; the same set if none did. */
export function withoutRoadAt(roads: Roads, hex: Axial): Roads {
  const key = hexKey(hex)
  const kept = [...roads].filter((road) => {
    const { a, b } = roadEdge(road)
    return a !== key && b !== key
  })
  return kept.length === roads.size ? roads : new Set(kept)
}

/** Every hex a road runs through. */
export function roadHexes(roads: Roads): Set<HexKey> {
  const hexes = new Set<HexKey>()
  for (const road of roads) {
    const { a, b } = roadEdge(road)
    hexes.add(a)
    hexes.add(b)
  }
  return hexes
}

export const isRoadEdge = (a: HexKey, b: HexKey): boolean =>
  a !== b && distance(parseKey(a), parseKey(b)) === 1
