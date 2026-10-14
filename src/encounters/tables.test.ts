import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../terrain/perlin'
import { TERRAIN_IDS } from '../terrain/terrain'
import { PHASES } from '../time/clock'
import {
  changeEncounter,
  DEFAULT_ENCOUNTERS,
  mergeTables,
  removeEncounter,
  resetTerrain,
  restoreEncounter,
  rollEncounter,
  rollFor,
  tableFor,
  terrainRows,
  type EncounterEntry,
  type EncounterOverride,
} from './tables'

const line = (
  id: string,
  weight: number,
  when: EncounterEntry['when'] = 'any',
): EncounterEntry => ({
  id,
  terrain: 'grass',
  when,
  weight,
  title: id,
  description: '',
})

describe('the default tables', () => {
  it.each(TERRAIN_IDS)('give %s something to roll by day and by night', (terrain) => {
    for (const phase of PHASES)
      expect(tableFor(terrain, phase, DEFAULT_ENCOUNTERS).length).toBeGreaterThanOrEqual(5)
    const all = DEFAULT_ENCOUNTERS.filter((one) => one.terrain === terrain)
    expect(all.length).toBeGreaterThanOrEqual(6)
    expect(all.length).toBeLessThanOrEqual(10)
  })

  it('give every line a unique id named after its terrain', () => {
    const ids = DEFAULT_ENCOUNTERS.map((one) => one.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const one of DEFAULT_ENCOUNTERS) {
      expect(one.id.startsWith(`${one.terrain}.`)).toBe(true)
      expect(one.weight).toBeGreaterThan(0)
      expect(one.title).not.toBe('')
      expect(one.description).not.toBe('')
    }
  })

  it('keep a quiet line on every table at least a quarter of the odds', () => {
    for (const terrain of TERRAIN_IDS) {
      for (const phase of PHASES) {
        const table = tableFor(terrain, phase, DEFAULT_ENCOUNTERS)
        const total = table.reduce((sum, one) => sum + one.weight, 0)
        expect(Math.max(...table.map((one) => one.weight)) / total).toBeGreaterThan(0.25)
      }
    }
  })
})

describe('tableFor', () => {
  it('keeps the lines for the terrain and the phase, and the ones for any time', () => {
    const entries = [
      line('a', 1),
      line('day', 1, 'day'),
      line('night', 1, 'night'),
      { ...line('sea', 1), terrain: 'water' as const },
    ]
    expect(tableFor('grass', 'day', entries).map((one) => one.id)).toEqual(['a', 'day'])
    expect(tableFor('grass', 'night', entries).map((one) => one.id)).toEqual(['a', 'night'])
    expect(tableFor('water', 'night', entries).map((one) => one.id)).toEqual(['sea'])
  })
})

describe('rollEncounter', () => {
  it('draws nothing from an empty table or one with no weight in it', () => {
    expect(rollEncounter([], 1)).toBeNull()
    expect(rollEncounter([line('a', 0)], 1)).toBeNull()
  })

  it('draws the same line from the same seed', () => {
    const table = tableFor('forest', 'night', DEFAULT_ENCOUNTERS)
    for (const seed of [1, 2, 99, 12345]) {
      expect(rollEncounter(table, seed)).toBe(rollEncounter(table, seed))
    }
  })

  it('never draws a line with no weight', () => {
    const random = mulberry32(5)
    for (let i = 0; i < 500; i++)
      expect(rollEncounter([line('a', 0), line('b', 1)], random)?.id).toBe('b')
  })

  it('draws each line about as often as its weight says', () => {
    const table = [line('common', 6), line('uncommon', 3), line('rare', 1)]
    const random = mulberry32(42)
    const counts = new Map<string, number>()
    const draws = 20000
    for (let i = 0; i < draws; i++) {
      const id = rollEncounter(table, random)!.id
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    expect(counts.get('common')! / draws).toBeCloseTo(0.6, 1)
    expect(counts.get('uncommon')! / draws).toBeCloseTo(0.3, 1)
    expect(counts.get('rare')! / draws).toBeCloseTo(0.1, 1)
  })

  it('draws only the lines of the phase it is given', () => {
    const entries = [line('day', 1, 'day'), line('night', 1, 'night')]
    const random = mulberry32(3)
    for (let i = 0; i < 200; i++) {
      expect(rollEncounter(tableFor('grass', 'night', entries), random)?.id).toBe('night')
    }
  })
})

describe('rollFor', () => {
  const entries = [
    { ...line('quiet', 3), terrain: 'forest' as const },
    { ...line('spiders', 1, 'night'), terrain: 'forest' as const },
    line('herd', 5, 'day'),
  ]

  it('draws from the table of the terrain and phase, with its odds', () => {
    const roll = rollFor('forest', 'night', entries, () => 0.9)
    expect(roll).toEqual({ entry: entries[1], total: 4 })
    expect(rollFor('forest', 'day', entries, () => 0.9)).toEqual({ entry: entries[0], total: 3 })
    expect(rollFor('grass', 'day', entries, () => 0)?.entry.id).toBe('herd')
  })

  it('draws nothing from a table with nothing on it', () => {
    expect(rollFor('grass', 'night', entries, Math.random)).toBeNull()
    expect(rollFor('sand', 'day', entries, Math.random)).toBeNull()
  })
})

describe('overrides', () => {
  const defaults = [
    line('grass.a', 4),
    line('grass.b', 2),
    { ...line('water.c', 1), terrain: 'water' as const },
  ]

  it('leave the defaults alone when there are none', () => {
    expect(mergeTables(defaults, [])).toEqual(defaults)
  })

  it('change fields, strike lines off, and add the DM’s own after the defaults', () => {
    const added = line('mine', 7, 'night')
    const overrides: EncounterOverride[] = [
      { kind: 'change', id: 'grass.a', change: { weight: 9, title: 'Changed' } },
      { kind: 'remove', id: 'grass.b' },
      { kind: 'add', entry: added },
    ]
    expect(mergeTables(defaults, overrides)).toEqual([
      { ...defaults[0], weight: 9, title: 'Changed' },
      defaults[2],
      added,
    ])
  })

  it('fold repeated changes into one and drop it once it matches the default again', () => {
    let overrides = changeEncounter(defaults, [], 'grass.a', { weight: 9 })
    overrides = changeEncounter(defaults, overrides, 'grass.a', { title: 'Wolves' })
    expect(overrides).toEqual([
      { kind: 'change', id: 'grass.a', change: { weight: 9, title: 'Wolves' } },
    ])

    overrides = changeEncounter(defaults, overrides, 'grass.a', { weight: 4, title: 'grass.a' })
    expect(overrides).toEqual([])
  })

  it('edit and remove the DM’s own lines in place', () => {
    const added = line('mine', 1)
    let overrides: EncounterOverride[] = [{ kind: 'add', entry: added }]
    overrides = changeEncounter(defaults, overrides, 'mine', { weight: 5 })
    expect(overrides).toEqual([{ kind: 'add', entry: { ...added, weight: 5 } }])
    expect(removeEncounter(defaults, overrides, 'mine')).toEqual([])
  })

  it('ignore a change to a line that does not exist', () => {
    expect(changeEncounter(defaults, [], 'nope', { weight: 3 })).toEqual([])
  })

  it('put a struck or changed default back as it shipped', () => {
    const struck = removeEncounter(
      defaults,
      changeEncounter(defaults, [], 'grass.a', { weight: 1 }),
      'grass.a',
    )
    expect(struck).toEqual([{ kind: 'remove', id: 'grass.a' }])
    expect(restoreEncounter(struck, 'grass.a')).toEqual([])
  })

  it('reset one terrain without touching the others', () => {
    const overrides: EncounterOverride[] = [
      { kind: 'remove', id: 'grass.a' },
      { kind: 'change', id: 'water.c', change: { weight: 3 } },
      { kind: 'add', entry: line('mine', 1) },
      { kind: 'change', id: 'water.c', change: { terrain: 'grass' } },
    ]
    expect(resetTerrain(defaults, overrides, 'grass')).toEqual([overrides[1]])
    expect(resetTerrain(defaults, overrides, 'water')).toEqual([overrides[0], overrides[2]])
  })
})

describe('terrain rows', () => {
  const defaults = [
    line('grass.a', 4),
    line('grass.b', 2, 'night'),
    line('grass.c', 1),
    { ...line('water.d', 1), terrain: 'water' as const },
  ]

  it('list every default of the terrain, day and night alike', () => {
    expect(terrainRows(defaults, [], 'grass')).toEqual([
      { entry: defaults[0], status: 'default' },
      { entry: defaults[1], status: 'default' },
      { entry: defaults[2], status: 'default' },
    ])
  })

  it('mark changed, struck and added lines, keeping struck ones where they stood', () => {
    const mine = line('mine', 3, 'day')
    const overrides: EncounterOverride[] = [
      { kind: 'change', id: 'grass.a', change: { weight: 9 } },
      { kind: 'remove', id: 'grass.b' },
      { kind: 'add', entry: mine },
      { kind: 'add', entry: { ...line('wet', 1), terrain: 'water' } },
    ]
    expect(terrainRows(defaults, overrides, 'grass')).toEqual([
      { entry: { ...defaults[0], weight: 9 }, status: 'changed' },
      { entry: defaults[1], status: 'removed' },
      { entry: defaults[2], status: 'default' },
      { entry: mine, status: 'added' },
    ])
  })

  it('follow a default moved to another terrain', () => {
    const overrides: EncounterOverride[] = [
      { kind: 'change', id: 'water.d', change: { terrain: 'grass' } },
    ]
    expect(terrainRows(defaults, overrides, 'water')).toEqual([])
    expect(terrainRows(defaults, overrides, 'grass').at(-1)).toEqual({
      entry: { ...defaults[3], terrain: 'grass' },
      status: 'changed',
    })
  })
})
