import { describe, expect, it } from 'vitest'
import type { MapSnapshot } from '../persistence/mapState'
import { projectForPlayers, type PlayerProjection } from './projection'
import { encodeState } from './snapshotCodec'
import { applyPatch, diffState, parsePatch, type Patch } from './snapshotDiff'
import { crawlStore } from './snapshotFixture'

type Store = ReturnType<typeof crawlStore>

const view = (store: Store): PlayerProjection => projectForPlayers(store.snapshot, store.field)

/** Everything a patch holds is `next`'s, where `next` has it. */
const expectOnlyFrom = (patch: Patch, next: PlayerProjection): void => {
  for (const [key, value] of Object.entries(patch.set)) {
    expect(value).toEqual(next[key as keyof PlayerProjection])
  }
  for (const [key, edit] of Object.entries(patch.edit)) {
    const list = next[key as keyof PlayerProjection] as readonly unknown[]
    for (const [index, row] of edit!.put) expect(row).toEqual(list[index])
  }
}

const expectRoundTrip = (prev: PlayerProjection, next: PlayerProjection): Patch => {
  const patch = diffState(prev, next)
  expect(applyPatch(prev, patch)).toEqual(next)
  const wire = parsePatch(JSON.parse(JSON.stringify(patch)))
  expect(wire).not.toBeNull()
  expect(applyPatch(prev, wire!)).toEqual(next)
  expectOnlyFrom(patch, next)
  return patch
}

const steps: [string, (store: Store) => void][] = [
  ['a turn passing', (store) => store.advanceTurn()],
  ['an order given', (store) => store.select({ q: 4, r: 0 })],
  [
    'a walk of several turns',
    (store) => {
      store.select({ q: 5, r: -2 })
      for (let i = 0; i < 4; i++) store.advanceTurn()
    },
  ],
  ['an event added', (store) => store.addEvent('1,1', { title: 'tracks', description: 'fresh' })],
  ['an item taken away', (store) => store.removeItem(store.items[0].id)],
  ['an entity renamed', (store) => store.renameEntity(store.entities[1].id, 'the wagons')],
  ['a turn wound back', (store) => store.rewindTurn()],
  ['a new party put down', (store) => store.addEntity('scouts')],
]

describe('a patch between two projections of a crawl', () => {
  it.each(steps)('takes the players from one to the next after %s', (_, step) => {
    const store = crawlStore()
    store.select({ q: 3, r: 0 })
    store.advanceTurn()
    store.advanceTurn()
    const prev = view(store)
    step(store)
    expectRoundTrip(prev, view(store))
  })

  it('is empty when nothing changed', () => {
    const store = crawlStore()
    expect(diffState(view(store), view(store))).toEqual({ set: {}, edit: {} })
  })

  it('is far smaller than the state it brings up to date', () => {
    const store = crawlStore()
    store.select({ q: 6, r: 0 })
    for (let i = 0; i < 3; i++) store.advanceTurn()
    const prev = view(store)
    store.advanceTurn()
    const patch = expectRoundTrip(prev, view(store))
    expect(JSON.stringify(patch).length * 3).toBeLessThan(encodeState(view(store)).length)
  })

  it('sends the explored ground as the hexes newly found', () => {
    const store = crawlStore()
    // Out past what the caravan sees from where it waits.
    store.select({ q: 8, r: 0 })
    for (let i = 0; i < 3; i++) store.advanceTurn()
    const prev = view(store)
    store.advanceTurn()
    const next = view(store)
    const patch = expectRoundTrip(prev, next)
    const found = next.explored.filter((hex) => !prev.explored.includes(hex))
    expect(found.length).toBeGreaterThan(0)
    expect(patch.edit.explored?.put.map(([, hex]) => hex)).toEqual(found)
    expect(patch.edit.explored?.drop).toEqual([])
  })

  it('names nothing an entity going into hiding leaves behind', () => {
    const store = crawlStore()
    const map = JSON.parse(JSON.stringify(store.snapshot)) as MapSnapshot
    const spy = map.entities.find((one) => one.hidden)!
    const shown = { ...map, entities: map.entities.map((one) => ({ ...one, hidden: false })) }

    const prev = projectForPlayers(shown, store.field)
    const next = projectForPlayers(map, store.field)
    expect(JSON.stringify(prev)).toContain(spy.id)

    const patch = expectRoundTrip(prev, next)
    const text = JSON.stringify(patch)
    expect(text).not.toContain(spy.id)
    expect(text).not.toContain('poison')
  })
})

describe('a patch of plain lists', () => {
  const base = (): PlayerProjection => {
    const store = crawlStore()
    return view(store)
  }

  const withHexes = (explored: string[]): PlayerProjection =>
    ({ ...base(), explored }) as PlayerProjection

  it.each([
    [
      'rows added at both ends and the middle',
      ['0,0', '1,0', '2,0'],
      ['9,9', '0,0', '5,5', '1,0', '2,0', '8,8'],
    ],
    ['rows taken out', ['0,0', '1,0', '2,0', '3,0'], ['1,0', '3,0']],
    ['rows moved', ['0,0', '1,0', '2,0', '3,0'], ['3,0', '0,0', '2,0', '1,0']],
    ['repeated rows', ['0,0', '0,0', '1,0'], ['1,0', '0,0', '1,0', '0,0']],
    ['a list emptied', ['0,0', '1,0'], []],
    ['a list filled', [], ['0,0', '1,0']],
    ['every row changed', ['0,0', '1,0'], ['2,0', '3,0']],
  ])('round-trips %s', (_, before, after) => {
    expectRoundTrip(withHexes(before), withHexes(after))
  })
})

describe('a patch off the wire', () => {
  const prev = (): PlayerProjection => view(crawlStore())

  it.each([
    ['nothing', null],
    ['a list', []],
    ['a missing part', { set: {} }],
    ['an extra part', { set: {}, edit: {}, more: {} }],
    ['an unknown field set', { set: { notes: [] }, edit: {} }],
    ['a field set to junk', { set: { turn: -1 }, edit: {} }],
    ['an edit of a field that is no list', { set: {}, edit: { turn: { drop: [], put: [] } } }],
    [
      'a field both set and edited',
      { set: { explored: [] }, edit: { explored: { drop: [], put: [] } } },
    ],
    ['indexes out of order', { set: {}, edit: { explored: { drop: [1, 0], put: [] } } }],
    ['a negative index', { set: {}, edit: { explored: { drop: [], put: [[-1, '0,0']] } } }],
    ['a put that is no pair', { set: {}, edit: { explored: { drop: [], put: [['0,0']] } } }],
  ])('is refused when it is %s', (_, value) => {
    expect(parsePatch(value)).toBeNull()
  })

  it('does not apply to a state it does not fit', () => {
    const state = prev()
    const drop = { set: {}, edit: { explored: { drop: [state.explored.length], put: [] } } }
    const put = {
      set: {},
      edit: { explored: { drop: [], put: [[state.explored.length + 5, '0,0']] } },
    }
    expect(applyPatch(state, parsePatch(drop)!)).toBeNull()
    expect(applyPatch(state, parsePatch(put)!)).toBeNull()
  })

  it('does not apply when a row it puts is malformed', () => {
    const patch = parsePatch({ set: {}, edit: { tiles: { drop: [], put: [[0, { hex: 'x' }]] } } })
    expect(applyPatch(prev(), patch!)).toBeNull()
  })
})
