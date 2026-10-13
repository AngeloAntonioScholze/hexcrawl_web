import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Matrix } from '@babylonjs/core/Maths/math.vector'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData'
import '@babylonjs/core/Meshes/thinInstanceMesh'
import type { Scene } from '@babylonjs/core/scene'
import { parseKey, type Axial, type HexKey } from '../hex/coords'
import { hexToWorld, type Layout } from '../hex/layout'
import type { Resource } from '../terrain/resources'
import { MIN_ELEVATION } from './hexGrid'

/** Violet: a colour none of the terrain bands come near, from deep water to the peaks. */
export const RESOURCE_MARKER_COLOR = '#d64cf2'

/** One hex worth marking, however many resources it holds. */
export interface ResourceMark {
  hex: HexKey
  count: number
  /** Under the fog, where the grid lays the hex flat. */
  buried: boolean
}

export interface ResourceView {
  dmView: boolean
  fog: boolean
  explored: ReadonlySet<HexKey>
}

/** The DM sees every resource; a player only those on ground the crawl has laid eyes on. */
export function resourceMarks(resources: readonly Resource[], view: ResourceView): ResourceMark[] {
  const counts = new Map<HexKey, number>()
  for (const resource of resources) {
    if (!view.dmView && !view.explored.has(resource.hex)) continue
    counts.set(resource.hex, (counts.get(resource.hex) ?? 0) + 1)
  }
  return [...counts].map(([hex, count]) => ({
    hex,
    count,
    buried: view.fog && !view.explored.has(hex),
  }))
}

export interface ResourceMarkerOptions {
  /** Width of the gem, as a fraction of the hex size. */
  size?: number
  /** Gap between the tile top and the gem's lower tip, as a fraction of the hex size. */
  hover?: number
}

const DEFAULTS = { size: 0.42, hover: 0.12 } as const

/** Off the centre of the hex, so a token standing there does not swallow the gem. */
const OFFSET = { x: 0.45, z: 0.3 }

/** How much bigger the gem grows for each extra resource on its hex. */
const GROWTH = 0.25
const MAX_GROWN = 3

export interface MarkPlacement {
  x: number
  y: number
  z: number
  scale: number
}

export function markPlacement(
  layout: Layout,
  mark: ResourceMark,
  elevationOf: (hex: Axial) => number,
  hover: number,
): MarkPlacement {
  const hex = parseKey(mark.hex)
  const world = hexToWorld(layout, hex)
  const ground = mark.buried ? MIN_ELEVATION : Math.max(MIN_ELEVATION, elevationOf(hex))
  return {
    x: world.x + OFFSET.x * layout.size,
    y: ground + hover,
    z: world.z + OFFSET.z * layout.size,
    scale: 1 + GROWTH * (Math.min(mark.count, MAX_GROWN) - 1),
  }
}

/** An octahedron stretched upright, lower tip at the origin, faces flat-shaded so it glints. */
export function buildGem(width: number, height: number): VertexData {
  const half = width / 2
  const middle = height * 0.45
  const rim: [number, number, number][] = [
    [half, middle, 0],
    [0, middle, half],
    [-half, middle, 0],
    [0, middle, -half],
  ]
  const top: [number, number, number] = [0, height, 0]
  const bottom: [number, number, number] = [0, 0, 0]

  const positions: number[] = []
  const indices: number[] = []
  const face = (a: number[], b: number[], c: number[]): void => {
    const start = positions.length / 3
    positions.push(...a, ...b, ...c)
    indices.push(start, start + 1, start + 2)
  }

  rim.forEach((point, i) => {
    const next = rim[(i + 1) % rim.length]
    face(top, point, next)
    face(bottom, next, point)
  })

  const normals: number[] = []
  VertexData.ComputeNormals(positions, indices, normals)

  const data = new VertexData()
  data.positions = positions
  data.indices = indices
  data.normals = normals
  return data
}

export interface ResourceMarkers {
  mesh: Mesh
  /** Gems standing right now. */
  readonly count: number
  setMarks(marks: readonly ResourceMark[]): void
  dispose(): void
}

/**
 * Every marked hex as a thin instance of one gem. The whole world's worth is a
 * few thousand instances of eight triangles, cheaper drawn whole than kept in
 * step with the grid's window, and the buffer is rebuilt to fit on every set,
 * so there is no capacity to run past.
 */
export function createResourceMarkers(
  scene: Scene,
  layout: Layout,
  elevationOf: (hex: Axial) => number,
  options: ResourceMarkerOptions = {},
): ResourceMarkers {
  const width = layout.size * (options.size ?? DEFAULTS.size)
  const hover = layout.size * (options.hover ?? DEFAULTS.hover)

  const mesh = new Mesh('resourceMarkers', scene)
  buildGem(width, width * 1.8).applyToMesh(mesh)
  mesh.isPickable = false

  const tint = Color3.FromHexString(RESOURCE_MARKER_COLOR)
  const material = new StandardMaterial('resourceMarkers', scene)
  material.diffuseColor = tint
  // Enough of its own light to read after dark and on the shaded side of a peak.
  material.emissiveColor = tint.scale(0.4)
  material.specularColor = new Color3(0.5, 0.5, 0.5)
  // Drawn whole whichever way the faces wind, so a winding slip cannot hollow it out.
  material.backFaceCulling = false
  mesh.material = material

  let count = 0
  const matrix = new Matrix()

  const markers: ResourceMarkers = {
    mesh,
    get count() {
      return count
    },

    setMarks(marks): void {
      const buffer = new Float32Array(marks.length * 16)
      marks.forEach((mark, index) => {
        const { x, y, z, scale } = markPlacement(layout, mark, elevationOf, hover)
        Matrix.ScalingToRef(scale, scale, scale, matrix)
        matrix.setTranslationFromFloats(x, y, z)
        matrix.copyToArray(buffer, index * 16)
      })
      mesh.thinInstanceSetBuffer('matrix', buffer, 16, true)
      count = marks.length
      mesh.isVisible = count > 0
      if (count > 0) mesh.thinInstanceRefreshBoundingInfo(false)
    },

    dispose(): void {
      material.dispose()
      mesh.dispose()
      count = 0
    },
  }

  markers.setMarks([])
  return markers
}
