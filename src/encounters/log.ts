import type { HexEvent } from '../hex/content'
import type { HexKey } from '../hex/coords'

/** An accepted encounter as the adventure log reads it. */
export interface LoggedEncounter {
  id: string
  hex: HexKey
  turn: number
  title: string
}

/** Every encounter met, oldest first; events the DM wrote by hand are not in the log. */
export function encountersMet(events: ReadonlyMap<HexKey, readonly HexEvent[]>): LoggedEncounter[] {
  const met: LoggedEncounter[] = []
  for (const [hex, list] of events) {
    for (const { id, title, turn } of list) {
      if (turn !== undefined) met.push({ id, hex, turn, title })
    }
  }
  return met.sort((a, b) => a.turn - b.turn)
}

/**
 * The events with every encounter met after a turn taken out. Handed back
 * untouched when there is nothing to take, so a cut that changes nothing is
 * not an edit.
 */
export function encountersUpTo(
  events: ReadonlyMap<HexKey, readonly HexEvent[]>,
  turn: number,
): ReadonlyMap<HexKey, readonly HexEvent[]> {
  const after = (one: HexEvent): boolean => one.turn !== undefined && one.turn > turn
  if (![...events.values()].some((list) => list.some(after))) return events
  const next = new Map<HexKey, readonly HexEvent[]>()
  for (const [hex, list] of events) {
    const kept = list.filter((one) => !after(one))
    if (kept.length > 0) next.set(hex, kept)
  }
  return next
}

export type LogEntry<Row> =
  { kind: 'turn'; row: Row } | { kind: 'encounter'; encounter: LoggedEncounter }

/**
 * Turns and encounters in the order they happened. Row n records turn n being
 * spent, which leaves the crawl standing at n + 1, and an encounter is met
 * where the crawl stands: so one met at n + 1 follows row n.
 */
export function interleave<Row extends { turn: number }>(
  rows: readonly Row[],
  met: readonly LoggedEncounter[],
): LogEntry<Row>[] {
  const entries: LogEntry<Row>[] = []
  let next = 0
  for (const row of rows) {
    while (next < met.length && met[next].turn <= row.turn) {
      entries.push({ kind: 'encounter', encounter: met[next++] })
    }
    entries.push({ kind: 'turn', row })
  }
  for (; next < met.length; next++) entries.push({ kind: 'encounter', encounter: met[next] })
  return entries
}
