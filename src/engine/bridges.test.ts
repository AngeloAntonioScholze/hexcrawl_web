import { NullEngine } from '@babylonjs/core/Engines/nullEngine'
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector'
import { Scene } from '@babylonjs/core/scene'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createLayout, hexToWorld } from '../hex/layout'
import {
  archUnder,
  bridgeGaps,
  bridgeMatrix,
  bridgeSites,
  buildBridgeGeometry,
  createBridges,
  deckTop,
  type Bridges,
  type BridgeSite,
} from './bridges'
import { bevelProfile } from './hexPrism'
import type { Gap, RoadHex, RoadSpan } from './roadSegments'

const layout = createLayout(2)
const tileSize = 2 * 0.94
const options = {
  tileSize,
  profile: bevelProfile(tileSize, { bevel: 0.14 }),
  roadHalfWidth: 0.3,
  riverHalfWidth: 0.2,
  riverShift: 0.54,
}

const eastWest: RoadHex = {
  hex: { q: 0, r: 0 },
  buried: false,
  toward: [
    { q: 1, r: 0 },
    { q: -1, r: 0 },
  ],
}
const northSouth: RoadHex = {
  hex: { q: 0, r: 0 },
  buried: false,
  toward: [
    { q: 0, r: -1 },
    { q: 0, r: 1 },
  ],
}

describe('bridgeSites', () => {
  it('bridges a road where it crosses a river, laid along the road', () => {
    const sites = bridgeSites(layout, [eastWest], [northSouth], options)
    expect(sites).toHaveLength(1)
    const [site] = sites
    expect(Math.abs(site.along.x)).toBeCloseTo(1)
    expect(site.length).toBeGreaterThan(options.riverHalfWidth * 2)
    expect(site.length).toBeLessThanOrEqual(tileSize)
  })

  it('builds none where the road runs beside the river', () => {
    expect(bridgeSites(layout, [eastWest], [eastWest], options)).toEqual([])
  })

  it('builds none in a hex with no river', () => {
    const elsewhere = { ...northSouth, hex: { q: 3, r: 0 } }
    expect(bridgeSites(layout, [eastWest], [elsewhere], options)).toEqual([])
  })

  it('leaves a gap in the road under each bridge, short of its ends', () => {
    const [site] = bridgeSites(layout, [eastWest], [northSouth], options)
    const [gap] = bridgeGaps([site])
    expect(gap.x).toBe(site.x)
    expect(gap.radius).toBeLessThan(site.length / 2)
  })
})

describe('the bridge model', () => {
  it('meets the ground at both ends and arches clear of the water between', () => {
    expect(deckTop(-0.5)).toBeLessThan(0.01)
    expect(deckTop(0.5)).toBeLessThan(0.01)
    expect(archUnder(0)).toBeGreaterThan(0.05)
    for (let x = -0.49; x < 0.5; x += 0.01) expect(deckTop(x)).toBeGreaterThan(archUnder(x))
  })

  it('has a colour and a normal for every corner', () => {
    const data = buildBridgeGeometry()
    const corners = data.positions!.length / 3
    expect(data.normals!.length / 3).toBe(corners)
    expect(data.colors!.length / 4).toBe(corners)
    expect(data.indices!.length % 3).toBe(0)
  })

  it('turns its length along the road', () => {
    const along = { x: Math.cos(1), z: Math.sin(1) }
    const site: BridgeSite = {
      hex: { q: 0, r: 0 },
      buried: false,
      x: 4,
      z: -2,
      along,
      length: 1,
      width: 0.5,
    }
    const matrix = bridgeMatrix(site, 3, new Matrix())
    const end = Vector3.TransformCoordinates(new Vector3(0.5, 0, 0), matrix)
    expect(end.x - 4).toBeCloseTo(along.x * 0.5)
    expect(end.z + 2).toBeCloseTo(along.z * 0.5)
    expect(end.y).toBeCloseTo(3)
  })
})

describe('createBridges', () => {
  let engine: NullEngine
  let scene: Scene
  let bridges: Bridges
  let gaps: readonly Gap[]

  const span = (a: `${number},${number}`, b: `${number},${number}`): RoadSpan => ({
    a,
    b,
    buriedA: false,
    buriedB: false,
  })

  beforeEach(() => {
    engine = new NullEngine()
    scene = new Scene(engine)
    gaps = []
    bridges = createBridges(scene, layout, () => 2, {
      tileSize,
      onGaps: (next) => {
        gaps = next
      },
    })
  })

  afterEach(() => {
    bridges.dispose()
    scene.dispose()
    engine.dispose()
  })

  it('stands a bridge where a road meets a river, and tells the roads where', () => {
    expect(bridges.mesh.isVisible).toBe(false)
    bridges.setRoads([span('-1,0', '0,0'), span('0,0', '1,0')])
    bridges.setRivers([span('0,-1', '0,0'), span('0,0', '0,1')])
    expect(bridges.count).toBe(1)
    expect(bridges.mesh.isVisible).toBe(true)
    expect(gaps).toHaveLength(1)
    const centre = hexToWorld(layout, { q: 0, r: 0 })
    expect(Math.hypot(gaps[0].x - centre.x, gaps[0].z - centre.z)).toBeLessThan(tileSize)

    bridges.setRivers([])
    expect(bridges.count).toBe(0)
    expect(bridges.mesh.isVisible).toBe(false)
    expect(gaps).toEqual([])
  })
})
