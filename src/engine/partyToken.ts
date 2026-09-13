import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import '@babylonjs/core/Meshes/Builders/cylinderBuilder'
import '@babylonjs/core/Meshes/Builders/sphereBuilder'
import type { Scene } from '@babylonjs/core/scene'
import type { Axial } from '../hex/coords'
import { hexToWorld, type Layout } from '../hex/layout'

export interface PartyToken {
  mesh: Mesh
  hex: Axial | null
  /** Moves the pawn onto a hex, or hides it when given null. */
  setHex(hex: Axial | null): void
  /** Leaps to the next hex in an arc, the way a piece is played onto a board. */
  hopTo(hex: Axial, seconds?: number): void
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
  color?: Color3
}

const DEFAULTS = {
  height: 1.05,
  lift: 0.02,
  bob: 0.05,
  bobPeriod: 2.6,
  crowdRadius: 0.42,
  arc: 0.75,
  hopSeconds: 0.3,
} as const

// Cyan: no terrain band sits near it, and it reads apart from the amber trail
// and orange arrows it stands on top of.
const PARTY_COLOR = new Color3(0.35, 0.85, 0.95)

// Six sides so the pawn shares the silhouette language of the tiles under it.
const SIDES = 6

/** However full a hex gets, a pawn never shrinks past this much of itself. */
const MIN_CROWD_SCALE = 0.45

/**
 * A pawn: hex plinth, tapered body, round head. Built as one merged mesh so it
 * costs a single draw call and moves as a unit.
 */
function buildPawn(scene: Scene, height: number): Mesh {
  const plinth = MeshBuilder.CreateCylinder(
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

  const body = MeshBuilder.CreateCylinder(
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

  const head = MeshBuilder.CreateSphere('partyHead', { diameter: height * 0.3, segments: 8 }, scene)
  head.position.y = height * 0.85

  const merged = Mesh.MergeMeshes([plinth, body, head], true, true)
  if (!merged) throw new Error('failed to merge the party token meshes')
  merged.name = 'partyToken'
  return merged
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
  const color = options.color ?? PARTY_COLOR

  const mesh = buildPawn(scene, height)
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

  /** A leap in progress: where it left, where it lands, and how far along. */
  let leap: { from: Vector3; to: Vector3; hex: Axial; elapsed: number; seconds: number } | null =
    null

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
      if (leap) leap.to = standOn(leap.hex)
      else if (hex) token.setHex(hex)
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

      leap = {
        from: new Vector3(mesh.position.x, baseY, mesh.position.z),
        to: standOn(next),
        hex: { q: next.q, r: next.r },
        elapsed: 0,
        seconds: Math.max(0.001, seconds),
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
          leap.from.y + (leap.to.y - leap.from.y) * t + Math.sin(Math.PI * t) * arcHeight

        if (t < 1) return

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
