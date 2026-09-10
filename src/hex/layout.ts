import { round, type Axial } from './coords'

// World coordinates are Babylon's ground plane: x right, z forward, y is elevation.
export interface WorldPoint {
  x: number
  z: number
}

export interface Layout {
  size: number
  origin: WorldPoint
}

const SQRT3 = Math.sqrt(3)

export const createLayout = (size: number, origin: WorldPoint = { x: 0, z: 0 }): Layout => {
  if (!(size > 0)) throw new RangeError(`layout size must be > 0, got ${size}`)
  return { size, origin }
}

export const hexToWorld = (layout: Layout, hex: Axial): WorldPoint => ({
  x: layout.size * (SQRT3 * hex.q + (SQRT3 / 2) * hex.r) + layout.origin.x,
  z: layout.size * 1.5 * hex.r + layout.origin.z,
})

export function worldToHex(layout: Layout, point: WorldPoint): Axial {
  const x = (point.x - layout.origin.x) / layout.size
  const z = (point.z - layout.origin.z) / layout.size
  return round({ q: (SQRT3 / 3) * x - z / 3, r: (2 / 3) * z })
}

export function corners(layout: Layout, hex: Axial): WorldPoint[] {
  const center = hexToWorld(layout, hex)
  const result: WorldPoint[] = []
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30)
    result.push({
      x: center.x + layout.size * Math.cos(angle),
      z: center.z + layout.size * Math.sin(angle),
    })
  }
  return result
}

export const hexWidth = (layout: Layout): number => SQRT3 * layout.size

export const hexHeight = (layout: Layout): number => 2 * layout.size
