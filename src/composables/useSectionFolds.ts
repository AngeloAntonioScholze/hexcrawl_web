import { reactive } from 'vue'

const STORAGE_KEY = 'hexcrawl.sectionFolds'

type FoldStorage = Pick<Storage, 'getItem' | 'setItem'>

export interface SectionFolds {
  isFolded: (key: string) => boolean
  toggle: (key: string) => void
}

// Reaching for localStorage can itself throw, with site data blocked.
const browserStorage = (): FoldStorage | null => {
  try {
    return localStorage
  } catch {
    return null
  }
}

// Keys of sections no longer in the app are kept as they are: they cost nothing.
const parse = (raw: string | null): string[] => {
  if (raw === null) return []
  try {
    const value: unknown = JSON.parse(raw)
    return Array.isArray(value) && value.every((one) => typeof one === 'string') ? value : []
  } catch {
    return []
  }
}

const createFolds = (storage: FoldStorage | null): SectionFolds => {
  const read = (): string | null => {
    try {
      return storage?.getItem(STORAGE_KEY) ?? null
    } catch {
      return null
    }
  }

  let folded: Set<string> | null = null
  const keys = (): Set<string> => (folded ??= reactive(new Set(parse(read()))))

  return {
    isFolded: (key) => keys().has(key),
    toggle: (key) => {
      const set = keys()
      if (set.has(key)) set.delete(key)
      else set.add(key)
      try {
        storage?.setItem(STORAGE_KEY, JSON.stringify([...set].sort()))
      } catch {
        // Without storage the folds still hold for this visit.
      }
    },
  }
}

let shared: SectionFolds | null = null

/**
 * Which panel sections are folded. Every section starts open; only the folded
 * ones are kept, in this browser and never with a map.
 */
export function useSectionFolds(storage?: FoldStorage | null): SectionFolds {
  if (storage !== undefined) return createFolds(storage)
  shared ??= createFolds(browserStorage())
  return shared
}
