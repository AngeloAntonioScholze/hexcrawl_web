import { NullEngine } from '@babylonjs/core/Engines/nullEngine'
import { Scene } from '@babylonjs/core/scene'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Axial, HexKey } from '../hex/coords'
import { createLayout, hexToWorld } from '../hex/layout'
import type { Resource, ResourceType } from '../terrain/resources'
import { MIN_ELEVATION } from './hexGrid'
import {
  buildGem,
  createResourceMarkers,
  markPlacement,
  resourceMarks,
  type ResourceMarkers,
} from './resourceMarkers'

const layout = createLayout(2)

const resource = (hex: HexKey, type: ResourceType = 'iron', id = `${hex}:${type}`): Resource => ({
  id,
  hex,
  type,
  origin: 'generated',
})

const resources = [
  resource('0,0'),
  resource('0,0', 'stone'),
  resource('3,-1', 'fish'),
  resource('5,2', 'gems'),
]

describe('resourceMarks', () => {
  it('shows the DM every resource, one mark a hex counting what it holds', () => {
    const marks = resourceMarks(resources, { dmView: true, fog: false, explored: new Set() })
    expect(marks).toEqual([
      { hex: '0,0', count: 2, buried: false },
      { hex: '3,-1', count: 1, buried: false },
      { hex: '5,2', count: 1, buried: false },
    ])
  })

  it('shows a player only the resources on explored hexes', () => {
    const explored = new Set<HexKey>(['0,0', '5,2'])
    const marks = resourceMarks(resources, { dmView: false, fog: true, explored })
    expect(marks.map((mark) => mark.hex)).toEqual(['0,0', '5,2'])
    expect(marks.every((mark) => !mark.buried)).toBe(true)
  })

  it('shows a player nothing before anything is explored, fog or no fog', () => {
    expect(resourceMarks(resources, { dmView: false, fog: false, explored: new Set() })).toEqual([])
  })

  it('marks what the DM sees under the fog as buried', () => {
    const explored = new Set<HexKey>(['0,0'])
    const marks = resourceMarks(resources, { dmView: true, fog: true, explored })
    expect(marks.map((mark) => mark.buried)).toEqual([false, true, true])
  })
})

describe('markPlacement', () => {
  const elevationOf = (hex: Axial): number => (hex.q === 3 ? 4 : 1)

  it('stands the gem on the tile top, inside the hex', () => {
    const placed = markPlacement(layout, { hex: '3,-1', count: 1, buried: false }, elevationOf, 0.5)
    const centre = hexToWorld(layout, { q: 3, r: -1 })
    expect(placed.y).toBeCloseTo(4.5)
    expect(Math.hypot(placed.x - centre.x, placed.z - centre.z)).toBeLessThan(layout.size * 0.8)
    expect(placed.scale).toBe(1)
  })

  it('lays a buried gem on the flattened tile instead', () => {
    const placed = markPlacement(layout, { hex: '3,-1', count: 1, buried: true }, elevationOf, 0.5)
    expect(placed.y).toBeCloseTo(MIN_ELEVATION + 0.5)
  })

  it('grows with the resources on the hex, up to a limit', () => {
    const scaleFor = (count: number): number =>
      markPlacement(layout, { hex: '0,0', count, buried: false }, elevationOf, 0).scale
    expect(scaleFor(2)).toBeGreaterThan(scaleFor(1))
    expect(scaleFor(9)).toBe(scaleFor(3))
  })
})

describe('buildGem', () => {
  it('rises from a tip at the origin, its faces turned outward', () => {
    const gem = buildGem(1, 2)
    const positions = gem.positions!
    const normals = gem.normals!
    const ys = positions.filter((_, i) => i % 3 === 1)
    expect(Math.min(...ys)).toBe(0)
    expect(Math.max(...ys)).toBe(2)

    // Every face's normal points away from the gem's axis at the face's height.
    for (let i = 0; i < positions.length; i += 9) {
      const cx = (positions[i] + positions[i + 3] + positions[i + 6]) / 3
      const cz = (positions[i + 2] + positions[i + 5] + positions[i + 8]) / 3
      expect(normals[i] * cx + normals[i + 2] * cz).toBeGreaterThan(0)
    }
  })
})

describe('createResourceMarkers', () => {
  let engine: NullEngine
  let scene: Scene
  let markers: ResourceMarkers

  beforeEach(() => {
    engine = new NullEngine()
    scene = new Scene(engine)
    markers = createResourceMarkers(scene, layout, () => 1, { hover: 0 })
  })

  afterEach(() => {
    markers.dispose()
    scene.dispose()
    engine.dispose()
  })

  it('draws nothing before it is given any marks', () => {
    expect(markers.count).toBe(0)
    expect(markers.mesh.isVisible).toBe(false)
  })

  it('puts one instance on each marked hex, and takes them away again', () => {
    const marks = resourceMarks(resources, { dmView: true, fog: false, explored: new Set() })
    markers.setMarks(marks)

    expect(markers.count).toBe(3)
    expect(markers.mesh.thinInstanceCount).toBe(3)
    expect(markers.mesh.isVisible).toBe(true)

    const matrices = markers.mesh.thinInstanceGetWorldMatrices()
    const expected = markPlacement(layout, marks[1], () => 1, 0)
    expect(matrices[1].m[12]).toBeCloseTo(expected.x)
    expect(matrices[1].m[13]).toBeCloseTo(expected.y)
    expect(matrices[1].m[14]).toBeCloseTo(expected.z)

    markers.setMarks([])
    expect(markers.count).toBe(0)
    expect(markers.mesh.isVisible).toBe(false)
  })

  it('takes a world full of resources in one go', () => {
    const many = Array.from({ length: 3000 }, (_, i) => ({
      hex: `${i},0` as HexKey,
      count: 1,
      buried: false,
    }))
    markers.setMarks(many)
    expect(markers.mesh.thinInstanceCount).toBe(3000)
  })
})
