/**
 * What one party step costs the fog: the sight recompute, the clarity map
 * HexCanvas builds from it, and the buffer write that uploads it. The
 * whole-window path is timed beside the stepped one on two boards, so the cost
 * that grows with the view and the cost that does not stand side by side. Run
 * with `bun bench`.
 */
import { NullEngine } from '@babylonjs/core/Engines/nullEngine'
import { Scene } from '@babylonjs/core/scene'
import { hexKey, spiral, type Axial, type HexKey } from '../src/hex/coords'
import { createLayout } from '../src/hex/layout'
import { createHexGrid, type HexTile } from '../src/engine/hexGrid'
import { sightFrom } from '../src/terrain/sight'
import { createTerrain } from '../src/terrain/terrain'
import { fieldFromTiles } from '../src/terrain/field'

// The board MapView shipped with, and one four times the size: the two paths
// should part company between them.
const BOARDS = [40, 80]
const REMEMBERED = 0.42

/** The reach of a party standing on a peak: the widest disc one step moves. */
const SIGHT = 14

const layout = createLayout(2)
const engine = new NullEngine()
const scene = new Scene(engine)

const origin: Axial = { q: 0, r: 0 }
const nextHex: Axial = { q: 1, r: 0 }

const time = (label: string, iterations: number, run: () => void): void => {
  for (let i = 0; i < Math.min(iterations, 50); i++) run()

  const started = performance.now()
  for (let i = 0; i < iterations; i++) run()
  const each = (performance.now() - started) / iterations

  console.log(
    `${label.padEnd(38)} ${each.toFixed(3).padStart(8)} ms   ${Math.round(1000 / each)}/s`,
  )
}

const board = (radius: number, timeSight: boolean): void => {
  const terrain = createTerrain(layout, { octaves: 4 })
  const terrainTiles = spiral(origin, radius).map(terrain)
  const tiles = new Map(terrainTiles.map((tile) => [hexKey(tile.hex), tile]))
  const field = fieldFromTiles(tiles)

  const grid = createHexGrid(scene, layout, { capacity: terrainTiles.length })
  grid.setWindow(
    terrainTiles.map((tile): HexTile => ({
      hex: tile.hex,
      elevation: tile.elevation,
      color: tile.color,
    })),
  )

  const sightAt = (hex: Axial, reach: number) =>
    sightFrom(field, hex, { radius: reach, maxRadius: reach })

  console.log(`\nboard radius ${radius}: ${tiles.size} hexes, ${grid.count} instances\n`)

  if (timeSight) {
    for (const reach of [5, 10, SIGHT]) {
      time(`sightFrom radius ${reach}`, 2000, () => {
        sightAt(origin, reach)
      })
    }
    console.log('')
  }

  const here = sightAt(origin, SIGHT)
  const there = sightAt(nextHex, SIGHT)
  const explored = new Set<HexKey>(here.visible)
  for (const key of there.visible) explored.add(key)

  // The whole window, every step: what HexCanvas used to hand setFog.
  const wholeFog = (visible: ReadonlySet<HexKey>): Map<HexKey, number> => {
    const result = new Map<HexKey, number>()
    for (const key of tiles.keys()) {
      if (visible.has(key)) continue
      result.set(key, explored.has(key) ? REMEMBERED : 0)
    }
    return result
  }

  // And the difference it hands updateFog now: what left sight and what entered
  // it, which is the party's disc rather than the view.
  const fogStep = (was: ReadonlySet<HexKey>, visible: ReadonlySet<HexKey>): Map<HexKey, number> => {
    const changed = new Map<HexKey, number>()
    for (const key of was) {
      if (!visible.has(key)) changed.set(key, explored.has(key) ? REMEMBERED : 0)
    }
    for (const key of visible) if (!was.has(key)) changed.set(key, 1)
    return changed
  }

  const wholeHere = wholeFog(here.visible)
  const wholeThere = wholeFog(there.visible)
  const stepOn = fogStep(here.visible, there.visible)
  const stepBack = fogStep(there.visible, here.visible)

  console.log(`a step moves ${stepOn.size} hexes of ${tiles.size}\n`)

  time('whole-window fog map', 500, () => {
    wholeFog(there.visible)
  })

  let flip = false
  time('setFog after one step', 500, () => {
    grid.setFog(flip ? wholeHere : wholeThere)
    flip = !flip
  })

  time('stepped fog diff', 20000, () => {
    fogStep(here.visible, there.visible)
  })

  let back = false
  time('updateFog after one step', 20000, () => {
    grid.updateFog(back ? stepBack : stepOn)
    back = !back
  })

  grid.dispose()
}

for (const radius of BOARDS) board(radius, radius === BOARDS[0])

scene.dispose()
engine.dispose()
