import { NullEngine } from '@babylonjs/core/Engines/nullEngine'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { Scene } from '@babylonjs/core/scene'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { hexKey, neighbors, type Axial } from '../hex/coords'
import { createLayout, hexToWorld } from '../hex/layout'
import { buildArrowGeometry, createRouteArrows, insetOutline, type RouteArrows } from './routeArrows'

const layout = createLayout(2)
const elevations = new Map<string, number>()
const elevationOf = (hex: Axial): number => elevations.get(hexKey(hex)) ?? 1

let engine: NullEngine
let scene: Scene
let arrows: RouteArrows

beforeEach(() => {
  elevations.clear()
  engine = new NullEngine()
  scene = new Scene(engine)
  arrows = createRouteArrows(scene, layout, elevationOf)
})

afterEach(() => {
  arrows.dispose()
  scene.dispose()
  engine.dispose()
})

describe('insetOutline', () => {
  const square: [number, number][] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ]

  it('shrinks a square inward by the inset on every side', () => {
    const inset = insetOutline(square, 0.1)
    expect(inset[0][0]).toBeCloseTo(0.1, 6)
    expect(inset[0][1]).toBeCloseTo(0.1, 6)
    expect(inset[2][0]).toBeCloseTo(0.9, 6)
    expect(inset[2][1]).toBeCloseTo(0.9, 6)
  })

  it('leaves the outline alone at zero inset', () => {
    expect(insetOutline(square, 0)).toEqual(square)
  })

  it('caps the miter at a sharp corner instead of shooting off', () => {
    const spike: [number, number][] = [
      [0, 10],
      [-1, 0],
      [1, 0],
    ]
    const inset = insetOutline(spike, 0.1)
    expect(inset[0][1]).toBeLessThan(10)
    expect(inset[0][1]).toBeGreaterThan(9.5)
  })
})

describe('buildArrowGeometry', () => {
  const LENGTH = 2
  const WIDTH = 0.5
  const THICKNESS = 0.3
  const BEVEL = 0.08
  const SEGMENTS = 3
  const data = buildArrowGeometry(LENGTH, WIDTH, THICKNESS, BEVEL, SEGMENTS)
  const positions = data.positions as number[]
  const normals = data.normals as number[]
  const vertexCount = positions.length / 3

  const vertex = (i: number): [number, number, number] => [
    positions[i * 3],
    positions[i * 3 + 1],
    positions[i * 3 + 2],
  ]
  const normal = (i: number): [number, number, number] => [
    normals[i * 3],
    normals[i * 3 + 1],
    normals[i * 3 + 2],
  ]

  it('stands proud of the ground rather than lying flat', () => {
    const ys = positions.filter((_, i) => i % 3 === 1)
    expect(Math.min(...ys)).toBe(0)
    expect(Math.max(...ys)).toBeCloseTo(THICKNESS, 10)
  })

  it('points along +Z', () => {
    const zs = positions.filter((_, i) => i % 3 === 2)
    expect(Math.max(...zs)).toBeCloseTo(LENGTH / 2, 10)
  })

  it('insets the flat top by the bevel', () => {
    const tip = vertex(0)
    expect(tip[1]).toBeCloseTo(THICKNESS, 10)
    expect(tip[2]).toBeLessThan(LENGTH / 2)
  })

  it('reaches the full outline at the wall', () => {
    const widest = Math.max(
      ...Array.from({ length: vertexCount }, (_, i) => Math.abs(vertex(i)[0])),
    )
    expect(widest).toBeCloseTo(WIDTH, 10)
  })

  it('caps the top facing up and the bottom facing down', () => {
    for (let i = 0; i < 4; i++) expect(normal(i)[1]).toBeCloseTo(1, 6)
    for (let i = 4; i < 8; i++) expect(normal(i)[1]).toBeCloseTo(-1, 6)
  })

  it('rolls the edge over the bevel rather than cutting one chamfer', () => {
    const tilted = new Set<string>()
    for (let i = 8; i < vertexCount; i++) {
      const ny = normal(i)[1]
      if (ny > 0.05 && ny < 0.95) tilted.add(ny.toFixed(4))
    }
    expect(tilted.size).toBeGreaterThanOrEqual(SEGMENTS)
  })

  it('keeps the wall vertical below the bevel', () => {
    let vertical = 0
    for (let i = 8; i < vertexCount; i++) {
      if (vertex(i)[1] === 0 && Math.abs(normal(i)[1]) < 0.02) vertical++
    }
    expect(vertical).toBe(8)
  })

  it('adds a ring per bevel segment', () => {
    const ringsPerSide = SEGMENTS + 2
    expect(vertexCount).toBe(4 + 4 + 4 * ringsPerSide * 2)
  })

  it('produces a unit normal per vertex', () => {
    expect(normals).toHaveLength(positions.length)
    for (let i = 0; i < vertexCount; i++) {
      const [nx, ny, nz] = normal(i)
      expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 6)
    }
  })

  it('closes the solid, so every vertex is referenced', () => {
    const used = new Set(data.indices as number[])
    expect(used.size).toBe(vertexCount)
  })

  it('builds a sharp-edged arrow when the bevel is zero', () => {
    const sharp = buildArrowGeometry(LENGTH, WIDTH, THICKNESS, 0)
    const tip = (sharp.positions as number[])[2]
    expect(tip).toBeCloseTo(LENGTH / 2, 10)
  })
})

describe('setPath', () => {
  const path: Axial[] = [
    { q: 0, r: 0 },
    { q: 1, r: 0 },
    { q: 2, r: 0 },
    { q: 2, r: 1 },
  ]

  it('draws one arrow per step, not per hex', () => {
    arrows.setPath(path)
    expect(arrows.count).toBe(path.length - 1)
    expect(arrows.mesh.thinInstanceCount).toBe(path.length - 1)
  })

  it('draws nothing for an empty or single-hex path', () => {
    arrows.setPath([])
    expect(arrows.count).toBe(0)
    expect(arrows.mesh.isVisible).toBe(false)

    arrows.setPath([{ q: 0, r: 0 }])
    expect(arrows.count).toBe(0)
  })

  it('sits on the seam between the two hexes', () => {
    arrows.setPath(path)
    const matrices = arrows.mesh.thinInstanceGetWorldMatrices()

    for (let i = 0; i < path.length - 1; i++) {
      const a = hexToWorld(layout, path[i])
      const b = hexToWorld(layout, path[i + 1])
      const position = matrices[i].getTranslation()
      expect(position.x).toBeCloseTo((a.x + b.x) / 2, 5)
      expect(position.z).toBeCloseTo((a.z + b.z) / 2, 5)
    }
  })

  it('clears the taller of the two hexes', () => {
    elevations.set('0,0', 1)
    elevations.set('1,0', 4)
    arrows.setPath([
      { q: 0, r: 0 },
      { q: 1, r: 0 },
    ])

    const position = arrows.mesh.thinInstanceGetWorldMatrices()[0].getTranslation()
    expect(position.y).toBeGreaterThan(4)
  })

  it('points along the direction of travel', () => {
    arrows.setPath(path)
    const matrices = arrows.mesh.thinInstanceGetWorldMatrices()

    for (let i = 0; i < path.length - 1; i++) {
      const a = hexToWorld(layout, path[i])
      const b = hexToWorld(layout, path[i + 1])
      const travel = new Vector3(b.x - a.x, 0, b.z - a.z).normalize()
      const facing = Vector3.TransformNormal(Vector3.Forward(), matrices[i]).normalize()

      expect(Vector3.Dot(facing, travel)).toBeCloseTo(1, 5)
    }
  })

  it('points every which way around a hex', () => {
    const centre = { q: 0, r: 0 }
    for (const next of neighbors(centre)) {
      arrows.setPath([centre, next])
      const matrix = arrows.mesh.thinInstanceGetWorldMatrices()[0]
      const a = hexToWorld(layout, centre)
      const b = hexToWorld(layout, next)
      const travel = new Vector3(b.x - a.x, 0, b.z - a.z).normalize()
      const facing = Vector3.TransformNormal(Vector3.Forward(), matrix).normalize()
      expect(Vector3.Dot(facing, travel), `toward ${hexKey(next)}`).toBeCloseTo(1, 5)
    }
  })

  it('replaces the previous path rather than accumulating', () => {
    arrows.setPath(path)
    arrows.setPath([
      { q: 0, r: 0 },
      { q: 1, r: 0 },
    ])
    expect(arrows.count).toBe(1)
    expect(arrows.mesh.thinInstanceCount).toBe(1)
  })

  it('is not pickable, so it never steals a click from a hex', () => {
    expect(arrows.mesh.isPickable).toBe(false)
  })
})

describe('bob', () => {
  const path: Axial[] = [
    { q: 0, r: 0 },
    { q: 1, r: 0 },
  ]

  it('starts level', () => {
    arrows.setPath(path)
    expect(arrows.mesh.position.y).toBe(0)
  })

  it('rises through the first quarter of the cycle', () => {
    arrows.setPath(path)
    arrows.advanceBob(1.9 / 4)
    expect(arrows.mesh.position.y).toBeGreaterThan(0)
  })

  it('returns to level after a full cycle', () => {
    arrows.setPath(path)
    arrows.advanceBob(1.9)
    expect(arrows.mesh.position.y).toBeCloseTo(0, 6)
  })

  it('dips below level on the way back', () => {
    arrows.setPath(path)
    arrows.advanceBob((1.9 * 3) / 4)
    expect(arrows.mesh.position.y).toBeLessThan(0)
  })

  it('stays within the bob height', () => {
    const rig = createRouteArrows(scene, layout, elevationOf, { bob: 0.5, bobPeriod: 1 })
    rig.setPath(path)
    for (let i = 0; i < 60; i++) {
      rig.advanceBob(1 / 37)
      expect(Math.abs(rig.mesh.position.y)).toBeLessThanOrEqual(layout.size * 0.5 + 1e-9)
    }
    rig.dispose()
  })

  it('holds still when there is no route', () => {
    arrows.setPath(path)
    arrows.advanceBob(0.4)
    arrows.setPath([])
    arrows.advanceBob(0.4)
    expect(arrows.mesh.position.y).toBe(0)
  })

  it('runs off the render loop', () => {
    // NullEngine only measures a frame delta inside a real render loop, so the
    // clock is stubbed to prove the observer is wired to it.
    const engineUnderTest = scene.getEngine()
    const realDelta = engineUnderTest.getDeltaTime.bind(engineUnderTest)
    engineUnderTest.getDeltaTime = () => 250

    arrows.setPath(path)
    const before = arrows.mesh.position.y
    scene.onBeforeRenderObservable.notifyObservers(scene)

    expect(arrows.mesh.position.y).toBeGreaterThan(before)
    engineUnderTest.getDeltaTime = realDelta
  })

  it('stops animating once disposed', () => {
    const rig = createRouteArrows(scene, layout, elevationOf)
    rig.setPath(path)
    rig.dispose()
    expect(() => scene.onBeforeRenderObservable.notifyObservers(scene)).not.toThrow()
  })
})
