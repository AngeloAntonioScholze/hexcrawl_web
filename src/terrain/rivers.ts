import { distance, type Axial } from '../hex/coords'
import { isRoadEdge, roadEdge, roadKey, type RoadEdge, type RoadKey } from './roads'

/**
 * A river runs along the side two neighbouring hexes share, so it is named by
 * that pair exactly as the road crossing it would be: a road and a river with
 * the same key are a bridge.
 */
export type RiverKey = RoadKey

/** Every stretch of river on the map; replaced whole on every change, never mutated. */
export type Rivers = ReadonlySet<RiverKey>

export type RiverEdge = RoadEdge

export const riverKey = roadKey
export const riverEdge = roadEdge
export const isRiverEdge = isRoadEdge

export const hasRiver = (rivers: Rivers, a: Axial, b: Axial): boolean => rivers.has(riverKey(a, b))

/** Lays river along the side two hexes share, or takes it up if it is there already. */
export function withRiverToggled(rivers: Rivers, a: Axial, b: Axial): Rivers {
  if (distance(a, b) !== 1) return rivers
  const key = riverKey(a, b)
  const next = new Set(rivers)
  if (!next.delete(key)) next.add(key)
  return next
}
