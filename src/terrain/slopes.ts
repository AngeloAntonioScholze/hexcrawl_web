import { DIRECTIONS, type Axial } from '../hex/coords'

/**
 * The step a hex settles on once the ground around it has been let down
 * gently: never above its own raw step, and never more than one step above
 * any hex beside it. Taking the lowest of raw(n) + distance over the
 * neighbourhood is what makes it so, and is also what rings a summit with
 * terraces, one step lower per hex, until the slope meets ground that was
 * already lower.
 *
 * It stays a function of the hex alone, so the field can still build any
 * corner of the world without the rest. Ground further off than the raw step
 * can never pull the hex down, so the search stops there and is bounded by
 * the highest step.
 */
export function settledLevel(hex: Axial, rawLevel: (q: number, r: number) => number): number {
  let best = rawLevel(hex.q, hex.r)

  for (let ring = 1; ring < best; ring++) {
    // Walks the ring the usual way: out along one direction, then round all six sides.
    let q = hex.q + DIRECTIONS[4].q * ring
    let r = hex.r + DIRECTIONS[4].r * ring
    for (let side = 0; side < 6; side++) {
      const step = DIRECTIONS[side]
      for (let i = 0; i < ring; i++) {
        best = Math.min(best, rawLevel(q, r) + ring)
        q += step.q
        r += step.r
      }
    }
  }

  return best
}
