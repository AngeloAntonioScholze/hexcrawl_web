import { Color3 } from '@babylonjs/core/Maths/math.color'
import { createPinia, setActivePinia } from 'pinia'
import { hexKey, range, type HexKey } from '../hex/coords'
import { useHexMapStore } from '../stores/hexMap'
import type { TerrainTile } from '../terrain/terrain'

/** Flat grass to the rim: sight is plain to reason about on it. */
export const flatTiles = (radius: number): Map<HexKey, TerrainTile> =>
  new Map(
    range({ q: 0, r: 0 }, radius).map((hex) => [
      hexKey(hex),
      { hex, terrain: 'grass', height: 1, level: 1, elevation: 1.5, color: new Color3(0, 0, 0) },
    ]),
  )

/**
 * A crawl under way for the tests to step on: a party with a caravan and its
 * goods, a hidden spy off to the west, and things to find on the ground.
 */
export function crawlStore(): ReturnType<typeof useHexMapStore> {
  setActivePinia(createPinia())
  const store = useHexMapStore()
  store.setTiles(flatTiles(12))
  store.setSight(2)
  store.select({ q: 0, r: 0 })

  const caravan = store.addEntity('the caravan', 'caravan')!
  store.selectEntity(caravan.id)
  store.select({ q: 1, r: 0 })
  store.addMerchant(caravan.id, 'smith', 'Ada', 2)
  store.addItem(caravan.id, { name: 'salt', quantity: 5 })

  const spy = store.addEntity('the spy', 'npc', 'dm')!
  store.selectEntity(spy.id)
  store.select({ q: -8, r: 0 })
  store.addItem(spy.id, { name: 'poison' })

  store.addEvent('2,0', { title: 'a signpost', description: 'points east' })
  store.addLocation('3,0', { name: 'a mill', kind: 'village', description: 'busy' })
  store.addResource('2,1', 'herbs')
  store.setNote('0,0', 'the innkeeper is the spy')

  store.selectEntity(store.entities[0].id)
  return store
}
