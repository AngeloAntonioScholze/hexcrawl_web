/**
 * What one party step costs: the sight recompute, the fog map HexCanvas builds
 * from it, and the buffer scan setFog does to upload it. Run with `bun bench`.
 */
import { NullEngine } from '@babylonjs/core/Engines/nullEngine'
import { Scene } from '@babylonjs/core/scene'
import { hexKey, spiral, type Axial, type HexKey } from '../src/hex/coords'
import { createLayout } from '../src/hex/layout'
import { createHexGrid, type HexTile } from '../src/engine/hexGrid'
import { sightFrom } from '../src/terrain/sight'
import { createTerrain } from '../src/terrain/terrain'
import { fieldFromTiles } from '../src/terrain/field'

// The board MapView ships with: a 40-hex radius is 4921 tiles. Sight runs from
// the default 5 up to the 14 a party standing on a peak reaches.
const BOARD_RADIUS = 40
const REMEMBERED = 0.42

const layout = createLayout(2)
const field = spiral({ q: 0, r: 0 }, BOARD_RADIUS)
const terrain = createTerrain(layout, { octaves: 4 })
const terrainTiles = field.map(terrain)
const tiles = new Map(terrainTiles.map((tile) => [hexKey(tile.hex), tile]))

const engine = new NullEngine()
const scene = new Scene(engine)
const grid = createHexGrid(scene, layout, { capacity: terrainTiles.length })
grid.setWindow(
  terrainTiles.map((tile): HexTile => ({
    hex: tile.hex,
    elevation: tile.elevation,
    color: tile.color,
  })),
)

const time = (label: string, iterations: number, run: () => void): void => {
  for (let i = 0; i < Math.min(iterations, 50); i++) run()

  const started = performance.now()
  for (let i = 0; i < iterations; i++) run()
  const each = (performance.now() - started) / iterations

  console.log(
    `${label.padEnd(38)} ${each.toFixed(3).padStart(8)} ms   ${Math.round(1000 / each)}/s`,
  )
}

const sightAt = (hex: Axial, radius: number) =>
  sightFrom(fieldFromTiles(tiles), hex, { radius, maxRadius: radius })

const fogMapFrom = (visible: ReadonlySet<HexKey>, explored: ReadonlySet<HexKey>) => {
  const result = new Map<HexKey, number>()
  for (const key of tiles.keys()) {
    if (visible.has(key)) continue
    result.set(key, explored.has(key) ? REMEMBERED : 0)
  }
  return result
}

const origin: Axial = { q: 0, r: 0 }
const nextHex: Axial = { q: 1, r: 0 }

console.log(`board ${tiles.size} hexes, ${grid.count} instances\n`)

for (const radius of [5, 10, 14]) {
  time(`sightFrom radius ${radius}`, 2000, () => {
    sightAt(origin, radius)
  })
}

const here = sightAt(origin, 14)
const there = sightAt(nextHex, 14)
const explored = new Set<HexKey>(here.visible)
console.log(`\nsight disc at radius 14: ${here.visible.size} lit, ${here.blocked.size} blocked\n`)

time('whole-board fog map', 2000, () => {
  fogMapFrom(here.visible, explored)
})

time('incremental fog diff', 20000, () => {
  const result = new Map<HexKey, number>()
  for (const key of there.visible) {
    if (here.visible.has(key)) continue
    result.set(key, explored.has(key) ? REMEMBERED : 0)
  }
  for (const key of here.visible) result.delete(key)
})

time('explored set copy', 2000, () => {
  const next = new Set(explored)
  for (const key of here.visible) next.add(key)
})

const fogHere = fogMapFrom(here.visible, explored)
const fogThere = fogMapFrom(there.visible, explored)
let flip = false

time('setFog after one step', 2000, () => {
  grid.setFog(flip ? fogHere : fogThere)
  flip = !flip
})

grid.setFog(fogHere)
time('setFog with nothing changed', 2000, () => {
  grid.setFog(fogHere)
})

grid.dispose()
scene.dispose()
engine.dispose()
