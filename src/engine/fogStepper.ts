import type { HexKey } from '../hex/coords'

/** How much of a hex survives once the party has walked on past it. */
export const REMEMBERED = 0.42

/** The part of the grid the fog is painted on. */
export interface FogTarget {
  indexOf(key: HexKey): number | undefined
  setFog(clarity: ReadonlyMap<HexKey, number>): void
  updateFog(changed: ReadonlyMap<HexKey, number>): void
}

export interface FogInput {
  fog: boolean
  visible: ReadonlySet<HexKey>
  /** The keys the grid holds; only these are fogged. */
  windowKeys: readonly HexKey[]
  /** Bumped whenever the window moves, since the keys array itself is reused. */
  windowTick: number
  explored: {
    seen: ReadonlySet<HexKey>
    added: ReadonlySet<HexKey> | null
    /** Ground the players were made to forget since the last answer. */
    lost?: ReadonlySet<HexKey>
    version: number
  }
}

export interface FogStepper {
  paint(target: FogTarget, input: FogInput): void
  /** Forget the last painting, so the next is laid down whole. */
  reset(): void
}

// Everything the party has never seen is buried, and ground it has left behind
// keeps a dimmer copy of itself: the map remembers, the party does not watch.
export const createFogStepper = (): FogStepper => {
  /** The fog as the grid holds it: the fogged hexes alone, clear ones absent. */
  let applied = new Map<HexKey, number>()

  /** What the last painting was drawn against, so the next can step off it. */
  let lit: ReadonlySet<HexKey> = new Set()
  let paintedWindow = -1
  let paintedExplored = 0
  let paintedFog = false

  const wholeFog = (input: FogInput): Map<HexKey, number> => {
    const result = new Map<HexKey, number>()
    if (!input.fog) return result

    // Only the window is drawn, so only the window needs fogging: a fog map over
    // a world of a quarter of a million hexes would be rebuilt on every step.
    for (const key of input.windowKeys) {
      if (input.visible.has(key)) continue
      result.set(key, input.explored.seen.has(key) ? REMEMBERED : 0)
    }
    return result
  }

  /**
   * What one step moved: the ground the party has just lost sight of, the ground
   * it has just come to see, and whatever was laid eyes on elsewhere while it
   * walked. Every other hex in the window already stands as it should, so none of
   * them is looked at — that scan is what made a step cost what the view holds
   * rather than what the party did.
   */
  const fogStep = (
    target: FogTarget,
    visible: ReadonlySet<HexKey>,
    explored: ReadonlySet<HexKey>,
    gained: ReadonlySet<HexKey>,
    lost: ReadonlySet<HexKey>,
  ): Map<HexKey, number> => {
    const changed = new Map<HexKey, number>()
    const held = (key: HexKey): boolean => target.indexOf(key) !== undefined

    for (const key of lit) {
      if (visible.has(key) || !held(key)) continue
      const fade = explored.has(key) ? REMEMBERED : 0
      if (applied.get(key) !== fade) changed.set(key, fade)
    }

    for (const key of visible) if (applied.has(key)) changed.set(key, 1)

    for (const key of gained) {
      if (visible.has(key) || !held(key) || applied.get(key) === REMEMBERED) continue
      changed.set(key, REMEMBERED)
    }

    for (const key of lost) {
      if (visible.has(key) || !held(key) || applied.get(key) === 0) continue
      changed.set(key, 0)
    }

    return changed
  }

  /**
   * A step is only safe to draw as one when the painting before it is the one it
   * follows from: the same window, the same fog setting, and the very next answer
   * out of the explored set. Anything else — a rewind, a new world, a window that
   * moved — is laid down whole.
   */
  const paint = (target: FogTarget, input: FogInput): void => {
    const { fog, visible, windowTick } = input
    const { seen, added, lost, version } = input.explored
    const stepping =
      fog &&
      fog === paintedFog &&
      added !== null &&
      version === paintedExplored + 1 &&
      windowTick === paintedWindow

    if (stepping) {
      const changed = fogStep(target, visible, seen, added, lost ?? new Set())
      if (changed.size > 0) target.updateFog(changed)
      for (const [key, fade] of changed) {
        if (fade === 1) applied.delete(key)
        else applied.set(key, fade)
      }
    } else {
      applied = wholeFog(input)
      target.setFog(applied)
    }

    lit = visible
    paintedExplored = version
    paintedWindow = windowTick
    paintedFog = fog
  }

  return {
    paint,
    reset: () => {
      paintedWindow = -1
    },
  }
}
