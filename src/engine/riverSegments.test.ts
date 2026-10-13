import { NullEngine } from '@babylonjs/core/Engines/nullEngine'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData'
import { Scene } from '@babylonjs/core/scene'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createLayout, hexToWorld } from '../hex/layout'
import { bevelProfile } from './hexPrism'
import {
  buildRiverGeometry,
  buildRiverTile,
  createRiverSegments,
  riverShade,
  riverStreams,
  wetness,
  type RiverSegments,
  type Stream,
} from './riverSegments'
import { createRoadSegments, type RoadHex, type RoadSegments } from './roadSegments'

const layout = createLayout(2)
const tileSize = 2 * 0.94
const profile = bevelProfile(tileSize, { bevel: 0.14 })
const halfWidth = 0.2
const shift = 0.5
const COS30 = Math.sqrt(3) / 2

const through: RoadHex = {
  hex: { q: 0, r: 0 },
  buried: false,
  toward: [
    { q: 1, r: 0 },
    { q: -1, r: 0 },
  ],
}

describe('riverStreams', () => {
  it('runs to the very edge of the tile, shifted off the middle, at its plain width', () => {
    const [stream] = riverStreams(layout, through, tileSize, halfWidth, shift)
    const first = stream.points[0]
    const last = stream.points[stream.points.length - 1]
    expect(Math.abs(first.x)).toBeCloseTo(tileSize * COS30)
    expect(Math.abs(last.x)).toBeCloseTo(tileSize * COS30)
    expect(Math.abs(first.z)).toBeCloseTo(shift)
    expect(stream.halfWidths[0]).toBeCloseTo(halfWidth)
    expect(stream.halfWidths[stream.halfWidths.length - 1]).toBeCloseTo(halfWidth)
  })

  it('wanders and swells along the way', () => {
    const [stream] = riverStreams(layout, through, tileSize, halfWidth, shift)
    const widths = new Set(stream.halfWidths.map((width) => width.toFixed(3)))
    expect(widths.size).toBeGreaterThan(3)
  })

  it('narrows to its source in the hex where a river ends', () => {
    const lone: RoadHex = { hex: { q: 0, r: 0 }, buried: false, toward: [{ q: 1, r: 0 }] }
    const [stream] = riverStreams(layout, lone, tileSize, halfWidth, shift)
    expect(stream.halfWidths[stream.halfWidths.length - 1]).toBeLessThan(halfWidth * 0.5)
  })
})

describe('wetness', () => {
  const straight = (z: number): Stream => ({
    points: [
      { x: -1, z },
      { x: 1, z },
    ],
    halfWidths: [0.2, 0.2],
  })

  it('reads 0 midstream and 1 at the bank', () => {
    expect(wetness([straight(0)], 0, 0)).toBeCloseTo(0)
    expect(wetness([straight(0)], 0, 0.2)).toBeCloseTo(1)
  })

  it('melts two streams together where they come close, wetter than either alone', () => {
    const between = wetness([straight(-0.22), straight(0.22)], 0, 0)
    expect(between).toBeLessThan(wetness([straight(-0.22)], 0, 0))
    expect(between).toBeLessThan(1)
  })
})

describe('riverShade', () => {
  it('is solid water inside the banks and fades out beyond them', () => {
    expect(riverShade(0)[1]).toBe(1)
    expect(riverShade(0.95)[1]).toBe(1)
    expect(riverShade(1.2)[1]).toBeGreaterThan(0)
    expect(riverShade(2)[1]).toBe(0)
  })
})

describe('buildRiverTile', () => {
  const streams = riverStreams(layout, through, tileSize, halfWidth, shift)
  const tile = buildRiverTile(streams, tileSize, profile)

  it('keeps only the cells with water in them, all on the tile', () => {
    expect(tile.indices.length).toBeGreaterThan(0)
    for (let at = 0; at < tile.positions.length; at += 3) {
      const x = tile.positions[at]
      const z = tile.positions[at + 2]
      expect(Math.abs(Math.abs(z) - shift)).toBeLessThan(halfWidth * 2.5)
      expect(Math.hypot(x, z)).toBeLessThanOrEqual(tileSize + 1e-9)
    }
  })

  it('faces up, so the light falls on the water', () => {
    const normals: number[] = []
    VertexData.ComputeNormals(tile.positions, tile.indices, normals)
    const ys = normals.filter((_, index) => index % 3 === 1)
    expect(ys.every((y) => y > 0)).toBe(true)
  })
})

describe('buildRiverGeometry', () => {
  it('carries the water across the gap between two tiles, level with the lower rim', () => {
    const rivers: RoadHex[] = [
      { hex: { q: 0, r: 0 }, buried: false, toward: [{ q: 1, r: 0 }] },
      { hex: { q: 1, r: 0 }, buried: false, toward: [{ q: 0, r: 0 }] },
    ]
    const heights: Record<string, number> = { '0,0': 3, '1,0': 1.5 }
    const geometry = buildRiverGeometry(
      layout,
      rivers,
      (river) => heights[`${river.hex.q},${river.hex.r}`],
      { tileSize, profile, halfWidth, shift },
    )
    const left = hexToWorld(layout, { q: 0, r: 0 }).x + tileSize * COS30
    const right = hexToWorld(layout, { q: 1, r: 0 }).x - tileSize * COS30
    const floor = 1.5 * profile[profile.length - 1].y
    const edges: number[] = []
    for (let at = 0; at < geometry.positions.length; at += 3) {
      const x = geometry.positions[at]
      if (Math.abs(x - left) < 1e-9 || Math.abs(x - right) < 1e-9) {
        edges.push(geometry.positions[at + 1])
      }
    }
    expect(edges.some((y) => Math.abs(y - floor) < 1e-9)).toBe(true)
  })
})

describe('createRiverSegments', () => {
  let engine: NullEngine
  let scene: Scene
  let rivers: RiverSegments
  let roads: RoadSegments

  beforeEach(() => {
    engine = new NullEngine()
    scene = new Scene(engine)
    rivers = createRiverSegments(scene, layout, () => 2)
    roads = createRoadSegments(scene, layout, () => 2)
  })

  afterEach(() => {
    rivers.dispose()
    roads.dispose()
    scene.dispose()
    engine.dispose()
  })

  it('hides the mesh until there is river to draw', () => {
    expect(rivers.mesh.isVisible).toBe(false)
    rivers.setSpans([{ a: '0,0', b: '1,0', buriedA: false, buriedB: false }])
    expect(rivers.mesh.isVisible).toBe(true)
    expect(rivers.count).toBe(2)
    rivers.setSpans([])
    expect(rivers.mesh.isVisible).toBe(false)
  })

  it('is drawn before the roads, so a road over it lies on top', () => {
    expect(rivers.mesh.alphaIndex).toBeLessThan(roads.mesh.alphaIndex)
  })
})
