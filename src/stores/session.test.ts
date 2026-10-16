import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionMessage } from '../session/messages'
import type { Session, SessionHandlers } from '../session/peer'
import { parseLastRoom, REOPEN_WINDOW_MS, reasonFor, roomLink, useSessionStore } from './session'

const opened = vi.hoisted(() => ({
  handlers: null as SessionHandlers | null,
  sent: [] as { message: SessionMessage; to?: string }[],
  dropped: [] as string[],
  closed: 0,
  options: undefined as { code?: string } | undefined,
  refuse: null as string | null,
}))

vi.mock('../session/peer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../session/peer')>()
  const fake = (role: Session['role'], code: string): Session => ({
    role,
    code,
    send: (message, to) => opened.sent.push({ message, to }),
    drop: (peerId) => opened.dropped.push(peerId),
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
      handlers.status?.('connecting')
      return fake('guest', `hexcrawl-${input}`)
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
    expect(opened.sent.at(-1)).toEqual({ message: { type: 'welcome' }, to: 'guest-1' })
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
    expect(opened.sent.at(-1)).toEqual({ message: { type: 'welcome' }, to: 'guest-2' })
    expect(session.players).toEqual([{ name: 'Tobin', peerId: 'guest-2' }])
  })

  it('ignores a second hello on the same connection', async () => {
    const session = useSessionStore()
    await session.host('Mara')
    opened.handlers?.message?.({ type: 'hello', name: 'Tobin' }, 'guest-1')
    opened.handlers?.message?.({ type: 'hello', name: 'Tobin' }, 'guest-1')
    expect(opened.sent).toHaveLength(1)
    expect(opened.dropped).toEqual([])
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
    expect(opened.sent.at(-1)).toEqual({ message: { type: 'welcome' }, to: 'guest-1' })
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
