import { Color3 } from '@babylonjs/core/Maths/math.color'
import type { Scene } from '@babylonjs/core/scene'
import { hexKey, type Axial } from '../hex/coords'
import type { Layout } from '../hex/layout'
import { createPartyToken, type PartyToken, type PartyTokenOptions } from './partyToken'

/** One entity as the map draws it: who it is, where it stands, its colour. */
export interface TokenEntry {
  id: string
  hex: Axial | null
  color: string
}

export interface TokenField {
  /** The whole cast at once: new entities appear, departed ones are dropped. */
  setEntries(entries: readonly TokenEntry[]): void
  /** Moves one token on its own, which is what the turn playback walks. */
  place(id: string, hex: Axial | null): void
  /** Leaps one token onto the next hex, the step a played turn is made of. */
  hop(id: string, hex: Axial, seconds?: number): void
  dispose(): void
}

// Babylon wants linear floats, the store keeps the colour the panel shows.
const colorOf = (css: string): Color3 => Color3.FromHexString(css)

/**
 * Every entity on the map at once, each in its own colour, rather than one pawn
 * standing in for whoever happens to be selected. Tokens are kept by id, so a
 * party that has not moved is left exactly where it was.
 */
export function createTokenField(
  scene: Scene,
  layout: Layout,
  elevationOf: (hex: Axial) => number,
  options: PartyTokenOptions = {},
): TokenField {
  const tokens = new Map<string, PartyToken>()
  const colors = new Map<string, string>()

  // Where each token is headed, which is the hex it counts as standing on even
  // while it is still in the air on its way there.
  const where = new Map<string, string>()

  /**
   * Shares out every hex that has more than one token on it, so the pawns stand
   * side by side and shrink to fit instead of one burying the others.
   */
  const recrowd = (): void => {
    const sharing = new Map<string, string[]>()
    for (const [id, key] of where) {
      if (!key) continue
      const standing = sharing.get(key) ?? []
      standing.push(id)
      sharing.set(key, standing)
    }

    for (const ids of sharing.values()) {
      ids.forEach((id, index) => tokens.get(id)?.setCrowd(index, ids.length))
    }
  }

  const heading = (id: string, hex: Axial | null): void => {
    where.set(id, hex ? hexKey(hex) : '')
  }

  const tokenFor = (id: string, color: string): PartyToken => {
    const known = tokens.get(id)
    if (known && colors.get(id) === color) return known

    // A recoloured entity is a new pawn: the material is built with the colour
    // and there is no cheaper way in than making it again.
    known?.dispose()
    const made = createPartyToken(scene, layout, elevationOf, { ...options, color: colorOf(color) })
    tokens.set(id, made)
    colors.set(id, color)
    return made
  }

  return {
    setEntries(entries): void {
      const living = new Set(entries.map((entry) => entry.id))
      for (const [id, token] of tokens) {
        if (living.has(id)) continue
        token.dispose()
        tokens.delete(id)
        colors.delete(id)
        where.delete(id)
      }

      for (const entry of entries) {
        tokenFor(entry.id, entry.color).setHex(entry.hex)
        heading(entry.id, entry.hex)
      }
      recrowd()
    },

    place(id, hex): void {
      tokens.get(id)?.setHex(hex)
      heading(id, hex)
      recrowd()
    },

    hop(id, hex, seconds): void {
      tokens.get(id)?.hopTo(hex, seconds)
      heading(id, hex)
      recrowd()
    },

    dispose(): void {
      for (const token of tokens.values()) token.dispose()
      tokens.clear()
      colors.clear()
      where.clear()
    },
  }
}
