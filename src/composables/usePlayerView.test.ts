import { Color3 } from '@babylonjs/core/Maths/math.color'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import { hexKey, range, type HexKey } from '../hex/coords'
import { projectForPlayers } from '../session/projection'
import { DM } from '../session/permissions'
import { useHexMapStore } from '../stores/hexMap'
import type { TerrainTile } from '../terrain/terrain'
import { createFogFeed, readProjection, settled, usePlayerView } from './usePlayerView'

const flat = (radius: number): Map<HexKey, TerrainTile> =>
  new Map(
    range({ q: 0, r: 0 }, radius).map((hex) => [
      hexKey(hex),
      { hex, terrain: 'grass', height: 1, level: 1, elevation: 1.5, color: new Color3(0, 0, 0) },
    ]),
  )

type Store = ReturnType<typeof useHexMapStore>

const setup = (): Store => {
  const store = useHexMapStore()
  store.setTiles(flat(8))
  store.setEntitySight(store.selectedId, 2)
  return store
}

/** Passing turns and rewinding them are the DM's, whichever view is up. */
const asDm = (store: Store, work: () => unknown): void => {
  store.actAs(DM, work)
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('settled', () => {
  it('keeps its last answer while the next one equals it', async () => {
    const source = ref(1)
    const parity = settled(() => ({ odd: source.value % 2 === 1 }))
    const first = parity.value
    source.value = 3
    await nextTick()
    expect(parity.value).toBe(first)
    source.value = 4
    expect(parity.value).toEqual({ odd: false })
  })
})

describe('reading a projection', () => {
  it('hands the fog the same sets while the lists are unchanged', () => {
    const store = setup()
    store.select({ q: 0, r: 0 })
    const first = readProjection(projectForPlayers(store.snapshot, store.field))
    const again = readProjection(projectForPlayers(store.snapshot, store.field), first)
    expect(again.known).toBe(first.known)
    expect(again.visible).toBe(first.visible)

    store.select({ q: 3, r: 0 })
    asDm(store, store.advanceTurn)
    const moved = readProjection(projectForPlayers(store.snapshot, store.field), again)
    expect(moved.known).not.toBe(first.known)
  })
})

describe('the fog feed', () => {
  it('starts whole, then hands over what came to light and what was lost', () => {
    const feed = createFogFeed()
    const visible = new Set<HexKey>(['0,0'])
    const first = feed(new Set(['0,0', '1,0']), visible)
    expect(first.added).toBeNull()

    const next = feed(new Set(['1,0', '2,0']), visible)
    expect([...next.added!]).toEqual(['2,0'])
    expect([...next.lost]).toEqual(['0,0'])
    expect(next.version).toBe(first.version + 1)
  })

  it('gives the same answer for the same sets, and a new one when only the sight moved', () => {
    const feed = createFogFeed()
    const known = new Set<HexKey>(['0,0', '1,0'])
    const visible = new Set<HexKey>(['0,0'])
    const first = feed(known, visible)
    expect(feed(known, visible)).toBe(first)

    const looked = feed(known, new Set(['1,0']))
    expect(looked.version).toBe(first.version + 1)
    expect(looked.added?.size).toBe(0)
    expect(looked.lost.size).toBe(0)
  })
})

describe('the player view', () => {
  it('is one source shared by everything that reads it', () => {
    expect(usePlayerView()).toBe(usePlayerView())
  })

  it('draws what the store draws for the players when nothing is hidden', () => {
    const store = setup()
    const party = store.selectedId
    store.select({ q: 0, r: 0 })
    store.select({ q: 4, r: 0 })
    asDm(store, store.advanceTurn)
    store.dmView = false
    store.showHistory = true

    const view = usePlayerView()
    expect(view.paths.value).toEqual(store.paths)
    expect(view.stops.value).toEqual(store.stops)
    expect(view.start.value).toBe(store.start)
    expect(view.goal.value).toBe(store.goal)
    expect(view.plannedHexes.value).toEqual(store.plannedHexes)
    expect(view.tokens.value).toEqual(store.tokens)
    expect(view.adventureLog.value).toEqual(store.adventureLog)
    expect(view.hexesWalked.value).toBe(store.hexesWalked)
    expect([...view.scene.value.known].sort()).toEqual([...store.known].sort())
    expect(view.walking.value.map((one) => one.id)).toEqual([party])
  })

  it('follows the store as it changes', () => {
    const store = setup()
    store.select({ q: 0, r: 0 })
    store.dmView = false
    const view = usePlayerView()
    expect(view.goal.value).toBeNull()

    // A player's order stops at a turn's walk, so the goal is the hex beside.
    store.select({ q: 3, r: 0 })
    expect(view.goal.value).toBe('1,0')
    expect(view.goal.value).toBe(store.goal)
    expect(view.projection.value.queue).toHaveLength(1)
  })

  it('has every visible entity in sight, not only the selected one', () => {
    const store = setup()
    store.select({ q: -5, r: 0 })
    const other = store.addEntity('others', 'party', 'player')!
    store.selectEntity(other.id)
    store.setEntitySight(other.id, 2)
    store.select({ q: 5, r: 0 })
    store.dmView = false

    const visible = usePlayerView().scene.value.visible
    expect(visible.has('-5,0')).toBe(true)
    expect(visible.has('5,0')).toBe(true)
    expect(store.visibleToPlayers.has('-5,0')).toBe(false)
  })

  it('logs no turn and no encounter past the one the crawl stands at', () => {
    const store = setup()
    store.select({ q: 0, r: 0 })
    store.select({ q: 4, r: 0 })
    asDm(store, store.advanceTurn)
    asDm(store, store.advanceTurn)
    asDm(store, () =>
      store.acceptEncounter('2,0', {
        id: 'wolves',
        terrain: 'grass',
        when: 'day',
        weight: 1,
        title: 'wolves',
        description: '',
      }),
    )
    asDm(store, store.rewindTurn)
    store.dmView = false

    const log = usePlayerView().adventureLog.value
    expect(log.every((entry) => entry.kind === 'turn' && entry.row.turn < store.turn)).toBe(true)
    expect(log).toHaveLength(1)
    expect(store.adventureLog.length).toBeGreaterThan(log.length)
  })

  it('never lists a hidden rider in a caravan the players can see', () => {
    const store = setup()
    const caravan = store.addEntity('the caravan', 'caravan')!
    store.selectEntity(caravan.id)
    store.select({ q: 0, r: 0 })
    const spy = store.addEntity('the spy', 'npc', 'dm')!
    store.selectEntity(spy.id)
    store.select({ q: 2, r: 0 })
    store.select({ q: 0, r: 0 })
    asDm(store, store.advanceTurn)
    asDm(store, store.advanceTurn)
    expect(store.carrierOf(spy.id)).toBe(caravan.id)

    store.dmView = false
    const view = usePlayerView()
    expect(store.ridersOf(caravan.id).map((one) => one.id)).toContain(spy.id)
    expect(view.ridersOf(caravan.id)).toEqual([])
    expect(view.tokens.value.map((one) => one.id)).not.toContain(spy.id)
  })

  it('fills the caravan panel as the store does: stores, crew, wagons and who rides', () => {
    const store = setup()
    const party = store.selectedId
    const caravan = store.addEntity('the caravan', 'caravan')!
    store.selectEntity(caravan.id)
    store.select({ q: 0, r: 0 })
    store.selectEntity(party)
    store.select({ q: 2, r: 0 })
    store.select({ q: 0, r: 0 })
    asDm(store, store.advanceTurn)
    asDm(store, store.advanceTurn)
    asDm(store, () => {
      store.setSupply(caravan.id, 'food', 12)
      store.addMerchant(caravan.id, 'smith')
      store.addItem(caravan.id, { name: 'rope' })
      store.addItem(party, { name: 'lantern' })
    })
    expect(store.carrierOf(party)).toBe(caravan.id)

    store.dmView = false
    const view = usePlayerView()
    const ids = (list: readonly { id: string }[]): string[] => list.map((one) => one.id)
    expect(view.shownCaravan.value?.id).toBe(store.shownCaravan?.id)
    expect(view.carrierOf(party)).toBe(caravan.id)
    expect(ids(view.ridersOf(caravan.id))).toEqual(ids(store.ridersOf(caravan.id)))
    expect(view.suppliesOf(caravan.id)).toEqual(store.suppliesOf(caravan.id))
    expect(view.merchantsOf(caravan.id)).toEqual(store.merchantsOf(caravan.id))
    expect(view.catalog.value).toEqual(store.catalog)
    expect(view.itemsOf(caravan.id)).toEqual(store.itemsOf(caravan.id))
    expect(view.itemsOf(party)).toEqual(store.itemsOf(party))
    expect(ids(view.inventoryPartners(party))).toEqual(ids(store.inventoryPartners(party)))
    expect(ids(view.inventoryPartners(caravan.id))).toEqual(
      ids(store.inventoryPartners(caravan.id)),
    )
  })

  it("shows the players no hidden caravan and none of a hidden rider's pack", () => {
    const store = setup()
    const caravan = store.addEntity('the smugglers', 'caravan', 'dm')!
    store.selectEntity(caravan.id)
    asDm(store, () => store.select({ q: 0, r: 0 }))
    asDm(store, () => store.addItem(caravan.id, { name: 'contraband' }))
    expect(store.itemsOf(caravan.id)).toHaveLength(1)

    store.dmView = false
    const view = usePlayerView()
    expect(view.shownCaravan.value).toBeNull()
    expect(view.itemsOf(caravan.id)).toEqual([])
    expect(view.merchantsOf(caravan.id)).toEqual([])
  })

  it('holds where everybody stood when the turn just played opened', () => {
    const store = setup()
    const party = store.selectedId
    store.select({ q: 0, r: 0 })
    store.select({ q: 4, r: 0 })
    store.dmView = false
    const view = usePlayerView()
    expect(view.positionsAt(0)?.get(party)?.hex).toBe('0,0')

    asDm(store, store.advanceTurn)
    expect(view.positionsAt(1)?.get(party)?.hex).not.toBe('0,0')
    expect(view.positionsAt(0)?.get(party)?.hex).toBe('0,0')
    expect(view.positionsAt(5)).toBeNull()
    expect(view.recordsOn(0).map((row) => row.entityId)).toEqual([party])
  })
})
