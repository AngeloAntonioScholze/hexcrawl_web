import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData'
import type { Scene } from '@babylonjs/core/scene'
import { hexKey, type Axial } from '../hex/coords'
import { hexToWorld, type Layout } from '../hex/layout'
import { MIN_ELEVATION } from './hexGrid'
import { bevelProfile, type ProfileRing } from './hexPrism'
import {
  across,
  hexPaint,
  roadHexes,
  topHeight,
  wander,
  type Point,
  type RoadHex,
  type RoadSpan,
} from './roadSegments'

export const RIVER_COLOR = '#3f8fd6'

/** River width, as a fraction of the hex size. */
export const RIVER_WIDTH = 0.2
/**
 * How far a river runs off the middle of each hex, as a fraction of the hex
 * size, so a road between the same hexes runs beside it instead of in it.
 */
export const RIVER_SHIFT = 0.27

const COS30 = Math.sqrt(3) / 2

/** A river's centre line through one hex, sampled, with how wide the water is at each sample. */
export interface Stream {
  points: Point[]
  halfWidths: number[]
}

/**
 * Where the water runs on a hex top, relative to its centre. The lines are the
 * roads' own, shifted off the middle and branching where three or more meet,
 * but they run on to the very edge of the tile, so the water carries down the
 * rim to the neighbour's. Along the way each wanders and swells and narrows,
 * settling back to the plain width and line at the edge so it meets the
 * neighbour's stream exactly. A river that ends in a hex narrows to its source.
 */
export function riverStreams(
  layout: Layout,
  river: RoadHex,
  tileSize: number,
  halfWidth: number,
  shift: number,
): Stream[] {
  const edge = [{ radius: tileSize, y: 1 }]
  const paint = hexPaint(layout, river, tileSize, edge, halfWidth, shift, true)
  const seed = Math.imul(river.hex.q, 73856093) ^ Math.imul(river.hex.r, 19349663)
  const step = halfWidth / 2
  const lone = river.toward.length === 1

  return paint.lines.map((line, index) => {
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
    let length = 0
    const along = dense.map((point, at) => {
      if (at > 0) length += Math.hypot(point.x - dense[at - 1].x, point.z - dense[at - 1].z)
      return length
    })

    const points: Point[] = []
    const halfWidths: number[] = []
    dense.forEach((point, at) => {
      const before = dense[Math.max(0, at - 1)]
      const after = dense[Math.min(dense.length - 1, at + 1)]
      const tx = after.x - before.x
      const tz = after.z - before.z
      const norm = Math.hypot(tx, tz) || 1
      const fade = Math.sin((Math.PI * along[at]) / length)
      const sway = halfWidth * 0.7 * fade * wander(seed + index * 3, along[at] / layout.size)
      points.push({ x: point.x - (tz / norm) * sway, z: point.z + (tx / norm) * sway })
      const swell = 1 + 0.35 * fade * wander(seed + index * 3 + 1, along[at] / (halfWidth * 3))
      const source = lone ? Math.max(0.35, Math.min(1, (length - along[at]) / (halfWidth * 4))) : 1
      halfWidths.push(halfWidth * swell * source)
    })
    return { points, halfWidths }
  })
}

/** How much the streams of a hex melt into each other where they meet, in stream widths. */
const BLEND = 0.4

/**
 * How far a point lies from the water's middle, in widths of the stream there:
 * 0 midstream, 1 at the bank. Streams are blended with a smooth minimum, so
 * where they meet the banks curve into each other instead of crossing.
 */
export function wetness(streams: readonly Stream[], x: number, z: number): number {
  let field = Infinity
  for (const { points, halfWidths } of streams) {
    let own = Infinity
    for (let at = 1; at < points.length; at++) {
      const from = points[at - 1]
      const to = points[at]
      const dx = to.x - from.x
      const dz = to.z - from.z
      const t = Math.max(
        0,
        Math.min(1, ((x - from.x) * dx + (z - from.z) * dz) / (dx * dx + dz * dz || 1)),
      )
      const distance = Math.hypot(from.x + dx * t - x, from.z + dz * t - z)
      const width = halfWidths[at - 1] + (halfWidths[at] - halfWidths[at - 1]) * t
      own = Math.min(own, distance / width)
    }
    if (field === Infinity) {
      field = own
    } else {
      const h = Math.max(BLEND - Math.abs(field - own), 0) / BLEND
      field = Math.min(field, own) - (h * h * BLEND) / 4
    }
  }
  return field
}

const BANK = Color3.FromHexString('#4f5a3a')
const SHALLOW = Color3.FromHexString('#4f93c4')
const WATER = Color3.FromHexString('#2f6fa6')
const DEEP = Color3.FromHexString('#1d4f80')

/** The water's colour at a wetness: deep midstream, paler toward the banks, then wet earth fading out. */
export function riverShade(wet: number): [Color3, number] {
  if (wet < 0.5) return [Color3.Lerp(DEEP, WATER, wet / 0.5), 1]
  if (wet < 0.85) return [Color3.Lerp(WATER, SHALLOW, (wet - 0.5) / 0.35), 1]
  if (wet < 1) return [Color3.Lerp(SHALLOW, BANK, (wet - 0.85) / 0.15), 1]
  return [BANK, Math.max(0, 0.9 * (1 - (wet - 1) / 0.4))]
}

/** One hex of water on the unit-height prism, relative to its centre, before it is lifted to its ground. */
export interface RiverTile {
  positions: number[]
  indices: number[]
  colors: number[]
}

/** Samples across a tile, edge to edge; fine enough that a stream is several samples wide. */
const CELLS = 60

/**
 * The water on one hex top as a fine grid of samples, each coloured by how wet
 * it is, with only the cells that hold any water kept. Samples that fall off
 * the tile are pulled in onto its edge, so the water ends cleanly there.
 */
export function buildRiverTile(
  streams: readonly Stream[],
  tileSize: number,
  profile: readonly ProfileRing[],
): RiverTile {
  const tile: RiverTile = { positions: [], indices: [], colors: [] }
  const edge = tileSize * COS30
  const cell = (2 * tileSize) / CELLS
  const side = CELLS + 1
  const slot = new Int32Array(side * side).fill(-1)
  const alphas = new Float32Array(side * side)
  const shades: Color3[] = []
  const spots: Point[] = []

  for (let row = 0; row < side; row++) {
    for (let column = 0; column < side; column++) {
      let x = -tileSize + column * cell
      let z = -tileSize + row * cell
      let reach = 0
      for (let k = 0; k < 6; k++) {
        const angle = (Math.PI / 3) * k
        reach = Math.max(reach, x * Math.cos(angle) + z * Math.sin(angle))
      }
      if (reach > edge) {
        x *= edge / reach
        z *= edge / reach
      }
      const at = row * side + column
      const [shade, alpha] = riverShade(wetness(streams, x, z))
      spots[at] = { x, z }
      shades[at] = shade
      alphas[at] = alpha
    }
  }

  const use = (at: number): number => {
    if (slot[at] < 0) {
      slot[at] = tile.positions.length / 3
      const { x, z } = spots[at]
      tile.positions.push(x, topHeight(x, z, profile), z)
      const shade = shades[at]
      tile.colors.push(shade.r, shade.g, shade.b, alphas[at])
    }
    return slot[at]
  }

  // Cells pulled onto the tile's edge can fold over or flatten to nothing;
  // only triangles still facing up are drawn.
  const triangle = (a: number, b: number, c: number): void => {
    const [p, q, r] = [spots[a], spots[b], spots[c]]
    if ((q.x - p.x) * (r.z - p.z) - (r.x - p.x) * (q.z - p.z) <= 1e-9) return
    tile.indices.push(use(a), use(b), use(c))
  }

  for (let row = 0; row < CELLS; row++) {
    for (let column = 0; column < CELLS; column++) {
      const a = row * side + column
      const b = a + 1
      const c = a + side
      const d = c + 1
      if (alphas[a] + alphas[b] + alphas[c] + alphas[d] === 0) continue
      triangle(a, b, c)
      triangle(b, d, c)
    }
  }
  return tile
}

export interface RiverGeometry {
  positions: number[]
  indices: number[]
  colors: number[]
}

export interface RiverPaintOptions {
  tileSize: number
  profile: readonly ProfileRing[]
  halfWidth: number
  shift: number
  /** Every hex's water as worked out before, by hex and the way its streams run. */
  cache?: Map<string, RiverTile>
}

/** Across the strip of water bridging the gap between two tiles, in stream widths. */
const GAP_COLUMNS = [-1.4, -1, -0.85, -0.5, 0, 0.5, 0.85, 1, 1.4] as const

/**
 * Every river hex's water, lifted onto its ground, and between each pair of
 * neighbours a strip of water across the gap between their tiles, level with
 * the lower one's rim, so a river flows on from tile to tile without a break.
 */
export function buildRiverGeometry(
  layout: Layout,
  rivers: readonly RoadHex[],
  groundOf: (river: RoadHex) => number,
  options: RiverPaintOptions,
): RiverGeometry {
  const { tileSize, profile, halfWidth, shift, cache = new Map<string, RiverTile>() } = options
  const geometry: RiverGeometry = { positions: [], indices: [], colors: [] }
  const { positions, indices, colors } = geometry
  const byKey = new Map(rivers.map((river) => [hexKey(river.hex), river]))
  const floor = profile[profile.length - 1].y

  for (const river of rivers) {
    const key = `${hexKey(river.hex)}>${river.toward.map(hexKey).join(';')}|${profile.length}`
    let tile = cache.get(key)
    if (!tile) {
      const streams = riverStreams(layout, river, tileSize, halfWidth, shift)
      tile = buildRiverTile(streams, tileSize, profile)
      cache.set(key, tile)
    }
    const centre = hexToWorld(layout, river.hex)
    const ground = groundOf(river)
    const first = positions.length / 3
    for (let at = 0; at < tile.positions.length; at += 3) {
      positions.push(
        centre.x + tile.positions[at],
        ground * tile.positions[at + 1],
        centre.z + tile.positions[at + 2],
      )
    }
    colors.push(...tile.colors)
    for (const index of tile.indices) indices.push(first + index)

    for (const toward of river.toward) {
      const otherKey = hexKey(toward)
      const other = byKey.get(otherKey)
      if (!other || otherKey < hexKey(river.hex)) continue
      const far = hexToWorld(layout, toward)
      const dx = far.x - centre.x
      const dz = far.z - centre.z
      const length = Math.hypot(dx, dz)
      const direction = { x: dx / length, z: dz / length }
      const sideways = across(direction)
      const level = Math.min(ground, groundOf(other)) * floor
      const start = positions.length / 3
      for (const [base, reach] of [
        [centre, tileSize * COS30],
        [far, -tileSize * COS30],
      ] as const) {
        for (const offset of GAP_COLUMNS) {
          const out = shift + offset * halfWidth
          positions.push(
            base.x + direction.x * reach + sideways.x * out,
            level,
            base.z + direction.z * reach + sideways.z * out,
          )
          const [shade, alpha] = riverShade(Math.abs(offset))
          colors.push(shade.r, shade.g, shade.b, alpha)
        }
      }
      const width = GAP_COLUMNS.length
      for (let column = 0; column < width - 1; column++) {
        const a = start + column
        const b = a + width
        indices.push(a, b, a + 1, a + 1, b, b + 1)
      }
    }
  }
  return geometry
}

export interface RiverSegments {
  mesh: Mesh
  /** Hexes with water on them right now. */
  readonly count: number
  setSpans(spans: readonly RoadSpan[]): void
  /** Follows the grid between its bevelled prism and the flat one, so the water stays on the top. */
  setDetail(detailed: boolean): void
  dispose(): void
}

export interface RiverSegmentOptions {
  /** Centre-to-corner radius of a drawn tile, the layout size less the border gap. */
  tileSize?: number
  /** Radius of the tiles' rounded top edge, as a fraction of the tile size. */
  bevel?: number
}

/**
 * Every river painted onto the hex tops as one mesh, rebuilt whenever the
 * rivers or the grid's detail change and never in between; each hex's water
 * is worked out once and kept, so a turn that only lifts the fog is cheap.
 * Like the roads it is translucent, writes no depth and is pulled toward the
 * camera, and it is drawn just before them.
 */
export function createRiverSegments(
  scene: Scene,
  layout: Layout,
  elevationOf: (hex: Axial) => number,
  options: RiverSegmentOptions = {},
): RiverSegments {
  const tileSize = options.tileSize ?? layout.size
  const halfWidth = (layout.size * RIVER_WIDTH) / 2
  const shift = layout.size * RIVER_SHIFT
  const profiles = {
    detailed: bevelProfile(tileSize, { bevel: options.bevel }),
    flat: bevelProfile(tileSize, { bevel: 0 }),
  }
  const cache = new Map<string, RiverTile>()

  const mesh = new Mesh('riverSegments', scene)
  mesh.isPickable = false
  mesh.isVisible = false
  mesh.hasVertexAlpha = true
  mesh.alphaIndex = -1

  const material = new StandardMaterial('riverSegments', scene)
  material.specularColor = new Color3(0.3, 0.35, 0.4)
  material.specularPower = 48
  material.zOffset = -2
  material.disableDepthWrite = true
  mesh.material = material

  const groundOf = (river: RoadHex): number =>
    river.buried ? MIN_ELEVATION : Math.max(MIN_ELEVATION, elevationOf(river.hex))

  let detailed = true
  let painted: RoadHex[] = []

  const rebuild = (): void => {
    mesh.isVisible = painted.length > 0
    if (painted.length === 0) return
    const geometry = buildRiverGeometry(layout, painted, groundOf, {
      tileSize,
      profile: detailed ? profiles.detailed : profiles.flat,
      halfWidth,
      shift,
      cache,
    })
    const data = new VertexData()
    data.positions = geometry.positions
    data.indices = geometry.indices
    data.colors = geometry.colors
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

    setDetail(next): void {
      if (next === detailed) return
      detailed = next
      rebuild()
    },

    dispose(): void {
      material.dispose()
      mesh.dispose()
      cache.clear()
      painted = []
    },
  }
}
