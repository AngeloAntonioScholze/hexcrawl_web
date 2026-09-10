import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData'
import '@babylonjs/core/Meshes/thinInstanceMesh'
import type { Scene } from '@babylonjs/core/scene'
import type { Axial } from '../hex/coords'
import { hexToWorld, type Layout } from '../hex/layout'
import { hexCornerOffsets } from './hexPrism'

export interface VisionOverlay {
  lit: Mesh
  shadow: Mesh
  litCount: number
  shadowCount: number
  /** Glazes the hexes in sight and shades the ones the terrain hides. */
  setField(inSight: readonly Axial[], hidden: readonly Axial[]): void
  setShown(shown: boolean): void
  dispose(): void
}

export interface VisionOverlayOptions {
  /** Fraction of the hex radius left empty around each plate. */
  gap?: number
  /** Clearance above the tile the plate lies on. */
  lift?: number
  litColor?: Color3
  shadowColor?: Color3
  litAlpha?: number
  shadowAlpha?: number
}

const DEFAULTS = {
  gap: 0.06,
  lift: 0.05,
  litAlpha: 0.17,
  shadowAlpha: 0.32,
} as const

// Cool light for ground the party has eyes on, warm red for the pockets the
// terrain keeps from it: the two halves of the disc separate at a glance even
// where both lie over the same colour of terrain.
const LIT_COLOR = new Color3(0.55, 0.87, 1)
const SHADOW_COLOR = new Color3(0.95, 0.3, 0.28)

/** A flat hexagon on the XZ plane, wound to face up. */
function buildPlate(scene: Scene, size: number, name: string): Mesh {
  const positions: number[] = [0, 0, 0]
  for (const corner of hexCornerOffsets(size)) positions.push(corner.x, 0, corner.z)

  const indices: number[] = []
  for (let i = 0; i < 6; i++) indices.push(0, 1 + i, 1 + ((i + 1) % 6))

  const normals: number[] = []
  VertexData.ComputeNormals(positions, indices, normals)

  const vertexData = new VertexData()
  vertexData.positions = positions
  vertexData.indices = indices
  vertexData.normals = normals

  const mesh = new Mesh(name, scene)
  vertexData.applyToMesh(mesh)
  mesh.isPickable = false
  return mesh
}

/** Unlit and translucent: the plate glazes the terrain instead of replacing it. */
function glazeMaterial(scene: Scene, name: string, color: Color3, alpha: number): StandardMaterial {
  const material = new StandardMaterial(name, scene)
  material.diffuseColor = Color3.Black()
  material.emissiveColor = color
  material.specularColor = Color3.Black()
  material.disableLighting = true
  material.backFaceCulling = false
  material.alpha = alpha
  return material
}

export function createVisionOverlay(
  scene: Scene,
  layout: Layout,
  elevationOf: (hex: Axial) => number,
  options: VisionOverlayOptions = {},
): VisionOverlay {
  const gap = options.gap ?? DEFAULTS.gap
  const lift = options.lift ?? DEFAULTS.lift
  const size = layout.size * (1 - gap)

  const lit = buildPlate(scene, size, 'visionLit')
  const shadow = buildPlate(scene, size, 'visionShadow')

  const litMaterial = glazeMaterial(
    scene,
    'visionLit',
    options.litColor ?? LIT_COLOR,
    options.litAlpha ?? DEFAULTS.litAlpha,
  )
  const shadowMaterial = glazeMaterial(
    scene,
    'visionShadow',
    options.shadowColor ?? SHADOW_COLOR,
    options.shadowAlpha ?? DEFAULTS.shadowAlpha,
  )
  lit.material = litMaterial
  shadow.material = shadowMaterial

  const scaling = Vector3.One()
  const translation = Vector3.Zero()

  let litCount = 0
  let shadowCount = 0
  let shown = false

  const lay = (mesh: Mesh, hexes: readonly Axial[]): number => {
    const matrices = new Float32Array(hexes.length * 16)

    hexes.forEach((hex, index) => {
      const world = hexToWorld(layout, hex)
      translation.set(world.x, elevationOf(hex) + lift, world.z)
      Matrix.Compose(scaling, Quaternion.Identity(), translation).copyToArray(matrices, index * 16)
    })

    mesh.thinInstanceSetBuffer('matrix', matrices, 16, false)
    return hexes.length
  }

  const applyVisibility = (): void => {
    lit.isVisible = shown && litCount > 0
    shadow.isVisible = shown && shadowCount > 0
  }

  const overlay: VisionOverlay = {
    lit,
    shadow,
    get litCount() {
      return litCount
    },
    get shadowCount() {
      return shadowCount
    },

    setField(inSight, hidden): void {
      litCount = lay(lit, inSight)
      shadowCount = lay(shadow, hidden)
      applyVisibility()
    },

    setShown(next): void {
      shown = next
      applyVisibility()
    },

    dispose(): void {
      litMaterial.dispose()
      shadowMaterial.dispose()
      lit.dispose()
      shadow.dispose()
    },
  }

  overlay.setField([], [])
  return overlay
}
