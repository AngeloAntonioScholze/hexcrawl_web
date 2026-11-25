import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseEnvelope, wrap, type SessionMessage } from './messages'
import { projectForPlayers, type PlayerProjection } from './projection'
import { encodeState } from './snapshotCodec'
import { diffState } from './snapshotDiff'
import { crawlStore } from './snapshotFixture'
import {
  createCoalescer,
  createStateGuest,
  createStateHost,
  RESYNC_COOLDOWN,
  type StateChannel,
  type StateGuest,
  type StateHost,
} from './stateSync'
import { chunk } from './wireChunks'

type Store = ReturnType<typeof crawlStore>

const view = (store: Store): PlayerProjection => projectForPlayers(store.snapshot, store.field)

/** Through JSON and the envelope check, as a message crosses the wire. */
const overTheWire = (message: SessionMessage): SessionMessage => {
  const parsed = parseEnvelope(JSON.parse(JSON.stringify(wrap(message))))
  expect(parsed).not.toBeNull()
  return parsed!
}

interface Line {
  guest: StateGuest
  /** Every state and patch message the host put on the line, delivered or not. */
  sent: SessionMessage[]
  resyncs: number
  /** Return true to lose a message on its way to the guest. */
  lose: (message: SessionMessage) => boolean
}

/** A host with guests on lines that deliver at once, both ways. */
function link() {
  const lines = new Map<string, Line>()
  const channelFor = (peerId: string): StateChannel | undefined => {
    const line = lines.get(peerId)
    if (!line) return undefined
    return {
      bufferedAmount: 0,
      drained: () => Promise.resolve(),
      send(message) {
        line.sent.push(message)
        if (!line.lose(message)) line.guest.receive(overTheWire(message))
      },
    }
  }
  const host: StateHost = createStateHost({ channelFor })

  const join = (peerId: string): Line => {
    const line: Line = {
      sent: [],
      resyncs: 0,
      lose: () => false,
      guest: createStateGuest({
        send(message) {
          line.resyncs++
          host.receive(overTheWire(message), peerId)
        },
      }),
    }
    lines.set(peerId, line)
    return line
  }

  return { host, join, lines }
}

/** A crawl with the caravan off on a walk, so each turn changes what the players see. */
const walking = (): Store => {
  const store = crawlStore()
  store.select({ q: 8, r: 0 })
  return store
}

const ofType = (line: Line, type: SessionMessage['type']): SessionMessage[] =>
  line.sent.filter((message) => message.type === type)

describe('keeping a guest in step with the host', () => {
  it('starts a guest off with the whole state', async () => {
    const { host, join } = link()
    const store = walking()
    const line = join('mira')
    host.sendSnapshot('mira', view(store))
    await host.idle()

    expect(line.guest.projection).toEqual(view(store))
    expect(line.guest.seq).toBe(1)
    expect(ofType(line, 'patch')).toHaveLength(0)
  })

  it('follows several turns by patches alone', async () => {
    const { host, join } = link()
    const store = walking()
    const line = join('mira')
    host.sendSnapshot('mira', view(store))
    await host.idle()

    for (let turn = 0; turn < 4; turn++) {
      store.advanceTurn()
      host.broadcast(view(store))
      await host.idle()
      expect(line.guest.projection).toEqual(view(store))
    }
    expect(line.guest.seq).toBe(5)
    expect(new Set(ofType(line, 'state').map((m) => (m as { seq: number }).seq))).toEqual(
      new Set([1]),
    )
    expect(ofType(line, 'patch').length).toBeGreaterThanOrEqual(4)
    expect(line.resyncs).toBe(0)
  })

  it('sends nothing when nothing the players see changed', async () => {
    const { host, join } = link()
    const store = walking()
    const line = join('mira')
    host.sendSnapshot('mira', view(store))
    await host.idle()
    const before = line.sent.length

    host.broadcast(view(store))
    await host.idle()
    expect(line.sent).toHaveLength(before)
    expect(host.seq).toBe(1)
  })

  it('asks again after a lost patch and catches up', async () => {
    const { host, join } = link()
    const store = walking()
    const line = join('mira')
    host.sendSnapshot('mira', view(store))
    await host.idle()

    line.lose = (message) => message.type === 'patch'
    store.advanceTurn()
    host.broadcast(view(store))
    await host.idle()
    expect(line.guest.seq).toBe(1)

    line.lose = () => false
    store.advanceTurn()
    host.broadcast(view(store))
    await host.idle()

    expect(line.resyncs).toBe(1)
    expect(line.guest.seq).toBe(3)
    expect(line.guest.projection).toEqual(view(store))
    expect(ofType(line, 'state').at(-1)).toMatchObject({ seq: 3 })
  })

  it('puts a snapshot of many pieces back together', async () => {
    const { host, join } = link()
    const store = walking()
    store.setEntitySight(store.selectedId, 12)
    const line = join('mira')
    host.sendSnapshot('mira', view(store))
    await host.idle()

    expect(ofType(line, 'state').length).toBeGreaterThan(1)
    expect(line.guest.projection).toEqual(view(store))
  })

  it('cuts a patch too big for one message into pieces too', async () => {
    const { host, join } = link()
    const store = walking()
    const line = join('mira')
    host.sendSnapshot('mira', view(store))
    await host.idle()

    store.setEntitySight(store.selectedId, 12)
    host.broadcast(view(store))
    await host.idle()

    const patches = ofType(line, 'patch')
    expect(patches.length).toBeGreaterThan(1)
    expect(new Set(patches.map((m) => (m as { chunk: { id: number } }).chunk.id)).size).toBe(1)
    expect(line.guest.projection).toEqual(view(store))
    expect(line.resyncs).toBe(0)
  })

  it('patches the guests already in step when another joins', async () => {
    const { host, join } = link()
    const store = walking()
    const mira = join('mira')
    host.sendSnapshot('mira', view(store))
    await host.idle()

    store.advanceTurn()
    const tomas = join('tomas')
    host.sendSnapshot('tomas', view(store))
    await host.idle()

    expect(ofType(mira, 'state')).toHaveLength(1)
    expect(mira.guest.projection).toEqual(view(store))
    expect(tomas.guest.projection).toEqual(view(store))
    expect(tomas.guest.seq).toBe(2)
  })

  it('sends nothing more to a guest once removed', async () => {
    const { host, join } = link()
    const store = walking()
    const line = join('mira')
    host.sendSnapshot('mira', view(store))
    await host.idle()

    host.remove('mira')
    store.advanceTurn()
    host.broadcast(view(store))
    await host.idle()
    expect(ofType(line, 'patch')).toHaveLength(0)
  })

  it('lets a slow guest skip the versions it was too slow for', async () => {
    let release = (): void => {}
    let buffered = 0
    let waiting = false
    // Only the first wait is held up; the link is quick after that.
    let held = true
    const sent: SessionMessage[] = []
    const guest = createStateGuest({ send: () => expect.unreachable() })
    const host = createStateHost({
      channelFor: () => ({
        get bufferedAmount() {
          return buffered
        },
        drained: () => {
          waiting = true
          if (!held) {
            buffered = 0
            return Promise.resolve()
          }
          return new Promise<void>((resolve) => {
            release = () => {
              held = false
              buffered = 0
              resolve()
            }
          })
        },
        send(message) {
          sent.push(message)
          buffered += 20_000
          guest.receive(overTheWire(message))
        },
      }),
      highWater: 10_000,
    })
    const store = walking()
    host.sendSnapshot('mira', view(store))
    await host.idle()

    store.advanceTurn()
    host.broadcast(view(store))
    // Turns pass while the patch to the second is held up behind a full buffer.
    await vi.waitFor(() => expect(waiting).toBe(true))
    for (let turn = 0; turn < 3; turn++) {
      store.advanceTurn()
      host.broadcast(view(store))
    }
    release()
    await host.idle()

    const patches = sent.filter((message) => message.type === 'patch')
    expect(patches.map((m) => [(m as { base: number }).base, (m as { seq: number }).seq])).toEqual([
      [1, 2],
      [2, 5],
    ])
    expect(guest.projection).toEqual(view(store))
  })
})

describe('pacing', () => {
  it('waits for a full buffer to drain before sending more', async () => {
    const store = walking()
    store.setEntitySight(store.selectedId, 12)
    const pieces = chunk(encodeState(view(store)), { id: 0 }).length
    expect(pieces).toBeGreaterThan(2)

    let buffered = 0
    let drains = 0
    let release = (): void => {}
    const sent: SessionMessage[] = []
    const host = createStateHost({
      highWater: 20_000,
      channelFor: () => ({
        get bufferedAmount() {
          return buffered
        },
        drained() {
          drains++
          return new Promise<void>((resolve) => {
            release = () => {
              buffered = 0
              resolve()
            }
          })
        },
        send(message) {
          sent.push(message)
          buffered += JSON.stringify(message).length
        },
      }),
    })

    host.sendSnapshot('mira', view(store))
    await vi.waitFor(() => expect(drains).toBe(1))
    expect(sent).toHaveLength(2)

    while (sent.length < pieces) {
      const before = drains
      release()
      await vi.waitFor(() => expect(drains > before || sent.length === pieces).toBe(true))
    }
    await host.idle()
    expect(sent).toHaveLength(pieces)
  })

  it('gives up on a guest whose channel went away while it waited', async () => {
    let open = true
    let release = (): void => {}
    const sent: SessionMessage[] = []
    const host = createStateHost({
      highWater: 0,
      channelFor: () =>
        open
          ? {
              bufferedAmount: sent.length,
              drained: () => new Promise<void>((resolve) => (release = resolve)),
              send: (message) => void sent.push(message),
            }
          : undefined,
    })
    const store = walking()
    store.setEntitySight(store.selectedId, 12)
    host.sendSnapshot('mira', view(store))
    await vi.waitFor(() => expect(sent).toHaveLength(1))

    open = false
    release()
    await host.idle()
    expect(sent).toHaveLength(1)
  })
})

describe('resync requests from a guest', () => {
  afterEach(() => vi.useRealTimers())

  const resync: SessionMessage = { type: 'resync' }

  /** Distinct whole-state transfers sent to each guest. */
  const transfers = (sent: Map<string, SessionMessage[]>, peerId: string): number =>
    new Set(
      (sent.get(peerId) ?? [])
        .filter((message) => message.type === 'state')
        .map((message) => (message as { chunk: { id: number } }).chunk.id),
    ).size

  const setup = (held = false) => {
    const hold = { on: held }
    vi.useFakeTimers()
    const sent = new Map<string, SessionMessage[]>()
    const releases: (() => void)[] = []
    const host = createStateHost({
      highWater: 0,
      channelFor: (peerId) => ({
        get bufferedAmount() {
          return hold.on ? 1 : 0
        },
        drained: () => new Promise<void>((resolve) => releases.push(resolve)),
        send(message) {
          const list = sent.get(peerId) ?? []
          list.push(message)
          sent.set(peerId, list)
        },
      }),
    })
    return { host, sent, releases, hold }
  }

  it('serves one snapshot out of a flood', async () => {
    const { host, sent } = setup()
    host.sendSnapshot('mira', view(walking()))
    await host.idle()
    expect(transfers(sent, 'mira')).toBe(1)

    for (let i = 0; i < 50; i++) host.receive(resync, 'mira')
    await host.idle()
    expect(transfers(sent, 'mira')).toBe(2)
  })

  it('holds a resync that comes mid-snapshot and serves it once, after', async () => {
    const { host, sent, releases, hold } = setup(true)
    const store = walking()
    store.setEntitySight(store.selectedId, 12)
    host.sendSnapshot('mira', view(store))
    await vi.waitFor(() => expect(releases).toHaveLength(1))

    for (let i = 0; i < 20; i++) host.receive(resync, 'mira')
    hold.on = false
    releases.splice(0).forEach((release) => release())
    await host.idle()
    expect(transfers(sent, 'mira')).toBe(2)

    for (let i = 0; i < 20; i++) host.receive(resync, 'mira')
    await host.idle()
    expect(transfers(sent, 'mira')).toBe(2)
  })

  it('serves a resync that came too soon once the cooldown has passed', async () => {
    const { host, sent } = setup()
    host.sendSnapshot('mira', view(walking()))
    await host.idle()

    host.receive(resync, 'mira')
    await host.idle()
    expect(transfers(sent, 'mira')).toBe(2)

    vi.advanceTimersByTime(RESYNC_COOLDOWN - 1)
    for (let i = 0; i < 20; i++) host.receive(resync, 'mira')
    await host.idle()
    expect(transfers(sent, 'mira')).toBe(2)

    await vi.advanceTimersByTimeAsync(1)
    await host.idle()
    expect(transfers(sent, 'mira')).toBe(3)

    await vi.advanceTimersByTimeAsync(RESYNC_COOLDOWN * 3)
    await host.idle()
    expect(transfers(sent, 'mira')).toBe(3)
  })

  it('brings a guest that asked once and was held back into step', async () => {
    const { host, sent } = setup()
    const guest = createStateGuest({ send: (message) => host.receive(message, 'mira') })
    const pipe = async (keep = true): Promise<void> => {
      await host.idle()
      const messages = sent.get('mira') ?? []
      sent.set('mira', [])
      if (keep) messages.forEach((message) => guest.receive(message))
    }
    const store = walking()
    const change = async (keep: boolean): Promise<void> => {
      store.advanceTurn()
      host.broadcast(view(store))
      await pipe(keep)
    }

    host.sendSnapshot('mira', view(store))
    await pipe()
    // Spends the cooldown on a first resync, as a guest that asked a moment ago.
    host.receive(resync, 'mira')
    await pipe()

    await change(false)
    await change(true)
    expect(guest.seq).toBeLessThan(host.seq)

    await vi.advanceTimersByTimeAsync(RESYNC_COOLDOWN)
    await pipe()
    expect(guest.seq).toBe(host.seq)
  })

  it('leaves the cooldown idle after a snapshot slower than the cooldown', async () => {
    const times = new Map<number, number[]>()
    const releases: (() => void)[] = []
    vi.useFakeTimers()
    const host = createStateHost({
      highWater: 0,
      channelFor: () => ({
        bufferedAmount: 1,
        drained: () => new Promise<void>((resolve) => releases.push(resolve)),
        send(message) {
          if (message.type !== 'state') return
          const list = times.get(message.chunk.id) ?? []
          list.push(Date.now())
          times.set(message.chunk.id, list)
        },
      }),
    })
    const store = walking()
    store.setEntitySight(store.selectedId, 12)
    host.sendSnapshot('mira', view(store))

    // Each snapshot takes until the next multiple of 8 s to go out; the guest floods throughout.
    for (let second = 1; second <= 60; second++) {
      host.receive(resync, 'mira')
      await vi.advanceTimersByTimeAsync(1000)
      if (second % 8 === 0) {
        for (let round = 0; round < 500 && releases.length > 0; round++) {
          releases.splice(0).forEach((release) => release())
          await vi.advanceTimersByTimeAsync(0)
        }
      }
    }

    const spans = [...times.values()].map((list) => ({ start: list[0]!, end: list.at(-1)! }))
    expect(spans.length).toBeGreaterThanOrEqual(3)
    for (let i = 2; i < spans.length; i++) {
      expect(spans[i]!.start - spans[i - 1]!.end).toBeGreaterThanOrEqual(RESYNC_COOLDOWN)
    }
  })

  it('drops a held resync when the guest is removed', async () => {
    const { host, sent } = setup()
    host.sendSnapshot('mira', view(walking()))
    await host.idle()
    host.receive(resync, 'mira')
    await host.idle()
    host.receive(resync, 'mira')
    expect(vi.getTimerCount()).toBe(1)

    host.remove('mira')
    expect(vi.getTimerCount()).toBe(0)
    const before = sent.get('mira')?.length
    await vi.advanceTimersByTimeAsync(RESYNC_COOLDOWN)
    await host.idle()
    expect(sent.get('mira')?.length).toBe(before)
  })

  it('drops a held resync when a delivery fails because the channel is gone', async () => {
    const live = { on: true }
    const sent: SessionMessage[] = []
    vi.useFakeTimers()
    const host = createStateHost({
      highWater: Infinity,
      channelFor: () =>
        live.on
          ? { bufferedAmount: 0, drained: async () => {}, send: (m) => void sent.push(m) }
          : undefined,
    })
    const store = walking()
    host.sendSnapshot('mira', view(store))
    await host.idle()
    host.receive(resync, 'mira')
    await host.idle()
    host.receive(resync, 'mira')
    expect(vi.getTimerCount()).toBe(1)

    live.on = false
    store.advanceTurn()
    host.broadcast(view(store))
    await host.idle()
    expect(vi.getTimerCount()).toBe(0)

    const before = sent.length
    await vi.advanceTimersByTimeAsync(RESYNC_COOLDOWN)
    await host.idle()
    expect(sent.length).toBe(before)
  })

  it('limits each guest on its own', async () => {
    const { host, sent } = setup()
    const projection = view(walking())
    host.sendSnapshot('mira', projection)
    host.sendSnapshot('tomas', projection)
    await host.idle()

    host.receive(resync, 'mira')
    host.receive(resync, 'mira')
    host.receive(resync, 'tomas')
    await host.idle()
    expect(transfers(sent, 'mira')).toBe(2)
    expect(transfers(sent, 'tomas')).toBe(2)
  })

  it('starts a guest that is removed and let back in with a clean slate', async () => {
    const { host, sent } = setup()
    const projection = view(walking())
    host.sendSnapshot('mira', projection)
    await host.idle()
    host.receive(resync, 'mira')
    await host.idle()

    host.remove('mira')
    host.sendSnapshot('mira', projection)
    await host.idle()
    host.receive(resync, 'mira')
    await host.idle()
    expect(transfers(sent, 'mira')).toBe(4)
  })
})

/** The messages a host would send for a whole state or a patch. */
const stateMessages = (projection: PlayerProjection, seq: number, id: number): SessionMessage[] =>
  chunk(encodeState(projection), { id }).map((piece) => ({ type: 'state', seq, chunk: piece }))

const patchMessages = (
  prev: PlayerProjection,
  next: PlayerProjection,
  base: number,
  seq: number,
  id: number,
): SessionMessage[] =>
  chunk(JSON.stringify(diffState(prev, next)), { id }).map((piece) => ({
    type: 'patch',
    base,
    seq,
    chunk: piece,
  }))

describe('a guest on its own', () => {
  const views = (): PlayerProjection[] => {
    const store = walking()
    const seen = [view(store)]
    for (let turn = 0; turn < 3; turn++) {
      store.advanceTurn()
      seen.push(view(store))
    }
    return seen
  }

  const guestWith = () => {
    const asked: SessionMessage[] = []
    const changes: number[] = []
    let time = 0
    const guest = createStateGuest({
      send: (message) => asked.push(message),
      onChange: (_, seq) => changes.push(seq),
      now: () => time,
      resyncTimeout: 1000,
    })
    const feed = (messages: SessionMessage[]): void => {
      for (const message of messages) expect(guest.receive(message)).toBe(true)
    }
    return { guest, asked, changes, feed, wait: (ms: number) => (time += ms) }
  }

  it('ignores a patch older than what it holds', () => {
    const [a, b, c] = views()
    const { guest, asked, changes, feed } = guestWith()
    feed(stateMessages(a, 1, 0))
    feed(patchMessages(a, b, 1, 2, 1))
    feed(patchMessages(b, c, 2, 3, 2))
    feed(patchMessages(a, b, 1, 2, 3))

    expect(guest.projection).toEqual(c)
    expect(changes).toEqual([1, 2, 3])
    expect(asked).toEqual([])
  })

  it('asks once for the whole state after a gap, and again only once that has had its time', () => {
    const [a, b, c, d] = views()
    const { guest, asked, feed, wait } = guestWith()
    feed(stateMessages(a, 1, 0))
    feed(patchMessages(b, c, 2, 3, 1))
    feed(patchMessages(c, d, 3, 4, 2))
    expect(asked).toEqual([{ type: 'resync' }])
    expect(guest.seq).toBe(1)

    wait(1000)
    feed(patchMessages(c, d, 3, 4, 3))
    expect(asked).toHaveLength(2)

    feed(stateMessages(d, 4, 4))
    expect(guest.projection).toEqual(d)
  })

  it('asks for the whole state when a patch comes before any state', () => {
    const [a, b] = views()
    const { guest, asked, feed } = guestWith()
    feed(patchMessages(a, b, 1, 2, 0))
    expect(asked).toEqual([{ type: 'resync' }])
    expect(guest.projection).toBeNull()
  })

  it('asks for the whole state when a patch does not fit what it holds', () => {
    const [a] = views()
    const { guest, asked, feed } = guestWith()
    feed(stateMessages(a, 1, 0))
    feed(
      chunk(JSON.stringify({ set: {}, edit: { tiles: { drop: [99_999], put: [] } } }), {
        id: 1,
      }).map((piece) => ({ type: 'patch', base: 1, seq: 2, chunk: piece })),
    )
    expect(asked).toEqual([{ type: 'resync' }])
    expect(guest.seq).toBe(1)
  })

  it('asks for the whole state when one does not decode', () => {
    const { guest, asked, feed } = guestWith()
    feed([{ type: 'state', seq: 1, chunk: { id: 0, index: 0, count: 1, data: '{"turn":1}' } }])
    expect(asked).toEqual([{ type: 'resync' }])
    expect(guest.projection).toBeNull()
  })

  it('trusts none of a transfer whose pieces disagree about what it is', () => {
    const { guest, asked, feed } = guestWith()
    const store = walking()
    store.setEntitySight(store.selectedId, 12)
    const pieces = stateMessages(view(store), 1, 0)
    expect(pieces.length).toBeGreaterThan(1)
    feed(pieces.map((message, index) => (index === 1 ? { ...message, seq: 9 } : message)))
    expect(asked).toEqual([{ type: 'resync' }])
    expect(guest.projection).toBeNull()
  })

  it('leaves other messages alone', () => {
    const { guest } = guestWith()
    expect(guest.receive({ type: 'welcome' })).toBe(false)
  })
})

describe('createCoalescer', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('folds a burst of asks into one run', () => {
    vi.useFakeTimers()
    const task = vi.fn()
    const coalescer = createCoalescer(task, { delay: 100 })
    for (let i = 0; i < 5; i++) coalescer.request()
    vi.advanceTimersByTime(99)
    expect(task).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(task).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1000)
    expect(task).toHaveBeenCalledTimes(1)
  })

  it('runs once more after a run that was asked for again while it ran', async () => {
    vi.useFakeTimers()
    let finish = (): void => {}
    const task = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)))
    const coalescer = createCoalescer(task, { delay: 100 })

    coalescer.request()
    await vi.advanceTimersByTimeAsync(100)
    expect(task).toHaveBeenCalledTimes(1)

    coalescer.request()
    coalescer.request()
    await vi.advanceTimersByTimeAsync(500)
    expect(task).toHaveBeenCalledTimes(1)

    finish()
    await vi.advanceTimersByTimeAsync(100)
    expect(task).toHaveBeenCalledTimes(2)
    finish()
    await vi.advanceTimersByTimeAsync(1000)
    expect(task).toHaveBeenCalledTimes(2)
  })

  it('drops a waiting run when cancelled', () => {
    vi.useFakeTimers()
    const task = vi.fn()
    const coalescer = createCoalescer(task, { delay: 100 })
    coalescer.request()
    coalescer.cancel()
    vi.advanceTimersByTime(1000)
    expect(task).not.toHaveBeenCalled()
  })
})
