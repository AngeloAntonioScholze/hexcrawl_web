import type { DataConnection, Peer, PeerOptions } from 'peerjs'
import { parseEnvelope, wrap, type SessionMessage } from './messages'
import { makeRoomCode, normaliseRoomCode } from './roomCode'

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

export type SessionStatus = 'connecting' | 'open' | 'closed' | 'error'

export interface SessionHandlers {
  status?: (status: SessionStatus, detail?: string) => void
  message?: (message: SessionMessage, from: string) => void
  /** A guest's channel to the host opened or went away; on a guest, the host's. */
  peer?: (peerId: string, connected: boolean) => void
}

export interface Session {
  readonly role: 'host' | 'guest'
  readonly code: string
  /** To one peer, or to every open connection when `to` is left out. */
  send: (message: SessionMessage, to?: string) => void
  close: () => void
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
  setStatus: (status: SessionStatus, detail?: string) => void
} => {
  const connections = new Map<string, DataConnection>()
  let closed = false

  const setStatus = (status: SessionStatus, detail?: string): void => {
    if (closed) return
    if (status === 'closed' || status === 'error') closed = true
    handlers.status?.(status, detail)
  }

  const track = (conn: DataConnection): void => {
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
    conn.on('close', () => {
      if (!connections.delete(conn.peer)) return
      handlers.peer?.(conn.peer, false)
      if (role === 'guest') setStatus('closed')
    })
    conn.on('error', (error) => {
      if (role === 'guest') setStatus('error', error.message)
      else console.warn('[session] connection to', conn.peer, 'failed:', error.message)
    })
  }

  peer.on('error', (error) => setStatus('error', `${error.type}: ${error.message}`))
  peer.on('close', () => setStatus('closed'))

  const session: Session = {
    role,
    code,
    send: (message, to) => {
      const envelope = wrap(message)
      const targets = to === undefined ? [...connections.values()] : [connections.get(to)]
      for (const conn of targets) if (conn?.open) void conn.send(envelope)
    },
    close: () => {
      setStatus('closed')
      peer.destroy()
    },
  }

  return { session, track, setStatus }
}

/** Registers a fresh room code with the broker; guests can join once status reports open. */
export const hostRoom = async (handlers: SessionHandlers = {}): Promise<Session> => {
  const PeerClass = await loadPeer()
  const code = makeRoomCode()
  handlers.status?.('connecting')

  const peer = new PeerClass(code, { ...PEER_SERVER })
  const { session, track, setStatus } = wire(peer, 'host', code, handlers)
  peer.on('open', () => setStatus('open'))
  peer.on('connection', track)
  return session
}

/** Rejects only for a code that cannot be one; a room that does not exist reports through status. */
export const joinRoom = async (input: string, handlers: SessionHandlers = {}): Promise<Session> => {
  const code = normaliseRoomCode(input)
  if (!code) throw new Error(`"${input}" is not a room code`)

  const PeerClass = await loadPeer()
  handlers.status?.('connecting')

  // The broker hands a guest a random id; only the host's id has to be known.
  const peer = new PeerClass({ ...PEER_SERVER })
  const { session, track } = wire(peer, 'guest', code, handlers)
  // Dialling before the broker has registered us can lose the first signalling
  // messages. JSON keeps the wire readable while this is a probe; it caps a
  // message at ~16 KB.
  peer.on('open', () => track(peer.connect(code, { reliable: true, serialization: 'json' })))
  return session
}
