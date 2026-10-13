import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture'
import { Texture } from '@babylonjs/core/Materials/Textures/texture'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData'
import type { Scene } from '@babylonjs/core/scene'
import { parseKey, type Axial, type HexKey } from '../hex/coords'
import { hexToWorld, type Layout } from '../hex/layout'
import { roadEdge, type Roads } from '../terrain/roads'
import { bevelProfile, type ProfileRing } from './hexPrism'
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

/** A hex with road on it: where it is, whether it lies flat under the fog, and where its roads lead. */
export interface RoadHex {
  hex: Axial
  buried: boolean
  toward: Axial[]
}

/** The spans regrouped by hex, since a path is painted one hex top at a time. */
export function roadHexes(spans: readonly RoadSpan[]): RoadHex[] {
  const byKey = new Map<HexKey, RoadHex>()
  const add = (key: HexKey, buried: boolean, other: HexKey): void => {
    let entry = byKey.get(key)
    if (!entry) {
      entry = { hex: parseKey(key), buried, toward: [] }
      byKey.set(key, entry)
    }
    entry.toward.push(parseKey(other))
  }
  for (const span of spans) {
    add(span.a, span.buriedA, span.b)
    add(span.b, span.buriedB, span.a)
  }
  return [...byKey.values()]
}

const COS30 = Math.sqrt(3) / 2

/**
 * The height of the drawn top at a point, relative to the hex centre, on the
 * unit-height prism. Every ring of the top is a hexagon, so the ring a point
 * lies on is found from its reach along the nearest side's normal, and its
 * height read off the profile between the two rings either side of it.
 */
export function topHeight(x: number, z: number, profile: readonly ProfileRing[]): number {
  let reach = 0
  for (let side = 0; side < 6; side++) {
    const angle = (Math.PI / 3) * side
    reach = Math.max(reach, x * Math.cos(angle) + z * Math.sin(angle))
  }
  const radius = reach / COS30
  if (radius <= profile[0].radius) return profile[0].y
  for (let ring = 1; ring < profile.length; ring++) {
    const inner = profile[ring - 1]
    const outer = profile[ring]
    if (radius <= outer.radius) {
      return (
        inner.y + ((outer.y - inner.y) * (radius - inner.radius)) / (outer.radius - inner.radius)
      )
    }
  }
  return profile[profile.length - 1].y
}

export interface Point {
  x: number
  z: number
}

/** The paint on one hex top, in coordinates relative to its centre. */
export interface HexPaint {
  /** Centre lines, each running from the edge of the flat top; one strip of dirt is laid along each. */
  lines: Point[][]
  /** Radius of the trodden clearing, or 0 for none. */
  clearing: number
  /** Where the clearing lies. */
  hub: Point
  /** For each line, whether it ends by running into another one, a branch joining the main stream. */
  joins?: boolean[]
}

/**
 * Square across a direction, always pointing the same way for a direction and
 * its reverse, so both hexes either side of a border shift a line alike.
 */
export const across = (direction: Point): Point => {
  const side = { x: -direction.z, z: direction.x }
  const flip = side.x < -1e-9 || (Math.abs(side.x) <= 1e-9 && side.z < 0)
  return flip ? { x: -side.x, z: -side.z } : side
}

/**
 * Where the dirt runs on a hex top. Every road leaves straight out through the
 * middle of its side, so it lines up with the neighbour's road across the
 * border, and stops where the flat top ends: down the rounded rim it would
 * read as a smear. Inside, two roads bend into each other as one path; a lone
 * road ends in a small round patch, and three or more run into a clearing,
 * unless they `branch`: then the two most nearly opposite run on as one and
 * the rest join it from the side, the way streams meet.
 * `shift` moves every line sideways off the middle by the same amount on both
 * sides of a border, so a river can run beside a road between the same hexes.
 */
export function hexPaint(
  layout: Layout,
  road: RoadHex,
  tileSize: number,
  profile: readonly ProfileRing[],
  halfWidth: number,
  shift = 0,
  branch = false,
): HexPaint {
  const centre = hexToWorld(layout, road.hex)
  const edge = profile[0].radius * COS30
  const throat = tileSize * COS30 * 0.55
  const rows = [edge, throat]

  const arms = road.toward.map((hex) => {
    const world = hexToWorld(layout, hex)
    const dx = world.x - centre.x
    const dz = world.z - centre.z
    const length = Math.hypot(dx, dz)
    const direction = { x: dx / length, z: dz / length }
    const side = across(direction)
    const offset = { x: side.x * shift, z: side.z * shift }
    return {
      direction,
      offset,
      points: rows.map((d) => ({ x: direction.x * d + offset.x, z: direction.z * d + offset.z })),
    }
  })

  const steps = Math.max(2, Math.ceil(throat / halfWidth))
  const inward = (from: Point, hub: Point): Point[] => {
    const points: Point[] = []
    for (let step = steps - 1; step >= 0; step--) {
      const t = step / steps
      points.push({ x: hub.x + (from.x - hub.x) * t, z: hub.z + (from.z - hub.z) * t })
    }
    return points
  }

  type Arm = (typeof arms)[number]
  const through = (first: Arm, second: Arm): { line: Point[]; pull: Point } => {
    const from = first.points[first.points.length - 1]
    const to = second.points[second.points.length - 1]
    const pull = {
      x: (first.offset.x + second.offset.x) / 2,
      z: (first.offset.z + second.offset.z) / 2,
    }
    const bend: Point[] = []
    // A quadratic curve pulled toward the middle: it leaves each throat heading
    // along its road, so the bend joins the straight runs without a kink.
    for (let step = 1; step < steps * 2; step++) {
      const t = step / (steps * 2)
      bend.push({
        x: (1 - t) ** 2 * from.x + 2 * t * (1 - t) * pull.x + t ** 2 * to.x,
        z: (1 - t) ** 2 * from.z + 2 * t * (1 - t) * pull.z + t ** 2 * to.z,
      })
    }
    return { line: [...first.points, ...bend, ...second.points.slice().reverse()], pull }
  }

  if (arms.length === 2) {
    const { line, pull } = through(arms[0], arms[1])
    return { lines: [line], clearing: 0, hub: pull }
  }

  if (branch && arms.length > 2) {
    let main: [Arm, Arm] = [arms[0], arms[1]]
    let straightest = Infinity
    for (const one of arms) {
      for (const other of arms) {
        const dot = one.direction.x * other.direction.x + one.direction.z * other.direction.z
        if (one !== other && dot < straightest) {
          straightest = dot
          main = [one, other]
        }
      }
    }
    const { line, pull } = through(...main)
    const nearest = (point: Point): Point =>
      line.reduce((best, next) =>
        Math.hypot(next.x - point.x, next.z - point.z) <
        Math.hypot(best.x - point.x, best.z - point.z)
          ? next
          : best,
      )
    const branches = arms
      .filter((arm) => !main.includes(arm))
      .map((arm) => {
        const mouth = arm.points[arm.points.length - 1]
        return [...arm.points, ...inward(mouth, nearest(mouth))]
      })
    return {
      lines: [line, ...branches],
      joins: [false, ...branches.map(() => true)],
      clearing: 0,
      hub: pull,
    }
  }

  const hub = arms.length === 1 ? arms[0].offset : { x: 0, z: 0 }
  return {
    lines: arms.map((arm) => [...arm.points, ...inward(arm.points[arm.points.length - 1], hub)]),
    hub,
    clearing: arms.length === 1 ? halfWidth : halfWidth * 1.6,
  }
}

const hash = (seed: number, n: number): number => {
  let h = Math.imul(seed ^ Math.imul(n, 0x27d4eb2d), 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h ^= h >>> 13
  return (h >>> 0) / 0x100000000
}

/** Smooth noise in -1..1 along a line, the same for the same seed every time. */
export function wander(seed: number, at: number): number {
  const cell = Math.floor(at)
  const t = at - cell
  const ease = t * t * (3 - 2 * t)
  const a = hash(seed, cell)
  const b = hash(seed, cell + 1)
  return (a + (b - a) * ease) * 2 - 1
}

/** Across the strip, from its left edge to its right: the wheel ruts and the crown between them. */
const ACROSS = [-1, -0.7, -0.5, -0.36, -0.22, 0.22, 0.36, 0.5, 0.7, 1] as const

const DIRT = Color3.FromHexString('#a68559')
const RUT = Color3.FromHexString('#8a6a44')
const CROWN = Color3.FromHexString('#b39466')
const CLEARING = Color3.FromHexString('#ad8d61')

// The outermost edge fades to nothing, so the dirt blends into the grass
// instead of ending on a hard line.
const SHADE: readonly [Color3, number][] = [
  [DIRT, 0],
  [DIRT, 1],
  [DIRT, 1],
  [RUT, 1],
  [CROWN, 1],
  [CROWN, 1],
  [RUT, 1],
  [DIRT, 1],
  [DIRT, 1],
  [DIRT, 0],
]

const CLEARING_SIDES = 18

/** A round hole in the paint, in world coordinates: where a bridge carries the road over water. */
export interface Gap {
  x: number
  z: number
  radius: number
}

const closest = (from: Point, to: Point, point: Point): Point => {
  const dx = to.x - from.x
  const dz = to.z - from.z
  const t = Math.max(
    0,
    Math.min(1, ((point.x - from.x) * dx + (point.z - from.z) * dz) / (dx * dx + dz * dz || 1)),
  )
  return { x: from.x + dx * t, z: from.z + dz * t }
}

/**
 * A line with every stretch inside a gap taken out, in the pieces left either
 * side, each cut found exactly on the gap's rim. A line no gap touches comes
 * back whole and as it was; one that is cut is first sampled every `step`.
 */
export function cutLine(line: readonly Point[], gaps: readonly Gap[], step: number): Point[][] {
  const near = gaps.filter((gap) =>
    line.some((point, at) => {
      if (at === 0) return false
      const foot = closest(line[at - 1], point, gap)
      return Math.hypot(foot.x - gap.x, foot.z - gap.z) < gap.radius
    }),
  )
  if (near.length === 0) return [line.slice()]
  const inside = (point: Point): boolean =>
    near.some((gap) => Math.hypot(point.x - gap.x, point.z - gap.z) < gap.radius)

  const dense: Point[] = [line[0]]
  for (let at = 1; at < line.length; at++) {
    const from = line[at - 1]
    const to = line[at]
    const pieces = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / step))
    for (let piece = 1; piece <= pieces; piece++) {
      const t = piece / pieces
      dense.push({ x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t })
    }
  }

  const rim = (dry: Point, wet: Point): Point => {
    let [a, b] = [dry, wet]
    for (let i = 0; i < 12; i++) {
      const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }
      if (inside(mid)) b = mid
      else a = mid
    }
    return a
  }

  const pieces: Point[][] = []
  let run: Point[] = []
  dense.forEach((point, at) => {
    if (inside(point)) {
      if (run.length > 0) {
        run.push(rim(dense[at - 1], point))
        pieces.push(run)
        run = []
      }
      return
    }
    if (run.length === 0 && at > 0) run.push(rim(point, dense[at - 1]))
    run.push(point)
  })
  if (run.length > 0) pieces.push(run)
  return pieces.filter((piece) => piece.length > 1)
}

export interface RoadGeometry {
  positions: number[]
  indices: number[]
  colors: number[]
  uvs: number[]
}

export interface PaintOptions {
  tileSize: number
  profile: readonly ProfileRing[]
  halfWidth: number
  /** Where bridges carry the roads over rivers, left unpainted. */
  gaps?: readonly Gap[]
}

/**
 * Every road hex painted into one ribbon mesh lying on the drawn tops. The
 * strips wander a little and swell and narrow along their length, but both
 * die away to nothing at the edge of the top, so a road lines up with its
 * neighbour's at the same width. Clearings come last, so they are laid over the ruts.
 */
export function buildRoadGeometry(
  layout: Layout,
  roads: readonly RoadHex[],
  groundOf: (road: RoadHex) => number,
  options: PaintOptions,
): RoadGeometry {
  const { tileSize, profile, halfWidth, gaps = [] } = options
  const geometry: RoadGeometry = { positions: [], indices: [], colors: [], uvs: [] }
  const { positions, indices, colors, uvs } = geometry
  const meander = halfWidth * 0.35
  const span = layout.size * 2.5

  const vertex = (x: number, y: number, z: number, color: Color3, alpha: number): void => {
    positions.push(x, y, z)
    colors.push(color.r, color.g, color.b, alpha)
  }

  const clearings: (() => void)[] = []

  for (const road of roads) {
    const centre = hexToWorld(layout, road.hex)
    const ground = groundOf(road)
    const paint = hexPaint(layout, road, tileSize, profile, halfWidth)
    const seed = Math.imul(road.hex.q, 73856093) ^ Math.imul(road.hex.r, 19349663)
    const holes = gaps
      .filter(
        (gap) => Math.hypot(gap.x - centre.x, gap.z - centre.z) < layout.size * 2 + gap.radius,
      )
      .map((gap) => ({ ...gap, x: gap.x - centre.x, z: gap.z - centre.z }))
    const lines = paint.lines.flatMap((line) => cutLine(line, holes, halfWidth / 2))

    lines.forEach((line, index) => {
      let length = 0
      const along = line.map((point, at) => {
        if (at > 0) length += Math.hypot(point.x - line[at - 1].x, point.z - line[at - 1].z)
        return length
      })

      const first = positions.length / 3
      line.forEach((point, at) => {
        const before = line[Math.max(0, at - 1)]
        const after = line[Math.min(line.length - 1, at + 1)]
        const tx = after.x - before.x
        const tz = after.z - before.z
        const norm = Math.hypot(tx, tz)
        const side = { x: -tz / norm, z: tx / norm }

        const fade = Math.sin((Math.PI * along[at]) / length)
        const sway = meander * fade * wander(seed + index * 3, along[at] / span)
        const left =
          halfWidth * (1 + 0.22 * fade * wander(seed + index * 3 + 1, along[at] / halfWidth))
        const right =
          halfWidth * (1 + 0.22 * fade * wander(seed + index * 3 + 2, along[at] / halfWidth))
        const cx = point.x + side.x * sway
        const cz = point.z + side.z * sway

        ACROSS.forEach((offset, column) => {
          const reach = offset < 0 ? left : right
          const x = cx + side.x * offset * reach
          const z = cz + side.z * offset * reach
          const [color, alpha] = SHADE[column]
          vertex(centre.x + x, ground * topHeight(x, z, profile), centre.z + z, color, alpha)
          uvs.push((offset + 1) / 2, along[at] / (halfWidth * 2))
        })
      })

      const width = ACROSS.length
      for (let row = 0; row < line.length - 1; row++) {
        for (let column = 0; column < width - 1; column++) {
          const a = first + row * width + column
          const b = a + width
          indices.push(a, b, a + 1, a + 1, b, b + 1)
        }
      }
    })

    if (paint.clearing > 0) {
      clearings.push(() => {
        const first = positions.length / 3
        const { hub } = paint
        vertex(
          centre.x + hub.x,
          ground * topHeight(hub.x, hub.z, profile),
          centre.z + hub.z,
          CLEARING,
          1,
        )
        uvs.push(0.5, 0.5)
        for (let k = 0; k < CLEARING_SIDES; k++) {
          const angle = (2 * Math.PI * k) / CLEARING_SIDES
          const swell = 1 + 0.18 * wander(seed + 7, (k * 6) / CLEARING_SIDES)
          for (const [scale, alpha] of [
            [swell, 1],
            [swell * 1.4, 0],
          ] as const) {
            const x = hub.x + Math.cos(angle) * paint.clearing * scale
            const z = hub.z + Math.sin(angle) * paint.clearing * scale
            vertex(centre.x + x, ground * topHeight(x, z, profile), centre.z + z, CLEARING, alpha)
            uvs.push(0.5 + x / (halfWidth * 2), 0.5 + z / (halfWidth * 2))
          }
        }
        for (let k = 0; k < CLEARING_SIDES; k++) {
          const inner = first + 1 + k * 2
          const next = first + 1 + ((k + 1) % CLEARING_SIDES) * 2
          indices.push(first, inner, next)
          indices.push(inner, inner + 1, next, next, inner + 1, next + 1)
        }
      })
    }
  }

  for (const lay of clearings) lay()
  return geometry
}

/** Grit for the dirt: mostly a light speckle, with the odd darker pebble. */
export function dirtGrit(size: number, seed = 1): Uint8Array {
  const data = new Uint8Array(size * size * 4)
  for (let pixel = 0; pixel < size * size; pixel++) {
    const speckle = hash(seed, pixel)
    const pebble = hash(seed + 1, pixel) > 0.94 ? 0.75 : 1
    const value = Math.round(255 * (0.84 + 0.16 * speckle) * pebble)
    data.set([value, value, value, 255], pixel * 4)
  }
  return data
}

export interface RoadSegments {
  mesh: Mesh
  /** Hexes with road painted on them right now. */
  readonly count: number
  setSpans(spans: readonly RoadSpan[]): void
  /** Where bridges carry the roads over rivers; the paint stops short of them. */
  setGaps(gaps: readonly Gap[]): void
  /** Follows the grid between its bevelled prism and the flat one, so the paint stays on the top. */
  setDetail(detailed: boolean): void
  dispose(): void
}

export interface RoadSegmentOptions {
  /** Centre-to-corner radius of a drawn tile, the layout size less the border gap. */
  tileSize?: number
  /** Radius of the tiles' rounded top edge, as a fraction of the tile size. */
  bevel?: number
  /** Road width, as a fraction of the hex size. */
  width?: number
}

/** Road width, as a fraction of the hex size. */
export const ROAD_WIDTH = 0.3
const GRIT_SIZE = 64

/**
 * Every road painted onto the hex tops as one mesh, rebuilt whenever the roads
 * or the grid's detail change and never in between. It is drawn translucent,
 * pulled toward the camera rather than lifted off the ground, and writes no
 * depth, so it lies on the tops like paint and overlapping strips blend.
 */
export function createRoadSegments(
  scene: Scene,
  layout: Layout,
  elevationOf: (hex: Axial) => number,
  options: RoadSegmentOptions = {},
): RoadSegments {
  const tileSize = options.tileSize ?? layout.size
  const halfWidth = (layout.size * (options.width ?? ROAD_WIDTH)) / 2
  const profiles = {
    detailed: bevelProfile(tileSize, { bevel: options.bevel }),
    flat: bevelProfile(tileSize, { bevel: 0 }),
  }

  const mesh = new Mesh('roadSegments', scene)
  mesh.isPickable = false
  mesh.isVisible = false
  mesh.hasVertexAlpha = true
  mesh.alphaIndex = 0

  const grit = RawTexture.CreateRGBATexture(
    dirtGrit(GRIT_SIZE),
    GRIT_SIZE,
    GRIT_SIZE,
    scene,
    true,
    false,
    Texture.TRILINEAR_SAMPLINGMODE,
  )
  grit.wrapU = Texture.WRAP_ADDRESSMODE
  grit.wrapV = Texture.WRAP_ADDRESSMODE

  const material = new StandardMaterial('roadSegments', scene)
  material.diffuseTexture = grit
  material.specularColor = Color3.Black()
  material.zOffset = -2
  material.disableDepthWrite = true
  mesh.material = material

  const groundOf = (road: RoadHex): number =>
    road.buried ? MIN_ELEVATION : Math.max(MIN_ELEVATION, elevationOf(road.hex))

  let detailed = true
  let painted: RoadHex[] = []
  let gaps: readonly Gap[] = []

  const rebuild = (): void => {
    mesh.isVisible = painted.length > 0
    if (painted.length === 0) return
    const geometry = buildRoadGeometry(layout, painted, groundOf, {
      tileSize,
      profile: detailed ? profiles.detailed : profiles.flat,
      halfWidth,
      gaps,
    })
    const data = new VertexData()
    data.positions = geometry.positions
    data.indices = geometry.indices
    data.colors = geometry.colors
    data.uvs = geometry.uvs
    const normals: number[] = []
    VertexData.ComputeNormals(geometry.positions, geometry.indices, normals)
    data.normals = normals
    data.applyToMesh(mesh)
  }

  return {
    mesh,
    get count() {
      return painted.length
    },

    setSpans(spans): void {
      painted = roadHexes(spans)
      rebuild()
    },

    setGaps(next): void {
      gaps = next
      rebuild()
    },

    setDetail(next): void {
      if (next === detailed) return
      detailed = next
      rebuild()
    },

    dispose(): void {
      grit.dispose()
      material.dispose()
      mesh.dispose()
      painted = []
    },
  }
}
