import { NullEngine } from '@babylonjs/core/Engines/nullEngine'
import { Scene } from '@babylonjs/core/scene'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Axial, HexKey } from '../hex/coords'
import { createLayout, hexToWorld } from '../hex/layout'
import { RESOURCE_TYPES, type Resource, type ResourceType } from '../terrain/resources'
import { MIN_ELEVATION } from './hexGrid'
import {
  buildGem,
  buildResourceModel,
  createResourceMarkers,
  instanceBuffer,
  markPlacements,
  MAX_CLUSTER,
  placementsByType,
  resourceMarks,
  type ResourceMark,
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
  resource('0,0', 'stone'),
  resource('0,0'),
  resource('0,0', 'iron', 'second iron'),
  resource('3,-1', 'fish'),
  resource('5,2', 'gems'),
]

const mark = (hex: HexKey, types: ResourceType[], buried = false): ResourceMark => ({
  hex,
  types,
  buried,
})

describe('resourceMarks', () => {
  it('shows the DM every resource, one mark a hex listing each kind it holds once', () => {
    const marks = resourceMarks(resources, { dmView: true, fog: false, explored: new Set() })
    expect(marks).toEqual([
      mark('0,0', ['iron', 'stone']),
      mark('3,-1', ['fish']),
      mark('5,2', ['gems']),
    ])
  })

  it('shows a player only the resources on explored hexes', () => {
    const explored = new Set<HexKey>(['0,0', '5,2'])
    const marks = resourceMarks(resources, { dmView: false, fog: true, explored })
    expect(marks.map((one) => one.hex)).toEqual(['0,0', '5,2'])
    expect(marks.every((one) => !one.buried)).toBe(true)
  })

  it('shows a player nothing before anything is explored, fog or no fog', () => {
    expect(resourceMarks(resources, { dmView: false, fog: false, explored: new Set() })).toEqual([])
  })

  it('marks what the DM sees under the fog as buried', () => {
    const explored = new Set<HexKey>(['0,0'])
    const marks = resourceMarks(resources, { dmView: true, fog: true, explored })
    expect(marks.map((one) => one.buried)).toEqual([false, true, true])
  })
})

describe('markPlacements', () => {
  const elevationOf = (hex: Axial): number => (hex.q === 3 ? 4 : 1)

  it('stands a lone model on the tile top, inside the hex', () => {
    const [placed] = markPlacements(layout, mark('3,-1', ['fish']), elevationOf, 0.5)
    const centre = hexToWorld(layout, { q: 3, r: -1 })
    expect(placed.type).toBe('fish')
    expect(placed.y).toBeCloseTo(4.5)
    expect(Math.hypot(placed.x - centre.x, placed.z - centre.z)).toBeLessThan(layout.size * 0.8)
    expect(placed.scale).toBe(1)
  })

  it('lays a buried model on the flattened tile instead', () => {
    const [placed] = markPlacements(layout, mark('3,-1', ['fish'], true), elevationOf, 0.5)
    expect(placed.y).toBeCloseTo(MIN_ELEVATION + 0.5)
  })

  it('stands several kinds apart around the same point, smaller, and no more than a few', () => {
    const [alone] = markPlacements(layout, mark('0,0', ['iron']), elevationOf, 0)
    const crowd = markPlacements(
      layout,
      mark('0,0', ['iron', 'stone', 'gems', 'crystal']),
      elevationOf,
      0,
    )
    expect(crowd.map((placed) => placed.type)).toEqual(['iron', 'stone', 'gems'])
    expect(crowd).toHaveLength(MAX_CLUSTER)

    const middle = {
      x: crowd.reduce((sum, placed) => sum + placed.x, 0) / crowd.length,
      z: crowd.reduce((sum, placed) => sum + placed.z, 0) / crowd.length,
    }
    expect(middle.x).toBeCloseTo(alone.x)
    expect(middle.z).toBeCloseTo(alone.z)

    const centre = hexToWorld(layout, { q: 0, r: 0 })
    for (const [i, placed] of crowd.entries()) {
      expect(placed.scale).toBeLessThan(1)
      expect(Math.hypot(placed.x - centre.x, placed.z - centre.z)).toBeLessThan(layout.size * 0.8)
      for (const other of crowd.slice(i + 1)) {
        expect(Math.hypot(placed.x - other.x, placed.z - other.z)).toBeGreaterThan(
          layout.size * 0.2,
        )
      }
    }
  })
})

describe('placementsByType', () => {
  it('gathers every kind into its own list, empty where nothing of it stands', () => {
    const byType = placementsByType(
      layout,
      [mark('0,0', ['iron', 'stone']), mark('3,-1', ['iron']), mark('5,2', ['fish'])],
      () => 1,
      0,
    )
    expect(Object.keys(byType).sort()).toEqual([...RESOURCE_TYPES].sort())
    expect(byType.iron).toHaveLength(2)
    expect(byType.stone).toHaveLength(1)
    expect(byType.fish).toHaveLength(1)
    expect(byType.whales).toEqual([])
    expect(byType.iron.every((placed) => placed.type === 'iron')).toBe(true)
  })
})

describe('instanceBuffer', () => {
  it('writes one scaled, translated matrix per placement', () => {
    const buffer = instanceBuffer([
      { type: 'salt', x: 1, y: 2, z: 3, scale: 1 },
      { type: 'salt', x: 4, y: 5, z: 6, scale: 0.5 },
    ])
    expect(buffer).toHaveLength(32)
    expect([...buffer.slice(12, 15)]).toEqual([1, 2, 3])
    expect(buffer[16]).toBe(0.5)
    expect([...buffer.slice(28, 31)]).toEqual([4, 5, 6])
  })

  it('is empty when nothing stands', () => {
    expect(instanceBuffer([])).toHaveLength(0)
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

describe('buildResourceModel', () => {
  const extent = (values: ArrayLike<number>, axis: number): [number, number] => {
    const along = Array.from(values).filter((_, i) => i % 3 === axis)
    return [Math.min(...along), Math.max(...along)]
  }

  it.each(RESOURCE_TYPES)('builds %s as a small coloured model on the origin', (type) => {
    const model = buildResourceModel(type, 2)
    const positions = model.positions!
    expect(positions.length).toBeGreaterThan(0)
    expect(model.normals).toHaveLength(positions.length)
    expect(model.colors).toHaveLength((positions.length / 3) * 4)

    // Feet on the ground, give or take a mound sunk into the tile, and no taller than the gem.
    const [low, high] = extent(positions, 1)
    expect(low).toBeGreaterThan(-0.6)
    expect(low).toBeLessThan(0.5)
    expect(high).toBeLessThan(4.01)
    for (const axis of [0, 2]) {
      const [from, to] = extent(positions, axis)
      expect(Math.max(-from, to)).toBeLessThan(1.4)
    }
  })

  it('gives every kind a model of its own', () => {
    const signature = (type: ResourceType): string => {
      const model = buildResourceModel(type, 1)
      const colors = Array.from(model.colors!)
      const average = [0, 1, 2].map(
        (channel) =>
          (colors.filter((_, i) => i % 4 === channel).reduce((a, b) => a + b, 0) * 4) /
          colors.length,
      )
      return [model.indices!.length, ...average.map((value) => value.toFixed(3))].join()
    }
    expect(new Set(RESOURCE_TYPES.map(signature)).size).toBe(RESOURCE_TYPES.length)
  })

  it('scales with the width it is given', () => {
    const [, small] = extent(buildResourceModel('crystal', 1).positions!, 1)
    const [, large] = extent(buildResourceModel('crystal', 3).positions!, 1)
    expect(large).toBeCloseTo(small * 3)
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

  it('makes one mesh for each kind, all hidden before it is given any marks', () => {
    expect(Object.keys(markers.meshes).sort()).toEqual([...RESOURCE_TYPES].sort())
    expect(new Set(Object.values(markers.meshes)).size).toBe(RESOURCE_TYPES.length)
    expect(markers.count).toBe(0)
    expect(Object.values(markers.meshes).every((mesh) => !mesh.isVisible)).toBe(true)
  })

  it('puts an instance of each kind on each hex holding it, and takes them away again', () => {
    const marks = resourceMarks(resources, { dmView: true, fog: false, explored: new Set() })
    markers.setMarks(marks)

    expect(markers.count).toBe(4)
    expect(markers.meshes.iron.thinInstanceCount).toBe(1)
    expect(markers.meshes.stone.thinInstanceCount).toBe(1)
    expect(markers.meshes.fish.thinInstanceCount).toBe(1)
    expect(markers.meshes.gems.thinInstanceCount).toBe(1)
    expect(markers.meshes.iron.isVisible).toBe(true)
    expect(markers.meshes.whales.isVisible).toBe(false)

    const [fish] = markers.meshes.fish.thinInstanceGetWorldMatrices()
    const [expected] = markPlacements(layout, marks[1], () => 1, 0)
    expect(fish.m[12]).toBeCloseTo(expected.x)
    expect(fish.m[13]).toBeCloseTo(expected.y)
    expect(fish.m[14]).toBeCloseTo(expected.z)

    markers.setMarks([])
    expect(markers.count).toBe(0)
    expect(Object.values(markers.meshes).every((mesh) => !mesh.isVisible)).toBe(true)
  })

  it('takes a world full of resources in one go', () => {
    const many = Array.from({ length: 3000 }, (_, i) =>
      mark(`${i},0` as HexKey, [RESOURCE_TYPES[i % RESOURCE_TYPES.length]]),
    )
    markers.setMarks(many)
    expect(markers.count).toBe(3000)
    const total = Object.values(markers.meshes).reduce(
      (sum, mesh) => sum + mesh.thinInstanceCount,
      0,
    )
    expect(total).toBe(3000)
  })

  it('leaves nothing behind in the scene once disposed', () => {
    markers.dispose()
    expect(scene.meshes.filter((mesh) => mesh.name.startsWith('resourceMarkers'))).toEqual([])
    expect(scene.materials.filter((one) => one.name.startsWith('resourceMarkers'))).toEqual([])
  })
})
