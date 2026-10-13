import { NullEngine } from '@babylonjs/core/Engines/nullEngine'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Scene } from '@babylonjs/core/scene'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hexKey, spiral, type Axial } from '../hex/coords'
import { createLayout, hexToWorld } from '../hex/layout'
import { createHexGrid, wantsDetail, type HexGrid, type HexTile } from './hexGrid'

const layout = createLayout(2)
const BASE = new Color3(0.2, 0.4, 0.6)

const makeTiles = (radius: number): HexTile[] =>
  spiral({ q: 0, r: 0 }, radius).map((hex: Axial) => ({
    hex,
    elevation: 1 + (Math.abs(hex.q) % 3),
    color: BASE,
  }))

let engine: NullEngine
let scene: Scene
let grid: HexGrid
let tiles: HexTile[]

beforeEach(() => {
  engine = new NullEngine()
  scene = new Scene(engine)
  tiles = makeTiles(3)
  grid = createHexGrid(scene, layout, { capacity: 8000 })
  grid.setWindow(tiles)
})

afterEach(() => {
  grid.dispose()
  scene.dispose()
  engine.dispose()
})

describe('instancing', () => {
  it('draws every tile from a single mesh', () => {
    expect(grid.count).toBe(tiles.length)
    expect(grid.mesh.thinInstanceCount).toBe(tiles.length)
    expect(scene.meshes.filter((mesh) => mesh.isVisible)).toHaveLength(1)
  })

  it('enables picking so instances resolve back to hexes', () => {
    expect(grid.mesh.thinInstanceEnablePicking).toBe(true)
  })

  it('places each instance at its layout position', () => {
    const matrices = grid.mesh.thinInstanceGetWorldMatrices()
    tiles.forEach((tile, index) => {
      const world = hexToWorld(layout, tile.hex)
      const translation = matrices[index].getTranslation()
      expect(translation.x).toBeCloseTo(world.x, 5)
      expect(translation.z).toBeCloseTo(world.z, 5)
      expect(translation.y).toBeCloseTo(0, 5)
    })
  })

  it('bakes elevation into the instance Y scale', () => {
    const matrices = grid.mesh.thinInstanceGetWorldMatrices()
    tiles.forEach((tile, index) => {
      // m[5] is the Y row of the column-major matrix: the elevation scale.
      expect(matrices[index].m[5]).toBeCloseTo(tile.elevation, 5)
    })
  })

  it('holds 5000+ hexes in one mesh', () => {
    const big = createHexGrid(scene, layout, { capacity: 8000 })
    big.setWindow(makeTiles(41))
    expect(big.count).toBeGreaterThan(5000)
    expect(big.mesh.thinInstanceCount).toBe(big.count)
    big.dispose()
  })

  it('draws only the hexes the window holds, not the whole capacity', () => {
    const roomy = createHexGrid(scene, layout, { capacity: 8000 })

    roomy.setWindow(makeTiles(3))
    const wide = roomy.count

    roomy.setWindow(makeTiles(1))
    expect(roomy.count).toBeLessThan(wide)
    expect(roomy.mesh.thinInstanceCount).toBe(roomy.count)
    roomy.dispose()
  })

  it('refuses a window it has no room for', () => {
    const tight = createHexGrid(scene, layout, { capacity: 4 })
    expect(() => tight.setWindow(makeTiles(3))).toThrow(RangeError)
    tight.dispose()
  })

  it('keeps the fog on a hex when the window moves under it', () => {
    grid.setFog(new Map([['1,0', 0]]))
    const dark = grid.colorAt(grid.indexOf('1,0')!)

    // The same hex, landing in a different slot of the buffer.
    grid.setWindow([...tiles].reverse())

    expect(grid.colorAt(grid.indexOf('1,0')!)).toEqual(dark)
  })
})

describe('index mapping', () => {
  it('round-trips key to index to hex', () => {
    for (const tile of tiles) {
      const key = hexKey(tile.hex)
      const index = grid.indexOf(key)
      expect(index).toBeDefined()
      expect(grid.hexAt(index!)).toEqual(tile.hex)
    }
  })

  it('returns undefined off the map', () => {
    expect(grid.indexOf('99,99')).toBeUndefined()
    expect(grid.hexAt(9999)).toBeUndefined()
  })
})

describe('overlay', () => {
  const TINT = new Color3(1, 0, 0)
  const OTHER = new Color3(0, 1, 0)
  const keyOf = (index: number): ReturnType<typeof hexKey> => hexKey(tiles[index].hex)

  const expectColor = (key: ReturnType<typeof hexKey>, rgb: [number, number, number]): void => {
    const [r, g, b] = grid.colorAt(grid.indexOf(key)!)
    expect(r).toBeCloseTo(rgb[0], 6)
    expect(g).toBeCloseTo(rgb[1], 6)
    expect(b).toBeCloseTo(rgb[2], 6)
  }

  const base: [number, number, number] = [BASE.r, BASE.g, BASE.b]

  it('recolours only the hexes in the overlay', () => {
    const target = keyOf(4)
    grid.setOverlay(new Map([[target, TINT]]))

    tiles.forEach((tile, index) => {
      const [r, g, b] = grid.colorAt(index)
      const expected = hexKey(tile.hex) === target ? [1, 0, 0] : base
      expect(r).toBeCloseTo(expected[0], 6)
      expect(g).toBeCloseTo(expected[1], 6)
      expect(b).toBeCloseTo(expected[2], 6)
    })
  })

  it('tints a whole route at once', () => {
    const route = [keyOf(1), keyOf(2), keyOf(3)]
    grid.setOverlay(new Map(route.map((key) => [key, TINT])))
    for (const key of route) expectColor(key, [1, 0, 0])
  })

  it('restores hexes dropped from the overlay', () => {
    const stays = keyOf(1)
    const goes = keyOf(2)
    grid.setOverlay(
      new Map([
        [stays, TINT],
        [goes, TINT],
      ]),
    )
    grid.setOverlay(new Map([[stays, TINT]]))

    expectColor(stays, [1, 0, 0])
    expectColor(goes, base)
  })

  it('clears everything for an empty overlay', () => {
    grid.setOverlay(new Map([[keyOf(2), TINT]]))
    grid.setOverlay(new Map())
    expectColor(keyOf(2), base)
  })

  it('recolours a hex whose tint changed', () => {
    const target = keyOf(5)
    grid.setOverlay(new Map([[target, TINT]]))
    grid.setOverlay(new Map([[target, OTHER]]))
    expectColor(target, [0, 1, 0])
  })

  it('ignores hexes that are not on the map', () => {
    expect(() => grid.setOverlay(new Map([['99,99', TINT]]))).not.toThrow()
  })
})

describe('fog', () => {
  const FOG: [number, number, number] = [0.055, 0.065, 0.085]
  const TINT_FLOOR = 0.6
  const keyOf = (index: number): ReturnType<typeof hexKey> => hexKey(tiles[index].hex)

  const expectColor = (index: number, rgb: [number, number, number]): void => {
    const [r, g, b] = grid.colorAt(index)
    expect(r).toBeCloseTo(rgb[0], 6)
    expect(g).toBeCloseTo(rgb[1], 6)
    expect(b).toBeCloseTo(rgb[2], 6)
  }

  it('leaves the terrain untouched when nothing is fogged', () => {
    grid.setFog(new Map())
    expectColor(0, [BASE.r, BASE.g, BASE.b])
  })

  it('buries a hex nobody has seen under the fog colour', () => {
    grid.setFog(new Map([[keyOf(0), 0]]))
    expectColor(0, FOG)
  })

  it('fogs only the hexes it is given', () => {
    grid.setFog(new Map([[keyOf(0), 0]]))
    expectColor(1, [BASE.r, BASE.g, BASE.b])
  })

  it('fades a remembered hex partway toward the fog', () => {
    grid.setFog(new Map([[keyOf(0), 0.5]]))
    expectColor(0, [
      FOG[0] + (BASE.r - FOG[0]) * 0.5,
      FOG[1] + (BASE.g - FOG[1]) * 0.5,
      FOG[2] + (BASE.b - FOG[2]) * 0.5,
    ])
  })

  it('lifts again when the hex leaves the fog map', () => {
    grid.setFog(new Map([[keyOf(0), 0]]))
    grid.setFog(new Map())
    expectColor(0, [BASE.r, BASE.g, BASE.b])
  })

  it('keeps a tint legible through the fog', () => {
    grid.setFog(new Map([[keyOf(0), 0]]))
    grid.setOverlay(new Map([[keyOf(0), new Color3(1, 1, 1)]]))

    const lit = FOG.map((channel) => channel + (1 - channel) * TINT_FLOOR)
    expectColor(0, lit as [number, number, number])
  })

  it('fogs a hex again once its tint is taken away', () => {
    grid.setFog(new Map([[keyOf(0), 0]]))
    grid.setOverlay(new Map([[keyOf(0), new Color3(1, 1, 1)]]))
    grid.setOverlay(new Map())
    expectColor(0, FOG)
  })

  it('moves the fog on the hexes given and leaves the rest as they were', () => {
    grid.setFog(new Map([[keyOf(0), 0]]))
    grid.updateFog(new Map([[keyOf(1), 0]]))

    expectColor(0, FOG)
    expectColor(1, FOG)
  })

  it('lifts the fog from a hex handed back full clarity', () => {
    grid.setFog(new Map([[keyOf(0), 0]]))
    grid.updateFog(new Map([[keyOf(0), 1]]))
    expectColor(0, [BASE.r, BASE.g, BASE.b])
  })

  it('remembers a hex it was told about before the window reached it', () => {
    const outside = hexKey({ q: 20, r: 0 })
    grid.updateFog(new Map([[outside, 0]]))

    grid.setWindow([...tiles, { hex: { q: 20, r: 0 }, elevation: 1, color: BASE }])

    expect(grid.colorAt(grid.indexOf(outside)!)[0]).toBeCloseTo(FOG[0], 6)
  })

  it('forgets a hex once the fog is lifted, so a later window finds it clear', () => {
    const outside = hexKey({ q: 20, r: 0 })
    grid.updateFog(new Map([[outside, 0]]))
    grid.updateFog(new Map([[outside, 1]]))

    grid.setWindow([...tiles, { hex: { q: 20, r: 0 }, elevation: 1, color: BASE }])

    expect(grid.colorAt(grid.indexOf(outside)!)[0]).toBeCloseTo(BASE.r, 6)
  })

  it('leaves a whole-map replacement holding only what it was given', () => {
    grid.updateFog(new Map([[keyOf(0), 0]]))
    grid.setFog(new Map([[keyOf(1), 0]]))

    expectColor(0, [BASE.r, BASE.g, BASE.b])
    expectColor(1, FOG)
  })

  it('fogs a tinted hex that was clear when the tint went on', () => {
    grid.setOverlay(new Map([[keyOf(0), new Color3(1, 1, 1)]]))
    grid.setFog(new Map([[keyOf(0), 0]]))

    const lit = FOG.map((channel) => channel + (1 - channel) * TINT_FLOOR)
    expectColor(0, lit as [number, number, number])
  })
})

describe('fog flattening', () => {
  const MIN = 0.05
  const keyOf = (index: number): ReturnType<typeof hexKey> => hexKey(tiles[index].hex)
  const heightAt = (index: number): number => grid.mesh.thinInstanceGetWorldMatrices()[index].m[5]

  it('lays a hex nobody has seen flat', () => {
    grid.setFog(new Map([[keyOf(0), 0]]))
    expect(heightAt(0)).toBeCloseTo(MIN, 6)
  })

  it('keeps the terrain height of remembered and visible hexes', () => {
    grid.setFog(new Map([[keyOf(0), 0.42]]))
    const matrices = grid.mesh.thinInstanceGetWorldMatrices()
    expect(matrices[0].m[5]).toBeCloseTo(tiles[0].elevation, 6)
    expect(matrices[1].m[5]).toBeCloseTo(tiles[1].elevation, 6)
  })

  it('flattens through a single step of the fog', () => {
    grid.updateFog(new Map([[keyOf(2), 0]]))
    expect(heightAt(2)).toBeCloseTo(MIN, 6)
  })

  it('raises a hex back to its terrain once it is seen', () => {
    const fresh = createHexGrid(scene, layout, { capacity: 100 })
    fresh.setFog(new Map([[keyOf(0), 0]]))
    fresh.setWindow(tiles)
    fresh.updateFog(new Map([[keyOf(0), 0.42]]))
    expect(fresh.mesh.thinInstanceGetWorldMatrices()[0].m[5]).toBeCloseTo(tiles[0].elevation, 6)
    fresh.dispose()
  })

  it('arrives flat when the window reaches ground still unexplored', () => {
    const outside = hexKey({ q: 20, r: 0 })
    grid.updateFog(new Map([[outside, 0]]))
    grid.setWindow([...tiles, { hex: { q: 20, r: 0 }, elevation: 3, color: BASE }])
    expect(heightAt(grid.indexOf(outside)!)).toBeCloseTo(MIN, 6)
  })

  it('keeps a flattened hex flat when it changes slot', () => {
    const last = tiles.length - 1
    grid.setFog(new Map([[keyOf(last), 0]]))
    grid.moveWindow((q, r) => q !== tiles[0].hex.q || r !== tiles[0].hex.r, [])
    expect(grid.indexOf(keyOf(last))).toBe(0)
    const matrices = grid.mesh.thinInstanceGetWorldMatrices()
    expect(matrices[0].m[5]).toBeCloseTo(MIN, 6)
    expect(matrices[1].m[5]).toBeCloseTo(tiles[1].elevation, 6)
  })

  it('uploads only the stretch of heights that changed', () => {
    const upload = vi.spyOn(grid.mesh, 'thinInstancePartialBufferUpdate')
    grid.updateFog(
      new Map([
        [keyOf(4), 0],
        [keyOf(6), 0],
      ]),
    )
    expect(upload).toHaveBeenCalledWith('matrix', 3, 4)
  })

  it('leaves the heights alone when only the shade of the fog moves', () => {
    grid.setFog(new Map([[keyOf(0), 0.42]]))
    const upload = vi.spyOn(grid.mesh, 'thinInstancePartialBufferUpdate')
    grid.updateFog(new Map([[keyOf(0), 1]]))
    expect(upload).not.toHaveBeenCalledWith('matrix', expect.anything(), expect.anything())
  })

  it('keeps the grid bounds over a mountain still under fog', () => {
    grid.setFog(new Map(tiles.map((tile) => [hexKey(tile.hex), 0])))
    grid.setWindow(tiles)
    const top = Math.max(...tiles.map((tile) => tile.elevation))
    expect(grid.mesh.getBoundingInfo().boundingBox.maximum.y).toBeCloseTo(top, 6)
  })

  it('carries the flat ground over to the zoomed-out prism', () => {
    grid.setFog(new Map([[keyOf(0), 0]]))
    grid.setDetail(false)
    expect(heightAt(0)).toBeCloseTo(MIN, 6)
  })
})

describe('re-terraining', () => {
  const OTHER = new Color3(0.9, 0.1, 0.1)

  const reshaped = (): HexTile[] =>
    tiles.map((tile) => ({ ...tile, elevation: tile.elevation + 5, color: OTHER }))

  it('takes the new colours', () => {
    grid.setWindow(reshaped())

    const [r, g, b] = grid.colorAt(0)
    expect(r).toBeCloseTo(OTHER.r, 6)
    expect(g).toBeCloseTo(OTHER.g, 6)
    expect(b).toBeCloseTo(OTHER.b, 6)
  })

  // A static instance buffer cannot be re-uploaded, and nothing on the CPU side
  // shows it: the matrices rewrite happily and the GPU keeps the old ones.
  it('keeps both instance buffers updatable, or nothing reaches the GPU', () => {
    expect(grid.mesh.getVertexBuffer('world0')?.isUpdatable()).toBe(true)
    expect(grid.mesh.getVertexBuffer('instanceColor')?.isUpdatable()).toBe(true)
  })

  it('takes the new heights', () => {
    grid.setWindow(reshaped())

    const matrices = grid.mesh.thinInstanceGetWorldMatrices()
    tiles.forEach((tile, index) => {
      expect(matrices[index].m[5]).toBeCloseTo(tile.elevation + 5, 5)
    })
  })

  it('keeps the tint on top of the new ground', () => {
    const key = hexKey(tiles[0].hex)
    grid.setOverlay(new Map([[key, new Color3(0, 1, 0)]]))
    grid.setWindow(reshaped())

    const [r, g, b] = grid.colorAt(0)
    expect([r, g, b]).toEqual([0, 1, 0])
  })

  it('keeps the fog over the new ground', () => {
    const key = hexKey(tiles[0].hex)
    grid.setFog(new Map([[key, 0]]))
    grid.setWindow(reshaped())

    expect(grid.colorAt(0)[0]).toBeCloseTo(0.055, 6)
  })

  it('takes a shorter window than the one it was holding', () => {
    grid.setWindow(tiles.slice(1))
    expect(grid.count).toBe(tiles.length - 1)
    expect(grid.indexOf(hexKey(tiles[0].hex))).toBeUndefined()
  })
})

describe('moving the window', () => {
  const keepEast = (q: number): boolean => q >= 0
  const staying = (): HexTile[] => tiles.filter((tile) => keepEast(tile.hex.q))

  // Clear of everything kept, which stops at q = 3.
  const entering: HexTile[] = spiral({ q: 7, r: 0 }, 3).map((hex) => ({
    hex,
    elevation: 2,
    color: new Color3(0.7, 0.6, 0.5),
  }))

  it('drops what it is told to and takes what enters', () => {
    grid.moveWindow(keepEast, entering)

    expect(grid.count).toBe(staying().length + entering.length)
    expect(grid.mesh.thinInstanceCount).toBe(grid.count)
    for (const tile of tiles.filter((tile) => !keepEast(tile.hex.q))) {
      expect(grid.indexOf(hexKey(tile.hex))).toBeUndefined()
    }
    for (const tile of [...staying(), ...entering]) {
      expect(grid.hexAt(grid.indexOf(hexKey(tile.hex))!)).toEqual(tile.hex)
    }
  })

  it('draws every hex where its own tile says, whatever slot it landed in', () => {
    grid.moveWindow(keepEast, entering)
    const matrices = grid.mesh.thinInstanceGetWorldMatrices()

    for (const tile of [...staying(), ...entering]) {
      const matrix = matrices[grid.indexOf(hexKey(tile.hex))!]
      const world = hexToWorld(layout, tile.hex)
      expect(matrix.getTranslation().x).toBeCloseTo(world.x, 4)
      expect(matrix.getTranslation().z).toBeCloseTo(world.z, 4)
      expect(matrix.m[5]).toBeCloseTo(tile.elevation, 5)
    }
  })

  it('keeps the fog and tint of a hex that stays, even when it changes slot', () => {
    const kept = staying().map((tile) => hexKey(tile.hex))
    grid.setFog(new Map(kept.map((key) => [key, 0.5])))
    grid.setOverlay(new Map([[kept[kept.length - 1], new Color3(1, 1, 1)]]))

    const slots = new Map(kept.map((key) => [key, grid.indexOf(key)]))
    const colours = new Map(kept.map((key) => [key, grid.colorAt(grid.indexOf(key)!)]))

    grid.moveWindow(keepEast, entering)

    expect(kept.some((key) => grid.indexOf(key) !== slots.get(key))).toBe(true)
    for (const key of kept) expect(grid.colorAt(grid.indexOf(key)!)).toEqual(colours.get(key))
  })

  it('fogs a hex arriving under fog it already had', () => {
    const arriving = hexKey(entering[0].hex)
    grid.setFog(new Map([[arriving, 0]]))

    grid.moveWindow(keepEast, entering)

    expect(grid.colorAt(grid.indexOf(arriving)!)[0]).toBeCloseTo(0.055, 6)
  })

  it('lists exactly the hexes it holds, slot by slot', () => {
    grid.moveWindow(keepEast, entering)

    expect(grid.keys).toHaveLength(grid.count)
    grid.keys.forEach((key, index) => expect(grid.indexOf(key)).toBe(index))
  })

  it('grows its bounds over the ground that entered', () => {
    grid.moveWindow(keepEast, entering)
    const far = hexToWorld(layout, { q: 10, r: 0 })

    expect(grid.mesh.getBoundingInfo().boundingBox.maximumWorld.x).toBeGreaterThan(far.x)
  })

  it('refuses a move it has no room for', () => {
    const tight = createHexGrid(scene, layout, { capacity: tiles.length })
    tight.setWindow(tiles)
    expect(() => tight.moveWindow(() => true, entering)).toThrow(RangeError)
    tight.dispose()
  })
})

describe('detail', () => {
  it('draws the bevelled prism until told otherwise', () => {
    expect(grid.detailed).toBe(true)
  })

  it('hands the whole window to the flat prism, and back', () => {
    const bevelled = grid.mesh

    grid.setDetail(false)
    expect(grid.mesh).not.toBe(bevelled)
    expect(grid.mesh.getTotalIndices() / 3).toBe(18)
    expect(grid.mesh.thinInstanceCount).toBe(grid.count)
    expect(grid.mesh.isVisible).toBe(true)
    expect(bevelled.isVisible).toBe(false)

    grid.setDetail(true)
    expect(grid.mesh).toBe(bevelled)
    expect(grid.mesh.thinInstanceCount).toBe(grid.count)
  })

  it('brings back a window that moved while the flat prism was drawing', () => {
    grid.setDetail(false)
    grid.setWindow(tiles.slice(3))
    grid.setDetail(true)

    expect(grid.mesh.thinInstanceCount).toBe(tiles.length - 3)
    const matrices = grid.mesh.thinInstanceGetWorldMatrices()
    const world = hexToWorld(layout, tiles[3].hex)
    expect(matrices[0].getTranslation().x).toBeCloseTo(world.x, 4)
  })
})

describe('wantsDetail', () => {
  it('keeps the bevel while it spans a few pixels', () => {
    expect(wantsDetail(4, true)).toBe(true)
    expect(wantsDetail(4, false)).toBe(true)
  })

  it('drops it once it shrinks to about a pixel', () => {
    expect(wantsDetail(1, true)).toBe(false)
    expect(wantsDetail(1, false)).toBe(false)
  })

  it('holds whichever it has on a zoom resting between the two lines', () => {
    expect(wantsDetail(2, true)).toBe(true)
    expect(wantsDetail(2, false)).toBe(false)
  })
})
