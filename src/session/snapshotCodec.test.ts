import { describe, expect, it } from 'vitest'
import { projectForPlayers, type PlayerProjection } from './projection'
import { decodeState, encodeState } from './snapshotCodec'
import { crawlStore } from './snapshotFixture'

const projected = (): PlayerProjection => {
  const store = crawlStore()
  store.select({ q: 3, r: 0 })
  store.advanceTurn()
  return projectForPlayers(store.snapshot, store.field)
}

const tampered = (change: (view: Record<string, unknown>) => void): string => {
  const view = JSON.parse(encodeState(projected())) as Record<string, unknown>
  change(view)
  return JSON.stringify(view)
}

describe('the state on the wire', () => {
  it('comes back as it went', () => {
    const view = projected()
    expect(decodeState(encodeState(view))).toEqual(view)
  })

  it('carries a crawl with something in every list it is tested on', () => {
    const view = projected()
    for (const key of ['explored', 'tiles', 'entities', 'states', 'record', 'items'] as const) {
      expect(view[key].length).toBeGreaterThan(0)
    }
  })

  it('is turned away when it is not JSON', () => {
    expect(decodeState('{"turn":')).toBeNull()
    expect(decodeState('')).toBeNull()
  })

  it('is turned away when it is not an object', () => {
    expect(decodeState('[]')).toBeNull()
    expect(decodeState('null')).toBeNull()
    expect(decodeState('"state"')).toBeNull()
  })

  it('is turned away when a field is missing', () => {
    expect(decodeState(tampered((view) => delete view.tiles))).toBeNull()
  })

  it('is turned away when it carries a field players never get', () => {
    expect(decodeState(tampered((view) => (view.notes = [])))).toBeNull()
  })

  it.each([
    ['a turn that is not a whole number', (view: Record<string, unknown>) => (view.turn = 1.5)],
    ['a hex that is not a hex', (view: Record<string, unknown>) => (view.explored = ['north'])],
    [
      'an unknown terrain',
      (view: Record<string, unknown>) =>
        (view.tiles = [{ hex: '0,0', terrain: 'lava', height: 1, level: 1, elevation: 1 }]),
    ],
    [
      'an entity without an id',
      (view: Record<string, unknown>) => (view.entities = [{ name: 'x' }]),
    ],
    [
      'a clock at an unknown phase',
      (view: Record<string, unknown>) =>
        (view.clock = { turn: 0, phase: 'dusk', index: 0, day: 1 }),
    ],
    [
      'supplies past their limit',
      (view: Record<string, unknown>) => (view.supplies = [{ entityId: 'x', food: -1, gold: 0 }]),
    ],
  ])('is turned away with %s', (_, change) => {
    expect(decodeState(tampered(change))).toBeNull()
  })
})
