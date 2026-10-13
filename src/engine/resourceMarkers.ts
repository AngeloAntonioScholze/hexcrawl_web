import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector'
import { CreateBoxVertexData } from '@babylonjs/core/Meshes/Builders/boxBuilder'
import { CreateCylinderVertexData } from '@babylonjs/core/Meshes/Builders/cylinderBuilder'
import { CreateSphereVertexData } from '@babylonjs/core/Meshes/Builders/sphereBuilder'
import { CreateTorusVertexData } from '@babylonjs/core/Meshes/Builders/torusBuilder'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData'
import '@babylonjs/core/Meshes/thinInstanceMesh'
import type { Scene } from '@babylonjs/core/scene'
import { parseKey, type Axial, type HexKey } from '../hex/coords'
import { hexToWorld, type Layout } from '../hex/layout'
import { RESOURCE_TYPES, type Resource, type ResourceType } from '../terrain/resources'
import { MIN_ELEVATION } from './hexGrid'

/** Violet: a colour none of the terrain bands come near, from deep water to the peaks. */
export const RESOURCE_MARKER_COLOR = '#d64cf2'

/** One hex worth marking, with every kind of resource it holds. */
export interface ResourceMark {
  hex: HexKey
  /** Each kind once, in the order of RESOURCE_TYPES. */
  types: readonly ResourceType[]
  /** Under the fog, where the grid lays the hex flat. */
  buried: boolean
}

export interface ResourceView {
  dmView: boolean
  fog: boolean
  explored: ReadonlySet<HexKey>
}

const TYPE_ORDER = new Map(RESOURCE_TYPES.map((type, index) => [type, index]))

/** The DM sees every resource; a player only those on ground the crawl has laid eyes on. */
export function resourceMarks(resources: readonly Resource[], view: ResourceView): ResourceMark[] {
  const held = new Map<HexKey, Set<ResourceType>>()
  for (const resource of resources) {
    if (!view.dmView && !view.explored.has(resource.hex)) continue
    const types = held.get(resource.hex)
    if (types) types.add(resource.type)
    else held.set(resource.hex, new Set([resource.type]))
  }
  return [...held].map(([hex, types]) => ({
    hex,
    types: [...types].sort((a, b) => TYPE_ORDER.get(a)! - TYPE_ORDER.get(b)!),
    buried: view.fog && !view.explored.has(hex),
  }))
}

export interface ResourceMarkerOptions {
  /** Width of one model, as a fraction of the hex size. */
  size?: number
  /** Gap between the tile top and a model's base, as a fraction of the hex size. */
  hover?: number
}

const DEFAULTS = { size: 0.42, hover: 0.03 } as const

/** Off the centre of the hex, so a token standing there does not swallow the models. */
const OFFSET = { x: 0.45, z: 0.3 }

/** Past this many kinds on one hex the rest go unshown: the hex panel lists them all. */
export const MAX_CLUSTER = 3

/** How far a clustered model stands from the offset point, as a fraction of the hex size. */
const CLUSTER_RADIUS = 0.17

/** A clustered model shrinks a little, so the cluster stays inside its hex. */
const CLUSTER_SCALE = 0.75

export interface MarkPlacement {
  type: ResourceType
  x: number
  y: number
  z: number
  scale: number
}

/** Where each kind on a marked hex stands: alone on the offset point, or around it. */
export function markPlacements(
  layout: Layout,
  mark: ResourceMark,
  elevationOf: (hex: Axial) => number,
  hover: number,
): MarkPlacement[] {
  const hex = parseKey(mark.hex)
  const world = hexToWorld(layout, hex)
  const y = (mark.buried ? MIN_ELEVATION : Math.max(MIN_ELEVATION, elevationOf(hex))) + hover
  const x = world.x + OFFSET.x * layout.size
  const z = world.z + OFFSET.z * layout.size
  const shown = mark.types.slice(0, MAX_CLUSTER)
  if (shown.length === 1) return [{ type: shown[0], x, y, z, scale: 1 }]

  const radius = CLUSTER_RADIUS * layout.size
  return shown.map((type, index) => {
    const angle = Math.PI / 2 + (2 * Math.PI * index) / shown.length
    return {
      type,
      x: x + radius * Math.cos(angle),
      y,
      z: z + radius * Math.sin(angle),
      scale: CLUSTER_SCALE,
    }
  })
}

/** Every mark's models, gathered by kind so each kind fills one thin instance buffer. */
export function placementsByType(
  layout: Layout,
  marks: readonly ResourceMark[],
  elevationOf: (hex: Axial) => number,
  hover: number,
): Record<ResourceType, MarkPlacement[]> {
  const byType = Object.fromEntries(RESOURCE_TYPES.map((type) => [type, []])) as unknown as Record<
    ResourceType,
    MarkPlacement[]
  >
  for (const mark of marks) {
    for (const placed of markPlacements(layout, mark, elevationOf, hover)) {
      byType[placed.type].push(placed)
    }
  }
  return byType
}

export function instanceBuffer(placements: readonly MarkPlacement[]): Float32Array {
  const buffer = new Float32Array(placements.length * 16)
  const matrix = new Matrix()
  placements.forEach(({ x, y, z, scale }, index) => {
    Matrix.ScalingToRef(scale, scale, scale, matrix)
    matrix.setTranslationFromFloats(x, y, z)
    matrix.copyToArray(buffer, index * 16)
  })
  return buffer
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

type Triple = readonly [number, number, number]

interface Pose {
  at?: Triple
  /** Euler angles in radians, about x, y and z. */
  turn?: Triple
  stretch?: Triple
}

/** A primitive moved into place and painted one colour throughout. */
function part(data: VertexData, color: Triple, { at, turn, stretch }: Pose = {}): VertexData {
  data.transform(
    Matrix.Compose(
      new Vector3(...(stretch ?? [1, 1, 1])),
      Quaternion.FromEulerAngles(...(turn ?? [0, 0, 0])),
      new Vector3(...(at ?? [0, 0, 0])),
    ),
  )
  const colors: number[] = []
  for (let i = 0; i < data.positions!.length; i += 3) colors.push(...color, 1)
  data.colors = colors
  return data
}

const box = (width: number, height: number, depth: number): VertexData =>
  CreateBoxVertexData({ width, height, depth })

const cylinder = (height: number, bottom: number, top = bottom, sides = 8): VertexData =>
  CreateCylinderVertexData({
    height,
    diameterBottom: bottom,
    diameterTop: top,
    tessellation: sides,
  })

const ball = (diameter: number): VertexData => CreateSphereVertexData({ diameter, segments: 4 })

const ring = (diameter: number, thickness: number): VertexData =>
  CreateTorusVertexData({ diameter, thickness, tessellation: 14 })

/** A cylinder turned by this about z lies along x. */
const LYING = Math.PI / 2

/** Each kind's model at unit width, standing on the origin, painted by vertex. */
const MODELS: Readonly<Record<ResourceType, () => VertexData[]>> = {
  timber: () => {
    const bark: Triple = [0.48, 0.29, 0.14]
    const heart: Triple = [0.88, 0.7, 0.44]
    const logs: Triple[] = [
      [0, 0.13, -0.14],
      [0, 0.13, 0.14],
      [0, 0.36, 0],
    ]
    return logs.flatMap(([x, y, z]) => [
      part(cylinder(0.85, 0.26), bark, { at: [x, y, z], turn: [0, 0, LYING] }),
      ...[-1, 1].map((end) =>
        part(cylinder(0.02, 0.2), heart, { at: [end * 0.43, y, z], turn: [0, 0, LYING] }),
      ),
    ])
  },

  herbs: () => {
    const leaf: Triple = [0.3, 0.72, 0.25]
    const sprigs = Array.from({ length: 5 }, (_, i) => {
      const angle = (2 * Math.PI * i) / 5
      const height = 0.32 + 0.08 * (i % 2)
      return part(cylinder(height, 0.14, 0, 5), leaf, {
        at: [0.17 * Math.cos(angle), height / 2, 0.17 * Math.sin(angle)],
        turn: [0.3 * Math.sin(angle), 0, -0.3 * Math.cos(angle)],
      })
    })
    return [
      ...sprigs,
      part(cylinder(0.5, 0.16, 0, 5), [0.22, 0.6, 0.2], { at: [0, 0.25, 0] }),
      part(ball(0.1), [0.96, 0.84, 0.3], { at: [0, 0.5, 0] }),
    ]
  },

  game: () => {
    const hide: Triple = [0.62, 0.4, 0.2]
    const antler: Triple = [0.93, 0.87, 0.7]
    const legs = [-1, 1].flatMap((x) =>
      [-1, 1].map((z) => part(box(0.05, 0.32, 0.05), hide, { at: [x * 0.17, 0.16, z * 0.06] })),
    )
    const antlers = [-1, 1].flatMap((side) => [
      part(box(0.03, 0.26, 0.03), antler, {
        at: [0.3, 0.9, side * 0.07],
        turn: [side * 0.4, 0, 0],
      }),
      part(box(0.03, 0.14, 0.03), antler, {
        at: [0.36, 0.9, side * 0.07],
        turn: [side * 0.3, 0, -0.7],
      }),
    ])
    return [
      ...legs,
      part(box(0.48, 0.2, 0.18), hide, { at: [0, 0.41, 0] }),
      part(box(0.08, 0.26, 0.08), hide, { at: [0.23, 0.58, 0], turn: [0, 0, -0.45] }),
      part(box(0.18, 0.1, 0.1), hide, { at: [0.33, 0.72, 0] }),
      part(box(0.06, 0.1, 0.04), [0.95, 0.92, 0.85], { at: [-0.25, 0.47, 0], turn: [0, 0, 0.5] }),
      ...antlers,
    ]
  },

  clay: () => {
    const fired: Triple = [0.8, 0.48, 0.22]
    return [
      part(ball(0.5), fired, { at: [0, 0.19, 0], stretch: [1, 0.75, 1] }),
      part(cylinder(0.14, 0.26, 0.22), fired, { at: [0, 0.4, 0] }),
      part(ring(0.26, 0.06), [0.64, 0.35, 0.16], { at: [0, 0.47, 0] }),
    ]
  },

  iron: () => {
    const ore: Triple = [0.42, 0.44, 0.5]
    const rust: Triple = [0.72, 0.36, 0.18]
    return [
      part(box(0.3, 0.24, 0.26), ore, { at: [-0.08, 0.12, 0], turn: [0.2, 0.5, 0.15] }),
      part(box(0.24, 0.2, 0.2), ore, { at: [0.15, 0.1, 0.08], turn: [-0.3, 1.1, 0.2] }),
      part(box(0.2, 0.18, 0.18), ore, { at: [0.02, 0.3, -0.04], turn: [0.6, 0.2, 0.5] }),
      part(box(0.08, 0.06, 0.08), rust, { at: [-0.1, 0.25, 0.1], turn: [0, 0.4, 0] }),
      part(box(0.07, 0.05, 0.07), rust, { at: [0.2, 0.2, -0.04], turn: [0.3, 0, 0] }),
    ]
  },

  stone: () => {
    const block: Triple = [0.7, 0.69, 0.66]
    return [
      part(box(0.36, 0.18, 0.28), block, { at: [-0.19, 0.09, 0] }),
      part(box(0.36, 0.18, 0.28), [0.62, 0.61, 0.58], { at: [0.19, 0.09, 0] }),
      part(box(0.38, 0.18, 0.28), [0.8, 0.79, 0.76], { at: [0, 0.27, 0], turn: [0, 0.25, 0] }),
      part(box(0.2, 0.14, 0.18), block, { at: [0.02, 0.43, 0], turn: [0, -0.4, 0] }),
    ]
  },

  // The gem keeps floating clear of its tile, as the one marker did before every kind had its own.
  gems: () => [part(buildGem(1, 1.8), [0.84, 0.3, 0.95], { at: [0, 0.2, 0] })],

  rareOre: () => {
    const rock: Triple = [0.14, 0.11, 0.18]
    const vein: Triple = [1, 0.55, 0.18]
    return [
      part(box(0.34, 0.26, 0.3), rock, { at: [-0.06, 0.13, 0], turn: [0.15, 0.4, 0.1] }),
      part(box(0.24, 0.22, 0.22), rock, { at: [0.16, 0.24, 0.06], turn: [-0.2, 1.2, 0.35] }),
      part(box(0.36, 0.04, 0.05), vein, { at: [-0.04, 0.2, 0.15], turn: [0, 0.4, 0.4] }),
      part(box(0.05, 0.3, 0.04), vein, { at: [0.12, 0.2, -0.13], turn: [0.2, 0, -0.3] }),
      part(box(0.04, 0.04, 0.32), vein, { at: [-0.18, 0.27, 0.02], turn: [0.3, 0.4, 0] }),
    ]
  },

  crystal: () => {
    const pale: Triple = [0.78, 0.93, 1]
    const spike = (height: number, x: number, z: number, lean: Triple): VertexData =>
      part(cylinder(height, 0.17, 0, 6), pale, { at: [x, height / 2 - 0.04, z], turn: lean })
    return [
      spike(0.9, 0, 0, [0, 0, 0]),
      spike(0.62, 0.13, 0.05, [0.2, 0, -0.45]),
      spike(0.55, -0.12, 0.07, [0.35, 0, 0.4]),
      spike(0.45, 0, -0.13, [-0.5, 0, 0]),
    ]
  },

  salt: () => {
    const white: Triple = [0.97, 0.97, 0.99]
    return [
      part(ball(0.62), white, { at: [0, 0.03, 0], stretch: [1, 0.55, 1] }),
      part(box(0.1, 0.1, 0.1), [0.86, 0.9, 0.96], { at: [0.02, 0.2, 0], turn: [0.6, 0.6, 0] }),
      part(box(0.08, 0.08, 0.08), white, { at: [0.15, 0.13, 0.08], turn: [0.3, 0.9, 0.4] }),
      part(box(0.07, 0.07, 0.07), white, { at: [-0.14, 0.12, -0.06], turn: [0.7, 0.2, 0.5] }),
    ]
  },

  glassSand: () => {
    const shine: Triple = [0.78, 0.96, 1]
    return [
      part(ball(0.6), [0.96, 0.88, 0.62], { at: [0, 0.02, 0], stretch: [1.25, 0.42, 0.85] }),
      part(box(0.09, 0.02, 0.09), shine, { at: [0.08, 0.13, 0.02], turn: [0.2, 0.7, 0.1] }),
      part(box(0.07, 0.02, 0.07), shine, { at: [-0.14, 0.1, 0.05], turn: [-0.2, 0.3, 0.2] }),
      part(box(0.06, 0.02, 0.06), shine, { at: [0.02, 0.11, -0.12], turn: [0.3, 1.1, -0.2] }),
    ]
  },

  fish: () => {
    const scales: Triple = [0.55, 0.7, 0.86]
    return [
      part(cylinder(0.06, 0.52, 0.52, 10), [0.56, 0.39, 0.22], { at: [0, 0.03, 0] }),
      part(ball(0.3), scales, { at: [0.04, 0.15, 0], stretch: [1.4, 0.6, 0.45] }),
      part(cylinder(0.16, 0.16, 0, 4), scales, {
        at: [-0.24, 0.15, 0],
        turn: [0, 0, -LYING],
        stretch: [1, 1, 0.3],
      }),
      part(ball(0.04), [0.1, 0.1, 0.12], { at: [0.22, 0.18, 0.05] }),
    ]
  },

  pearls: () => {
    const shell: Triple = [0.88, 0.66, 0.62]
    return [
      part(ball(0.46), shell, { at: [0, 0.05, 0], stretch: [1, 0.3, 1] }),
      part(ball(0.46), [0.8, 0.58, 0.55], {
        at: [-0.1, 0.24, 0],
        turn: [0, 0, 1],
        stretch: [1, 0.3, 1],
      }),
      part(ball(0.17), [1, 0.97, 0.93], { at: [0.06, 0.15, 0] }),
    ]
  },

  whales: () => {
    const skin: Triple = [0.27, 0.33, 0.46]
    return [
      part(ring(0.42, 0.07), [0.88, 0.94, 1], { at: [0, 0.02, 0] }),
      part(cylinder(0.48, 0.2, 0.07), skin, { at: [0, 0.24, 0], turn: [0, 0, 0.12] }),
      ...[-1, 1].map((side) =>
        part(box(0.3, 0.04, 0.14), skin, {
          at: [side * 0.14 + 0.03, 0.52, 0],
          turn: [0, 0, side * 0.4],
        }),
      ),
    ]
  },
}

/** Glassy kinds catch the light; the rest stay matte enough to read as earth and wood. */
const GLINT: ReadonlySet<ResourceType> = new Set(['gems', 'crystal', 'glassSand', 'pearls', 'salt'])

/**
 * How much of its own light each kind keeps after dark. The rare ore is near
 * black, so a strong glow lights only its vein.
 */
const GLOW: Partial<Record<ResourceType, number>> = { rareOre: 0.9, gems: 0.45, crystal: 0.5 }
const DEFAULT_GLOW = 0.35

/** One kind's model, `width` across, standing on the origin and painted by vertex. */
export function buildResourceModel(type: ResourceType, width: number): VertexData {
  const [first, ...rest] = MODELS[type]()
  if (rest.length > 0) first.merge(rest)
  return first.transform(Matrix.Scaling(width, width, width))
}

export interface ResourceMarkers {
  meshes: Readonly<Record<ResourceType, Mesh>>
  /** Models standing right now, across every kind. */
  readonly count: number
  setMarks(marks: readonly ResourceMark[]): void
  dispose(): void
}

/**
 * One mesh a kind, every hex holding that kind a thin instance of it. The whole
 * world's worth is a couple of thousand small models, cheaper drawn whole than
 * kept in step with the grid's window, and each buffer is rebuilt to fit on
 * every set, so there is no capacity to run past.
 */
export function createResourceMarkers(
  scene: Scene,
  layout: Layout,
  elevationOf: (hex: Axial) => number,
  options: ResourceMarkerOptions = {},
): ResourceMarkers {
  const width = layout.size * (options.size ?? DEFAULTS.size)
  const hover = layout.size * (options.hover ?? DEFAULTS.hover)

  const materials: StandardMaterial[] = []
  const meshes = Object.fromEntries(
    RESOURCE_TYPES.map((type) => {
      const mesh = new Mesh(`resourceMarkers:${type}`, scene)
      buildResourceModel(type, width).applyToMesh(mesh)
      mesh.isPickable = false

      const material = new StandardMaterial(`resourceMarkers:${type}`, scene)
      material.diffuseColor = Color3.White()
      // Enough of its own light to read after dark and on the shaded side of a peak.
      material.emissiveColor = Color3.White().scale(GLOW[type] ?? DEFAULT_GLOW)
      material.specularColor = Color3.White().scale(GLINT.has(type) ? 0.6 : 0.15)
      // Drawn whole whichever way the faces wind, so a winding slip cannot hollow it out.
      material.backFaceCulling = false
      mesh.material = material
      materials.push(material)
      return [type, mesh]
    }),
  ) as Record<ResourceType, Mesh>

  let count = 0

  const markers: ResourceMarkers = {
    meshes,
    get count() {
      return count
    },

    setMarks(marks): void {
      const byType = placementsByType(layout, marks, elevationOf, hover)
      count = 0
      for (const type of RESOURCE_TYPES) {
        const mesh = meshes[type]
        const placements = byType[type]
        mesh.thinInstanceSetBuffer('matrix', instanceBuffer(placements), 16, true)
        mesh.isVisible = placements.length > 0
        if (placements.length > 0) mesh.thinInstanceRefreshBoundingInfo(false)
        count += placements.length
      }
    },

    dispose(): void {
      for (const material of materials) material.dispose()
      for (const type of RESOURCE_TYPES) meshes[type].dispose()
      count = 0
    },
  }

  markers.setMarks([])
  return markers
}
