import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData'
import type { Scene } from '@babylonjs/core/scene'
import { parseKey, type Axial, type HexKey } from '../hex/coords'
import { hexToWorld, type Layout } from '../hex/layout'
import { riverEdge, type RiverKey, type Rivers } from '../terrain/rivers'
import { MIN_ELEVATION } from './hexGrid'
import type { Point } from './roadSegments'
import type { ResourceView } from './resourceMarkers'

export const RIVER_COLOR = '#3f8fd6'

/** One stretch of river worth drawing, and whether each bank lies flattened under the fog. */
export interface RiverSpan {
  a: HexKey
  b: HexKey
  buriedA: boolean
  buriedB: boolean
  /** Where the DM's next tap would lay or lift river, not river itself. */
  preview: boolean
}

/**
 * The DM sees every river; a player sees one from either bank, since a river
 * running along the edge of the known map is in plain view from it.
 */
export function riverSpans(
  rivers: Rivers,
  view: ResourceView,
  hover: RiverKey | null = null,
): RiverSpan[] {
  const span = (key: RiverKey, preview: boolean): RiverSpan => {
    const { a, b } = riverEdge(key)
    return {
      a,
      b,
      buriedA: view.fog && !view.explored.has(a),
      buriedB: view.fog && !view.explored.has(b),
      preview,
    }
  }
  const spans: RiverSpan[] = []
  for (const river of rivers) {
    const { a, b } = riverEdge(river)
    if (!view.dmView && !view.explored.has(a) && !view.explored.has(b)) continue
    spans.push(span(river, false))
  }
  if (hover) spans.push(span(hover, true))
  return spans
}

/**
 * The side two neighbouring hexes share, end to end, in layout coordinates:
 * square across the line between their centres and one hex size long.
 */
export function sharedSide(layout: Layout, a: Axial, b: Axial): [Point, Point] {
  const from = hexToWorld(layout, a)
  const to = hexToWorld(layout, b)
  const mid = { x: (from.x + to.x) / 2, z: (from.z + to.z) / 2 }
  const dx = to.x - from.x
  const dz = to.z - from.z
  const length = Math.hypot(dx, dz)
  const half = layout.size / 2
  const along = { x: (-dz / length) * half, z: (dx / length) * half }
  return [
    { x: mid.x - along.x, z: mid.z - along.z },
    { x: mid.x + along.x, z: mid.z + along.z },
  ]
}

export interface RiverGeometry {
  positions: number[]
  indices: number[]
  colors: number[]
}

/** Across the ribbon, bank to bank: the edges fade so the water blends into the ground. */
const ACROSS = [-1, -0.55, 0, 0.55, 1] as const
const WATER = Color3.FromHexString('#3a86c8')
const MIDSTREAM = Color3.FromHexString('#5aa6e0')
const PREVIEW = Color3.FromHexString('#bfe3ff')
const SHADE: readonly [Color3, number][] = [
  [WATER, 0],
  [WATER, 0.9],
  [MIDSTREAM, 0.95],
  [WATER, 0.9],
  [WATER, 0],
]

/**
 * Every river laid as a flat ribbon along its side, level with the top of the
 * lower bank: water finds the low ground, and the higher bank's cliff simply
 * rises out of it. Each ribbon reaches a little past its corners so the
 * stretches of a river meet without a seam.
 */
export function buildRiverGeometry(
  layout: Layout,
  spans: readonly RiverSpan[],
  groundOf: (hex: HexKey, buried: boolean) => number,
  halfWidth: number,
): RiverGeometry {
  const geometry: RiverGeometry = { positions: [], indices: [], colors: [] }
  const { positions, indices, colors } = geometry
  const overhang = halfWidth * 0.5

  for (const span of spans) {
    const [start, end] = sharedSide(layout, parseKey(span.a), parseKey(span.b))
    const dx = end.x - start.x
    const dz = end.z - start.z
    const length = Math.hypot(dx, dz)
    const along = { x: dx / length, z: dz / length }
    const side = { x: -along.z, z: along.x }
    const y = Math.min(groundOf(span.a, span.buriedA), groundOf(span.b, span.buriedB))
    const ends = [
      { x: start.x - along.x * overhang, z: start.z - along.z * overhang },
      { x: end.x + along.x * overhang, z: end.z + along.z * overhang },
    ]

    const first = positions.length / 3
    for (const point of ends) {
      ACROSS.forEach((offset, column) => {
        const [shade, alpha] = SHADE[column]
        const color = span.preview ? PREVIEW : shade
        positions.push(
          point.x + side.x * offset * halfWidth,
          y,
          point.z + side.z * offset * halfWidth,
        )
        colors.push(color.r, color.g, color.b, span.preview ? alpha * 0.8 : alpha)
      })
    }
    const width = ACROSS.length
    for (let column = 0; column < width - 1; column++) {
      const a = first + column
      const b = a + width
      indices.push(a, b, a + 1, a + 1, b, b + 1)
    }
  }
  return geometry
}

export interface RiverSegments {
  mesh: Mesh
  /** Stretches of river drawn right now, the preview included. */
  readonly count: number
  setSpans(spans: readonly RiverSpan[]): void
  dispose(): void
}

export interface RiverSegmentOptions {
  /** River width, as a fraction of the hex size. */
  width?: number
}

const DEFAULTS = { width: 0.24 } as const

/**
 * Every river as one mesh, rebuilt whenever the rivers change and never in
 * between. Like the roads it is translucent, writes no depth and is pulled
 * toward the camera, so it lies on the lower bank's top like paint.
 */
export function createRiverSegments(
  scene: Scene,
  layout: Layout,
  elevationOf: (hex: Axial) => number,
  options: RiverSegmentOptions = {},
): RiverSegments {
  const halfWidth = (layout.size * (options.width ?? DEFAULTS.width)) / 2

  const mesh = new Mesh('riverSegments', scene)
  mesh.isPickable = false
  mesh.isVisible = false
  mesh.hasVertexAlpha = true
  mesh.alphaIndex = 0

  const material = new StandardMaterial('riverSegments', scene)
  material.specularColor = new Color3(0.35, 0.4, 0.45)
  material.specularPower = 48
  material.zOffset = -2
  material.disableDepthWrite = true
  mesh.material = material

  const groundOf = (hex: HexKey, buried: boolean): number =>
    buried ? MIN_ELEVATION : Math.max(MIN_ELEVATION, elevationOf(parseKey(hex)))

  let drawn = 0

  return {
    mesh,
    get count() {
      return drawn
    },

    setSpans(spans): void {
      drawn = spans.length
      mesh.isVisible = drawn > 0
      if (drawn === 0) return
      const geometry = buildRiverGeometry(layout, spans, groundOf, halfWidth)
      const data = new VertexData()
      data.positions = geometry.positions
      data.indices = geometry.indices
      data.colors = geometry.colors
      const normals: number[] = []
      VertexData.ComputeNormals(geometry.positions, geometry.indices, normals)
      data.normals = normals
      data.applyToMesh(mesh)
    },

    dispose(): void {
      material.dispose()
      mesh.dispose()
      drawn = 0
    },
  }
}
