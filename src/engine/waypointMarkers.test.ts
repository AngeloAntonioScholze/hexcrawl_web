import { NullEngine } from '@babylonjs/core/Engines/nullEngine'
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer'
import { Scene } from '@babylonjs/core/scene'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { hexKey, type Axial } from '../hex/coords'
import { createLayout, hexToWorld } from '../hex/layout'
import {
  buildTriangle,
  createWaypointMarkers,
  markerPose,
  type LabelMaker,
  type WaypointMarkers,
} from './waypointMarkers'

const layout = createLayout(2)
const elevations = new Map<string, number>()
const elevationOf = (hex: Axial): number => elevations.get(hexKey(hex)) ?? 1

// There is no canvas to draw text on under node, so the labels are recorded
// instead of rendered.
const labels: string[] = []
const recordLabel: LabelMaker = (_scene, text) => {
  labels.push(text)
  return []
}

const motion = { bob: 0.5, bobPeriod: 2, spinPeriod: 4 }

let engine: NullEngine
let scene: Scene
let markers: WaypointMarkers

beforeEach(() => {
  elevations.clear()
  labels.length = 0
  engine = new NullEngine()
  scene = new Scene(engine)
  markers = createWaypointMarkers(scene, layout, elevationOf, {
    label: recordLabel,
    hover: 0,
    bob: 0,
  })
})

afterEach(() => {
  markers.dispose()
  scene.dispose()
  engine.dispose()
})

describe('markerPose', () => {
  it('bobs no further than the bob height either way', () => {
    for (let t = 0; t < 4; t += 0.1) {
      expect(Math.abs(markerPose(t, 0, motion).lift)).toBeLessThanOrEqual(motion.bob + 1e-9)
    }
    expect(markerPose(0.5, 0, motion).lift).toBeCloseTo(motion.bob)
    expect(markerPose(1.5, 0, motion).lift).toBeCloseTo(-motion.bob)
  })

  it('turns a full circle once a spin period and starts over', () => {
    expect(markerPose(1, 0, motion).spin).toBeCloseTo(Math.PI / 2)
    expect(markerPose(4, 0, motion).spin).toBeCloseTo(0)
    expect(markerPose(5, 0, motion).spin).toBeCloseTo(Math.PI / 2)
  })

  it('staggers the bob between stops but spins them together', () => {
    expect(markerPose(0.3, 0, motion).lift).not.toBeCloseTo(markerPose(0.3, 1, motion).lift)
    expect(markerPose(0.3, 0, motion).spin).toBe(markerPose(0.3, 1, motion).spin)
  })
})

describe('buildTriangle', () => {
  it('points down, with the tip at the origin and the flat edge on top', () => {
    const mesh = buildTriangle(scene, 2, 3, 0.4)
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!
    const points = Array.from({ length: positions.length / 3 }, (_, i) => ({
      x: positions[i * 3],
      y: positions[i * 3 + 1],
    }))

    const lowest = Math.min(...points.map((p) => p.y))
    expect(lowest).toBeCloseTo(0)
    for (const p of points.filter((one) => one.y === lowest)) expect(p.x).toBeCloseTo(0)
    expect(Math.max(...points.map((p) => p.y))).toBeCloseTo(3)
    expect(Math.min(...points.map((p) => p.x))).toBeCloseTo(-1)
  })
})

describe('createWaypointMarkers', () => {
  it('shows nothing before it is given any stops', () => {
    expect(markers.shown).toEqual([])
  })

  it('stands one numbered marker over each stop, in order', () => {
    const stops = [
      { q: 1, r: 0 },
      { q: 3, r: -1 },
      { q: 0, r: 2 },
    ]
    elevations.set(hexKey(stops[1]), 4)

    markers.setStops(stops, '#e0b25a')

    expect(labels).toEqual(['1', '2', '3'])
    expect(markers.shown).toHaveLength(3)
    markers.shown.forEach((root, index) => {
      const world = hexToWorld(layout, stops[index])
      expect(root.isEnabled()).toBe(true)
      expect(root.position.x).toBeCloseTo(world.x)
      expect(root.position.z).toBeCloseTo(world.z)
    })
    expect(markers.shown[1].position.y).toBeCloseTo(4)
  })

  it('hides the markers past the end of a shorter chain and reuses the rest', () => {
    markers.setStops(
      [
        { q: 1, r: 0 },
        { q: 2, r: 0 },
        { q: 3, r: 0 },
      ],
      '#e0b25a',
    )
    const third = markers.shown[2]

    markers.setStops([{ q: 1, r: 0 }], '#e0b25a')

    expect(markers.shown).toHaveLength(1)
    expect(third.isEnabled()).toBe(false)

    markers.setStops(
      [
        { q: 1, r: 0 },
        { q: 2, r: 0 },
        { q: 3, r: 0 },
      ],
      '#e0b25a',
    )
    expect(labels).toEqual(['1', '2', '3'])
    expect(markers.shown[2]).toBe(third)
  })

  it('bobs and spins as time passes', () => {
    const moving = createWaypointMarkers(scene, layout, elevationOf, {
      label: recordLabel,
      hover: 0,
      bob: 0.5,
      bobPeriod: 2,
      spinPeriod: 4,
    })
    moving.setStops([{ q: 0, r: 0 }], '#6fa8dc')
    const [root] = moving.shown

    moving.advance(0.5)
    expect(root.position.y).toBeGreaterThan(1)
    expect(root.rotation.y).toBeGreaterThan(0)

    moving.advance(1)
    expect(root.position.y).toBeLessThan(1)

    moving.dispose()
  })
})
