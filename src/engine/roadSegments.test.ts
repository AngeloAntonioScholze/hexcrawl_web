import { NullEngine } from '@babylonjs/core/Engines/nullEngine'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData'
import { Scene } from '@babylonjs/core/scene'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Axial, HexKey } from '../hex/coords'
import { createLayout, hexToWorld } from '../hex/layout'
import { withRoad } from '../terrain/roads'
import { MIN_ELEVATION } from './hexGrid'
import { bevelProfile } from './hexPrism'
import {
  buildRoadGeometry,
  createRoadSegments,
  hexPaint,
  roadHexes,
  roadSpans,
  topHeight,
  wander,
  type HexPaint,
  type RoadSegments,
} from './roadSegments'

const layout = createLayout(2)

const roads = withRoad(new Set(), [
  { q: 0, r: 0 },
  { q: 1, r: 0 },
  { q: 2, r: 0 },
])

describe('roadSpans', () => {
  it('shows the DM every road', () => {
    const spans = roadSpans(roads, { dmView: true, fog: false, explored: new Set() })
    expect(spans).toEqual([
      { a: '0,0', b: '1,0', buriedA: false, buriedB: false },
      { a: '1,0', b: '2,0', buriedA: false, buriedB: false },
    ])
  })

  it('shows a player only stretches with both ends explored', () => {
    const explored = new Set<HexKey>(['0,0', '1,0'])
    const spans = roadSpans(roads, { dmView: false, fog: true, explored })
    expect(spans.map((span) => [span.a, span.b])).toEqual([['0,0', '1,0']])
  })

  it('lays the ends the DM sees under the fog flat', () => {
    const explored = new Set<HexKey>(['0,0', '1,0'])
    const spans = roadSpans(roads, { dmView: true, fog: true, explored })
    expect(spans[1]).toEqual({ a: '1,0', b: '2,0', buriedA: false, buriedB: true })
  })
})

describe('roadHexes', () => {
  it('gathers every road leaving each hex, with its own fog', () => {
    const hexes = roadHexes([
      { a: '0,0', b: '1,0', buriedA: false, buriedB: false },
      { a: '1,0', b: '2,0', buriedA: false, buriedB: true },
    ])
    expect(hexes).toEqual([
      { hex: { q: 0, r: 0 }, buried: false, toward: [{ q: 1, r: 0 }] },
      {
        hex: { q: 1, r: 0 },
        buried: false,
        toward: [
          { q: 0, r: 0 },
          { q: 2, r: 0 },
        ],
      },
      { hex: { q: 2, r: 0 }, buried: true, toward: [{ q: 1, r: 0 }] },
    ])
  })
})

const SIN60 = Math.sqrt(3) / 2
const tileSize = 2 * 0.94
const bevelled = bevelProfile(tileSize, { bevel: 0.14 })
const flat = bevelProfile(tileSize, { bevel: 0 })
const rim = tileSize * SIN60

describe('topHeight', () => {
  it('is level across the cap and drops down the rounded rim to the wall', () => {
    expect(topHeight(0, 0, bevelled)).toBe(1)
    expect(topHeight(0.5, -0.4, bevelled)).toBe(1)
    expect(topHeight(rim, 0, bevelled)).toBeCloseTo(1 - 0.14 * tileSize)
    expect(topHeight(rim * 0.97, 0, bevelled)).toBeLessThan(1)
  })

  it('reads the same ring along every side', () => {
    const angle = Math.PI / 3
    const at = rim * 0.95
    expect(topHeight(at * Math.cos(angle), at * Math.sin(angle), bevelled)).toBeCloseTo(
      topHeight(at, 0, bevelled),
    )
  })

  it('is level to the rim on the flat prism', () => {
    expect(topHeight(rim, 0, flat)).toBe(1)
  })
})

const paintOf = (from: Axial, toward: Axial[], profile = bevelled): HexPaint =>
  hexPaint(layout, { hex: from, buried: false, toward }, tileSize, profile, 0.2)

describe('hexPaint', () => {
  it('leaves through the middle of the side, so neighbours meet square across the border', () => {
    const here = paintOf({ q: 0, r: 0 }, [{ q: 1, r: 0 }]).lines[0][0]
    const there = paintOf({ q: 1, r: 0 }, [{ q: 0, r: 0 }]).lines[0][0]
    const centreA = hexToWorld(layout, { q: 0, r: 0 })
    const centreB = hexToWorld(layout, { q: 1, r: 0 })
    expect(here.x).toBeCloseTo(rim)
    expect(here.z).toBeCloseTo(0)
    expect(centreA.z + here.z).toBeCloseTo(centreB.z + there.z)
    expect(centreB.x + there.x - (centreA.x + here.x)).toBeCloseTo(
      2 * (layout.size - tileSize) * SIN60,
    )
  })

  it('steps down the rounded rim on its rings, and runs straight on the flat prism', () => {
    const bevelledLine = paintOf({ q: 0, r: 0 }, [{ q: 1, r: 0 }]).lines[0]
    const flatLine = paintOf({ q: 0, r: 0 }, [{ q: 1, r: 0 }], flat).lines[0]
    const reaches = bevelledLine.map((point) => point.x)
    for (const ring of bevelled) {
      expect(reaches.some((x) => Math.abs(x - ring.radius * SIN60) < 1e-9)).toBe(true)
    }
    expect(flatLine.length).toBeLessThan(bevelledLine.length)
  })

  it('bends two roads into one path with no clearing', () => {
    const paint = paintOf({ q: 1, r: 0 }, [
      { q: 0, r: 0 },
      { q: 1, r: 1 },
    ])
    expect(paint.lines).toHaveLength(1)
    expect(paint.clearing).toBe(0)
    const line = paint.lines[0]
    const last = line[line.length - 1]
    expect(Math.hypot(line[0].x, line[0].z)).toBeCloseTo(rim)
    expect(Math.hypot(last.x, last.z)).toBeCloseTo(rim)
  })

  it('runs three roads into a clearing, and ends a lone road in a small patch', () => {
    const junction = paintOf({ q: 0, r: 0 }, [
      { q: 1, r: 0 },
      { q: -1, r: 0 },
      { q: 0, r: 1 },
    ])
    expect(junction.lines).toHaveLength(3)
    for (const line of junction.lines) {
      const last = line[line.length - 1]
      expect(Math.hypot(last.x, last.z)).toBeCloseTo(0)
    }
    const lone = paintOf({ q: 0, r: 0 }, [{ q: 1, r: 0 }])
    expect(lone.clearing).toBeGreaterThan(0)
    expect(lone.clearing).toBeLessThan(junction.clearing)
  })
})

describe('buildRoadGeometry', () => {
  const build = (profile = bevelled) =>
    buildRoadGeometry(
      layout,
      [
        {
          hex: { q: 0, r: 0 },
          buried: false,
          toward: [
            { q: 1, r: 0 },
            { q: -1, r: 0 },
          ],
        },
      ],
      () => 3,
      { tileSize, profile, halfWidth: 0.2 },
    )

  it('lies on the drawn top everywhere, never above it', () => {
    const { positions } = build()
    for (let at = 0; at < positions.length; at += 3) {
      const y = positions[at + 1]
      expect(y).toBeCloseTo(3 * topHeight(positions[at], positions[at + 2], bevelled))
      expect(y).toBeLessThanOrEqual(3)
    }
    const flatTop = build(flat).positions.filter((_, at) => at % 3 === 1)
    expect(new Set(flatTop)).toEqual(new Set([3]))
  })

  it('meets the rim at its plain width, wandering only inside the hex', () => {
    const { positions } = build()
    const zs = positions.slice(0, 30).filter((_, at) => at % 3 === 2)
    expect(Math.abs(zs[0])).toBeCloseTo(0.2)
    expect(Math.abs(zs[zs.length - 1])).toBeCloseTo(0.2)
  })

  it('faces up and fades out at its edges', () => {
    const { positions, indices, colors } = build()
    const normals: number[] = []
    VertexData.ComputeNormals(positions, indices, normals)
    let middle = 0
    for (let at = 0; at < positions.length; at += 3) {
      if (
        Math.hypot(positions[at], positions[at + 2]) <
        Math.hypot(positions[middle], positions[middle + 2])
      )
        middle = at
    }
    expect(normals[middle + 1]).toBeCloseTo(1)
    expect(colors[3]).toBe(0)
    expect(colors[7]).toBe(1)
  })
})

describe('wander', () => {
  it('is smooth, bounded and repeatable', () => {
    for (let at = 0; at < 10; at += 0.37) {
      const value = wander(5, at)
      expect(Math.abs(value)).toBeLessThanOrEqual(1)
      expect(wander(5, at)).toBe(value)
      expect(Math.abs(wander(5, at + 0.01) - value)).toBeLessThan(0.05)
    }
  })
})

describe('createRoadSegments', () => {
  let engine: NullEngine
  let scene: Scene
  let segments: RoadSegments

  beforeEach(() => {
    engine = new NullEngine()
    scene = new Scene(engine)
    segments = createRoadSegments(scene, layout, () => 2, { tileSize, bevel: 0.14 })
  })

  afterEach(() => {
    segments.dispose()
    scene.dispose()
    engine.dispose()
  })

  const heights = (): number[] =>
    Array.from(segments.mesh.getVerticesData('position') ?? []).filter((_, at) => at % 3 === 1)

  it('starts empty and hidden', () => {
    expect(segments.count).toBe(0)
    expect(segments.mesh.isVisible).toBe(false)
  })

  it('paints each hex a road touches, and nothing once they are gone', () => {
    segments.setSpans(roadSpans(roads, { dmView: true, fog: false, explored: new Set() }))
    expect(segments.count).toBe(3)
    expect(segments.mesh.isVisible).toBe(true)
    expect(segments.mesh.isPickable).toBe(false)
    expect(segments.mesh.getTotalVertices()).toBeGreaterThan(0)

    segments.setSpans([])
    expect(segments.count).toBe(0)
    expect(segments.mesh.isVisible).toBe(false)
  })

  it('lays a buried end on the flattened floor', () => {
    segments.setSpans([{ a: '0,0', b: '1,0', buriedA: true, buriedB: false }])
    expect(Math.min(...heights())).toBeLessThanOrEqual(MIN_ELEVATION)
    expect(Math.max(...heights())).toBeCloseTo(2)
  })

  it('follows the grid onto the flat prism, all the way out to the rim', () => {
    segments.setSpans([{ a: '0,0', b: '1,0', buriedA: false, buriedB: false }])
    expect(Math.min(...heights())).toBeLessThan(2)
    segments.setDetail(false)
    expect(Math.min(...heights())).toBeCloseTo(2)
  })
})
