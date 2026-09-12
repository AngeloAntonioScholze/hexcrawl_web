import sqlite3InitModule, { type Database, type Sqlite3Static } from '@sqlite.org/sqlite-wasm'

const DB_FILE = '/hexcrawl.sqlite3'

// One directory per app so a second sqlite-backed page on the same origin does
// not fight this one for the pool.
const VFS_NAME = 'hexcrawl'

let runtime: Promise<Sqlite3Static> | null = null

const sqlite3 = (): Promise<Sqlite3Static> => (runtime ??= sqlite3InitModule())

/**
 * The saved map. Backed by the OPFS pool VFS, which keeps the file across
 * reloads without the page having to be cross-origin isolated.
 */
export async function openMapDatabase(): Promise<Database> {
  const api = await sqlite3()
  const pool = await api.installOpfsSAHPoolVfs({ name: VFS_NAME })
  return new pool.OpfsSAHPoolDb(DB_FILE)
}

/** The same engine and the same SQL with no file behind it; what tests run on. */
export async function openMemoryDatabase(): Promise<Database> {
  const api = await sqlite3()
  return new api.oo1.DB(':memory:')
}
