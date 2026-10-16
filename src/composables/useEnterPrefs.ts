import { ref, watch, type Ref } from 'vue'

const NAME_KEY = 'hexcrawl.name'
const CHOICE_KEY = 'hexcrawl.enterChoice'

export const ENTER_CHOICES = ['host', 'join', 'prepare'] as const
export type EnterChoice = (typeof ENTER_CHOICES)[number]

type PrefStorage = Pick<Storage, 'getItem' | 'setItem'>

const isChoice = (value: string | null): value is EnterChoice =>
  ENTER_CHOICES.some((choice) => choice === value)

// Reaching for localStorage can itself throw, with site data blocked.
const browserStorage = (): PrefStorage | null => {
  try {
    return localStorage
  } catch {
    return null
  }
}

/**
 * The name last typed and the way in last taken, so the enter screen greets a
 * returning visitor where they left. Kept in this browser, never with a map.
 */
export function useEnterPrefs(storage: PrefStorage | null = browserStorage()): {
  name: Ref<string>
  choice: Ref<EnterChoice | null>
} {
  const read = (key: string): string | null => {
    try {
      return storage?.getItem(key) ?? null
    } catch {
      return null
    }
  }

  const write = (key: string, value: string): void => {
    try {
      storage?.setItem(key, value)
    } catch {
      // Without storage the choice still holds for this visit.
    }
  }

  const name = ref(read(NAME_KEY) ?? '')
  const stored = read(CHOICE_KEY)
  const choice = ref<EnterChoice | null>(isChoice(stored) ? stored : null)

  watch(name, (next) => write(NAME_KEY, next), { flush: 'sync' })
  watch(choice, (next) => next && write(CHOICE_KEY, next), { flush: 'sync' })

  return { name, choice }
}
