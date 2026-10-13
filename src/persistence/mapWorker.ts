import type { Database } from '@sqlite.org/sqlite-wasm'
import {
  addMap,
  ensureFirstMap,
  ensureIndex,
  hasMap,
  INDEX_FILE,
  lastOpened,
  listMaps,
  mapFile,
  markOpened,
  newMapId,
  removeMap,
  renameMap,
  touchMap,
} from './mapIndex'
import { loadSnapshot, saveSnapshot, type MapSnapshot } from './mapState'
import type { MapCommand, MapList, MapRequest, MapResponse, MapResult, OpenedMap } from './protocol'
import { migrate } from './schema'
import { openMapPool } from './sqlite'

// The DOM and WebWorker lib declarations cannot both be loaded, so the handful
// of worker globals this file touches are named here instead.
interface WorkerScope {
  postMessage(message: MapResponse): void
  addEventListener(type: 'message', listener: (event: MessageEvent<MapRequest>) => void): void
}

const scope = self as unknown as WorkerScope

// Each slot is one file, and only the index and the open map ever hold a
// journal beside their database, so a few spare slots are all a write needs.
const SPARE_SLOTS = 4

// The databases live in here because OPFS hands out synchronous access handles
// to dedicated workers only; on the main thread the pool VFS cannot open at all.
const ready = openMapPool().then(async (pool) => {
  await pool.reserveMinimumCapacity(Number(pool.getFileCount()) + SPARE_SLOTS)
  const files = pool.getFileNames()
  const index = new pool.OpfsSAHPoolDb(INDEX_FILE)
  ensureIndex(index)
  ensureFirstMap(index, files, Date.now(), newMapId())
  return { pool, index }
})

let current: { id: string; db: Database } | null = null

const listed = (index: Database): MapList => {
  if (!current) throw new Error('no map is open')
  return { maps: listMaps(index), currentId: current.id }
}

async function handle(command: MapCommand): Promise<MapResult> {
  const { pool, index } = await ready

  const open = async (id: string, snapshot: MapSnapshot | null = null): Promise<OpenedMap> => {
    if (!hasMap(index, id)) throw new Error(`there is no map ${id}`)
    if (current?.id !== id) {
      current?.db.close()
      current = null
      await pool.reserveMinimumCapacity(Number(pool.getFileCount()) + SPARE_SLOTS)
      const db = new pool.OpfsSAHPoolDb(mapFile(id))
      migrate(db)
      current = { id, db }
    }
    if (snapshot) saveSnapshot(current.db, snapshot)
    markOpened(index, id, Date.now())
    return { ...listed(index), snapshot: snapshot ?? loadSnapshot(current.db) }
  }

  switch (command.type) {
    case 'start':
      return open(lastOpened(index) ?? listMaps(index)[0].id)
    case 'open':
      return open(command.mapId)
    case 'create': {
      const id = newMapId()
      addMap(index, id, command.name, Date.now())
      return open(id, command.snapshot)
    }
    case 'save':
      if (!current) throw new Error('no map is open')
      saveSnapshot(current.db, command.snapshot)
      touchMap(index, current.id, Date.now())
      return null
    case 'rename':
      renameMap(index, command.mapId, command.name)
      return listed(index)
    case 'delete': {
      if (!hasMap(index, command.mapId)) throw new Error(`there is no map ${command.mapId}`)
      if (command.mapId === current?.id) throw new Error('the open map cannot be deleted')
      removeMap(index, command.mapId)
      pool.unlink(mapFile(command.mapId))
      return listed(index)
    }
  }
}

// One at a time and in the order sent: a save posted just before a switch has
// to land in the map it was made in, and opening a map awaits the pool.
let queue: Promise<void> = Promise.resolve()

scope.addEventListener('message', ({ data }) => {
  queue = queue
    .then(() => handle(data))
    .then(
      (result) => scope.postMessage({ id: data.id, ok: true, result }),
      (error: unknown) => scope.postMessage({ id: data.id, ok: false, error: String(error) }),
    )
})
