import type { HexKey } from './coords'

export type FogMode = 'reveal' | 'hide'

/**
 * The DM's hand on the fog, laid over whatever the crawl has seen. It is not
 * kept per turn: a rewind shows the fog as it stood at that step with the DM's
 * edits still on top, so stepping back and forth never loses them.
 */
export interface FogEdits {
  revealed: ReadonlySet<HexKey>
  hidden: ReadonlySet<HexKey>
}

export const NO_FOG_EDITS: FogEdits = { revealed: new Set(), hidden: new Set() }

/** What the crawl has seen, as the store hands it out turn by turn. */
export interface Explored {
  seen: ReadonlySet<HexKey>
  added: ReadonlySet<HexKey> | null
  version: number
}

/** What the players know, with what came to light and what went dark since the last answer. */
export interface Knowledge extends Explored {
  lost: ReadonlySet<HexKey>
}

const NONE: ReadonlySet<HexKey> = new Set()

/** A hex is revealed or hidden, never both: the latest stroke over it wins. */
export function editFog(edits: FogEdits, hexes: readonly HexKey[], mode: FogMode): FogEdits {
  const [into, outOf] =
    mode === 'reveal' ? [edits.revealed, edits.hidden] : [edits.hidden, edits.revealed]
  if (hexes.every((key) => into.has(key) && !outOf.has(key))) return edits

  const grown = new Set(into)
  const shrunk = new Set(outOf)
  for (const key of hexes) {
    grown.add(key)
    shrunk.delete(key)
  }
  return mode === 'reveal'
    ? { revealed: grown, hidden: shrunk }
    : { revealed: shrunk, hidden: grown }
}

const untouched = (edits: FogEdits): boolean => edits.revealed.size === 0 && edits.hidden.size === 0

/** (seen ∪ revealed) \ hidden: hiding beats anything the crawl saw. */
export function knownSet(seen: ReadonlySet<HexKey>, edits: FogEdits): ReadonlySet<HexKey> {
  if (untouched(edits)) return seen
  const known = new Set(seen)
  for (const key of edits.revealed) known.add(key)
  for (const key of edits.hidden) known.delete(key)
  return known
}

/** What the party has in sight, less what the DM has hidden from the players. */
export function withoutHidden(
  visible: ReadonlySet<HexKey>,
  hidden: ReadonlySet<HexKey>,
): ReadonlySet<HexKey> {
  if (hidden.size === 0) return visible
  let overlap = false
  for (const key of hidden) {
    if (visible.has(key)) {
      overlap = true
      break
    }
  }
  if (!overlap) return visible
  return new Set([...visible].filter((key) => !hidden.has(key)))
}

/**
 * Folds the edits into each explored answer, handing the difference on so the
 * fog can step rather than repaint: a turn spent adds what the party saw, a tap
 * of the brush adds or takes away only the hexes it touched. Anything else —
 * both moving at once, an answer skipped — is built again with no difference.
 */
export function createKnowledge(): (explored: Explored, edits: FogEdits) => Knowledge {
  let last: { exploredVersion: number; edits: FogEdits; seen: ReadonlySet<HexKey> } | null = null
  let version = 0

  return (explored, edits) => {
    version += 1
    const stepped =
      last !== null && explored.added !== null && explored.version === last.exploredVersion + 1
    const sameExplored = last !== null && explored.version === last.exploredVersion
    const sameEdits = last !== null && last.edits === edits

    let answer: Knowledge
    if (last && stepped && sameEdits) {
      const before = last.seen
      const added = new Set<HexKey>()
      for (const key of explored.added ?? NONE) {
        if (!before.has(key) && !edits.hidden.has(key)) added.add(key)
      }
      let seen = explored.seen
      if (!untouched(edits)) {
        const next = new Set(before)
        for (const key of added) next.add(key)
        seen = next
      }
      answer = { seen, added, lost: NONE, version }
    } else if (last && sameExplored) {
      const before = last.seen
      const touched = new Set([
        ...last.edits.revealed,
        ...last.edits.hidden,
        ...edits.revealed,
        ...edits.hidden,
      ])
      const added = new Set<HexKey>()
      const lost = new Set<HexKey>()
      for (const key of touched) {
        const now = !edits.hidden.has(key) && (edits.revealed.has(key) || explored.seen.has(key))
        if (now && !before.has(key)) added.add(key)
        if (!now && before.has(key)) lost.add(key)
      }
      let seen: ReadonlySet<HexKey> = before
      if (untouched(edits)) seen = explored.seen
      else if (added.size > 0 || lost.size > 0) {
        const next = new Set(before)
        for (const key of added) next.add(key)
        for (const key of lost) next.delete(key)
        seen = next
      }
      answer = { seen, added, lost, version }
    } else {
      answer = { seen: knownSet(explored.seen, edits), added: null, lost: NONE, version }
    }

    last = { exploredVersion: explored.version, edits, seen: answer.seen }
    return answer
  }
}
