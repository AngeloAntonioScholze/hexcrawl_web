import { NullEngine } from '@babylonjs/core/Engines/nullEngine'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Scene } from '@babylonjs/core/scene'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { hexKey, spiral, type Axial } from '../hex/coords'
import { createLayout, hexToWorld } from '../hex/layout'
import { createHexGrid, type HexGrid, type HexTile } from './hexGrid'

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
  grid = createHexGrid(scene, layout, tiles)
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
    expect(scene.meshes).toHaveLength(1)
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
    const big = createHexGrid(scene, layout, makeTiles(41))
    expect(big.count).toBeGreaterThan(5000)
    expect(big.mesh.thinInstanceCount).toBe(big.count)
    big.dispose()
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

  it('fogs a tinted hex that was clear when the tint went on', () => {
    grid.setOverlay(new Map([[keyOf(0), new Color3(1, 1, 1)]]))
    grid.setFog(new Map([[keyOf(0), 0]]))

    const lit = FOG.map((channel) => channel + (1 - channel) * TINT_FLOOR)
    expectColor(0, lit as [number, number, number])
  })
})
