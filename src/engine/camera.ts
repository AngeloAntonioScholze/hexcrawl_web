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
  const maxZoom = options.maxZoom ?? 200
  const betaNear = options.betaNear ?? NEAR_BETA
  const betaFar = options.betaFar ?? FAR_BETA
  const betaNearZoom = options.betaNearZoom ?? NEAR_BETA_ZOOM
  const betaFarZoom = options.betaFarZoom ?? FAR_BETA_ZOOM
  const bounds = options.panBounds

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
