/** Frames a second for a map where only the bobbing and spinning are moving. */
export const AMBIENT_FPS = 30

const AMBIENT_MS = 1000 / AMBIENT_FPS

// Display ticks land a little either side of the interval; without the slack a
// 60 Hz display would miss every other ambient frame and draw at 20.
const SLACK_MS = 2

export interface FrameDemand {
  /** Something changed what is drawn, or the view is moving. */
  changed: boolean
  /** Something is animating on its own: a bob, a spin. */
  animating: boolean
  /** Milliseconds since the last frame was drawn. */
  sinceLastFrame: number
}

/**
 * Whether this display tick draws. A change is drawn at once, an ambient
 * animation at its own slower rate, and a still map not at all.
 */
export const wantsFrame = ({ changed, animating, sinceLastFrame }: FrameDemand): boolean =>
  changed || (animating && sinceLastFrame >= AMBIENT_MS - SLACK_MS)
