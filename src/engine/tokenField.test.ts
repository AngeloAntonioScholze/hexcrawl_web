import { NullEngine } from '@babylonjs/core/Engines/nullEngine'
import { Scene } from '@babylonjs/core/scene'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { hexKey, type Axial } from '../hex/coords'
import { createLayout, hexToWorld } from '../hex/layout'
import { createTokenField, type TokenField } from './tokenField'

const layout = createLayout(2)
const elevationOf = (): number => 1

let engine: NullEngine
let scene: Scene
let field: TokenField

const pawns = (): string[] =>
  scene.meshes
    .filter((mesh) => mesh.name === 'partyToken' && mesh.isVisible)
    .map((mesh) => mesh.name)

const entry = (
  id: string,
  hex: Axial | null,
  color = '#ffffff',
): { id: string; hex: Axial | null; color: string } => ({
  id,
  hex,
  color,
})

beforeEach(() => {
  engine = new NullEngine()
  scene = new Scene(engine)
  field = createTokenField(scene, layout, elevationOf, { lift: 0, bob: 0 })
})

afterEach(() => {
  field.dispose()
  scene.dispose()
  engine.dispose()
})

describe('motion', () => {
  it('bobs once any token stands on the map', () => {
    field.setEntries([entry('a', null)])
    expect(field.bobbing).toBe(false)

    field.place('a', { q: 0, r: 0 })
    expect(field.bobbing).toBe(true)
  })

  it('is hopping until the leap lands', () => {
    field.setEntries([entry('a', { q: 0, r: 0 })])
    field.hop('a', { q: 1, r: 0 }, 0.1)
    expect(field.hopping).toBe(true)

    engine.getDeltaTime = () => 50
    for (let i = 0; i < 4; i++) scene.onBeforeRenderObservable.notifyObservers(scene)
    expect(field.hopping).toBe(false)
  })
})

describe('createTokenField', () => {
  it('draws every entity at once, each on its own hex', () => {
    field.setEntries([entry('a', { q: 0, r: 0 }), entry('b', { q: 2, r: -1 })])

    expect(pawns()).toHaveLength(2)

    const drawn = scene.meshes.filter((mesh) => mesh.name === 'partyToken')
    const world = hexToWorld(layout, { q: 2, r: -1 })
    expect(drawn.some((mesh) => Math.abs(mesh.position.x - world.x) < 1e-6)).toBe(true)
  })

  it('keeps a token between updates rather than rebuilding it', () => {
    field.setEntries([entry('a', { q: 0, r: 0 })])
    const first = scene.meshes.find((mesh) => mesh.name === 'partyToken')

    field.setEntries([entry('a', { q: 1, r: 0 })])

    expect(scene.meshes.find((mesh) => mesh.name === 'partyToken')).toBe(first)
    expect(first!.position.x).toBeCloseTo(hexToWorld(layout, { q: 1, r: 0 }).x)
  })

  it('drops the token of an entity that has left the map', () => {
    field.setEntries([entry('a', { q: 0, r: 0 }), entry('b', { q: 1, r: 0 })])

    field.setEntries([entry('a', { q: 0, r: 0 })])

    expect(pawns()).toHaveLength(1)
  })

  it('hides an entity that is not on the map yet', () => {
    field.setEntries([entry('a', null)])

    expect(pawns()).toHaveLength(0)
  })

  it('moves one token on its own, which is what a turn plays back', () => {
    field.setEntries([entry('a', { q: 0, r: 0 }), entry('b', { q: 3, r: 0 })])

    field.place('a', { q: 1, r: 0 })

    const moved = scene.meshes.find(
      (mesh) => Math.abs(mesh.position.x - hexToWorld(layout, { q: 1, r: 0 }).x) < 1e-6,
    )
    expect(moved).toBeDefined()
    expect(hexKey({ q: 1, r: 0 })).toBe('1,0')
  })
})

describe('a crowded hex', () => {
  const mesh = (index: number) => scene.meshes.filter((one) => one.name === 'partyToken')[index]

  it('shrinks the pawns and stands them apart', () => {
    field.setEntries([entry('a', { q: 0, r: 0 }), entry('b', { q: 0, r: 0 })])

    const first = mesh(0)
    const second = mesh(1)

    expect(first.scaling.x).toBeLessThan(1)
    expect(second.scaling.x).toBeLessThan(1)
    expect(first.position.equals(second.position)).toBe(false)
  })

  it('leaves a pawn alone on its own hex', () => {
    field.setEntries([entry('a', { q: 0, r: 0 }), entry('b', { q: 2, r: 0 })])

    expect(mesh(0).scaling.x).toBe(1)
    expect(mesh(0).position.x).toBeCloseTo(hexToWorld(layout, { q: 0, r: 0 }).x)
  })

  it('gives a pawn the hex back when the other one leaves', () => {
    field.setEntries([entry('a', { q: 0, r: 0 }), entry('b', { q: 0, r: 0 })])

    field.place('b', { q: 3, r: 0 })

    expect(mesh(0).scaling.x).toBe(1)
    expect(mesh(0).position.x).toBeCloseTo(hexToWorld(layout, { q: 0, r: 0 }).x)
  })

  it('counts a pawn still in the air as standing where it is headed', () => {
    field.setEntries([entry('a', { q: 0, r: 0 }), entry('b', { q: 1, r: 0 })])

    field.hop('b', { q: 0, r: 0 }, 1)

    expect(mesh(0).scaling.x).toBeLessThan(1)
    expect(mesh(1).scaling.x).toBeLessThan(1)
  })
})
