import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData'
import '@babylonjs/core/Meshes/thinInstanceMesh'
import type { Scene } from '@babylonjs/core/scene'
import { hexKey, type Axial } from '../hex/coords'
import { hexToWorld, type Layout } from '../hex/layout'
import { MIN_ELEVATION } from './hexGrid'
import { bevelProfile, type ProfileRing } from './hexPrism'
import { RIVER_SHIFT, RIVER_WIDTH, riverStreams } from './riverSegments'
import {
  hexPaint,
  roadHexes,
  ROAD_WIDTH,
  topHeight,
  type Gap,
  type Point,
  type RoadHex,
  type RoadSpan,
} from './roadSegments'

/** Where a road crosses a river, and the bridge that carries it over. */
export interface BridgeSite {
  hex: Axial
  buried: boolean
  /** World position of the crossing. */
  x: number
  z: number
  /** The way the road runs over it, as a unit direction on the ground. */
  along: Point
  /** End to end, enough to clear the water however slant the crossing. */
  length: number
  width: number
}

export interface BridgeOptions {
  tileSize: number
  profile: readonly ProfileRing[]
  roadHalfWidth: number
  riverHalfWidth: number
  riverShift: number
}

const crossing = (a: Point, b: Point, c: Point, d: Point): { t: number; u: number } | null => {
  const rx = b.x - a.x
  const rz = b.z - a.z
  const sx = d.x - c.x
  const sz = d.z - c.z
  const denominator = rx * sz - rz * sx
  if (Math.abs(denominator) < 1e-12) return null
  const t = ((c.x - a.x) * sz - (c.z - a.z) * sx) / denominator
  const u = ((c.x - a.x) * rz - (c.z - a.z) * rx) / denominator
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { t, u } : null
}

/**
 * Every place a road's line crosses a river's in a hex both run through. The
 * bridge is laid along the road and made long enough to span the water's full
 * width where it crosses, longer the more slant the road meets it.
 */
export function bridgeSites(
  layout: Layout,
  roads: readonly RoadHex[],
  rivers: readonly RoadHex[],
  options: BridgeOptions,
): BridgeSite[] {
  const { tileSize, profile, roadHalfWidth, riverHalfWidth, riverShift } = options
  const riversByKey = new Map(rivers.map((river) => [hexKey(river.hex), river]))
  const sites: BridgeSite[] = []

  for (const road of roads) {
    const river = riversByKey.get(hexKey(road.hex))
    if (!river) continue
    const centre = hexToWorld(layout, road.hex)
    const lines = hexPaint(layout, road, tileSize, profile, roadHalfWidth).lines
    const streams = riverStreams(layout, river, tileSize, riverHalfWidth, riverShift)

    for (const line of lines) {
      for (let at = 1; at < line.length; at++) {
        const from = line[at - 1]
        const to = line[at]
        for (const { points, halfWidths } of streams) {
          for (let on = 1; on < points.length; on++) {
            const hit = crossing(from, to, points[on - 1], points[on])
            if (!hit) continue
            const x = centre.x + from.x + (to.x - from.x) * hit.t
            const z = centre.z + from.z + (to.z - from.z) * hit.t
            if (sites.some((site) => Math.hypot(site.x - x, site.z - z) < roadHalfWidth * 2)) {
              continue
            }
            const roadLength = Math.hypot(to.x - from.x, to.z - from.z)
            const along = { x: (to.x - from.x) / roadLength, z: (to.z - from.z) / roadLength }
            const flow = {
              x: points[on].x - points[on - 1].x,
              z: points[on].z - points[on - 1].z,
            }
            const flowLength = Math.hypot(flow.x, flow.z)
            const slant = Math.abs(along.x * flow.z - along.z * flow.x) / flowLength
            const water = halfWidths[on - 1] + (halfWidths[on] - halfWidths[on - 1]) * hit.u
            sites.push({
              hex: road.hex,
              buried: road.buried,
              x,
              z,
              along,
              length: Math.min((water * 2.8) / Math.max(slant, 0.45) + roadHalfWidth, tileSize),
              width: roadHalfWidth * 2.2,
            })
          }
        }
      }
    }
  }
  return sites
}

/** The road's paint stops under each end of the bridge, so none shows on the water beneath. */
export const bridgeGaps = (sites: readonly BridgeSite[]): Gap[] =>
  sites.map((site) => ({ x: site.x, z: site.z, radius: site.length * 0.42 }))

const STONE = Color3.FromHexString('#a39a8a')
const DARK_STONE = Color3.FromHexString('#7d7568')
const DECK = Color3.FromHexString('#8c7a5e')

/** Half the arch's opening, and its height, in lengths of the bridge. */
const ARCH = { half: 0.3, rise: 0.11 }
const CROWN = 0.16
const PARAPET = { height: 0.05, thickness: 0.14 }
const STEPS = 24

/** The deck's top, in lengths of the bridge: flush with the ground at either end, humped over the arch. */
export const deckTop = (x: number): number => CROWN * Math.sin(Math.PI * (x + 0.5)) ** 0.6 + 0.004

/** The underside: the arch's curve over the opening, the ground beyond it. */
export const archUnder = (x: number): number =>
  Math.abs(x) < ARCH.half ? ARCH.rise * Math.sqrt(1 - (x / ARCH.half) ** 2) : 0

/**
 * A stone bridge one unit long (x), one wide (z) and measured in lengths
 * upward: a humped deck over a single round arch, with a low parapet along
 * each side. Every face carries its own vertices and normals, so the stone
 * shades flat where it should and smooth over the hump.
 */
export function buildBridgeGeometry(): VertexData {
  const positions: number[] = []
  const indices: number[] = []
  const normals: number[] = []
  const colors: number[] = []
  const xs = Array.from({ length: STEPS + 1 }, (_, step) => -0.5 + step / STEPS)

  const quad = (corners: readonly number[][], normal: readonly number[], color: Color3): void => {
    const first = positions.length / 3
    for (const corner of corners) {
      positions.push(...corner)
      normals.push(...normal)
      colors.push(color.r, color.g, color.b, 1)
    }
    indices.push(first, first + 1, first + 2, first, first + 2, first + 3)
  }

  const slope = (top: (x: number) => number, x0: number, x1: number): number[] => {
    const dx = x1 - x0
    const dy = top(x1) - top(x0)
    const length = Math.hypot(dx, dy)
    return [-dy / length, dx / length, 0]
  }

  const slab = (
    top: (x: number) => number,
    bottom: (x: number) => number,
    z0: number,
    z1: number,
    color: Color3,
    upper: Color3,
  ): void => {
    for (let step = 0; step < STEPS; step++) {
      const [x0, x1] = [xs[step], xs[step + 1]]
      quad(
        [
          [x0, bottom(x0), z0],
          [x0, top(x0), z0],
          [x1, top(x1), z0],
          [x1, bottom(x1), z0],
        ],
        [0, 0, -1],
        color,
      )
      quad(
        [
          [x0, bottom(x0), z1],
          [x1, bottom(x1), z1],
          [x1, top(x1), z1],
          [x0, top(x0), z1],
        ],
        [0, 0, 1],
        color,
      )
      quad(
        [
          [x0, top(x0), z0],
          [x0, top(x0), z1],
          [x1, top(x1), z1],
          [x1, top(x1), z0],
        ],
        slope(top, x0, x1),
        upper,
      )
      const down = slope(bottom, x0, x1).map((value) => -value)
      quad(
        [
          [x0, bottom(x0), z0],
          [x1, bottom(x1), z0],
          [x1, bottom(x1), z1],
          [x0, bottom(x0), z1],
        ],
        down,
        DARK_STONE,
      )
    }
    for (const [x, side] of [
      [-0.5, -1],
      [0.5, 1],
    ] as const) {
      quad(
        [
          [x, bottom(x), z0],
          [x, bottom(x), z1],
          [x, top(x), z1],
          [x, top(x), z0],
        ],
        [side, 0, 0],
        color,
      )
    }
  }

  slab(deckTop, archUnder, -0.5, 0.5, STONE, DECK)
  const wall = (x: number): number => deckTop(x) + PARAPET.height
  slab(wall, deckTop, -0.5, -0.5 + PARAPET.thickness, STONE, STONE)
  slab(wall, deckTop, 0.5 - PARAPET.thickness, 0.5, STONE, STONE)

  const data = new VertexData()
  data.positions = positions
  data.indices = indices
  data.normals = normals
  data.colors = colors
  return data
}

/**
 * The matrix that sets the unit bridge down at a site: stretched to its
 * length and width, turned so its length runs along the road, on the ground.
 */
export function bridgeMatrix(site: BridgeSite, ground: number, into: Matrix): Matrix {
  const yaw = Math.atan2(-site.along.z, site.along.x)
  return Matrix.ComposeToRef(
    new Vector3(site.length, site.length, site.width),
    Quaternion.RotationYawPitchRoll(yaw, 0, 0),
    new Vector3(site.x, ground, site.z),
    into,
  )
}

export interface Bridges {
  mesh: Mesh
  /** Bridges standing right now. */
  readonly count: number
  setRoads(spans: readonly RoadSpan[]): void
  setRivers(spans: readonly RoadSpan[]): void
  /** Follows the grid between its bevelled prism and the flat one, so the bridges stand on the top. */
  setDetail(detailed: boolean): void
  dispose(): void
}

export interface BridgeCreateOptions {
  tileSize?: number
  bevel?: number
  /** Told where the bridges are whenever they move, so the roads can leave room for them. */
  onGaps?: (gaps: readonly Gap[]) => void
}

/**
 * A stone bridge wherever a road crosses a river, all drawn as instances of
 * one mesh and set down again whenever the roads, the rivers or the grid's
 * detail change.
 */
export function createBridges(
  scene: Scene,
  layout: Layout,
  elevationOf: (hex: Axial) => number,
  options: BridgeCreateOptions = {},
): Bridges {
  const tileSize = options.tileSize ?? layout.size
  const profiles = {
    detailed: bevelProfile(tileSize, { bevel: options.bevel }),
    flat: bevelProfile(tileSize, { bevel: 0 }),
  }
  const sizes = {
    tileSize,
    roadHalfWidth: (layout.size * ROAD_WIDTH) / 2,
    riverHalfWidth: (layout.size * RIVER_WIDTH) / 2,
    riverShift: layout.size * RIVER_SHIFT,
  }

  const mesh = new Mesh('bridges', scene)
  buildBridgeGeometry().applyToMesh(mesh)
  mesh.isPickable = false
  mesh.isVisible = false
  const material = new StandardMaterial('bridges', scene)
  material.specularColor = Color3.Black()
  material.backFaceCulling = false
  mesh.material = material

  let detailed = true
  let roads: RoadHex[] = []
  let rivers: RoadHex[] = []
  let sites: BridgeSite[] = []

  const place = (): void => {
    mesh.isVisible = sites.length > 0
    if (sites.length === 0) {
      mesh.thinInstanceCount = 0
      return
    }
    const profile = detailed ? profiles.detailed : profiles.flat
    const matrices = new Float32Array(sites.length * 16)
    const matrix = new Matrix()
    sites.forEach((site, index) => {
      const centre = hexToWorld(layout, site.hex)
      const base = site.buried ? MIN_ELEVATION : Math.max(MIN_ELEVATION, elevationOf(site.hex))
      const ground = base * topHeight(site.x - centre.x, site.z - centre.z, profile)
      bridgeMatrix(site, ground, matrix).copyToArray(matrices, index * 16)
    })
    mesh.thinInstanceSetBuffer('matrix', matrices, 16, false)
  }

  const resite = (): void => {
    sites = bridgeSites(layout, roads, rivers, { ...sizes, profile: profiles.detailed })
    options.onGaps?.(bridgeGaps(sites))
    place()
  }

  return {
    mesh,
    get count() {
      return sites.length
    },

    setRoads(spans): void {
      roads = roadHexes(spans)
      resite()
    },

    setRivers(spans): void {
      rivers = roadHexes(spans)
      resite()
    },

    setDetail(next): void {
      if (next === detailed) return
      detailed = next
      place()
    },

    dispose(): void {
      material.dispose()
      mesh.dispose()
      sites = []
    },
  }
}
