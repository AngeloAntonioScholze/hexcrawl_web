import { distance, hexKey, parseKey, range, type Axial } from '../hex/coords'
import type { TerrainField } from './field'
import { mulberry32 } from './perlin'
import { TERRAIN_RESOURCES, type Resource, type ResourceChances } from './resources'

export interface ResourceGenOptions {
  chances: ResourceChances
  /** No two resources, of any type or origin, stand closer than this. */
  spacing: number
  seed: number
  /** Resources already on the map that the new ones have to keep clear of. */
  existing?: readonly Resource[]
  newId?: () => string
}

const ORIGIN: Axial = { q: 0, r: 0 }

/**
 * Buckets as wide as the spacing: anything closer than the spacing differs by
 * less than it on both axial axes, so only the eight buckets around a hex's own
 * can hold a neighbour too close.
 */
function createSpacingGrid(spacing: number) {
  const buckets = new Map<string, Axial[]>()
  const bucketOf = (hex: Axial): [number, number] => [
    Math.floor(hex.q / spacing),
    Math.floor(hex.r / spacing),
  ]

  return {
    add(hex: Axial): void {
      const [bq, br] = bucketOf(hex)
      const key = `${bq},${br}`
      const bucket = buckets.get(key)
      if (bucket) bucket.push(hex)
      else buckets.set(key, [hex])
    },

    crowded(hex: Axial): boolean {
      const [bq, br] = bucketOf(hex)
      for (let dq = -1; dq <= 1; dq++) {
        for (let dr = -1; dr <= 1; dr++) {
          const bucket = buckets.get(`${bq + dq},${br + dr}`)
          if (bucket?.some((other) => distance(hex, other) < spacing)) return true
        }
      }
      return false
    },
  }
}

/**
 * Rolls every hex of the world against its terrain's odds and keeps a hit only
 * if nothing already stands within the spacing. Every hex spends one roll
 * whether or not its terrain is looked at, so the outcome rests on the seed
 * alone, and the terrain of a hex that missed the best odds going is never
 * worked out.
 */
export function scatterResources(
  field: TerrainField,
  { chances, spacing, seed, existing = [], newId = () => crypto.randomUUID() }: ResourceGenOptions,
): Resource[] {
  const random = mulberry32(seed)
  const best = Math.max(...Object.values(chances))
  const grid = spacing > 0 ? createSpacingGrid(spacing) : null
  for (const one of existing) grid?.add(parseKey(one.hex))

  const made: Resource[] = []
  for (const hex of range(ORIGIN, field.radius)) {
    const roll = random()
    if (roll >= best || grid?.crowded(hex)) continue

    const tile = field.at(hex)
    if (!tile || roll >= chances[tile.terrain]) continue

    const kinds = TERRAIN_RESOURCES[tile.terrain]
    const type = kinds[Math.floor(random() * kinds.length)]
    grid?.add(hex)
    made.push({ id: newId(), hex: hexKey(hex), type, origin: 'generated' })
  }
  return made
}
