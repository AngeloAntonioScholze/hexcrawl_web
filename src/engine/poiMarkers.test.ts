import { NullEngine } from '@babylonjs/core/Engines/nullEngine'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Scene } from '@babylonjs/core/scene'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { hexKey, type Axial, type HexKey } from '../hex/coords'
import { createLayout, hexToWorld } from '../hex/layout'
import { MIN_ELEVATION } from './hexGrid'
import { createPoiMarkers, visiblePois, type IconMaker, type PoiMarkers } from './poiMarkers'

const at = (q: number, r: number): HexKey => hexKey({ q, r })

describe('visiblePois', () => {
  const locations = new Map<HexKey, readonly unknown[]>([
    [at(0, 0), [{}]],
    [at(2, 1), [{}, {}]],
    [at(5, 5), []],
  ])
  const events = new Map<HexKey, readonly unknown[]>([
    [at(0, 0), [{}]],
    [at(-3, 2), [{}]],
  ])

  const nothing = new Set<HexKey>()

  it('marks every hex with content for the DM, buried under the fog where unexplored', () => {
    const explored = new Set([at(2, 1)])
    expect(visiblePois(locations, events, { dmView: true, fog: true, explored })).toEqual([
      { hex: at(0, 0), kinds: ['location', 'event'], buried: true },
      { hex: at(2, 1), kinds: ['location'], buried: false },
      { hex: at(-3, 2), kinds: ['event'], buried: true },
    ])
  })

  it('buries nothing with the fog off', () => {
    const marks = visiblePois(locations, events, { dmView: true, fog: false, explored: nothing })
    expect(marks.map((mark) => mark.buried)).toEqual([false, false, false])
  })

  it('shows a player only the hexes the crawl has discovered', () => {
    const explored = new Set([at(2, 1), at(-3, 2), at(5, 5)])
    expect(visiblePois(locations, events, { dmView: false, fog: true, explored })).toEqual([
      { hex: at(2, 1), kinds: ['location'], buried: false },
      { hex: at(-3, 2), kinds: ['event'], buried: false },
    ])
  })

  it('shows a player nothing on a map with nothing discovered, fog or not', () => {
    expect(
      visiblePois(locations, events, { dmView: false, fog: false, explored: nothing }),
    ).toEqual([])
  })
})

describe('createPoiMarkers', () => {
  const layout = createLayout(2)
  const elevationOf = (hex: Axial): number => (hex.q === 3 ? 4 : 1)

  // There is no canvas to draw on under node, so the icons are plain materials
  // named after their kind.
  const made: string[] = []
  const plainIcon: IconMaker = (scene, kind) => {
    made.push(kind)
    return new StandardMaterial(kind, scene)
  }

  let engine: NullEngine
  let scene: Scene
  let markers: PoiMarkers

  beforeEach(() => {
    made.length = 0
    engine = new NullEngine()
    scene = new Scene(engine)
    markers = createPoiMarkers(scene, layout, elevationOf, { icon: plainIcon, size: 1, hover: 0 })
  })

  afterEach(() => {
    markers.dispose()
    scene.dispose()
    engine.dispose()
  })

  it('shows nothing before it is given anything', () => {
    expect(markers.shown).toEqual([])
  })

  it('stands an icon of the right kind over each hex, stacking a shared hex', () => {
    markers.setPois([
      { hex: at(0, 0), kinds: ['location', 'event'], buried: false },
      { hex: at(3, -1), kinds: ['event'], buried: false },
    ])

    const [pin, alert, lone] = markers.shown
    expect(markers.shown).toHaveLength(3)
    expect(pin.material?.name).toBe('location')
    expect(alert.material?.name).toBe('event')
    expect(lone.material?.name).toBe('event')
    expect(made).toEqual(['location', 'event'])

    expect(alert.position.x).toBeCloseTo(pin.position.x)
    expect(alert.position.y).toBeGreaterThan(pin.position.y)

    const world = hexToWorld(layout, { q: 3, r: -1 })
    expect(lone.position.x).toBeCloseTo(world.x)
    expect(lone.position.z).toBeCloseTo(world.z)
    expect(lone.position.y).toBeGreaterThan(pin.position.y)
  })

  it('sets an icon on a buried hex down on the flattened ground', () => {
    markers.setPois([{ hex: at(3, 0), kinds: ['location'], buried: true }])
    expect(markers.shown[0].position.y).toBeCloseTo(MIN_ELEVATION + layout.size / 2)
  })

  it('hides icons a shorter list no longer needs and reuses them later', () => {
    markers.setPois([
      { hex: at(0, 0), kinds: ['location'], buried: false },
      { hex: at(1, 0), kinds: ['location'], buried: false },
    ])
    const second = markers.shown[1]

    markers.setPois([{ hex: at(0, 0), kinds: ['location'], buried: false }])
    expect(markers.shown).toHaveLength(1)
    expect(second.isEnabled()).toBe(false)

    markers.setPois([
      { hex: at(0, 0), kinds: ['location'], buried: false },
      { hex: at(2, 0), kinds: ['event'], buried: false },
    ])
    expect(markers.shown[1]).toBe(second)
    expect(second.isEnabled()).toBe(true)
    expect(second.material?.name).toBe('event')
  })
})
