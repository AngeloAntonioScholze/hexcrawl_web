import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector'
import type { Mesh } from '@babylonjs/core/Meshes/mesh'
// Thin instancing is an augmentation module: without it Mesh has no
// thinInstance* members at all under per-module imports.
import '@babylonjs/core/Meshes/thinInstanceMesh'
import type { Scene } from '@babylonjs/core/scene'
import { hexKey, type Axial, type HexKey } from '../hex/coords'
import { hexToWorld, type Layout } from '../hex/layout'
import { createHexPrismMesh } from './hexPrism'

export interface HexTile {
  hex: Axial
  elevation: number
  color: Color3
}

export interface HexGridOptions {
  /** Fraction of the hex radius left empty around each tile, drawing the border. */
  gap?: number
  /** Radius of the rounded top edge, as a fraction of the hex size. */
  bevel?: number
}

export interface HexGrid {
  mesh: Mesh
  count: number
  indexOf(key: HexKey): number | undefined
  hexAt(index: number): Axial | undefined
  colorAt(index: number): [number, number, number, number]
  /** Replaces every tinted hex at once; anything absent returns to its terrain colour. */
  setOverlay(overlay: ReadonlyMap<HexKey, Color3>): void
  dispose(): void
}

const MIN_ELEVATION = 0.05
const DEFAULT_GAP = 0.06

export function createHexGrid(
  scene: Scene,
  layout: Layout,
  tiles: HexTile[],
  options: HexGridOptions = {},
): HexGrid {
  // Tiles are drawn slightly smaller than their layout cell; the sliver of dark
  // ground left between neighbours is the border.
  const gap = options.gap ?? DEFAULT_GAP
  const mesh = createHexPrismMesh(scene, layout.size * (1 - gap), 'hexGrid', {
    bevel: options.bevel,
  })

  const material = new StandardMaterial('hexGrid', scene)
  material.specularColor = Color3.Black()
  mesh.material = material

  const count = tiles.length
  const matrices = new Float32Array(count * 16)
  const colors = new Float32Array(count * 4)
  const baseColors = new Float32Array(count * 4)
  const indexByKey = new Map<HexKey, number>()
  const hexByIndex: Axial[] = []

  const scaling = Vector3.One()
  const translation = Vector3.Zero()

  tiles.forEach((tile, index) => {
    const world = hexToWorld(layout, tile.hex)
    scaling.set(1, Math.max(MIN_ELEVATION, tile.elevation), 1)
    translation.set(world.x, 0, world.z)
    Matrix.Compose(scaling, Quaternion.Identity(), translation).copyToArray(matrices, index * 16)

    colors.set([tile.color.r, tile.color.g, tile.color.b, 1], index * 4)
    baseColors.set([tile.color.r, tile.color.g, tile.color.b, 1], index * 4)

    const key = hexKey(tile.hex)
    indexByKey.set(key, index)
    hexByIndex.push(tile.hex)
  })

  mesh.thinInstanceSetBuffer('matrix', matrices, 16, true)
  mesh.thinInstanceSetBuffer('color', colors, 4, false)
  mesh.thinInstanceEnablePicking = true

  let overlay = new Map<HexKey, Color3>()

  const writeColor = (index: number, rgba: ArrayLike<number>): void => {
    colors.set(rgba, index * 4)
  }

  const restore = (key: HexKey): void => {
    const index = indexByKey.get(key)
    if (index === undefined) return
    writeColor(index, baseColors.subarray(index * 4, index * 4 + 4))
  }

  return {
    mesh,
    count,

    indexOf: (key) => indexByKey.get(key),
    hexAt: (index) => hexByIndex[index],
    colorAt: (index) => [
      colors[index * 4],
      colors[index * 4 + 1],
      colors[index * 4 + 2],
      colors[index * 4 + 3],
    ],

    // Whole-overlay diffing rather than per-hex calls: a traced route touches
    // hundreds of tiles, and the colour buffer should upload once, not per tile.
    setOverlay(next): void {
      let changed = false

      for (const key of overlay.keys()) {
        if (!next.has(key)) {
          restore(key)
          changed = true
        }
      }

      for (const [key, color] of next) {
        const previous = overlay.get(key)
        if (previous && previous.equals(color)) continue
        const index = indexByKey.get(key)
        if (index === undefined) continue
        writeColor(index, [color.r, color.g, color.b, 1])
        changed = true
      }

      overlay = new Map(next)
      if (changed) mesh.thinInstanceBufferUpdated('color')
    },

    dispose(): void {
      material.dispose()
      mesh.dispose()
    },
  }
}
