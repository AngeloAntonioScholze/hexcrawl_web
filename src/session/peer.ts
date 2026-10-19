import type { DataConnection, Peer, PeerError, PeerOptions } from 'peerjs'
import { parseEnvelope, wrap, type SessionMessage } from './messages'
import { makeRoomCode, normaliseRoomCode } from './roomCode'
import { BUFFER_LOW_WATER, type StateChannel } from './stateSync'

/**
 * The signalling broker: the PeerJS public cloud for now. A self-hosted
 * PeerServer only needs these four changed. ICE servers are left to PeerJS's
 * own default (Google STUN plus PeerJS's best-effort public TURN).
 */
export const PEER_SERVER: Readonly<Pick<PeerOptions, 'host' | 'port' | 'path' | 'secure'>> = {
  host: '0.peerjs.com',
  port: 443,
  path: '/',
  secure: true,
}

/** How many fresh codes a new room draws before it gives up. */
const CLAIM_ATTEMPTS = 3

const RECONNECT_DELAY_MS = 3000

/**
 * How long a guest's connection stays open after the host decides to drop it.
 * Closing the channel straight away can discard what was just queued for it,
 * and the guest would see a lost connection rather than the reason it was
 * turned away.
 */
export const DROP_DELAY_MS = 500

/**
 * How long a guest waits for the channel to the host to open. A pair of
 * browsers that cannot find a route to each other may never report a failure,
 * and would sit connecting for good.
 */
export const JOIN_TIMEOUT_MS = 20_000

export type SessionStatus = 'connecting' | 'open' | 'closed' | 'error'

export interface SessionHandlers {
  /** `errorType` is PeerJS's own error type, for telling the reasons apart. */
  status?: (status: SessionStatus, detail?: string, errorType?: string) => void
  message?: (message: SessionMessage, from: string) => void
  /** A guest's channel to the host opened or went away; on a guest, the host's. */
  peer?: (peerId: string, connected: boolean) => void
}

export interface HostOptions {
  /** Reopen this room rather than a fresh one. */
  code?: string
}

export interface Session {
  readonly role: 'host' | 'guest'
  readonly code: string
  /** To one peer, or to every open connection when `to` is left out. */
  send: (message: SessionMessage, to?: string) => void
  /** Closes the connection to one peer, once what was last sent to it has had time to arrive. */
  drop: (peerId: string) => void
  /** The open connection to one peer as the state sync paces it; undefined once it has gone. */
  channel: (peerId: string) => StateChannel | undefined
  close: () => void
}

/** Why a room could not be opened; `type` is PeerJS's error type. */
export class SessionError extends Error {
  constructor(
    readonly type: string,
    message: string,
  ) {
    super(message)
  }
}

// Loaded on first use so the main chunk stays free of it for anyone who never plays live.
const loadPeer = async (): Promise<typeof Peer> => (await import('peerjs')).Peer

const wire = (
  peer: Peer,
  role: Session['role'],
  code: string,
  handlers: SessionHandlers,
): {
  session: Session
  track: (conn: DataConnection) => void
  setStatus: (status: SessionStatus, detail?: string, errorType?: string) => void
} => {
  const connections = new Map<string, DataConnection>()
  let closed = false
  // Once the room is live the broker only introduces newcomers: losing it
  // leaves every open channel standing, so its errors stop being fatal.
  let live = false

  const setStatus = (status: SessionStatus, detail?: string, errorType?: string): void => {
    if (closed) return
    if (status === 'open') live = true
    if (status === 'closed' || status === 'error') closed = true
    handlers.status?.(status, detail, errorType)
  }

  const drop = (conn: DataConnection): void => {
    if (connections.get(conn.peer) !== conn) return
    connections.delete(conn.peer)
    handlers.peer?.(conn.peer, false)
    if (role === 'guest') setStatus('closed')
  }

  // A tab closed or a browser quit seldom gets as far as closing its data
  // channel, so the other end never hears 'close'. Losing the route between
  // the two is what shows instead, a few seconds later.
  const watchRoute = (conn: DataConnection): void => {
    const route = conn.peerConnection
    if (!route) return
    route.addEventListener('iceconnectionstatechange', () => {
      const state = route.iceConnectionState
      console.info('[session] ice', conn.peer, state)
      if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        drop(conn)
        conn.close()
      }
    })
  }

  const track = (conn: DataConnection): void => {
    watchRoute(conn)
    conn.on('open', () => {
      connections.set(conn.peer, conn)
      handlers.peer?.(conn.peer, true)
      if (role === 'guest') setStatus('open')
    })
    conn.on('data', (data) => {
      const message = parseEnvelope(data)
      if (message) handlers.message?.(message, conn.peer)
      else console.warn('[session] dropped a malformed message from', conn.peer)
    })
    conn.on('close', () => drop(conn))
    conn.on('error', (error) => {
      if (role === 'guest') setStatus('error', error.message, error.type)
      else console.warn('[session] connection to', conn.peer, 'failed:', error.message)
    })
  }

  peer.on('error', (error) => {
    if (live) console.warn('[session] broker:', error.type, error.message)
    else setStatus('error', error.message, error.type)
  })
  peer.on('close', () => setStatus('closed'))

  const session: Session = {
    role,
    code,
    send: (message, to) => {
      const envelope = wrap(message)
      const targets = to === undefined ? [...connections.values()] : [connections.get(to)]
      for (const conn of targets) if (conn?.open) void conn.send(envelope)
    },
    channel: (peerId) => {
      const conn = connections.get(peerId)
      return conn?.open && conn.dataChannel ? channelOf(conn, conn.dataChannel) : undefined
    },
    drop: (peerId) => {
      const conn = connections.get(peerId)
      if (!conn) return
      setTimeout(() => {
        if (connections.get(peerId) === conn) conn.close()
      }, DROP_DELAY_MS)
    },
    close: () => {
      removeEventListener('pagehide', session.close)
      setStatus('closed')
      peer.destroy()
    },
  }
  // Closed on the way out, so the other end hears it now rather than when the route times out.
  addEventListener('pagehide', session.close)

  return { session, track, setStatus }
}

/**
 * A connection's data channel, measured where the browser queues: PeerJS only
 * starts holding messages back in its own queue at 8 MiB, far past where the
 * state sync stops to let the channel drain.
 */
const channelOf = (conn: DataConnection, channel: RTCDataChannel): StateChannel => ({
  send: (message) => {
    if (conn.open) void conn.send(wrap(message))
  },
  get bufferedAmount() {
    return channel.bufferedAmount
  },
  drained: () =>
    new Promise((resolve) => {
      if (channel.readyState !== 'open' || channel.bufferedAmount <= BUFFER_LOW_WATER) {
        resolve()
        return
      }
      channel.bufferedAmountLowThreshold = BUFFER_LOW_WATER
      const done = (): void => {
        channel.removeEventListener('bufferedamountlow', done)
        channel.removeEventListener('close', done)
        resolve()
      }
      channel.addEventListener('bufferedamountlow', done)
      channel.addEventListener('close', done)
    }),
})

/** Settles once the broker has taken the peer's id, or with why it would not. */
const registered = (peer: Peer): Promise<PeerError<string> | null> =>
  new Promise((resolve) => {
    peer.once('open', () => resolve(null))
    peer.once('error', resolve)
  })

/**
 * Registers a room with the broker and resolves once guests can join. A fresh
 * room that draws a code already in use draws again; a reopened one is refused,
 * since whoever holds it is most likely this same room in another tab.
 */
export const hostRoom = async (
  handlers: SessionHandlers = {},
  options: HostOptions = {},
): Promise<Session> => {
  const PeerClass = await loadPeer()
  handlers.status?.('connecting')

  for (let attempt = 1; ; attempt++) {
    const code = options.code ?? makeRoomCode()
    const peer = new PeerClass(code, { ...PEER_SERVER })
    const refused = await registered(peer)
    if (refused) {
      peer.destroy()
      if (refused.type === 'unavailable-id' && !options.code && attempt < CLAIM_ATTEMPTS) continue
      handlers.status?.('error', refused.message, refused.type)
      throw new SessionError(refused.type, refused.message)
    }

    const { session, track, setStatus } = wire(peer, 'host', code, handlers)
    peer.on('connection', track)
    // A peer that was once open is only ever disconnected, never destroyed, by
    // a lost broker, so it can claim the same code again and newcomers find it.
    peer.on('disconnected', () => {
      setTimeout(() => {
        if (peer.disconnected && !peer.destroyed) peer.reconnect()
      }, RECONNECT_DELAY_MS)
    })
    setStatus('open')
    return session
  }
}

/** Rejects only for a code that cannot be one; a room that does not exist reports through status. */
export const joinRoom = async (input: string, handlers: SessionHandlers = {}): Promise<Session> => {
  const code = normaliseRoomCode(input)
  if (!code) throw new Error(`"${input}" is not a room code`)

  const PeerClass = await loadPeer()
  handlers.status?.('connecting')

  // The broker hands a guest a random id; only the host's id has to be known.
  const peer = new PeerClass({ ...PEER_SERVER })
  // Anything but connecting settles the join, one way or the other.
  const { session, track, setStatus } = wire(peer, 'guest', code, {
    ...handlers,
    status: (status, detail, errorType) => {
      if (status !== 'connecting') clearTimeout(timeout)
      handlers.status?.(status, detail, errorType)
    },
  })
  const timeout = setTimeout(() => {
    setStatus('error', 'no route to the host', 'negotiation-failed')
    peer.destroy()
  }, JOIN_TIMEOUT_MS)

  // Dialling before the broker has registered us can lose the first signalling
  // messages. JSON keeps the wire readable while this is a probe; it caps a
  // message at ~16 KB.
  peer.on('open', () => {
    track(peer.connect(code, { reliable: true, serialization: 'json' }))
  })
  return session
}
