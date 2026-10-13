import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import type { Scene } from '@babylonjs/core/scene'
import { hexKey, type Axial } from '../hex/coords'
import { hexToWorld, type Layout } from '../hex/layout'
import {
  createPartyToken,
  type PartyToken,
  type PartyTokenOptions,
  type TokenShape,
} from './partyToken'

/** One entity as the map draws it: who it is, where it stands, its colour. */
export interface TokenEntry {
  id: string
  hex: Axial | null
  color: string
  shape: TokenShape
  /** The caravan it is riding in, which hides it from the board. */
  inside: string | null
}

export interface TokenField {
  /** The whole cast at once: new entities appear, departed ones are dropped. */
  setEntries(entries: readonly TokenEntry[]): void
  /** Moves one token on its own, which is what the turn playback walks. */
  place(id: string, hex: Axial | null): void
  /** Leaps one token onto the next hex, the step a played turn is made of. */
  hop(id: string, hex: Axial, seconds?: number): void
  /** Shrinks one token into a caravan's, after which it is off the board. */
  board(id: string, caravanId: string, seconds?: number): void
  /** Grows one token back out of a caravan's onto the hex it climbs out on. */
  alight(id: string, caravanId: string, hex: Axial, seconds?: number): void
  /** Whether any token stands on the map; one that does is always bobbing. */
  readonly bobbing: boolean
  /** Whether any token is in the air between two hexes. */
  readonly hopping: boolean
  dispose(): void
}

// Babylon wants linear floats, the store keeps the colour the panel shows.
const colorOf = (css: string): Color3 => Color3.FromHexString(css)

/** How far up a caravan's pawn its door is, as a fraction of the hex size. */
const DOOR_HEIGHT = 0.4

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
  // What each token was built as; a change of either means building it again.
  const looks = new Map<string, string>()

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

  const tokenFor = (id: string, color: string, shape: TokenShape): PartyToken => {
    const look = `${shape} ${color}`
    const known = tokens.get(id)
    if (known && looks.get(id) === look) return known

    // A recoloured or reshaped entity is a new token: the mesh and material are
    // built with both, and there is no cheaper way in than making it again.
    known?.dispose()
    const made = createPartyToken(scene, layout, elevationOf, {
      ...options,
      color: colorOf(color),
      shape,
    })
    tokens.set(id, made)
    looks.set(id, look)
    return made
  }

  /**
   * Where a rider goes in or comes out: the caravan's pawn as it stands, or,
   * with no caravan drawn to climb into, wherever the rider itself is.
   */
  const doorOf = (caravanId: string): Vector3 | null => {
    const caravan = tokens.get(caravanId)
    if (!caravan?.hex) return null
    const { position, scaling } = caravan.mesh
    return new Vector3(position.x, position.y + layout.size * DOOR_HEIGHT * scaling.y, position.z)
  }

  return {
    setEntries(entries): void {
      const living = new Set(entries.map((entry) => entry.id))
      for (const [id, token] of tokens) {
        if (living.has(id)) continue
        token.dispose()
        tokens.delete(id)
        looks.delete(id)
        where.delete(id)
      }

      for (const entry of entries) {
        const hex = entry.inside ? null : entry.hex
        tokenFor(entry.id, entry.color, entry.shape).setHex(hex)
        heading(entry.id, hex)
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

    board(id, caravanId, seconds): void {
      const token = tokens.get(id)
      if (!token) return
      // The rider leaves the crowd first, so the caravan is already standing in
      // its own place when the rider is aimed at it.
      heading(id, null)
      recrowd()
      token.tuckInto(doorOf(caravanId) ?? token.mesh.position, seconds)
    },

    alight(id, caravanId, hex, seconds): void {
      const token = tokens.get(id)
      if (!token) return
      const door = doorOf(caravanId)
      const world = hexToWorld(layout, hex)
      token.emergeFrom(door ?? new Vector3(world.x, elevationOf(hex), world.z), hex, seconds)
      heading(id, hex)
      recrowd()
    },

    get bobbing() {
      for (const token of tokens.values()) if (token.hex) return true
      return false
    },

    get hopping() {
      for (const token of tokens.values()) if (token.hopping) return true
      return false
    },

    dispose(): void {
      for (const token of tokens.values()) token.dispose()
      tokens.clear()
      looks.clear()
      where.clear()
    },
  }
}
