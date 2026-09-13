import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import { Camera } from '@babylonjs/core/Cameras/camera'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import type { Scene } from '@babylonjs/core/scene'

// Tilt tracks zoom: pulled back the view flattens toward a map, pushed in it
// drops toward the horizon so elevation reads three-dimensionally. Beta is
// measured from straight down, so a larger angle is the more oblique view.
const degrees = (value: number): number => (value * Math.PI) / 180

// Stated as the angle above the horizon, which is how the view actually reads:
// 15 degrees is nearly eye-level, 49 is a high map view.
const NEAR_BETA = degrees(90 - 15)
const FAR_BETA = degrees(90 - 49)

// The tilt finishes swinging across this zoom band; outside it the angle holds,
// so the extremes of the zoom range stay at a settled, predictable view.
const NEAR_BETA_ZOOM = 10
const FAR_BETA_ZOOM = 20

// Hexes have six-fold symmetry, so rotation lands on an equivalent view every
// 60 degrees.
const ROTATION_STEP = Math.PI / 3

const SMOOTHING = 0.18
const SETTLED = 1e-4

export interface IsoCameraOptions {
  /** Half the world-space height visible on screen. */
  zoom?: number
  minZoom?: number
  maxZoom?: number
  /** Tilt at and below betaNearZoom, in radians from straight down. */
  betaNear?: number
  /** Tilt at and above betaFarZoom. */
  betaFar?: number
  /** Zoom at which the tilt reaches betaNear. */
  betaNearZoom?: number
  /** Zoom at which the tilt reaches betaFar. */
  betaFarZoom?: number
  target?: Vector3
  panBounds?: { minX: number; maxX: number; minZ: number; maxZ: number }
}

export interface IsoCamera {
  camera: ArcRotateCamera
  rotate(steps: number): void
  zoomBy(factor: number): void
  panBy(dxPixels: number, dyPixels: number): void
  /** Slides the view over a point on the ground; a drag calls it off. */
  focusOn(x: number, z: number): void
  /** Moves the fence the view may be dragged inside: a new world, a new rim. */
  setPanBounds(bounds: { minX: number; maxX: number; minZ: number; maxZ: number }): void
  /** How far back the view may be pulled; a bigger world is allowed more. */
  setMaxZoom(limit: number): void
  /** Half the world-space height on screen, which sets how much is in view. */
  readonly zoom: number
  updateProjection(aspect: number): void
  dispose(): void
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

export function createIsoCamera(
  scene: Scene,
  canvas: HTMLCanvasElement,
  options: IsoCameraOptions = {},
): IsoCamera {
  const minZoom = options.minZoom ?? 10
  let maxZoom = options.maxZoom ?? 200
  const betaNear = options.betaNear ?? NEAR_BETA
  const betaFar = options.betaFar ?? FAR_BETA
  const betaNearZoom = options.betaNearZoom ?? NEAR_BETA_ZOOM
  const betaFarZoom = options.betaFarZoom ?? FAR_BETA_ZOOM
  let bounds = options.panBounds

  // Zoom steps are multiplicative, so the tilt is interpolated on a log scale
  // or it would swing almost entirely within the last few clicks of the band.
  const betaSpan = Math.log(betaFarZoom) - Math.log(betaNearZoom)
  const betaFor = (value: number): number => {
    const t = betaSpan > 0 ? (Math.log(value) - Math.log(betaNearZoom)) / betaSpan : 1
    return betaNear + (betaFar - betaNear) * clamp(t, 0, 1)
  }

  const initialZoom = clamp(options.zoom ?? 40, minZoom, maxZoom)

  const camera = new ArcRotateCamera(
    'iso',
    -Math.PI / 2,
    betaFor(initialZoom),
    100,
    options.target?.clone() ?? Vector3.Zero(),
    scene,
  )
  camera.mode = Camera.ORTHOGRAPHIC_CAMERA
  camera.lowerBetaLimit = Math.min(betaNear, betaFar)
  camera.upperBetaLimit = Math.max(betaNear, betaFar)
  camera.minZ = -500
  camera.maxZ = 1000

  let zoom = initialZoom
  let targetZoom = zoom
  let targetAlpha = camera.alpha
  // Where the view is sliding to, or null when it is sitting where it was left.
  let focus: Vector3 | null = null
  let aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight)

  const applyProjection = (): void => {
    camera.orthoTop = zoom
    camera.orthoBottom = -zoom
    camera.orthoRight = zoom * aspect
    camera.orthoLeft = -zoom * aspect
    camera.beta = betaFor(zoom)
  }

  const clampTarget = (): void => {
    if (!bounds) return
    camera.target.x = clamp(camera.target.x, bounds.minX, bounds.maxX)
    camera.target.z = clamp(camera.target.z, bounds.minZ, bounds.maxZ)
  }

  const settle = (): void => {
    if (focus) {
      const gap = focus.subtract(camera.target)
      if (gap.length() < SETTLED) {
        camera.target.copyFrom(focus)
        focus = null
      } else {
        camera.target.addInPlace(gap.scale(SMOOTHING))
        clampTarget()
      }
    }

    const alphaGap = targetAlpha - camera.alpha
    const zoomGap = targetZoom - zoom
    if (Math.abs(alphaGap) < SETTLED && Math.abs(zoomGap) < SETTLED) {
      camera.alpha = targetAlpha
      zoom = targetZoom
      applyProjection()
      return
    }
    camera.alpha += alphaGap * SMOOTHING
    zoom += zoomGap * SMOOTHING
    applyProjection()
  }

  applyProjection()
  const observer = scene.onBeforeRenderObservable.add(settle)

  return {
    camera,

    rotate(steps: number): void {
      targetAlpha += steps * ROTATION_STEP
    },

    zoomBy(factor: number): void {
      targetZoom = clamp(targetZoom * factor, minZoom, maxZoom)
    },

    // Screen-space drag mapped onto the ground plane, so a dragged hex keeps
    // pace with the pointer regardless of the current rotation.
    panBy(dxPixels: number, dyPixels: number): void {
      // A hand on the map wins over whatever the turn was showing.
      focus = null
      const worldPerPixel = (2 * zoom) / Math.max(1, canvas.clientHeight)
      const forward = camera.getDirection(Vector3.Forward())
      forward.y = 0
      forward.normalize()
      const right = camera.getDirection(Vector3.Right())
      right.y = 0
      right.normalize()

      camera.target.addInPlace(right.scale(-dxPixels * worldPerPixel))
      camera.target.addInPlace(forward.scale(dyPixels * worldPerPixel))
      clampTarget()
    },

    focusOn(x: number, z: number): void {
      focus = new Vector3(x, camera.target.y, z)
    },

    setPanBounds(next): void {
      bounds = next
      clampTarget()
    },

    // A view already wider than the new limit is pulled back in rather than
    // left there: shrinking the world must not leave the grid overrun.
    setMaxZoom(limit): void {
      maxZoom = Math.max(minZoom, limit)
      targetZoom = clamp(targetZoom, minZoom, maxZoom)
      zoom = clamp(zoom, minZoom, maxZoom)
      applyProjection()
    },

    get zoom() {
      return zoom
    },

    updateProjection(nextAspect: number): void {
      aspect = nextAspect
      applyProjection()
    },

    dispose(): void {
      scene.onBeforeRenderObservable.remove(observer)
      camera.dispose()
    },
  }
}
