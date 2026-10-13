import type { Database } from '@sqlite.org/sqlite-wasm'
import { MAP_FILE_EXTENSION } from './mapFile'

export interface MapEntry {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

export const INDEX_FILE = '/index.sqlite3'

// Before there was a list the one map lived in /hexcrawl.sqlite3. The pool VFS
// cannot rename a file, so that map keeps the id its file name already spells.
export const LEGACY_MAP_ID = 'hexcrawl'

export const mapFile = (id: string): string => `/${id}.sqlite3`

export const newMapId = (): string => `map-${crypto.randomUUID()}`

const NAME_LIMIT = 60

/** What a typed name becomes, or null when nothing worth keeping is left. */
export function cleanName(text: string): string | null {
  const name = text.replace(/\s+/g, ' ').trim().slice(0, NAME_LIMIT).trim()
  return name === '' ? null : name
}

export function uniqueName(base: string, taken: readonly string[]): string {
  if (!taken.includes(base)) return base
  let n = 2
  while (taken.includes(`${base} ${n}`)) n++
  return `${base} ${n}`
}

export function nextMapName(taken: readonly string[]): string {
  let n = 1
  while (taken.includes(`map ${n}`)) n++
  return `map ${n}`
}

/** An imported file is named after itself, less what every map file ends in. */
export function importedName(fileName: string): string {
  const base = fileName.endsWith(MAP_FILE_EXTENSION)
    ? fileName.slice(0, -MAP_FILE_EXTENSION.length)
    : fileName.replace(/\.json$/i, '')
  return cleanName(base) ?? 'imported map'
}

/** The map to fall back on when `id` goes away: the one listed next to it. */
export function neighbourOf(maps: readonly MapEntry[], id: string): MapEntry | null {
  const at = maps.findIndex((one) => one.id === id)
  if (at < 0 || maps.length < 2) return null
  return maps[at + 1] ?? maps[at - 1]
}

export function ensureIndex(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS maps (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      opened_at INTEGER NOT NULL DEFAULT 0
    )
  `)
}

export function listMaps(db: Database): MapEntry[] {
  return db
    .selectObjects('SELECT id, name, created_at, updated_at FROM maps ORDER BY created_at, rowid')
    .map((row) => ({
      id: String(row.id),
      name: String(row.name),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    }))
}

export const hasMap = (db: Database, id: string): boolean =>
  db.selectValue('SELECT 1 FROM maps WHERE id = ?', [id]) !== undefined

export function addMap(db: Database, id: string, name: string, now: number): void {
  db.exec({
    sql: 'INSERT INTO maps (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
    bind: [id, name, now, now],
  })
}

export function renameMap(db: Database, id: string, name: string): void {
  db.exec({ sql: 'UPDATE maps SET name = ? WHERE id = ?', bind: [name, id] })
}

export function removeMap(db: Database, id: string): void {
  db.exec({ sql: 'DELETE FROM maps WHERE id = ?', bind: [id] })
}

export function touchMap(db: Database, id: string, now: number): void {
  db.exec({ sql: 'UPDATE maps SET updated_at = ? WHERE id = ?', bind: [now, id] })
}

export function markOpened(db: Database, id: string, now: number): void {
  db.exec({ sql: 'UPDATE maps SET opened_at = ? WHERE id = ?', bind: [now, id] })
}

/** The map to reopen on load: the last one opened, else the first one made. */
export function lastOpened(db: Database): string | null {
  const id = db.selectValue('SELECT id FROM maps ORDER BY opened_at DESC, created_at, rowid')
  return id === undefined ? null : String(id)
}

/**
 * An empty index gets its first map: the single save from before the list
 * existed when the pool still holds it, a fresh one otherwise.
 */
export function ensureFirstMap(
  db: Database,
  files: readonly string[],
  now: number,
  freshId: string,
): void {
  if (listMaps(db).length > 0) return
  const id = files.includes(mapFile(LEGACY_MAP_ID)) ? LEGACY_MAP_ID : freshId
  addMap(db, id, nextMapName([]), now)
  markOpened(db, id, now)
}
