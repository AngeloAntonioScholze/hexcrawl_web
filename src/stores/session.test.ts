import { createPinia, getActivePinia, setActivePinia, type Pinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { capture } from '../analytics/analytics'
import { proves, seatProof } from '../session/admission'
import { parseEnvelope, wrap, type SessionMessage } from '../session/messages'
import type { Session, SessionHandlers } from '../session/peer'
import { projectForPlayers } from '../session/projection'
import { secretOf } from '../session/seats'
import { crawlStore } from '../session/snapshotFixture'
import { useHexMapStore } from './hexMap'
import {
  ANSWER_TIMEOUT_MS,
  KEPT_SEAT_SECRETS,
  parseLastRoom,
  parseSeatSecrets,
  REOPEN_WINDOW_MS,
  reasonFor,
  roomLink,
  seatSlot,
  useSessionStore as sessionStoreOf,
} from './session'

/**
 * Every session store a test made, with the pinia it lives in. A room left
 * open outlives its test: its broadcasts wait on a timer, real or fake, and
 * land in the shared outbox below, addressed to a guest of whichever test is
 * running by then.
 */
const stores = new Map<ReturnType<typeof sessionStoreOf>, Pinia>()

const useSessionStore = (): ReturnType<typeof sessionStoreOf> => {
  const pinia = getActivePinia()!
  const store = sessionStoreOf(pinia)
  stores.set(store, pinia)
  return store
}

vi.mock('../analytics/analytics', () => ({ capture: vi.fn() }))

const SECRET = '0123456789abcdef0123456789abcdef'

const welcome = { type: 'welcome', secret: expect.stringMatching(/^[0-9a-f]{32}$/) }

const TABLE = 'fedcba9876543210fedcba9876543210'
const OTHER_TABLE = '00112233445566778899aabbccddeeff'
const NONCE = 'aaaaaaaaaaaaaaaabbbbbbbbbbbbbbbb'

const secretTo = (peerId: string): string => {
  const sent = [...opened.sent]
    .reverse()
    .find(({ message, to }) => to === peerId && message.type === 'welcome')
  return sent?.message.type === 'welcome' ? (sent.message.secret ?? '') : ''
}

const hostCode = (): string => sessionStoreOf(getActivePinia()!).code ?? ''

const nonceTo = (peerId: string): string => {
  const sent = [...opened.sent]
    .reverse()
    .find(({ message, to }) => to === peerId && message.type === 'challenge')
  return sent?.message.type === 'challenge' ? sent.message.nonce : ''
}

const ANSWERS = new Set(['welcome', 'pending', 'refused'])

const answerTo = (peerId: string, after: number): SessionMessage | undefined =>
  opened.sent.slice(after).find(({ message, to }) => to === peerId && ANSWERS.has(message.type))
    ?.message

/** Waits for the host to answer a peer's hello, its proof checked off the main line. */
const answered = async (peerId: string, after: number): Promise<SessionMessage> => {
  await vi.waitFor(() => {
    if (!answerTo(peerId, after)) throw new Error(`no answer to ${peerId} yet`)
  })
  return answerTo(peerId, after)!
}

/**
 * A guest connecting to the host and saying hello, with a proof of `secret`
 * made for the nonce it was challenged with and the room it dialled (this
 * one, unless given) when it holds one, and the answer it gets.
 */
const comeIn = async (
  peerId: string,
  name: string,
  secret?: string,
  dialled = hostCode(),
): Promise<SessionMessage> => {
  opened.handlers?.peer?.(peerId, true)
  const after = opened.sent.length
  const proof =
    secret === undefined ? undefined : await seatProof(secret, nonceTo(peerId), dialled, name)
  opened.handlers?.message?.(
    proof === undefined ? { type: 'hello', name } : { type: 'hello', name, proof },
    peerId,
  )
  return answered(peerId, after)
}

/** The tokens the host last told a peer it plays; the map may have gone out to it since. */
const lastSeat = (peerId: string) =>
  opened.sent.filter(({ message, to }) => to === peerId && message.type === 'seat').at(-1)

const lastHello = (): SessionMessage | undefined =>
  [...opened.sent].reverse().find(({ message }) => message.type === 'hello')?.message

/** Waits for a guest's hello, its proof made off the main line. */
const helloSent = async (after: number): Promise<SessionMessage> => {
  await vi.waitFor(() => {
    if (!opened.sent.slice(after).some(({ message }) => message.type === 'hello'))
      throw new Error('no hello yet')
  })
  return lastHello()!
}

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
  const fake = (role: Session['role'], code: string, handlers: SessionHandlers): Session => ({
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
      // As the real one does, closing reports back through its own handlers.
      handlers.status?.('closed')
    },
  })
  return {
    ...actual,
    hostRoom: async (handlers: SessionHandlers, options: { code?: string }) => {
      opened.handlers = handlers
      opened.options = options
      if (opened.refuse) throw new actual.SessionError(opened.refuse, 'refused')
      handlers.status?.('open')
      return fake('host', options.code ?? 'hexcrawl-abcdef', handlers)
    },
    joinRoom: async (input: string, handlers: SessionHandlers) => {
      opened.handlers = handlers
      opened.joins.push(input)
      handlers.status?.('connecting')
      return fake('guest', input.startsWith('hexcrawl-') ? input : `hexcrawl-${input}`, handlers)
    },
  }
})

beforeEach(() => {
  vi.mocked(capture).mockClear()
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
  return () => {
    for (const [store, pinia] of stores) {
      setActivePinia(pinia)
      store.leave()
    }
    stores.clear()
  }
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

describe('the stored seat secrets', () => {
  it('files a seat by table and name, matched as the door matches names', () => {
    expect(seatSlot(TABLE, ' MI​RA ')).toBe(seatSlot(TABLE, 'Mira'))
    expect(seatSlot(TABLE, 'Mira')).not.toBe(seatSlot(TABLE, 'Tobin'))
    expect(seatSlot(TABLE, 'Mira')).not.toBe(seatSlot(OTHER_TABLE, 'Mira'))
  })

  it('reads each seat slot to its secret', () => {
    const slot = seatSlot(TABLE, 'Tobin')
    expect(parseSeatSecrets(JSON.stringify({ [slot]: SECRET }))).toEqual(new Map([[slot, SECRET]]))
  })

  it('is empty or skips entries when it is not one', () => {
    expect(parseSeatSecrets(null).size).toBe(0)
    expect(parseSeatSecrets('{not json').size).toBe(0)
    expect(parseSeatSecrets('[1]').size).toBe(0)
    expect(parseSeatSecrets('"x"').size).toBe(0)
    expect(
      parseSeatSecrets(
        JSON.stringify({ a: 7, b: SECRET, c: SECRET.toUpperCase(), d: `${SECRET}0`, e: 'x' }),
      ),
    ).toEqual(new Map([['b', SECRET]]))
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

    expect(opened.sent).toEqual([
      {
        message: {
          type: 'challenge',
          nonce: expect.stringMatching(/^[0-9a-f]{32}$/),
          table: useHexMapStore().snapshot.tableId,
        },
        to: 'guest-1',
      },
    ])
    expect(session.players).toEqual([])

    opened.handlers?.message?.({ type: 'hello', name: 'Tobin' }, 'guest-1')
    expect(opened.sent.at(-2)).toEqual({ message: welcome, to: 'guest-1' })
    expect(session.players).toEqual([{ name: 'Tobin', peerId: 'guest-1' }])

    opened.handlers?.peer?.('guest-1', false)
    expect(session.players).toEqual([{ name: 'Tobin', peerId: null }])
  })

  it('challenges each connection with a nonce of its own', async () => {
    await useSessionStore().host('Mara')
    opened.handlers?.peer?.('guest-1', true)
    opened.handlers?.peer?.('guest-2', true)
    expect(nonceTo('guest-1')).toMatch(/^[0-9a-f]{32}$/)
    expect(nonceTo('guest-1')).not.toBe(nonceTo('guest-2'))
  })

  it('keeps one row per name when a player comes back', async () => {
    const session = useSessionStore()
    await session.host('Mara')
    await comeIn('guest-1', 'Tobin')
    opened.handlers?.peer?.('guest-1', false)
    session.setLocked(true)

    const secret = secretTo('guest-1')
    expect(await comeIn('guest-2', 'tobin ', secret)).toEqual({ type: 'welcome' })
    expect(session.players).toEqual([{ name: 'Tobin', peerId: 'guest-2' }])
    expect(JSON.stringify(opened.sent.filter(({ to }) => to === 'guest-2'))).not.toContain(secret)
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
      message: { type: 'seat', entityIds: [token.id] },
      to: 'guest-1',
    })
  })

  it('tells a connected player at once of a token the DM hands them, and of one taken back', async () => {
    const session = useSessionStore()
    const map = useHexMapStore()
    await session.host('Mara')
    opened.handlers?.message?.({ type: 'hello', name: 'Tobin' }, 'guest-1')
    opened.handlers?.message?.({ type: 'hello', name: 'Ilse' }, 'guest-2')
    const token = map.entities.at(-2)!
    const mule = map.addEntity('the mule')!
    opened.sent = []

    // The map itself goes out too; only the seat messages are of interest here.
    const seats = () => opened.sent.filter(({ message }) => message.type === 'seat')

    map.assignEntity(mule.id, 'Tobin')
    await nextTick()
    expect(seats()).toEqual([
      { message: { type: 'seat', entityIds: [token.id, mule.id] }, to: 'guest-1' },
    ])

    map.assignEntity(mule.id, null)
    await nextTick()
    expect(seats().at(-1)).toEqual({
      message: { type: 'seat', entityIds: [token.id] },
      to: 'guest-1',
    })
    expect(session.players.map((one) => one.name)).toEqual(['Tobin', 'Ilse'])
    expect(seats().some(({ to }) => to === 'guest-2')).toBe(false)
  })

  it('hands a player coming back by name the token they had', async () => {
    const session = useSessionStore()
    const map = useHexMapStore()
    await session.host('Mara')
    opened.handlers?.message?.({ type: 'hello', name: 'Tobin' }, 'guest-1')
    const first = opened.sent.at(-1)
    opened.handlers?.peer?.('guest-1', false)
    const count = map.entities.length

    await comeIn('guest-2', ' TOBIN', secretTo('guest-1'))

    expect(map.entities).toHaveLength(count)
    expect(lastSeat('guest-2')).toEqual({ ...first, to: 'guest-2' })
  })

  it('keeps the secret it hands a newcomer with the map', async () => {
    const session = useSessionStore()
    const map = useHexMapStore()
    await session.host('Mara')
    opened.handlers?.message?.({ type: 'hello', name: 'Tobin' }, 'guest-1')

    expect(secretOf(map.snapshot.seatSecrets, 'tobin')).toBe(secretTo('guest-1'))
    expect(map.snapshot.seatSecrets).toEqual([{ name: 'Tobin', secret: secretTo('guest-1') }])
  })

  it('will not seat a name typed by someone without its secret', async () => {
    const session = useSessionStore()
    const map = useHexMapStore()
    await session.host('Mara')
    opened.handlers?.message?.({ type: 'hello', name: 'Tobin' }, 'guest-1')
    opened.handlers?.peer?.('guest-1', false)
    const count = map.entities.length

    for (const [peer, secret] of [
      ['guest-2', undefined],
      ['guest-3', SECRET],
    ] as const) {
      expect(await comeIn(peer, 'Tobin', secret)).toEqual({ type: 'refused', reason: 'name-taken' })
    }
    expect(opened.dropped).toEqual(['guest-2', 'guest-3'])
    expect(map.entities).toHaveLength(count)
    expect(session.players).toEqual([{ name: 'Tobin', peerId: null }])
  })

  it('takes no proof made for another connection', async () => {
    const session = useSessionStore()
    await session.host('Mara')
    await comeIn('guest-1', 'Tobin')
    const secret = secretTo('guest-1')
    opened.handlers?.peer?.('guest-1', false)
    session.setLocked(true)

    // A proof seen on one connection, played back on the next.
    opened.handlers?.peer?.('guest-2', true)
    const seen = await seatProof(secret, nonceTo('guest-2'), hostCode(), 'Tobin')
    opened.handlers?.peer?.('guest-3', true)
    const after = opened.sent.length
    opened.handlers?.message?.({ type: 'hello', name: 'Tobin', proof: seen }, 'guest-3')
    expect(await answered('guest-3', after)).toEqual({ type: 'refused', reason: 'locked' })

    // Nor the same connection's proof twice: a hello is answered once.
    const before = opened.sent.length
    opened.handlers?.message?.({ type: 'hello', name: 'Tobin', proof: seen }, 'guest-2')
    expect(await answered('guest-2', before)).toEqual({ type: 'welcome' })
    const again = opened.sent.length
    opened.handlers?.message?.({ type: 'hello', name: 'Tobin', proof: seen }, 'guest-2')
    await new Promise((done) => setTimeout(done, 20))
    expect(answerTo('guest-2', again)).toBeUndefined()
    expect(session.players).toEqual([{ name: 'Tobin', peerId: 'guest-2' }])
  })

  it("takes no proof made for another room, relayed with this room's own nonce", async () => {
    const session = useSessionStore()
    await session.host('Mara')
    await comeIn('guest-1', 'Tobin')
    const secret = secretTo('guest-1')
    opened.handlers?.peer?.('guest-1', false)
    session.setLocked(true)

    expect(await comeIn('guest-2', 'Tobin', secret, 'hexcrawl-zzzzzz')).toEqual({
      type: 'refused',
      reason: 'locked',
    })
    expect(await comeIn('guest-3', 'Tobin', secret)).toEqual({ type: 'welcome' })
  })

  it("lets a seat's owner in past a stranger waiting under its name, and turns the stranger away", async () => {
    const session = useSessionStore()
    const map = useHexMapStore()
    await session.host('Mara')
    await comeIn('guest-1', 'Tobin')
    const secret = secretTo('guest-1')
    opened.handlers?.peer?.('guest-1', false)
    session.setApproval(true)
    const count = map.entities.length

    expect(await comeIn('guest-2', 'Tobin')).toEqual({ type: 'pending' })
    expect(session.pending).toEqual([{ peerId: 'guest-2', name: 'Tobin', claimsHeldSeat: true }])

    expect(await comeIn('guest-3', 'tobin', secret)).toEqual({ type: 'welcome' })
    expect(opened.sent.filter(({ to }) => to === 'guest-2').at(-1)).toEqual({
      message: { type: 'refused', reason: 'name-taken' },
      to: 'guest-2',
    })
    expect(opened.dropped).toContain('guest-2')
    expect(session.pending).toEqual([])
    expect(session.players).toEqual([{ name: 'Tobin', peerId: 'guest-3' }])
    expect(map.entities).toHaveLength(count)
  })

  it('forgets the secrets of the last map when the room goes on with another', async () => {
    const session = useSessionStore()
    const map = useHexMapStore()
    await session.host('Mara')
    await comeIn('guest-1', 'Tobin')
    const secret = secretTo('guest-1')
    opened.handlers?.peer?.('guest-1', false)
    session.setLocked(true)

    map.restore({
      ...map.snapshot,
      tableId: OTHER_TABLE,
      seatSecrets: [{ name: 'Tobin', secret: SECRET }],
    })
    await nextTick()

    expect(await comeIn('guest-2', 'Tobin', secret)).toEqual({ type: 'refused', reason: 'locked' })
    expect(await comeIn('guest-3', 'Tobin', SECRET)).toEqual({ type: 'welcome' })
  })

  it('drops the answer to a proof whose connection went while it was checked', async () => {
    const session = useSessionStore()
    await session.host('Mara')
    await comeIn('guest-1', 'Tobin')
    const secret = secretTo('guest-1')
    opened.handlers?.peer?.('guest-1', false)

    opened.handlers?.peer?.('guest-2', true)
    const proof = await seatProof(secret, nonceTo('guest-2'), hostCode(), 'Tobin')
    const after = opened.sent.length
    opened.handlers?.message?.({ type: 'hello', name: 'Tobin', proof }, 'guest-2')
    opened.handlers?.peer?.('guest-2', false)
    opened.handlers?.peer?.('guest-2', true)
    await new Promise((done) => setTimeout(done, 20))

    expect(answerTo('guest-2', after)).toBeUndefined()
    expect(session.players).toEqual([{ name: 'Tobin', peerId: null }])
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
      { peerId: 'guest-1', name: 'Tobin', claimsHeldSeat: false },
      { peerId: 'guest-2', name: 'Ilse', claimsHeldSeat: false },
    ])
    expect(session.players).toEqual([])

    session.accept('guest-1')
    expect(opened.sent.at(-2)).toEqual({ message: welcome, to: 'guest-1' })
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
    expect(opened.sent).toEqual([])
    expect(session.admission).toBe('asking')

    opened.handlers?.message?.({ type: 'challenge', nonce: NONCE, table: TABLE }, 'hexcrawl-abcdef')
    expect(opened.sent).toEqual([
      { message: { type: 'hello', name: 'Tobin' }, to: 'hexcrawl-abcdef' },
    ])
    expect(session.admission).toBe('asking')

    opened.handlers?.message?.({ type: 'pending' }, 'hexcrawl-abcdef')
    expect(session.admission).toBe('pending')
    opened.handlers?.message?.({ type: 'welcome', secret: SECRET }, 'hexcrawl-abcdef')
    expect(session.admission).toBe('admitted')
  })

  it('answers one challenge per connection', async () => {
    const session = useSessionStore()
    await session.join('Tobin', 'abcdef')
    opened.handlers?.peer?.('hexcrawl-abcdef', true)
    opened.handlers?.message?.({ type: 'challenge', nonce: NONCE, table: TABLE }, 'hexcrawl-abcdef')
    opened.handlers?.message?.(
      { type: 'challenge', nonce: SECRET, table: TABLE },
      'hexcrawl-abcdef',
    )
    expect(opened.sent).toHaveLength(1)
  })

  /**
   * A guest browser joining a room on the host's map: challenged at `table`,
   * let in under `secret`, or with none for a seat it proved. Gone again
   * afterwards, as after a reload.
   */
  const visit = async (code: string, name: string, table: string, secret?: string) => {
    setActivePinia(createPinia())
    const session = useSessionStore()
    await session.join(name, code)
    opened.handlers?.peer?.(code, true)
    const after = opened.sent.length
    opened.handlers?.message?.({ type: 'challenge', nonce: NONCE, table }, code)
    const hello = await helloSent(after)
    opened.handlers?.message?.(
      secret === undefined ? { type: 'welcome' } : { type: 'welcome', secret },
      code,
    )
    session.leave()
    return hello
  }

  it('proves the seat secret a map gave it in any room that map is hosted in, after a reload', async () => {
    const other = 'fedcba9876543210fedcba9876543211'
    expect(await visit('hexcrawl-abcdef', 'Tobin', TABLE, SECRET)).toEqual({
      type: 'hello',
      name: 'Tobin',
    })

    const hello = await visit('hexcrawl-zzzzzz', 'Tobin', TABLE, other)
    expect(hello).toEqual({ type: 'hello', name: 'Tobin', proof: expect.any(String) })
    const proof = hello.type === 'hello' ? hello.proof! : ''
    expect(await proves(proof, SECRET, NONCE, 'hexcrawl-zzzzzz', 'Tobin')).toBe(true)
    expect(await proves(proof, SECRET, NONCE, 'hexcrawl-abcdef', 'Tobin')).toBe(false)
    expect(JSON.stringify(opened.sent)).not.toContain(`"${SECRET}"`)

    // The secret given last is the one proved next.
    const next = await visit('hexcrawl-abcdef', 'tobin', TABLE, SECRET)
    expect(
      next.type === 'hello' &&
        (await proves(next.proof!, other, NONCE, 'hexcrawl-abcdef', 'Tobin')),
    ).toBe(true)
  })

  it('keeps the secret it has when let back in without a new one', async () => {
    await visit('hexcrawl-abcdef', 'Tobin', TABLE, SECRET)
    await visit('hexcrawl-abcdef', 'Tobin', TABLE)

    const again = await visit('hexcrawl-abcdef', 'Tobin', TABLE)
    expect(
      again.type === 'hello' &&
        (await proves(again.proof!, SECRET, NONCE, 'hexcrawl-abcdef', 'Tobin')),
    ).toBe(true)
  })

  it('proves its seat for the room it dialled, even before that room has finished opening', async () => {
    await visit('hexcrawl-abcdef', 'Tobin', TABLE, SECRET)
    setActivePinia(createPinia())
    const session = useSessionStore()
    const joining = session.join('Tobin', 'ZZZZZZ')
    expect(session.code).toBeNull()
    opened.handlers?.peer?.('hexcrawl-zzzzzz', true)
    const after = opened.sent.length
    opened.handlers?.message?.({ type: 'challenge', nonce: NONCE, table: TABLE }, 'hexcrawl-zzzzzz')
    const hello = await helloSent(after)
    await joining
    expect(
      hello.type === 'hello' &&
        (await proves(hello.proof!, SECRET, NONCE, 'hexcrawl-zzzzzz', 'Tobin')),
    ).toBe(true)
  })

  it('proves nothing at another map, whatever the room', async () => {
    await visit('hexcrawl-abcdef', 'Tobin', TABLE, SECRET)
    expect(await visit('hexcrawl-abcdef', 'Tobin', OTHER_TABLE, SECRET)).toEqual({
      type: 'hello',
      name: 'Tobin',
    })
  })

  it('keeps a secret of its own for each name it has played at a map', async () => {
    const ilse = 'fedcba9876543210fedcba9876543211'
    await visit('hexcrawl-abcdef', 'Tobin', TABLE, SECRET)
    await visit('hexcrawl-abcdef', 'Ilse', TABLE, ilse)

    const tobin = await visit('hexcrawl-abcdef', 'Tobin', TABLE, SECRET)
    const again = await visit('hexcrawl-abcdef', 'Ilse', TABLE, ilse)
    expect(
      tobin.type === 'hello' &&
        (await proves(tobin.proof!, SECRET, NONCE, 'hexcrawl-abcdef', 'Tobin')),
    ).toBe(true)
    expect(
      again.type === 'hello' &&
        (await proves(again.proof!, ilse, NONCE, 'hexcrawl-abcdef', 'Ilse')),
    ).toBe(true)
    expect(await visit('hexcrawl-abcdef', 'Ash', TABLE, SECRET)).toEqual({
      type: 'hello',
      name: 'Ash',
    })
  })

  it('says hello without a proof when what it stored is not a secret', async () => {
    localStorage.setItem(
      'hexcrawl.seatSecrets',
      JSON.stringify({ [seatSlot(TABLE, 'Tobin')]: 'not-a-secret' }),
    )
    expect(await visit('hexcrawl-abcdef', 'Tobin', TABLE, SECRET)).toEqual({
      type: 'hello',
      name: 'Tobin',
    })
    localStorage.setItem('hexcrawl.seatSecrets', '{broken')
    expect(await visit('hexcrawl-abcdef', 'Ilse', TABLE, SECRET)).toEqual({
      type: 'hello',
      name: 'Ilse',
    })
  })

  it('keeps the seat secrets of its last seats only', async () => {
    const tables = Array.from({ length: KEPT_SEAT_SECRETS + 1 }, (_, i) =>
      i.toString(16).padStart(32, '0'),
    )
    for (const table of tables) await visit('hexcrawl-abcdef', 'Tobin', table, SECRET)

    const kept = parseSeatSecrets(localStorage.getItem('hexcrawl.seatSecrets'))
    expect([...kept.keys()]).toEqual(tables.slice(1).map((table) => seatSlot(table, 'Tobin')))
  })

  it("locks a guest's selection to the token the host gave it, until it leaves", async () => {
    const session = useSessionStore()
    const map = useHexMapStore()
    await session.join('Tobin', 'abcdef')
    opened.handlers?.peer?.('hexcrawl-abcdef', true)
    opened.handlers?.message?.({ type: 'welcome', secret: SECRET }, 'hexcrawl-abcdef')

    opened.handlers?.message?.({ type: 'seat', entityIds: ['e-tobin'] }, 'hexcrawl-abcdef')
    expect(map.seatedIds).toEqual(['e-tobin'])
    expect(map.selectedId).toBe('e-tobin')

    session.leave()
    expect(map.seatedIds).toBeNull()
  })

  it('unseats a guest the DM removes', async () => {
    const session = useSessionStore()
    const map = useHexMapStore()
    await session.join('Tobin', 'abcdef')
    opened.handlers?.peer?.('hexcrawl-abcdef', true)
    opened.handlers?.message?.({ type: 'seat', entityIds: ['e-tobin'] }, 'hexcrawl-abcdef')

    opened.handlers?.message?.({ type: 'kicked' }, 'hexcrawl-abcdef')
    expect(session.status).toBe('error')
    expect(map.seatedIds).toBeNull()
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
    opened.handlers?.message?.({ type: 'welcome', secret: SECRET }, 'hexcrawl-abcdef')

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
    opened.handlers?.message?.({ type: 'challenge', nonce: NONCE, table: TABLE }, HOST)
    opened.handlers?.message?.({ type: 'welcome', secret: SECRET }, HOST)
    opened.handlers?.message?.({ type: 'seat', entityIds: ['e-tobin'] }, HOST)
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
    expect(useHexMapStore().seatedIds).toEqual(['e-tobin'])
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
    const nonce = 'cccccccccccccccccccccccccccccccc'
    opened.handlers?.message?.({ type: 'challenge', nonce, table: TABLE }, HOST)
    const hello = await helloSent(0)
    expect(opened.sent).toHaveLength(1)
    expect(opened.sent[0].to).toBe(HOST)
    expect(
      hello.type === 'hello' && (await proves(hello.proof!, SECRET, nonce, HOST, 'Tobin')),
    ).toBe(true)
    opened.handlers?.message?.({ type: 'welcome', secret: SECRET }, HOST)
    opened.handlers?.message?.({ type: 'seat', entityIds: ['e-tobin'] }, HOST)

    expect(session.reconnecting).toBe(false)
    expect(session.admission).toBe('admitted')
    expect(useHexMapStore().seatedIds).toEqual(['e-tobin'])
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
    expect(useHexMapStore().seatedIds).toBeNull()
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

  it('gives up on a host that never asks for its hello', async () => {
    const session = useSessionStore()
    await session.join('Tobin', 'abcdef')
    opened.handlers?.peer?.(HOST, true)
    opened.handlers?.status?.('open')

    await vi.advanceTimersByTimeAsync(ANSWER_TIMEOUT_MS - 1)
    expect(session.admission).toBe('asking')
    await vi.advanceTimersByTimeAsync(1)
    expect(session.status).toBe('error')
    expect(session.error).toBe("the DM's browser didn't answer")
    expect(session.admission).toBeNull()
    expect(opened.closed).toBe(1)
  })

  it('gives up on a host that never answers its hello', async () => {
    const session = useSessionStore()
    await session.join('Tobin', 'abcdef')
    opened.handlers?.peer?.(HOST, true)
    opened.handlers?.message?.({ type: 'challenge', nonce: NONCE, table: TABLE }, HOST)
    expect(lastHello()).toEqual({ type: 'hello', name: 'Tobin' })

    await vi.advanceTimersByTimeAsync(ANSWER_TIMEOUT_MS)
    expect(session.reason).toBe('no-answer')
  })

  it('waits on the DM for as long as it takes once it is asked to', async () => {
    const session = useSessionStore()
    await session.join('Tobin', 'abcdef')
    opened.handlers?.peer?.(HOST, true)
    opened.handlers?.message?.({ type: 'challenge', nonce: NONCE, table: TABLE }, HOST)
    opened.handlers?.message?.({ type: 'pending' }, HOST)

    await vi.advanceTimersByTimeAsync(ANSWER_TIMEOUT_MS * 4)
    expect(session.admission).toBe('pending')
    expect(session.error).toBeNull()
  })

  it('tries again when the host does not answer on the way back in', async () => {
    const session = await seated()
    dmLeaves()
    await vi.advanceTimersByTimeAsync(3000)
    opened.handlers?.peer?.(HOST, true)

    await vi.advanceTimersByTimeAsync(ANSWER_TIMEOUT_MS)
    expect(session.reconnecting).toBe(true)
    expect(session.error).toBeNull()
    expect(opened.joins).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(3000)
    expect(opened.joins).toHaveLength(3)
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

  it('lets a seated player back past the lock in another room on the map, at the same token', async () => {
    const session = useSessionStore()
    const map = useHexMapStore()
    await session.host('Mara')
    opened.handlers?.message?.({ type: 'hello', name: 'Tobin' }, 'guest-1')
    const seat = opened.sent.at(-1)?.message
    const secret = secretTo('guest-1')

    await session.host('Mara', { code: 'hexcrawl-zzzzzz' })
    session.setLocked(true)
    session.setApproval(true)
    const count = map.entities.length
    opened.sent = []
    await comeIn('guest-2', 'tobin', secret)

    const told = opened.sent.filter(({ message }) => ['welcome', 'seat'].includes(message.type))
    expect(told.map(({ message }) => message)).toEqual([{ type: 'welcome' }, seat])
    expect(JSON.stringify(opened.sent)).not.toContain(secret)
    expect(map.entities).toHaveLength(count)
    expect(session.players).toEqual([{ name: 'Tobin', peerId: 'guest-2' }])
  })

  it('keeps a seated name typed without its secret out of a reopened room', async () => {
    const session = useSessionStore()
    const map = useHexMapStore()
    await session.host('Mara')
    opened.handlers?.message?.({ type: 'hello', name: 'Tobin' }, 'guest-1')
    const token = map.entities.at(-1)!

    await session.host('Mara', { code: HOST })
    session.setLocked(true)
    expect(await comeIn('guest-2', 'Tobin')).toEqual({ type: 'refused', reason: 'locked' })

    session.setLocked(false)
    session.setApproval(true)
    expect(await comeIn('guest-3', 'Tobin', SECRET)).toEqual({ type: 'pending' })

    // Only the DM letting them in hands the seat over, under a new secret.
    session.accept('guest-3')
    expect(secretTo('guest-3')).not.toBe(secretTo('guest-1'))
    expect(secretOf(map.snapshot.seatSecrets, 'Tobin')).toBe(secretTo('guest-3'))
    expect(opened.sent.at(-1)).toEqual({
      message: { type: 'seat', entityIds: [token.id] },
      to: 'guest-3',
    })
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

  it('hands a seat from before secrets to the first the door lets in, under a new secret', async () => {
    const session = useSessionStore()
    const map = useHexMapStore()
    await session.host('Mara')
    opened.handlers?.message?.({ type: 'hello', name: 'Tobin' }, 'guest-1')
    const token = map.entities.at(-1)!
    map.restore({ ...map.snapshot, seatSecrets: [] })

    await session.host('Mara', { code: HOST })
    session.setLocked(true)
    expect(await comeIn('guest-2', 'Tobin', SECRET)).toEqual({ type: 'refused', reason: 'locked' })

    session.setLocked(false)
    expect(await comeIn('guest-3', 'Tobin')).toEqual(welcome)
    expect(secretOf(map.snapshot.seatSecrets, 'Tobin')).toBe(secretTo('guest-3'))
    expect(lastSeat('guest-3')).toEqual({
      message: { type: 'seat', entityIds: [token.id] },
      to: 'guest-3',
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

  it('counts the map arriving once for the guest, not each patch after it', async () => {
    const { map, deliver, connect } = await room()
    await connect()
    const caravan = map.entities.find((one) => one.kind === 'caravan')!
    map.addItem(caravan.id, { name: 'rope' })
    await deliver()

    const loaded = vi.mocked(capture).mock.calls.filter(([event]) => event === 'map_loaded')
    expect(loaded).toEqual([['map_loaded', { source: 'session' }]])
  })

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

describe('usage stats', () => {
  const HOST = 'hexcrawl-abcdef'
  const events = () => vi.mocked(capture).mock.calls

  it('counts a room hosted', async () => {
    await useSessionStore().host('Mara')
    expect(events()).toEqual([['session_hosted']])
  })

  it("counts the DM's answer to a guest waiting at the door", async () => {
    const session = useSessionStore()
    await session.host('Mara')
    session.setApproval(true)
    opened.handlers?.message?.({ type: 'hello', name: 'Tobin' }, 'guest-1')
    opened.handlers?.message?.({ type: 'hello', name: 'Ilse' }, 'guest-2')
    vi.mocked(capture).mockClear()

    session.accept('guest-1')
    session.decline('guest-2')
    session.decline('guest-2')

    expect(events()).toEqual([
      ['session_join_decided', { decision: 'approved' }],
      ['session_join_decided', { decision: 'declined' }],
    ])
  })

  it('counts a guest let in once, not again when it gets back in after a drop', async () => {
    vi.useFakeTimers()
    try {
      const session = useSessionStore()
      await session.join('Tobin', 'abcdef')
      opened.handlers?.peer?.(HOST, true)
      opened.handlers?.status?.('open')
      opened.handlers?.message?.({ type: 'welcome', secret: SECRET }, HOST)
      expect(events()).toEqual([['session_joined']])

      opened.handlers?.peer?.(HOST, false)
      opened.handlers?.status?.('closed')
      await vi.advanceTimersByTimeAsync(3000)
      opened.handlers?.peer?.(HOST, true)
      opened.handlers?.status?.('open')
      opened.handlers?.message?.({ type: 'welcome', secret: SECRET }, HOST)

      expect(session.admission).toBe('admitted')
      expect(events()).toEqual([['session_joined']])
    } finally {
      vi.useRealTimers()
    }
  })
})
