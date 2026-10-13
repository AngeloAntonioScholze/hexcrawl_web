import type { HexKey } from '../hex/coords'
import type { TerrainId } from './terrain'

export type ResourceType =
  | 'timber'
  | 'herbs'
  | 'game'
  | 'clay'
  | 'iron'
  | 'stone'
  | 'gems'
  | 'rareOre'
  | 'crystal'
  | 'salt'
  | 'glassSand'
  | 'fish'
  | 'pearls'
  | 'whales'

/** Whether the generator laid it down or the DM placed it by hand. */
export type ResourceOrigin = 'generated' | 'manual'

/** A resource node on one hex: something worth knowing about, not gathering. */
export interface Resource {
  id: string
  hex: HexKey
  type: ResourceType
  origin: ResourceOrigin
}

/** What each terrain can hold. */
export const TERRAIN_RESOURCES: Readonly<Record<TerrainId, readonly ResourceType[]>> = {
  deepWater: ['fish', 'whales'],
  water: ['fish', 'pearls'],
  sand: ['salt', 'glassSand'],
  grass: ['game', 'herbs', 'clay'],
  forest: ['timber', 'herbs', 'game'],
  mountains: ['iron', 'stone', 'gems'],
  peaks: ['rareOre', 'crystal'],
}

/** The odds a hex of a terrain holds a resource, before spacing thins them out. */
export type ResourceChances = Readonly<Record<TerrainId, number>>

export const DEFAULT_RESOURCE_CHANCE = 0.05

/** No two resources stand closer than this many hexes. */
export const DEFAULT_RESOURCE_SPACING = 10

export const defaultResourceChances = (): ResourceChances => ({
  deepWater: DEFAULT_RESOURCE_CHANCE,
  water: DEFAULT_RESOURCE_CHANCE,
  sand: DEFAULT_RESOURCE_CHANCE,
  grass: DEFAULT_RESOURCE_CHANCE,
  forest: DEFAULT_RESOURCE_CHANCE,
  mountains: DEFAULT_RESOURCE_CHANCE,
  peaks: DEFAULT_RESOURCE_CHANCE,
})
