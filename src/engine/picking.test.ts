import { NullEngine } from '@babylonjs/core/Engines/nullEngine'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector'
import { Scene } from '@babylonjs/core/scene'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { spiral, type Axial } from '../hex/coords'
import { createLayout, hexToWorld } from '../hex/layout'
import { createIsoCamera, type IsoCamera } from './camera'
import { createHexGrid, type HexGrid } from './hexGrid'
// Deliberately imports nothing from Babylon's Ray module: this exercises the
// same module graph the app has, so dropping scene.ts's side-effect import
// fails these tests instead of only breaking the browser.
import { hexFromPick } from './scene'

const layout = createLayout(2)
const WIDTH = 512
const HEIGHT = 256

const fakeCanvas = (): HTMLCanvasElement =>
  ({ clientWidth: WIDTH, clientHeight: HEIGHT }) as HTMLCanvasElement

let engine: NullEngine
let scene: Scene
let iso: IsoCamera
let grid: HexGrid

const screenPick = (x: number, y: number): Axial | null =>
  hexFromPick(
    grid,
    scene.pick(x, y, (mesh) => mesh === grid.mesh),
  )

// Where a hex's top face lands on screen under the current camera.
const screenPositionOf = (hex: Axial): { x: number; y: number } => {
  const world = hexToWorld(layout, hex)
  const projected = Vector3.Project(
    new Vector3(world.x, 1, world.z),
    Matrix.Identity(),
    scene.getTransformMatrix(),
    iso.camera.viewport.toGlobal(WIDTH, HEIGHT),
  )
  return { x: projected.x, y: projected.y }
}

beforeEach(() => {
  engine = new NullEngine({
    renderWidth: WIDTH,
    renderHeight: HEIGHT,
    textureSize: 512,
    deterministicLockstep: false,
    lockstepMaxSteps: 4,
  })
  scene = new Scene(engine)
  iso = createIsoCamera(scene, fakeCanvas(), { zoom: 20 })
  iso.updateProjection(WIDTH / HEIGHT)
  grid = createHexGrid(scene, layout, { capacity: 200 })
  grid.setWindow(
    spiral({ q: 0, r: 0 }, 4).map((hex) => ({
      hex,
      elevation: 1,
      color: new Color3(0.3, 0.3, 0.3),
    })),
  )
  scene.render()
})

afterEach(() => {
  grid.dispose()
  iso.dispose()
  scene.dispose()
  engine.dispose()
})

describe('screen picking', () => {
  it('resolves the hex under the pointer', () => {
    for (const hex of [
      { q: 0, r: 0 },
      { q: 2, r: -1 },
      { q: -3, r: 1 },
      { q: 1, r: 2 },
    ]) {
      const screen = screenPositionOf(hex)
      expect(screenPick(screen.x, screen.y), `hex ${hex.q},${hex.r}`).toEqual(hex)
    }
  })

  // The centre hex is instance 0, which a truthiness check on the index drops.
  it('resolves instance zero', () => {
    expect(grid.indexOf('0,0')).toBe(0)
    const screen = screenPositionOf({ q: 0, r: 0 })
    expect(screenPick(screen.x, screen.y)).toEqual({ q: 0, r: 0 })
  })

  it('still resolves after the camera rotates', () => {
    iso.rotate(1)
    for (let i = 0; i < 200; i++) scene.onBeforeRenderObservable.notifyObservers(scene)
    scene.render()

    const hex = { q: 2, r: -1 }
    const screen = screenPositionOf(hex)
    expect(screenPick(screen.x, screen.y)).toEqual(hex)
  })

  it('returns null off the grid', () => {
    expect(screenPick(2, 2)).toBeNull()
  })

  // The grid's bounds are kept by hand as the window moves; stale ones would
  // reject the ray before any hex outside the old window was tested.
  it('resolves hexes the window moved onto, and not the ones it left', () => {
    grid.moveWindow(
      () => false,
      spiral({ q: 7, r: 0 }, 2).map((hex) => ({
        hex,
        elevation: 1,
        color: new Color3(0.3, 0.3, 0.3),
      })),
    )
    scene.render()

    const hex = { q: 8, r: -1 }
    const screen = screenPositionOf(hex)
    expect(screenPick(screen.x, screen.y)).toEqual(hex)

    const left = screenPositionOf({ q: 0, r: 0 })
    expect(screenPick(left.x, left.y)).toBeNull()
  })

  // The flat prism sits empty until it takes over. The render loop's readiness
  // check still looks at it while empty, which settles its material's defines
  // without the per-hex colour, and nothing unsettles them: the map goes white.
  it('draws the flat prism in the per-hex colours', () => {
    const colourOn = (): unknown =>
      (grid.mesh.subMeshes[0].materialDefines as unknown as Record<string, unknown>).INSTANCESCOLOR

    scene.isReady(false)
    grid.setDetail(false)
    scene.render()
    expect(colourOn()).toBe(true)

    scene.isReady(false)
    grid.setDetail(true)
    scene.render()
    expect(colourOn()).toBe(true)
  })

  it('resolves hexes on the flat prism too', () => {
    grid.setDetail(false)
    scene.render()

    const hex = { q: 2, r: -1 }
    const screen = screenPositionOf(hex)
    expect(screenPick(screen.x, screen.y)).toEqual(hex)
  })
})

describe('hexFromPick', () => {
  it('returns null for a miss', () => {
    expect(hexFromPick(grid, null)).toBeNull()
  })
})
