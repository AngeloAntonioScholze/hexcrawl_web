import { isObject, type Guard } from '../persistence/mapFile'
import type { PlayerProjection } from './projection'
import { PROJECTION_FIELDS, PROJECTION_KEYS } from './snapshotCodec'

type ListKey = {
  [K in keyof PlayerProjection]: PlayerProjection[K] extends readonly unknown[] ? K : never
}[keyof PlayerProjection]

/**
 * A list edited in place. Only positions are named, never the rows that go:
 * the rows taken out of `prev` stay behind, and every row put in is one of
 * `next`'s, at its index there.
 */
export interface ListEdit<T> {
  /** Indexes into the old list, ascending. */
  drop: number[]
  /** Rows of the new list with their indexes in it, ascending. */
  put: [number, T][]
}

export interface Patch {
  /** Fields sent whole. */
  set: Partial<PlayerProjection>
  /** List fields sent as the rows that changed. */
  edit: { [K in ListKey]?: ListEdit<PlayerProjection[K][number]> }
}

/**
 * Rows are matched by their JSON, which the projection makes canonical. The
 * rows kept are a run that keeps its order in both lists, so the new list is
 * the kept rows with the new ones slotted in where they stand.
 */
function diffList<T>(prev: readonly T[], next: readonly T[]): ListEdit<T> | 'whole' | null {
  const waiting = new Map<string, number[]>()
  next.forEach((row, index) => {
    const key = JSON.stringify(row)
    const indexes = waiting.get(key)
    if (indexes) indexes.push(index)
    else waiting.set(key, [index])
  })

  const drop: number[] = []
  const kept = new Set<number>()
  let last = -1
  prev.forEach((row, index) => {
    const indexes = waiting.get(JSON.stringify(row))
    while (indexes?.length && indexes[0] <= last) indexes.shift()
    const match = indexes?.shift()
    if (match === undefined) {
      drop.push(index)
      return
    }
    kept.add(match)
    last = match
  })

  if (kept.size === next.length && drop.length === 0) return null
  if (kept.size === 0) return 'whole'
  const put = next.flatMap((row, index): [number, T][] => (kept.has(index) ? [] : [[index, row]]))
  return { drop, put }
}

/** What changed from one projection to the next; it holds nothing that is not in `next`. */
export function diffState(prev: PlayerProjection, next: PlayerProjection): Patch {
  const patch: Patch = { set: {}, edit: {} }
  for (const key of PROJECTION_KEYS) {
    const before: unknown = prev[key]
    const after: unknown = next[key]
    if (Array.isArray(before) && Array.isArray(after)) {
      const edit = diffList(before, after)
      if (edit === 'whole') Object.assign(patch.set, { [key]: after })
      else if (edit) Object.assign(patch.edit, { [key]: edit })
    } else if (JSON.stringify(before) !== JSON.stringify(after)) {
      Object.assign(patch.set, { [key]: after })
    }
  }
  return patch
}

const isIndex = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0

const ascending = (indexes: readonly number[]): boolean =>
  indexes.every((one, at) => at === 0 || one > indexes[at - 1])

const isListEdit = (value: unknown): value is ListEdit<unknown> =>
  isObject(value) &&
  Object.keys(value).length === 2 &&
  Array.isArray(value.drop) &&
  value.drop.every(isIndex) &&
  ascending(value.drop) &&
  Array.isArray(value.put) &&
  value.put.every((one) => Array.isArray(one) && one.length === 2 && isIndex(one[0])) &&
  ascending(value.put.map((one: [number, unknown]) => one[0]))

// Only a list field's check passes an empty list.
const LIST_KEYS = new Set<string>(
  PROJECTION_KEYS.filter((key) => (PROJECTION_FIELDS[key] as Guard<unknown>)([])),
)

/**
 * A patch off the wire, or null unless it is shaped like one. The rows it puts
 * are checked once they are in place, by applyPatch.
 */
export function parsePatch(value: unknown): Patch | null {
  if (!isObject(value) || Object.keys(value).length !== 2) return null
  const { set, edit } = value
  if (!isObject(set) || !isObject(edit)) return null

  const setValid = Object.entries(set).every(
    ([key, field]) =>
      Object.hasOwn(PROJECTION_FIELDS, key) &&
      (PROJECTION_FIELDS[key as keyof PlayerProjection] as Guard<unknown>)(field),
  )
  const editValid = Object.entries(edit).every(
    ([key, field]) => LIST_KEYS.has(key) && !Object.hasOwn(set, key) && isListEdit(field),
  )
  return setValid && editValid ? (value as unknown as Patch) : null
}

function applyEdit<T>(prev: readonly T[], { drop, put }: ListEdit<T>): T[] | null {
  if (drop.some((index) => index >= prev.length)) return null
  const dropped = new Set(drop)
  const kept = prev.filter((_, index) => !dropped.has(index))
  const length = kept.length + put.length
  if (put.some(([index]) => index >= length)) return null

  const next: T[] = []
  let from = 0
  let slot = 0
  for (let index = 0; index < length; index++) {
    if (slot < put.length && put[slot][0] === index) next.push(put[slot++][1])
    else next.push(kept[from++])
  }
  return next
}

/**
 * The projection a patch leads to from `prev`, or null when the patch does not
 * fit it or leaves a list that would not pass as a projection's. Rows that did
 * not change are shared with `prev`.
 */
export function applyPatch(prev: PlayerProjection, patch: Patch): PlayerProjection | null {
  const next: Record<string, unknown> = { ...prev, ...patch.set }
  for (const [key, edit] of Object.entries(patch.edit)) {
    const list = applyEdit(prev[key as ListKey] as readonly unknown[], edit as ListEdit<unknown>)
    if (!list || !(PROJECTION_FIELDS[key as ListKey] as Guard<unknown>)(list)) return null
    next[key] = list
  }
  return next as unknown as PlayerProjection
}
