import { describe, expect, it } from 'vitest'
import { useEnterPrefs } from './useEnterPrefs'

const memoryStorage = (seed: Record<string, string> = {}) => {
  const items = new Map(Object.entries(seed))
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  }
}

describe('useEnterPrefs', () => {
  it('starts blank in a browser that has never been here', () => {
    const { name, choice } = useEnterPrefs(memoryStorage())
    expect(name.value).toBe('')
    expect(choice.value).toBeNull()
  })

  it('remembers the name and the way in for the next visit', () => {
    const storage = memoryStorage()
    const first = useEnterPrefs(storage)
    first.name.value = 'Mira'
    first.choice.value = 'join'

    const next = useEnterPrefs(storage)
    expect(next.name.value).toBe('Mira')
    expect(next.choice.value).toBe('join')
  })

  it('ignores a stored choice it does not know', () => {
    const { choice } = useEnterPrefs(memoryStorage({ 'hexcrawl.enterChoice': 'lurk' }))
    expect(choice.value).toBeNull()
  })

  it('still works for the visit when storage throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    const { name, choice } = useEnterPrefs(broken)
    name.value = 'Mira'
    choice.value = 'host'
    expect(name.value).toBe('Mira')
    expect(choice.value).toBe('host')
  })

  it('works with no storage at all', () => {
    const { name } = useEnterPrefs(null)
    name.value = 'Mira'
    expect(name.value).toBe('Mira')
  })
})
