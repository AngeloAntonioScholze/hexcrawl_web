import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { capture, setView } from '../analytics/analytics'
import { useHexMapStore } from '../stores/hexMap'
import { useSessionStore } from '../stores/session'
import { readPlayerView, useViewMode, writePlayerView } from './useViewMode'

vi.mock('../analytics/analytics', () => ({ capture: vi.fn(), setView: vi.fn() }))

beforeEach(() => {
  vi.mocked(capture).mockClear()
  vi.mocked(setView).mockClear()
  setActivePinia(createPinia())
  const stored = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  })
})

describe('useViewMode', () => {
  it("opens on the DM's view when this browser never chose", () => {
    const store = useHexMapStore()
    useViewMode(store, useSessionStore())
    expect(store.dmView).toBe(true)
  })

  it("keeps the players' view across a reload", async () => {
    const store = useHexMapStore()
    useViewMode(store, useSessionStore())
    store.dmView = false
    await nextTick()
    expect(readPlayerView()).toBe(true)

    setActivePinia(createPinia())
    const reloaded = useHexMapStore()
    useViewMode(reloaded, useSessionStore())
    expect(reloaded.dmView).toBe(false)
  })

  it('forgets the peek once the DM goes back to their own view', async () => {
    writePlayerView(true)
    const store = useHexMapStore()
    useViewMode(store, useSessionStore())
    store.dmView = true
    await nextTick()
    expect(readPlayerView()).toBe(false)
  })

  it("neither hands a guest this browser's choice nor keeps a guest's view", async () => {
    writePlayerView(true)
    const store = useHexMapStore()
    const session = useSessionStore()
    session.role = 'guest'
    useViewMode(store, session)
    expect(store.dmView).toBe(true)

    writePlayerView(false)
    store.dmView = false
    await nextTick()
    expect(readPlayerView()).toBe(false)
  })

  it('still works without storage', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(readPlayerView()).toBe(false)
    expect(() => writePlayerView(true)).not.toThrow()
  })

  it('keeps the view super prop in step and counts no switch itself', async () => {
    const store = useHexMapStore()
    useViewMode(store, useSessionStore())
    expect(setView).toHaveBeenLastCalledWith('dm')

    store.dmView = false
    await nextTick()
    expect(setView).toHaveBeenLastCalledWith('player')

    store.dmView = true
    await nextTick()
    expect(setView).toHaveBeenLastCalledWith('dm')
    expect(capture).not.toHaveBeenCalled()
  })

  it("sends a guest's view as the players', whatever this browser's switch says", async () => {
    const store = useHexMapStore()
    const session = useSessionStore()
    useViewMode(store, session)

    session.role = 'guest'
    await nextTick()
    expect(setView).toHaveBeenLastCalledWith('player')
  })
})
