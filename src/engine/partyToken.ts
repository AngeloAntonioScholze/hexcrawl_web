import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
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
  color?: Color3
}

const DEFAULTS = {
  height: 1.05,
  lift: 0.02,
  bob: 0.05,
  bobPeriod: 2.6,
} as const

// Cyan: no terrain band sits near it, and it reads apart from the amber trail
// and orange arrows it stands on top of.
const PARTY_COLOR = new Color3(0.35, 0.85, 0.95)

// Six sides so the pawn shares the silhouette language of the tiles under it.
const SIDES = 6

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

  const token: PartyToken = {
    mesh,
    get hex() {
      return hex
    },

    setHex(next): void {
      hex = next ? { q: next.q, r: next.r } : null
      mesh.isVisible = hex !== null
      if (!hex) return

      const world = hexToWorld(layout, hex)
      baseY = elevationOf(hex) + lift
      mesh.position.set(world.x, baseY, world.z)
    },

    advanceBob(seconds): void {
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
