import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData'
import '@babylonjs/core/Meshes/thinInstanceMesh'
import type { Scene } from '@babylonjs/core/scene'
import type { Axial } from '../hex/coords'
import { hexToWorld, type Layout } from '../hex/layout'

/** One trail to draw, in the colour of whoever is walking it. */
export interface ArrowPath {
  hexes: readonly Axial[]
  /** CSS hex colour; the default arrow colour when left out. */
  color?: string
}

export interface RouteArrows {
  /** The mesh carrying the default colour; other colours get their own. */
  mesh: Mesh
  count: number
  setPath(hexes: readonly Axial[]): void
  /** Several trails at once, each drawn on its own rather than joined up. */
  setPaths(paths: readonly ArrowPath[]): void
  /** Advances the hover cycle; driven by the render loop. */
  advanceBob(seconds: number): void
  dispose(): void
}

export interface RouteArrowOptions {
  /** Arrow length as a fraction of the hex size. */
  length?: number
  /** Arrow width as a fraction of the hex size. */
  width?: number
  /** Arrow thickness as a fraction of the hex size. */
  thickness?: number
  /** Rounding of the top edge, as a fraction of the hex size. */
  bevel?: number
  /** Segments across the rounded edge. */
  bevelSegments?: number
  /** Clearance above the taller of the two hexes it sits between. */
  lift?: number
  /** Height of the hover cycle, as a fraction of the hex size. */
  bob?: number
  /** Seconds for one full hover cycle. */
  bobPeriod?: number
  color?: Color3
}

const DEFAULTS = {
  length: 0.6,
  width: 0.42,
  thickness: 0.16,
  bevel: 0.045,
  bevelSegments: 3,
  lift: 0.08,
  bob: 0.09,
  bobPeriod: 1.9,
} as const

// Warm orange: brighter and far more saturated than the muted amber trail it
// sits on, so the arrows separate from the tiles rather than blending in.
const ARROW_COLOR = new Color3(1, 0.47, 0.08)

// Miters can run away at the sharp tip, so the offset is capped; the blunting
// that causes is exactly the softening a rounded arrowhead wants anyway.
const MAX_MITER = 2.2

type Point = [number, number]

/** Shrinks a counter-clockwise outline inward by `inset`, mitring the corners. */
export function insetOutline(outline: readonly Point[], inset: number): Point[] {
  const count = outline.length

  return outline.map((point, i) => {
    const previous = outline[(i - 1 + count) % count]
    const next = outline[(i + 1) % count]

    const inward = (from: Point, to: Point): Point => {
      const dx = to[0] - from[0]
      const dz = to[1] - from[1]
      const length = Math.hypot(dx, dz) || 1
      return [-dz / length, dx / length]
    }

    const a = inward(previous, point)
    const b = inward(point, next)

    let bx = a[0] + b[0]
    let bz = a[1] + b[1]
    const length = Math.hypot(bx, bz)
    if (length < 1e-9) return [point[0], point[1]]
    bx /= length
    bz /= length

    const cosHalf = bx * a[0] + bz * a[1]
    const miter = Math.min(inset / Math.max(cosHalf, 1e-3), inset * MAX_MITER)

    return [point[0] + bx * miter, point[1] + bz * miter]
  })
}

// A solid chevron with a rounded top edge, pointing along +Z, which is what
// Matrix.RotationY treats as zero yaw.
export function buildArrowGeometry(
  length: number,
  width: number,
  thickness: number,
  bevel = 0,
  segments = 3,
): VertexData {
  const half = length / 2
  const outline: Point[] = [
    [0, half],
    [-width, -half],
    [0, -half * 0.25],
    [width, -half],
  ]

  const roll = Math.min(bevel, thickness * 0.6, width * 0.5)
  const steps = roll > 0 ? Math.max(1, segments) : 0

  // Quarter-round from the inset top cap out to the wall, then straight down.
  const rings: { outline: Point[]; y: number }[] = []
  for (let step = 0; step <= steps; step++) {
    const angle = steps === 0 ? Math.PI / 2 : (Math.PI / 2) * (step / steps)
    rings.push({
      outline: insetOutline(outline, roll * (1 - Math.sin(angle))),
      y: thickness - roll * (1 - Math.cos(angle)),
    })
  }
  rings.push({ outline, y: 0 })

  const positions: number[] = []
  const indices: number[] = []

  const cap = rings[0].outline
  for (const [x, z] of cap) positions.push(x, rings[0].y, z)
  for (const [x, z] of outline) positions.push(x, 0, z)

  // The outline winds counter-clockwise in XZ maths terms, so a fan in that
  // order faces up and the reverse faces down.
  for (let i = 1; i < outline.length - 1; i++) {
    indices.push(0, i, i + 1)
    indices.push(4, 4 + i + 1, 4 + i)
  }

  // Each side owns its vertices so it shades flat across the chevron, while
  // rings within a side are shared so the rounded edge shades smoothly.
  for (let edge = 0; edge < outline.length; edge++) {
    const next = (edge + 1) % outline.length
    const base = positions.length / 3

    for (const ring of rings) {
      positions.push(ring.outline[edge][0], ring.y, ring.outline[edge][1])
      positions.push(ring.outline[next][0], ring.y, ring.outline[next][1])
    }

    for (let ring = 0; ring < rings.length - 1; ring++) {
      const top = base + ring * 2
      const bottom = top + 2
      indices.push(top, bottom, top + 1, top + 1, bottom, bottom + 1)
    }
  }

  const normals: number[] = []
  VertexData.ComputeNormals(positions, indices, normals)

  const vertexData = new VertexData()
  vertexData.positions = positions
  vertexData.indices = indices
  vertexData.normals = normals
  return vertexData
}

export function createRouteArrows(
  scene: Scene,
  layout: Layout,
  elevationOf: (hex: Axial) => number,
  options: RouteArrowOptions = {},
): RouteArrows {
  const length = layout.size * (options.length ?? DEFAULTS.length)
  const width = layout.size * (options.width ?? DEFAULTS.width)
  const thickness = layout.size * (options.thickness ?? DEFAULTS.thickness)
  const bevel = layout.size * (options.bevel ?? DEFAULTS.bevel)
  const bevelSegments = options.bevelSegments ?? DEFAULTS.bevelSegments
  const lift = options.lift ?? DEFAULTS.lift
  const bobHeight = layout.size * (options.bob ?? DEFAULTS.bob)
  const bobPeriod = options.bobPeriod ?? DEFAULTS.bobPeriod
  const color = options.color ?? ARROW_COLOR

  const geometry = buildArrowGeometry(length, width, thickness, bevel, bevelSegments)

  /**
   * One mesh per colour. Thin instances of a mesh all wear its material, so a
   * trail in the party's colour and a trail in the caravan's cannot share one,
   * and the alternative — a material per arrow — is a draw call per arrow.
   */
  const meshes = new Map<string, Mesh>()

  const meshFor = (key: string, tint: Color3): Mesh => {
    const known = meshes.get(key)
    if (known) return known

    const made = new Mesh(key ? `routeArrows:${key}` : 'routeArrows', scene)
    geometry.applyToMesh(made)
    made.isPickable = false

    // Lit like the terrain so the solid shape reads, with a floor of emissive
    // so an arrow in shadow is still obvious.
    const material = new StandardMaterial(made.name, scene)
    material.diffuseColor = tint
    material.emissiveColor = tint.scale(0.35)
    material.specularColor = Color3.Black()
    made.material = material

    meshes.set(key, made)
    return made
  }

  const mesh = meshFor('', color)

  const scaling = Vector3.One()
  const translation = Vector3.Zero()
  let count = 0
  let phase = 0

  const arrows: RouteArrows = {
    mesh,
    get count() {
      return count
    },

    setPath(hexes): void {
      arrows.setPaths([{ hexes }])
    },

    // Grouped by colour, one instance buffer per group: every trail an entity
    // walks is drawn in the colour its token and its row in the panel wear.
    setPaths(paths): void {
      const byColor = new Map<string, number[]>()

      for (const path of paths) {
        const key = path.color ?? ''
        const matrices = byColor.get(key) ?? []
        byColor.set(key, matrices)

        for (let i = 0; i < path.hexes.length - 1; i++) {
          const from = path.hexes[i]
          const to = path.hexes[i + 1]
          const a = hexToWorld(layout, from)
          const b = hexToWorld(layout, to)

          // Sitting on the seam between the two hexes, clearing the taller one
          // so it never sinks into a climb.
          translation.set(
            (a.x + b.x) / 2,
            Math.max(elevationOf(from), elevationOf(to)) + lift,
            (a.z + b.z) / 2,
          )

          const yaw = Math.atan2(b.x - a.x, b.z - a.z)
          const slot = matrices.length
          matrices.length = slot + 16
          Matrix.Compose(
            scaling,
            Quaternion.RotationAxis(Vector3.Up(), yaw),
            translation,
          ).copyToArray(matrices, slot)
        }
      }

      count = 0
      // Colours nobody is walking this frame are emptied rather than disposed:
      // the same few entities keep taking their trails back.
      for (const key of new Set([...meshes.keys(), ...byColor.keys()])) {
        const drawn = byColor.get(key) ?? []
        const target = key === '' ? mesh : meshFor(key, Color3.FromHexString(key))
        target.thinInstanceSetBuffer('matrix', new Float32Array(drawn), 16, false)
        target.isVisible = drawn.length > 0
        count += drawn.length / 16
      }
    },

    // Thin instance matrices are multiplied by the mesh's own world matrix, so
    // moving the node bobs every arrow at once with no buffer upload.
    advanceBob(seconds): void {
      phase = (phase + seconds / bobPeriod) % 1
      const height = count > 0 ? Math.sin(phase * Math.PI * 2) * bobHeight : 0
      for (const one of meshes.values()) one.position.y = height
    },

    dispose(): void {
      scene.onBeforeRenderObservable.remove(observer)
      for (const one of meshes.values()) {
        one.material?.dispose()
        one.dispose()
      }
      meshes.clear()
    },
  }

  const observer = scene.onBeforeRenderObservable.add(() => {
    arrows.advanceBob(scene.getEngine().getDeltaTime() / 1000)
  })

  arrows.setPath([])
  return arrows
}
