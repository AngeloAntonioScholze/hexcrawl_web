import type { Axial } from '../hex/coords'
import { hexToWorld, worldToHex, type Layout } from '../hex/layout'

interface Point3 {
  x: number
  y: number
  z: number
}

export interface PickRay {
  origin: Point3
  direction: Point3
}

// Finer than the border gap, so a ray clipping a tile's corner is not stepped over.
const SAMPLES_PER_SIZE = 16

const HALF_SQRT3 = Math.sqrt(3) / 2

// Pointy-top: flat sides left and right, corners up and down the z axis.
function insideTile(layout: Layout, hex: Axial, x: number, z: number, size: number): boolean {
  const centre = hexToWorld(layout, hex)
  const dx = Math.abs(x - centre.x)
  const dz = Math.abs(z - centre.z)
  return dx <= size * HALF_SQRT3 && dx * 0.5 + dz * HALF_SQRT3 <= size * HALF_SQRT3
}

/**
 * The first hex whose prism a downward ray enters, found by walking the ray
 * from the height of the tallest prism down to the ground and rounding each
 * sample to a hex. A y=0 cast alone would land up to two hexes behind a
 * mountain at the map's lean; this stays O(length of that walk), not O(window).
 * The border gap between tiles is not part of any tile, as with scene.pick.
 */
export function hexUnderRay(
  layout: Layout,
  ray: PickRay,
  heightOf: (hex: Axial) => number | undefined,
  tallest: number,
  tileSize: number,
): Axial | null {
  const { origin, direction } = ray
  if (!(direction.y < 0)) return null

  const start = Math.max(0, (tallest - origin.y) / direction.y)
  const end = -origin.y / direction.y
  if (end < start) return null

  const run = (end - start) * Math.hypot(direction.x, direction.z)
  const steps = Math.max(1, Math.ceil((run * SAMPLES_PER_SIZE) / layout.size))

  for (let i = 0; i <= steps; i++) {
    const t = start + ((end - start) * i) / steps
    const x = origin.x + direction.x * t
    const z = origin.z + direction.z * t
    const hex = worldToHex(layout, { x, z })
    const height = heightOf(hex)
    if (height === undefined || origin.y + direction.y * t > height) continue
    if (insideTile(layout, hex, x, z, tileSize)) return hex
  }

  return null
}
