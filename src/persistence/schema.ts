import type { Database } from '@sqlite.org/sqlite-wasm'

// Appended to, never edited: each entry is one step forward from the schema the
// entry before it left behind, and the index of the last one applied is what
// PRAGMA user_version holds in the file.
const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE map (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    seed INTEGER NOT NULL,
    scale REAL NOT NULL,
    sea_level REAL NOT NULL,
    relief REAL NOT NULL,
    start_hex TEXT,
    goal_hex TEXT,
    allow_water INTEGER NOT NULL,
    fog INTEGER NOT NULL,
    show_sight INTEGER NOT NULL,
    sight INTEGER NOT NULL,
    speed INTEGER NOT NULL
  );

  CREATE TABLE explored (
    hex TEXT PRIMARY KEY
  ) WITHOUT ROWID;
  `,
  `
  CREATE TABLE journey (
    step INTEGER PRIMARY KEY,
    hex TEXT NOT NULL,
    km REAL NOT NULL,
    terrain TEXT NOT NULL
  );
  `,
  `
  ALTER TABLE map ADD COLUMN standing INTEGER;
  `,
  `
  ALTER TABLE map ADD COLUMN show_history INTEGER NOT NULL DEFAULT 0;
  `,
]

export const SCHEMA_VERSION = MIGRATIONS.length

export const schemaVersion = (db: Database): number => Number(db.selectValue('PRAGMA user_version'))

/** Walks a database up to the current schema. A fresh file starts at zero. */
export function migrate(db: Database): void {
  const from = schemaVersion(db)
  if (from >= SCHEMA_VERSION) return

  db.transaction(() => {
    for (let version = from; version < SCHEMA_VERSION; version++) db.exec(MIGRATIONS[version])
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)
  })
}
