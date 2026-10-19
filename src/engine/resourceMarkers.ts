import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color'
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector'
import { CreateBoxVertexData } from '@babylonjs/core/Meshes/Builders/boxBuilder'
import { CreateCylinderVertexData } from '@babylonjs/core/Meshes/Builders/cylinderBuilder'
import { CreateSphereVertexData } from '@babylonjs/core/Meshes/Builders/sphereBuilder'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData'
import '@babylonjs/core/Meshes/thinInstanceMesh'
import type { Scene } from '@babylonjs/core/scene'
import { parseKey, type Axial, type HexKey } from '../hex/coords'
import { hexToWorld, type Layout } from '../hex/layout'
import { RESOURCE_TYPES, type Resource, type ResourceType } from '../terrain/resources'
import { MIN_ELEVATION } from './hexGrid'
import { CARAVAN_WIDTH } from './partyToken'

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
export function resourceMarks(
  resources: readonly Pick<Resource, 'hex' | 'type'>[],
  view: ResourceView,
): ResourceMark[] {
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
  /** Gap between the tile top and a model's base, as a fraction of the hex size. */
  hover?: number
}

const DEFAULTS = { hover: 0.03 } as const

/** A model's width as a fraction of the hex size: as wide as a caravan token, so it reads at the same glance. */
export const FOOTPRINT = CARAVAN_WIDTH

export interface MarkPlacement {
  type: ResourceType
  x: number
  y: number
  z: number
  /** Turn about the vertical, in radians. */
  yaw: number
}

/** A fixed number in [0, 1) for a hex, so its model faces the same way every frame. */
function jitter(hex: Axial): number {
  let h = Math.imul(hex.q, 0x27d4eb2d) ^ Math.imul(hex.r, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 2 ** 32
}

/**
 * One model in the middle of the hex, of its first kind: the hex panel lists
 * the rest.
 */
export function markPlacement(
  layout: Layout,
  mark: ResourceMark,
  elevationOf: (hex: Axial) => number,
  hover: number,
): MarkPlacement {
  const hex = parseKey(mark.hex)
  const world = hexToWorld(layout, hex)
  return {
    type: mark.types[0],
    x: world.x,
    y: (mark.buried ? MIN_ELEVATION : Math.max(MIN_ELEVATION, elevationOf(hex))) + hover,
    z: world.z,
    yaw: 2 * Math.PI * jitter(hex),
  }
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
    const placed = markPlacement(layout, mark, elevationOf, hover)
    byType[placed.type].push(placed)
  }
  return byType
}

export function instanceBuffer(placements: readonly MarkPlacement[]): Float32Array {
  const buffer = new Float32Array(placements.length * 16)
  const matrix = new Matrix()
  const scaling = Vector3.One()
  const turn = new Quaternion()
  const translation = new Vector3()
  placements.forEach(({ x, y, z, yaw }, index) => {
    Quaternion.RotationYawPitchRollToRef(yaw, 0, 0, turn)
    Matrix.ComposeToRef(scaling, turn, translation.copyFromFloats(x, y, z), matrix)
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

/** A primitive moved into place and painted one colour throughout, or left with its own. */
function part(
  data: VertexData,
  color: Triple | null,
  { at, turn, stretch }: Pose = {},
): VertexData {
  data.transform(
    Matrix.Compose(
      new Vector3(...(stretch ?? [1, 1, 1])),
      Quaternion.FromEulerAngles(...(turn ?? [0, 0, 0])),
      new Vector3(...(at ?? [0, 0, 0])),
    ),
  )
  // Painted, never textured; and the gem has no uvs, which merging would refuse.
  data.uvs = null
  if (color) {
    const colors: number[] = []
    for (let i = 0; i < data.positions!.length; i += 3) colors.push(...color, 1)
    data.colors = colors
  }
  return data
}

const box = (width: number, height: number, depth: number): VertexData =>
  CreateBoxVertexData({ width, height, depth })

const cylinder = (height: number, bottom: number, top = bottom, sides = 6): VertexData =>
  CreateCylinderVertexData({
    height,
    diameterBottom: bottom,
    diameterTop: top,
    tessellation: sides,
  })

/** A cylinder whose two ends are painted apart from its side: cut wood, a float's cap. */
const banded = (height: number, diameter: number, side: Triple, ends: Triple, sides = 6) =>
  CreateCylinderVertexData({
    height,
    diameter,
    tessellation: sides,
    faceColors: [ends, side, ends].map(([r, g, b]) => new Color4(r, g, b, 1)),
  })

/** A cylinder turned by this about z lies along x. */
const LYING = Math.PI / 2

/** A thin box from one point on the ground to another, a little above it. */
function rope(from: readonly [number, number], to: readonly [number, number], color: Triple) {
  const [dx, dz] = [to[0] - from[0], to[1] - from[1]]
  return part(box(Math.hypot(dx, dz), 0.012, 0.012), color, {
    at: [(from[0] + to[0]) / 2, 0.03, (from[1] + to[1]) / 2],
    turn: [0, Math.atan2(-dz, dx), 0],
  })
}

/**
 * Each kind's model at unit width: it fits in a circle a unit across the
 * origin and stands on it. One stands on every resource hex in the world, so
 * each is kept to a hundred or so triangles.
 */
const MODELS: Readonly<Record<ResourceType, () => VertexData[]>> = {
  timber: () => {
    const bark: Triple = [0.48, 0.29, 0.14]
    const heart: Triple = [0.88, 0.7, 0.44]
    const log = (y: number, z: number): VertexData =>
      part(banded(0.56, 0.16, bark, heart), null, { at: [0, y, z], turn: [0, 0, LYING] })
    const stump = (height: number, diameter: number, x: number, z: number): VertexData =>
      part(banded(height, diameter, bark, heart), null, { at: [x, height / 2, z] })
    return [
      log(0.08, -0.2),
      log(0.08, -0.04),
      log(0.22, -0.12),
      stump(0.16, 0.18, 0.2, 0.2),
      stump(0.12, 0.14, -0.2, 0.2),
    ]
  },

  herbs: () => {
    const tufts: [number, number, number, number][] = [
      [0.22, 0.08, 0.38, 0.18],
      [-0.12, 0.24, 0.3, 0.16],
      [-0.24, -0.12, 0.34, 0.16],
      [0.08, -0.24, 0.26, 0.14],
      [0, 0, 0.22, 0.14],
    ]
    const blades = tufts.map(([x, z, height, diameter], i) =>
      part(cylinder(height, diameter, 0, 5), i % 2 ? [0.22, 0.6, 0.2] : [0.3, 0.72, 0.25], {
        at: [x, height / 2, z],
        turn: [0.25 * z, 0, -0.25 * x],
      }),
    )
    return [
      ...blades,
      part(box(0.07, 0.07, 0.07), [0.96, 0.84, 0.3], { at: [0.25, 0.38, 0.1] }),
      part(box(0.06, 0.06, 0.06), [0.86, 0.62, 0.95], { at: [-0.25, 0.34, -0.13] }),
    ]
  },

  game: () => {
    const hide: Triple = [0.62, 0.4, 0.2]
    const antler: Triple = [0.93, 0.87, 0.7]
    return [
      ...[-1, 1].map((end) => part(box(0.03, 0.19, 0.1), hide, { at: [end * 0.1, 0.095, 0] })),
      part(box(0.29, 0.12, 0.11), hide, { at: [0, 0.25, 0] }),
      part(box(0.05, 0.16, 0.05), hide, { at: [0.14, 0.35, 0], turn: [0, 0, -0.45] }),
      part(box(0.11, 0.06, 0.06), hide, { at: [0.2, 0.43, 0] }),
      part(box(0.04, 0.06, 0.03), [0.95, 0.92, 0.85], { at: [-0.15, 0.28, 0], turn: [0, 0, 0.5] }),
      ...[-1, 1].map((side) =>
        part(box(0.02, 0.16, 0.02), antler, {
          at: [0.18, 0.53, side * 0.04],
          turn: [side * 0.4, 0, 0],
        }),
      ),
      part(cylinder(0.22, 0.2, 0, 5), [0.26, 0.5, 0.22], { at: [-0.2, 0.11, 0.25] }),
    ]
  },

  clay: () => {
    const fired: Triple = [0.8, 0.48, 0.22]
    const brick: Triple = [0.7, 0.32, 0.18]
    return [
      part(cylinder(0.12, 0.6, 0.4, 8), [0.72, 0.42, 0.22], { at: [-0.05, 0.06, -0.05] }),
      part(cylinder(0.16, 0.12, 0.1), fired, { at: [0.28, 0.08, 0.12] }),
      part(cylinder(0.12, 0.1, 0.08), [0.64, 0.35, 0.16], { at: [0.2, 0.06, -0.26] }),
      part(box(0.16, 0.06, 0.1), brick, { at: [-0.2, 0.03, 0.28], turn: [0, 0.3, 0] }),
      part(box(0.16, 0.06, 0.1), brick, { at: [-0.2, 0.09, 0.28], turn: [0, -0.2, 0] }),
    ]
  },

  iron: () => {
    const ore: Triple = [0.42, 0.44, 0.5]
    const rust: Triple = [0.72, 0.36, 0.18]
    return [
      part(box(0.3, 0.26, 0.26), ore, { at: [-0.08, 0.13, -0.04], turn: [0.2, 0.5, 0.15] }),
      part(box(0.24, 0.2, 0.2), ore, { at: [0.18, 0.1, 0.1], turn: [-0.3, 1.1, 0.2] }),
      part(box(0.2, 0.18, 0.18), ore, { at: [0, 0.3, -0.04], turn: [0.6, 0.2, 0.5] }),
      part(box(0.18, 0.14, 0.16), ore, { at: [-0.18, 0.07, 0.22], turn: [0.1, 0.8, 0] }),
      part(box(0.08, 0.06, 0.08), rust, { at: [-0.12, 0.26, 0.08], turn: [0, 0.4, 0] }),
      part(box(0.07, 0.05, 0.07), rust, { at: [0.2, 0.2, 0.06], turn: [0.3, 0, 0] }),
    ]
  },

  stone: () => {
    const block: Triple = [0.7, 0.69, 0.66]
    return [
      part(box(0.3, 0.16, 0.22), block, { at: [-0.14, 0.08, -0.1] }),
      part(box(0.3, 0.16, 0.22), [0.62, 0.61, 0.58], {
        at: [0.16, 0.08, -0.06],
        turn: [0, 0.2, 0],
      }),
      part(box(0.28, 0.15, 0.2), [0.8, 0.79, 0.76], { at: [0, 0.235, -0.08], turn: [0, -0.25, 0] }),
      part(box(0.2, 0.12, 0.16), block, { at: [-0.1, 0.06, 0.22], turn: [0, 0.6, 0] }),
      part(box(0.14, 0.1, 0.14), [0.62, 0.61, 0.58], { at: [0.2, 0.05, 0.2], turn: [0, 0.3, 0] }),
    ]
  },

  gems: () => {
    const gem = (width: number, height: number, color: Triple, pose: Pose): VertexData =>
      part(buildGem(width, height), color, pose)
    return [
      part(box(0.32, 0.14, 0.26), [0.3, 0.27, 0.33], { at: [0, 0.07, 0], turn: [0, 0.4, 0] }),
      gem(0.14, 0.42, [0.84, 0.3, 0.95], { at: [0.02, 0.1, 0.02] }),
      gem(0.11, 0.3, [0.95, 0.35, 0.6], { at: [0.14, 0.05, -0.12], turn: [0.3, 0, -0.4] }),
      gem(0.1, 0.26, [0.84, 0.3, 0.95], { at: [-0.14, 0.04, 0.1], turn: [-0.3, 0, 0.4] }),
      gem(0.1, 0.22, [0.6, 0.35, 0.95], { at: [0.2, 0, 0.18], turn: [0.6, 0, -0.9] }),
    ]
  },

  rareOre: () => {
    const rock: Triple = [0.14, 0.11, 0.18]
    const vein: Triple = [1, 0.55, 0.18]
    return [
      part(box(0.32, 0.24, 0.28), rock, { at: [-0.1, 0.12, -0.06], turn: [0.15, 0.4, 0.1] }),
      part(box(0.24, 0.2, 0.22), rock, { at: [0.18, 0.1, 0.06], turn: [-0.2, 1.2, 0.35] }),
      part(box(0.18, 0.14, 0.16), rock, { at: [-0.12, 0.07, 0.24], turn: [0.1, 0.5, 0] }),
      part(box(0.34, 0.04, 0.05), vein, { at: [-0.08, 0.18, 0.08], turn: [0, 0.4, 0.4] }),
      part(box(0.05, 0.26, 0.04), vein, { at: [0.14, 0.14, -0.06], turn: [0.2, 0, -0.3] }),
      part(box(0.04, 0.04, 0.2), vein, { at: [-0.12, 0.15, 0.24], turn: [0.3, 0.4, 0] }),
    ]
  },

  crystal: () => {
    const pale: Triple = [0.78, 0.93, 1]
    const spike = (height: number, x: number, z: number, lean: Triple): VertexData =>
      part(cylinder(height, 0.15, 0), pale, { at: [x, height / 2 - 0.03, z], turn: lean })
    return [
      spike(0.6, 0, 0, [0, 0, 0]),
      spike(0.42, 0.14, 0.08, [0.2, 0, -0.45]),
      spike(0.38, -0.14, 0.1, [0.35, 0, 0.4]),
      spike(0.3, 0.02, -0.18, [-0.5, 0, 0]),
      spike(0.22, -0.22, -0.18, [-0.3, 0, 0.4]),
    ]
  },

  salt: () => {
    const white: Triple = [0.97, 0.97, 0.99]
    return [
      part(cylinder(0.04, 0.8, 0.8, 8), [0.88, 0.9, 0.94], { at: [0, 0.02, 0] }),
      part(cylinder(0.22, 0.3, 0.04), white, { at: [-0.1, 0.11, -0.05] }),
      part(box(0.08, 0.08, 0.08), white, { at: [0.18, 0.08, 0.1], turn: [0.3, 0.9, 0.4] }),
      part(box(0.07, 0.07, 0.07), [0.86, 0.9, 0.96], {
        at: [0.05, 0.07, 0.25],
        turn: [0.6, 0.6, 0],
      }),
      part(box(0.07, 0.07, 0.07), white, { at: [-0.2, 0.07, 0.2], turn: [0.7, 0.2, 0.5] }),
    ]
  },

  glassSand: () => {
    const sand: Triple = [0.96, 0.88, 0.62]
    const shine: Triple = [0.78, 0.96, 1]
    return [
      part(cylinder(0.12, 0.8, 0.3, 8), sand, { at: [0, 0.06, 0], stretch: [1, 1, 0.7] }),
      part(cylinder(0.08, 0.36, 0.14), [0.92, 0.82, 0.55], { at: [0.18, 0.04, 0.24] }),
      part(box(0.09, 0.02, 0.09), shine, { at: [0.08, 0.13, 0.02], turn: [0.2, 0.7, 0.1] }),
      part(box(0.07, 0.02, 0.07), shine, { at: [-0.2, 0.08, 0.06], turn: [-0.2, 0.3, 0.2] }),
      part(box(0.06, 0.02, 0.06), shine, { at: [0.02, 0.1, -0.16], turn: [0.3, 1.1, -0.2] }),
    ]
  },

  fish: () => {
    const scales: Triple = [0.55, 0.7, 0.86]
    const floats = [Math.PI / 2, (7 * Math.PI) / 6, (11 * Math.PI) / 6].map(
      (angle) => [0.32 * Math.cos(angle), 0.32 * Math.sin(angle)] as const,
    )
    return [
      ...floats.map(([x, z]) =>
        part(banded(0.08, 0.1, [0.9, 0.2, 0.15], [0.97, 0.95, 0.9], 5), null, {
          at: [x, 0.04, z],
        }),
      ),
      rope(floats[0], floats[1], [0.56, 0.39, 0.22]),
      rope(floats[1], floats[2], [0.56, 0.39, 0.22]),
      part(box(0.2, 0.07, 0.04), scales, { at: [0, 0.18, 0], turn: [0, 0, 0.4] }),
      part(cylinder(0.08, 0.1, 0, 4), scales, {
        at: [-0.12, 0.12, 0],
        turn: [0, 0, -LYING + 0.4],
        stretch: [1, 1, 0.3],
      }),
    ]
  },

  pearls: () => {
    const shell: Triple = [0.88, 0.66, 0.62]
    return [
      part(cylinder(0.05, 0.3, 0.24), shell, { at: [-0.08, 0.025, 0.05] }),
      part(cylinder(0.03, 0.3, 0.24), [0.8, 0.58, 0.55], {
        at: [-0.2, 0.12, 0.05],
        turn: [0, 0, 1.1],
      }),
      part(CreateSphereVertexData({ diameter: 0.12, segments: 1 }), [1, 0.97, 0.93], {
        at: [-0.06, 0.1, 0.05],
      }),
      part(cylinder(0.06, 0.2, 0.12), [0.8, 0.58, 0.55], { at: [0.24, 0.03, -0.16] }),
    ]
  },

  whales: () => {
    const skin: Triple = [0.27, 0.33, 0.46]
    return [
      part(cylinder(0.02, 0.6, 0.6, 8), [0.88, 0.94, 1], { at: [0, 0.01, 0] }),
      part(cylinder(0.4, 0.18, 0.08), skin, {
        at: [0.06, 0.04, 0],
        turn: [0, 0, LYING],
        stretch: [0.6, 1, 1],
      }),
      part(box(0.06, 0.2, 0.06), skin, { at: [-0.2, 0.12, 0], turn: [0, 0, 0.3] }),
      ...[-1, 1].map((side) =>
        part(box(0.06, 0.03, 0.16), skin, {
          at: [-0.25, 0.23, side * 0.08],
          turn: [side * 0.3, 0, 0],
        }),
      ),
      part(cylinder(0.18, 0.08, 0, 5), [0.92, 0.96, 1], { at: [0.18, 0.15, 0] }),
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
  /** Models standing right now, across every kind: one for each hex marked. */
  readonly count: number
  setMarks(marks: readonly ResourceMark[]): void
  dispose(): void
}

/**
 * One mesh a kind, every model of that kind a thin instance of it. The whole
 * world's worth is a few thousand models of a hundred triangles, cheaper drawn whole than
 * kept in step with the grid's window, and each buffer is rebuilt to fit on
 * every set, so there is no capacity to run past.
 */
export function createResourceMarkers(
  scene: Scene,
  layout: Layout,
  elevationOf: (hex: Axial) => number,
  options: ResourceMarkerOptions = {},
): ResourceMarkers {
  const width = layout.size * FOOTPRINT
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
