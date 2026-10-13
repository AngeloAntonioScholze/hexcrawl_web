import { NullEngine } from '@babylonjs/core/Engines/nullEngine'
import { Scene } from '@babylonjs/core/scene'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseKey, type HexKey } from '../hex/coords'
import { corners, createLayout } from '../hex/layout'
import { riverKey, withRiverToggled } from '../terrain/rivers'
import { MIN_ELEVATION } from './hexGrid'
import {
  buildRiverGeometry,
  createRiverSegments,
  riverSpans,
  sharedSide,
  type RiverSegments,
  type RiverSpan,
} from './riverSegments'

const layout = createLayout(2)

const rivers = withRiverToggled(
  withRiverToggled(new Set(), { q: 0, r: 0 }, { q: 1, r: 0 }),
  { q: 0, r: 0 },
  { q: 0, r: 1 },
)

const span = (a: HexKey, b: HexKey, over: Partial<RiverSpan> = {}): RiverSpan => ({
  a,
  b,
  buriedA: false,
  buriedB: false,
  preview: false,
  ...over,
})

describe('riverSpans', () => {
  it('shows the DM every river', () => {
    expect(riverSpans(rivers, { dmView: true, fog: false, explored: new Set() })).toEqual([
      span('0,0', '1,0'),
      span('0,0', '0,1'),
    ])
  })

  it('shows a player a river from either bank, flattening the bank still fogged', () => {
    const explored = new Set<HexKey>(['1,0'])
    expect(riverSpans(rivers, { dmView: false, fog: true, explored })).toEqual([
      span('0,0', '1,0', { buriedA: true }),
    ])
  })

  it('adds the side under the pointer as a preview', () => {
    const hover = riverKey({ q: 2, r: 0 }, { q: 3, r: 0 })
    const spans = riverSpans(new Set(), { dmView: true, fog: false, explored: new Set() }, hover)
    expect(spans).toEqual([span('2,0', '3,0', { preview: true })])
  })
})

describe('sharedSide', () => {
  const near = (a: { x: number; z: number }, b: { x: number; z: number }): boolean =>
    Math.hypot(a.x - b.x, a.z - b.z) < 1e-9

  it.each([[{ q: 1, r: 0 }], [{ q: 0, r: 1 }], [{ q: -1, r: 1 }], [{ q: 0, r: -1 }]])(
    'runs corner to corner between the hexes either side, toward %o',
    (other) => {
      const mine = corners(layout, { q: 0, r: 0 })
      const theirs = corners(layout, other)
      const shared = mine.filter((corner) => theirs.some((one) => near(one, corner)))
      expect(shared).toHaveLength(2)

      const [start, end] = sharedSide(layout, { q: 0, r: 0 }, other)
      expect(shared.some((corner) => near(corner, start))).toBe(true)
      expect(shared.some((corner) => near(corner, end))).toBe(true)
    },
  )
})

describe('buildRiverGeometry', () => {
  const heights: Record<string, number> = { '0,0': 3, '1,0': 1.5 }
  const groundOf = (hex: HexKey, buried: boolean): number => (buried ? MIN_ELEVATION : heights[hex])

  it('lays a ribbon level with the lower bank', () => {
    const geometry = buildRiverGeometry(layout, [span('0,0', '1,0')], groundOf, 0.2)
    const ys = geometry.positions.filter((_, index) => index % 3 === 1)
    expect(new Set(ys)).toEqual(new Set([1.5]))
    expect(geometry.indices.length).toBeGreaterThan(0)
    expect(geometry.colors.length / 4).toBe(geometry.positions.length / 3)
  })

  it('drops to the fog floor beside a bank still under the fog', () => {
    const geometry = buildRiverGeometry(
      layout,
      [span('0,0', '1,0', { buriedB: true })],
      groundOf,
      0.2,
    )
    expect(geometry.positions[1]).toBe(MIN_ELEVATION)
  })

  it('reaches past both corners so stretches meet without a seam', () => {
    const [start, end] = sharedSide(layout, parseKey('0,0'), parseKey('1,0'))
    const geometry = buildRiverGeometry(layout, [span('0,0', '1,0')], groundOf, 0.2)
    const zs = geometry.positions.filter((_, index) => index % 3 === 2)
    expect(Math.min(...zs)).toBeLessThan(Math.min(start.z, end.z))
    expect(Math.max(...zs)).toBeGreaterThan(Math.max(start.z, end.z))
  })
})

describe('createRiverSegments', () => {
  let engine: NullEngine
  let scene: Scene
  let segments: RiverSegments

  beforeEach(() => {
    engine = new NullEngine()
    scene = new Scene(engine)
    segments = createRiverSegments(scene, layout, () => 2)
  })

  afterEach(() => {
    segments.dispose()
    scene.dispose()
    engine.dispose()
  })

  it('hides the mesh until there is river to draw', () => {
    expect(segments.mesh.isVisible).toBe(false)
    segments.setSpans([span('0,0', '1,0')])
    expect(segments.mesh.isVisible).toBe(true)
    expect(segments.count).toBe(1)
    expect(segments.mesh.getTotalVertices()).toBeGreaterThan(0)

    segments.setSpans([])
    expect(segments.mesh.isVisible).toBe(false)
    expect(segments.count).toBe(0)
  })
})
