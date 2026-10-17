import { Material } from '@babylonjs/core/Materials/material'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import type { Mesh } from '@babylonjs/core/Meshes/mesh'
// Thin instancing is an augmentation module: without it Mesh has no
// thinInstance* members at all under per-module imports.
import '@babylonjs/core/Meshes/thinInstanceMesh'
import type { Scene } from '@babylonjs/core/scene'
import { hexKey, type Axial, type HexKey } from '../hex/coords'
import { hexToWorld, type Layout } from '../hex/layout'
import { bevelRadius, createHexPrismMesh } from './hexPrism'

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
  /** Which of the camera's layers the grid is drawn on. */
  layerMask?: number
  /**
   * Told of each hex a fog update brings out from under the fog, with the top
   * of the ground now showing there: the cue for the fog to be seen lifting.
   */
  onReveal?: (x: number, top: number, z: number) => void
}

export interface HexGrid {
  /** The prism drawing right now; picking and stats follow it across detail changes. */
  readonly mesh: Mesh
  /** Whether the bevelled prism is the one drawing. */
  readonly detailed: boolean
  /** How far the rounded edge reaches in from the rim, in world units. */
  readonly bevelRadius: number
  /** Centre-to-corner radius of a drawn tile: the layout size less the border gap. */
  readonly tileSize: number
  /** The most hexes the buffers hold. */
  readonly capacity: number
  /** Hexes drawn right now; never more than the capacity. */
  count: number
  /** The key of every hex held, by slot. Live and reused: read it, do not keep it. */
  readonly keys: readonly HexKey[]
  indexOf(key: HexKey): number | undefined
  hexAt(index: number): Axial | undefined
  /** The height the hex in this slot is drawn at, which fog may hold below its elevation. */
  heightAt(index: number): number
  colorAt(index: number): [number, number, number, number]
  /** Replaces every tinted hex at once; anything absent returns to its terrain colour. */
  setOverlay(overlay: ReadonlyMap<HexKey, Color3>): void
  /**
   * Replaces the fog at once: 1 shows the terrain, 0 buries it under the fog
   * colour. Anything absent is fully clear, so an empty map lifts the fog.
   */
  setFog(clarity: ReadonlyMap<HexKey, number>): void
  /**
   * Moves the fog on the hexes given and leaves every other one alone: 1 lifts
   * the fog, anything less buries it. A party step changes the clarity of a few
   * hundred hexes out of a window of tens of thousands, and the scan setFog
   * makes over the whole window is most of what that step costs. A hex not in
   * the window is remembered anyway, so it arrives already fogged.
   */
  updateFog(changed: ReadonlyMap<HexKey, number>): void
  /**
   * Puts the grid on a different set of hexes, reusing the same buffers: the
   * first window, or the same window re-terrained. The tint and fog layers ride
   * along, so moving the view does not disturb what the party has been shown.
   */
  setWindow(tiles: readonly HexTile[]): void
  /**
   * Slides the window instead of rebuilding it: every hex `keep` turns down is
   * dropped, `entering` is added, and the hexes that stay are not touched. A
   * one-chunk pan rewrites a strip of chunks, not the whole window.
   */
  moveWindow(keep: (q: number, r: number) => boolean, entering: readonly HexTile[]): void
  /** Draws the window with the bevelled prism, or with the flat one. */
  setDetail(detailed: boolean): void
  /**
   * Buries every hex under the fog, tints and all, whatever the fog says, or
   * lifts that and shows the fog as it stands again.
   */
  setVeil(veiled: boolean): void
  /**
   * Draws the fog as a wash over the ground rather than burying it: every hex
   * stands at its height in its own colour, dimmed by how fogged it is.
   */
  setSeeThrough(seeThrough: boolean): void
  /**
   * Raises each hex above where it rests by what `offset` gives at its centre on
   * the ground; an offset of 0 everywhere sets the whole window back down.
   */
  lift(offset: (x: number, z: number) => number): void
  dispose(): void
}

/** Below this many pixels the rounded edge is not worth its triangles. */
const FLAT_BELOW_PX = 1.5

/** And past this it is drawn again; the gap keeps a zoom resting near the line from flickering. */
const DETAILED_ABOVE_PX = 2.5

/**
 * Whether the rounded edge should be drawn, given how many pixels it spans on
 * screen. Measured in pixels rather than zoom, so a taller window keeps its
 * bevels further out.
 */
export const wantsDetail = (bevelPixels: number, detailed: boolean): boolean =>
  detailed ? bevelPixels >= FLAT_BELOW_PX : bevelPixels > DETAILED_ABOVE_PX

export const MIN_ELEVATION = 0.05
const DEFAULT_GAP = 0.06

// Floats per slot in each buffer. Base colours carry no alpha: it is always 1.
const MATRIX = 16
const COLOR = 4
const BASE = 3

// Barely above the ground slab, so a hex nobody has seen reads as a hole in the
// map rather than as a dimmed tile whose terrain can still be guessed.
export const FOG_COLOR = new Color3(0.055, 0.065, 0.085)
/** What a veiled hex's top lightens toward as it is raised, so a swell reads as ground rising. */
const CREST_COLOR = new Color3(0.2, 0.24, 0.31)
/** How high a lifted hex must stand to show the crest colour at full. */
const CREST_HEIGHT = 3

/** The most hexes one fog change may reveal and still be told of one by one. */
export const REVEAL_BURST = 400

// Tints carry no terrain information, so they stay legible through the fog: a
// route or the hover highlight should not vanish into unexplored ground.
const TINT_CLARITY_FLOOR = 0.6

/** How much of the ground shows through the thickest fog when the fog is seen through. */
export const SEE_THROUGH_CLARITY = 0.35

/**
 * The hexes on screen, drawn as thin instances of one prism. The buffers are
 * allocated once for the widest view the camera allows, and the hexes in them
 * are kept packed at the front: a hex leaving the window hands its slot to the
 * last one, so moving the view only ever writes the slots that changed.
 */
export function createHexGrid(scene: Scene, layout: Layout, options: HexGridOptions): HexGrid {
  // Tiles are drawn slightly smaller than their layout cell; the sliver of dark
  // ground left between neighbours is the border.
  const gap = options.gap ?? DEFAULT_GAP
  const capacity = Math.max(1, Math.floor(options.capacity))
  const size = layout.size * (1 - gap)
  const detailedMesh = createHexPrismMesh(scene, size, 'hexGrid', { bevel: options.bevel })
  // A third of the triangles, for when the rounded edge is too small to see.
  const flatMesh = createHexPrismMesh(scene, size, 'hexGridFlat', { bevel: 0 })

  const material = new StandardMaterial('hexGrid', scene)
  material.specularColor = Color3.Black()

  const matrices = new Float32Array(capacity * MATRIX)
  const colors = new Float32Array(capacity * COLOR)
  const baseColors = new Float32Array(capacity * BASE)
  const clarity = new Float32Array(capacity).fill(1)
  const elevations = new Float32Array(capacity)
  const qs = new Int32Array(capacity)
  const rs = new Int32Array(capacity)
  const keys: HexKey[] = []
  const indexByKey = new Map<HexKey, number>()
  let count = 0

  // Both prisms read the same buffers; only the one drawing is sent them.
  for (const prism of [detailedMesh, flatMesh]) {
    prism.material = material
    if (options.layerMask !== undefined) prism.layerMask = options.layerMask

    // Both buffers stay updatable: a static buffer cannot be re-uploaded, so
    // moving the window would rewrite the matrices and never reach the GPU.
    prism.thinInstanceSetBuffer('matrix', matrices, MATRIX, false)
    prism.thinInstanceSetBuffer('color', colors, COLOR, false)
    prism.thinInstanceEnablePicking = true
    prism.thinInstanceCount = 0

    // Once, for the prism's own bounds: picking tests each instance against
    // them before its triangles, and without them walks every triangle of every
    // hex. The bounds of the grid as a whole are kept by hand as the window moves.
    prism.thinInstanceRefreshBoundingInfo(true)

    // The grid never moves and its bounds always hold the view, so neither a
    // world matrix nor a frustum test is worth working out every frame.
    prism.freezeWorldMatrix()
    prism.alwaysSelectAsActiveMesh = true
  }

  flatMesh.isVisible = false
  let mesh = detailedMesh

  let overlay = new Map<HexKey, Color3>()
  let fog = new Map<HexKey, number>()
  let veiled = false
  let seeThrough = false

  const shownClarity = (index: number): number =>
    seeThrough ? SEE_THROUGH_CLARITY + (1 - SEE_THROUGH_CLARITY) * clarity[index] : clarity[index]

  // Only the slots in use go up; the rest of the buffer is whatever was last there.
  const uploadColors = (): void => {
    if (count > 0) mesh.thinInstancePartialBufferUpdate('color', count, 0)
  }

  // A tile is only a height and a place on the ground, so its sixteen floats
  // are written straight in rather than composed: the Y scale sits at 5 and the
  // translation at 12 to 14.
  const writeTile = (tile: HexTile, index: number): void => {
    const world = hexToWorld(layout, tile.hex)
    const m = index * MATRIX
    matrices.fill(0, m, m + MATRIX)
    matrices[m] = 1
    elevations[index] = Math.max(MIN_ELEVATION, tile.elevation)
    matrices[m + 10] = 1
    matrices[m + 12] = world.x
    matrices[m + 14] = world.z
    matrices[m + 15] = 1

    const base = index * BASE
    baseColors[base] = tile.color.r
    baseColors[base + 1] = tile.color.g
    baseColors[base + 2] = tile.color.b
  }

  // The rendered colour is the tint over the terrain, faded toward the fog by
  // how much of the hex the party has seen. Both layers are kept apart so the
  // hover tint can change on every pointer move without touching the fog.
  const composite = (index: number): void => {
    const offset = index * COLOR
    if (veiled) {
      colors[offset] = FOG_COLOR.r
      colors[offset + 1] = FOG_COLOR.g
      colors[offset + 2] = FOG_COLOR.b
      colors[offset + 3] = 1
      return
    }

    const tint = overlay.get(keys[index])
    const fade = tint ? Math.max(shownClarity(index), TINT_CLARITY_FLOOR) : shownClarity(index)
    const base = index * BASE

    const r = tint ? tint.r : baseColors[base]
    const g = tint ? tint.g : baseColors[base + 1]
    const b = tint ? tint.b : baseColors[base + 2]

    if (fade === 1) {
      colors[offset] = r
      colors[offset + 1] = g
      colors[offset + 2] = b
    } else {
      colors[offset] = FOG_COLOR.r + (r - FOG_COLOR.r) * fade
      colors[offset + 1] = FOG_COLOR.g + (g - FOG_COLOR.g) * fade
      colors[offset + 2] = FOG_COLOR.b + (b - FOG_COLOR.b) * fade
    }
    colors[offset + 3] = 1
  }

  // Ground nobody has seen lies flat, or a mountain's silhouette would stand
  // up out of the fog and give away what the fog is there to hide.
  const resting = (index: number): number =>
    !veiled && (seeThrough || clarity[index] > 0) ? elevations[index] : MIN_ELEVATION

  const raise = (index: number): boolean => {
    const height = resting(index)
    const at = index * MATRIX + 5
    if (matrices[at] === height) return false
    matrices[at] = height
    return true
  }

  const append = (tile: HexTile): void => {
    const index = count++
    const key = hexKey(tile.hex)
    qs[index] = tile.hex.q
    rs[index] = tile.hex.r
    keys.push(key)
    indexByKey.set(key, index)
    writeTile(tile, index)

    // The fog and the tint belong to the hex, not to the slot it landed in, so
    // both are read back for whatever moved into this one.
    clarity[index] = fog.get(key) ?? 1
    raise(index)
    composite(index)
  }

  // The last hex moves into the hole, already composited, so nothing behind
  // the hole has to shift.
  const removeAt = (index: number): void => {
    const last = count - 1
    indexByKey.delete(keys[index])

    if (index !== last) {
      matrices.copyWithin(index * MATRIX, last * MATRIX, count * MATRIX)
      colors.copyWithin(index * COLOR, last * COLOR, count * COLOR)
      baseColors.copyWithin(index * BASE, last * BASE, count * BASE)
      clarity[index] = clarity[last]
      elevations[index] = elevations[last]
      qs[index] = qs[last]
      rs[index] = rs[last]
      keys[index] = keys[last]
      indexByKey.set(keys[index], index)
    }

    keys.pop()
    count = last
  }

  const low = Vector3.Zero()
  const high = Vector3.Zero()

  // Culling and picking both read these, so a window that moved without them
  // would be unpickable, or culled, outside where it used to be. Worked out
  // from the translations directly: a prism reaches its layout size around its
  // middle and its elevation up.
  const refreshBounds = (): void => {
    let minX = Infinity
    let maxX = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    let top = MIN_ELEVATION

    for (let index = 0; index < count; index++) {
      const m = index * MATRIX
      const x = matrices[m + 12]
      const z = matrices[m + 14]
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (z < minZ) minZ = z
      if (z > maxZ) maxZ = z
      // The real height rather than the drawn one, so lifting the fog off a
      // mountain never pokes it out of bounds the window has not refreshed.
      if (elevations[index] > top) top = elevations[index]
    }

    if (count === 0) {
      low.setAll(0)
      high.setAll(0)
    } else {
      low.set(minX - layout.size, 0, minZ - layout.size)
      high.set(maxX + layout.size, top, maxZ + layout.size)
    }
    mesh.getBoundingInfo().reConstruct(low, high)
  }

  // Only the stretch of slots whose height changed goes up, not the window.
  let raisedFrom = Infinity
  let raisedTo = -1

  const refog = (index: number, fade: number): void => {
    clarity[index] = fade
    if (raise(index)) {
      if (index < raisedFrom) raisedFrom = index
      if (index > raisedTo) raisedTo = index
    }
    composite(index)
  }

  // Slots a fog change is bringing out from under the fog, told once the change is in.
  const revealed: number[] = []

  const noteReveal = (index: number, fade: number): void => {
    if (options.onReveal && !veiled && clarity[index] === 0 && fade > 0) revealed.push(index)
  }

  // A burst this big is the fog switched off or a whole map changing hands,
  // not the party looking round: nothing is seen lifting.
  const tellReveals = (): void => {
    if (revealed.length <= REVEAL_BURST) {
      for (const index of revealed) {
        const m = index * MATRIX
        options.onReveal?.(matrices[m + 12], matrices[m + 5], matrices[m + 14])
      }
    }
    revealed.length = 0
  }

  const uploadHeights = (): void => {
    if (raisedTo >= 0) {
      mesh.thinInstancePartialBufferUpdate('matrix', raisedTo - raisedFrom + 1, raisedFrom)
    }
    raisedFrom = Infinity
    raisedTo = -1
  }

  // Every hex, height and colour both: what a change to how the fog is drawn costs.
  const redraw = (): void => {
    for (let index = 0; index < count; index++) {
      raise(index)
      composite(index)
    }
    if (count > 0) mesh.thinInstancePartialBufferUpdate('matrix', count, 0)
    uploadColors()
  }

  const commit = (): void => {
    mesh.thinInstanceCount = count
    mesh.thinInstanceBufferUpdated('matrix')
    uploadColors()
    refreshBounds()
  }

  return {
    keys,
    capacity,
    bevelRadius: bevelRadius(size, options.bevel),
    tileSize: size,

    get mesh() {
      return mesh
    },

    get detailed() {
      return mesh === detailedMesh
    },

    get count() {
      return count
    },

    indexOf: (key) => indexByKey.get(key),
    hexAt: (index) => (index < count ? { q: qs[index], r: rs[index] } : undefined),
    heightAt: (index) => matrices[index * MATRIX + 5],
    colorAt: (index) => [
      colors[index * COLOR],
      colors[index * COLOR + 1],
      colors[index * COLOR + 2],
      colors[index * COLOR + 3],
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

      if (stale.length > 0 || fresh.length > 0) uploadColors()
    },

    setFog(next): void {
      fog = new Map(next)
      let changed = false

      for (let index = 0; index < count; index++) {
        const fade = fog.get(keys[index]) ?? 1
        if (fade === clarity[index]) continue
        noteReveal(index, fade)
        refog(index, fade)
        changed = true
      }

      if (changed) {
        uploadColors()
        uploadHeights()
      }
      tellReveals()
    },

    updateFog(changed): void {
      let touched = false

      for (const [key, fade] of changed) {
        // Clear is the absence of fog rather than a clarity of 1, so the map
        // holds only what is fogged however long the crawl runs.
        if (fade === 1) fog.delete(key)
        else fog.set(key, fade)

        const index = indexByKey.get(key)
        if (index === undefined || clarity[index] === fade) continue

        noteReveal(index, fade)
        refog(index, fade)
        touched = true
      }

      if (touched) {
        uploadColors()
        uploadHeights()
      }
      tellReveals()
    },

    setWindow(tiles): void {
      if (tiles.length > capacity) {
        throw new RangeError(`the grid holds ${capacity} hexes, given ${tiles.length}`)
      }

      indexByKey.clear()
      keys.length = 0
      count = 0
      for (const tile of tiles) append(tile)
      commit()
    },

    moveWindow(keep, entering): void {
      let index = 0
      while (index < count) {
        // A removal pulls the last hex into this slot, which is then checked
        // in turn, so the index only moves on past a hex that stays.
        if (keep(qs[index], rs[index])) index++
        else removeAt(index)
      }

      if (count + entering.length > capacity) {
        throw new RangeError(`the grid holds ${capacity} hexes, given ${count + entering.length}`)
      }

      for (const tile of entering) append(tile)
      commit()
    },

    // The prism taking over is sent the whole window; the one stepping aside is
    // emptied and hidden, so it costs nothing until it is wanted back.
    setDetail(detailed): void {
      const next = detailed ? detailedMesh : flatMesh
      if (next === mesh) return

      mesh.isVisible = false
      mesh.thinInstanceCount = 0
      mesh = next
      mesh.isVisible = true
      commit()

      // The render loop's readiness check looks at the waiting prism while it is
      // empty, which settles the material without the per-hex colour attribute;
      // nothing else unsettles it, and the map would draw plain white.
      material.markAsDirty(Material.AttributesDirtyFlag)
    },

    setVeil(next): void {
      if (next === veiled) return
      veiled = next
      redraw()
    },

    setSeeThrough(next): void {
      if (next === seeThrough) return
      seeThrough = next
      redraw()
    },

    lift(offset): void {
      let lit = false
      for (let index = 0; index < count; index++) {
        const m = index * MATRIX
        const raised = offset(matrices[m + 12], matrices[m + 14])
        const height = resting(index) + raised
        if (matrices[m + 5] === height) continue
        matrices[m + 5] = height
        if (index < raisedFrom) raisedFrom = index
        if (index > raisedTo) raisedTo = index
        // Under the veil every top is the same flat fog, so height alone hardly
        // shows from above: a raised top catches the light as well.
        if (veiled) {
          const glow = Math.min(1, Math.max(0, raised / CREST_HEIGHT))
          const c = index * COLOR
          colors[c] = FOG_COLOR.r + (CREST_COLOR.r - FOG_COLOR.r) * glow
          colors[c + 1] = FOG_COLOR.g + (CREST_COLOR.g - FOG_COLOR.g) * glow
          colors[c + 2] = FOG_COLOR.b + (CREST_COLOR.b - FOG_COLOR.b) * glow
          lit = true
        }
      }
      uploadHeights()
      if (lit) uploadColors()
    },

    dispose(): void {
      material.dispose()
      detailedMesh.dispose()
      flatMesh.dispose()
    },
  }
}
