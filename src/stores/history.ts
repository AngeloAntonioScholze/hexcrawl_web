import { computed, shallowRef, type ComputedRef, type Ref } from 'vue'

/** One piece of store state the history can read and put back. */
export interface Slot<T> {
  get(): T
  set(value: T): void
}

export const slotOf = <T>(source: Ref<T>): Slot<T> => ({
  get: () => source.value,
  set: (value) => {
    source.value = value
  },
})

interface Entry {
  before: readonly unknown[]
  after: readonly unknown[]
  /** Edits that share a key and follow close on each other undo as one. */
  key: string | null
  at: number
}

export interface HistoryOptions {
  /** How many steps back are kept; the oldest fall off. */
  limit?: number
  /** How close together two edits under the same key must be to undo as one. */
  mergeMs?: number
  now?: () => number
}

export interface History {
  /**
   * Wraps an action so that whatever it changes in the slots can be taken back.
   * An action that changes nothing leaves no step behind.
   */
  track<A extends unknown[], R>(
    action: (...args: A) => R,
    mergeKey?: (...args: A) => string,
  ): (...args: A) => R
  /**
   * Opens a step that stays open across calls until `end`, for an edit spread
   * over many events, such as a drag; tracked actions inside it join it.
   */
  begin(): void
  end(): void
  undo(): boolean
  redo(): boolean
  clear(): void
  canUndo: ComputedRef<boolean>
  canRedo: ComputedRef<boolean>
}

/**
 * Undo by keeping what the slots held before and after each action. The store
 * replaces its state rather than mutating it, so a step costs a few references
 * however big the world is, and putting one back goes through the same refs
 * the actions write, which is what the save and the scene already follow.
 */
export function createHistory(
  slots: Readonly<Record<string, Slot<unknown>>>,
  { limit = 200, mergeMs = 1000, now = Date.now }: HistoryOptions = {},
): History {
  const held = Object.values(slots)
  const past = shallowRef<readonly Entry[]>([])
  const future = shallowRef<readonly Entry[]>([])
  let depth = 0
  // Once a step has been undone or redone, the next edit starts a step of its own.
  let sealed = false

  const capture = (): unknown[] => held.map((slot) => slot.get())

  // Only what the step itself changed is put back, so state written outside
  // any tracked action since then is left as it stands.
  const apply = ({ before, after }: Entry, side: 'before' | 'after'): void => {
    const values = side === 'before' ? before : after
    held.forEach((slot, index) => {
      if (!Object.is(before[index], after[index])) slot.set(values[index])
    })
  }

  const changed = (a: readonly unknown[], b: readonly unknown[]): boolean =>
    a.some((value, index) => !Object.is(value, b[index]))

  const push = (before: unknown[], after: unknown[], key: string | null): void => {
    const at = now()
    const last = past.value[past.value.length - 1]
    if (!sealed && key !== null && last?.key === key && at - last.at <= mergeMs) {
      past.value = [...past.value.slice(0, -1), { before: last.before, after, key, at }]
    } else {
      past.value = [...past.value, { before, after, key, at }].slice(-limit)
    }
    future.value = []
    sealed = false
  }

  const track: History['track'] =
    (action, mergeKey) =>
    (...args) => {
      // An action called from inside another is part of the outer step.
      if (depth > 0) return action(...args)

      const before = capture()
      depth += 1
      const result = action(...args)
      depth -= 1
      const after = capture()
      if (changed(before, after)) push(before, after, mergeKey?.(...args) ?? null)
      return result
    }

  let opened: unknown[] | null = null

  const begin = (): void => {
    if (opened) return
    opened = capture()
    depth += 1
  }

  const end = (): void => {
    if (!opened) return
    const before = opened
    opened = null
    depth -= 1
    const after = capture()
    if (changed(before, after)) push(before, after, null)
  }

  // Putting a step back in the middle of an open one would leave the open
  // step's before pointing at state that no longer stands.
  const undo = (): boolean => {
    if (opened) return false
    const last = past.value[past.value.length - 1]
    if (!last) return false
    apply(last, 'before')
    past.value = past.value.slice(0, -1)
    future.value = [...future.value, last]
    sealed = true
    return true
  }

  const redo = (): boolean => {
    if (opened) return false
    const next = future.value[future.value.length - 1]
    if (!next) return false
    apply(next, 'after')
    future.value = future.value.slice(0, -1)
    past.value = [...past.value, next]
    sealed = true
    return true
  }

  const clear = (): void => {
    past.value = []
    future.value = []
  }

  return {
    track,
    begin,
    end,
    undo,
    redo,
    clear,
    canUndo: computed(() => past.value.length > 0),
    canRedo: computed(() => future.value.length > 0),
  }
}
