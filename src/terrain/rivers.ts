import { neighbors, type Axial } from '../hex/coords'
import { isRoadEdge, roadEdge, roadKey, type RoadEdge, type RoadKey } from './roads'

/**
 * A river runs from one hex's middle to its neighbour's, exactly as a road
 * does, so it is named by that pair the same way and drawn with the same tool.
 */
export type RiverKey = RoadKey

/** Every stretch of river on the map; replaced whole on every change, never mutated. */
export type Rivers = ReadonlySet<RiverKey>

export type RiverEdge = RoadEdge

export const riverKey = roadKey
export const riverEdge = roadEdge
export const isRiverEdge = isRoadEdge

export const hasRiver = (rivers: Rivers, a: Axial, b: Axial): boolean => rivers.has(riverKey(a, b))

/** Whether a river runs through a hex at all. */
export const wet = (rivers: Rivers, hex: Axial): boolean =>
  neighbors(hex).some((next) => hasRiver(rivers, hex, next))

/**
 * Stepping into a hex a river runs through means fording it, unless the step
 * follows the river itself: walking along the bank never crosses the water.
 */
export const crossesRiver = (rivers: Rivers, from: Axial, to: Axial): boolean =>
  !hasRiver(rivers, from, to) && wet(rivers, to)
