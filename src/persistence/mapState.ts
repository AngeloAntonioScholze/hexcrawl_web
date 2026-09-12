import type { Database } from '@sqlite.org/sqlite-wasm'
import type { HexKey } from '../hex/coords'
import type { JourneyStep, TerrainControls } from '../stores/hexMap'

/**
 * Everything a session needs to come back as it was. The tiles themselves are
 * absent on purpose: terrain is a pure function of the controls, so storing
 * five thousand hexes would only be a slower way of storing the seed.
 */
export interface MapSnapshot {
  terrain: TerrainControls
  start: HexKey | null
  goal: HexKey | null
  allowWater: boolean
  fog: boolean
  showSight: boolean
  showHistory: boolean
  sight: number
  speed: number
  explored: Iterable<HexKey>
  journey: readonly JourneyStep[]
  /** Which log entry the party stands on, or null at the head of it. */
  standing: number | null
}

const SAVE_MAP = `
  INSERT OR REPLACE INTO map
    (id, seed, scale, sea_level, relief, start_hex, goal_hex,
     allow_water, fog, show_sight, show_history, sight, speed, standing)
  VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`

const flag = (value: boolean): number => (value ? 1 : 0)

export function saveSnapshot(db: Database, snapshot: MapSnapshot): void {
  db.transaction(() => {
    db.exec({
      sql: SAVE_MAP,
      bind: [
        snapshot.terrain.seed,
        snapshot.terrain.scale,
        snapshot.terrain.seaLevel,
        snapshot.terrain.relief,
        snapshot.start,
        snapshot.goal,
        flag(snapshot.allowWater),
        flag(snapshot.fog),
        flag(snapshot.showSight),
        flag(snapshot.showHistory),
        snapshot.sight,
        snapshot.speed,
        snapshot.standing,
      ],
    })

    // Rewritten wholesale rather than diffed: exploration only ever grows, but
    // forget() can cut it back, and one prepared insert per hex inside the
    // transaction is already far cheaper than working out which ones moved.
    db.exec('DELETE FROM explored')
    const explored = db.prepare('INSERT INTO explored (hex) VALUES (?)')
    try {
      for (const hex of snapshot.explored) explored.bind(hex).stepReset()
    } finally {
      explored.finalize()
    }

    // Rewritten the same way for the same reason: the log only grows while a
    // world lasts, but a new world starts the party's history over.
    db.exec('DELETE FROM journey')
    const journey = db.prepare('INSERT INTO journey (step, hex, km, terrain) VALUES (?, ?, ?, ?)')
    try {
      snapshot.journey.forEach((step, index) => {
        journey.bind([index, step.hex, step.km, step.terrain]).stepReset()
      })
    } finally {
      journey.finalize()
    }
  })
}

const hexOrNull = (value: unknown): HexKey | null =>
  typeof value === 'string' ? (value as HexKey) : null

export function loadSnapshot(db: Database): MapSnapshot | null {
  const row = db.selectObject('SELECT * FROM map WHERE id = 1')
  if (!row) return null

  return {
    terrain: {
      seed: Number(row.seed),
      scale: Number(row.scale),
      seaLevel: Number(row.sea_level),
      relief: Number(row.relief),
    },
    start: hexOrNull(row.start_hex),
    goal: hexOrNull(row.goal_hex),
    allowWater: Number(row.allow_water) === 1,
    fog: Number(row.fog) === 1,
    showSight: Number(row.show_sight) === 1,
    showHistory: Number(row.show_history) === 1,
    sight: Number(row.sight),
    speed: Number(row.speed),
    standing: row.standing === null || row.standing === undefined ? null : Number(row.standing),
    explored: db.selectValues('SELECT hex FROM explored ORDER BY hex').map(String) as HexKey[],
    journey: db.selectObjects('SELECT hex, km, terrain FROM journey ORDER BY step').map((step) => ({
      hex: String(step.hex) as HexKey,
      km: Number(step.km),
      terrain: String(step.terrain) as JourneyStep['terrain'],
    })),
  }
}
