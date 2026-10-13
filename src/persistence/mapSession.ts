import { watch } from 'vue'
import type { MapSnapshot } from './mapState'
import type { MapCommand, MapResponse } from './protocol'
import type { useHexMapStore } from '../stores/hexMap'

type HexMapStore = ReturnType<typeof useHexMapStore>

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
})

interface Pending {
  resolve: (result: MapSnapshot | null) => void
  reject: (error: Error) => void
}

/**
 * Hands the store back the last session and keeps writing it down from there.
 * A browser that will not give us storage loses the save, not the map: the
 * sandbox runs unsaved rather than not at all.
 */
export async function startMapSession(store: HexMapStore): Promise<void> {
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

  const request = (command: MapCommand): Promise<MapSnapshot | null> =>
    new Promise((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve, reject })
      worker.postMessage({ ...command, id })
    })

  // A worker that answers neither way would otherwise hold the app on a blank
  // page, which is a far worse trade than losing the save.
  const timeout = setTimeout(() => abandon('the map worker did not answer'), LOAD_TIMEOUT_MS)
  const saved = await request({ type: 'load' }).catch(complain)
  clearTimeout(timeout)

  if (saved) store.restore(saved)

  const write = (): void => {
    if (broken) return
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

  // A tab closing mid-wait would otherwise drop the last few moves. pagehide is
  // the last event a desktop browser reliably gives us and visibilitychange is
  // the one a phone does, so the save is chased on both.
  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
}
