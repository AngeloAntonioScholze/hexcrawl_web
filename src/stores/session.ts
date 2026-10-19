import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch, type WatchHandle } from 'vue'
import * as room from '../session/admission'
import { MAX_NAME_LENGTH, type SessionMessage } from '../session/messages'
import {
  hostRoom,
  joinRoom,
  SessionError,
  type HostOptions,
  type Session,
  type SessionHandlers,
  type SessionStatus,
} from '../session/peer'
import { DM } from '../session/permissions'
import { projectForPlayers, type PlayerProjection } from '../session/projection'
import { createRetry, type Retry } from '../session/retry'
import { normaliseRoomCode, ROOM_PREFIX } from '../session/roomCode'
import { seatOf, type Seat } from '../session/seats'
import {
  createCoalescer,
  createStateGuest,
  createStateHost,
  type Coalescer,
  type StateGuest,
  type StateHost,
} from '../session/stateSync'
import { useHexMapStore } from './hexMap'

/** Why there is no room, or no longer one, in words a player can act on. */
export type SessionReason =
  | 'no-room'
  | 'network-blocked'
  | 'unreachable'
  | 'room-taken'
  | 'bad-code'
  | 'lost'
  | 'name-taken'
  | 'locked'
  | 'declined'
  | 'kicked'
  | 'dm-gone'
  | 'unknown'

export const REASON_TEXT: Readonly<Record<SessionReason, string>> = {
  'no-room': 'no room with that code',
  'network-blocked': "couldn't reach the DM's browser",
  unreachable: "couldn't reach the session server",
  'room-taken': 'that room is already open somewhere else',
  'bad-code': "that isn't a room code",
  lost: 'the connection to the room was lost',
  'name-taken': 'someone in the room already has that name',
  locked: 'the room is locked',
  declined: 'the DM turned the request away',
  kicked: 'the DM removed you from the session',
  'dm-gone': "the DM left and didn't come back",
  unknown: 'something went wrong connecting',
}

/** PeerJS's error types, peer and connection alike, as the reason a player is shown. */
export const reasonFor = (errorType: string | undefined): SessionReason => {
  switch (errorType) {
    case 'peer-unavailable':
      return 'no-room'
    case 'negotiation-failed':
    case 'webrtc':
      return 'network-blocked'
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
      return 'unreachable'
    case 'unavailable-id':
      return 'room-taken'
    case 'connection-closed':
    case 'disconnected':
      return 'lost'
    default:
      return 'unknown'
  }
}

/** The part of a room code a player reads out and types. */
export const codeSuffix = (code: string): string =>
  code.startsWith(ROOM_PREFIX) ? code.slice(ROOM_PREFIX.length) : code

/** A link that opens this app straight onto joining the room. */
export const roomLink = (origin: string, base: string, code: string): string =>
  `${origin}${base}?room=${codeSuffix(code)}`

export interface LastRoom {
  code: string
  at: number
}

/** How long a hosted room's code stays on offer to open again. */
export const REOPEN_WINDOW_MS = 12 * 60 * 60 * 1000

const LAST_ROOM_KEY = 'hexcrawl.lastRoom'

/** The room this browser last hosted, while it is still recent enough to reopen. */
export const parseLastRoom = (stored: string | null, now: number): LastRoom | null => {
  if (stored === null) return null
  try {
    const parsed: unknown = JSON.parse(stored)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { code, at } = parsed as Record<string, unknown>
    if (typeof code !== 'string' || typeof at !== 'number') return null
    const valid = normaliseRoomCode(code)
    if (!valid || at > now || now - at > REOPEN_WINDOW_MS) return null
    return { code: valid, at }
  } catch {
    return null
  }
}

export const lastRoom = (now = Date.now()): LastRoom | null => {
  try {
    return parseLastRoom(localStorage.getItem(LAST_ROOM_KEY), now)
  } catch {
    return null
  }
}

const rememberRoom = (code: string): void => {
  try {
    localStorage.setItem(LAST_ROOM_KEY, JSON.stringify({ code, at: Date.now() } satisfies LastRoom))
  } catch {
    // Without storage the room just cannot be offered for reopening.
  }
}

/** Someone the DM has let in this session, whether connected now or not. */
export interface Player {
  name: string
  /** The connection they are on now; null while they are away. */
  peerId: string | null
}

/** Someone waiting for the DM to let them in. */
export interface Asking {
  peerId: string
  name: string
}

/**
 * Where a guest stands with the host: said hello and awaiting the answer,
 * waiting for the DM to decide, or in.
 */
export type Admission = 'asking' | 'pending' | 'admitted'

/** One row per admitted name, in the order they were let in. */
export const playersOf = (state: room.Admission): Player[] =>
  [...state.known].map(([key, name]) => ({ name, peerId: state.online.get(key) ?? null }))

export const askingOf = (state: room.Admission): Asking[] =>
  [...state.pending].map(([peerId, name]) => ({ peerId, name }))

const cleanName = (name: string, fallback: string): string =>
  name.trim().slice(0, MAX_NAME_LENGTH).trim() || fallback

/** This tab's live room, as host or guest, and who else is in it. */
export const useSessionStore = defineStore('session', () => {
  const role = ref<Session['role'] | null>(null)
  const code = ref<string | null>(null)
  const status = ref<SessionStatus | 'idle'>('idle')
  const reason = ref<SessionReason | null>(null)
  const myName = ref('')
  /** The host's door: who is in, who is waiting, and who may come. */
  const door = shallowRef(room.openRoom())
  /** A guest's standing with the host; null when not in a room as a guest. */
  const admission = ref<Admission | null>(null)
  /** A guest that was in has lost the host and is trying the room again. */
  const reconnecting = ref(false)
  /**
   * What the host last sent of the map, on a guest: the player view as the DM's
   * browser has it. It outlives a dropped connection, so the map stays frozen
   * as it was while the room is tried again, and goes with leaving or failing.
   */
  const remote = shallowRef<PlayerProjection | null>(null)
  let session: Session | null = null
  // Following the host's map on a guest, or keeping guests in step on a host;
  // each belongs to the one connection it was made for.
  let stateGuest: StateGuest | null = null
  let stateHost: StateHost | null = null
  let broadcasts: Coalescer | null = null
  let project: (() => PlayerProjection) | null = null
  let stopWatching: WatchHandle | null = null
  let retry: Retry | null = null
  // Each host or join bumps this, so a room still opening when it is left or
  // replaced cannot write over the one that took its place.
  let run = 0

  const error = computed(() => (reason.value ? REASON_TEXT[reason.value] : null))
  const locked = computed(() => door.value.locked)
  const approval = computed(() => door.value.approval)
  const players = computed(() => playersOf(door.value))
  const pending = computed(() => askingOf(door.value))

  // A guest's browser plays only the tokens the host gave it, and only while in the room.
  const unseat = (): void => {
    useHexMapStore().seatedIds = null
  }

  // What each connection was last told it plays, so a guest hears of a change
  // to its own tokens once, and nothing of anybody else's.
  const told = new Map<string, string>()

  const tellSeats = (name: string, peerId: string): void => {
    const entityIds = useHexMapStore().seatsFor(name)
    const said = entityIds.join(' ')
    if (told.get(peerId) === said) return
    told.set(peerId, said)
    session?.send({ type: 'seat', entityIds }, peerId)
  }

  const stopSync = (): void => {
    stopWatching?.()
    stopWatching = null
    broadcasts?.cancel()
    broadcasts = null
    stateHost = null
    stateGuest = null
    project = null
  }

  /**
   * Starts keeping the guests let into this room in step with the map. Every
   * change asks for a broadcast, folded into one projection a beat later: a
   * drag or a turn can change the store many times over, and a projection of
   * a long crawl is not free. With nobody in, no projection is made at all; a
   * guest let in later is sent one made fresh.
   */
  const syncHost = (mine: number): void => {
    const map = useHexMapStore()
    const projectMap = (): PlayerProjection => projectForPlayers(map.snapshot, map.field)
    const host = createStateHost({
      channelFor: (peerId) => (mine === run ? session?.channel(peerId) : undefined),
    })
    const coalescer = createCoalescer(() => {
      if (mine === run && door.value.online.size > 0) host.broadcast(projectMap())
    })
    stateHost = host
    project = projectMap
    broadcasts = coalescer
    stopWatching = watch([() => map.snapshot, () => map.field], () => coalescer.request())
  }

  const syncGuest = (mine: number): void => {
    stateGuest = createStateGuest({
      send: (message) => {
        if (mine === run) session?.send(message)
      },
      onChange: (projection) => {
        if (mine === run) remote.value = projection
      },
    })
  }

  const stopRetrying = (): void => {
    retry?.stop()
    retry = null
    reconnecting.value = false
  }

  const leave = (): void => {
    stopRetrying()
    unseat()
    run++
    stopSync()
    remote.value = null
    session?.close()
    session = null
    role.value = null
    code.value = null
    status.value = 'idle'
    reason.value = null
    door.value = room.openRoom()
    admission.value = null
    told.clear()
  }

  const fail = (why: SessionReason): void => {
    // Closing the room reports 'closed' back through its handlers, which would
    // otherwise write over the reason with a lost connection.
    run++
    stopRetrying()
    unseat()
    stopSync()
    remote.value = null
    status.value = 'error'
    reason.value = why
    admission.value = null
    const closing = session
    session = null
    closing?.close()
  }

  /**
   * Hands a guest just let in the token that is theirs: the one their name has
   * on this map, or a new one off the map for them to set down. The host is
   * always the DM, whichever view this browser is showing.
   */
  const seat = (peerId: string): void => {
    const key = [...door.value.online].find(([, peer]) => peer === peerId)?.[0]
    const name = key === undefined ? undefined : door.value.known.get(key)
    if (name === undefined) return
    const map = useHexMapStore()
    told.delete(peerId)
    if (map.actAs(DM, () => map.seatPlayer(name))) tellSeats(name, peerId)
  }

  // Made after the seat, so the token just handed over is on the map it is sent.
  const admit = (peerId: string): void => {
    seat(peerId)
    if (project) stateHost?.sendSnapshot(peerId, project())
  }

  // The DM handing a token to a player, or taking one back, reaches the
  // players it touches straight away.
  watch(
    () => useHexMapStore().seats,
    () => {
      if (role.value !== 'host') return
      for (const { name, peerId } of players.value) if (peerId !== null) tellSeats(name, peerId)
    },
  )

  /** Answers a guest, and shows a refused one the door once the answer has gone. */
  const reply = (decision: room.Decision, to: string): void => {
    door.value = decision.state
    session?.send(decision.reply, to)
    if (decision.reply.type === 'refused') session?.drop(to)
    if (decision.reply.type === 'welcome') admit(to)
  }

  // A name with a token on this map was let in before, if not by this room:
  // after a reload the door has forgotten everyone, but the map has not.
  const seatFor = (name: string): Seat | undefined => {
    const map = useHexMapStore()
    return seatOf(map.seats, name, (id) => map.entities.some((one) => one.id === id))
  }

  const onHostMessage = (message: SessionMessage, from: string): void => {
    if (stateHost?.receive(message, from)) return
    if (message.type !== 'hello') return
    // A connection says hello once; another from one already in or waiting is ignored.
    const state = door.value
    if (state.pending.has(from) || [...state.online.values()].includes(from)) return
    // A returning name shows as it was first seated, not as typed this time.
    const seated = seatFor(message.name)
    reply(room.decide(state, seated?.name ?? message.name, from, seated !== undefined), from)
  }

  const onGuestMessage = (message: SessionMessage): void => {
    // The map is only the business of a guest the host has let in.
    if (admission.value === 'admitted' && stateGuest?.receive(message)) return
    switch (message.type) {
      case 'pending':
        admission.value = 'pending'
        break
      case 'welcome':
        admission.value = 'admitted'
        stopRetrying()
        break
      case 'seat':
        useHexMapStore().seatedIds = message.entityIds
        break
      case 'refused':
        // Back before the host has noticed the old connection go, the name
        // still looks taken; it frees up once it does.
        if (reconnecting.value && message.reason === 'name-taken') lost()
        else fail(message.reason)
        break
      case 'kicked':
        fail('kicked')
        break
    }
  }

  const setLocked = (next: boolean): void => {
    door.value = room.setLocked(door.value, next)
  }

  const setApproval = (next: boolean): void => {
    door.value = room.setApproval(door.value, next)
  }

  const accept = (peerId: string): void => {
    const decision = room.accept(door.value, peerId)
    if (decision) reply(decision, peerId)
  }

  const decline = (peerId: string): void => {
    const decision = room.decline(door.value, peerId)
    if (decision) reply(decision, peerId)
  }

  /**
   * Bars a name for the rest of the session. It goes by name rather than
   * connection, so a player who is away right now can be removed too.
   */
  const kick = (name: string): void => {
    const { state, peerId } = room.kick(door.value, name)
    door.value = state
    if (peerId === undefined) return
    stateHost?.remove(peerId)
    session?.send({ type: 'kicked' }, peerId)
    session?.drop(peerId)
  }

  /**
   * A guest that was in has lost the host: the map stays as it last was, and
   * the same code is tried again until the DM is back or the window runs out.
   */
  const lost = (): void => {
    run++
    stopSync()
    const closing = session
    session = null
    closing?.close()
    const dialling = code.value
    if (dialling === null) return fail('dm-gone')
    status.value = 'connecting'
    admission.value = null
    reconnecting.value = true
    retry ??= createRetry(() => void connect('guest', (handlers) => joinRoom(dialling, handlers)))
    if (!retry.schedule()) fail('dm-gone')
  }

  const connect = async (
    as: Session['role'],
    open: (handlers: SessionHandlers) => Promise<Session>,
  ): Promise<void> => {
    const mine = ++run
    status.value = 'connecting'
    stopSync()
    if (as === 'host') syncHost(mine)
    else syncGuest(mine)

    const handlers: SessionHandlers = {
      status: (next, _detail, errorType) => {
        if (mine !== run) return
        if (next === 'open' || next === 'connecting') status.value = next
        else if (as === 'guest' && (reconnecting.value || admission.value === 'admitted')) lost()
        else fail(next === 'error' ? reasonFor(errorType) : 'lost')
      },
      message: (message, from) => {
        if (mine !== run) return
        if (as === 'host') onHostMessage(message, from)
        else onGuestMessage(message)
      },
      peer: (peerId, connected) => {
        if (mine !== run) return
        if (!connected) {
          if (as !== 'host') return
          door.value = room.disconnect(door.value, peerId)
          stateHost?.remove(peerId)
          return
        }
        if (as === 'guest') admission.value = 'asking'
        session?.send({ type: 'hello', name: myName.value }, peerId)
      },
    }

    try {
      const opened = await open(handlers)
      if (mine !== run) {
        opened.close()
        return
      }
      session = opened
      code.value = opened.code
      if (as === 'host') rememberRoom(opened.code)
    } catch (caught) {
      if (mine === run) fail(caught instanceof SessionError ? reasonFor(caught.type) : 'unknown')
    }
  }

  const start = (
    as: Session['role'],
    name: string,
    open: (handlers: SessionHandlers) => Promise<Session>,
  ): Promise<void> => {
    leave()
    role.value = as
    myName.value = cleanName(name, as === 'host' ? 'DM' : 'player')
    return connect(as, open)
  }

  const host = (name: string, options: HostOptions = {}): Promise<void> =>
    start('host', name, (handlers) => hostRoom(handlers, options))

  const join = async (name: string, input: string): Promise<void> => {
    if (!normaliseRoomCode(input)) {
      leave()
      fail('bad-code')
      return
    }
    await start('guest', name, (handlers) => joinRoom(input, handlers))
  }

  return {
    role,
    code,
    status,
    reason,
    error,
    myName,
    admission,
    reconnecting,
    remote,
    locked,
    approval,
    players,
    pending,
    host,
    join,
    leave,
    setLocked,
    setApproval,
    accept,
    decline,
    kick,
  }
})
