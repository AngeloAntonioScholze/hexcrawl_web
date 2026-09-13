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
  /** The most hexes the grid will ever hold at once; its buffers are this big. */
  capacity: number
  /** Fraction of the hex radius left empty around each tile, drawing the border. */
  gap?: number
  /** Radius of the rounded top edge, as a fraction of the hex size. */
  bevel?: number
}

export interface HexGrid {
  mesh: Mesh
  /** Hexes drawn right now; never more than the capacity. */
  count: number
  indexOf(key: HexKey): number | undefined
  hexAt(index: number): Axial | undefined
  colorAt(index: number): [number, number, number, number]
  /** Replaces every tinted hex at once; anything absent returns to its terrain colour. */
  setOverlay(overlay: ReadonlyMap<HexKey, Color3>): void
  /**
   * Replaces the fog at once: 1 shows the terrain, 0 buries it under the fog
   * colour. Anything absent is fully clear, so an empty map lifts the fog.
   */
  setFog(clarity: ReadonlyMap<HexKey, number>): void
  /**
   * Puts the grid on a different set of hexes, reusing the same buffers: the
   * window the camera is looking at, or the same window re-terrained. The tint
   * and fog layers ride along, so moving the view does not disturb what the
   * party has been shown.
   */
  setWindow(tiles: readonly HexTile[]): void
  dispose(): void
}

const MIN_ELEVATION = 0.05
const DEFAULT_GAP = 0.06

// Barely above the ground slab, so a hex nobody has seen reads as a hole in the
// map rather than as a dimmed tile whose terrain can still be guessed.
const FOG_COLOR = new Color3(0.055, 0.065, 0.085)

// Tints carry no terrain information, so they stay legible through the fog: a
// route or the hover highlight should not vanish into unexplored ground.
const TINT_CLARITY_FLOOR = 0.6

/**
 * The hexes on screen, drawn as thin instances of one prism. The buffers are
 * allocated once for the widest view the camera allows and then re-keyed as the
 * window moves, so a world of a quarter of a million hexes costs the same to
 * draw as a world of five thousand: only what is in front of the camera is in
 * the grid at all.
 */
export function createHexGrid(scene: Scene, layout: Layout, options: HexGridOptions): HexGrid {
  // Tiles are drawn slightly smaller than their layout cell; the sliver of dark
  // ground left between neighbours is the border.
  const gap = options.gap ?? DEFAULT_GAP
  const capacity = Math.max(1, Math.floor(options.capacity))
  const mesh = createHexPrismMesh(scene, layout.size * (1 - gap), 'hexGrid', {
    bevel: options.bevel,
  })

  const material = new StandardMaterial('hexGrid', scene)
  material.specularColor = Color3.Black()
  mesh.material = material

  const matrices = new Float32Array(capacity * 16)
  const colors = new Float32Array(capacity * 4)
  const baseColors = new Float32Array(capacity * 4)
  const clarity = new Float32Array(capacity).fill(1)
  const indexByKey = new Map<HexKey, number>()
  let hexByIndex: Axial[] = []
  let keyByIndex: HexKey[] = []
  let count = 0

  const scaling = Vector3.One()
  const translation = Vector3.Zero()

  const writeTile = (tile: HexTile, index: number): void => {
    const world = hexToWorld(layout, tile.hex)
    scaling.set(1, Math.max(MIN_ELEVATION, tile.elevation), 1)
    translation.set(world.x, 0, world.z)
    Matrix.Compose(scaling, Quaternion.Identity(), translation).copyToArray(matrices, index * 16)

    baseColors.set([tile.color.r, tile.color.g, tile.color.b, 1], index * 4)
  }

  // Both buffers stay updatable: a static buffer cannot be re-uploaded, so
  // moving the window would rewrite the matrices and never reach the GPU.
  mesh.thinInstanceSetBuffer('matrix', matrices, 16, false)
  mesh.thinInstanceSetBuffer('color', colors, 4, false)
  mesh.thinInstanceEnablePicking = true
  mesh.thinInstanceCount = 0

  let overlay = new Map<HexKey, Color3>()
  let fog = new Map<HexKey, number>()

  // The rendered colour is the tint over the terrain, faded toward the fog by
  // how much of the hex the party has seen. Both layers are kept apart so the
  // hover tint can change on every pointer move without touching the fog.
  const composite = (index: number): void => {
    const tint = overlay.get(keyByIndex[index])
    const fade = tint ? Math.max(clarity[index], TINT_CLARITY_FLOOR) : clarity[index]
    const offset = index * 4

    if (fade === 1) {
      if (tint) colors.set([tint.r, tint.g, tint.b, 1], offset)
      else colors.set(baseColors.subarray(offset, offset + 4), offset)
      return
    }

    const r = tint ? tint.r : baseColors[offset]
    const g = tint ? tint.g : baseColors[offset + 1]
    const b = tint ? tint.b : baseColors[offset + 2]

    colors[offset] = FOG_COLOR.r + (r - FOG_COLOR.r) * fade
    colors[offset + 1] = FOG_COLOR.g + (g - FOG_COLOR.g) * fade
    colors[offset + 2] = FOG_COLOR.b + (b - FOG_COLOR.b) * fade
    colors[offset + 3] = 1
  }

  return {
    mesh,

    get count() {
      return count
    },

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
      const stale: number[] = []

      for (const key of overlay.keys()) {
        if (next.has(key)) continue
        const index = indexByKey.get(key)
        if (index !== undefined) stale.push(index)
      }

      const fresh: number[] = []
      for (const [key, color] of next) {
        const previous = overlay.get(key)
        if (previous && previous.equals(color)) continue
        const index = indexByKey.get(key)
        if (index !== undefined) fresh.push(index)
      }

      overlay = new Map(next)
      for (const index of stale) composite(index)
      for (const index of fresh) composite(index)

      if (stale.length > 0 || fresh.length > 0) mesh.thinInstanceBufferUpdated('color')
    },

    setFog(next): void {
      fog = new Map(next)
      let changed = false

      for (let index = 0; index < count; index++) {
        const fade = fog.get(keyByIndex[index]) ?? 1
        if (fade === clarity[index]) continue
        clarity[index] = fade
        composite(index)
        changed = true
      }

      if (changed) mesh.thinInstanceBufferUpdated('color')
    },

    setWindow(tiles): void {
      if (tiles.length > capacity) {
        throw new RangeError(`the grid holds ${capacity} hexes, given ${tiles.length}`)
      }

      indexByKey.clear()
      hexByIndex = []
      keyByIndex = []
      count = tiles.length

      tiles.forEach((tile, index) => {
        writeTile(tile, index)

        const key = hexKey(tile.hex)
        indexByKey.set(key, index)
        hexByIndex.push(tile.hex)
        keyByIndex.push(key)

        // The fog and the tint belong to the hex, not to the slot it landed in,
        // so both are read back for whatever moved into this one.
        clarity[index] = fog.get(key) ?? 1
        composite(index)
      })

      mesh.thinInstanceCount = count
      mesh.thinInstanceBufferUpdated('matrix')
      mesh.thinInstanceBufferUpdated('color')

      // Picking and culling read the mesh's bounds, and those are worked out
      // from the instance matrices when they are set: a window that moved
      // without this leaves the grid unpickable outside where it used to be.
      mesh.thinInstanceRefreshBoundingInfo(true)
    },

    dispose(): void {
      material.dispose()
      mesh.dispose()
    },
  }
}
