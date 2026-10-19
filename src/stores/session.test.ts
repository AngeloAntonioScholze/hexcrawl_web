import { createPinia, getActivePinia, setActivePinia, type Pinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseEnvelope, wrap, type SessionMessage } from '../session/messages'
import type { Session, SessionHandlers } from '../session/peer'
import { projectForPlayers } from '../session/projection'
import { crawlStore } from '../session/snapshotFixture'
import { useHexMapStore } from './hexMap'
import { parseLastRoom, REOPEN_WINDOW_MS, reasonFor, roomLink, useSessionStore } from './session'

const opened = vi.hoisted(() => ({
  handlers: null as SessionHandlers | null,
  sent: [] as { message: SessionMessage; to?: string }[],
  dropped: [] as string[],
  closed: 0,
  options: undefined as { code?: string } | undefined,
  refuse: null as string | null,
  joins: [] as string[],
}))

vi.mock('../session/peer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../session/peer')>()
  const fake = (role: Session['role'], code: string): Session => ({
    role,
    code,
    send: (message, to) => opened.sent.push({ message, to }),
    drop: (peerId) => opened.dropped.push(peerId),
    channel: (peerId) => ({
      send: (message) => opened.sent.push({ message, to: peerId }),
      bufferedAmount: 0,
      drained: () => Promise.resolve(),
    }),
    close: () => {
      opened.closed++
      // As the real one does, closing reports back through the handlers.
      opened.handlers?.status?.('closed')
    },
  })
  return {
    ...actual,
    hostRoom: async (handlers: SessionHandlers, options: { code?: string }) => {
      opened.handlers = handlers
      opened.options = options
      if (opened.refuse) throw new actual.SessionError(opened.refuse, 'refused')
      handlers.status?.('open')
      return fake('host', options.code ?? 'hexcrawl-abcdef')
    },
    joinRoom: async (input: string, handlers: SessionHandlers) => {
      opened.handlers = handlers
      opened.joins.push(input)
      handlers.status?.('connecting')
      return fake('guest', input.startsWith('hexcrawl-') ? input : `hexcrawl-${input}`)
    },
  }
})

beforeEach(() => {
  setActivePinia(createPinia())
  opened.handlers = null
  opened.sent = []
  opened.dropped = []
  opened.closed = 0
  opened.options = undefined
  opened.refuse = null
  opened.joins = []
  const stored = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
  })
})

describe('reasons', () => {
  it('names what a player can do something about', () => {
    expect(reasonFor('peer-unavailable')).toBe('no-room')
    expect(reasonFor('negotiation-failed')).toBe('network-blocked')
    expect(reasonFor('network')).toBe('unreachable')
    expect(reasonFor('server-error')).toBe('unreachable')
    expect(reasonFor('socket-error')).toBe('unreachable')
    expect(reasonFor('unavailable-id')).toBe('room-taken')
    expect(reasonFor('something-new')).toBe('unknown')
    expect(reasonFor(undefined)).toBe('unknown')
  })
})

describe('the room link', () => {
  it('carries only the part of the code a player types', () => {
    expect(roomLink('https://x.dev', '/hexcrawl_web/', 'hexcrawl-abcdef')).toBe(
      'https://x.dev/hexcrawl_web/?room=abcdef',
    )
  })
})

describe('the last hosted room', () => {
  const now = 1_000_000_000_000
  const stored = (code: string, at: number): string => JSON.stringify({ code, at })

  it('is offered again within the window', () => {
    expect(parseLastRoom(stored('hexcrawl-abcdef', now - 1000), now)).toEqual({
      code: 'hexcrawl-abcdef',
      at: now - 1000,
    })
  })

  it('is forgotten once the window has passed', () => {
    expect(parseLastRoom(stored('hexcrawl-abcdef', now - REOPEN_WINDOW_MS - 1), now)).toBeNull()
  })

  it('is ignored when it is not one', () => {
    expect(parseLastRoom(null, now)).toBeNull()
    expect(parseLastRoom('{not json', now)).toBeNull()
    expect(parseLastRoom(stored('nope', now), now)).toBeNull()
    expect(parseLastRoom(JSON.stringify({ code: 'hexcrawl-abcdef' }), now)).toBeNull()
  })
})

describe('the session store', () => {
  it('hosts a room and remembers its code', async () => {
    const session = useSessionStore()
    await session.host('  Mara  ')

    expect(session.status).toBe('open')
    expect(session.role).toBe('host')
    expect(session.code).toBe('hexcrawl-abcdef')
    expect(session.myName).toBe('Mara')
    expect(JSON.parse(localStorage.getItem('hexcrawl.lastRoom') ?? '{}').code).toBe(
      'hexcrawl-abcdef',
    )
  })

  it('reopens the code it is given', async () => {
    const session = useSessionStore()
    await session.host('Mara', { code: 'hexcrawl-zzzzzz' })
    expect(opened.options).toEqual({ code: 'hexcrawl-zzzzzz' })
    expect(session.code).toBe('hexcrawl-zzzzzz')
  })

  it('says so in plain words when the room cannot be opened', async () => {
    opened.refuse = 'unavailable-id'
    const session = useSessionStore()
    await session.host('Mara', { code: 'hexcrawl-zzzzzz' })
    expect(session.status).toBe('error')
    expect(session.error).toBe('that room is already open somewhere else')
  })

  it('greets each newcomer and lets them in by name', async () => {
    const session = useSessionStore()
    await session.host('Mara')
    opened.handlers?.peer?.('guest-1', true)

    expect(opened.sent).toEqual([{ message: { type: 'hello', name: 'Mara' }, to: 'guest-1' }])
    expect(session.players).toEqual([])

    opened.handlers?.message?.({ type: 'hello', name: 'Tobin' }, 'guest-1')
    expect(opened.sent.at(-2)).toEqual({ message: { type: 'welcome' }, to: 'guest-1' })
    expect(session.players).toEqual([{ name: 'Tobin', peerId: 'guest-1' }])

    opened.handlers?.peer?.('guest-1', false)
    expect(session.players).toEqual([{ name: 'Tobin', peerId: null }])
  })

  it('keeps one row per name when a player comes back', async () => {
    const session = useSessionStore()
    await session.host('Mara')
    opened.handlers?.message?.({ type: 'hello', name: 'Tobin' }, 'guest-1')
    opened.handlers?.peer?.('guest-1', false)
    session.setLocked(true)

    opened.handlers?.message?.({ type: 'hello', name: 'tobin ' }, 'guest-2')
    expect(opened.sent.at(-2)).toEqual({ message: { type: 'welcome' }, to: 'guest-2' })
    expect(session.players).toEqual([{ name: 'Tobin', peerId: 'guest-2' }])
  })

  it('ignores a second hello on the same connection', async () => {
    const session = useSessionStore()
    await session.host('Mara')
    opened.handlers?.message?.({ type: 'hello', name: 'Tobin' }, 'guest-1')
    opened.handlers?.message?.({ type: 'hello', name: 'Tobin' }, 'guest-1')
    expect(opened.sent.map(({ message }) => message.type)).toEqual(['welcome', 'seat'])
    expect(opened.dropped).toEqual([])
  })

  it('gives each newcomer a token of their own, off the map', async () => {
    const session = useSessionStore()
    const map = useHexMapStore()
    await session.host('Mara')

    opened.handlers?.message?.({ type: 'hello', name: 'Tobin' }, 'guest-1')

    const token = map.entities.at(-1)!
    expect(token).toMatchObject({ name: 'Tobin', owner: 'player', kind: 'party' })
    expect(map.states.get(token.id)?.at ?? null).toBeNull()
    expect(opened.sent.at(-1)).toEqual({
      message: { type: 'seat', entityId: token.id },
      to: 'guest-1',
    })
  })

  it('hands a player coming back by name the token they had', async () => {
    const session = useSessionStore()
    const map = useHexMapStore()
    await session.host('Mara')
    opened.handlers?.message?.({ type: 'hello', name: 'Tobin' }, 'guest-1')
    const first = opened.sent.at(-1)
    opened.handlers?.peer?.('guest-1', false)
    const count = map.entities.length

    opened.handlers?.message?.({ type: 'hello', name: ' TOBIN' }, 'guest-2')

    expect(map.entities).toHaveLength(count)
    expect(opened.sent.at(-1)).toEqual({ ...first, to: 'guest-2' })
  })

  it('seats a newcomer while the DM is looking at the player view', async () => {
    const session = useSessionStore()
    const map = useHexMapStore()
    map.dmView = false
    await session.host('Mara')

    opened.handlers?.message?.({ type: 'hello', name: 'Tobin' }, 'guest-1')

    expect(map.entities.at(-1)?.name).toBe('Tobin')
    expect(opened.sent.at(-1)?.message.type).toBe('seat')
  })

  it('seats nobody who is waiting or turned away', async () => {
    const session = useSessionStore()
    const map = useHexMapStore()
    await session.host('Mara')
    session.setApproval(true)
    const count = map.entities.length

    opened.handlers?.message?.({ type: 'hello', name: 'Tobin' }, 'guest-1')
    session.decline('guest-1')

    expect(map.entities).toHaveLength(count)
    expect(opened.sent.map(({ message }) => message.type)).toEqual(['pending', 'refused'])
  })

  it('turns away a name already here and shows it the door', async () => {
    const session = useSessionStore()
    await session.host('Mara')
    opened.handlers?.message?.({ type: 'hello', name: 'Tobin' }, 'guest-1')
    opened.handlers?.message?.({ type: 'hello', name: 'Tobin' }, 'guest-2')

    expect(opened.sent.at(-1)).toEqual({
      message: { type: 'refused', reason: 'name-taken' },
      to: 'guest-2',
    })
    expect(opened.dropped).toEqual(['guest-2'])
    expect(session.players).toHaveLength(1)
  })

  it('turns new names away from a locked room', async () => {
    const session = useSessionStore()
    await session.host('Mara')
    session.setLocked(true)
    expect(session.locked).toBe(true)

    opened.handlers?.message?.({ type: 'hello', name: 'Tobin' }, 'guest-1')
    expect(opened.sent.at(-1)).toEqual({
      message: { type: 'refused', reason: 'locked' },
      to: 'guest-1',
    })
    expect(opened.dropped).toEqual(['guest-1'])
  })

  it('holds new names for the DM when approval is on', async () => {
    const session = useSessionStore()
    await session.host('Mara')
    session.setApproval(true)
    opened.handlers?.message?.({ type: 'hello', name: 'Tobin' }, 'guest-1')
    opened.handlers?.message?.({ type: 'hello', name: 'Ilse' }, 'guest-2')

    expect(opened.sent.at(-1)).toEqual({ message: { type: 'pending' }, to: 'guest-2' })
    expect(session.pending).toEqual([
      { peerId: 'guest-1', name: 'Tobin' },
      { peerId: 'guest-2', name: 'Ilse' },
    ])
    expect(session.players).toEqual([])

    session.accept('guest-1')
    expect(opened.sent.at(-2)).toEqual({ message: { type: 'welcome' }, to: 'guest-1' })
    expect(session.players).toEqual([{ name: 'Tobin', peerId: 'guest-1' }])

    session.decline('guest-2')
    expect(opened.sent.at(-1)).toEqual({
      message: { type: 'refused', reason: 'declined' },
      to: 'guest-2',
    })
    expect(opened.dropped).toEqual(['guest-2'])
    expect(session.pending).toEqual([])
  })

  it('forgets a waiting guest whose connection drops', async () => {
    const session = useSessionStore()
    await session.host('Mara')
    session.setApproval(true)
    opened.handlers?.message?.({ type: 'hello', name: 'Tobin' }, 'guest-1')
    opened.handlers?.peer?.('guest-1', false)
    expect(session.pending).toEqual([])
  })

  it('removes a kicked player for the rest of the session', async () => {
    const session = useSessionStore()
    await session.host('Mara')
    opened.handlers?.message?.({ type: 'hello', name: 'Tobin' }, 'guest-1')

    session.kick('Tobin')
    expect(opened.sent.at(-1)).toEqual({ message: { type: 'kicked' }, to: 'guest-1' })
    expect(opened.dropped).toEqual(['guest-1'])
    expect(session.players).toEqual([])

    opened.handlers?.peer?.('guest-1', false)
    opened.handlers?.message?.({ type: 'hello', name: 'Tobin' }, 'guest-2')
    expect(opened.sent.at(-1)).toEqual({
      message: { type: 'refused', reason: 'kicked' },
      to: 'guest-2',
    })
  })

  it('removes a player who is away without sending anything', async () => {
    const session = useSessionStore()
    await session.host('Mara')
    opened.handlers?.message?.({ type: 'hello', name: 'Tobin' }, 'guest-1')
    opened.handlers?.peer?.('guest-1', false)
    const sent = opened.sent.length

    session.kick('Tobin')
    expect(opened.sent).toHaveLength(sent)
    expect(opened.dropped).toEqual([])
    expect(session.players).toEqual([])
  })

  it('opens each hosted room with the door open', async () => {
    const session = useSessionStore()
    await session.host('Mara')
    session.setLocked(true)
    session.setApproval(true)
    opened.handlers?.message?.({ type: 'hello', name: 'Tobin' }, 'guest-1')

    await session.host('Mara')
    expect(session.locked).toBe(false)
    expect(session.approval).toBe(false)
    expect(session.pending).toEqual([])
  })

  it('follows a guest from hello to admitted', async () => {
    const session = useSessionStore()
    await session.join('Tobin', 'abcdef')
    expect(session.admission).toBeNull()

    opened.handlers?.peer?.('hexcrawl-abcdef', true)
    opened.handlers?.status?.('open')
    expect(opened.sent).toEqual([
      { message: { type: 'hello', name: 'Tobin' }, to: 'hexcrawl-abcdef' },
    ])
    expect(session.admission).toBe('asking')

    opened.handlers?.message?.({ type: 'pending' }, 'hexcrawl-abcdef')
    expect(session.admission).toBe('pending')
    opened.handlers?.message?.({ type: 'welcome' }, 'hexcrawl-abcdef')
    expect(session.admission).toBe('admitted')
  })

  it("locks a guest's selection to the token the host gave it, until it leaves", async () => {
    const session = useSessionStore()
    const map = useHexMapStore()
    await session.join('Tobin', 'abcdef')
    opened.handlers?.peer?.('hexcrawl-abcdef', true)
    opened.handlers?.message?.({ type: 'welcome' }, 'hexcrawl-abcdef')

    opened.handlers?.message?.({ type: 'seat', entityId: 'e-tobin' }, 'hexcrawl-abcdef')
    expect(map.seatedId).toBe('e-tobin')
    expect(map.selectedId).toBe('e-tobin')

    session.leave()
    expect(map.seatedId).toBeNull()
  })

  it('unseats a guest the DM removes', async () => {
    const session = useSessionStore()
    const map = useHexMapStore()
    await session.join('Tobin', 'abcdef')
    opened.handlers?.peer?.('hexcrawl-abcdef', true)
    opened.handlers?.message?.({ type: 'seat', entityId: 'e-tobin' }, 'hexcrawl-abcdef')

    opened.handlers?.message?.({ type: 'kicked' }, 'hexcrawl-abcdef')
    expect(session.status).toBe('error')
    expect(map.seatedId).toBeNull()
  })

  it('tells a refused guest why, not that the connection was lost', async () => {
    const session = useSessionStore()
    await session.join('Tobin', 'abcdef')
    opened.handlers?.peer?.('hexcrawl-abcdef', true)
    opened.handlers?.status?.('open')

    opened.handlers?.message?.({ type: 'refused', reason: 'locked' }, 'hexcrawl-abcdef')
    expect(session.status).toBe('error')
    expect(session.error).toBe('the room is locked')
    expect(session.admission).toBeNull()
    expect(opened.closed).toBe(1)
  })

  it('tells a kicked player the DM removed them', async () => {
    const session = useSessionStore()
    await session.join('Tobin', 'abcdef')
    opened.handlers?.peer?.('hexcrawl-abcdef', true)
    opened.handlers?.status?.('open')
    opened.handlers?.message?.({ type: 'welcome' }, 'hexcrawl-abcdef')

    opened.handlers?.message?.({ type: 'kicked' }, 'hexcrawl-abcdef')
    expect(session.status).toBe('error')
    expect(session.error).toBe('the DM removed you from the session')
    expect(opened.closed).toBe(1)
  })

  it('turns a missing room into words', async () => {
    const session = useSessionStore()
    await session.join('Tobin', 'abcdef')
    expect(session.status).toBe('connecting')

    opened.handlers?.status?.('error', 'Could not connect', 'peer-unavailable')
    expect(session.error).toBe('no room with that code')
    expect(opened.closed).toBe(1)
  })

  it('refuses a code that cannot be one without dialling', async () => {
    const session = useSessionStore()
    await session.join('Tobin', 'not a code')
    expect(opened.handlers).toBeNull()
    expect(session.reason).toBe('bad-code')
  })

  it('ignores a room it has already left', async () => {
    const session = useSessionStore()
    await session.join('Tobin', 'abcdef')
    const stale = opened.handlers
    session.leave()

    stale?.status?.('error', 'gone', 'network')
    stale?.peer?.('host', true)
    expect(session.status).toBe('idle')
    expect(session.error).toBeNull()
    expect(session.admission).toBeNull()
  })
})

describe('drops and resumes', () => {
  const HOST = 'hexcrawl-abcdef'

  beforeEach(() => {
    vi.useFakeTimers()
    return () => vi.useRealTimers()
  })

  /** A guest let in and seated, as the host would have it. */
  const seated = async (): Promise<ReturnType<typeof useSessionStore>> => {
    const session = useSessionStore()
    await session.join('Tobin', 'abcdef')
    opened.handlers?.peer?.(HOST, true)
    opened.handlers?.status?.('open')
    opened.handlers?.message?.({ type: 'welcome' }, HOST)
    opened.handlers?.message?.({ type: 'seat', entityId: 'e-tobin' }, HOST)
    return session
  }

  const dmLeaves = (): void => {
    opened.handlers?.peer?.(HOST, false)
    opened.handlers?.status?.('closed')
  }

  it('keeps a seated player on the frozen map while it tries the room again', async () => {
    const session = await seated()
    dmLeaves()

    expect(session.reconnecting).toBe(true)
    expect(session.status).toBe('connecting')
    expect(session.error).toBeNull()
    expect(session.role).toBe('guest')
    expect(useHexMapStore().seatedId).toBe('e-tobin')
    expect(opened.joins).toEqual(['abcdef'])

    await vi.advanceTimersByTimeAsync(2999)
    expect(opened.joins).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(opened.joins).toEqual(['abcdef', HOST])
  })

  it('says hello again on the way back in and takes the seat it is given', async () => {
    const session = await seated()
    dmLeaves()
    await vi.advanceTimersByTimeAsync(3000)
    opened.sent = []

    opened.handlers?.peer?.(HOST, true)
    opened.handlers?.status?.('open')
    expect(opened.sent).toEqual([{ message: { type: 'hello', name: 'Tobin' }, to: HOST }])
    opened.handlers?.message?.({ type: 'welcome' }, HOST)
    opened.handlers?.message?.({ type: 'seat', entityId: 'e-tobin' }, HOST)

    expect(session.reconnecting).toBe(false)
    expect(session.admission).toBe('admitted')
    expect(useHexMapStore().seatedId).toBe('e-tobin')
    await vi.advanceTimersByTimeAsync(30_000)
    expect(opened.joins).toHaveLength(2)
  })

  it('tries every few seconds while the room is not there, and gives up after ten minutes', async () => {
    const session = await seated()
    dmLeaves()

    for (let tries = 0; tries < 400 && session.reconnecting; tries++) {
      await vi.advanceTimersByTimeAsync(3000)
      opened.handlers?.status?.('error', 'Could not connect', 'peer-unavailable')
    }

    expect(session.reconnecting).toBe(false)
    expect(session.status).toBe('error')
    expect(session.error).toBe("the DM left and didn't come back")
    expect(useHexMapStore().seatedId).toBeNull()
    // The first join, then one every three seconds for ten minutes.
    expect(opened.joins).toHaveLength(201)
  })

  it('keeps trying while the host still holds the old connection under its name', async () => {
    const session = await seated()
    dmLeaves()
    await vi.advanceTimersByTimeAsync(3000)
    opened.handlers?.peer?.(HOST, true)
    opened.handlers?.message?.({ type: 'refused', reason: 'name-taken' }, HOST)

    expect(session.reconnecting).toBe(true)
    await vi.advanceTimersByTimeAsync(3000)
    expect(opened.joins).toHaveLength(3)
  })

  it('stops for good when the room turns it away for any other reason', async () => {
    const session = await seated()
    dmLeaves()
    await vi.advanceTimersByTimeAsync(3000)
    opened.handlers?.peer?.(HOST, true)
    opened.handlers?.message?.({ type: 'kicked' }, HOST)

    expect(session.reconnecting).toBe(false)
    expect(session.error).toBe('the DM removed you from the session')
    await vi.advanceTimersByTimeAsync(30_000)
    expect(opened.joins).toHaveLength(2)
  })

  it('stops trying once the player leaves', async () => {
    const session = await seated()
    dmLeaves()
    session.leave()

    expect(session.reconnecting).toBe(false)
    expect(session.status).toBe('idle')
    await vi.advanceTimersByTimeAsync(30_000)
    expect(opened.joins).toHaveLength(1)
  })

  it('does not retry a room it was never let into', async () => {
    const session = useSessionStore()
    await session.join('Tobin', 'abcdef')
    opened.handlers?.peer?.(HOST, true)
    opened.handlers?.message?.({ type: 'pending' }, HOST)
    dmLeaves()

    expect(session.reconnecting).toBe(false)
    expect(session.error).toBe('the connection to the room was lost')
    await vi.advanceTimersByTimeAsync(30_000)
    expect(opened.joins).toHaveLength(1)
  })

  it("leaves a dropped player's token where it stands, offline", async () => {
    const session = useSessionStore()
    const map = useHexMapStore()
    await session.host('Mara')
    opened.handlers?.message?.({ type: 'hello', name: 'Tobin' }, 'guest-1')
    const token = map.entities.at(-1)

    opened.handlers?.peer?.('guest-1', false)
    expect(session.players).toEqual([{ name: 'Tobin', peerId: null }])
    expect(map.entities.at(-1)).toEqual(token)
  })

  it('lets a seated player back into a reopened room past the lock, at the same token', async () => {
    const session = useSessionStore()
    const map = useHexMapStore()
    await session.host('Mara')
    opened.handlers?.message?.({ type: 'hello', name: 'Tobin' }, 'guest-1')
    const seat = opened.sent.at(-1)?.message

    await session.host('Mara', { code: HOST })
    session.setLocked(true)
    session.setApproval(true)
    const count = map.entities.length
    opened.sent = []
    opened.handlers?.message?.({ type: 'hello', name: 'tobin' }, 'guest-2')

    expect(opened.sent.map(({ message }) => message)).toEqual([{ type: 'welcome' }, seat])
    expect(map.entities).toHaveLength(count)
    expect(session.players).toEqual([{ name: 'Tobin', peerId: 'guest-2' }])
  })

  it('still keeps a new name out of a reopened, locked room', async () => {
    const session = useSessionStore()
    await session.host('Mara')
    opened.handlers?.message?.({ type: 'hello', name: 'Tobin' }, 'guest-1')

    await session.host('Mara', { code: HOST })
    session.setLocked(true)
    opened.handlers?.message?.({ type: 'hello', name: 'Ilse' }, 'guest-2')
    expect(opened.sent.at(-1)).toEqual({
      message: { type: 'refused', reason: 'locked' },
      to: 'guest-2',
    })
  })
})

describe('the map over the wire', () => {
  const HOST = 'hexcrawl-abcdef'
  const GUEST = 'guest-1'
  const syncs = new Set(['state', 'patch', 'resync'])

  beforeEach(() => {
    vi.useFakeTimers()
    return () => vi.useRealTimers()
  })

  /**
   * A DM hosting the test crawl and a player joining it, each in a browser of
   * their own, on a line that carries every message through JSON and the
   * envelope check. The fake sessions share one outbox: what the host sends
   * names the guest, and what the guest sends names the host or nobody.
   */
  const room = async () => {
    const map = crawlStore()
    const hostPinia = getActivePinia()!
    const dm = useSessionStore()
    await dm.host('Mara')
    const toHost = opened.handlers!

    const guestPinia: Pinia = createPinia()
    setActivePinia(guestPinia)
    const player = useSessionStore()
    await player.join('Tobin', 'abcdef')
    const toGuest = opened.handlers!

    /** Every message the host has put on the line to the guest. */
    const toPlayer: SessionMessage[] = []

    const deliver = async (): Promise<void> => {
      for (let round = 0; round < 50; round++) {
        setActivePinia(hostPinia)
        await vi.advanceTimersByTimeAsync(200)
        const batch = opened.sent.splice(0)
        if (batch.length === 0) return
        for (const { message, to } of batch) {
          const wire = parseEnvelope(JSON.parse(JSON.stringify(wrap(message))))
          expect(wire).not.toBeNull()
          if (to === GUEST) {
            toPlayer.push(wire!)
            setActivePinia(guestPinia)
            toGuest.message?.(wire!, HOST)
          } else {
            setActivePinia(hostPinia)
            toHost.message?.(wire!, GUEST)
          }
        }
      }
      throw new Error('the line never went quiet')
    }

    const connect = async (): Promise<void> => {
      setActivePinia(hostPinia)
      toHost.peer?.(GUEST, true)
      setActivePinia(guestPinia)
      toGuest.peer?.(HOST, true)
      toGuest.status?.('open')
      await deliver()
      setActivePinia(hostPinia)
    }

    const dmView = () => projectForPlayers(map.snapshot, map.field)
    const sinceNow = (): (() => SessionMessage[]) => {
      const from = toPlayer.length
      return () => toPlayer.slice(from).filter((one) => syncs.has(one.type))
    }

    const asGuest = (act: () => void): void => {
      setActivePinia(guestPinia)
      act()
      setActivePinia(hostPinia)
    }

    return { map, dm, player, toHost, toGuest, asGuest, deliver, connect, dmView, sinceNow }
  }

  it('starts a player off with the player view and keeps it in step', async () => {
    const { map, player, deliver, connect, dmView, sinceNow } = await room()
    const joining = sinceNow()
    await connect()

    expect(player.admission).toBe('admitted')
    expect(joining().map((one) => one.type)).toContain('state')
    expect(player.remote).toEqual(dmView())

    const changing = sinceNow()
    const caravan = map.entities.find((one) => one.kind === 'caravan')!
    map.addItem(caravan.id, { name: 'rope' })
    await deliver()

    expect(changing().map((one) => one.type)).toEqual(['patch'])
    expect(player.remote).toEqual(dmView())
    expect(player.remote?.items.map((one) => one.name)).toContain('rope')
  })

  it('folds a burst of changes into one patch', async () => {
    const { map, deliver, connect, sinceNow } = await room()
    await connect()

    const changing = sinceNow()
    const caravan = map.entities.find((one) => one.kind === 'caravan')!
    for (const name of ['rope', 'lamp', 'tent']) map.addItem(caravan.id, { name })
    await deliver()
    expect(changing().map((one) => one.type)).toEqual(['patch'])
  })

  it('never puts the hidden on the wire', async () => {
    const { map, deliver, connect, sinceNow } = await room()
    const spy = map.entities.find((one) => one.hidden)!
    const everything = sinceNow()
    await connect()
    map.addItem(spy.id, { name: 'a forged letter' })
    map.addItem(map.entities[0].id, { name: 'rope' })
    await deliver()

    const text = JSON.stringify(everything())
    expect(everything().length).toBeGreaterThan(0)
    for (const secret of [spy.id, spy.name, 'poison', 'a forged letter', 'innkeeper'])
      expect(text).not.toContain(secret)
  })

  it('sends nothing more to a kicked player', async () => {
    const { map, dm, player, deliver, connect, sinceNow } = await room()
    await connect()
    dm.kick('Tobin')
    const after = sinceNow()
    map.addItem(map.entities[0].id, { name: 'rope' })
    await deliver()
    expect(after()).toEqual([])
    expect(player.remote).toBeNull()
  })

  it('sends nothing more to a player whose connection dropped', async () => {
    const { map, toHost, deliver, connect, sinceNow } = await room()
    await connect()
    toHost.peer?.(GUEST, false)
    const after = sinceNow()
    map.addItem(map.entities[0].id, { name: 'rope' })
    await deliver()
    expect(after()).toEqual([])
  })

  it('stops sending once the DM leaves the room', async () => {
    const { map, dm, deliver, connect, sinceNow } = await room()
    await connect()
    dm.leave()
    const after = sinceNow()
    map.addItem(map.entities[0].id, { name: 'rope' })
    await deliver()
    expect(after()).toEqual([])
  })

  it('keeps the frozen map through a drop and lets it go on leaving', async () => {
    const { player, toGuest, asGuest, connect, dmView } = await room()
    await connect()
    const before = dmView()

    asGuest(() => {
      toGuest.peer?.(HOST, false)
      toGuest.status?.('closed')
    })
    expect(player.reconnecting).toBe(true)
    expect(player.remote).toEqual(before)
    asGuest(() => player.leave())
    expect(player.remote).toBeNull()
  })

  it('sends a player that lost track the whole state again', async () => {
    const { player, toHost, deliver, connect, sinceNow } = await room()
    await connect()
    const asking = sinceNow()
    toHost.message?.({ type: 'resync' }, GUEST)
    await deliver()
    expect(asking().map((one) => one.type)).toEqual(['state'])
    expect(player.remote).not.toBeNull()
  })
})
