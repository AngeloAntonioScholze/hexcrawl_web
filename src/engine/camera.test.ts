import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import { NullEngine } from '@babylonjs/core/Engines/nullEngine'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { Scene } from '@babylonjs/core/scene'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createIsoCamera, OrbitCamera, type IsoCamera } from './camera'

// Enough of a canvas for the rig: it only reads client dimensions and never
// touches a rendering context, which NullEngine provides.
const fakeCanvas = (width: number, height: number): HTMLCanvasElement =>
  ({ clientWidth: width, clientHeight: height }) as HTMLCanvasElement

let engine: NullEngine
let scene: Scene
let iso: IsoCamera

const settle = (frames = 200): void => {
  for (let i = 0; i < frames; i++) scene.onBeforeRenderObservable.notifyObservers(scene)
}

beforeEach(() => {
  engine = new NullEngine()
  scene = new Scene(engine)
  iso = createIsoCamera(scene, fakeCanvas(800, 400), { zoom: 40 })
})

afterEach(() => {
  iso.dispose()
  scene.dispose()
  engine.dispose()
})

describe('OrbitCamera', () => {
  const poses = [
    { alpha: -Math.PI / 2, beta: 0.8, radius: 100, target: new Vector3(0, 0, 0) },
    { alpha: 1.3, beta: 1.2, radius: 100, target: new Vector3(12, 0, -7) },
    { alpha: -4.1, beta: 0.4, radius: 35, target: new Vector3(-3, 2, 40) },
  ]

  it('sits where the ArcRotateCamera formula puts it', () => {
    for (const { alpha, beta, radius, target } of poses) {
      const camera = new OrbitCamera('orbit', alpha, beta, radius, target.clone(), scene)
      camera.getViewMatrix()
      expect(camera.position.x).toBeCloseTo(target.x + radius * Math.cos(alpha) * Math.sin(beta), 10)
      expect(camera.position.y).toBeCloseTo(target.y + radius * Math.cos(beta), 10)
      expect(camera.position.z).toBeCloseTo(target.z + radius * Math.sin(alpha) * Math.sin(beta), 10)
      camera.dispose()
    }
  })

  it('sees exactly what an ArcRotateCamera at the same pose sees', () => {
    for (const { alpha, beta, radius, target } of poses) {
      const orbit = new OrbitCamera('orbit', alpha, beta, radius, target.clone(), scene)
      const arc = new ArcRotateCamera('arc', alpha, beta, radius, target.clone(), scene)
      // ArcRotateCamera adds its (zero) screen offset, which turns -0 into 0.
      const entries = (camera: OrbitCamera | ArcRotateCamera): number[] =>
        camera.getViewMatrix().asArray().map((value) => value + 0)
      expect(entries(orbit)).toEqual(entries(arc))
      orbit.dispose()
      arc.dispose()
    }
  })

  it('follows a target moved in place', () => {
    const camera = new OrbitCamera('orbit', 1, 0.8, 100, Vector3.Zero(), scene)
    const before = camera.getViewMatrix().clone()
    camera.target.x = 10
    expect(camera.getViewMatrix().asArray()).not.toEqual(before.asArray())
    expect(camera.position.x).toBeCloseTo(10 + 100 * Math.cos(1) * Math.sin(0.8), 10)
    camera.dispose()
  })
})

describe('settling', () => {
  it('holds still until sent somewhere', () => {
    expect(iso.settling).toBe(false)
  })

  it('eases toward a new zoom, and stops once there', () => {
    iso.zoomBy(2)
    expect(iso.settling).toBe(true)
    settle()
    expect(iso.settling).toBe(false)
  })

  it('slides toward a point on the ground, and stops once there', () => {
    iso.focusOn(20, 20)
    expect(iso.settling).toBe(true)
    settle()
    expect(iso.settling).toBe(false)
  })
})

describe('setMaxZoom', () => {
  // A smaller world arriving under a pulled-back view: the very next window
  // check reads the zoom, so waiting for the smoothing to catch up is too late.
  it('pulls a view already wider than the new limit in at once', () => {
    iso.zoomBy(10)
    settle()
    expect(iso.zoom).toBeGreaterThan(100)

    iso.setMaxZoom(60)
    expect(iso.zoom).toBe(60)
    expect(iso.camera.orthoTop).toBe(60)

    settle()
    expect(iso.zoom).toBe(60)
  })

  it('leaves a view inside the new limit where it is', () => {
    iso.setMaxZoom(60)
    expect(iso.zoom).toBe(40)
  })
})

describe('projection', () => {
  it('is orthographic', () => {
    expect(iso.camera.mode).toBe(1)
  })

  it('derives all four planes from zoom and aspect', () => {
    iso.updateProjection(2)
    expect(iso.camera.orthoTop).toBe(40)
    expect(iso.camera.orthoBottom).toBe(-40)
    expect(iso.camera.orthoRight).toBe(80)
    expect(iso.camera.orthoLeft).toBe(-80)
  })

  it('keeps vertical extent fixed when aspect changes', () => {
    iso.updateProjection(0.5)
    expect(iso.camera.orthoTop).toBe(40)
    expect(iso.camera.orthoRight).toBe(20)
  })

  it('scales the frustum on zoom rather than moving the camera', () => {
    const radius = iso.camera.radius
    iso.zoomBy(0.5)
    settle()
    expect(iso.camera.orthoTop).toBeCloseTo(20, 6)
    expect(iso.camera.radius).toBe(radius)
  })

  it('clamps zoom to its configured range', () => {
    for (let i = 0; i < 40; i++) iso.zoomBy(0.5)
    settle()
    expect(iso.camera.orthoTop).toBeCloseTo(10, 6)

    for (let i = 0; i < 80; i++) iso.zoomBy(2)
    settle()
    expect(iso.camera.orthoTop).toBeCloseTo(200, 6)
  })
})

describe('tilt', () => {
  const betaAtZoom = (zoom: number): number => {
    const rig = createIsoCamera(scene, fakeCanvas(800, 400), { zoom })
    const beta = rig.camera.beta
    rig.dispose()
    return beta
  }

  it('drops toward the horizon as the view zooms in', () => {
    expect(betaAtZoom(11)).toBeGreaterThan(betaAtZoom(15))
    expect(betaAtZoom(15)).toBeGreaterThan(betaAtZoom(19))
  })

  it('holds the low angle at the closest zoom, which the rig clamps to', () => {
    const near = betaAtZoom(10)
    expect(betaAtZoom(4)).toBeCloseTo(near, 10)
    expect(betaAtZoom(11)).toBeLessThan(near)
  })

  it('holds the map angle at and above the far zoom', () => {
    const far = betaAtZoom(20)
    expect(betaAtZoom(60)).toBeCloseTo(far, 10)
    expect(betaAtZoom(200)).toBeCloseTo(far, 10)
  })

  it('honours a custom tilt band', () => {
    const rig = createIsoCamera(scene, fakeCanvas(800, 400), {
      zoom: 50,
      betaNearZoom: 40,
      betaFarZoom: 80,
    })
    // Halfway across the band on a log scale is zoom 56.6, so 50 is still short
    // of the far angle but past the near one.
    expect(rig.camera.beta).toBeLessThan(((90 - 15) * Math.PI) / 180)
    expect(rig.camera.beta).toBeGreaterThan(((90 - 49) * Math.PI) / 180)
    rig.dispose()
  })

  it('stays within the configured tilt range', () => {
    const near = ((90 - 15) * Math.PI) / 180
    const far = ((90 - 49) * Math.PI) / 180
    for (const zoom of [10, 14, 40, 120, 200]) {
      expect(betaAtZoom(zoom)).toBeGreaterThanOrEqual(far)
      expect(betaAtZoom(zoom)).toBeLessThanOrEqual(near)
    }
  })

  it('reaches 15 degrees above the horizon at the closest zoom', () => {
    expect(90 - (betaAtZoom(10) * 180) / Math.PI).toBeCloseTo(15, 6)
  })

  it('reaches 49 degrees above the horizon at the farthest zoom', () => {
    expect(90 - (betaAtZoom(200) * 180) / Math.PI).toBeCloseTo(49, 6)
  })

  it('honours custom tilt limits', () => {
    const rig = createIsoCamera(scene, fakeCanvas(800, 400), {
      zoom: 4,
      betaNear: 1.3,
      betaFar: 0.5,
    })
    expect(rig.camera.beta).toBeCloseTo(1.3, 6)
    rig.dispose()
  })

  it('follows the zoom as it eases, not in a jump', () => {
    // Started inside the tilt band, since outside it the angle is pinned and
    // would legitimately not move at all on the first frames of a zoom.
    const rig = createIsoCamera(scene, fakeCanvas(800, 400), { zoom: 18 })
    const start = rig.camera.beta

    rig.zoomBy(11 / 18)
    scene.onBeforeRenderObservable.notifyObservers(scene)
    const midway = rig.camera.beta
    for (let i = 0; i < 200; i++) scene.onBeforeRenderObservable.notifyObservers(scene)

    expect(midway).toBeGreaterThan(start)
    expect(midway).toBeLessThan(rig.camera.beta)
    rig.dispose()
  })
})

describe('rotation', () => {
  it('lands on a 60 degree step', () => {
    const start = iso.camera.alpha
    iso.rotate(1)
    settle()
    expect(iso.camera.alpha - start).toBeCloseTo(Math.PI / 3, 10)
  })

  it('returns to the starting orientation after six steps', () => {
    const start = iso.camera.alpha
    for (let i = 0; i < 6; i++) iso.rotate(1)
    settle()
    expect(iso.camera.alpha - start).toBeCloseTo(2 * Math.PI, 10)
  })

  it('rotates the other way for negative steps', () => {
    const start = iso.camera.alpha
    iso.rotate(-2)
    settle()
    expect(iso.camera.alpha - start).toBeCloseTo((-2 * Math.PI) / 3, 10)
  })

  it('eases toward the target instead of snapping instantly', () => {
    const start = iso.camera.alpha
    iso.rotate(1)
    scene.onBeforeRenderObservable.notifyObservers(scene)
    const afterOneFrame = iso.camera.alpha - start
    expect(afterOneFrame).toBeGreaterThan(0)
    expect(afterOneFrame).toBeLessThan(Math.PI / 3)
  })
})

describe('panning', () => {
  it('stays on the ground plane', () => {
    iso.panBy(120, -80)
    expect(iso.camera.target.y).toBeCloseTo(0, 10)
  })

  it('moves further per pixel when zoomed out', () => {
    iso.panBy(100, 0)
    const near = iso.camera.target.subtract(Vector3.Zero()).length()

    iso.camera.target.set(0, 0, 0)
    iso.zoomBy(4)
    settle()
    iso.panBy(100, 0)
    const far = iso.camera.target.length()

    expect(far).toBeGreaterThan(near)
  })

  it('respects pan bounds', () => {
    const bounded = createIsoCamera(scene, fakeCanvas(800, 400), {
      zoom: 40,
      panBounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
    })
    bounded.panBy(5000, 5000)
    expect(bounded.camera.target.x).toBeLessThanOrEqual(10)
    expect(bounded.camera.target.x).toBeGreaterThanOrEqual(-10)
    expect(bounded.camera.target.z).toBeLessThanOrEqual(10)
    expect(bounded.camera.target.z).toBeGreaterThanOrEqual(-10)
    bounded.dispose()
  })
})

describe('moveTo', () => {
  it('puts the view over the point on the same frame', () => {
    iso.moveTo(12, -7)
    expect(iso.camera.target.x).toBe(12)
    expect(iso.camera.target.z).toBe(-7)
  })

  it('keeps the view inside the pan bounds', () => {
    iso.setPanBounds({ minX: -10, maxX: 10, minZ: -10, maxZ: 10 })
    iso.moveTo(500, -500)
    expect(iso.camera.target.x).toBe(10)
    expect(iso.camera.target.z).toBe(-10)
  })

  it('calls off a focus slide already under way', () => {
    iso.focusOn(100, 100)
    settle(3)
    iso.moveTo(5, 5)
    settle()
    expect(iso.camera.target.x).toBe(5)
    expect(iso.camera.target.z).toBe(5)
  })
})

describe('dispose', () => {
  // Asserted behaviourally rather than by observer count: Babylon defers the
  // actual unregister until the next notify, so the array is still populated
  // immediately after remove() returns true.
  it('stops smoothing once disposed', () => {
    const extra = createIsoCamera(scene, fakeCanvas(800, 400), { zoom: 40 })
    const start = extra.camera.alpha
    extra.rotate(1)
    extra.dispose()
    settle()
    expect(extra.camera.alpha).toBe(start)
  })
})
