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
  FOOTPRINT,
  instanceBuffer,
  markPlacements,
  MAX_CLUSTER,
  placementsByType,
  resourceMarks,
  SLOTS,
  type MarkPlacement,
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
  const centre = hexToWorld(layout, { q: 0, r: 0 })
  const footprint = FOOTPRINT * layout.size
  const fromCentre = (placed: MarkPlacement): number =>
    Math.hypot(placed.x - centre.x, placed.z - centre.z)

  /** The flat top of a drawn tile: inside the gap between tiles and the rounded rim. */
  const capApothem = layout.size * 0.94 * (1 - 0.14) * (Math.sqrt(3) / 2)

  const crowds = [['iron'], ['iron', 'stone'], ['iron', 'stone', 'gems']].map(
    (types) => [types.join(' + '), types as ResourceType[]] as const,
  )

  it('stands every clump on the tile top', () => {
    const placed = markPlacements(layout, mark('3,-1', ['fish']), elevationOf, 0.5)
    expect(placed.every((one) => one.y === 4.5)).toBe(true)
  })

  it('lays a buried clump on the flattened tile instead', () => {
    const placed = markPlacements(layout, mark('3,-1', ['fish'], true), elevationOf, 0.5)
    expect(placed.every((one) => one.y === MIN_ELEVATION + 0.5)).toBe(true)
  })

  it.each(crowds)('fills the hex with %s, no clump reaching past the flat top', (_, types) => {
    const placed = markPlacements(layout, mark('0,0', types), elevationOf, 0)
    expect(placed).toHaveLength(SLOTS)
    for (const one of placed) {
      for (let side = 0; side < 6; side++) {
        const angle = (Math.PI / 3) * side
        const reach =
          (one.x - centre.x) * Math.cos(angle) + (one.z - centre.z) * Math.sin(angle) + footprint
        expect(reach).toBeLessThan(capApothem)
      }
    }
    // Between them the clumps reach out over most of the hex.
    expect(Math.min(...placed.map(fromCentre)) + footprint).toBeGreaterThan(layout.size * 0.7)
  })

  it.each(crowds)('keeps the middle clear for tokens with %s', (_, types) => {
    for (const one of markPlacements(layout, mark('0,0', types), elevationOf, 0)) {
      expect(fromCentre(one) - footprint).toBeGreaterThan(layout.size * 0.25)
    }
  })

  it.each(crowds)('never overlaps two clumps of %s', (_, types) => {
    const placed = markPlacements(layout, mark('0,0', types), elevationOf, 0)
    for (const [i, one] of placed.entries()) {
      for (const other of placed.slice(i + 1)) {
        expect(Math.hypot(one.x - other.x, one.z - other.z)).toBeGreaterThan(2 * footprint)
      }
    }
  })

  it.each(crowds)('gives each of %s an equal run of neighbouring slots', (_, types) => {
    const placed = markPlacements(layout, mark('0,0', types), elevationOf, 0)
    expect(placed.map((one) => one.type)).toEqual(
      types.flatMap((type) => Array<ResourceType>(SLOTS / types.length).fill(type)),
    )
  })

  it('shows no more than a few kinds', () => {
    const placed = markPlacements(
      layout,
      mark('0,0', ['iron', 'stone', 'gems', 'crystal']),
      elevationOf,
      0,
    )
    expect(new Set(placed.map((one) => one.type))).toEqual(new Set(['iron', 'stone', 'gems']))
    expect(MAX_CLUSTER).toBe(3)
  })

  it('turns and sizes clumps differently, the same way every time', () => {
    const placed = markPlacements(layout, mark('4,-2', ['herbs']), elevationOf, 0)
    expect(new Set(placed.map((one) => one.yaw.toFixed(3))).size).toBe(SLOTS)
    for (const one of placed) {
      expect(one.scale).toBeGreaterThan(0.8)
      expect(one.scale).toBeLessThanOrEqual(1)
    }
    expect(markPlacements(layout, mark('4,-2', ['herbs']), elevationOf, 0)).toEqual(placed)
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
    expect(byType.iron).toHaveLength(SLOTS + SLOTS / 2)
    expect(byType.stone).toHaveLength(SLOTS / 2)
    expect(byType.fish).toHaveLength(SLOTS)
    expect(byType.whales).toEqual([])
    expect(byType.iron.every((placed) => placed.type === 'iron')).toBe(true)
  })
})

describe('instanceBuffer', () => {
  it('writes one scaled, turned, translated matrix per placement', () => {
    const buffer = instanceBuffer([
      { type: 'salt', x: 1, y: 2, z: 3, scale: 1, yaw: 0 },
      { type: 'salt', x: 4, y: 5, z: 6, scale: 0.5, yaw: Math.PI / 2 },
    ])
    expect(buffer).toHaveLength(32)
    expect([...buffer.slice(12, 15)]).toEqual([1, 2, 3])
    expect(buffer[0]).toBe(1)
    // A quarter turn about the vertical sends x to -z, at half size.
    expect(buffer[16]).toBeCloseTo(0)
    expect(buffer[18]).toBeCloseTo(-0.5)
    expect(buffer[21]).toBeCloseTo(0.5)
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

  it.each(RESOURCE_TYPES)('builds %s as a low, cheap, coloured clump on the origin', (type) => {
    const model = buildResourceModel(type, 2)
    const positions = model.positions!
    expect(positions.length).toBeGreaterThan(0)
    expect(model.normals).toHaveLength(positions.length)
    expect(model.colors).toHaveLength((positions.length / 3) * 4)
    expect(model.indices!.length / 3).toBeLessThanOrEqual(128)

    // Feet on the ground, a rock bedded in a little, and low beside a token.
    const [low, high] = extent(positions, 1)
    expect(low).toBeGreaterThan(-0.15)
    expect(low).toBeLessThan(0.1)
    expect(high).toBeLessThan(1.3)

    // Inside its footprint whichever way the clump is turned.
    for (let i = 0; i < positions.length; i += 3) {
      expect(Math.hypot(positions[i], positions[i + 2])).toBeLessThanOrEqual(1)
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

  it('puts the clumps of each kind on each hex holding it, and takes them away again', () => {
    const marks = resourceMarks(resources, { dmView: true, fog: false, explored: new Set() })
    markers.setMarks(marks)

    expect(markers.count).toBe(3 * SLOTS)
    expect(markers.meshes.iron.thinInstanceCount).toBe(SLOTS / 2)
    expect(markers.meshes.stone.thinInstanceCount).toBe(SLOTS / 2)
    expect(markers.meshes.fish.thinInstanceCount).toBe(SLOTS)
    expect(markers.meshes.gems.thinInstanceCount).toBe(SLOTS)
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
    expect(markers.count).toBe(3000 * SLOTS)
    const total = Object.values(markers.meshes).reduce(
      (sum, mesh) => sum + mesh.thinInstanceCount,
      0,
    )
    expect(total).toBe(3000 * SLOTS)
  })

  it('leaves nothing behind in the scene once disposed', () => {
    markers.dispose()
    expect(scene.meshes.filter((mesh) => mesh.name.startsWith('resourceMarkers'))).toEqual([])
    expect(scene.materials.filter((one) => one.name.startsWith('resourceMarkers'))).toEqual([])
  })
})
