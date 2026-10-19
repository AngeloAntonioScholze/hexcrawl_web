import { createFbm, createPerlin, smoothstep } from './perlin'

/** Lifts shaped ground at a point, given relative to the middle of the world. */
export type Ranges = (shaped: number, x: number, z: number) => number

export interface RangesOptions {
  seed: number
  /** World units from the middle to the rim. */
  rim: number
}

// Apart from the shape's own seeds, so the ridges never trace its coastlines.
const RANGES_SEED = 104729

// Ground away from a range is eased toward this and never climbs past it, so
// the noise's own highs settle into hill country below the mountains.
const LOWLAND = 0.3
// How high a range stands above the ground it crosses.
const LIFT = 0.7
// World units from the line of a range to its foot.
const HALF_WIDTH = 16
// Noise units the slope is measured across.
const STEP = 0.002

/**
 * Mountain ranges along the zero lines of a low noise. Plain noise heaps its
 * highs into round blobs, but the line where a noise crosses zero runs on and
 * winds, so ground lifted along that line rises in long chains. How far a
 * point stands from the line is read off the noise and its slope rather than
 * off the noise alone: where the noise lingers near zero a fold of it would
 * swell into a blob, and the distance keeps every range the same width.
 *
 * The blobs the ground noise made are eased down toward hill country first,
 * or they stand as mountains of their own and the chains are lost among them.
 */
export function createRanges(options: RangesOptions): Ranges {
  const { rim } = options
  const spine = createPerlin(options.seed + RANGES_SEED)
  const warp = createFbm(options.seed + RANGES_SEED * 2, { octaves: 2 })
  const belts = createFbm(options.seed + RANGES_SEED * 3, { octaves: 2 })
  const crests = createFbm(options.seed + RANGES_SEED * 4, { octaves: 2 })
  // Measured from the rim like the shapes, so a world of any size gets about
  // as many ranges; the width stays in world units, so a range is always a
  // few hexes across.
  const span = rim * 0.5
  const reach = HALF_WIDTH / span

  return (shaped, x, z) => {
    if (shaped <= 0) return shaped
    // Bent by a second noise so the chains wander instead of tracing the
    // noise's own grid. The slope is taken in the bent space alone, which is
    // near enough for a bend this gentle and spares sampling the bend again.
    const u = x / span
    const v = z / span
    const s = u + warp(u, v) * 0.6
    const t = v + warp(v + 31.7, u - 17.3) * 0.6
    const here = spine(s, t)
    const slope = Math.hypot(spine(s + STEP, t) - here, spine(s, t + STEP) - here) / STEP
    const across = Math.abs(here) / Math.max(slope, 1e-6) / reach
    const ridge = across >= 1 ? 0 : Math.pow(1 - across, 1.5)
    // Only some of the lines are raised, so the ranges stand apart, and the
    // crest rises and dips along each one into peaks and passes.
    const belt = smoothstep(-0.35, -0.05, belts(x / (rim * 0.7), z / (rim * 0.7)))
    const crest = 0.65 + 0.35 * crests(u * 6, v * 6)
    // Ground near the shore takes little of the lift, so the coast stays where
    // the shape put it.
    const inland = smoothstep(0, 0.15, shaped)
    const eased = (shaped * LOWLAND) / (LOWLAND + shaped)
    return eased + ridge * belt * crest * inland * LIFT
  }
}
