import { NullEngine } from '@babylonjs/core/Engines/nullEngine'
import { Scene } from '@babylonjs/core/scene'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { HexKey } from '../hex/coords'
import { createLayout, hexToWorld } from '../hex/layout'
import { withRoad } from '../terrain/roads'
import { MIN_ELEVATION } from './hexGrid'
import { createRoadSegments, halfPlacement, roadSpans, type RoadSegments } from './roadSegments'

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

describe('halfPlacement', () => {
  it('runs from just behind the centre out to the shared edge, on the hex top', () => {
    const from = { q: 0, r: 0 }
    const to = { q: 1, r: 0 }
    const width = 0.2
    const half = halfPlacement(layout, from, to, 3, width, 0.1)

    const start = hexToWorld(layout, from)
    const end = hexToWorld(layout, to)
    const reach = Math.hypot(end.x - start.x, end.z - start.z) / 2

    expect(half.length).toBeCloseTo(reach + width / 2)
    expect(half.y).toBeCloseTo(3.05)
    expect(half.yaw).toBeCloseTo(Math.PI / 2)
    // The far end lands on the edge midway between the two centres.
    expect(half.x + half.length / 2).toBeCloseTo((start.x + end.x) / 2)
    expect(half.z).toBeCloseTo(start.z)
  })
})

describe('createRoadSegments', () => {
  let engine: NullEngine
  let scene: Scene
  let segments: RoadSegments

  beforeEach(() => {
    engine = new NullEngine()
    scene = new Scene(engine)
    segments = createRoadSegments(scene, layout, () => 2)
  })

  afterEach(() => {
    segments.dispose()
    scene.dispose()
    engine.dispose()
  })

  it('starts empty and hidden', () => {
    expect(segments.count).toBe(0)
    expect(segments.mesh.isVisible).toBe(false)
  })

  it('draws two halves a stretch, and nothing once they are gone', () => {
    segments.setSpans(roadSpans(roads, { dmView: true, fog: false, explored: new Set() }))
    expect(segments.count).toBe(4)
    expect(segments.mesh.isVisible).toBe(true)
    expect(segments.mesh.isPickable).toBe(false)

    segments.setSpans([])
    expect(segments.count).toBe(0)
    expect(segments.mesh.isVisible).toBe(false)
  })

  it('sits a buried end on the flattened floor', () => {
    segments.setSpans([{ a: '0,0', b: '1,0', buriedA: true, buriedB: false }])
    const matrices = segments.mesh.thinInstanceGetWorldMatrices()
    expect(matrices[0].getTranslation().y).toBeLessThan(MIN_ELEVATION + 0.1)
    expect(matrices[1].getTranslation().y).toBeGreaterThan(2)
  })
})
