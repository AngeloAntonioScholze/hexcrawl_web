import { hexKey, type Axial, type HexKey } from '../hex/coords'
import { fieldOfView, type VisionOptions } from '../hex/vision'
import type { TerrainTile } from './terrain'

export interface PartySight {
  radius: number
  visible: Set<HexKey>
  blocked: Set<HexKey>
}

/**
 * What the party sees and what the terrain hides, keyed for the fog layer.
 * Sight reads the mechanical level, not the rendered height: a hex blocks the
 * view when it stands a whole step above the line, not when the noise happens
 * to have nudged it up a fraction.
 */
export function sightFrom(
  tiles: ReadonlyMap<HexKey, TerrainTile>,
  origin: Axial,
  options: VisionOptions = {},
): PartySight {
  const elevationOf = (hex: Axial): number | undefined => tiles.get(hexKey(hex))?.level
  const field = fieldOfView(origin, elevationOf, options)

  return {
    radius: field.radius,
    visible: new Set(field.visible.map(hexKey)),
    blocked: new Set(field.blocked.map(hexKey)),
  }
}
