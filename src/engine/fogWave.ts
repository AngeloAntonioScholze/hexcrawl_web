/** How fast the ring rolls outward, in hexes a millisecond. */
export const WAVE_SPEED = 0.012

/** How many hexes deep the moving band is: a hex rises as the front reaches it and is down again this far behind. */
export const WAVE_BAND = 6

/** How high a hex at the origin is thrown, in world units. */
export const WAVE_PEAK = 3

/** How far out the ring carries before it has faded to nothing, in hexes. */
export const WAVE_REACH = 45

/**
 * How far a hex this many hexes from the origin is raised this long after the
 * wave set off. Only the hexes inside the band behind the front move, each
 * through one half of a sine, and the swell dies away as the ring spreads, so
 * a hex the ring has passed, or never reaches, is at exactly 0.
 */
export function waveLift(distance: number, elapsed: number): number {
  const behind = WAVE_SPEED * elapsed - distance
  if (behind <= 0 || behind >= WAVE_BAND || distance >= WAVE_REACH) return 0
  return WAVE_PEAK * (1 - distance / WAVE_REACH) * Math.sin((Math.PI * behind) / WAVE_BAND)
}

/** Whether the ring has rolled past the farthest hex, or faded out short of it. */
export const waveDone = (elapsed: number, maxDistance: number): boolean =>
  WAVE_SPEED * elapsed >= Math.min(maxDistance, WAVE_REACH) + WAVE_BAND

/** How long after one ring sets off the next may follow: one band behind it. */
export const WAVE_GAP = WAVE_BAND / WAVE_SPEED

/** How many rings may wait their turn at once; hovering back and forth past that adds none. */
export const WAVE_QUEUE = 2

/**
 * When a ring asked for now sets off, given when the rings already rolling or
 * waiting set off: straight away, or one band behind the last so the two roll
 * out as separate swells. Null once the queue is full.
 */
export function nextWaveStart(starts: readonly number[], now: number): number | null {
  const waiting = starts.filter((start) => start > now).length
  if (waiting >= WAVE_QUEUE) return null
  const last = starts.length > 0 ? Math.max(...starts) : -Infinity
  return Math.max(now, last + WAVE_GAP)
}
