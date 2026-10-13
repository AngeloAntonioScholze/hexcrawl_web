import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder'
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder'
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder'
import type { Scene } from '@babylonjs/core/scene'
import type { Axial } from '../hex/coords'
import { hexToWorld, type Layout } from '../hex/layout'

/** What a token is carved as: a pawn for whoever walks, a wagon or a boat for a carrier. */
export type TokenShape = 'pawn' | 'wagon' | 'boat'

export interface PartyToken {
  mesh: Mesh
  hex: Axial | null
  /** Moves the pawn onto a hex, or hides it when given null. */
  setHex(hex: Axial | null): void
  /** Leaps to the next hex in an arc, the way a piece is played onto a board. */
  hopTo(hex: Axial, seconds?: number): void
  /** Shrinks away into a point and is gone, the way a party climbs into a caravan. */
  tuckInto(point: Vector3, seconds?: number): void
  /** Grows out of a point onto a hex, the way a party climbs out of a caravan. */
  emergeFrom(point: Vector3, hex: Axial, seconds?: number): void
  /**
   * Which of how many share this hex. Anything past the first stands the pawns
   * side by side and shrinks them, so a hex full of entities reads as a crowd
   * rather than as one pawn hiding the rest.
   */
  setCrowd(index: number, of: number): void
  /** True while a leap is still in the air. */
  hopping: boolean
  /** Advances the hover cycle; driven by the render loop. */
  advanceBob(seconds: number): void
  dispose(): void
}

export interface PartyTokenOptions {
  /** Overall pawn height, as a fraction of the hex size. */
  height?: number
  /** Clearance above the tile it stands on, as a fraction of the hex size. */
  lift?: number
  /** Height of the hover cycle, as a fraction of the hex size. */
  bob?: number
  /** Seconds for one full hover cycle. */
  bobPeriod?: number
  /** How far from the middle a crowded pawn stands, as a fraction of the size. */
  crowdRadius?: number
  /** Height of the leap between hexes, as a fraction of the hex size. */
  arc?: number
  /** Seconds the leap between two hexes takes. */
  hopSeconds?: number
  /** Seconds climbing into or out of a caravan takes. */
  boardSeconds?: number
  color?: Color3
  shape?: TokenShape
}

const DEFAULTS = {
  height: 1.05,
  lift: 0.02,
  bob: 0.05,
  bobPeriod: 2.6,
  crowdRadius: 0.42,
  arc: 0.75,
  hopSeconds: 0.3,
  boardSeconds: 0.45,
} as const

// Cyan: no terrain band sits near it, and it reads apart from the amber trail
// and orange arrows it stands on top of.
const PARTY_COLOR = new Color3(0.35, 0.85, 0.95)

// Six sides so the pawn shares the silhouette language of the tiles under it.
const SIDES = 6

/** However full a hex gets, a pawn never shrinks past this much of itself. */
const MIN_CROWD_SCALE = 0.45

/** A carrier is a bigger thing on the board than anyone walking beside it. */
const WAGON_SCALE = 1.5

/** How wide a caravan token's plinth is across its base, as a fraction of the hex size. */
export const CARAVAN_WIDTH = DEFAULTS.height * WAGON_SCALE * 1.05

/** How small a pawn gets as it disappears into a caravan, or starts coming out of one. */
const TUCKED_SCALE = 0.05

/** Climbing in or out is a short step up, not a full leap across a hex. */
const BOARD_ARC = 0.4

/**
 * A pawn: hex plinth, tapered body, round head. Built as one merged mesh so it
 * costs a single draw call and moves as a unit.
 */
function buildPawn(scene: Scene, height: number): Mesh {
  const plinth = CreateCylinder(
    'partyPlinth',
    {
      height: height * 0.2,
      diameterTop: height * 0.56,
      diameterBottom: height * 0.74,
      tessellation: SIDES,
    },
    scene,
  )
  plinth.position.y = height * 0.1

  const body = CreateCylinder(
    'partyBody',
    {
      height: height * 0.58,
      diameterTop: height * 0.16,
      diameterBottom: height * 0.5,
      tessellation: SIDES,
    },
    scene,
  )
  body.position.y = height * 0.49

  const head = CreateSphere('partyHead', { diameter: height * 0.3, segments: 8 }, scene)
  head.position.y = height * 0.85

  const merged = Mesh.MergeMeshes([plinth, body, head], true, true)
  if (!merged) throw new Error('failed to merge the party token meshes')
  merged.name = 'partyToken'
  return merged
}

/**
 * A covered wagon on the same hex plinth a pawn stands on: four wheels, a bed,
 * a round canvas top and the tongue it is drawn by, facing along +x. Merged
 * into one mesh like the pawn, so a caravan costs no more to draw.
 */
function buildWagon(scene: Scene, height: number): Mesh {
  const plinth = CreateCylinder(
    'wagonPlinth',
    {
      height: height * 0.1,
      diameterTop: height * 0.9,
      diameterBottom: height * 1.05,
      tessellation: SIDES,
    },
    scene,
  )
  plinth.position.y = height * 0.05

  const wheels = [-1, 1].flatMap((x) =>
    [-1, 1].map((z) => {
      const wheel = CreateCylinder(
        'wagonWheel',
        { height: height * 0.06, diameter: height * 0.3, tessellation: 12 },
        scene,
      )
      wheel.rotation.x = Math.PI / 2
      wheel.position.set(x * height * 0.24, height * 0.25, z * height * 0.22)
      return wheel
    }),
  )

  const bed = CreateBox(
    'wagonBed',
    { width: height * 0.78, height: height * 0.18, depth: height * 0.38 },
    scene,
  )
  bed.position.y = height * 0.33

  // A whole cylinder laid along the bed: its lower half sinks into the bed, so
  // only the arch of the canvas shows.
  const cover = CreateCylinder(
    'wagonCover',
    { height: height * 0.66, diameter: height * 0.36, tessellation: 14 },
    scene,
  )
  cover.rotation.z = Math.PI / 2
  cover.position.y = height * 0.42

  const tongue = CreateBox(
    'wagonTongue',
    { width: height * 0.26, height: height * 0.04, depth: height * 0.05 },
    scene,
  )
  tongue.position.set(height * 0.52, height * 0.27, 0)

  const merged = Mesh.MergeMeshes([plinth, ...wheels, bed, cover, tongue], true, true)
  if (!merged) throw new Error('failed to merge the caravan token meshes')
  merged.name = 'partyToken'
  return merged
}

/**
 * A boat on the same hex plinth: a hull with a pointed bow, a mast and one
 * square sail, facing along +x like the wagon so it turns the same way.
 */
function buildBoat(scene: Scene, height: number): Mesh {
  const plinth = CreateCylinder(
    'boatPlinth',
    {
      height: height * 0.1,
      diameterTop: height * 0.9,
      diameterBottom: height * 1.05,
      tessellation: SIDES,
    },
    scene,
  )
  plinth.position.y = height * 0.05

  const hull = CreateBox(
    'boatHull',
    { width: height * 0.56, height: height * 0.16, depth: height * 0.32 },
    scene,
  )
  hull.position.set(-height * 0.06, height * 0.18, 0)

  // A three-sided cylinder is a prism with one corner on +x: its flat back sits
  // against the hull's front and that corner is the stem.
  const bow = CreateCylinder(
    'boatBow',
    { height: height * 0.16, diameter: height * 0.37, tessellation: 3 },
    scene,
  )
  bow.position.set(height * 0.31, height * 0.18, 0)

  const mast = CreateCylinder(
    'boatMast',
    { height: height * 0.62, diameter: height * 0.04, tessellation: SIDES },
    scene,
  )
  mast.position.set(-height * 0.04, height * 0.55, 0)

  const sail = CreateBox(
    'boatSail',
    { width: height * 0.04, height: height * 0.36, depth: height * 0.4 },
    scene,
  )
  sail.position.set(-height * 0.02, height * 0.58, 0)

  const merged = Mesh.MergeMeshes([plinth, hull, bow, mast, sail], true, true)
  if (!merged) throw new Error('failed to merge the ship token meshes')
  merged.name = 'partyToken'
  return merged
}

const BUILDERS: Readonly<Record<TokenShape, (scene: Scene, height: number) => Mesh>> = {
  pawn: buildPawn,
  wagon: (scene, height) => buildWagon(scene, height * WAGON_SCALE),
  boat: (scene, height) => buildBoat(scene, height * WAGON_SCALE),
}

export function createPartyToken(
  scene: Scene,
  layout: Layout,
  elevationOf: (hex: Axial) => number,
  options: PartyTokenOptions = {},
): PartyToken {
  const height = layout.size * (options.height ?? DEFAULTS.height)
  const lift = layout.size * (options.lift ?? DEFAULTS.lift)
  const bobHeight = layout.size * (options.bob ?? DEFAULTS.bob)
  const bobPeriod = options.bobPeriod ?? DEFAULTS.bobPeriod
  const crowdRadius = layout.size * (options.crowdRadius ?? DEFAULTS.crowdRadius)
  const arcHeight = layout.size * (options.arc ?? DEFAULTS.arc)
  const hopSeconds = options.hopSeconds ?? DEFAULTS.hopSeconds
  const boardSeconds = options.boardSeconds ?? DEFAULTS.boardSeconds
  const color = options.color ?? PARTY_COLOR
  const shape = options.shape ?? 'pawn'

  const mesh = BUILDERS[shape](scene, height)
  mesh.isPickable = false

  const material = new StandardMaterial('partyToken', scene)
  material.diffuseColor = color
  material.emissiveColor = color.scale(0.3)
  material.specularColor = Color3.Black()
  mesh.material = material

  let hex: Axial | null = null
  let baseY = 0
  let phase = 0
  let crowd = { index: 0, of: 1 }

  /**
   * Where in its hex the pawn stands: dead centre on its own, and otherwise on
   * a ring around it, evenly spaced with whoever else is standing there.
   */
  const offset = (): { x: number; z: number } => {
    if (crowd.of < 2) return { x: 0, z: 0 }
    const angle = (crowd.index / crowd.of) * Math.PI * 2
    return { x: Math.sin(angle) * crowdRadius, z: Math.cos(angle) * crowdRadius }
  }

  /** Shared ground means a smaller pawn, down to a floor it never passes. */
  const crowdScale = (): number => Math.max(MIN_CROWD_SCALE, 1 / Math.sqrt(crowd.of))

  const standOn = (on: Axial): Vector3 => {
    const world = hexToWorld(layout, on)
    const shift = offset()
    return new Vector3(world.x + shift.x, elevationOf(on) + lift, world.z + shift.z)
  }

  /**
   * A leap in progress: where it left, where it lands, and how far along. One
   * into or out of a caravan also grows or shrinks on the way, and one into a
   * caravan ends with the pawn gone from the board.
   */
  let leap: {
    from: Vector3
    to: Vector3
    hex: Axial | null
    elapsed: number
    seconds: number
    arc: number
    grow: { from: number; to: number } | null
  } | null = null

  const token: PartyToken = {
    mesh,
    get hex() {
      return hex
    },

    setHex(next): void {
      leap = null
      hex = next ? { q: next.q, r: next.r } : null
      mesh.isVisible = hex !== null
      if (!hex) return

      const stand = standOn(hex)
      baseY = stand.y
      mesh.position.copyFrom(stand)
    },

    setCrowd(index, of): void {
      crowd = { index, of: Math.max(1, of) }
      mesh.scaling.setAll(crowdScale())

      // A pawn told to shuffle up mid-leap lands in its new place rather than
      // on top of whoever it was about to share the hex with.
      if (leap?.hex) leap.to = standOn(leap.hex)
      else if (!leap && hex) token.setHex(hex)
    },

    get hopping() {
      return leap !== null
    },

    // A pawn is picked up and put down, never dragged across the board: the
    // leap is what makes one hex of travel read as a move that was made.
    hopTo(next, seconds = hopSeconds): void {
      if (!hex) {
        token.setHex(next)
        return
      }

      const to = standOn(next)

      // A carrier turns to face where it is going. Hex neighbours lie sixty
      // degrees apart, so its plinth still sits square on the tile it lands on.
      if (shape !== 'pawn') {
        const dx = to.x - mesh.position.x
        const dz = to.z - mesh.position.z
        if (dx * dx + dz * dz > 1e-9) mesh.rotation.y = Math.atan2(-dz, dx)
      }

      leap = {
        from: new Vector3(mesh.position.x, baseY, mesh.position.z),
        to,
        hex: { q: next.q, r: next.r },
        elapsed: 0,
        seconds: Math.max(0.001, seconds),
        arc: arcHeight,
        grow: null,
      }
    },

    tuckInto(point, seconds = boardSeconds): void {
      if (!hex && !leap) return
      leap = {
        from: mesh.position.clone(),
        to: point.clone(),
        hex: null,
        elapsed: 0,
        seconds: Math.max(0.001, seconds),
        arc: layout.size * BOARD_ARC,
        grow: { from: 1, to: TUCKED_SCALE },
      }
    },

    emergeFrom(point, next, seconds = boardSeconds): void {
      hex = null
      mesh.isVisible = true
      mesh.position.copyFrom(point)
      mesh.scaling.setAll(crowdScale() * TUCKED_SCALE)
      leap = {
        from: point.clone(),
        to: standOn(next),
        hex: { q: next.q, r: next.r },
        elapsed: 0,
        seconds: Math.max(0.001, seconds),
        arc: layout.size * BOARD_ARC,
        grow: { from: TUCKED_SCALE, to: 1 },
      }
    },

    advanceBob(seconds): void {
      if (leap) {
        leap.elapsed += seconds
        const t = Math.min(1, leap.elapsed / leap.seconds)

        // Flat interpolation across the ground, a half sine through the air, so
        // the pawn rises leaving one hex and drops onto the next.
        mesh.position.x = leap.from.x + (leap.to.x - leap.from.x) * t
        mesh.position.z = leap.from.z + (leap.to.z - leap.from.z) * t
        mesh.position.y =
          leap.from.y + (leap.to.y - leap.from.y) * t + Math.sin(Math.PI * t) * leap.arc
        if (leap.grow) {
          mesh.scaling.setAll(crowdScale() * (leap.grow.from + (leap.grow.to - leap.grow.from) * t))
        }

        if (t < 1) return

        mesh.scaling.setAll(crowdScale())
        if (!leap.hex) {
          token.setHex(null)
          return
        }

        hex = leap.hex
        baseY = leap.to.y
        leap = null
        phase = 0
      }

      phase = (phase + seconds / bobPeriod) % 1
      mesh.position.y = baseY + Math.sin(phase * Math.PI * 2) * bobHeight
    },

    dispose(): void {
      scene.onBeforeRenderObservable.remove(observer)
      material.dispose()
      mesh.dispose()
    },
  }

  const observer = scene.onBeforeRenderObservable.add(() => {
    token.advanceBob(scene.getEngine().getDeltaTime() / 1000)
  })

  token.setHex(null)
  return token
}
