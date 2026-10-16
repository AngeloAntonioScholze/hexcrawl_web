import { Material } from '@babylonjs/core/Materials/material'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector'
import type { Mesh } from '@babylonjs/core/Meshes/mesh'
import '@babylonjs/core/Meshes/thinInstanceMesh'
import type { Scene } from '@babylonjs/core/scene'
import { createHexPrismMesh } from './hexPrism'

/** How long a lid takes to blow out of sight, in milliseconds. */
export const LID_MS = 1300

/** How far a lid is carried along the ground, away from whoever saw under it. */
export const LID_DRIFT = 5

/** How high a lid is lifted on the gust. */
export const LID_RISE = 1.6

/** How far a lid has tumbled over by the time it is gone, in radians. */
export const LID_ROLL = 1.4 * Math.PI

/** How thick the lid of fog lifted off a hex is. */
const LID_THICKNESS = 0.12

/** Clear of the hex top it starts on, so the two faces never fight over the same pixels. */
const LIFT_OFF = 0.02

/** The share of its flight a lid stays solid for before it starts to thin out. */
const SOLID_FOR = 0.4

/** The share of its flight a lid takes to pale from the fog's colour to white. */
const PALE_BY = 0.6

/** How far each lid's heading and pace may stray, so a ring of them does not move as one. */
const HEADING_JITTER = 0.5
const PACE_JITTER = 0.25

/** The most lids in the air at once; a reveal past that drops the oldest. */
const MAX_LIDS = 600

const MATRIX = 16
const COLOR = 4

export interface LidPose {
  /** How far the lid has been carried along its heading. */
  drift: number
  /** Height of the lid's underside above the top of the hex it came off. */
  rise: number
  /** How far it has tipped over toward its heading, in radians. */
  roll: number
  alpha: number
  /** How far the lid has paled from the fog's colour toward white, 0 to 1. */
  pale: number
}

/**
 * Where a lid is this far through its flight, from 0 as it comes off to 1 as
 * it is gone. The gust catches the near edge first: the lid tips up and over
 * away from whoever saw under it, is lifted clear, and is carried off faster
 * and faster, paling to white and thinning out once it has left the hex so the
 * ground shows through.
 */
export function lidPose(t: number): LidPose {
  const at = Math.min(1, Math.max(0, t))
  const fade = at <= SOLID_FOR ? 1 : 1 - (at - SOLID_FOR) / (1 - SOLID_FOR)
  return {
    drift: LID_DRIFT * at ** 1.8,
    rise: LID_RISE * (1 - (1 - at) ** 2),
    roll: LID_ROLL * at ** 1.3,
    alpha: fade,
    pale: Math.min(1, at / PALE_BY),
  }
}

export interface FogLids {
  /**
   * Blows a lid of fog off the hex whose top stands at (x, top, z), along the
   * ground heading (dx, dz); a zero heading picks one at random.
   */
  lift(x: number, top: number, z: number, dx: number, dz: number, now?: number): void
  /** Moves every lid on to where it is at this moment, dropping those that are gone. */
  step(now: number): void
  /** Whether any lid is still in the air, and frames are needed to move it. */
  readonly active: boolean
  dispose(): void
}

interface Lid {
  x: number
  top: number
  z: number
  /** Unit heading along the ground. */
  dx: number
  dz: number
  pace: number
  start: number
}

/**
 * The fog coming off ground the party has just seen: each revealed hex sheds a
 * flat lid of fog that the wind tips over and carries off, leaving the terrain.
 */
export function createFogLids(
  scene: Scene,
  size: number,
  color: Color3,
  options: { layerMask?: number; random?: () => number } = {},
): FogLids {
  const random = options.random ?? Math.random
  const mesh: Mesh = createHexPrismMesh(scene, size, 'fogLids', { bevel: 0 })
  const material = new StandardMaterial('fogLids', scene)
  material.specularColor = Color3.Black()
  // The prism has no floor: a lid tumbled past upright shows its top's underside.
  material.backFaceCulling = false
  mesh.material = material
  mesh.hasVertexAlpha = true
  mesh.isPickable = false
  mesh.alwaysSelectAsActiveMesh = true
  if (options.layerMask !== undefined) mesh.layerMask = options.layerMask

  const matrices = new Float32Array(MAX_LIDS * MATRIX)
  const colors = new Float32Array(MAX_LIDS * COLOR)
  mesh.thinInstanceSetBuffer('matrix', matrices, MATRIX, false)
  mesh.thinInstanceSetBuffer('color', colors, COLOR, false)
  mesh.thinInstanceCount = 0
  // With no instances Babylon draws the bare prism itself, a white hex at the origin.
  mesh.isVisible = false

  const lids: Lid[] = []

  const write = (): void => {
    const shown = lids.length > 0
    // The material settled while the mesh stood empty, without the per-lid
    // colour; unsettled again, or every lid would draw plain white.
    if (shown && !mesh.isVisible) material.markAsDirty(Material.AttributesDirtyFlag)
    mesh.thinInstanceCount = lids.length
    mesh.isVisible = shown
    if (!shown) return
    mesh.thinInstancePartialBufferUpdate('matrix', lids.length, 0)
    mesh.thinInstancePartialBufferUpdate('color', lids.length, 0)
  }

  const scale = new Vector3(1, LID_THICKNESS, 1)
  const axis = new Vector3()
  const turn = new Quaternion()
  const at = new Vector3()
  const pose = new Matrix()

  return {
    lift(x, top, z, dx, dz, now = performance.now()): void {
      const heading =
        (dx !== 0 || dz !== 0 ? Math.atan2(dz, dx) : random() * 2 * Math.PI) +
        (random() - 0.5) * HEADING_JITTER
      if (lids.length === MAX_LIDS) lids.shift()
      lids.push({
        x,
        top,
        z,
        dx: Math.cos(heading),
        dz: Math.sin(heading),
        pace: 1 + (random() - 0.5) * PACE_JITTER,
        start: now,
      })
    },

    step(now): void {
      let kept = 0
      for (const lid of lids) {
        const t = ((now - lid.start) / LID_MS) * lid.pace
        if (t >= 1) continue
        lids[kept] = lid
        const { drift, rise, roll, alpha, pale } = lidPose(t)
        // Tipped about the level line across its heading, top turning toward it.
        axis.set(lid.dz, 0, -lid.dx)
        Quaternion.RotationAxisToRef(axis, roll, turn)
        at.set(lid.x + lid.dx * drift, lid.top + LIFT_OFF + rise, lid.z + lid.dz * drift)
        Matrix.ComposeToRef(scale, turn, at, pose)
        pose.copyToArray(matrices, kept * MATRIX)
        const c = kept * COLOR
        // Dark as the fog it was while it lies on the hex, catching the light
        // white as it is carried off.
        colors[c] = color.r + (1 - color.r) * pale
        colors[c + 1] = color.g + (1 - color.g) * pale
        colors[c + 2] = color.b + (1 - color.b) * pale
        colors[c + 3] = alpha
        kept++
      }
      lids.length = kept
      write()
    },

    get active() {
      return lids.length > 0
    },

    dispose(): void {
      material.dispose()
      mesh.dispose()
    },
  }
}
