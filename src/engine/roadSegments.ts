import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector'
import { CreateBoxVertexData } from '@babylonjs/core/Meshes/Builders/boxBuilder'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import '@babylonjs/core/Meshes/thinInstanceMesh'
import type { Scene } from '@babylonjs/core/scene'
import { parseKey, type Axial, type HexKey } from '../hex/coords'
import { hexToWorld, type Layout } from '../hex/layout'
import { roadEdge, type Roads } from '../terrain/roads'
import { MIN_ELEVATION } from './hexGrid'
import type { ResourceView } from './resourceMarkers'

/** Packed earth: darker than the grass and the sand it crosses, warmer than rock. */
export const ROAD_COLOR = '#7a5530'

/** One stretch of road worth drawing, and whether each end lies flattened under the fog. */
export interface RoadSpan {
  a: HexKey
  b: HexKey
  buriedA: boolean
  buriedB: boolean
}

/** The DM sees every road; a player only stretches with both ends on explored ground. */
export function roadSpans(roads: Roads, view: ResourceView): RoadSpan[] {
  const spans: RoadSpan[] = []
  for (const road of roads) {
    const { a, b } = roadEdge(road)
    if (!view.dmView && !(view.explored.has(a) && view.explored.has(b))) continue
    spans.push({
      a,
      b,
      buriedA: view.fog && !view.explored.has(a),
      buriedB: view.fog && !view.explored.has(b),
    })
  }
  return spans
}

export interface HalfPlacement {
  x: number
  y: number
  z: number
  yaw: number
  length: number
}

/**
 * A stretch of road is laid as two halves, each flat on its own hex top from
 * the centre out to the shared edge: hex tops are level and the step between
 * them is a cliff, so one slab from centre to centre would sink into the
 * higher hex. Each half runs a little back past its centre, so the halves of
 * every road meeting there overlap into a joint.
 */
export function halfPlacement(
  layout: Layout,
  from: Axial,
  to: Axial,
  ground: number,
  width: number,
  thickness: number,
): HalfPlacement {
  const start = hexToWorld(layout, from)
  const end = hexToWorld(layout, to)
  const edge = { x: (start.x + end.x) / 2, z: (start.z + end.z) / 2 }
  const dx = edge.x - start.x
  const dz = edge.z - start.z
  const reach = Math.hypot(dx, dz)
  const back = width / 2
  const shift = (reach - back) / 2 / reach
  return {
    x: start.x + dx * shift,
    y: ground + thickness / 2,
    z: start.z + dz * shift,
    yaw: Math.atan2(dx, dz),
    length: reach + back,
  }
}

export interface RoadSegments {
  mesh: Mesh
  /** Halves standing right now; two to a stretch of road. */
  readonly count: number
  setSpans(spans: readonly RoadSpan[]): void
  dispose(): void
}

export interface RoadSegmentOptions {
  /** Road width, as a fraction of the hex size. */
  width?: number
  /** Slab thickness, as a fraction of the hex size. */
  thickness?: number
}

const DEFAULTS = { width: 0.16, thickness: 0.03 } as const

/** Every road as thin instances of one unit slab, the buffer rebuilt to fit on each set. */
export function createRoadSegments(
  scene: Scene,
  layout: Layout,
  elevationOf: (hex: Axial) => number,
  options: RoadSegmentOptions = {},
): RoadSegments {
  const width = layout.size * (options.width ?? DEFAULTS.width)
  const thickness = layout.size * (options.thickness ?? DEFAULTS.thickness)

  const mesh = new Mesh('roadSegments', scene)
  CreateBoxVertexData({ width, height: thickness, depth: 1 }).applyToMesh(mesh)
  mesh.isPickable = false

  const tint = Color3.FromHexString(ROAD_COLOR)
  const material = new StandardMaterial('roadSegments', scene)
  material.diffuseColor = tint
  material.emissiveColor = tint.scale(0.25)
  material.specularColor = Color3.Black()
  mesh.material = material

  const groundOf = (hex: Axial, buried: boolean): number =>
    buried ? MIN_ELEVATION : Math.max(MIN_ELEVATION, elevationOf(hex))

  const scaling = new Vector3(1, 1, 1)
  const translation = new Vector3()
  const rotation = new Quaternion()
  const matrix = new Matrix()
  let count = 0

  const segments: RoadSegments = {
    mesh,
    get count() {
      return count
    },

    setSpans(spans): void {
      const buffer = new Float32Array(spans.length * 2 * 16)
      let slot = 0
      const lay = (from: Axial, to: Axial, buried: boolean): void => {
        const half = halfPlacement(layout, from, to, groundOf(from, buried), width, thickness)
        scaling.z = half.length
        translation.set(half.x, half.y, half.z)
        Quaternion.RotationYawPitchRollToRef(half.yaw, 0, 0, rotation)
        Matrix.ComposeToRef(scaling, rotation, translation, matrix)
        matrix.copyToArray(buffer, slot * 16)
        slot += 1
      }

      for (const span of spans) {
        const a = parseKey(span.a)
        const b = parseKey(span.b)
        lay(a, b, span.buriedA)
        lay(b, a, span.buriedB)
      }

      mesh.thinInstanceSetBuffer('matrix', buffer, 16, true)
      count = slot
      mesh.isVisible = count > 0
      if (count > 0) mesh.thinInstanceRefreshBoundingInfo(false)
    },

    dispose(): void {
      material.dispose()
      mesh.dispose()
      count = 0
    },
  }

  segments.setSpans([])
  return segments
}
