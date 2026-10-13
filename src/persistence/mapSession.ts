import { watch } from 'vue'
import { cleanName, importedName, neighbourOf, nextMapName, uniqueName } from './mapIndex'
import type { MapSnapshot } from './mapState'
import type { MapCommand, MapResponse, MapResult, MapResults, OpenedMap } from './protocol'
import { MAX_SEED, type useHexMapStore } from '../stores/hexMap'
import type { useMapLibraryStore } from '../stores/mapLibrary'

type HexMapStore = ReturnType<typeof useHexMapStore>
type MapLibraryStore = ReturnType<typeof useMapLibraryStore>

/** Long enough that a dragged slider writes once instead of forty times. */
const SAVE_DELAY_MS = 300

/** Nothing gets to hold the first frame hostage over a save file. */
const LOAD_TIMEOUT_MS = 4000

// The store hands out reactive proxies and a live Set; neither survives being
// posted to a worker, so the snapshot is flattened on the way out.
const plain = (snapshot: MapSnapshot): MapSnapshot => ({
  terrain: { ...snapshot.terrain },
  worldRadius: snapshot.worldRadius,
  fog: snapshot.fog,
  showSight: snapshot.showSight,
  showHistory: snapshot.showHistory,
  dmView: snapshot.dmView,
  turn: snapshot.turn,
  selectedId: snapshot.selectedId,
  entities: snapshot.entities.map((one) => ({ ...one })),
  origins: snapshot.origins.map((one) => ({ ...one })),
  record: snapshot.record.map((row) => ({ ...row, entered: [...row.entered] })),
  states: snapshot.states.map((row) => ({
    ...row,
    pending: [...row.pending],
    waypoints: [...row.waypoints],
  })),
  queue: snapshot.queue.map(({ entityId, action }) => ({
    entityId,
    action:
      action.kind === 'move'
        ? { kind: action.kind, route: [...action.route], waypoints: [...action.waypoints] }
        : { ...action },
  })),
  supplies: snapshot.supplies.map((one) => ({ ...one })),
  notes: snapshot.notes.map((one) => ({ ...one })),
  events: snapshot.events.map((one) => ({ ...one })),
  locations: snapshot.locations.map((one) => ({ ...one })),
  merchants: snapshot.merchants.map((one) => ({ ...one })),
  catalogOverrides: snapshot.catalogOverrides.map((one) => JSON.parse(JSON.stringify(one))),
  resources: snapshot.resources.map((one) => ({ ...one })),
  resourceChances: { ...snapshot.resourceChances },
  resourceSpacing: snapshot.resourceSpacing,
  fogEdits: snapshot.fogEdits.map((one) => ({ ...one })),
  encounterOverrides: snapshot.encounterOverrides.map((one) =>
    one.kind === 'add'
      ? { kind: one.kind, entry: { ...one.entry } }
      : one.kind === 'change'
        ? { kind: one.kind, id: one.id, change: { ...one.change } }
        : { ...one },
  ),
  roads: snapshot.roads.map((one) => ({ ...one })),
  rivers: snapshot.rivers.map((one) => ({ ...one })),
  terrainOverrides: snapshot.terrainOverrides.map((one) => ({ ...one })),
})

interface Pending {
  resolve: (result: MapResult) => void
  reject: (error: Error) => void
}

/**
 * Hands the store back the map it last had open and keeps writing it down from
 * there. A browser that will not give us storage loses the save, not the map:
 * the sandbox runs unsaved rather than not at all.
 */
export async function startMapSession(store: HexMapStore, library: MapLibraryStore): Promise<void> {
  const worker = new Worker(new URL('./mapWorker.ts', import.meta.url), { type: 'module' })
  const pending = new Map<number, Pending>()
  let nextId = 0
  let broken = false

  const complain = (error: unknown): null => {
    if (!broken) console.warn('hexcrawl: running without a saved map', error)
    broken = true
    return null
  }

  const abandon = (reason: string): void => {
    const failure = new Error(reason)
    for (const waiting of pending.values()) waiting.reject(failure)
    pending.clear()
  }

  worker.addEventListener('message', ({ data }: MessageEvent<MapResponse>) => {
    const waiting = pending.get(data.id)
    if (!waiting) return
    pending.delete(data.id)
    if (data.ok) waiting.resolve(data.result)
    else waiting.reject(new Error(data.error))
  })

  worker.addEventListener('error', (event) => abandon(event.message || 'the map worker died'))

  const request = <C extends MapCommand>(command: C): Promise<MapResults[C['type']]> =>
    new Promise((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve: resolve as (result: MapResult) => void, reject })
      worker.postMessage({ ...command, id })
    })

  // Taken before anything is restored over it: a new map starts from the
  // sandbox's defaults, on a world of its own.
  const blank = plain(store.snapshot)

  // A worker that answers neither way would otherwise hold the app on a blank
  // page, which is a far worse trade than losing the save.
  const timeout = setTimeout(() => abandon('the map worker did not answer'), LOAD_TIMEOUT_MS)
  const started = await request({ type: 'start' }).catch(complain)
  clearTimeout(timeout)

  if (started) {
    library.show(started)
    if (started.snapshot) store.restore(started.snapshot)
  }

  // Set while another map is on its way in: anything changed on the one being
  // left after its last save is about to be replaced, and must not land in the
  // file the worker has already moved on to.
  let switching = false

  const write = (): void => {
    if (broken || switching) return
    void request({ type: 'save', snapshot: plain(store.snapshot) }).catch(complain)
  }

  let queued: ReturnType<typeof setTimeout> | null = null

  watch(
    () => store.snapshot,
    () => {
      if (queued !== null) clearTimeout(queued)
      queued = setTimeout(() => {
        queued = null
        write()
      }, SAVE_DELAY_MS)
    },
  )

  const flush = (): void => {
    if (queued === null) return
    clearTimeout(queued)
    queued = null
    write()
  }

  // The map being left gets its last edits before the worker lets go of it;
  // restore then drops its undo history along with it.
  const switchTo = async (command: MapCommand & { type: 'open' | 'create' }): Promise<void> => {
    flush()
    switching = true
    const opened: OpenedMap = await request(command).finally(() => {
      switching = false
    })
    library.show(opened)
    store.restore(
      opened.snapshot ?? {
        ...blank,
        terrain: { ...blank.terrain, seed: Math.floor(Math.random() * MAX_SEED) },
      },
    )
  }

  const names = (): string[] => library.maps.map((one) => one.name)

  const warned =
    <A extends unknown[]>(work: (...args: A) => Promise<void>) =>
    (...args: A): Promise<void> =>
      work(...args).catch((error: unknown) => console.warn('hexcrawl: the map list', error))

  library.connect({
    open: warned((mapId: string) => switchTo({ type: 'open', mapId })),
    create: warned(() => switchTo({ type: 'create', name: nextMapName(names()), snapshot: null })),
    importMap: warned((fileName: string, snapshot: MapSnapshot) =>
      switchTo({ type: 'create', name: uniqueName(importedName(fileName), names()), snapshot }),
    ),
    rename: warned(async (mapId: string, typed: string) => {
      const name = cleanName(typed)
      if (name) library.show(await request({ type: 'rename', mapId, name }))
    }),
    remove: warned(async (mapId: string) => {
      const fallback = neighbourOf(library.maps, mapId)
      if (!fallback) return
      if (mapId === library.currentId) await switchTo({ type: 'open', mapId: fallback.id })
      library.show(await request({ type: 'delete', mapId }))
    }),
  })

  // A tab closing mid-wait would otherwise drop the last few moves. pagehide is
  // the last event a desktop browser reliably gives us and visibilitychange is
  // the one a phone does, so the save is chased on both.
  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
}
