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
  `
  ALTER TABLE map ADD COLUMN elapsed_hours INTEGER NOT NULL DEFAULT 0;
  `,
  `
  ALTER TABLE map ADD COLUMN turn INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE map ADD COLUMN dm_view INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE map ADD COLUMN selected_id TEXT;

  DROP TABLE journey;
  DROP TABLE explored;

  ALTER TABLE map DROP COLUMN start_hex;
  ALTER TABLE map DROP COLUMN goal_hex;
  ALTER TABLE map DROP COLUMN sight;
  ALTER TABLE map DROP COLUMN speed;
  ALTER TABLE map DROP COLUMN standing;
  ALTER TABLE map DROP COLUMN elapsed_hours;

  CREATE TABLE entity (
    id TEXT PRIMARY KEY,
    ord INTEGER NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    owner TEXT NOT NULL,
    color TEXT NOT NULL,
    pace REAL NOT NULL,
    sight INTEGER NOT NULL,
    hidden INTEGER NOT NULL
  );

  CREATE TABLE origin (
    entity_id TEXT PRIMARY KEY,
    turn INTEGER NOT NULL,
    hex TEXT NOT NULL
  );

  CREATE TABLE turn (
    n INTEGER PRIMARY KEY
  );

  CREATE TABLE action (
    turn INTEGER NOT NULL REFERENCES turn(n) ON DELETE CASCADE,
    entity_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    from_hex TEXT,
    to_hex TEXT,
    entered TEXT NOT NULL,
    spent REAL NOT NULL,
    carry REAL NOT NULL,
    PRIMARY KEY (turn, entity_id)
  );

  CREATE TABLE entity_turn (
    turn INTEGER NOT NULL REFERENCES turn(n) ON DELETE CASCADE,
    entity_id TEXT NOT NULL,
    hex TEXT,
    carry REAL NOT NULL,
    pending TEXT NOT NULL,
    PRIMARY KEY (turn, entity_id)
  );

  CREATE TABLE queued_action (
    entity_id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    route TEXT NOT NULL
  );
  `,
  `
  ALTER TABLE map ADD COLUMN world_radius INTEGER NOT NULL DEFAULT 150;
  `,
  `
  ALTER TABLE entity_turn ADD COLUMN waypoints TEXT NOT NULL DEFAULT '';
  ALTER TABLE queued_action ADD COLUMN waypoints TEXT NOT NULL DEFAULT '';
  `,
  `
  ALTER TABLE entity_turn ADD COLUMN riding TEXT;
  `,
  `
  CREATE TABLE hex_note (
    hex TEXT PRIMARY KEY,
    text TEXT NOT NULL
  ) WITHOUT ROWID;

  CREATE TABLE hex_event (
    id TEXT PRIMARY KEY,
    hex TEXT NOT NULL,
    ord INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL
  );

  CREATE TABLE hex_location (
    id TEXT PRIMARY KEY,
    hex TEXT NOT NULL,
    ord INTEGER NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    description TEXT NOT NULL
  );
  `,
  `
  ALTER TABLE map DROP COLUMN allow_water;
  `,
  `
  CREATE TABLE merchant (
    id TEXT PRIMARY KEY,
    caravan_id TEXT NOT NULL,
    ord INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    level INTEGER NOT NULL
  );
  `,
  `
  ALTER TABLE map ADD COLUMN resource_spacing INTEGER NOT NULL DEFAULT 10;

  CREATE TABLE resource (
    id TEXT PRIMARY KEY,
    hex TEXT NOT NULL,
    ord INTEGER NOT NULL,
    type TEXT NOT NULL,
    origin TEXT NOT NULL
  );

  CREATE TABLE resource_chance (
    terrain TEXT PRIMARY KEY,
    chance REAL NOT NULL
  ) WITHOUT ROWID;
  `,
  // Spacing had no control before the default dropped to 5, so a 10 here is
  // the old default rather than anyone's choice.
  `
  UPDATE map SET resource_spacing = 5 WHERE resource_spacing = 10;
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
