import { describe, expect, it } from 'vitest'
import type { Step } from './history'
import { createRecorder, diffStep, sameJson, toJson, type JournalEntry } from './journal'

const step = (
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  extra: Partial<Step> = {},
): Step => ({
  slots: Object.keys(after).filter((name) => !Object.is(before[name], after[name])),
  before,
  after,
  key: null,
  cause: 'action',
  merged: false,
  ...extra,
})

describe('toJson', () => {
  it('flattens maps, sets and missing values into plain JSON', () => {
    expect(
      toJson({ a: new Map([['x', new Set(['1,2'])]]), b: undefined, c: Infinity, d: [null] }),
    ).toEqual({ a: { x: ['1,2'] }, c: null, d: [null] })
  })

  it('compares JSON by value, keys in any order', () => {
    expect(sameJson({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true)
    expect(sameJson({ a: 1 }, { a: 1, b: null })).toBe(false)
    expect(sameJson([1], [1, 2])).toBe(false)
  })
})

describe('diffStep', () => {
  it('tells records apart by id, field by field', () => {
    const party = { id: 'p', name: 'the party', pace: 1 }
    const npc = { id: 'n', name: 'npc' }
    const ship = { id: 's', name: 'ship' }
    const changes = diffStep(
      step({ entities: [party, npc] }, { entities: [{ ...party, name: 'heroes' }, ship] }),
    )

    expect(changes).toEqual([
      { target: 'entities', key: 'n', at: 1, old: npc, new: null },
      { target: 'entities', key: 'p', field: 'name', old: 'the party', new: 'heroes' },
      { target: 'entities', key: 's', at: 1, old: null, new: ship },
    ])
  })

  it('leaves out a record that was copied but not changed', () => {
    const party = { id: 'p', name: 'a' }
    expect(diffStep(step({ entities: [party] }, { entities: [{ ...party }] }))).toEqual([])
  })

  it('tells maps apart by key', () => {
    const kept = { kind: 'wait' }
    const changes = diffStep(
      step(
        {
          queue: new Map<string, unknown>([
            ['a', kept],
            ['b', { kind: 'camp' }],
          ]),
        },
        {
          queue: new Map<string, unknown>([
            ['a', kept],
            ['c', { kind: 'wait' }],
          ]),
        },
      ),
    )
    expect(changes).toEqual([
      { target: 'queue', key: 'b', old: { kind: 'camp' }, new: null },
      { target: 'queue', key: 'c', old: null, new: { kind: 'wait' } },
    ])
  })

  it('tells a list under a key by the stretch that changed, a new key whole', () => {
    const early = { turn: 0, food: 5 }
    const changes = diffStep(
      step(
        { supplies: new Map([['c', [early, { turn: 3, food: 4 }]]]) },
        {
          supplies: new Map([
            ['c', [early, { turn: 3, food: 2 }, { turn: 4, food: 1 }]],
            ['d', [early]],
          ]),
        },
      ),
    )
    expect(changes).toEqual([
      {
        target: 'supplies',
        key: 'c',
        at: 1,
        old: [{ turn: 3, food: 4 }],
        new: [
          { turn: 3, food: 2 },
          { turn: 4, food: 1 },
        ],
      },
      { target: 'supplies', key: 'd', old: null, new: [early] },
    ])
  })

  it('tells sets by member', () => {
    expect(diffStep(step({ roads: new Set(['a', 'b']) }, { roads: new Set(['b', 'c']) }))).toEqual([
      { target: 'roads', key: 'a', old: true, new: null },
      { target: 'roads', key: 'c', old: null, new: true },
    ])
  })

  it('tells fog edits hex by hex', () => {
    const changes = diffStep(
      step(
        { fogEdits: { revealed: new Set(['1,1']), hidden: new Set(['2,2']) } },
        { fogEdits: { revealed: new Set(['2,2']), hidden: new Set<string>() } },
      ),
    )
    expect(changes).toEqual([
      { target: 'fogEdits', key: '1,1', old: 'revealed', new: null },
      { target: 'fogEdits', key: '2,2', old: 'hidden', new: 'revealed' },
    ])
  })

  it('tells plain values and named fields', () => {
    const changes = diffStep(
      step(
        { turn: 3, terrain: { seed: 1, scale: 50 } },
        { turn: 4, terrain: { seed: 2, scale: 50 } },
      ),
    )
    expect(changes).toEqual([
      { target: 'turn', old: 3, new: 4 },
      { target: 'terrain', field: 'seed', old: 1, new: 2 },
    ])
  })

  it('tells a list by the stretch that changed', () => {
    const changes = diffStep(
      step(
        { seats: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] },
        { seats: [{ name: 'a' }, { name: 'x' }, { name: 'y' }, { name: 'c' }] },
      ),
    )
    expect(changes).toEqual([
      { target: 'seats', at: 1, old: [{ name: 'b' }], new: [{ name: 'x' }, { name: 'y' }] },
    ])
  })

  it('writes out dropped frames in full and counts the ones added', () => {
    const kept = { records: [], states: new Map() }
    const dropped = { records: [{ turn: 1 }], states: new Map([['p', { at: '0,0' }]]) }
    expect(
      diffStep(
        step({ frames: [kept, dropped] }, { frames: [kept, { records: [], states: new Map() }] }),
      ),
    ).toEqual([
      {
        target: 'frames',
        at: 1,
        old: [{ records: [{ turn: 1 }], states: { p: { at: '0,0' } } }],
        new: 1,
      },
    ])
  })

  it('leaves view state out', () => {
    expect(
      diffStep(step({ selectedId: 'a', roadTail: null }, { selectedId: 'b', roadTail: '1,1' })),
    ).toEqual([])
  })
})

describe('createRecorder', () => {
  const setup = (turn = 0) => {
    let journal: readonly JournalEntry[] = []
    let ids = 0
    const record = createRecorder(
      () => journal,
      (next) => {
        journal = next
      },
      () => ({ who: { role: 'player', plays: ['p'] }, turn }),
      { now: () => 1000, newId: () => `e${++ids}` },
    )
    return { record, read: () => journal }
  }

  it('writes one entry for a step that changed something journaled', () => {
    const { record, read } = setup(5)
    record(step({ notes: new Map() }, { notes: new Map([['1,1', 'hi']]) }))

    expect(read()).toEqual([
      {
        id: 'e1',
        who: { role: 'player', plays: ['p'] },
        cause: 'action',
        turn: 5,
        at: 1000,
        changes: [{ target: 'notes', key: '1,1', old: null, new: 'hi' }],
      },
    ])
  })

  it('writes nothing for a step that changed only view state', () => {
    const { record, read } = setup()
    record(step({ selectedId: 'a' }, { selectedId: 'b' }))
    expect(read()).toEqual([])
  })

  it('dates a step that moved the clock to the turn before it', () => {
    const { record, read } = setup(8)
    record(step({ turn: 7 }, { turn: 8 }))
    expect(read()[0]!.turn).toBe(7)
  })

  it('replaces the entry a merged step folds into', () => {
    const { record, read } = setup()
    record(step({ revealed: false }, { revealed: true }))
    record(step({ resourceSpacing: 5 }, { resourceSpacing: 6 }))
    record(step({ resourceSpacing: 5 }, { resourceSpacing: 7 }, { merged: true }))

    expect(read().map(({ id, changes }) => ({ id, changes }))).toEqual([
      { id: 'e1', changes: [{ target: 'revealed', old: false, new: true }] },
      { id: 'e3', changes: [{ target: 'resourceSpacing', old: 5, new: 7 }] },
    ])
  })

  it('takes out the entry when a merged step cancels it', () => {
    const { record, read } = setup()
    record(step({ resourceSpacing: 5 }, { resourceSpacing: 6 }))
    record(
      step(
        { resourceSpacing: 5 },
        { resourceSpacing: 5 },
        { merged: true, slots: ['resourceSpacing'] },
      ),
    )
    expect(read()).toEqual([])
  })

  it('does not replace an entry the step before did not write', () => {
    const { record, read } = setup()
    record(step({ revealed: false }, { revealed: true }))
    record(step({ selectedId: 'a' }, { selectedId: 'b' }))
    record(
      step(
        { selectedId: 'a', resourceSpacing: 5 },
        { selectedId: 'c', resourceSpacing: 6 },
        { merged: true },
      ),
    )

    expect(read().map(({ id }) => id)).toEqual(['e1', 'e2'])
  })

  it('keeps the cause of undo and redo', () => {
    const { record, read } = setup()
    record(step({ revealed: true }, { revealed: false }, { cause: 'undo' }))
    expect(read()[0]!.cause).toBe('undo')
  })
})
