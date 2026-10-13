import { Color3 } from '@babylonjs/core/Maths/math.color'
import { describe, expect, it } from 'vitest'
import { hexKey, parseKey, range, type Axial, type HexKey } from '../hex/coords'
import { withRoad } from '../terrain/roads'
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

/** A one-leg order along the route; a route of one hex has nowhere to go. */
const move = (route: HexKey[], waypoints = route.length > 1 ? route.slice(-1) : []): Action => ({
  kind: 'move',
  route,
  waypoints,
})

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

  it('never charges a climb at sea', () => {
    const tiles = ridgeField(4)
    expect(stepCostTurns(tiles.get('1,0')!, tiles.get('2,0')!, 'sea')).toBe(1)
  })

  it('charges one turn for a climb along a road', () => {
    const tiles = ridgeField(4)
    expect(stepCostTurns(tiles.get('1,0')!, tiles.get('2,0')!, 'land', true)).toBe(1)
  })

  it('lets a party up a ridge on the turn it reaches it when a road climbs it', () => {
    const tiles = ridgeField(4)
    const who = entity({ pacePerTurn: 1 })
    const order = move(east(2))
    const field = fieldFromTiles(tiles)
    const from = new Map([[who.id, standing('0,0')]])
    const queued = new Map([[who.id, order]])

    const roads = withRoad(new Set(), east(2).map(parseKey))
    const paved = resolveTurn(0, field, [who], from, queued, roads)
    const second = resolveTurn(1, field, [who], paved.states, new Map(), roads)
    expect(second.states.get(who.id)!.at).toBe('2,0')

    const rough = resolveTurn(0, field, [who], from, queued)
    const stuck = resolveTurn(1, field, [who], rough.states, new Map())
    expect(stuck.states.get(who.id)!.at).toBe('1,0')
  })
})

describe('resolving a turn', () => {
  it('crosses a hex a turn at a pace of one', () => {
    const { state, trail } = run(entity(), flatField(4), standing('0,0'), move(east(3)), 3)

    expect(trail).toEqual([['1,0'], ['2,0'], ['3,0']])
    expect(state.at).toBe('3,0')
    expect(state.pending).toEqual([])
  })

  it('takes two turns over a climb, and stands still on the first of them', () => {
    const { trail } = run(entity(), ridgeField(4), standing('0,0'), move(east(3)), 4)

    expect(trail).toEqual([['1,0'], [], ['2,0'], ['3,0']])
  })

  it('carries a caravan half-step between turns rather than losing it', () => {
    const caravan = entity({ id: 'caravan', kind: 'caravan', ...KIND_DEFAULTS.caravan })
    const { state, trail } = run(caravan, flatField(4), standing('0,0'), move(east(2)), 4)

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
      new Map<string, Action>([[who.id, move(east(3))]]),
    )

    const second = resolveTurn(
      1,
      fieldFromTiles(tiles),
      [who],
      first.states,
      new Map<string, Action>([[who.id, move(['1,0', '1,-1'])]]),
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
      new Map<string, Action>([[who.id, move(east(5))]]),
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
      new Map<string, Action>([[scout.id, move(['0,0'])]]),
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
      new Map<string, Action>([[who.id, move(east(2))]]),
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
        [party.id, move(east(4))],
        [scout.id, move(east(4))],
      ]),
    )

    expect(states.get(party.id)!.at).toBe('1,0')
    expect(states.get(scout.id)!.at).toBe('2,0')
  })
})

describe('walking a chain of legs', () => {
  it('drops each stop once it is reached and keeps the ones ahead', () => {
    const { state, trail } = run(
      entity(),
      flatField(4),
      standing('0,0'),
      move(east(3), ['1,0', '3,0']),
      2,
    )

    expect(trail).toEqual([['1,0'], ['2,0']])
    expect(state.waypoints).toEqual(['3,0'])
  })

  it('does not count a later stop passed through on an earlier leg', () => {
    // Out to 2,0 and back to 1,0: the second stop is crossed on the first leg.
    const { state } = run(
      entity(),
      flatField(4),
      standing('0,0'),
      move(['0,0', '1,0', '2,0', '1,0'], ['2,0', '1,0']),
      1,
    )

    expect(state.at).toBe('1,0')
    expect(state.waypoints).toEqual(['2,0', '1,0'])
  })

  it('ends with no stops left when the last leg is walked', () => {
    const { state } = run(entity(), flatField(4), standing('0,0'), move(east(2), ['1,0', '2,0']), 2)

    expect(state.waypoints).toEqual([])
    expect(state.pending).toEqual([])
  })

  it('forgets the stops when the entity makes camp', () => {
    const camped = resolveTurn(
      0,
      fieldFromTiles(flatField(4)),
      [entity()],
      new Map([['party', standing('0,0', { pending: ['1,0'], waypoints: ['1,0'] })]]),
      new Map<string, Action>([['party', { kind: 'camp' }]]),
    )

    expect(camped.states.get('party')!.waypoints).toEqual([])
  })
})

describe('riding in a caravan', () => {
  const party = entity()
  const caravan = entity({ id: 'caravan', kind: 'caravan', ...KIND_DEFAULTS.caravan })
  const field = fieldFromTiles(flatField(4))

  it('climbs into a caravan standing where it arrives', () => {
    const { states } = resolveTurn(
      0,
      field,
      [party, caravan],
      new Map([
        [party.id, standing('0,0', { pending: ['1,0'], waypoints: ['1,0'] })],
        [caravan.id, standing('1,0')],
      ]),
      new Map(),
    )

    expect(states.get(party.id)).toEqual({ ...idleState(), at: '1,0', riding: caravan.id })
  })

  it('only passes a caravan on its way somewhere else', () => {
    const { states } = resolveTurn(
      0,
      field,
      [party, caravan],
      new Map([
        [party.id, standing('0,0', { pending: ['1,0', '2,0'] })],
        [caravan.id, standing('1,0')],
      ]),
      new Map(),
    )

    expect(states.get(party.id)!.at).toBe('1,0')
    expect(states.get(party.id)!.riding).toBeNull()
  })

  it('goes where the caravan goes, at the caravan pace, for nothing', () => {
    const first = resolveTurn(
      0,
      field,
      [party, caravan],
      new Map([
        [party.id, standing('0,0', { riding: caravan.id })],
        [caravan.id, standing('0,0', { carry: 0.5 })],
      ]),
      new Map<string, Action>([[caravan.id, move(east(2))]]),
    )

    expect(first.states.get(party.id)).toEqual({ ...idleState(), at: '1,0', riding: caravan.id })
    expect(first.records[0]).toMatchObject({ entered: ['1,0'], spent: 0 })

    // Half a hex a turn: the caravan stands this one out, and so does its rider.
    const second = resolveTurn(1, field, [party, caravan], first.states, new Map())
    expect(second.states.get(party.id)!.at).toBe('1,0')
  })

  it('climbs out and walks at its own pace when ordered away', () => {
    const { states, records } = resolveTurn(
      0,
      field,
      [party, caravan],
      new Map([
        [party.id, standing('0,0', { riding: caravan.id })],
        [caravan.id, standing('0,0', { carry: 0.5 })],
      ]),
      new Map<string, Action>([
        [caravan.id, move(east(2))],
        [party.id, move(['0,0', '0,1', '0,2'])],
      ]),
    )

    expect(states.get(party.id)).toMatchObject({ at: '0,1', pending: ['0,2'], riding: null })
    expect(records[0].spent).toBe(1)
    expect(states.get(caravan.id)!.at).toBe('1,0')
  })

  it('does not climb straight back in when a climb holds it on the caravan hex', () => {
    const { states } = resolveTurn(
      0,
      fieldFromTiles(ridgeField(4)),
      [party, caravan],
      new Map([
        [party.id, standing('1,0', { riding: caravan.id })],
        [caravan.id, standing('1,0')],
      ]),
      new Map<string, Action>([[party.id, move(['1,0', '2,0'])]]),
    )

    expect(states.get(party.id)).toMatchObject({ at: '1,0', pending: ['2,0'], riding: null })
  })

  it('stays aboard when told to wait or camp', () => {
    const { states } = resolveTurn(
      0,
      field,
      [party, caravan],
      new Map([
        [party.id, standing('0,0', { riding: caravan.id })],
        [caravan.id, standing('0,0', { carry: 0.5 })],
      ]),
      new Map<string, Action>([
        [caravan.id, move(east(2))],
        [party.id, { kind: 'camp' }],
      ]),
    )

    expect(states.get(party.id)).toMatchObject({ at: '1,0', riding: caravan.id })
  })

  it('rides nothing once its caravan is gone', () => {
    const { states } = resolveTurn(
      0,
      field,
      [party],
      new Map([[party.id, standing('0,0', { riding: caravan.id })]]),
      new Map(),
    )

    expect(states.get(party.id)).toMatchObject({ at: '0,0', riding: null })
  })

  it('never puts a caravan inside another', () => {
    const wagon = entity({ id: 'wagon', kind: 'caravan', ...KIND_DEFAULTS.caravan })
    const { states } = resolveTurn(
      0,
      field,
      [caravan, wagon],
      new Map([
        [caravan.id, standing('0,0')],
        [wagon.id, standing('0,0')],
      ]),
      new Map(),
    )

    expect(states.get(caravan.id)!.riding).toBeNull()
    expect(states.get(wagon.id)!.riding).toBeNull()
  })
})

describe('riding a ship', () => {
  const party = entity()
  const ship = entity({ id: 'ship', kind: 'ship', ...KIND_DEFAULTS.ship })
  const caravan = entity({ id: 'caravan', kind: 'caravan', ...KIND_DEFAULTS.caravan })

  /** Land west of the meridian, open sea east of it: the 0,0 column is the coast. */
  const shore = (): Map<HexKey, TerrainTile> => {
    const tiles = flatField(4)
    for (const [key, one] of tiles) {
      if (one.hex.q > 0) tiles.set(key, { ...one, height: -1, level: 0, elevation: 0 })
    }
    return tiles
  }
  const field = fieldFromTiles(shore())

  it('boards a ship lying at the coast where it stands', () => {
    const { states } = resolveTurn(
      0,
      field,
      [party, ship],
      new Map([
        [party.id, standing('0,0')],
        [ship.id, standing('0,0')],
      ]),
      new Map(),
    )

    expect(states.get(party.id)).toEqual({ ...idleState(), at: '0,0', riding: ship.id })
  })

  it('is carried three hexes of open water a turn for nothing', () => {
    const { states, records } = resolveTurn(
      0,
      field,
      [party, ship],
      new Map([
        [party.id, standing('0,0', { riding: ship.id })],
        [ship.id, standing('0,0')],
      ]),
      new Map<string, Action>([[ship.id, move(east(4))]]),
    )

    expect(states.get(party.id)).toEqual({ ...idleState(), at: '3,0', riding: ship.id })
    expect(records[0]).toMatchObject({ entered: ['1,0', '2,0', '3,0'], spent: 0 })
  })

  it('cannot be ordered off at sea and stays with the ship', () => {
    const { states } = resolveTurn(
      0,
      field,
      [party, ship],
      new Map([
        [party.id, standing('2,0', { riding: ship.id })],
        [ship.id, standing('2,0')],
      ]),
      new Map<string, Action>([
        [ship.id, move(['2,0', '3,0'])],
        [party.id, move(['2,0', '1,0', '0,0'])],
      ]),
    )

    expect(states.get(party.id)).toEqual({ ...idleState(), at: '3,0', riding: ship.id })
  })

  it('disembarks at the coast when ordered inland', () => {
    const { states } = resolveTurn(
      0,
      field,
      [party, ship],
      new Map([
        [party.id, standing('0,0', { riding: ship.id })],
        [ship.id, standing('0,0')],
      ]),
      new Map<string, Action>([[party.id, move(['0,0', '-1,0'])]]),
    )

    expect(states.get(party.id)).toMatchObject({ at: '-1,0', pending: [], riding: null })
  })

  it('never takes another carrier aboard', () => {
    const { states } = resolveTurn(
      0,
      field,
      [caravan, ship],
      new Map([
        [caravan.id, standing('0,0')],
        [ship.id, standing('0,0')],
      ]),
      new Map(),
    )

    expect(states.get(caravan.id)!.riding).toBeNull()
    expect(states.get(ship.id)!.riding).toBeNull()
  })
})
