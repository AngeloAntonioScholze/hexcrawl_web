import { loadSnapshot, saveSnapshot } from './mapState'
import type { MapRequest, MapResponse } from './protocol'
import { migrate } from './schema'
import { openMapDatabase } from './sqlite'

// The DOM and WebWorker lib declarations cannot both be loaded, so the handful
// of worker globals this file touches are named here instead.
interface WorkerScope {
  postMessage(message: MapResponse): void
  addEventListener(type: 'message', listener: (event: MessageEvent<MapRequest>) => void): void
}

const scope = self as unknown as WorkerScope

// The database lives in here because OPFS hands out synchronous access handles
// to dedicated workers only; on the main thread the pool VFS cannot open at all.
const ready = openMapDatabase().then((db) => {
  migrate(db)
  return db
})

scope.addEventListener('message', ({ data }) => {
  ready
    .then((db) => {
      if (data.type === 'load') return loadSnapshot(db)
      saveSnapshot(db, data.snapshot)
      return null
    })
    .then((result) => scope.postMessage({ id: data.id, ok: true, result }))
    .catch((error: unknown) => scope.postMessage({ id: data.id, ok: false, error: String(error) }))
})
