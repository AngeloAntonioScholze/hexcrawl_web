import sqlite3InitModule, {
  type Database,
  type SAHPoolUtil,
  type Sqlite3Static,
} from '@sqlite.org/sqlite-wasm'

// One directory per app so a second sqlite-backed page on the same origin does
// not fight this one for the pool.
const VFS_NAME = 'hexcrawl'

let runtime: Promise<Sqlite3Static> | null = null

const sqlite3 = (): Promise<Sqlite3Static> => (runtime ??= sqlite3InitModule())

/**
 * Where the saved maps live, one database file each. Backed by OPFS, which
 * keeps the files across reloads without the page having to be cross-origin
 * isolated.
 */
export async function openMapPool(): Promise<SAHPoolUtil> {
  const api = await sqlite3()
  return api.installOpfsSAHPoolVfs({ name: VFS_NAME })
}

/** The same engine and the same SQL with no file behind it; what tests run on. */
export async function openMemoryDatabase(): Promise<Database> {
  const api = await sqlite3()
  return new api.oo1.DB(':memory:')
}
