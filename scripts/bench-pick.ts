/**
 * What hover costs on each pointer move: scene.pick against the grid window's
 * thin instances, beside a bare y=0 cast and the height-walking ground ray
 * hover uses now.
 * Timed at the zoom the map opens on and at the widest the huge world allows.
 * NullEngine on Bun, not a browser: the ratio is the useful number. Run with
 * `bun bench:pick`.
 */
import '@babylonjs/core/Culling/ray'
import { NullEngine } from '@babylonjs/core/Engines/nullEngine'
import { Matrix } from '@babylonjs/core/Maths/math.vector'
import { Scene } from '@babylonjs/core/scene'
import { gridCapacity, maxZoomFor, viewSpan } from '../src/composables/useHexWindow'
import { createIsoCamera } from '../src/engine/camera'
import { createHexGrid } from '../src/engine/hexGrid'
import { tilesInSpan } from '../src/engine/hexWindow'
import { hexFromPick, hexUnderPointer } from '../src/engine/scene'
import { createLayout, worldToHex } from '../src/hex/layout'
import { createTerrainField } from '../src/terrain/field'

const WIDTH = 1920
const HEIGHT = 1080
const RADIUS = 300
const OPENING_ZOOM = 40
const POINTERS = 400

const layout = createLayout(2)
const capacity = gridCapacity(layout)
const field = createTerrainField(layout, { octaves: 4, radius: RADIUS })

const engine = new NullEngine({
  renderWidth: WIDTH,
  renderHeight: HEIGHT,
  textureSize: 512,
  deterministicLockstep: false,
  lockstepMaxSteps: 4,
})
const scene = new Scene(engine)
const canvas = { clientWidth: WIDTH, clientHeight: HEIGHT } as HTMLCanvasElement
const maxZoom = maxZoomFor(layout, RADIUS)
const iso = createIsoCamera(scene, canvas, { zoom: OPENING_ZOOM, maxZoom })
const grid = createHexGrid(scene, layout, { capacity })

// A fixed spread over the screen, so both methods see the same pointers.
const pointers = Array.from({ length: POINTERS }, (_, i) => ({
  x: ((i * 0.6180339887) % 1) * WIDTH,
  y: ((i * 0.7548776662) % 1) * HEIGHT,
}))

const time = (label: string, run: (x: number, y: number) => void): number => {
  for (const { x, y } of pointers.slice(0, 20)) run(x, y)
  const started = performance.now()
  for (const { x, y } of pointers) run(x, y)
  const each = (performance.now() - started) / pointers.length
  console.log(`  ${label.padEnd(30)} ${each.toFixed(4).padStart(9)} ms per move`)
  return each
}

for (const zoom of [OPENING_ZOOM, maxZoom]) {
  iso.zoomBy(zoom / iso.zoom)
  for (let i = 0; i < 200 && iso.settling; i++) scene.render()
  iso.updateProjection(WIDTH / HEIGHT)
  scene.render()

  const { alpha, beta, target } = iso.camera
  const view = { x: target.x, z: target.z, zoom: iso.zoom, aspect: WIDTH / HEIGHT, alpha, beta }
  grid.setWindow(tilesInSpan(field, viewSpan(layout, view, capacity, RADIUS)))

  console.log(`zoom ${iso.zoom.toFixed(0)}: ${grid.count} instances`)

  let hits = 0
  time('scene.pick', (x, y) => {
    if (
      hexFromPick(
        grid,
        scene.pick(x, y, (mesh) => mesh === grid.mesh),
      )
    )
      hits++
  })

  const identity = Matrix.Identity()
  time('ray onto y=0 + worldToHex', (x, y) => {
    const ray = scene.createPickingRay(x, y, identity, iso.camera)
    const t = -ray.origin.y / ray.direction.y
    worldToHex(layout, {
      x: ray.origin.x + ray.direction.x * t,
      z: ray.origin.z + ray.direction.z * t,
    })
  })
  let agree = 0
  let gap = 0
  time('ground ray (hover)', (x, y) => {
    const ray = scene.createPickingRay(x, y, identity, iso.camera)
    hexUnderPointer(grid, layout, ray)
  })
  for (const { x, y } of pointers) {
    const ray = scene.createPickingRay(x, y, identity, iso.camera)
    const ground = hexUnderPointer(grid, layout, ray)
    const picked = hexFromPick(
      grid,
      scene.pick(x, y, (mesh) => mesh === grid.mesh),
    )
    if (ground?.q === picked?.q && ground?.r === picked?.r) agree++
    else if (!picked) gap++
  }
  console.log(
    `  ground ray agrees with scene.pick on ${agree} of ${POINTERS} pointers; ` +
      `${gap} more fell in the border gap scene.pick misses`,
  )
  console.log(`  (${hits} of ${POINTERS + 20} picks hit)\n`)
}

grid.dispose()
scene.dispose()
engine.dispose()
