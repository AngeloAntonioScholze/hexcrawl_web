import { describe, expect, it } from 'vitest'
import type { HexKey } from '../hex/coords'
import { createFogStepper, REMEMBERED, type FogInput, type FogTarget } from './fogStepper'

const recorder = (keys: readonly HexKey[]) => {
  const held = new Set(keys)
  const calls: { kind: 'set' | 'update'; map: Map<HexKey, number> }[] = []
  const target: FogTarget = {
    indexOf: (key) => (held.has(key) ? 0 : undefined),
    setFog: (map) => calls.push({ kind: 'set', map: new Map(map) }),
    updateFog: (map) => calls.push({ kind: 'update', map: new Map(map) }),
  }
  return { target, calls, last: () => calls[calls.length - 1]! }
}

const K = { a: '0,0', b: '1,0', c: '2,0', d: '3,0', e: '4,0', f: '5,0' } as const
const row: HexKey[] = Object.values(K)
const keys = (...names: (keyof typeof K)[]): Set<HexKey> => new Set(names.map((name) => K[name]))

const at = (visible: Set<HexKey>, version: number, added: Set<HexKey> | null): FogInput => ({
  fog: true,
  visible,
  windowKeys: row,
  windowTick: 1,
  explored: { seen: new Set([...visible]), added, version },
})

/** A first painting with the party standing on a–b, then one step to b–c. */
const stepped = () => {
  const stepper = createFogStepper()
  const grid = recorder(row)
  const first = at(keys('a', 'b'), 1, null)
  stepper.paint(grid.target, first)
  const next: FogInput = {
    ...first,
    visible: keys('b', 'c'),
    explored: { seen: keys('a', 'b', 'c'), added: keys('c'), version: 2 },
  }
  stepper.paint(grid.target, next)
  return { stepper, grid, next }
}

describe('createFogStepper', () => {
  it('lays the first painting down whole over the window', () => {
    const stepper = createFogStepper()
    const grid = recorder(row)
    stepper.paint(grid.target, at(keys('a', 'b'), 1, null))
    expect(grid.calls).toHaveLength(1)
    expect(grid.last().kind).toBe('set')
    expect([...grid.last().map]).toEqual([
      [K.c, 0],
      [K.d, 0],
      [K.e, 0],
      [K.f, 0],
    ])
  })

  it('paints only the moved hexes on a party step', () => {
    const { grid } = stepped()
    expect(grid.calls).toHaveLength(2)
    expect(grid.last().kind).toBe('update')
    expect(grid.last().map).toEqual(
      new Map<HexKey, number>([
        [K.a, REMEMBERED],
        [K.c, 1],
      ]),
    )
  })

  it('fogs ground seen elsewhere during a step as remembered', () => {
    const stepper = createFogStepper()
    const grid = recorder(row)
    const first = at(keys('a'), 1, null)
    stepper.paint(grid.target, first)
    stepper.paint(grid.target, {
      ...first,
      explored: { seen: keys('a', 'f'), added: keys('f'), version: 2 },
    })
    expect(grid.last()).toEqual({ kind: 'update', map: new Map([[K.f, REMEMBERED]]) })
  })

  it('buries ground the players were made to forget, in sight or not', () => {
    const { stepper, grid, next } = stepped()
    stepper.paint(grid.target, {
      ...next,
      visible: keys('b'),
      explored: { seen: keys('b'), added: new Set(), lost: keys('a', 'c'), version: 3 },
    })
    expect(grid.last()).toEqual({
      kind: 'update',
      map: new Map([
        [K.c, 0],
        [K.a, 0],
      ]),
    })
  })

  it('draws nothing when a step changes nothing', () => {
    const { stepper, grid, next } = stepped()
    stepper.paint(grid.target, {
      ...next,
      explored: { ...next.explored, added: new Set(), version: 3 },
    })
    expect(grid.calls).toHaveLength(2)
  })

  it('falls back to the whole map on a rewind', () => {
    const { stepper, grid, next } = stepped()
    stepper.paint(grid.target, at(keys('a', 'b'), 3, null))
    expect(grid.last().kind).toBe('set')
    stepper.paint(grid.target, {
      ...next,
      explored: { ...next.explored, version: 1 },
    })
    expect(grid.last().kind).toBe('set')
  })

  it('falls back to the whole map when a version is skipped', () => {
    const { stepper, grid, next } = stepped()
    stepper.paint(grid.target, { ...next, explored: { ...next.explored, version: 4 } })
    expect(grid.last().kind).toBe('set')
  })

  it('falls back to the whole map when the window moves', () => {
    const { stepper, grid, next } = stepped()
    stepper.paint(grid.target, {
      ...next,
      windowTick: 2,
      explored: { ...next.explored, added: new Set(), version: 3 },
    })
    expect(grid.last().kind).toBe('set')
  })

  it('falls back to the whole map when fog is toggled off and on', () => {
    const { stepper, grid, next } = stepped()
    stepper.paint(grid.target, {
      ...next,
      fog: false,
      explored: { ...next.explored, added: new Set(), version: 3 },
    })
    expect(grid.last()).toEqual({ kind: 'set', map: new Map() })

    stepper.paint(grid.target, {
      ...next,
      explored: { ...next.explored, added: new Set(), version: 4 },
    })
    expect(grid.last().kind).toBe('set')
    expect(grid.last().map.get(K.d)).toBe(0)
    expect(grid.last().map.get(K.a)).toBe(REMEMBERED)
  })

  it('falls back to the whole map after a reset', () => {
    const { stepper, grid, next } = stepped()
    stepper.reset()
    stepper.paint(grid.target, {
      ...next,
      explored: { ...next.explored, added: new Set(), version: 3 },
    })
    expect(grid.last().kind).toBe('set')
  })
})
