import { NullEngine } from '@babylonjs/core/Engines/nullEngine'
import { Scene } from '@babylonjs/core/scene'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { hexKey, type Axial } from '../hex/coords'
import { createLayout, hexToWorld } from '../hex/layout'
import { createPartyToken, type PartyToken } from './partyToken'

const layout = createLayout(2)
const elevations = new Map<string, number>()
const elevationOf = (hex: Axial): number => elevations.get(hexKey(hex)) ?? 1

let engine: NullEngine
let scene: Scene
let party: PartyToken

beforeEach(() => {
  elevations.clear()
  engine = new NullEngine()
  scene = new Scene(engine)
  party = createPartyToken(scene, layout, elevationOf, { lift: 0, bob: 0 })
})

afterEach(() => {
  party.dispose()
  scene.dispose()
  engine.dispose()
})

describe('createPartyToken', () => {
  it('starts hidden with no hex', () => {
    expect(party.hex).toBeNull()
    expect(party.mesh.isVisible).toBe(false)
  })

  it('stands on the world position of its hex', () => {
    const hex = { q: 2, r: -1 }
    party.setHex(hex)

    const world = hexToWorld(layout, hex)
    expect(party.mesh.isVisible).toBe(true)
    expect(party.mesh.position.x).toBeCloseTo(world.x, 6)
    expect(party.mesh.position.z).toBeCloseTo(world.z, 6)
  })

  it('rests on top of the tile it occupies', () => {
    elevations.set(hexKey({ q: 1, r: 1 }), 4.5)
    party.setHex({ q: 1, r: 1 })

    expect(party.mesh.position.y).toBeCloseTo(4.5, 6)
  })

  it('hides again when the party is cleared', () => {
    party.setHex({ q: 0, r: 0 })
    party.setHex(null)

    expect(party.hex).toBeNull()
    expect(party.mesh.isVisible).toBe(false)
  })

  it('copies the hex so later edits to the caller’s object do not move it', () => {
    const hex = { q: 3, r: 0 }
    party.setHex(hex)
    hex.q = 9

    expect(party.hex).toEqual({ q: 3, r: 0 })
  })

  it('bobs around the tile height without drifting off it', () => {
    const bobbing = createPartyToken(scene, layout, elevationOf, {
      lift: 0,
      bob: 0.25,
      bobPeriod: 2,
    })
    bobbing.setHex({ q: 0, r: 0 })

    bobbing.advanceBob(0.5)
    const raised = bobbing.mesh.position.y
    bobbing.advanceBob(1)
    const lowered = bobbing.mesh.position.y

    expect(raised).toBeGreaterThan(1)
    expect(lowered).toBeLessThan(1)
    bobbing.dispose()
  })
})

describe('leaping between hexes', () => {
  it('arcs over both hexes on the way across', () => {
    const token = createPartyToken(scene, layout, elevationOf, { lift: 0, bob: 0, arc: 2 })
    token.setHex({ q: 0, r: 0 })
    const ground = token.mesh.position.y

    token.hopTo({ q: 1, r: 0 }, 1)
    token.advanceBob(0.5)

    expect(token.hopping).toBe(true)
    expect(token.mesh.position.y).toBeGreaterThan(ground + 1)

    const midway = hexToWorld(layout, { q: 0, r: 0 }).x + hexToWorld(layout, { q: 1, r: 0 }).x
    expect(token.mesh.position.x).toBeCloseTo(midway / 2)

    token.dispose()
  })

  it('lands on the hex it was sent to', () => {
    const token = createPartyToken(scene, layout, elevationOf, { lift: 0, bob: 0 })
    token.setHex({ q: 0, r: 0 })

    token.hopTo({ q: 1, r: 0 }, 1)
    token.advanceBob(1.2)

    expect(token.hopping).toBe(false)
    expect(token.hex).toEqual({ q: 1, r: 0 })
    expect(token.mesh.position.x).toBeCloseTo(hexToWorld(layout, { q: 1, r: 0 }).x)

    token.dispose()
  })

  it('is put straight down when it was nowhere to leap from', () => {
    const token = createPartyToken(scene, layout, elevationOf, { lift: 0, bob: 0 })

    token.hopTo({ q: 2, r: 0 })

    expect(token.hopping).toBe(false)
    expect(token.hex).toEqual({ q: 2, r: 0 })

    token.dispose()
  })

  it('calls a leap off when it is placed somewhere else', () => {
    const token = createPartyToken(scene, layout, elevationOf, { lift: 0, bob: 0 })
    token.setHex({ q: 0, r: 0 })
    token.hopTo({ q: 1, r: 0 }, 1)

    token.setHex({ q: 3, r: 0 })

    expect(token.hopping).toBe(false)
    expect(token.hex).toEqual({ q: 3, r: 0 })

    token.dispose()
  })
})
