import { Color3 } from '@babylonjs/core/Maths/math.color'
import { describe, expect, it } from 'vitest'
import { distance, hexKey, range, type Axial, type HexKey } from '../hex/coords'
import { createLayout } from '../hex/layout'
import { createTerrain, type TerrainTile } from './terrain'
import {
  CLIMB_MULTIPLIER,
  CLIMB_THRESHOLD,
  KM_PER_HEX,
  canEnter,
  chainRoute,
  findRoute,
  isCoast,
  joinLegs,
  RIVER_CROSSING_KM,
  RIVERS_SLOW,
  ROADS_GRADED,
  shoreOf,
  stepCostKm,
  stepKmOn,
} from './travel'
import { fieldFromTiles } from './field'
import type { Rivers } from './rivers'
import { withRoad } from './roads'

// The number is the mechanical level; the rendered height is derived from it so
// nothing here can lean on the rendered number by accident.
const tile = (hex: Axial, level: number): TerrainTile => ({
  hex,
  terrain: 'grass',
  height: level,
  level,
  elevation: 0.5 + level,
  color: new Color3(0, 0, 0),
})

// Water is anything below sea level: negative height, the ground floor, and a
// flat sea-floor elevation.
const water = (hex: Axial): TerrainTile => ({
  hex,
  terrain: 'water',
  height: -0.5,
  level: 0,
  elevation: 0.3,
  color: new Color3(0, 0, 0),
})

const mapOf = (entries: [Axial, number][]): Map<HexKey, TerrainTile> =>
  new Map(entries.map(([hex, level]) => [hexKey(hex), tile(hex, level)]))

const flatField = (radius: number, level = 1): Map<HexKey, TerrainTile> =>
  mapOf(range({ q: 0, r: 0 }, radius).map((hex) => [hex, level] as [Axial, number]))

describe('stepCostKm', () => {
  const step = (from: number, to: number): number =>
    stepCostKm(tile({ q: 0, r: 0 }, from), tile({ q: 1, r: 0 }, to))

  it('charges one hex for level ground', () => {
    expect(step(2, 2)).toBe(KM_PER_HEX)
  })

  it('charges plain distance for a descent', () => {
    expect(step(5, 1)).toBe(KM_PER_HEX)
  })

  it('reads the level and not the rendered height', () => {
    const low = { ...tile({ q: 0, r: 0 }, 2), elevation: 0.5 }
    const towering = { ...tile({ q: 1, r: 0 }, 2), elevation: 40 }
    expect(stepCostKm(low, towering)).toBe(KM_PER_HEX)
  })

  it('charges double once the rise reaches the threshold', () => {
    expect(step(2, 2 + CLIMB_THRESHOLD)).toBe(KM_PER_HEX * CLIMB_MULTIPLIER)
    expect(step(2, 20)).toBe(KM_PER_HEX * CLIMB_MULTIPLIER)
  })

  it('charges the same for any climb past the threshold, however steep', () => {
    expect(step(1, 1 + CLIMB_THRESHOLD)).toBe(step(1, 400))
  })

  it('lets a party wade ashore at the plain rate', () => {
    // Water and the beach share the ground floor, so coming out is not a climb.
    expect(stepCostKm(water({ q: 0, r: 0 }), tile({ q: 1, r: 0 }, 0))).toBe(KM_PER_HEX)
  })
})

describe('roads', () => {
  const low = tile({ q: 0, r: 0 }, 1)
  const high = tile({ q: 1, r: 0 }, 1 + CLIMB_THRESHOLD)

  it('grade a climb down to one hex', () => {
    expect(stepCostKm(low, high, 'land', true)).toBe(KM_PER_HEX)
    expect(stepKmOn(withRoad(new Set(), [low.hex, high.hex]), low, high)).toBe(KM_PER_HEX)
    expect(stepKmOn(new Set(), low, high)).toBe(KM_PER_HEX * CLIMB_MULTIPLIER)
  })

  it('never make a hex shorter than a hex', () => {
    expect(stepCostKm(low, tile({ q: 1, r: 0 }, 1), 'land', true)).toBe(KM_PER_HEX)
  })

  it('mean nothing afloat', () => {
    expect(ROADS_GRADED.sea).toBe(false)
    expect(stepCostKm(water({ q: 0, r: 0 }), water({ q: 1, r: 0 }), 'sea', true)).toBe(KM_PER_HEX)
  })

  // The ridge that is cheaper to walk around than to climb, with a road over it.
  const ridge = (): Map<HexKey, TerrainTile> => {
    const tiles = flatField(6)
    for (const [q, level] of [
      [1, 3],
      [2, 6],
      [3, 9],
    ]) {
      tiles.set(hexKey({ q, r: 0 }), tile({ q, r: 0 }, level))
    }
    return tiles
  }
  const over = Array.from({ length: 5 }, (_, q) => ({ q, r: 0 }))

  it('pull a route over a climb it would otherwise walk around', () => {
    const roads = withRoad(new Set(), over)
    const route = findRoute(fieldFromTiles(ridge()), { q: 0, r: 0 }, { q: 4, r: 0 }, { roads })!
    expect(route.hexes).toEqual(over)
    expect(route.km).toBe(4 * KM_PER_HEX)
  })

  it('win a tie between routes of the same length', () => {
    const detour = [
      { q: 0, r: 0 },
      { q: 0, r: 1 },
      { q: 1, r: 1 },
      { q: 2, r: 1 },
      { q: 3, r: 0 },
    ]
    const roads = withRoad(new Set(), detour)
    const route = findRoute(fieldFromTiles(flatField(6)), { q: 0, r: 0 }, { q: 3, r: 0 }, { roads })
    // Four hexes on the road against three off it: longer is longer, road or not.
    expect(route!.steps).toBe(3)

    const level = withRoad(new Set(), detour.slice(1, 4))
    const tied = findRoute(
      fieldFromTiles(flatField(6)),
      { q: 0, r: 1 },
      { q: 3, r: 0 },
      {
        roads: level,
      },
    )!
    expect(tied.km).toBe(3 * KM_PER_HEX)
    expect(tied.hexes).toEqual(detour.slice(1))
  })
})

describe('rivers', () => {
  const here = tile({ q: 0, r: 0 }, 1)
  const there = tile({ q: 1, r: 0 }, 1)
  const beyond = tile({ q: 2, r: 0 }, 1)
  // Through `there` from north to south, square across the way east.
  const river: Rivers = withRoad(new Set(), [{ q: 1, r: -1 }, there.hex, { q: 1, r: 1 }])

  it('charge a hex more to step into a river hex, and nothing to step out', () => {
    expect(RIVER_CROSSING_KM).toBe(KM_PER_HEX)
    expect(stepKmOn(new Set(), here, there, 'land', river)).toBe(KM_PER_HEX + RIVER_CROSSING_KM)
    expect(stepKmOn(new Set(), there, beyond, 'land', river)).toBe(KM_PER_HEX)
  })

  it('charge nothing more to follow the river', () => {
    expect(stepKmOn(new Set(), tile({ q: 1, r: -1 }, 1), there, 'land', river)).toBe(KM_PER_HEX)
  })

  it('add the ford on top of a climb', () => {
    const high = tile({ q: 1, r: 0 }, 1 + CLIMB_THRESHOLD)
    expect(stepCostKm(here, high, 'land', false, true)).toBe(
      KM_PER_HEX * CLIMB_MULTIPLIER + RIVER_CROSSING_KM,
    )
  })

  it('are crossed at no extra cost on a bridge, a road into the river hex', () => {
    const roads = withRoad(new Set(), [here.hex, there.hex])
    expect(stepKmOn(roads, here, there, 'land', river)).toBe(KM_PER_HEX)
  })

  it('mean nothing afloat', () => {
    expect(RIVERS_SLOW.sea).toBe(false)
    expect(stepCostKm(water(here.hex), water(there.hex), 'sea', false, true)).toBe(KM_PER_HEX)
  })

  // Down the whole of row 1, so getting from row 0 to row 2 means fording it.
  const barrier = (): Rivers =>
    withRoad(
      new Set(),
      Array.from({ length: 15 }, (_, i) => ({ q: i - 7, r: 1 })),
    )

  it('charge a route that has to ford for the crossing', () => {
    const route = findRoute(
      fieldFromTiles(flatField(6)),
      { q: 1, r: 0 },
      { q: 1, r: 1 },
      {
        rivers: barrier(),
      },
    )!
    expect(route.hexes).toEqual([
      { q: 1, r: 0 },
      { q: 1, r: 1 },
    ])
    expect(route.km).toBe(KM_PER_HEX + RIVER_CROSSING_KM)
  })

  it('cost nothing more down the river once in it', () => {
    const route = findRoute(
      fieldFromTiles(flatField(6)),
      { q: 0, r: 1 },
      { q: 3, r: 1 },
      {
        rivers: barrier(),
      },
    )!
    expect(route.km).toBe(3 * KM_PER_HEX)
  })

  it('cross at the plain rate where a road bridges them', () => {
    const roads = withRoad(new Set(), [
      { q: 1, r: 0 },
      { q: 1, r: 1 },
    ])
    const route = findRoute(
      fieldFromTiles(flatField(6)),
      { q: 1, r: 0 },
      { q: 1, r: 1 },
      {
        rivers: barrier(),
        roads,
      },
    )!
    expect(route.km).toBe(KM_PER_HEX)
  })

  it('pull a route onto the bridge rather than the ford beside it', () => {
    const roads = withRoad(new Set(), [
      { q: 2, r: 0 },
      { q: 2, r: 1 },
    ])
    const route = findRoute(
      fieldFromTiles(flatField(6)),
      { q: 2, r: -1 },
      { q: 2, r: 2 },
      {
        rivers: barrier(),
        roads,
      },
    )!
    expect(route.km).toBe(3 * KM_PER_HEX)
    expect(route.hexes).toContainEqual({ q: 2, r: 1 })
  })
})

describe('findRoute', () => {
  it('costs ten kilometres per hex across flat ground', () => {
    const route = findRoute(fieldFromTiles(flatField(6)), { q: 0, r: 0 }, { q: 4, r: 0 })!
    expect(route.steps).toBe(4)
    expect(route.km).toBe(40)
    expect(route.hexes).toHaveLength(5)
  })

  it('counts hexes entered, not hexes occupied', () => {
    const route = findRoute(fieldFromTiles(flatField(4)), { q: 0, r: 0 }, { q: 2, r: 0 })!
    expect(route.hexes).toHaveLength(route.steps + 1)
  })

  it('costs nothing to stand still', () => {
    const route = findRoute(fieldFromTiles(flatField(3)), { q: 0, r: 0 }, { q: 0, r: 0 })!
    expect(route.km).toBe(0)
    expect(route.steps).toBe(0)
  })

  it('charges double for every climbing step', () => {
    // A staircase rising a full threshold per hex along +q.
    const tiles = mapOf(
      range({ q: 0, r: 0 }, 6).map((hex) => [hex, 1 + hex.q * CLIMB_THRESHOLD] as [Axial, number]),
    )
    const uphill = findRoute(fieldFromTiles(tiles), { q: 0, r: 0 }, { q: 3, r: 0 })!
    expect(uphill.km).toBe(3 * KM_PER_HEX * CLIMB_MULTIPLIER)

    const downhill = findRoute(fieldFromTiles(tiles), { q: 3, r: 0 }, { q: 0, r: 0 })!
    expect(downhill.km).toBe(3 * KM_PER_HEX)
  })

  // A single ridge is cheap to cross, because only the one climbing step
  // doubles; contouring only wins against a sustained climb.
  it('contours around a sustained climb instead of going over it', () => {
    const tiles = flatField(6)
    for (const [q, elevation] of [
      [1, 3],
      [2, 6],
      [3, 9],
    ]) {
      tiles.set(hexKey({ q, r: 0 }), tile({ q, r: 0 }, elevation))
    }

    const route = findRoute(fieldFromTiles(tiles), { q: 0, r: 0 }, { q: 4, r: 0 })!
    expect(route.hexes.some((h) => h.r === 0 && h.q >= 1 && h.q <= 3)).toBe(false)
    // Five level hexes at 10km beats four hexes with three climbs at 70km.
    expect(route.km).toBe(50)
    expect(route.steps).toBe(5)
  })

  it('crosses a single ridge rather than walking around it', () => {
    const tiles = flatField(8)
    for (const hex of [...tiles.values()].map((t) => t.hex).filter((h) => h.q === 2)) {
      tiles.set(hexKey(hex), tile(hex, 9))
    }
    const route = findRoute(fieldFromTiles(tiles), { q: 0, r: 0 }, { q: 4, r: 0 })!
    expect(route.steps).toBe(4)
    expect(route.km).toBe(50)
  })

  it('climbs anyway when going around costs more', () => {
    // The same ridge, now sealing off every way round.
    const tiles = mapOf(
      range({ q: 0, r: 0 }, 8).map((hex) => [hex, hex.q === 2 ? 9 : 1] as [Axial, number]),
    )
    const route = findRoute(fieldFromTiles(tiles), { q: 0, r: 0 }, { q: 4, r: 0 })!
    expect(route.hexes.some((h) => h.q === 2)).toBe(true)
  })

  it('never costs less than the flat distance', () => {
    const layout = createLayout(2)
    const terrain = createTerrain(layout, { seed: 5 })
    const tiles = new Map(
      range({ q: 0, r: 0 }, 12).map((hex) => [hexKey(hex), terrain(hex)] as const),
    )

    // Real terrain mixes land and sea, so some pairs suit only one movement.
    let checked = 0
    for (const movement of ['land', 'sea'] as const) {
      for (const [start, goal] of [
        [
          { q: 0, r: 0 },
          { q: 8, r: -4 },
        ],
        [
          { q: 0, r: 0 },
          { q: -6, r: 2 },
        ],
        [
          { q: 0, r: 0 },
          { q: 3, r: 7 },
        ],
        [
          { q: 8, r: -4 },
          { q: -6, r: 2 },
        ],
        [
          { q: 3, r: 7 },
          { q: -6, r: 2 },
        ],
      ]) {
        const route = findRoute(fieldFromTiles(tiles), start, goal, { movement })
        if (!route) continue
        checked++
        expect(route.km).toBeGreaterThanOrEqual(route.steps * KM_PER_HEX)
        expect(route.km).toBeLessThanOrEqual(route.steps * KM_PER_HEX * CLIMB_MULTIPLIER)
      }
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('returns null when an endpoint is off the map', () => {
    const tiles = flatField(3)
    expect(findRoute(fieldFromTiles(tiles), { q: 0, r: 0 }, { q: 40, r: 0 })).toBeNull()
    expect(findRoute(fieldFromTiles(tiles), { q: 40, r: 0 }, { q: 0, r: 0 })).toBeNull()
  })

  it('stays inside the mapped area', () => {
    const tiles = flatField(5)
    const route = findRoute(fieldFromTiles(tiles), { q: -4, r: 0 }, { q: 4, r: 0 })!
    for (const hex of route.hexes) expect(tiles.has(hexKey(hex))).toBe(true)
  })
})

describe('land movement', () => {
  // A channel along q = 2 splitting the map, with dry land either side.
  const channel = (): Map<HexKey, TerrainTile> => {
    const tiles = flatField(6)
    for (const hex of [...tiles.values()].map((t) => t.hex).filter((h) => h.q === 2)) {
      tiles.set(hexKey(hex), water(hex))
    }
    return tiles
  }

  it('refuses to cross water', () => {
    expect(findRoute(fieldFromTiles(channel()), { q: 0, r: 0 }, { q: 4, r: 0 })).toBeNull()
  })

  it('refuses a route that starts or ends in water', () => {
    const tiles = channel()
    expect(findRoute(fieldFromTiles(tiles), { q: 2, r: 0 }, { q: 0, r: 0 })).toBeNull()
    expect(findRoute(fieldFromTiles(tiles), { q: 0, r: 0 }, { q: 2, r: 0 })).toBeNull()
  })

  it('walks around a lake rather than through it', () => {
    // A single water hex directly between the endpoints.
    const tiles = flatField(6)
    tiles.set(hexKey({ q: 1, r: 0 }), water({ q: 1, r: 0 }))

    const route = findRoute(fieldFromTiles(tiles), { q: 0, r: 0 }, { q: 2, r: 0 })!
    expect(route.hexes.some((h) => h.q === 1 && h.r === 0)).toBe(false)
    expect(route.steps).toBe(3)
  })
})

describe('sea movement', () => {
  // Open sea from q = 1 eastward, land to the west: q = 0 is the coast and
  // anything further west is inland.
  const shore = (landLevel = 1): Map<HexKey, TerrainTile> => {
    const tiles = flatField(6, landLevel)
    for (const hex of [...tiles.values()].map((t) => t.hex).filter((h) => h.q >= 1)) {
      tiles.set(hexKey(hex), water(hex))
    }
    return tiles
  }
  const sail = { movement: 'sea' } as const

  it('tells the coast from inland and from the sea', () => {
    const field = fieldFromTiles(shore())
    expect(isCoast(field, field.at({ q: 0, r: 0 })!)).toBe(true)
    expect(isCoast(field, field.at({ q: -1, r: 0 })!)).toBe(false)
    expect(isCoast(field, field.at({ q: 1, r: 0 })!)).toBe(false)
  })

  it('names the shore a hex sits on', () => {
    const field = fieldFromTiles(shore())
    expect(shoreOf(field, field.at({ q: 1, r: 0 })!)).toBe('water')
    expect(shoreOf(field, field.at({ q: 0, r: 0 })!)).toBe('coast')
    expect(shoreOf(field, field.at({ q: -1, r: 0 })!)).toBe('inland')
  })

  it('lets a ship onto water and coast but not inland', () => {
    const field = fieldFromTiles(shore())
    expect(canEnter(field, field.at({ q: 1, r: 0 })!, 'sea')).toBe(true)
    expect(canEnter(field, field.at({ q: 0, r: 0 })!, 'sea')).toBe(true)
    expect(canEnter(field, field.at({ q: -1, r: 0 })!, 'sea')).toBe(false)
    expect(canEnter(field, field.at({ q: 1, r: 0 })!, 'land')).toBe(false)
    expect(canEnter(field, field.at({ q: -1, r: 0 })!, 'land')).toBe(true)
  })

  it('sails out from the coast across open water', () => {
    const route = findRoute(fieldFromTiles(shore()), { q: 0, r: 0 }, { q: 4, r: 0 }, sail)!
    expect(route.steps).toBe(4)
    expect(route.km).toBe(4 * KM_PER_HEX)
  })

  it('refuses to sail inland', () => {
    const field = fieldFromTiles(shore())
    expect(findRoute(field, { q: 4, r: 0 }, { q: -2, r: 0 }, sail)).toBeNull()
    expect(findRoute(field, { q: -2, r: 0 }, { q: 4, r: 0 }, sail)).toBeNull()
  })

  it('keeps every hex of a voyage on water or coast', () => {
    const field = fieldFromTiles(shore())
    const route = findRoute(field, { q: 0, r: -4 }, { q: 0, r: 4 }, sail)!
    for (const hex of route.hexes) expect(canEnter(field, field.at(hex)!, 'sea')).toBe(true)
  })

  it('puts in under a cliff without paying for the climb', () => {
    const tiles = shore(9)
    expect(stepCostKm(water({ q: 1, r: 0 }), tiles.get(hexKey({ q: 0, r: 0 }))!, 'sea')).toBe(
      KM_PER_HEX,
    )
    const route = findRoute(fieldFromTiles(tiles), { q: 3, r: 0 }, { q: 0, r: 0 }, sail)!
    expect(route.km).toBe(3 * KM_PER_HEX)
  })

  it('finds the shortest way round an island', () => {
    // A highland island: its heart is inland, its rim is coast a ship can touch.
    const tiles = mapOf([])
    for (const hex of range({ q: 0, r: 0 }, 8)) tiles.set(hexKey(hex), water(hex))
    for (const hex of range({ q: 0, r: 0 }, 1)) tiles.set(hexKey(hex), tile(hex, 4))

    const route = findRoute(fieldFromTiles(tiles), { q: -4, r: 0 }, { q: 4, r: 0 }, sail)!
    expect(route.hexes.some((h) => h.q === 0 && h.r === 0)).toBe(false)
    // The straight line runs through the heart, so one hex of detour is the best there is.
    expect(route.steps).toBe(distance({ q: -4, r: 0 }, { q: 4, r: 0 }) + 1)
    expect(route.km).toBe(route.steps * KM_PER_HEX)
  })

  it('keeps a land party off the sea a ship can cross', () => {
    expect(findRoute(fieldFromTiles(shore()), { q: 0, r: 0 }, { q: 4, r: 0 })).toBeNull()
  })
})

describe('chainRoute', () => {
  const origin = { q: 0, r: 0 }

  it('has no legs for no stops, and joins to a route that goes nowhere', () => {
    const legs = chainRoute(fieldFromTiles(flatField(3)), origin, [])!

    expect(legs).toEqual([])
    expect(joinLegs(origin, legs)).toEqual({ hexes: [origin], steps: 0, km: 0 })
  })

  it('is one ordinary route for a single stop', () => {
    const field = fieldFromTiles(flatField(3))
    const legs = chainRoute(field, origin, [{ q: 2, r: 0 }])!

    expect(legs).toEqual([findRoute(field, origin, { q: 2, r: 0 })])
  })

  it('starts every leg where the last one ended and adds them up', () => {
    const field = fieldFromTiles(flatField(4))
    const stops = [
      { q: 2, r: 0 },
      { q: 2, r: 2 },
      { q: 0, r: 2 },
    ]
    const legs = chainRoute(field, origin, stops)!

    expect(legs.map((leg) => leg.hexes[0])).toEqual([origin, stops[0], stops[1]])
    expect(legs.map((leg) => leg.hexes[leg.hexes.length - 1])).toEqual(stops)

    const joined = joinLegs(origin, legs)
    expect(joined.steps).toBe(6)
    expect(joined.km).toBe(6 * KM_PER_HEX)
    expect(joined.hexes).toHaveLength(7)
    expect(new Set(joined.hexes.map(hexKey)).size).toBe(7)
  })

  it('refuses the whole chain when one leg cannot be walked', () => {
    const tiles = flatField(3)
    tiles.set(hexKey({ q: 3, r: 0 }), water({ q: 3, r: 0 }))

    expect(
      chainRoute(fieldFromTiles(tiles), origin, [
        { q: 1, r: 0 },
        { q: 3, r: 0 },
      ]),
    ).toBeNull()
  })
})
