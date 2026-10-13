import { distance, parseKey, type HexKey } from '../hex/coords'
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

export const RESOURCE_LABELS: Readonly<Record<ResourceType, string>> = {
  timber: 'Timber',
  herbs: 'Herbs',
  game: 'Game',
  clay: 'Clay',
  iron: 'Iron',
  stone: 'Stone',
  gems: 'Gems',
  rareOre: 'Rare ore',
  crystal: 'Crystal',
  salt: 'Salt',
  glassSand: 'Glass sand',
  fish: 'Fish',
  pearls: 'Pearls',
  whales: 'Whales',
}

export const RESOURCE_TYPES = Object.keys(RESOURCE_LABELS) as readonly ResourceType[]

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

export interface NearbyResource {
  resource: Resource
  distance: number
}

/** The closest resource standing nearer than `spacing` hexes, the hex itself included. */
export function nearestWithin(
  hex: HexKey,
  resources: readonly Resource[],
  spacing: number,
): NearbyResource | null {
  const at = parseKey(hex)
  let nearest: NearbyResource | null = null
  for (const resource of resources) {
    const away = distance(at, parseKey(resource.hex))
    if (away < spacing && (!nearest || away < nearest.distance))
      nearest = { resource, distance: away }
  }
  return nearest
}

/** The odds a hex of a terrain holds a resource, before spacing thins them out. */
export type ResourceChances = Readonly<Record<TerrainId, number>>

export const DEFAULT_RESOURCE_CHANCE = 0.05

/** No two resources stand closer than this many hexes. */
export const DEFAULT_RESOURCE_SPACING = 5

export const RESOURCE_SPACING_LIMITS = { min: 0, max: 20, step: 1 } as const

export const defaultResourceChances = (): ResourceChances => ({
  deepWater: DEFAULT_RESOURCE_CHANCE,
  water: DEFAULT_RESOURCE_CHANCE,
  sand: DEFAULT_RESOURCE_CHANCE,
  grass: DEFAULT_RESOURCE_CHANCE,
  forest: DEFAULT_RESOURCE_CHANCE,
  mountains: DEFAULT_RESOURCE_CHANCE,
  peaks: DEFAULT_RESOURCE_CHANCE,
})
