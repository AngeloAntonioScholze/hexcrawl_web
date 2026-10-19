import { Color3 } from '@babylonjs/core/Maths/math.color'
import { roadSpans } from '../engine/roadSegments'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { catalogFor, DEFAULT_CATALOG, unlockedServices } from '../entities/catalog'
import { CHARACTER_LEVELS, PURSE_LIMITS } from '../entities/character'
import { hexKey, range, type Axial, type HexKey } from '../hex/coords'
import {
  DEFAULT_RESOURCE_SPACING,
  defaultResourceChances,
  RESOURCE_SPACING_LIMITS,
} from '../terrain/resources'
import { mulberry32 } from '../terrain/perlin'
import { riverKey } from '../terrain/rivers'
import { roadHexes, type Roads } from '../terrain/roads'
import { TERRAIN_DEFAULTS, type TerrainId, type TerrainTile } from '../terrain/terrain'
import { TURNS_PER_PHASE } from '../time/clock'
import { DM, PLAYER } from '../session/permissions'
import { fieldFromTiles } from '../terrain/field'
import { BRUSH_LIMITS, MAX_SIGHT, TERRAIN_LIMITS, useHexMapStore } from './hexMap'

// The number is the mechanical level; sight and climbs read that, and the
// rendered height only trails along behind it.
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

type Store = ReturnType<typeof useHexMapStore>

const setup = (): Store => {
  const store = useHexMapStore()
  store.setTiles(flatField(6))
  return store
}

/** Does what only the DM may, such as passing a turn, while the players' view is up. */
const asDm = (store: Store, work: () => unknown): void => {
  store.actAs(DM, work)
}

/** Puts the party down and sends it east, which is what a click pair does. */
const sendEast = (store: Store, distance = 4): void => {
  store.select({ q: 0, r: 0 })
  store.select({ q: distance, r: 0 })
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('giving orders', () => {
  it('puts the entity down on the first click, then plans a route', () => {
    const store = setup()

    store.select({ q: 0, r: 0 })
    expect(store.start).toBe('0,0')
    expect(store.goal).toBeNull()

    store.select({ q: 2, r: 0 })
    expect(store.goal).toBe('2,0')
    expect(store.start).toBe('0,0')
  })

  it('moves nobody until a turn passes', () => {
    const store = setup()
    sendEast(store, 2)

    expect(store.start).toBe('0,0')
    expect(store.turn).toBe(0)

    store.advanceTurn()

    expect(store.start).toBe('1,0')
    expect(store.turn).toBe(1)
  })

  it('keeps walking a standing order turn after turn', () => {
    const store = setup()
    sendEast(store, 3)

    store.advanceTurn()
    store.advanceTurn()
    store.advanceTurn()

    expect(store.start).toBe('3,0')
    expect(store.goal).toBeNull()
  })

  it('calls the order off when the entity is clicked where it stands', () => {
    const store = setup()
    sendEast(store, 3)

    store.select({ q: 0, r: 0 })
    store.advanceTurn()

    expect(store.start).toBe('0,0')
    expect(store.goal).toBeNull()
  })

  it('takes a caravan two turns over the hex a party crosses in one', () => {
    const store = setup()
    const caravan = store.addEntity('the caravan', 'caravan')!
    store.selectEntity(caravan.id)
    sendEast(store, 2)

    store.advanceTurn()
    expect(store.start).toBe('0,0')

    store.advanceTurn()
    expect(store.start).toBe('1,0')
  })
})

describe('DM tools', () => {
  it('starts on select, with a brush clamped to whole hexes', () => {
    const store = setup()
    expect(store.dmTool).toBe('select')

    store.setBrushSize(2.4)
    expect(store.brushSize).toBe(2)
    store.setBrushSize(99)
    expect(store.brushSize).toBe(BRUSH_LIMITS.max)
    store.setBrushSize(-3)
    expect(store.brushSize).toBe(BRUSH_LIMITS.min)
  })

  it('works the ground instead of selecting while a tool is in hand', () => {
    const store = setup()
    store.setDmTool('paint')
    store.setPaintTerrain('grass')

    store.click({ q: 2, r: 0 })
    expect(store.selectedHex).toBeNull()
    expect(store.canUndo).toBe(false)

    store.setDmTool('select')
    store.selectEntity('')
    store.click({ q: 2, r: 0 })
    expect(store.selectedHex).toBe('2,0')
  })
})

describe('the hover footprint', () => {
  const footprint = (store: Store): string[] => [...store.hoverFootprint].sort()

  it('is empty with nothing under the pointer', () => {
    const store = setup()
    expect(store.hoverFootprint).toEqual([])
  })

  it('covers every hex a brush tool would touch', () => {
    const store = setup()
    store.setDmTool('paint')
    store.setBrushSize(1)
    store.setHovered({ q: 2, r: 0 })

    expect(footprint(store)).toEqual(range({ q: 2, r: 0 }, 1).map(hexKey).sort())

    store.setDmTool('fog')
    store.setBrushSize(2)
    expect(store.hoverFootprint).toHaveLength(19)
  })

  it('follows the brush slider as it moves', () => {
    const store = setup()
    store.setDmTool('fog')
    store.setHovered({ q: 0, r: 0 })

    store.setBrushSize(0)
    expect(store.hoverFootprint).toEqual(['0,0'])
    store.setBrushSize(3)
    expect(store.hoverFootprint).toHaveLength(37)
  })

  it('leaves out hexes beyond the edge of the world', () => {
    const store = setup()
    store.setDmTool('paint')
    store.setBrushSize(1)
    store.setHovered({ q: 6, r: 0 })

    expect(store.hoverFootprint).toHaveLength(4)
    expect(store.hoverFootprint).not.toContain('7,0')
  })

  it('is the single hovered hex for select and road, and for the players', () => {
    const store = setup()
    store.setBrushSize(2)
    store.setHovered({ q: 1, r: 0 })
    expect(store.hoverFootprint).toEqual(['1,0'])

    store.setDmTool('road')
    expect(store.hoverFootprint).toEqual(['1,0'])

    store.setDmTool('paint')
    store.dmView = false
    expect(store.hoverFootprint).toEqual(['1,0'])
  })

  it('stays the same array while the hexes under it do not change', () => {
    const store = setup()
    store.setDmTool('paint')
    store.setPaintTerrain('forest')
    store.setHovered({ q: 0, r: 0 })
    const before = store.hoverFootprint

    store.click({ q: 0, r: 0 })

    expect(store.hoverFootprint).toBe(before)
  })
})

describe('the fog tool', () => {
  const fogTool = (store: Store, mode: 'reveal' | 'hide', brush = 0): void => {
    store.setDmTool('fog')
    store.setFogMode(mode)
    store.setBrushSize(brush)
  }

  it('reveals every hex under the brush to the players without touching what was explored', () => {
    const store = setup()
    fogTool(store, 'reveal', 1)

    store.click({ q: -4, r: 0 })

    expect(store.known.has('-4,0')).toBe(true)
    expect(store.known.has('-3,0')).toBe(true)
    expect(store.explored.has('-4,0')).toBe(false)
  })

  it('hides ground the party saw, and ground it has in sight', () => {
    const store = setup()
    store.setEntitySight(store.selectedId, 2)
    sendEast(store, 4)
    store.advanceTurn()
    expect(store.known.has('0,0')).toBe(true)
    fogTool(store, 'hide')

    store.click({ q: 0, r: 0 })

    expect(store.explored.has('0,0')).toBe(true)
    expect(store.known.has('0,0')).toBe(false)
    expect(store.visible.has('0,0')).toBe(true)
    expect(store.visibleToPlayers.has('0,0')).toBe(false)
  })

  it('takes a tap back in one undo', () => {
    const store = setup()
    fogTool(store, 'reveal', 2)
    store.click({ q: 3, r: 0 })
    expect(store.known.size).toBeGreaterThan(1)

    store.undo()

    expect(store.known.size).toBe(0)
    expect(store.canUndo).toBe(false)
  })

  it('keeps the edits over a rewind', () => {
    const store = setup()
    store.setEntitySight(store.selectedId, 1)
    sendEast(store, 4)
    for (let i = 0; i < 3; i++) store.advanceTurn()
    fogTool(store, 'reveal')
    store.click({ q: -5, r: 0 })
    fogTool(store, 'hide')
    store.click({ q: 0, r: 0 })

    store.goToTurn(1)

    expect(store.known.has('-5,0')).toBe(true)
    expect(store.known.has('0,0')).toBe(false)
  })

  it('forgets the edits on a new world', () => {
    const store = setup()
    fogTool(store, 'reveal')
    store.click({ q: 1, r: 0 })

    store.setTerrain({ seed: 99 })

    expect(store.fogEdits.revealed.size).toBe(0)
    expect(store.snapshot.fogEdits).toEqual([])
  })

  it('saves the edits and hands them back on restore', () => {
    const store = setup()
    fogTool(store, 'reveal')
    store.click({ q: 1, r: 0 })
    fogTool(store, 'hide')
    store.click({ q: 2, r: 0 })
    const saved = store.snapshot
    expect(saved.fogEdits).toEqual([
      { hex: '1,0', revealed: true },
      { hex: '2,0', revealed: false },
    ])

    setActivePinia(createPinia())
    const fresh = setup()
    fresh.restore(saved)

    expect(fresh.known.has('1,0')).toBe(true)
    expect(fresh.fogEdits.hidden.has('2,0')).toBe(true)
  })
})

describe('roads', () => {
  const roadTool = (): Store => {
    const store = setup()
    store.setDmTool('road')
    return store
  }

  it('starts a road on the first tap and carries it on with each tap after', () => {
    const store = roadTool()

    store.click({ q: 0, r: 0 })
    expect(store.roadTail).toBe('0,0')
    expect(store.roads.size).toBe(0)

    store.click({ q: 3, r: 0 })
    expect(store.roadTail).toBe('3,0')
    expect([...roadHexes(store.roads)].sort()).toEqual(['0,0', '1,0', '2,0', '3,0'])

    store.click({ q: 3, r: 2 })
    expect(store.roads.size).toBe(5)
    expect(store.roadTail).toBe('3,2')
  })

  it('ends the road on a second tap of its last hex, or on finish', () => {
    const store = roadTool()
    store.click({ q: 0, r: 0 })
    store.click({ q: 2, r: 0 })
    store.click({ q: 2, r: 0 })
    expect(store.roadTail).toBeNull()
    expect(store.roads.size).toBe(2)

    store.click({ q: 0, r: 2 })
    store.finishRoad()
    expect(store.roadTail).toBeNull()
  })

  it('ends the road when the tool is put down', () => {
    const store = roadTool()
    store.click({ q: 0, r: 0 })
    store.setDmTool('select')
    expect(store.roadTail).toBeNull()
  })

  it('never lays road across open water', () => {
    const store = useHexMapStore()
    const tiles = flatField(6)
    for (let r = -6; r <= 6; r++) {
      const hex = { q: 1, r }
      if (tiles.has(hexKey(hex)))
        tiles.set(hexKey(hex), { ...tile(hex, 0), terrain: 'water', height: -0.5 })
    }
    store.setTiles(tiles)
    store.setDmTool('road')

    store.click({ q: 1, r: 0 })
    expect(store.roadTail).toBeNull()

    store.click({ q: 0, r: 0 })
    store.click({ q: 2, r: 0 })
    expect(store.roads.size).toBe(0)
    expect(store.roadTail).toBe('0,0')
  })

  it('tears up the road touching a tapped hex while erasing', () => {
    const store = roadTool()
    store.click({ q: 0, r: 0 })
    store.click({ q: 3, r: 0 })

    store.setRoadErase(true)
    expect(store.roadTail).toBeNull()
    store.click({ q: 1, r: 0 })
    expect([...roadHexes(store.roads)].sort()).toEqual(['2,0', '3,0'])
  })

  it('takes a tap back with undo, pen and all', () => {
    const store = roadTool()
    store.click({ q: 0, r: 0 })
    store.click({ q: 2, r: 0 })

    store.undo()
    expect(store.roads.size).toBe(0)
    expect(store.roadTail).toBe('0,0')

    store.redo()
    expect(store.roads.size).toBe(2)
    expect(store.roadTail).toBe('2,0')
  })

  it('makes a climb along it quicker to plan and to walk', () => {
    const store = useHexMapStore()
    const tiles = flatField(6)
    tiles.set('2,0', tile({ q: 2, r: 0 }, 3))
    store.setTiles(tiles)
    sendEast(store, 2)
    expect(store.route!.km).toBe(30)

    store.setDmTool('road')
    store.click({ q: 0, r: 0 })
    store.click({ q: 2, r: 0 })
    expect(store.route!.km).toBe(20)

    store.dmView = false
    asDm(store, () => {
      store.advanceTurn()
      store.advanceTurn()
    })
    expect(store.start).toBe('2,0')
  })

  it('round-trips through a snapshot and is cleared by a new world', () => {
    const store = roadTool()
    store.click({ q: 0, r: 0 })
    store.click({ q: 2, r: -1 })
    const saved = store.snapshot
    expect(saved.roads).toHaveLength(2)

    setActivePinia(createPinia())
    const fresh = setup()
    fresh.restore(saved)
    expect(fresh.roads).toEqual(store.roads)

    fresh.setTerrain({ seed: TERRAIN_DEFAULTS.seed + 1 })
    expect(fresh.roads.size).toBe(0)
  })
})

describe('what the map draws', () => {
  /** Road and river both run 0,0 to 2,0, all of it seen by the party, and the DM hides 2,0. */
  const linesUnderFog = (): Store => {
    const store = setup()
    for (const tool of ['road', 'river'] as const) {
      store.setDmTool(tool)
      store.click({ q: 0, r: 0 })
      store.click({ q: 2, r: 0 })
      store.click({ q: 2, r: 0 })
    }
    store.setDmTool('select')
    store.setEntitySight(store.selectedId, 2)
    store.select({ q: 1, r: 0 })
    expect(['0,0', '1,0', '2,0'].every((key) => store.explored.has(key as HexKey))).toBe(true)
    store.setDmTool('fog')
    store.setFogMode('hide')
    store.setBrushSize(0)
    store.click({ q: 2, r: 0 })
    store.setDmTool('select')
    return store
  }

  const drawn = (store: Store, lines: Roads): string[][] =>
    roadSpans(lines, store.drawnView).map(({ a, b }) => [a, b])

  it('keeps roads and rivers on hexes the DM hid off the players map', () => {
    const store = linesUnderFog()
    store.dmView = false

    expect(drawn(store, store.roads)).toEqual([['0,0', '1,0']])
    expect(drawn(store, store.rivers)).toEqual([['0,0', '1,0']])
  })

  it('shows the DM every stretch, hidden or not', () => {
    const store = linesUnderFog()

    expect(drawn(store, store.roads)).toHaveLength(2)
    expect(drawn(store, store.rivers)).toHaveLength(2)
  })
})

describe('rivers', () => {
  const riverTool = (): Store => {
    const store = setup()
    store.setDmTool('river')
    return store
  }

  it('draws straight from tap to tap, and a tap on the end of it puts the pen down', () => {
    const store = riverTool()
    store.click({ q: 0, r: 0 })
    store.click({ q: 2, r: 0 })
    expect([...store.rivers]).toEqual([
      riverKey({ q: 0, r: 0 }, { q: 1, r: 0 }),
      riverKey({ q: 1, r: 0 }, { q: 2, r: 0 }),
    ])
    store.click({ q: 2, r: 0 })
    expect(store.roadTail).toBeNull()
  })

  it('erases every stretch touching the hex tapped', () => {
    const store = riverTool()
    store.click({ q: 0, r: 0 })
    store.click({ q: 2, r: 0 })
    store.setRoadErase(true)
    store.click({ q: 2, r: 0 })
    expect([...store.rivers]).toEqual([riverKey({ q: 0, r: 0 }, { q: 1, r: 0 })])
  })

  it('takes a stretch back with undo', () => {
    const store = riverTool()
    store.click({ q: 0, r: 0 })
    store.click({ q: 1, r: 0 })
    store.undo()
    expect(store.rivers.size).toBe(0)
    store.redo()
    expect(store.rivers.size).toBe(1)
  })

  it('makes a route that fords dearer to plan and slower to walk, unless bridged', () => {
    const store = setup()
    store.setDmTool('river')
    // Down the whole of row 1.
    store.click({ q: -6, r: 1 })
    store.click({ q: 5, r: 1 })
    store.select({ q: 0, r: 0 })
    store.dmView = false
    store.select({ q: 0, r: 1 })
    expect(store.route!.km).toBe(20)
    asDm(store, () => store.advanceTurn())
    expect(store.start).toBe('0,0')

    store.dmView = true
    store.setDmTool('road')
    store.click({ q: 0, r: 0 })
    store.click({ q: 0, r: 1 })
    expect(store.route!.km).toBe(10)
  })

  it('round-trips through a snapshot and is cleared by a new world', () => {
    const store = riverTool()
    store.click({ q: 0, r: 0 })
    store.click({ q: 1, r: 0 })
    store.click({ q: 1, r: 1 })
    const saved = store.snapshot
    expect(saved.rivers).toHaveLength(2)

    setActivePinia(createPinia())
    const fresh = setup()
    fresh.restore(saved)
    expect(fresh.rivers).toEqual(store.rivers)

    fresh.setTerrain({ seed: TERRAIN_DEFAULTS.seed + 1 })
    expect(fresh.rivers.size).toBe(0)
  })
})

describe('a brush stroke', () => {
  it('belongs to the brush tools in the DM view alone', () => {
    const store = setup()
    expect(store.brushing).toBe(false)
    store.setDmTool('paint')
    expect(store.brushing).toBe(true)
    store.setDmTool('fog')
    expect(store.brushing).toBe(true)
    store.setDmTool('road')
    expect(store.brushing).toBe(false)
    store.setDmTool('fog')
    store.dmView = false
    expect(store.brushing).toBe(false)
  })

  it('paints every hex the drag crosses, gaps between moves and all', () => {
    const store = setup()
    store.setDmTool('paint')
    store.setPaintTerrain('forest')
    store.setBrushSize(0)

    store.startStroke({ q: -3, r: 0 })
    store.continueStroke({ q: 0, r: 0 })
    store.continueStroke({ q: 3, r: 0 })
    store.endStroke()

    expect([...store.terrainOverrides.keys()].sort()).toEqual(
      [-3, -2, -1, 0, 1, 2, 3].map((q) => hexKey({ q, r: 0 })).sort(),
    )
  })

  it('does not bridge a stretch spent off the map', () => {
    const store = setup()
    store.setDmTool('paint')
    store.setPaintTerrain('forest')
    store.setBrushSize(0)

    store.startStroke({ q: -2, r: 0 })
    store.continueStroke(null)
    store.continueStroke({ q: 2, r: 0 })
    store.endStroke()

    expect([...store.terrainOverrides.keys()].sort()).toEqual(['-2,0', '2,0'])
  })

  it('takes a whole stroke back in one undo, however long it took', () => {
    const store = setup()
    store.setDmTool('fog')
    store.setFogMode('reveal')
    store.setBrushSize(1)

    store.startStroke({ q: -4, r: 0 })
    for (let q = -3; q <= 4; q++) store.continueStroke({ q, r: 0 })
    store.endStroke()
    expect(store.known.has('4,0')).toBe(true)

    store.undo()
    expect(store.known.size).toBe(0)
    expect(store.canUndo).toBe(false)
  })

  it('does nothing with a tool that is not a brush', () => {
    const store = setup()
    store.setDmTool('road')
    store.startStroke({ q: 0, r: 0 })
    store.continueStroke({ q: 2, r: 0 })
    store.endStroke()

    expect(store.roadTail).toBeNull()
    expect(store.canUndo).toBe(false)
  })
})

describe('painting terrain', () => {
  const paint = (store: Store, hex: Axial, terrain: TerrainId, brush = 0): void => {
    store.setDmTool('paint')
    store.setPaintTerrain(terrain)
    store.setBrushSize(brush)
    store.click(hex)
  }

  it('lays the terrain over every hex under the brush', () => {
    const store = setup()
    paint(store, { q: 2, r: 0 }, 'peaks', 1)

    const painted = range({ q: 2, r: 0 }, 1).map(hexKey)
    expect([...store.terrainOverrides.keys()].sort()).toEqual([...painted].sort())
    for (const hex of painted) {
      expect(store.tileAt(hex)).toMatchObject({ terrain: 'peaks', level: 4 })
    }
    expect(store.tileAt('0,0')?.terrain).toBe('grass')
  })

  it('takes a whole brush stroke back in one undo', () => {
    const store = setup()
    paint(store, { q: 0, r: 0 }, 'forest', 2)
    expect(store.terrainOverrides.size).toBe(19)

    store.undo()
    expect(store.terrainOverrides.size).toBe(0)
    expect(store.tileAt('1,0')?.terrain).toBe('grass')

    store.redo()
    expect(store.tileAt('1,0')?.terrain).toBe('forest')
  })

  it('forgets the paint where the ground is painted back to what the seed made', () => {
    const store = setup()
    paint(store, { q: 0, r: 0 }, 'water', 1)
    paint(store, { q: 0, r: 0 }, 'grass')

    expect(store.terrainOverrides.size).toBe(6)
    expect(store.terrainOverrides.has('0,0')).toBe(false)
  })

  it('leaves no step behind for a stroke that changes nothing', () => {
    const store = setup()
    paint(store, { q: 0, r: 0 }, 'sand')
    const before = store.terrainOverrides
    store.click({ q: 0, r: 0 })
    expect(store.terrainOverrides).toBe(before)

    store.undo()
    expect(store.canUndo).toBe(false)
  })

  it('routes around painted water and loses sight behind painted peaks', () => {
    const store = setup()
    paint(store, { q: 1, r: 0 }, 'deepWater')
    paint(store, { q: 0, r: 1 }, 'peaks')
    store.setDmTool('select')
    store.select({ q: 0, r: 0 })
    store.dmView = false

    store.select({ q: 2, r: 0 })
    expect(store.route?.hexes.map(hexKey)).not.toContain('1,0')
    expect(store.blocked.has('0,2')).toBe(true)
  })

  it('clears the paint with a new world', () => {
    const store = setup()
    paint(store, { q: 0, r: 0 }, 'peaks', 1)

    store.setTerrain({ seed: 99 })
    expect(store.terrainOverrides.size).toBe(0)
  })
})

describe('clicking the map', () => {
  it('selects the hex in DM view with no token picked, and gives no order', () => {
    const store = setup()
    store.selectEntity('')

    store.click({ q: 2, r: 0 })
    expect(store.selectedHex).toBe('2,0')
    expect(store.start).toBeNull()
    expect(store.queue.size).toBe(0)
  })

  it('places, then orders, the token the DM picked', () => {
    const store = setup()

    store.click({ q: 0, r: 0 })
    expect(store.start).toBe('0,0')
    expect(store.selectedHex).toBeNull()

    store.click({ q: 2, r: 0 })
    expect(store.goal).toBe('2,0')
  })

  it('routes as before in player view and selects nothing', () => {
    const store = setup()
    store.select({ q: 0, r: 0 })
    store.setPace(store.selectedId, 3)
    store.dmView = false

    store.click({ q: 2, r: 0 })
    expect(store.start).toBe('0,0')
    expect(store.goal).toBe('2,0')
    expect(store.selectedHex).toBeNull()
  })

  it('deselects the hex the DM clicks a second time, and moves to another', () => {
    const store = setup()
    store.selectEntity('')

    store.click({ q: 2, r: 0 })
    store.click({ q: 2, r: 0 })
    expect(store.selectedHex).toBeNull()

    store.click({ q: 2, r: 0 })
    store.click({ q: 1, r: 1 })
    expect(store.selectedHex).toBe('1,1')
    expect(store.canUndo).toBe(false)
  })

  it('takes back the order just given when its goal is clicked again', () => {
    const store = setup()
    store.select({ q: 0, r: 0 })
    store.setPace(store.selectedId, 3)
    store.dmView = false

    store.click({ q: 2, r: 0 })
    store.click({ q: 2, r: 0 })
    expect(store.goal).toBeNull()
    expect(store.queue.size).toBe(0)

    store.click({ q: 2, r: 0 })
    store.click({ q: 3, r: 0 })
    expect(store.goal).toBe('3,0')
  })

  it('leaves the standing order behind the one taken back', () => {
    const store = setup()
    store.select({ q: 0, r: 0 })
    store.dmView = false
    asDm(store, () => store.click({ q: 4, r: 0 }))
    asDm(store, () => store.advanceTurn())

    store.click({ q: 1, r: 2 })
    store.click({ q: 1, r: 2 })
    expect(store.goal).toBe('4,0')

    asDm(store, () => store.advanceTurn())
    expect(store.start).toBe('2,0')
  })

  it('takes the whole chain back from its last stop, but not on shift-click', () => {
    const store = setup()
    store.select({ q: 0, r: 0 })
    store.click({ q: 2, r: 0 })
    store.click({ q: 2, r: 2 }, true)

    store.click({ q: 2, r: 2 }, true)
    expect(store.legs.map((leg) => leg.to)).toEqual(['2,0', '2,2'])

    store.click({ q: 2, r: 2 })
    expect(store.goal).toBeNull()
  })

  it('still calls the order off however often the entity is clicked where it stands', () => {
    const store = setup()
    store.select({ q: 0, r: 0 })
    store.dmView = false
    store.click({ q: 3, r: 0 })
    asDm(store, () => store.advanceTurn())

    store.click({ q: 1, r: 0 })
    store.click({ q: 1, r: 0 })
    expect(store.goal).toBeNull()
    expect(store.queue.get(store.selectedId)?.kind).toBe('move')
  })

  it('undoes taking an order back as one step', () => {
    const store = setup()
    store.select({ q: 0, r: 0 })
    store.setPace(store.selectedId, 3)
    store.dmView = false
    store.click({ q: 2, r: 0 })
    store.click({ q: 2, r: 0 })

    asDm(store, () => store.undo())
    expect(store.goal).toBe('2,0')
    asDm(store, () => store.redo())
    expect(store.goal).toBeNull()
  })

  it('drops the selection when the DM view is switched off', () => {
    const store = setup()
    store.click({ q: 1, r: 1 })

    store.dmView = false
    expect(store.selectedHex).toBeNull()
  })
})

describe('the clock', () => {
  it('turns the phase over after four turns', () => {
    const store = setup()
    expect(store.clock.phase).toBe('day')

    for (let i = 0; i < TURNS_PER_PHASE; i++) store.advanceTurn()

    expect(store.clock.phase).toBe('night')
    expect(store.clock.index).toBe(0)
  })

  it('camps out the rest of the phase in one press', () => {
    const store = setup()
    store.advanceTurn()

    store.skipPhase()

    expect(store.turn).toBe(TURNS_PER_PHASE)
    expect(store.clock.phase).toBe('night')
  })

  it('cuts sight down after dark and hands it back at dawn', () => {
    const store = setup()
    store.select({ q: 0, r: 0 })
    store.setEntitySight(store.selectedId, 6)
    const byDay = store.reach

    store.skipPhase()

    expect(store.reach).toBeLessThan(byDay)
    expect(store.reach).toBeGreaterThanOrEqual(1)

    store.skipPhase()
    expect(store.reach).toBe(byDay)
  })

  it('leaves an entity with darkvision its whole sight after dark', () => {
    const store = setup()
    store.select({ q: 0, r: 0 })
    store.setEntitySight(store.selectedId, 6)
    store.setDarkvision(store.selectedId, true)
    const byDay = store.reach

    store.skipPhase()

    expect(store.clock.phase).toBe('night')
    expect(store.reach).toBe(byDay)
  })

  it('widens what the night has seen when darkvision is given, and undoes it', () => {
    const store = setup()
    store.setEntitySight(store.selectedId, 2)
    store.select({ q: 0, r: 0 })
    for (let i = 0; i < TURNS_PER_PHASE; i++) store.advanceTurn()
    store.select({ q: 4, r: 0 })
    for (let i = 0; i < TURNS_PER_PHASE; i++) store.advanceTurn()
    const blind = store.exploredCount

    store.setDarkvision(store.selectedId, true)
    expect(store.exploredCount).toBeGreaterThan(blind)

    store.undo()
    expect(store.selectedEntity?.darkvision).toBe(false)
    expect(store.exploredCount).toBe(blind)
  })
})

describe('winding the crawl back', () => {
  it('walks the entity back down the record', () => {
    const store = setup()
    sendEast(store, 3)
    store.advanceTurn()
    store.advanceTurn()
    expect(store.start).toBe('2,0')

    store.rewindTurn()

    expect(store.turn).toBe(1)
    expect(store.start).toBe('1,0')
  })

  it('has nothing to wind back on the first turn', () => {
    const store = setup()
    expect(store.canRewind).toBe(false)

    store.rewindTurn()
    expect(store.turn).toBe(0)
  })

  it('closes the fog behind the party', () => {
    const store = setup()
    store.setEntitySight(store.selectedId, 2)
    sendEast(store, 4)
    for (let i = 0; i < 4; i++) store.advanceTurn()
    const far = store.explored.size

    store.goToTurn(1)

    expect(store.explored.size).toBeLessThan(far)
  })

  it('drops the future the party turned away from', () => {
    const store = setup()
    sendEast(store, 4)
    store.advanceTurn()
    store.advanceTurn()

    store.rewindTurn()
    store.select({ q: 0, r: 2 })
    store.advanceTurn()

    expect(store.turn).toBe(2)
    expect(store.start).toBe('0,1')
    expect(store.journey.map((row) => row.hex)).toEqual(['1,0', '0,1'])
  })
})

describe('the record', () => {
  it('writes a row for every turn spent, walked or not', () => {
    const store = setup()
    store.select({ q: 0, r: 0 })
    store.advanceTurn()
    store.advanceTurn()

    expect(store.journey).toHaveLength(2)
    expect(store.journey.every((row) => row.kind === 'wait')).toBe(true)
    expect(store.hexesWalked).toBe(0)
  })

  it('crosses one hex on the press after a long wait, not five', () => {
    const store = setup()
    store.select({ q: 0, r: 0 })
    for (let i = 0; i < 5; i++) store.advanceTurn()

    store.select({ q: 5, r: 0 })
    store.advanceTurn()

    expect(store.start).toBe('1,0')
    expect(store.journey.at(-1)?.entered).toBe(1)
  })

  it('counts the ground covered', () => {
    const store = setup()
    sendEast(store, 3)
    store.advanceTurn()
    store.advanceTurn()

    expect(store.hexesWalked).toBe(2)
    expect(store.travelledKm).toBe(20)
  })
})

describe('entities', () => {
  it('opens a map that was never saved with the party on it', () => {
    const store = setup()

    expect(store.entities.map((one) => one.name)).toEqual(['the party'])
    expect(store.selectedEntity?.name).toBe('the party')
  })

  it('comes back from a snapshot of a cleared map with nobody on it', () => {
    const store = setup()
    store.removeEntity(store.selectedId)
    const saved = store.snapshot

    setActivePinia(createPinia())
    const fresh = setup()
    fresh.restore(saved)

    expect(fresh.entities).toEqual([])
    expect(fresh.selectedId).toBe('')
    expect(fresh.selectedEntity).toBeNull()
    expect(fresh.snapshot).toEqual(saved)
  })

  it('lets the map be cleared of everybody', () => {
    const store = setup()
    sendEast(store, 2)
    store.advanceTurn()

    store.removeEntity(store.selectedId)

    expect(store.entities).toEqual([])
    expect(store.selectedEntity).toBeNull()
    expect(store.start).toBeNull()
    expect(store.tokens).toEqual([])
  })

  it('has no orders to take on an empty map', () => {
    const store = setup()
    store.removeEntity(store.selectedId)

    store.select({ q: 0, r: 0 })

    expect(store.start).toBeNull()
    expect(store.goal).toBeNull()
  })

  it('hands the map back to whoever is left when one is removed', () => {
    const store = setup()
    const scout = store.addEntity('the scout')!
    store.selectEntity(scout.id)

    store.removeEntity(scout.id)

    expect(store.entities).toHaveLength(1)
    expect(store.selectedEntity?.name).toBe('the party')
  })

  it('moves everybody on the same turn', () => {
    const store = setup()
    const scout = store.addEntity('the scout')!
    store.setPace(scout.id, 2)

    sendEast(store, 4)
    store.selectEntity(scout.id)
    sendEast(store, 4)

    store.advanceTurn()

    expect(store.start).toBe('2,0')
    store.selectEntity(store.entities[0].id)
    expect(store.start).toBe('1,0')
  })

  it('keeps every entity to its own sight', () => {
    const store = setup()
    const caravan = store.addEntity('the caravan', 'caravan')!

    store.setEntitySight(store.selectedId, MAX_SIGHT + 5)

    expect(store.selectedEntity?.sight).toBe(MAX_SIGHT)
    expect(store.entities.find((one) => one.id === caravan.id)?.sight).toBeLessThan(MAX_SIGHT)
  })
})

describe('players seated at the table', () => {
  it('gives a new name a party of its own, off the map', () => {
    const store = setup()

    const token = store.seatPlayer(' Mira ')!

    expect(token).toMatchObject({ name: 'Mira', kind: 'party', owner: 'player', hidden: false })
    expect(store.entities.at(-1)).toEqual(token)
    expect(store.states.get(token.id)?.at ?? null).toBeNull()
    expect(store.seats).toEqual([{ name: 'Mira', entityId: token.id }])
  })

  it('hands a name coming back the token it had', () => {
    const store = setup()
    const first = store.seatPlayer('Mira')!

    expect(store.seatPlayer('mira')).toEqual(first)
    expect(store.entities).toHaveLength(2)
    expect(store.seats).toHaveLength(1)
  })

  it('makes a new token once the DM has removed the old one', () => {
    const store = setup()
    const first = store.seatPlayer('Mira')!
    store.removeEntity(first.id)

    const second = store.seatPlayer('Mira')!

    expect(second.id).not.toBe(first.id)
    expect(store.seats).toEqual([{ name: 'Mira', entityId: second.id }])
  })

  it('keeps the seats with the map', () => {
    const store = setup()
    const token = store.seatPlayer('Mira')!
    const saved = store.snapshot

    setActivePinia(createPinia())
    const fresh = setup()
    fresh.restore(saved)

    expect(fresh.seats).toEqual([{ name: 'Mira', entityId: token.id }])
    expect(fresh.seatPlayer('Mira')?.id).toBe(token.id)
  })

  it('lets the player set their token down once, then only order it', () => {
    const store = setup()
    const token = store.seatPlayer('Mira')!
    store.dmView = false

    store.actAs(PLAYER, () => store.place(token.id, '1,0'))
    store.actAs(PLAYER, () => store.place(token.id, '2,0'))

    store.selectEntity(token.id)
    expect(store.start).toBe('1,0')
  })
})

describe("a seated player's browser", () => {
  it('selects nothing but its own token', () => {
    const store = setup()
    const token = store.actAs(DM, () => store.addEntity('Mira'))!
    const other = store.actAs(DM, () => store.addEntity('the scout'))!
    store.dmView = false

    store.seatedId = token.id
    store.selectEntity(other.id)

    expect(store.selectedId).toBe(token.id)
    expect(store.selectedEntity?.id).toBe(token.id)
  })

  it('has nobody selected until its token arrives', () => {
    const store = setup()
    store.dmView = false

    store.seatedId = 'not-yet-here'
    const before = store.snapshot

    expect(store.selectedEntity).toBeNull()
    store.click({ q: 1, r: 0 })
    expect(store.snapshot).toEqual(before)
  })

  it('puts its own token down with a click', () => {
    const store = setup()
    const token = store.actAs(DM, () => store.addEntity('Mira'))!
    store.dmView = false
    store.seatedId = token.id

    store.click({ q: 1, r: 0 })

    expect(store.start).toBe('1,0')
  })

  it('frees the selection again once unseated', () => {
    const store = setup()
    const token = store.addEntity('Mira')!
    store.seatedId = token.id
    store.seatedId = null

    store.selectEntity(store.entities[0].id)

    expect(store.selectedId).toBe(store.entities[0].id)
  })
})

describe('the world', () => {
  it('starts the crawl over on a new world', () => {
    const store = setup()
    sendEast(store, 3)
    store.advanceTurn()

    store.setTerrain({ seed: TERRAIN_DEFAULTS.seed + 1 })

    expect(store.turn).toBe(0)
    expect(store.journey).toEqual([])
    expect(store.start).toBeNull()
  })

  it('keeps the terrain knobs inside their limits', () => {
    const store = setup()

    store.setTerrain({ scale: TERRAIN_LIMITS.scale.max + 100 })

    expect(store.terrain.scale).toBe(TERRAIN_LIMITS.scale.max)
  })

  it('starts on the classic generator, so a map from before styles keeps its ground', () => {
    expect(setup().terrain.style).toBe('classic')
  })

  it('starts the crawl over when the map style changes', () => {
    const store = setup()
    sendEast(store, 3)
    store.advanceTurn()

    store.setTerrain({ style: 'continents' })

    expect(store.terrain.style).toBe('continents')
    expect(store.turn).toBe(0)
  })

  it('keeps the style it has when handed one it does not know', () => {
    const store = setup()
    store.setTerrain({ style: 'pangaea' })

    store.setTerrain({ style: 'atoll' as never })

    expect(store.terrain.style).toBe('pangaea')
  })

  it('carries the map style through a save', () => {
    const store = setup()
    store.setTerrain({ style: 'archipelago' })
    const saved = store.snapshot

    setActivePinia(createPinia())
    const fresh = setup()
    fresh.restore(saved)

    expect(fresh.terrain.style).toBe('archipelago')
  })
})

describe('the adventure log', () => {
  it('keeps the turns the crawl has been wound back past', () => {
    const store = setup()
    sendEast(store, 3)
    store.advanceTurn()
    store.advanceTurn()
    store.advanceTurn()

    store.goToTurn(1)

    expect(store.journey).toHaveLength(3)
    expect(store.journey.filter((row) => row.spent)).toHaveLength(1)
  })

  it('puts the crawl back as it stood at the end of a logged turn', () => {
    const store = setup()
    sendEast(store, 3)
    for (let i = 0; i < 3; i++) store.advanceTurn()

    const row = store.journey[0]
    store.goToTurn(row.turn + 1)

    expect(store.turn).toBe(1)
    expect(store.start).toBe('1,0')
  })

  it('wipes every record and everybody off the map when cleared', () => {
    const store = setup()
    sendEast(store, 3)
    store.advanceTurn()
    store.advanceTurn()

    store.clearHistory()

    expect(store.turn).toBe(0)
    expect(store.journey).toEqual([])
    expect(store.start).toBeNull()
    expect(store.explored.size).toBe(0)
  })
})

describe('the paths drawn on the map', () => {
  it('draws only the selected entity by default', () => {
    const store = setup()
    const scout = store.addEntity('the scout')!
    sendEast(store, 2)
    store.selectEntity(scout.id)
    sendEast(store, 2)

    expect(store.paths).toHaveLength(1)
  })

  it('draws a line for every entity once asked to', () => {
    const store = setup()
    const scout = store.addEntity('the scout')!
    sendEast(store, 2)
    store.selectEntity(scout.id)
    store.select({ q: 0, r: 1 })
    store.select({ q: 0, r: 3 })

    store.showAllPaths = true

    expect(store.paths).toHaveLength(2)
    expect(store.paths.every((path) => path.hexes.length > 1)).toBe(true)
  })

  it('leaves hidden entities off the player map', () => {
    const store = setup()
    const lurker = store.addEntity('the lurker', 'npc', 'dm')!
    sendEast(store, 2)
    store.selectEntity(lurker.id)
    store.select({ q: 0, r: 1 })
    store.showAllPaths = true

    expect(store.paths).toHaveLength(2)

    store.dmView = false
    expect(store.paths).toHaveLength(1)
  })
})

describe("a player's reach", () => {
  /** The party put down at the middle, with the players' view up. */
  const atTable = (): Store => {
    const store = setup()
    store.select({ q: 0, r: 0 })
    store.dmView = false
    return store
  }

  const eastTo = (to: number): HexKey[] =>
    Array.from({ length: to + 1 }, (_, q) => hexKey({ q, r: 0 }))

  it('fills a click past one turn only as far as a turn reaches, along the same road', () => {
    const store = atTable()

    store.click({ q: 5, r: 0 })

    expect(store.goal).toBe('1,0')
    expect(store.legs.map((leg) => leg.to)).toEqual(['1,0'])
    expect(store.routeTurns).toBe(1)
  })

  it('reaches as far as the pace goes', () => {
    const store = atTable()
    asDm(store, () => store.setPace(store.selectedId, 2.5))

    store.click({ q: 5, r: 0 })
    expect(store.goal).toBe('2,0')
  })

  it('never stops a DM order short', () => {
    const store = setup()
    store.select({ q: 0, r: 0 })

    store.click({ q: 5, r: 0 })
    expect(store.goal).toBe('5,0')
  })

  it('holds an order sent in for a player to the same reach', () => {
    const store = setup()
    store.select({ q: 0, r: 0 })
    const id = store.selectedId

    store.actAs(PLAYER, () =>
      store.queueAction(id, { kind: 'move', route: eastTo(5), waypoints: ['3,0', '5,0'] }),
    )

    expect(store.queue.get(id)).toEqual({ kind: 'move', route: eastTo(1), waypoints: ['1,0'] })
  })

  it('keeps the stops a player reaches this turn and ends on where the turn stops', () => {
    const store = setup()
    store.select({ q: 0, r: 0 })
    const id = store.selectedId
    store.setPace(id, 3)

    store.actAs(PLAYER, () =>
      store.queueAction(id, { kind: 'move', route: eastTo(5), waypoints: ['1,0', '5,0'] }),
    )

    expect(store.queue.get(id)).toEqual({
      kind: 'move',
      route: eastTo(3),
      waypoints: ['1,0', '3,0'],
    })
  })

  it('adds no further stop on a shift-click, but sends the party that way instead', () => {
    const store = atTable()
    store.click({ q: 1, r: 0 })

    store.click({ q: 0, r: 3 }, true)

    expect(store.legs.map((leg) => leg.to)).toEqual(['0,1'])
  })

  it('takes the order back when the same click past reach is made again', () => {
    const store = atTable()

    store.click({ q: 5, r: 0 })
    store.click({ q: 5, r: 0 })

    expect(store.goal).toBeNull()
    expect(store.queue.size).toBe(0)
  })

  it('still sends a slow caravan off, a step it walks across two turns', () => {
    const store = setup()
    const wagon = store.addEntity('the wagon', 'caravan')!.id
    store.selectEntity(wagon)
    store.select({ q: 0, r: 0 })
    store.dmView = false

    store.click({ q: 4, r: 0 })
    expect(store.goal).toBe('1,0')

    asDm(store, () => store.advanceTurn())
    expect(store.start).toBe('0,0')
    asDm(store, () => store.advanceTurn())
    expect(store.start).toBe('1,0')
  })

  it('counts what the walker carried over from the turn before', () => {
    const store = atTable()
    const id = store.selectedId
    asDm(store, () => store.setPace(id, 1.5))
    store.click({ q: 1, r: 0 })
    asDm(store, () => store.advanceTurn())

    store.click({ q: 5, r: 0 })
    expect(store.goal).toBe('3,0')
  })

  it('lets the players plan past one turn once the DM lifts the cap', () => {
    const store = atTable()
    asDm(store, () => store.setPlayerReachCapped(false))

    store.click({ q: 5, r: 0 })
    expect(store.goal).toBe('5,0')

    store.click({ q: 2, r: 2 }, true)
    expect(store.legs.map((leg) => leg.to)).toEqual(['5,0', '2,2'])
  })

  it('leaves an order sent in for a player whole once the cap is lifted', () => {
    const store = setup()
    store.select({ q: 0, r: 0 })
    const id = store.selectedId
    store.setPlayerReachCapped(false)

    store.actAs(PLAYER, () =>
      store.queueAction(id, { kind: 'move', route: eastTo(5), waypoints: ['3,0', '5,0'] }),
    )

    expect(store.queue.get(id)).toEqual({
      kind: 'move',
      route: eastTo(5),
      waypoints: ['3,0', '5,0'],
    })
  })

  it('saves the cap with the map, and the DM can take the change back', () => {
    const store = setup()
    expect(store.snapshot.playerReachCapped).toBe(true)

    store.setPlayerReachCapped(false)
    const saved = store.snapshot
    expect(saved.playerReachCapped).toBe(false)

    store.undo()
    expect(store.playerReachCapped).toBe(true)

    store.restore(saved)
    expect(store.playerReachCapped).toBe(false)
  })
})

describe('chained orders', () => {
  /** Puts the party down at the middle and gives it a chain of stops. */
  const chain = (store: Store, stops: Axial[]): void => {
    store.select({ q: 0, r: 0 })
    for (const stop of stops) store.select(stop, true)
  }

  it('has no legs before any order is given', () => {
    const store = setup()
    store.select({ q: 0, r: 0 })

    expect(store.legs).toEqual([])
    expect(store.route).toBeNull()
  })

  it('reads a plain click as a chain of one leg', () => {
    const store = setup()
    sendEast(store, 3)

    expect(store.legs).toEqual([{ to: '3,0', steps: 3, km: 30, turns: 3, landfall: false }])
    expect(store.route?.km).toBe(30)
  })

  it('appends a stop on shift-click and reports every leg and the total', () => {
    const store = setup()
    chain(store, [
      { q: 2, r: 0 },
      { q: 2, r: 2 },
      { q: 0, r: 2 },
    ])

    expect(store.legs.map((leg) => leg.to)).toEqual(['2,0', '2,2', '0,2'])
    expect(store.legs.map((leg) => leg.km)).toEqual([20, 20, 20])
    expect(store.route?.km).toBe(60)
    expect(store.routeTurns).toBe(6)
    expect(store.goal).toBe('0,2')
    expect(store.plannedHexes).toHaveLength(6)
  })

  it('replaces the whole chain on a plain click', () => {
    const store = setup()
    chain(store, [
      { q: 2, r: 0 },
      { q: 2, r: 2 },
    ])

    store.select({ q: 0, r: 1 })

    expect(store.legs.map((leg) => leg.to)).toEqual(['0,1'])
  })

  it('ignores a stop added on top of the last one', () => {
    const store = setup()
    chain(store, [
      { q: 2, r: 0 },
      { q: 2, r: 0 },
    ])

    expect(store.legs).toHaveLength(1)
  })

  it('removes a stop and re-routes the legs either side of it', () => {
    const store = setup()
    chain(store, [
      { q: 2, r: 0 },
      { q: 2, r: 2 },
      { q: 0, r: 2 },
    ])

    store.removeWaypoint(1)

    expect(store.legs.map((leg) => leg.to)).toEqual(['2,0', '0,2'])
    expect(store.route?.km).toBe(40)
  })

  it('calls the order off once the last stop is removed', () => {
    const store = setup()
    sendEast(store, 2)

    store.removeWaypoint(0)
    store.advanceTurn()

    expect(store.start).toBe('0,0')
    expect(store.legs).toEqual([])
  })

  it('walks leg after leg and forgets the stops behind it', () => {
    const store = setup()
    chain(store, [
      { q: 1, r: 0 },
      { q: 1, r: 1 },
    ])

    store.advanceTurn()
    expect(store.legs.map((leg) => leg.to)).toEqual(['1,1'])

    store.advanceTurn()
    expect(store.start).toBe('1,1')
    expect(store.legs).toEqual([])
  })

  it('adds a stop onto an order already being walked', () => {
    const store = setup()
    chain(store, [
      { q: 2, r: 0 },
      { q: 2, r: 2 },
    ])
    store.advanceTurn()

    store.select({ q: 0, r: 2 }, true)

    expect(store.legs.map((leg) => leg.to)).toEqual(['2,0', '2,2', '0,2'])
  })
})

describe('riding in a caravan', () => {
  /** A caravan standing at the middle, and the party two hexes east of it. */
  const withCaravan = (store: Store): { party: string; caravan: string } => {
    const caravan = store.addEntity('the caravan', 'caravan')!
    const party = store.entities[0].id

    store.selectEntity(caravan.id)
    store.select({ q: 0, r: 0 })
    store.selectEntity(party)
    store.select({ q: 2, r: 0 })

    return { party, caravan: caravan.id }
  }

  /** Walks the party the two hexes onto the caravan, which is how it climbs in. */
  const walkAboard = (store: Store, party: string): void => {
    store.selectEntity(party)
    store.select({ q: 0, r: 0 })
    store.advanceTurn()
    store.advanceTurn()
  }

  it('climbs into a caravan it walks onto', () => {
    const store = setup()
    const { party, caravan } = withCaravan(store)

    walkAboard(store, party)

    expect(store.carrierOf(party)).toBe(caravan)
    expect(store.ridersOf(caravan).map((one) => one.id)).toEqual([party])
  })

  it('stays on its own feet a hex short of the caravan', () => {
    const store = setup()
    const { party } = withCaravan(store)

    store.selectEntity(party)
    store.select({ q: 1, r: 0 })
    store.advanceTurn()

    expect(store.carrierOf(party)).toBeNull()
    expect(store.riders.size).toBe(0)
  })

  it('goes where the caravan goes, at the caravan pace', () => {
    const store = setup()
    const { party, caravan } = withCaravan(store)
    walkAboard(store, party)

    store.selectEntity(caravan)
    store.select({ q: 2, r: 0 })
    store.advanceTurn()
    store.advanceTurn()

    store.selectEntity(party)
    expect(store.start).toBe('1,0')
    expect(store.carrierOf(party)).toBe(caravan)
  })

  it("reads the caravan's route, and the caravan's pace, from the rider", () => {
    const store = setup()
    const { party, caravan } = withCaravan(store)
    walkAboard(store, party)

    store.selectEntity(caravan)
    store.select({ q: 2, r: 0 })
    store.selectEntity(party)

    expect(store.goal).toBe('2,0')
    expect(store.legs.map((leg) => leg.to)).toEqual(['2,0'])
    // Two hexes at half a hex a turn: the rider is carried, not walking.
    expect(store.routeTurns).toBe(4)
  })

  it('walks a route of its own the moment it is ordered away', () => {
    const store = setup()
    const { party, caravan } = withCaravan(store)
    walkAboard(store, party)

    store.selectEntity(caravan)
    store.select({ q: 2, r: 0 })
    store.selectEntity(party)
    store.select({ q: 0, r: 2 })

    expect(store.goal).toBe('0,2')

    store.advanceTurn()

    expect(store.carrierOf(party)).toBeNull()
    expect(store.start).toBe('0,1')

    store.selectEntity(caravan)
    expect(store.start).toBe('0,0')
    expect(store.goal).toBe('2,0')
  })

  it('un-groups on a rewind to before it climbed in', () => {
    const store = setup()
    const { party, caravan } = withCaravan(store)
    walkAboard(store, party)

    store.goToTurn(1)

    expect(store.carrierOf(party)).toBeNull()
    expect(store.ridersOf(caravan)).toEqual([])
  })

  it('leaves its riders standing free when the caravan is taken off the map', () => {
    const store = setup()
    const { party, caravan } = withCaravan(store)
    walkAboard(store, party)

    store.removeEntity(caravan)

    expect(store.carrierOf(party)).toBeNull()
    expect(store.riders.size).toBe(0)

    store.selectEntity(party)
    expect(store.start).toBe('0,0')
  })

  it('shows the caravan in the panel when it is selected', () => {
    const store = setup()
    const { party, caravan } = withCaravan(store)

    store.selectEntity(caravan)
    expect(store.shownCaravan?.id).toBe(caravan)

    store.selectEntity(party)
    expect(store.shownCaravan).toBeNull()
  })

  it('shows the caravan a selected rider is riding in', () => {
    const store = setup()
    const { party, caravan } = withCaravan(store)

    walkAboard(store, party)

    expect(store.selectedId).toBe(party)
    expect(store.shownCaravan?.id).toBe(caravan)
  })

  it('keeps a hidden caravan out of the players panel', () => {
    const store = setup()
    const hidden = store.addEntity('the smugglers', 'caravan', 'dm')!
    store.selectEntity(hidden.id)

    expect(store.shownCaravan?.id).toBe(hidden.id)
    store.dmView = false
    expect(store.shownCaravan).toBeNull()
  })
})

describe("a caravan's portrait", () => {
  const portraitOf = (store: Store, id: string): string | undefined =>
    store.entities.find((one) => one.id === id)?.portrait

  it('starts with none, and takes one of the bundled ones', () => {
    const store = setup()
    const caravan = store.addEntity('the wagons', 'caravan')!.id
    expect(portraitOf(store, caravan)).toBeUndefined()

    store.setPortrait(caravan, 'night-camp')
    expect(portraitOf(store, caravan)).toBe('night-camp')
  })

  it('turns away a portrait the build does not ship, and keeps the one it had', () => {
    const store = setup()
    const caravan = store.addEntity('the wagons', 'caravan')!.id
    store.setPortrait(caravan, 'night-camp')

    store.setPortrait(caravan, 'a-sketch')
    expect(portraitOf(store, caravan)).toBe('night-camp')
  })

  it('gives nothing but a caravan a portrait', () => {
    const store = setup()
    const party = store.entities[0].id
    store.setPortrait(party, 'night-camp')
    expect(portraitOf(store, party)).toBeUndefined()
  })

  it('takes the portrait down again, and undo puts it back', () => {
    const store = setup()
    const caravan = store.addEntity('the wagons', 'caravan')!.id
    store.setPortrait(caravan, 'coast-road')

    store.setPortrait(caravan, null)
    expect(portraitOf(store, caravan)).toBeUndefined()

    store.undo()
    expect(portraitOf(store, caravan)).toBe('coast-road')
  })

  it('comes back from a snapshot with the portrait it was saved with', () => {
    const store = setup()
    const caravan = store.addEntity('the wagons', 'caravan')!.id
    store.setPortrait(caravan, 'winter-pass')
    const saved = store.snapshot

    setActivePinia(createPinia())
    const fresh = setup()
    fresh.restore(saved)
    expect(portraitOf(fresh, caravan)).toBe('winter-pass')
  })
})

describe('riding a ship', () => {
  /** Land west of the meridian, open sea east of it: the 0,0 column is the coast. */
  const shore = (): Map<HexKey, TerrainTile> => {
    const tiles = flatField(6)
    for (const [key, one] of tiles) {
      if (one.hex.q > 0) tiles.set(key, { ...one, height: -1, level: 0, elevation: 0 })
    }
    return tiles
  }

  /** A DM's ship moored off the coast, and the party walked aboard it with a sight of one. */
  const aboard = (store: Store): { party: string; ship: string } => {
    store.setTiles(shore())
    const ship = store.addEntity('the ship', 'ship', 'dm')!
    const party = store.entities[0].id
    store.setEntitySight(party, 1)

    store.selectEntity(ship.id)
    store.select({ q: 1, r: 0 })
    store.selectEntity(party)
    store.select({ q: -2, r: 0 })
    store.select({ q: 1, r: 0 })
    store.advanceTurn()
    store.advanceTurn()
    store.advanceTurn()

    return { party, ship: ship.id }
  }

  const sail = (store: Store, ship: string): void => {
    store.selectEntity(ship)
    store.select({ q: 4, r: 0 })
    store.advanceTurn()
  }

  it('boards from the shore and is carried three hexes of sea in a turn', () => {
    const store = useHexMapStore()
    const { party, ship } = aboard(store)
    expect(store.carrierOf(party)).toBe(ship)

    sail(store, ship)

    store.selectEntity(party)
    expect(store.start).toBe('4,0')
    expect(store.carrierOf(party)).toBe(ship)
  })

  it('leaves a party on the shore when the ship sails off as it steps aboard', () => {
    const store = useHexMapStore()
    store.setTiles(shore())
    const ship = store.addEntity('the ship', 'ship', 'dm')!.id
    const party = store.entities[0].id

    store.selectEntity(ship)
    store.select({ q: 1, r: 0 })
    store.selectEntity(party)
    store.select({ q: 0, r: 0 })
    store.select({ q: 1, r: 0 })
    store.selectEntity(ship)
    store.select({ q: 4, r: 0 })
    store.advanceTurn()

    store.selectEntity(party)
    expect(store.start).toBe('0,0')
    expect(store.carrierOf(party)).toBeNull()
  })

  it('keeps a party off water with no ship in it', () => {
    const store = useHexMapStore()
    store.setTiles(shore())
    const party = store.entities[0].id

    store.selectEntity(party)
    store.select({ q: 0, r: 0 })
    store.select({ q: 1, r: 0 })
    expect(store.queue.has(party)).toBe(false)
  })

  it('takes no order from a rider out at sea', () => {
    const store = useHexMapStore()
    const { party, ship } = aboard(store)
    sail(store, ship)

    store.selectEntity(party)
    store.select({ q: -1, r: 0 })
    store.select({ q: 4, r: 0 })

    expect(store.queue.has(party)).toBe(false)
  })

  it('lets a rider step ashore from a ship beside the coast', () => {
    const store = useHexMapStore()
    const { party } = aboard(store)

    store.selectEntity(party)
    store.select({ q: 0, r: 0 })
    store.advanceTurn()

    expect(store.carrierOf(party)).toBeNull()
    expect(store.start).toBe('0,0')
  })

  it("lets a hidden ship's riders see from every hex it crosses", () => {
    const store = useHexMapStore()
    const { ship } = aboard(store)
    sail(store, ship)
    store.dmView = false

    // In a sight of one, 2,1 shows only from the hexes sailed through, 5,0 only from the last.
    expect(store.explored.has('2,1')).toBe(true)
    expect(store.explored.has('5,0')).toBe(true)
  })

  it('puts a ship down only on water, and nobody else on water', () => {
    const store = useHexMapStore()
    store.setTiles(shore())
    const party = store.entities[0].id
    const ship = store.addEntity('the ship', 'ship')!.id

    store.selectEntity(ship)
    store.select({ q: -2, r: 0 })
    expect(store.start).toBeNull()
    store.select({ q: 0, r: 0 })
    expect(store.start).toBeNull()
    store.select({ q: 1, r: 0 })
    expect(store.start).toBe('1,0')

    store.selectEntity(party)
    store.select({ q: 2, r: 0 })
    expect(store.start).toBeNull()
    store.select({ q: 0, r: 1 })
    expect(store.start).toBe('0,1')
  })

  it('never sails a ship onto the coast', () => {
    const store = useHexMapStore()
    const { ship } = aboard(store)

    store.selectEntity(ship)
    store.select({ q: 0, r: 0 })
    expect(store.queue.has(ship)).toBe(false)
  })

  it('draws a ship as a boat, and its route as by sea', () => {
    const store = useHexMapStore()
    const { ship } = aboard(store)
    expect(store.tokens.find((one) => one.id === ship)?.shape).toBe('boat')

    store.selectEntity(ship)
    store.select({ q: 4, r: 0 })
    expect(store.routeBySea).toBe(true)
  })

  it('marks the sailed legs that end beside land', () => {
    const store = useHexMapStore()
    const { party, ship } = aboard(store)

    store.selectEntity(ship)
    store.select({ q: 4, r: 0 })
    store.select({ q: 1, r: 2 }, true)
    expect(store.legs.map((leg) => leg.landfall)).toEqual([false, true])

    store.selectEntity(party)
    store.select({ q: -2, r: 0 })
    expect(store.legs.map((leg) => leg.landfall)).toEqual([false])
  })

  it('tells water, coast and inland apart', () => {
    const store = useHexMapStore()
    store.setTiles(shore())
    expect(store.shoreAt('1,0')).toBe('water')
    expect(store.shoreAt('0,0')).toBe('coast')
    expect(store.shoreAt('-2,0')).toBe('inland')
  })

  it('says which riders are out at sea', () => {
    const store = useHexMapStore()
    const { party, ship } = aboard(store)
    expect(store.atSea(party)).toBe(false)

    sail(store, ship)
    expect(store.atSea(party)).toBe(true)
    expect(store.atSea(ship)).toBe(false)
  })

  it('winds back to the shore, and off the ship, exactly', () => {
    const store = useHexMapStore()
    const { party, ship } = aboard(store)
    sail(store, ship)

    store.goToTurn(3)
    store.selectEntity(party)
    expect(store.start).toBe('1,0')
    expect(store.carrierOf(party)).toBe(ship)

    store.goToTurn(2)
    expect(store.start).toBe('0,0')
    expect(store.carrierOf(party)).toBeNull()
  })
})

describe('what a hex holds', () => {
  const here = '1,0' as HexKey

  it('keeps a note and forgets one written blank', () => {
    const store = setup()

    store.setNote(here, 'an old shrine')
    expect(store.notes.get(here)).toBe('an old shrine')

    store.setNote(here, '   ')
    expect(store.notes.has(here)).toBe(false)
  })

  it('adds and removes events in the order they were written', () => {
    const store = setup()

    const first = store.addEvent(here, { title: 'ambush', description: 'goblins' })!
    const second = store.addEvent(here, { title: 'storm', description: '' })!
    expect(store.events.get(here)?.map((one) => one.id)).toEqual([first, second])

    store.removeEvent(here, first)
    expect(store.events.get(here)?.map((one) => one.title)).toEqual(['storm'])

    store.removeEvent(here, second)
    expect(store.events.has(here)).toBe(false)
  })

  it('adds and removes locations, dropping the hex once it holds none', () => {
    const store = setup()

    const id = store.addLocation(here, { name: 'Oakvale', kind: 'village', description: '' })!
    expect(store.locations.get(here)).toEqual([
      { id, name: 'Oakvale', kind: 'village', description: '' },
    ])

    store.removeLocation(here, id)
    expect(store.locations.has(here)).toBe(false)
  })

  it('wipes everything written on the map when the world changes', () => {
    const store = setup()
    store.setNote(here, 'an old shrine')
    store.addEvent(here, { title: 'ambush', description: '' })
    store.addLocation(here, { name: 'Oakvale', kind: 'village', description: '' })

    store.setTerrain({ seed: TERRAIN_DEFAULTS.seed + 1 })

    expect(store.notes.size).toBe(0)
    expect(store.events.size).toBe(0)
    expect(store.locations.size).toBe(0)
  })

  it('comes back from a snapshot as it was saved, on a new world too', () => {
    const store = setup()
    store.setTerrain({ seed: TERRAIN_DEFAULTS.seed + 7 })
    store.setNote(here, 'an old shrine')
    store.addEvent(here, { title: 'ambush', description: 'goblins' })
    store.addEvent(here, { title: 'storm', description: '' })
    store.addLocation('0,0' as HexKey, { name: 'Oakvale', kind: 'village', description: '' })
    const saved = store.snapshot

    setActivePinia(createPinia())
    const fresh = setup()
    fresh.restore(saved)

    expect(fresh.notes).toEqual(store.notes)
    expect(fresh.events).toEqual(store.events)
    expect(fresh.locations).toEqual(store.locations)
    expect(fresh.snapshot.events).toEqual(saved.events)
  })
})

describe('a caravan crew', () => {
  it('takes merchants on in order and hands each caravan only its own', () => {
    const store = setup()
    const caravan = store.addEntity('the caravan', 'caravan')!.id
    const other = store.addEntity('the other', 'caravan')!.id

    const smith = store.addMerchant(caravan, 'smith', 'Bram', 4)!
    const cook = store.addMerchant(caravan, 'cook')!
    store.addMerchant(other, 'mage', 'Ilse')

    expect(store.merchantsOf(caravan)).toEqual([
      { id: smith.id, caravanId: caravan, name: 'Bram', type: 'smith', level: 4 },
      { id: cook.id, caravanId: caravan, name: 'Cook', type: 'cook', level: 1 },
    ])
    expect(store.merchantsOf(other).map((one) => one.name)).toEqual(['Ilse'])
  })

  it('names an unnamed merchant after its type', () => {
    const store = setup()
    const caravan = store.addEntity('the caravan', 'caravan')!.id

    store.addMerchant(caravan, 'leatherworker')
    store.addMerchant(caravan, 'stablemaster', '   ')

    expect(store.merchants.map((one) => one.name)).toEqual(['Leatherworker', 'Stablemaster'])
  })

  it('takes no merchants onto anything but a caravan', () => {
    const store = setup()
    const ship = store.addEntity('the ship', 'ship')!.id

    expect(store.addMerchant(store.selectedId, 'smith')).toBeNull()
    expect(store.addMerchant(ship, 'smith')).toBeNull()
    expect(store.addMerchant('nobody', 'smith')).toBeNull()
    expect(store.merchants).toEqual([])
  })

  it('keeps every level a whole number from 1 to 10', () => {
    const store = setup()
    const caravan = store.addEntity('the caravan', 'caravan')!.id
    const id = store.addMerchant(caravan, 'priest', 'Odo', 14)!.id
    const level = (): number | undefined => store.merchants.find((one) => one.id === id)?.level

    expect(level()).toBe(10)
    store.setMerchantLevel(id, 0)
    expect(level()).toBe(1)
    store.setMerchantLevel(id, 6.4)
    expect(level()).toBe(6)
  })

  it('renames a merchant but never to nothing', () => {
    const store = setup()
    const caravan = store.addEntity('the caravan', 'caravan')!.id
    const id = store.addMerchant(caravan, 'hunter', 'Kell')!.id

    store.renameMerchant(id, '  Kestrel ')
    store.renameMerchant(id, '   ')

    expect(store.merchants[0].name).toBe('Kestrel')
  })

  it('lets a merchant go, and the whole crew with its caravan', () => {
    const store = setup()
    const caravan = store.addEntity('the caravan', 'caravan')!.id
    const other = store.addEntity('the other', 'caravan')!.id
    const smith = store.addMerchant(caravan, 'smith')!.id
    store.addMerchant(caravan, 'cook')
    store.addMerchant(other, 'mage')

    store.removeMerchant(smith)
    expect(store.merchantsOf(caravan).map((one) => one.type)).toEqual(['cook'])

    store.removeEntity(caravan)
    expect(store.merchants.map((one) => one.type)).toEqual(['mage'])
  })

  it('is not wound back by the clock, nor wiped by a new world', () => {
    const store = setup()
    const caravan = store.addEntity('the caravan', 'caravan')!.id
    const id = store.addMerchant(caravan, 'doctor', 'Mira', 2)!.id
    sendEast(store, 2)
    store.advanceTurn()
    store.setMerchantLevel(id, 5)

    store.rewindTurn()
    store.setTerrain({ seed: TERRAIN_DEFAULTS.seed + 1 })

    expect(store.merchants).toEqual([
      { id, caravanId: caravan, name: 'Mira', type: 'doctor', level: 5 },
    ])
  })

  it('comes back from a snapshot as it was saved', () => {
    const store = setup()
    const caravan = store.addEntity('the caravan', 'caravan')!.id
    store.addMerchant(caravan, 'alchemist', 'Vey', 7)
    store.addMerchant(caravan, 'curio')
    const saved = store.snapshot

    setActivePinia(createPinia())
    const fresh = setup()
    fresh.restore(saved)

    expect(fresh.merchantsOf(caravan)).toEqual(store.merchantsOf(caravan))
  })
})

describe("a caravan's stores", () => {
  it('are set by hand on a caravan and nothing else', () => {
    const store = setup()
    const caravan = store.addEntity('the caravan', 'caravan')!.id

    store.setSupply(caravan, 'food', 40)
    store.setSupply(caravan, 'gold', 120)
    store.setSupply(store.selectedId, 'food', 10)

    expect(store.suppliesOf(caravan)).toEqual({ food: 40, gold: 120 })
    expect(store.suppliesOf(store.selectedId)).toEqual({ food: 0, gold: 0 })
  })

  it('never drain as the turns pass', () => {
    const store = setup()
    const caravan = store.addEntity('the caravan', 'caravan')!.id
    store.setSupply(caravan, 'food', 40)

    store.advanceTurn()
    store.advanceTurn()

    expect(store.suppliesOf(caravan)).toEqual({ food: 40, gold: 0 })
  })

  it('wind back exactly with the clock, and forward again', () => {
    const store = setup()
    const caravan = store.addEntity('the caravan', 'caravan')!.id
    store.setSupply(caravan, 'food', 40)
    store.advanceTurn()
    store.setSupply(caravan, 'food', 25)
    store.setSupply(caravan, 'gold', 300)
    store.advanceTurn()

    store.rewindTurn()
    store.rewindTurn()
    expect(store.suppliesOf(caravan)).toEqual({ food: 40, gold: 0 })

    store.goToTurn(2)
    expect(store.suppliesOf(caravan)).toEqual({ food: 25, gold: 300 })
  })

  it('forget what was set in a future an order turned away from', () => {
    const store = setup()
    const caravan = store.addEntity('the caravan', 'caravan')!.id
    sendEast(store, 3)
    store.advanceTurn()
    store.setSupply(caravan, 'gold', 50)

    store.rewindTurn()
    store.queueAction(store.selectedId, { kind: 'camp' })
    store.advanceTurn()

    expect(store.suppliesOf(caravan).gold).toBe(0)
  })

  it('go with their caravan, and come back with an undo', () => {
    const store = setup()
    const caravan = store.addEntity('the caravan', 'caravan')!.id
    store.setSupply(caravan, 'food', 40)

    store.removeEntity(caravan)
    expect(store.supplies.has(caravan)).toBe(false)

    store.undo()
    expect(store.suppliesOf(caravan).food).toBe(40)

    store.undo()
    expect(store.suppliesOf(caravan).food).toBe(0)
  })

  it('come back from a snapshot as they were saved', () => {
    const store = setup()
    const caravan = store.addEntity('the caravan', 'caravan')!.id
    store.setSupply(caravan, 'food', 40)
    store.advanceTurn()
    store.setSupply(caravan, 'gold', 90)
    const saved = store.snapshot

    setActivePinia(createPinia())
    const fresh = setup()
    fresh.restore(saved)

    expect(fresh.suppliesOf(caravan)).toEqual({ food: 40, gold: 90 })
    fresh.rewindTurn()
    expect(fresh.suppliesOf(caravan)).toEqual({ food: 40, gold: 0 })
  })
})

describe('ability scores', () => {
  const tens = {
    strength: 10,
    dexterity: 10,
    constitution: 10,
    intelligence: 10,
    wisdom: 10,
    charisma: 10,
  }

  it('stand at ten for parties and npcs, and are absent on caravans and ships', () => {
    const store = setup()
    const npc = store.addEntity('the hermit', 'npc', 'dm')!.id
    const caravan = store.addEntity('the caravan', 'caravan')!.id
    const ship = store.addEntity('the cog', 'ship')!.id

    expect(store.abilitiesOf(store.selectedId)).toEqual(tens)
    expect(store.abilitiesOf(npc)).toEqual(tens)
    expect(store.abilitiesOf(caravan)).toBeNull()
    expect(store.abilitiesOf(ship)).toBeNull()
    expect(store.abilitiesOf('nobody')).toBeNull()
  })

  it('are set one at a time, as whole numbers from one to twenty', () => {
    const store = setup()
    const party = store.selectedId

    store.setAbility(party, 'strength', 17)
    store.setAbility(party, 'dexterity', 30)
    store.setAbility(party, 'charisma', 0)
    store.setAbility(party, 'wisdom', 12.6)

    expect(store.abilitiesOf(party)).toEqual({
      ...tens,
      strength: 17,
      dexterity: 20,
      charisma: 1,
      wisdom: 13,
    })
  })

  it('are never written onto a caravan', () => {
    const store = setup()
    const caravan = store.addEntity('the caravan', 'caravan')!.id

    store.setAbility(caravan, 'strength', 18)

    expect(store.abilities.has(caravan)).toBe(false)
  })

  it('undo as one step for a run of edits to one score', () => {
    const store = setup()
    const party = store.selectedId

    store.setAbility(party, 'strength', 11)
    store.setAbility(party, 'strength', 12)
    store.setAbility(party, 'strength', 13)
    store.undo()

    expect(store.abilitiesOf(party)).toEqual(tens)
  })

  it('go with their entity, and come back with an undo', () => {
    const store = setup()
    const npc = store.addEntity('the hermit', 'npc')!.id
    store.setAbility(npc, 'wisdom', 18)

    store.removeEntity(npc)
    expect(store.abilities.has(npc)).toBe(false)

    store.undo()
    expect(store.abilitiesOf(npc)?.wisdom).toBe(18)
  })

  it('survive a new world', () => {
    const store = setup()
    store.setAbility(store.selectedId, 'intelligence', 15)

    store.setTerrain({ seed: 99 })

    expect(store.abilitiesOf(store.selectedId)?.intelligence).toBe(15)
  })

  it('come back from a snapshot as they were saved', () => {
    const store = setup()
    const party = store.selectedId
    store.setAbility(party, 'constitution', 16)
    const saved = store.snapshot

    setActivePinia(createPinia())
    const fresh = setup()
    fresh.restore(saved)

    expect(fresh.abilitiesOf(party)).toEqual({ ...tens, constitution: 16 })
  })
})

describe('an inventory', () => {
  /** A caravan at the middle with the party walked aboard it from two hexes east. */
  const aboard = (store: Store): { party: string; caravan: string } => {
    const caravan = store.addEntity('the caravan', 'caravan')!.id
    const party = store.entities[0].id

    store.selectEntity(caravan)
    store.select({ q: 0, r: 0 })
    store.selectEntity(party)
    store.select({ q: 2, r: 0 })
    store.select({ q: 0, r: 0 })
    store.advanceTurn()
    store.advanceTurn()

    return { party, caravan }
  }

  it('lists what each party and caravan carries, in the order it was added', () => {
    const store = setup()
    const party = store.selectedId
    const caravan = store.addEntity('the caravan', 'caravan')!.id

    const rope = store.addItem(party, { name: 'rope', quantity: 2, notes: '50 ft', weight: 1.5 })!
    const torch = store.addItem(party, { name: 'torch' })!
    store.addItem(caravan, { name: 'grain', quantity: 40 })

    expect(store.itemsOf(party)).toEqual([
      { id: rope.id, ownerId: party, name: 'rope', quantity: 2, notes: '50 ft', weight: 1.5 },
      { id: torch.id, ownerId: party, name: 'torch', quantity: 1, notes: '', weight: null },
    ])
    expect(store.itemsOf(caravan).map((one) => one.name)).toEqual(['grain'])
  })

  it('takes nothing nameless, nor onto an npc or nobody', () => {
    const store = setup()
    const npc = store.addEntity('the hermit', 'npc')!.id

    expect(store.addItem(store.selectedId, { name: '   ' })).toBeNull()
    expect(store.addItem(npc, { name: 'staff' })).toBeNull()
    expect(store.addItem('nobody', { name: 'staff' })).toBeNull()
    expect(store.items).toEqual([])
  })

  it('edits a line, keeping its count whole and its name readable', () => {
    const store = setup()
    const id = store.addItem(store.selectedId, { name: 'rope', weight: 2 })!.id

    store.editItem(id, { name: ' silk rope ', quantity: 3.4, notes: ' knotted ', weight: null })
    store.editItem(id, { name: '  ' })
    store.editItem(id, { quantity: -2 })

    expect(store.items[0]).toEqual({
      id,
      ownerId: store.selectedId,
      name: 'silk rope',
      quantity: 1,
      notes: 'knotted',
      weight: null,
    })
  })

  it('removes a line, and goes with the entity that carried it', () => {
    const store = setup()
    const party = store.selectedId
    const caravan = store.addEntity('the caravan', 'caravan')!.id
    const rope = store.addItem(party, { name: 'rope' })!.id
    store.addItem(party, { name: 'torch' })
    store.addItem(caravan, { name: 'grain' })

    store.removeItem(rope)
    expect(store.itemsOf(party).map((one) => one.name)).toEqual(['torch'])

    store.removeEntity(caravan)
    expect(store.items.map((one) => one.name)).toEqual(['torch'])
  })

  it('undoes every change, a run of edits to one field as one', () => {
    const store = setup()
    const id = store.addItem(store.selectedId, { name: 'rope' })!.id
    store.editItem(id, { quantity: 2 })
    store.editItem(id, { quantity: 3 })

    store.undo()
    expect(store.items[0].quantity).toBe(1)

    store.undo()
    expect(store.items).toEqual([])

    store.redo()
    store.removeItem(id)
    store.undo()
    expect(store.items.map((one) => one.name)).toEqual(['rope'])
  })

  it('hands things between a rider and its caravan, both ways', () => {
    const store = setup()
    const { party, caravan } = aboard(store)
    const torch = store.addItem(party, { name: 'torch', quantity: 5 })!.id

    expect(store.inventoryPartners(party).map((one) => one.id)).toEqual([caravan])
    expect(store.inventoryPartners(caravan).map((one) => one.id)).toEqual([party])

    store.transferItem(torch, caravan, 2)
    expect(store.itemsOf(party).map((one) => one.quantity)).toEqual([3])
    expect(store.itemsOf(caravan).map((one) => [one.name, one.quantity])).toEqual([['torch', 2]])

    store.transferItem(store.itemsOf(caravan)[0].id, party, 2)
    expect(store.itemsOf(caravan)).toEqual([])
    expect(store.itemsOf(party).map((one) => one.quantity)).toEqual([5])

    store.undo()
    expect(store.itemsOf(caravan).map((one) => one.quantity)).toEqual([2])
  })

  it('hands nothing across to a caravan the party is not riding in', () => {
    const store = setup()
    const party = store.selectedId
    const caravan = store.addEntity('the caravan', 'caravan')!.id
    const torch = store.addItem(party, { name: 'torch' })!.id

    store.transferItem(torch, caravan, 1)

    expect(store.inventoryPartners(party)).toEqual([])
    expect(store.itemsOf(party).map((one) => one.id)).toEqual([torch])
  })

  it('comes back from a snapshot as it was saved', () => {
    const store = setup()
    const caravan = store.addEntity('the caravan', 'caravan')!.id
    store.addItem(store.selectedId, { name: 'rope', quantity: 2, weight: 1.5 })
    store.addItem(caravan, { name: 'grain', quantity: 40, notes: 'sacks' })
    const saved = store.snapshot

    setActivePinia(createPinia())
    const fresh = setup()
    fresh.restore(saved)

    expect(fresh.items).toEqual(saved.items)
    expect(fresh.itemsOf(caravan).map((one) => one.name)).toEqual(['grain'])
  })
})

describe('the services catalog', () => {
  const find = (store: Store, id: string) => store.catalog.find((one) => one.id === id)

  it('starts from the defaults', () => {
    const store = setup()
    expect(store.catalogOverrides).toEqual([])
    expect(store.catalog).toEqual(DEFAULT_CATALOG)
  })

  it('edits, strikes off and resets entries, and what a merchant offers follows', () => {
    const store = setup()
    store.editCatalogEntry('smith.sharpen', { level: 1, price: '5 gp' })
    store.removeCatalogEntry('smith.armour')

    const offered = unlockedServices('smith', 3, store.catalog).map((one) => one.id)
    expect(offered).toContain('smith.sharpen')
    expect(offered).not.toContain('smith.armour')
    expect(find(store, 'smith.sharpen')?.price).toBe('5 gp')

    store.resetCatalogEntry('smith.sharpen')
    store.resetCatalogEntry('smith.armour')
    expect(store.catalog).toEqual(DEFAULT_CATALOG)
  })

  it('adds an entry of the DM’s own and lets it go again', () => {
    const store = setup()
    const made = store.addCatalogEntry('cook', { name: 'Pickled eel', level: 2 })!

    expect(catalogFor('cook', store.catalog)).toContainEqual(made)
    store.editCatalogEntry(made.id, { description: 'Keeps a month.' })
    expect(find(store, made.id)?.description).toBe('Keeps a month.')

    store.removeCatalogEntry(made.id)
    expect(find(store, made.id)).toBeUndefined()
    expect(store.catalogOverrides).toEqual([])
  })

  it('undoes a run of typing into one entry as one step', () => {
    const store = setup()
    store.editCatalogEntry('smith.sharpen', { description: 'K' })
    store.editCatalogEntry('smith.sharpen', { description: 'Ke' })
    store.editCatalogEntry('smith.sharpen', { description: 'Keen' })
    store.removeCatalogEntry('smith.armour')

    store.undo()
    expect(find(store, 'smith.armour')).toBeDefined()
    expect(find(store, 'smith.sharpen')?.description).toBe('Keen')
    store.undo()
    expect(store.catalog).toEqual(DEFAULT_CATALOG)
    store.redo()
    expect(find(store, 'smith.sharpen')?.description).toBe('Keen')
  })

  it('keeps the DM’s catalog across a new world, as it does the crews', () => {
    const store = setup()
    store.removeCatalogEntry('smith.armour')
    store.reseed()
    expect(find(store, 'smith.armour')).toBeUndefined()
  })

  it('comes back from a snapshot', () => {
    const store = setup()
    store.editCatalogEntry('mage.teleport', { price: '2,000 gp' })
    const made = store.addCatalogEntry('mage')!

    setActivePinia(createPinia())
    const fresh = setup()
    fresh.restore(store.snapshot)
    expect(fresh.catalog).toEqual(store.catalog)
    expect(find(fresh, made.id)).toEqual(made)
  })
})

describe('resources', () => {
  const here = '1,0' as HexKey

  it('adds and removes resources, read back hex by hex', () => {
    const store = setup()

    const timber = store.addResource(here, 'timber')!
    const herbs = store.addResource(here, 'herbs', 'generated')!
    store.addResource('0,0' as HexKey, 'iron')

    expect(store.resourcesOn(here)).toEqual([
      { id: timber, hex: here, type: 'timber', origin: 'manual' },
      { id: herbs, hex: here, type: 'herbs', origin: 'generated' },
    ])

    store.removeResource(timber)
    expect(store.resourcesOn(here).map((one) => one.type)).toEqual(['herbs'])

    store.removeResource(herbs)
    expect(store.resourcesOn(here)).toEqual([])
    expect(store.resources).toHaveLength(1)
  })

  it('starts every terrain at the default odds and spacing', () => {
    const store = setup()

    expect(store.resourceChances).toEqual(defaultResourceChances())
    expect(store.resourceSpacing).toBe(DEFAULT_RESOURCE_SPACING)
  })

  it('clamps the odds to a probability and the spacing to whole hexes', () => {
    const store = setup()

    store.setResourceChance('forest', 0.25)
    store.setResourceChance('peaks', 3)
    store.setResourceChance('sand', -1)
    store.setResourceChance('grass', Number.NaN)
    store.setResourceSpacing(6.6)

    expect(store.resourceChances).toEqual({
      ...defaultResourceChances(),
      forest: 0.25,
      peaks: 1,
      sand: 0,
    })
    expect(store.resourceSpacing).toBe(7)

    store.setResourceSpacing(-4)
    expect(store.resourceSpacing).toBe(0)

    store.setResourceSpacing(99)
    expect(store.resourceSpacing).toBe(RESOURCE_SPACING_LIMITS.max)
  })

  it('wipes the resources but keeps the odds when the world changes', () => {
    const store = setup()
    store.addResource(here, 'timber')
    store.setResourceChance('forest', 0.5)

    store.setTerrain({ seed: TERRAIN_DEFAULTS.seed + 1 })

    expect(store.resources).toEqual([])
    expect(store.resourceChances.forest).toBe(0.5)
  })

  it('generates afresh around the manual resources, undone in one step', () => {
    const store = useHexMapStore()
    store.setTiles(flatField(30))
    store.setResourceChance('grass', 1)
    store.setResourceSpacing(5)
    const kept = store.addResource('0,0' as HexKey, 'iron')!
    store.addResource('3,0' as HexKey, 'clay', 'generated')

    store.generateResources(7)
    const first = store.resources

    expect(first[0].id).toBe(kept)
    expect(first.filter((one) => one.origin === 'manual')).toHaveLength(1)
    expect(first.some((one) => one.hex === '3,0')).toBe(false)
    expect(first.length).toBeGreaterThan(10)

    store.generateResources(7)
    expect(store.resources.map((one) => one.hex)).toEqual(first.map((one) => one.hex))

    store.undo()
    expect(store.resources).toBe(first)
    store.undo()
    expect(store.resources.map((one) => one.hex)).toEqual(['0,0', '3,0'])
  })

  it('comes back from a snapshot as it was saved', () => {
    const store = setup()
    store.setTerrain({ seed: TERRAIN_DEFAULTS.seed + 7 })
    store.addResource(here, 'timber', 'generated')
    store.addResource('0,0' as HexKey, 'iron')
    store.setResourceChance('mountains', 0.3)
    store.setResourceSpacing(4)
    const saved = store.snapshot

    setActivePinia(createPinia())
    const fresh = setup()
    fresh.restore(saved)

    expect(fresh.resources).toEqual(store.resources)
    expect(fresh.resourcesOn(here)).toEqual(store.resourcesOn(here))
    expect(fresh.resourceChances).toEqual(store.resourceChances)
    expect(fresh.resourceSpacing).toBe(4)
  })
})

describe('the side panels', () => {
  it('lets all four stay open on a wide window', () => {
    const store = useHexMapStore()
    store.setPanelOpen('world', true, false)
    store.setPanelOpen('entities', true, false)
    store.setPanelOpen('caravan', true, false)
    store.setPanelOpen('details', true, false)
    expect(store.panelsOpen).toEqual({ world: true, entities: true, caravan: true, details: true })
  })

  it('opening one on a narrow window collapses the others', () => {
    const store = useHexMapStore()
    store.setPanelOpen('world', true, true)
    expect(store.panelsOpen).toEqual({
      world: true,
      entities: false,
      caravan: false,
      details: false,
    })
    store.setPanelOpen('details', true, true)
    expect(store.panelsOpen).toEqual({
      world: false,
      entities: false,
      caravan: false,
      details: true,
    })
    store.setPanelOpen('caravan', true, true)
    expect(store.panelsOpen).toEqual({
      world: false,
      entities: false,
      caravan: true,
      details: false,
    })
  })

  it('collapsing one on a narrow window leaves the others alone', () => {
    const store = useHexMapStore()
    store.setPanelOpen('details', true, true)
    store.setPanelOpen('details', false, true)
    expect(store.panelsOpen).toEqual({
      world: false,
      entities: false,
      caravan: false,
      details: false,
    })
  })

  it('collapsing one on a wide window leaves the others open', () => {
    const store = useHexMapStore()
    store.setPanelOpen('entities', false, false)
    expect(store.panelsOpen).toEqual({ world: true, entities: false, caravan: true, details: true })
  })
})

describe('undo and redo', () => {
  const here = '1,0' as HexKey

  it('takes back merchant and resource edits', () => {
    const store = setup()
    const caravan = store.addEntity('the caravan', 'caravan')!.id
    const smith = store.addMerchant(caravan, 'smith')!.id
    store.setMerchantLevel(smith, 5)
    store.addResource(here, 'timber')
    store.setResourceChance('forest', 0.5)

    store.undo()
    expect(store.resourceChances.forest).toBe(defaultResourceChances().forest)
    store.undo()
    expect(store.resources).toEqual([])
    store.undo()
    expect(store.merchants[0].level).toBe(1)

    store.removeEntity(caravan)
    expect(store.merchants).toEqual([])
    store.undo()
    expect(store.merchantsOf(caravan).map((one) => one.id)).toEqual([smith])
  })

  it('takes back a placement and an order, then gives them again', () => {
    const store = setup()
    sendEast(store)

    store.undo()
    expect(store.goal).toBeNull()
    expect(store.start).toBe('0,0')

    store.undo()
    expect(store.start).toBeNull()
    expect(store.canUndo).toBe(false)

    store.redo()
    store.redo()
    expect(store.start).toBe('0,0')
    expect(store.goal).toBe('4,0')
  })

  it('brings back the order a new one replaced, or one called off', () => {
    const store = setup()
    sendEast(store, 4)
    store.select({ q: 2, r: 0 })
    store.undo()
    expect(store.goal).toBe('4,0')

    store.clear()
    expect(store.goal).toBeNull()
    store.undo()
    expect(store.goal).toBe('4,0')

    store.queueAction(store.selectedId, { kind: 'camp' })
    store.undo()
    expect(store.queue.get(store.selectedId)?.kind).toBe('move')
  })

  it('brings back the record an order given after a rewind cut off', () => {
    const store = setup()
    sendEast(store, 4)
    store.advanceTurn()
    store.advanceTurn()
    store.rewindTurn()

    store.select({ q: -2, r: 0 })
    expect(store.frames).toHaveLength(1)

    store.undo()
    expect(store.frames).toHaveLength(2)
    store.goToTurn(2)
    expect(store.turn).toBe(2)
  })

  it('leaves no step for a click that changed nothing it keeps', () => {
    const store = setup()
    store.selectEntity('')
    store.click({ q: 1, r: 0 })
    expect(store.selectedHex).toBe('1,0')
    expect(store.canUndo).toBe(false)
  })

  it('takes back adding, removing and renaming an entity', () => {
    const store = setup()
    const added = store.addEntity('the caravan', 'caravan')!
    store.undo()
    expect(store.entities.some((one) => one.id === added.id)).toBe(false)

    sendEast(store)
    const party = store.selectedId
    store.removeEntity(party)
    expect(store.entities).toHaveLength(0)

    store.undo()
    expect(store.selectedId).toBe(party)
    expect(store.start).toBe('0,0')
    expect(store.goal).toBe('4,0')

    store.renameEntity(party, 'the company')
    store.undo()
    expect(store.selectedEntity?.name).toBe('the party')
  })

  it('takes back a slider dragged through many values as one step', () => {
    const store = setup()
    const before = store.selectedEntity?.pacePerTurn
    store.setPace(store.selectedId, 1.5)
    store.setPace(store.selectedId, 2)
    store.setPace(store.selectedId, 2.5)

    store.undo()
    expect(store.selectedEntity?.pacePerTurn).toBe(before)
    expect(store.canUndo).toBe(false)
  })

  it('takes back a note typed a letter at a time as one step', () => {
    const store = setup()
    for (const text of ['a', 'an', 'an o', 'an old shrine']) store.setNote(here, text)

    store.undo()
    expect(store.notes.has(here)).toBe(false)
    store.redo()
    expect(store.notes.get(here)).toBe('an old shrine')
  })

  it('takes back events and locations added or removed', () => {
    const store = setup()
    const event = store.addEvent(here, { title: 'ambush', description: '' })!
    const location = store.addLocation(here, { name: 'Oakvale', kind: 'village', description: '' })!
    store.removeEvent(here, event)

    store.undo()
    expect(store.events.get(here)?.map((one) => one.id)).toEqual([event])
    store.undo()
    expect(store.locations.has(here)).toBe(false)
    store.redo()
    expect(store.locations.get(here)?.map((one) => one.id)).toEqual([location])
  })

  it('hands the save what the undo left behind', () => {
    const store = setup()
    sendEast(store)
    store.setNote(here, 'an old shrine')

    store.undo()
    store.undo()
    expect(store.snapshot.notes).toEqual([])
    expect(store.snapshot.queue).toEqual([])
  })

  it('forgets every step when the clock moves either way', () => {
    const store = setup()
    sendEast(store)
    store.advanceTurn()
    expect(store.canUndo).toBe(false)

    store.setNote(here, 'tracks')
    store.rewindTurn()
    expect(store.canUndo).toBe(false)

    store.setNote(here, 'more tracks')
    store.goToTurn(1)
    expect(store.canUndo).toBe(false)
  })

  it('forgets every step when a new world is laid down or a map is loaded', () => {
    const store = setup()
    store.setNote(here, 'an old shrine')
    const saved = store.snapshot

    store.setTerrain({ seed: TERRAIN_DEFAULTS.seed + 1 })
    expect(store.canUndo).toBe(false)

    store.addEvent(here, { title: 'ambush', description: '' })
    store.restore(saved)
    expect(store.canUndo).toBe(false)
    expect(store.canRedo).toBe(false)
  })
})

describe('encounter tables', () => {
  it('rolls from the defaults until the DM changes them', () => {
    const store = setup()
    const night = store.encounterTable('forest', 'night')
    expect(night.some((one) => one.id === 'forest.spiders')).toBe(true)
    expect(store.encounterTable('forest', 'day').some((one) => one.id === 'forest.spiders')).toBe(
      false,
    )

    store.setEncounter('forest.wolves', { weight: 9 })
    store.removeEncounter('forest.spiders')
    const id = store.addEncounter({
      terrain: 'forest',
      when: 'night',
      weight: 2,
      title: 'Headless rider',
      description: '',
    })

    const table = store.encounterTable('forest', 'night')
    expect(table.find((one) => one.id === 'forest.wolves')?.weight).toBe(9)
    expect(table.some((one) => one.id === 'forest.spiders')).toBe(false)
    expect(table.at(-1)?.id).toBe(id)

    store.resetEncounters('forest')
    expect(store.encounterOverrides).toEqual([])
    expect(store.encounterTable('forest', 'night')).toEqual(night)
  })

  it('turns away a weight that is not a weight', () => {
    const store = setup()
    store.setEncounter('forest.wolves', { weight: -2 })
    store.setEncounter('forest.wolves', { weight: Number.NaN })
    expect(store.encounterOverrides).toEqual([])
  })

  it('takes an override back with undo and puts it back with redo', () => {
    const store = setup()
    store.setEncounter('grass.wolves', { weight: 8 })
    const changed = store.encounterOverrides

    store.undo()
    expect(store.encounterOverrides).toEqual([])
    expect(
      store.encounterTable('grass', 'night').find((one) => one.id === 'grass.wolves')?.weight,
    ).toBe(3)

    store.redo()
    expect(store.encounterOverrides).toBe(changed)
  })

  it('leaves no undo step for an edit that changes nothing', () => {
    const store = setup()
    store.restoreEncounter('grass.wolves')
    store.setEncounter('nope', { weight: 3 })
    expect(store.canUndo).toBe(false)
  })

  it('rolls on the painted ground of a hex at the hour it is now', () => {
    const store = setup()
    store.setDmTool('paint')
    store.setPaintTerrain('forest')
    store.setBrushSize(0)
    store.click({ q: 1, r: 0 })

    const night = new Set(store.encounterTable('forest', 'night').map((one) => one.id))
    const day = new Set(store.encounterTable('forest', 'day').map((one) => one.id))
    const random = mulberry32(8)
    for (let i = 0; i < 100; i++) {
      expect(day.has(store.rollEncounterOn('1,0', random)!.entry.id)).toBe(true)
    }

    store.skipPhase()
    expect(store.clock.phase).toBe('night')
    for (let i = 0; i < 100; i++) {
      expect(night.has(store.rollEncounterOn('1,0', random)!.entry.id)).toBe(true)
    }
    expect(store.rollEncounterOn('99,99')).toBeNull()
  })

  it('writes an accepted encounter onto the hex as an event, undone in one step', () => {
    const store = setup()
    const { entry } = store.rollEncounterOn('0,0', () => 0)!

    store.acceptEncounter('0,0', entry)
    expect(store.events.get('0,0')).toEqual([
      { id: expect.any(String), title: entry.title, description: entry.description, turn: 0 },
    ])

    store.undo()
    expect(store.events.has('0,0')).toBe(false)
  })

  const encountersInLog = (store: Store): string[] =>
    store.adventureLog.flatMap((one) =>
      one.kind === 'encounter' ? [`${one.encounter.turn}:${one.encounter.title}`] : [],
    )

  it('logs an accepted encounter at the turn the crawl stands on', () => {
    const store = setup()
    sendEast(store, 3)
    store.advanceTurn()
    store.advanceTurn()
    const { entry } = store.rollEncounterOn('2,0', () => 0)!

    const id = store.acceptEncounter('2,0', entry)!

    expect(store.events.get('2,0')?.[0]).toMatchObject({ id, turn: 2 })
    expect(
      store.adventureLog.map((one) => (one.kind === 'turn' ? one.row.turn : one.encounter.id)),
    ).toEqual([0, 1, id])
    store.addEvent('2,0', { title: 'a shrine', description: '' })
    expect(encountersInLog(store)).toEqual([`2:${entry.title}`])
  })

  it('keeps an encounter over a rewind, and cuts it when the crawl goes another way', () => {
    const store = setup()
    sendEast(store, 3)
    store.advanceTurn()
    store.advanceTurn()
    const { entry } = store.rollEncounterOn('2,0', () => 0)!
    store.acceptEncounter('2,0', entry)

    store.rewindTurn()
    expect(encountersInLog(store)).toEqual([`2:${entry.title}`])
    store.goToTurn(2)
    expect(encountersInLog(store)).toEqual([`2:${entry.title}`])

    store.goToTurn(1)
    store.advanceTurn()
    expect(encountersInLog(store)).toEqual([])
    expect(store.events.has('2,0')).toBe(false)
  })

  it('keeps an encounter met on the turn a new order is given from', () => {
    const store = setup()
    sendEast(store, 3)
    store.advanceTurn()
    store.advanceTurn()
    const { entry } = store.rollEncounterOn('2,0', () => 0)!
    store.acceptEncounter('2,0', entry)

    store.select({ q: -2, r: 0 })
    store.advanceTurn()

    expect(encountersInLog(store)).toEqual([`2:${entry.title}`])
  })

  it('wipes the encounters met with the history, keeping the DM’s own events', () => {
    const store = setup()
    const { entry } = store.rollEncounterOn('0,0', () => 0)!
    store.acceptEncounter('0,0', entry)
    store.addEvent('0,0', { title: 'a shrine', description: '' })

    store.clearHistory()

    expect(store.events.get('0,0')?.map((one) => one.title)).toEqual(['a shrine'])
    expect(store.adventureLog).toEqual([])
  })

  it('comes back from a snapshot with the overrides it was saved with', () => {
    const store = setup()
    store.removeEncounter('water.pirates')
    const saved = store.snapshot

    setActivePinia(createPinia())
    const fresh = setup()
    fresh.restore(saved)
    expect(fresh.encounterOverrides).toEqual([{ kind: 'remove', id: 'water.pirates' }])
    expect(fresh.encounterTable('water', 'day').some((one) => one.id === 'water.pirates')).toBe(
      false,
    )
  })
})

describe('purses and levels', () => {
  it('start every party and npc with an empty purse at the first level', () => {
    const store = setup()
    const npc = store.addEntity('the hermit', 'npc', 'dm')!.id

    expect(store.characterOf(store.selectedId)).toEqual({ purse: 0, level: 1 })
    expect(store.characterOf(npc)).toEqual({ purse: 0, level: 1 })
    expect(store.snapshot.characters).toEqual([])
  })

  it('give caravans and ships neither, and turn edits to them away', () => {
    const store = setup()
    const wagon = store.addEntity('the wagon', 'caravan')!.id
    const ship = store.addEntity('the cog', 'ship')!.id

    store.setPurse(wagon, 50)
    store.setLevel(ship, 4)

    expect(store.characterOf(wagon)).toBeNull()
    expect(store.characterOf(ship)).toBeNull()
    expect(store.characterOf('nobody')).toBeNull()
    expect(store.characters.size).toBe(0)
  })

  it('keep whole coins and levels inside their limits', () => {
    const store = setup()
    const party = store.selectedId

    store.setPurse(party, -10)
    store.setLevel(party, 0)
    expect(store.characterOf(party)).toEqual({ purse: 0, level: 1 })

    store.setPurse(party, 1e12)
    store.setLevel(party, 7.6)
    expect(store.characterOf(party)).toEqual({ purse: PURSE_LIMITS.max, level: 8 })

    store.setLevel(party, 40)
    expect(store.characterOf(party)?.level).toBe(CHARACTER_LEVELS.max)
  })

  it('leave the caravan gold where it was', () => {
    const store = setup()
    const wagon = store.addEntity('the wagon', 'caravan')!.id
    store.setSupply(wagon, 'gold', 30)

    store.setPurse(store.selectedId, 5)

    expect(store.suppliesOf(wagon).gold).toBe(30)
  })

  it('take a run of edits back in one undo, and put it back with redo', () => {
    const store = setup()
    const party = store.selectedId
    store.setPurse(party, 1)
    store.setPurse(party, 12)
    store.setPurse(party, 120)
    store.setLevel(party, 5)

    store.undo()
    expect(store.characterOf(party)).toEqual({ purse: 120, level: 1 })
    store.undo()
    expect(store.characterOf(party)).toEqual({ purse: 0, level: 1 })
    expect(store.canUndo).toBe(false)

    store.redo()
    store.redo()
    expect(store.characterOf(party)).toEqual({ purse: 120, level: 5 })
  })

  it('leave no undo step for an edit that changes nothing', () => {
    const store = setup()
    store.setPurse(store.selectedId, -3)
    store.setLevel(store.selectedId, 1)
    expect(store.canUndo).toBe(false)
  })

  it('go with the entity they belong to, and come back with an undo', () => {
    const store = setup()
    const npc = store.addEntity('the hermit', 'npc')!.id
    store.setPurse(npc, 9)

    store.removeEntity(npc)
    expect(store.characters.has(npc)).toBe(false)

    store.undo()
    expect(store.characterOf(npc)).toEqual({ purse: 9, level: 1 })
  })

  it('are kept with the map', () => {
    const store = setup()
    const party = store.selectedId
    store.setPurse(party, 33)
    store.setLevel(party, 6)
    const saved = store.snapshot
    expect(saved.characters).toEqual([{ entityId: party, purse: 33, level: 6 }])

    setActivePinia(createPinia())
    const fresh = setup()
    fresh.restore(saved)

    expect(fresh.characterOf(party)).toEqual({ purse: 33, level: 6 })
    expect(fresh.snapshot.characters).toEqual(saved.characters)
  })
})

describe("the store's permissions", () => {
  /**
   * A table set up by the DM before the players take the screen: the party
   * riding the players' wagon, and the DM's bandits riding a hidden caravan.
   */
  const table = (store: Store) => {
    const party = store.selectedId
    const wagon = store.addEntity('the wagon', 'caravan')!.id
    const caravan = store.addEntity('the smugglers', 'caravan', 'dm')!.id
    const bandits = store.addEntity('the bandits', 'party', 'dm')!.id
    const scout = store.addEntity('the scout')!.id
    const lookout = store.addEntity('the lookout', 'party', 'dm')!.id

    const putDown = (id: string, at: Axial, boarding?: Axial): void => {
      store.selectEntity(id)
      store.select(at)
      if (boarding) store.select(boarding)
    }
    putDown(wagon, { q: 0, r: 0 })
    putDown(party, { q: 2, r: 0 }, { q: 0, r: 0 })
    putDown(caravan, { q: -3, r: 0 })
    putDown(bandits, { q: -3, r: 2 }, { q: -3, r: 0 })
    store.advanceTurn()
    store.advanceTurn()
    store.selectEntity(party)

    const rope = store.addItem(party, { name: 'rope' })!.id
    const loot = store.addItem(bandits, { name: 'loot', quantity: 5 })!.id
    const merchant = store.addMerchant(caravan, 'smith', 'Hild', 1)!.id
    // A step to undo and a step to redo.
    store.setNote('1,1', 'a well')
    store.setNote('2,2', 'a cairn')
    store.undo()
    store.setDmTool('paint')
    store.setPaintTerrain('forest')

    store.dmView = false
    return { party, wagon, caravan, bandits, scout, lookout, rope, loot, merchant }
  }

  type Table = ReturnType<typeof table>

  /** Everything a call could change, shared or not. */
  const state = (store: Store) => ({
    saved: store.snapshot,
    field: store.field,
    dmTool: store.dmTool,
    brushSize: store.brushSize,
    paintTerrain: store.paintTerrain,
    fogMode: store.fogMode,
    roadErase: store.roadErase,
    roadTail: store.roadTail,
    canUndo: store.canUndo,
    canRedo: store.canRedo,
  })

  // A forbidden call, and whatever the DM does first to give it something to change.
  type Case = [
    name: string,
    act: (store: Store, its: Table) => unknown,
    prepare?: (store: Store, its: Table) => unknown,
  ]

  const grassEncounter = (store: Store): string => store.encounterTable('grass', 'day')[0].id
  const oakvale = { name: 'Oakvale', kind: 'village', description: '' } as const

  const FORBIDDEN: Record<string, Case[]> = {
    place: [
      ['place', (s, t) => s.place(t.party, '1,1')],
      ['select', (s) => s.select({ q: 1, r: 1 }), (s, t) => s.selectEntity(t.lookout)],
      ['click', (s) => s.click({ q: 1, r: 1 }), (s, t) => s.selectEntity(t.lookout)],
    ],
    order: [
      ['queueAction', (s, t) => s.queueAction(t.caravan, { kind: 'wait' })],
      ['select', (s) => s.select({ q: -4, r: 0 }), (s, t) => s.selectEntity(t.caravan)],
      ['click', (s) => s.click({ q: -4, r: 0 }), (s, t) => s.selectEntity(t.caravan)],
      ['clear', (s) => s.clear(), (s, t) => s.selectEntity(t.caravan)],
      ['removeWaypoint', (s) => s.removeWaypoint(0), (s, t) => s.selectEntity(t.caravan)],
    ],
    renameEntity: [['renameEntity', (s, t) => s.renameEntity(t.caravan, 'the friends')]],
    recolorEntity: [['recolorEntity', (s, t) => s.recolorEntity(t.caravan, '#ff0000')]],
    editInventory: [
      ['addItem', (s, t) => s.addItem(t.bandits, { name: 'knife' })],
      ['editItem', (s, t) => s.editItem(t.loot, { name: 'gold' })],
      ['removeItem', (s, t) => s.removeItem(t.loot)],
    ],
    transferItem: [['transferItem', (s, t) => s.transferItem(t.loot, t.caravan, 2)]],
    editCharacter: [
      ['setPurse', (s, t) => s.setPurse(t.bandits, 40)],
      ['setLevel', (s, t) => s.setLevel(t.lookout, 5)],
    ],
    addEntity: [
      ['addEntity', (s) => s.addEntity('the stranger')],
      ['seatPlayer', (s) => s.seatPlayer('Mira')],
    ],
    removeEntity: [['removeEntity', (s, t) => s.removeEntity(t.party)]],
    entitySettings: [
      ['setPace', (s, t) => s.setPace(t.party, 2)],
      ['setEntitySight', (s, t) => s.setEntitySight(t.party, 9)],
      ['setDarkvision', (s, t) => s.setDarkvision(t.party, true)],
      ['setPortrait', (s, t) => s.setPortrait(t.wagon, 'night-camp')],
      ['setPlayerReachCapped', (s) => s.setPlayerReachCapped(false)],
    ],
    clock: [
      ['advanceTurn', (s) => s.advanceTurn()],
      ['rewindTurn', (s) => s.rewindTurn()],
      ['goToTurn', (s) => s.goToTurn(0)],
      ['skipPhase', (s) => s.skipPhase()],
    ],
    supplies: [['setSupply', (s, t) => s.setSupply(t.wagon, 'food', 5)]],
    abilities: [['setAbility', (s, t) => s.setAbility(t.bandits, 'strength', 18)]],
    merchants: [
      ['addMerchant', (s, t) => s.addMerchant(t.caravan, 'cook')],
      ['removeMerchant', (s, t) => s.removeMerchant(t.merchant)],
      ['renameMerchant', (s, t) => s.renameMerchant(t.merchant, 'Brand')],
      ['setMerchantLevel', (s, t) => s.setMerchantLevel(t.merchant, 3)],
      ['editCatalogEntry', (s) => s.editCatalogEntry('smith.sharpen', { price: '1 gp' })],
      ['removeCatalogEntry', (s) => s.removeCatalogEntry('smith.sharpen')],
      ['addCatalogEntry', (s) => s.addCatalogEntry('cook')],
      [
        'resetCatalogEntry',
        (s) => s.resetCatalogEntry('smith.sharpen'),
        (s) => s.editCatalogEntry('smith.sharpen', { price: '1 gp' }),
      ],
    ],
    fog: [
      ['setFogMode', (s) => s.setFogMode('hide')],
      ['setRevealed', (s) => s.setRevealed(true)],
    ],
    terrain: [
      ['setField', (s) => s.setField(fieldFromTiles(flatField(2)))],
      ['setTiles', (s) => s.setTiles(flatField(2))],
      ['setTerrain', (s) => s.setTerrain({ seed: 7 })],
      ['setTerrain style', (s) => s.setTerrain({ style: 'archipelago' })],
      ['reseed', (s) => s.reseed()],
      ['setWorldRadius', (s) => s.setWorldRadius(20)],
      ['setWorldSize', (s) => s.setWorldSize('small')],
      ['setPaintTerrain', (s) => s.setPaintTerrain('water')],
    ],
    roads: [
      ['setRoadErase', (s) => s.setRoadErase(true)],
      [
        'finishRoad',
        (s) => s.finishRoad(),
        (s) => {
          s.setDmTool('road')
          s.click({ q: 1, r: 1 })
        },
      ],
    ],
    mapTools: [
      ['setDmTool', (s) => s.setDmTool('fog')],
      ['setBrushSize', (s) => s.setBrushSize(3)],
      [
        'a brush stroke',
        (s) => {
          s.startStroke({ q: 3, r: 0 })
          s.continueStroke({ q: 4, r: 0 })
          s.endStroke()
        },
      ],
    ],
    resources: [
      ['addResource', (s) => s.addResource('1,1', 'timber')],
      [
        'removeResource',
        (s) => s.removeResource(s.resources[0].id),
        (s) => s.addResource('1,1', 'timber'),
      ],
      ['generateResources', (s) => s.generateResources(1), (s) => s.setResourceChance('grass', 1)],
      ['setResourceChance', (s) => s.setResourceChance('grass', 0.9)],
      ['setResourceSpacing', (s) => s.setResourceSpacing(RESOURCE_SPACING_LIMITS.min)],
    ],
    notes: [['setNote', (s) => s.setNote('3,3', 'a ruin')]],
    locations: [
      ['addLocation', (s) => s.addLocation('1,1', oakvale)],
      [
        'removeLocation',
        (s) => s.removeLocation('1,1', s.locations.get('1,1')![0].id),
        (s) => s.addLocation('1,1', oakvale),
      ],
    ],
    events: [
      ['addEvent', (s) => s.addEvent('1,1', { title: 'ambush', description: '' })],
      [
        'removeEvent',
        (s) => s.removeEvent('1,1', s.events.get('1,1')![0].id),
        (s) => s.addEvent('1,1', { title: 'ambush', description: '' }),
      ],
    ],
    encounters: [
      ['acceptEncounter', (s) => s.acceptEncounter('1,1', s.encounters[0])],
      ['setEncounter', (s) => s.setEncounter(grassEncounter(s), { weight: 99 })],
      ['removeEncounter', (s) => s.removeEncounter(grassEncounter(s))],
      [
        'restoreEncounter',
        (s) => s.restoreEncounter('grass.wolves'),
        (s) => s.removeEncounter('grass.wolves'),
      ],
      [
        'addEncounter',
        (s) =>
          s.addEncounter({
            terrain: 'grass',
            when: 'any',
            weight: 1,
            title: 'a fox',
            description: '',
          }),
      ],
      [
        'resetEncounters',
        (s) => s.resetEncounters('grass'),
        (s) => s.removeEncounter(grassEncounter(s)),
      ],
    ],
    maps: [['restore', (s) => s.restore({ ...s.snapshot, notes: [], turn: 0 })]],
    clearHistory: [['clearHistory', (s) => s.clearHistory()]],
    undo: [
      ['undo', (s) => s.undo()],
      ['redo', (s) => s.redo()],
    ],
  }

  const cases = Object.entries(FORBIDDEN).flatMap(([group, list]) =>
    list.map(([name, act, prepare]) => [group, name, act, prepare] as const),
  )

  it.each(cases)('%s: a player calling %s changes nothing', (_, __, act, prepare) => {
    const store = setup()
    const its = table(store)
    if (prepare) store.actAs(DM, () => prepare(store, its))
    const before = state(store)

    act(store, its)

    expect(state(store)).toEqual(before)
  })

  it.each(cases)('%s: the DM calling %s still changes something', (_, __, act, prepare) => {
    const store = setup()
    const its = table(store)
    store.dmView = true
    prepare?.(store, its)
    const before = state(store)

    act(store, its)

    expect(state(store)).not.toEqual(before)
  })

  it('rolls no encounter for a player', () => {
    const store = setup()
    table(store)
    expect(store.rollEncounterOn('0,0', () => 0)).toBeNull()
    store.dmView = true
    expect(store.rollEncounterOn('0,0', () => 0)).not.toBeNull()
  })

  it('lets a player order their own party, by click or by call', () => {
    const store = setup()
    const { party } = table(store)

    store.click({ q: 1, r: 0 })
    expect(store.goal).toBe('1,0')
    store.clear()
    expect(store.goal).toBeNull()
    store.queueAction(party, { kind: 'camp' })
    expect(store.queue.get(party)).toEqual({ kind: 'camp' })
  })

  it('gives an order rather than working the ground, whatever tool the DM left in hand', () => {
    const store = setup()
    table(store)
    expect(store.dmTool).toBe('paint')

    store.click({ q: 1, r: 0 })

    expect(store.terrainOverrides.size).toBe(0)
    expect(store.goal).toBe('1,0')
  })

  it('lets a player rename their own party and keep its inventory', () => {
    const store = setup()
    const { party, rope } = table(store)

    store.renameEntity(party, 'the company')
    const torch = store.addItem(party, { name: 'torch' })!.id
    store.editItem(rope, { quantity: 3 })
    store.removeItem(torch)

    expect(store.entities.find((one) => one.id === party)?.name).toBe('the company')
    expect(store.itemsOf(party)).toMatchObject([{ id: rope, quantity: 3 }])
  })

  it("lets a player set their own party's scores", () => {
    const store = setup()
    const { party } = table(store)

    store.setAbility(party, 'dexterity', 15)

    expect(store.abilitiesOf(party)?.dexterity).toBe(15)
  })

  it('lets a player set the purse and level of their own parties', () => {
    const store = setup()
    const { party, scout } = table(store)

    store.setPurse(party, 25)
    store.setLevel(scout, 4)

    expect(store.characterOf(party)).toEqual({ purse: 25, level: 1 })
    expect(store.characterOf(scout)).toEqual({ purse: 0, level: 4 })
  })

  it('lets a player recolour their own party, to a colour and nothing else', () => {
    const store = setup()
    const { party } = table(store)

    store.recolorEntity(party, '#A0B1C2')
    store.recolorEntity(party, 'red')

    expect(store.entities.find((one) => one.id === party)?.color).toBe('#a0b1c2')
  })

  it('falls back to an entity the player can see, never one the DM hid', () => {
    const store = setup()
    const spy = store.addEntity('the spy', 'npc', 'dm')!
    store.entities = [spy, ...store.entities.filter((one) => one.id !== spy.id)]
    store.selectEntity('')
    expect(store.selectedEntity?.id).toBe(spy.id)

    store.dmView = false
    expect(store.selectedEntity?.hidden).toBe(false)
  })

  it('lets a player hand things to the wagon they ride in', () => {
    const store = setup()
    const { party, wagon, rope } = table(store)

    store.transferItem(rope, wagon, 1)

    expect(store.itemsOf(party)).toEqual([])
    expect(store.itemsOf(wagon).map((one) => one.name)).toEqual(['rope'])
  })

  it('judges a call made as somebody else by who they are, not by the view', () => {
    const store = setup()
    const { party, caravan } = table(store)
    store.dmView = true

    store.actAs(PLAYER, () => {
      store.renameEntity(caravan, 'the friends')
      store.renameEntity(party, 'the company')
      store.setDmTool('select')
      store.click({ q: 1, r: 0 })
    })

    expect(store.entities.find((one) => one.id === caravan)?.name).toBe('the smugglers')
    expect(store.entities.find((one) => one.id === party)?.name).toBe('the company')
    expect(store.dmTool).toBe('paint')
    expect(store.goal).toBe('1,0')
    expect(store.terrainOverrides.size).toBe(0)
    expect(store.viewer).toEqual(DM)
  })

  it('follows the view switch, which anyone may turn', () => {
    const store = setup()
    table(store)
    expect(store.viewer).toEqual(PLAYER)
    store.dmView = true
    expect(store.viewer).toEqual(DM)
  })
})

describe('the fog as each view draws it', () => {
  it("follows the DM's switch in the DM view only", () => {
    const store = setup()
    store.fog = false
    expect(store.fogShown).toBe(false)

    store.dmView = false
    expect(store.fogShown).toBe(true)
  })

  it('lifts off the player view once the DM reveals the map', () => {
    const store = setup()
    store.setRevealed(true)
    expect(store.snapshot.revealed).toBe(true)
    store.dmView = false
    expect(store.fogShown).toBe(false)

    store.dmView = true
    store.undo()
    store.dmView = false
    expect(store.fogShown).toBe(true)
  })

  it('lets the DM see through the fog, and never the players', () => {
    const store = setup()
    store.fogSeeThrough = true
    expect(store.seeThrough).toBe(true)
    expect(store.drawnView.fog).toBe(false)

    store.fog = false
    expect(store.seeThrough).toBe(false)
    store.fog = true

    store.dmView = false
    expect(store.seeThrough).toBe(false)
    expect(store.drawnView.fog).toBe(true)
  })

  it('counts no hex the DM has hidden as explored', () => {
    const store = setup()
    store.select({ q: 0, r: 0 })
    const seen = store.exploredCount
    expect(seen).toBeGreaterThan(1)

    store.setDmTool('fog')
    store.setFogMode('hide')
    store.click({ q: 0, r: 0 })

    const hidden = range({ q: 0, r: 0 }, store.brushSize).filter((hex) =>
      store.explored.has(hexKey(hex)),
    )
    expect(hidden.length).toBeGreaterThan(0)
    expect(store.exploredCount).toBe(seen - hidden.length)
    expect(store.explored.size).toBe(seen)
  })
})
