/**
 * What moving the view costs: reading ground out of the field and putting it
 * in the grid, at the zoom the map opens on and at the widest one each world
 * allows. Run with `bun bench:window`.
 */
import { NullEngine } from '@babylonjs/core/Engines/nullEngine'
import { Scene } from '@babylonjs/core/scene'
import { gridCapacity, maxZoomFor, viewSpan } from '../src/composables/useHexWindow'
import { FAR_BETA } from '../src/engine/camera'
import { createHexGrid } from '../src/engine/hexGrid'
import { insideSpan, tilesEntering, tilesInSpan, type ChunkSpan } from '../src/engine/hexWindow'
import { createLayout } from '../src/hex/layout'
import { createTerrainField, type TerrainField } from '../src/terrain/field'

// Mirrors WORLD_SIZES in the store, which cannot be imported without Pinia.
const WORLDS = { small: 60, large: 150, huge: 300 }
const OPENING_ZOOM = 40
const ASPECT = 16 / 9
const OCTAVES = 4

const layout = createLayout(2)

// Sized the way HexCanvas sizes it, so the buffers match the app's.
const capacity = gridCapacity(layout)

const engine = new NullEngine()
const scene = new Scene(engine)
const grid = createHexGrid(scene, layout, { capacity })
const trianglesPerHex = grid.mesh.getTotalIndices() / 3

const time = (label: string, iterations: number, run: () => void): void => {
  for (let i = 0; i < Math.min(iterations, 3); i++) run()

  const started = performance.now()
  for (let i = 0; i < iterations; i++) run()
  const each = (performance.now() - started) / iterations

  console.log(`  ${label.padEnd(34)} ${each.toFixed(2).padStart(9)} ms`)
}

const panned = (span: ChunkSpan): ChunkSpan => ({
  ...span,
  minQ: span.minQ + 1,
  maxQ: span.maxQ + 1,
})

const widened = (span: ChunkSpan): ChunkSpan => ({
  minQ: span.minQ - 1,
  maxQ: span.maxQ + 1,
  minR: span.minR - 1,
  maxR: span.maxR + 1,
})

/** Swings the grid between two spans one move at a time, the way the app moves it. */
const swing = (field: TerrainField, a: ChunkSpan, b: ChunkSpan): (() => void) => {
  let at = a
  return () => {
    const to = at === a ? b : a
    grid.moveWindow((q, r) => insideSpan(to, q, r), tilesEntering(field, at, to))
    at = to
  }
}

console.log(`grid capacity ${capacity}, ${trianglesPerHex} triangles per hex\n`)

for (const [name, radius] of Object.entries(WORLDS)) {
  const fieldOptions = { octaves: OCTAVES, radius }
  const field = createTerrainField(layout, fieldOptions)

  for (const zoom of [OPENING_ZOOM, maxZoomFor(layout, radius)]) {
    // The camera's resting turn, at the lean it holds past the tilt band.
    const view = { x: 0, z: 0, zoom, aspect: ASPECT, alpha: -Math.PI / 2, beta: FAR_BETA }
    const span = viewSpan(layout, view, capacity, radius)
    const tiles = tilesInSpan(field, span)

    console.log(
      `${name} (radius ${radius}), zoom ${zoom}: ${tiles.length} instances, ` +
        `${((tiles.length * trianglesPerHex) / 1e6).toFixed(2)}M triangles`,
    )

    time('tilesInSpan, cold field', 3, () => {
      tilesInSpan(createTerrainField(layout, fieldOptions), span)
    })
    time('tilesInSpan, warm field', 20, () => {
      tilesInSpan(field, span)
    })
    time('setWindow, whole window', 20, () => {
      grid.setWindow(tiles)
    })

    grid.setWindow(tiles)
    time('one-chunk pan', 20, swing(field, span, panned(span)))

    grid.setWindow(tiles)
    time('one-chunk zoom', 20, swing(field, span, widened(span)))
    console.log()
  }
}

grid.dispose()
scene.dispose()
engine.dispose()
