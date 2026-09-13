import { Color3 } from '@babylonjs/core/Maths/math.color'
import { describe, expect, it } from 'vitest'
import { hexKey, range, type Axial, type HexKey } from '../hex/coords'
import type { TerrainTile } from '../terrain/terrain'
import type { Action } from './action'
import { KIND_DEFAULTS, idleState, type Entity, type EntityState } from './entity'
import { MAX_CARRY, resolveTurn, stepCostTurns } from './resolve'
import { fieldFromTiles } from '../terrain/field'

const tile = (hex: Axial, level = 1): TerrainTile => ({
  hex,
  terrain: 'grass',
  height: level,
  level,
  elevation: 0.5 + level,
  color: new Color3(0, 0, 0),
})

const flatField = (radius: number): Map<HexKey, TerrainTile> =>
  new Map(range({ q: 0, r: 0 }, radius).map((hex) => [hexKey(hex), tile(hex)]))

/** The same field with a ridge the party has to climb at the second hex east. */
const ridgeField = (radius: number): Map<HexKey, TerrainTile> => {
  const tiles = flatField(radius)
  tiles.set('2,0', tile({ q: 2, r: 0 }, 3))
  return tiles
}

const entity = (over: Partial<Entity> = {}): Entity => ({
  id: 'party',
  name: 'the party',
  kind: 'party',
  owner: 'player',
  color: '#fff',
  hidden: false,
  ...KIND_DEFAULTS.party,
  ...over,
})

const standing = (at: HexKey, over: Partial<EntityState> = {}): EntityState => ({
  ...idleState(),
  at,
  ...over,
})

const east = (count: number): HexKey[] =>
  Array.from({ length: count + 1 }, (_, q) => hexKey({ q, r: 0 }))

/** Runs `turns` turns over one entity, the order given on the first of them. */
const run = (
  who: Entity,
  tiles: Map<HexKey, TerrainTile>,
  from: EntityState,
  order: Action | undefined,
  turns: number,
): { state: EntityState; trail: HexKey[][] } => {
  let states: ReadonlyMap<string, EntityState> = new Map([[who.id, from]])
  const trail: HexKey[][] = []

  for (let turn = 0; turn < turns; turn++) {
    const queued = new Map<string, Action>(turn === 0 && order ? [[who.id, order]] : [])
    const outcome = resolveTurn(turn, fieldFromTiles(tiles), [who], states, queued)
    states = outcome.states
    trail.push([...outcome.records[0].entered])
  }

  return { state: states.get(who.id)!, trail }
}

describe('the cost of a step', () => {
  it('charges a turn for flat ground and two for a climb', () => {
    const tiles = ridgeField(4)
    expect(stepCostTurns(tiles.get('0,0')!, tiles.get('1,0')!)).toBe(1)
    expect(stepCostTurns(tiles.get('1,0')!, tiles.get('2,0')!)).toBe(2)
  })
})

describe('resolving a turn', () => {
  it('crosses a hex a turn at a pace of one', () => {
    const { state, trail } = run(
      entity(),
      flatField(4),
      standing('0,0'),
      { kind: 'move', route: east(3) },
      3,
    )

    expect(trail).toEqual([['1,0'], ['2,0'], ['3,0']])
    expect(state.at).toBe('3,0')
    expect(state.pending).toEqual([])
  })

  it('takes two turns over a climb, and stands still on the first of them', () => {
    const { trail } = run(
      entity(),
      ridgeField(4),
      standing('0,0'),
      { kind: 'move', route: east(3) },
      4,
    )

    expect(trail).toEqual([['1,0'], [], ['2,0'], ['3,0']])
  })

  it('carries a caravan half-step between turns rather than losing it', () => {
    const caravan = entity({ id: 'caravan', kind: 'caravan', ...KIND_DEFAULTS.caravan })
    const { state, trail } = run(
      caravan,
      flatField(4),
      standing('0,0'),
      { kind: 'move', route: east(2) },
      4,
    )

    expect(trail).toEqual([[], ['1,0'], [], ['2,0']])
    expect(state.carry).toBe(0)
  })

  it('keeps walking a standing order without being told again', () => {
    const { trail } = run(entity(), flatField(4), standing('0,0'), undefined, 1)
    expect(trail).toEqual([[]])

    const walked = run(
      entity(),
      flatField(4),
      standing('0,0', { pending: ['1,0', '2,0'] }),
      undefined,
      2,
    )
    expect(walked.trail).toEqual([['1,0'], ['2,0']])
  })

  it('lets a new order call off the route the entity was walking', () => {
    const who = entity()
    const tiles = flatField(4)
    const first = resolveTurn(
      0,
      fieldFromTiles(tiles),
      [who],
      new Map([[who.id, standing('0,0')]]),
      new Map<string, Action>([[who.id, { kind: 'move', route: east(3) }]]),
    )

    const second = resolveTurn(
      1,
      fieldFromTiles(tiles),
      [who],
      first.states,
      new Map<string, Action>([[who.id, { kind: 'move', route: ['1,0', '1,-1'] }]]),
    )

    expect(second.records[0].entered).toEqual(['1,-1'])
    expect(second.states.get(who.id)!.pending).toEqual([])
  })

  it('starts the morning from a standstill after a night in camp', () => {
    const caravan = entity({ kind: 'caravan', ...KIND_DEFAULTS.caravan })
    const tiles = flatField(4)
    const camped = resolveTurn(
      0,
      fieldFromTiles(tiles),
      [caravan],
      new Map([[caravan.id, standing('0,0', { carry: 0.5, pending: ['1,0'] })]]),
      new Map<string, Action>([[caravan.id, { kind: 'camp' }]]),
    )

    expect(camped.states.get(caravan.id)!.carry).toBe(0)
    expect(camped.states.get(caravan.id)!.pending).toEqual([])
    expect(camped.records[0].kind).toBe('camp')
  })

  it('banks nothing for standing about, however long it stands', () => {
    const who = entity()
    const tiles = flatField(6)
    let states: ReadonlyMap<string, EntityState> = new Map([[who.id, standing('0,0')]])

    for (let turn = 0; turn < 5; turn++) {
      states = resolveTurn(turn, fieldFromTiles(tiles), [who], states, new Map()).states
    }

    expect(states.get(who.id)!.carry).toBe(0)

    const moved = resolveTurn(
      5,
      fieldFromTiles(tiles),
      [who],
      states,
      new Map<string, Action>([[who.id, { kind: 'move', route: east(5) }]]),
    )

    expect(moved.records[0].entered).toEqual(['1,0'])
  })

  it('never carries more than the dearest step costs', () => {
    const scout = entity({ pacePerTurn: 3 })
    const tiles = flatField(4)

    // Nowhere to go, so the whole turn's pace is left over.
    const idle = resolveTurn(
      0,
      fieldFromTiles(tiles),
      [scout],
      new Map([[scout.id, standing('0,0')]]),
      new Map<string, Action>([[scout.id, { kind: 'move', route: ['0,0'] }]]),
    )

    expect(idle.states.get(scout.id)!.carry).toBe(MAX_CARRY)
  })

  it('writes a row for an entity that was given nothing to do', () => {
    const who = entity()
    const { records } = resolveTurn(
      7,
      fieldFromTiles(flatField(4)),
      [who],
      new Map([[who.id, standing('0,0')]]),
      new Map(),
    )

    expect(records).toEqual([
      {
        turn: 7,
        entityId: who.id,
        kind: 'wait',
        from: '0,0',
        to: '0,0',
        entered: [],
        spent: 0,
        carry: 0,
      },
    ])
  })

  it('puts an entity down on the first hex of its route without charging for it', () => {
    const who = entity()
    const { states, records } = resolveTurn(
      0,
      fieldFromTiles(flatField(4)),
      [who],
      new Map([[who.id, idleState()]]),
      new Map<string, Action>([[who.id, { kind: 'move', route: east(2) }]]),
    )

    expect(records[0].from).toBeNull()
    expect(states.get(who.id)!.at).toBe('1,0')
  })

  it('resolves every entity on the same turn', () => {
    const party = entity()
    const scout = entity({ id: 'scout', name: 'the scout', pacePerTurn: 2 })
    const tiles = flatField(5)

    const { states } = resolveTurn(
      0,
      fieldFromTiles(tiles),
      [party, scout],
      new Map([
        [party.id, standing('0,0')],
        [scout.id, standing('0,0')],
      ]),
      new Map<string, Action>([
        [party.id, { kind: 'move', route: east(4) }],
        [scout.id, { kind: 'move', route: east(4) }],
      ]),
    )

    expect(states.get(party.id)!.at).toBe('1,0')
    expect(states.get(scout.id)!.at).toBe('2,0')
  })
})
