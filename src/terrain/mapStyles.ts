import { createFbm, smoothstep } from './perlin'
import { createRanges } from './ranges'

export type MapStyle = 'classic' | 'continents' | 'pangaea' | 'archipelago'

export const MAP_STYLE_LABELS: Readonly<Record<MapStyle, string>> = {
  classic: 'classic',
  continents: 'continents',
  pangaea: 'pangaea',
  archipelago: 'archipelago',
}

export const MAP_STYLES = Object.keys(MAP_STYLE_LABELS) as readonly MapStyle[]

/** Bends the raw noise at a point, given relative to the middle of the world. */
export type Shape = (raw: number, x: number, z: number) => number

export interface ShapeOptions {
  seed: number
  /** World units from the middle to the rim; Infinity for a world with none. */
  rim: number
}

// Kept apart from the octave offsets the ground noise uses, so the shape of the
// land is never just the ground noise again.
const SHAPE_SEED = 7919

/**
 * The mask a style lays over the ground noise, with mountain ranges raised
 * across the land it leaves. Classic hands the noise back untouched, which is
 * what keeps every map made before styles on its ground. The others measure
 * from the rim of the world, so a small world and a huge one get the same few
 * continents rather than the huge one getting more.
 */
export function createShape(style: MapStyle, options: ShapeOptions): Shape {
  // A world with no rim has nothing for a shape to be measured against.
  if (style === 'classic' || !Number.isFinite(options.rim)) return (raw) => raw
  const mask = createMask(style, options)
  const ranges = createRanges(options)
  return (raw, x, z) => ranges(mask(raw, x, z), x, z)
}

function createMask(style: Exclude<MapStyle, 'classic'>, options: ShapeOptions): Shape {
  const { rim } = options
  const shape = createFbm(options.seed + SHAPE_SEED, { octaves: 3 })
  const rifts = createFbm(options.seed + SHAPE_SEED * 2, { octaves: 2 })
  // How far out a point stands, 0 in the middle and 1 at the rim.
  const out = (x: number, z: number): number => Math.hypot(x, z) / rim
  // Ocean toward the rim, so no landmass is cut off square by the edge of the world.
  const coast = (d: number): number => 0.8 * smoothstep(0.65, 1, d)

  switch (style) {
    case 'pangaea':
      // One mass rising from the middle; the low noise wobbles its coastline so
      // it reads as a continent rather than a disc.
      return (raw, x, z) => {
        const d = out(x, z)
        const wobble = shape(x / (rim * 0.5), z / (rim * 0.5))
        return raw * 0.7 + 0.25 + wobble * 0.2 - 0.55 * d * d - coast(d)
      }

    case 'continents':
      // Noise at a few blobs across the world lifts the continents; the zero
      // line of a second noise is cut down into the ocean that keeps them apart,
      // or the blobs run into each other and make one mass after all.
      return (raw, x, z) => {
        const d = out(x, z)
        const span = rim * 0.45
        const mass = shape(x / span, z / span)
        const rift = 1 - smoothstep(0, 0.1, Math.abs(rifts(x / span, z / span)))
        return raw * 0.5 + mass * 0.6 + 0.16 - rift * 0.6 - coast(d)
      }

    case 'archipelago':
      // The sea is let in over everything, so only the crests of the noise
      // break the surface; a second, finer noise scatters the crests.
      return (raw, x, z) => {
        const d = out(x, z)
        const span = rim * 0.12
        const scatter = shape(x / span, z / span)
        return raw * 0.6 + scatter * 0.35 - 0.09 - coast(d)
      }
  }
}
