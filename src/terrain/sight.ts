import { hexKey, type Axial, type HexKey } from '../hex/coords'
import { fieldOfView, type VisionOptions } from '../hex/vision'
import type { TerrainField } from './field'

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
  field: TerrainField,
  origin: Axial,
  options: VisionOptions = {},
): PartySight {
  const elevationOf = (hex: Axial): number | undefined => field.at(hex)?.level
  const seen = fieldOfView(origin, elevationOf, options)

  return {
    radius: seen.radius,
    visible: new Set(seen.visible.map(hexKey)),
    blocked: new Set(seen.blocked.map(hexKey)),
  }
}
