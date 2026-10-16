import type { SessionMessage } from './messages'
import type { PlayerProjection } from './projection'
import { decodeState, encodeState } from './snapshotCodec'
import { applyPatch, diffState, parsePatch } from './snapshotDiff'
import { chunk, createReassembler, type Chunk, type ReassemblerOptions } from './wireChunks'

/**
 * Past this many bytes waiting in a channel's send buffer the host stops and
 * waits for it to drain. Chrome closes a data channel whose buffer passes
 * 16 MiB, and PeerJS starts holding messages back in its own queue at 8 MiB;
 * 1 MiB (about seventy pieces) keeps the pipe full on any link a game runs
 * over while staying far from both.
 */
export const BUFFER_HIGH_WATER = 1024 * 1024

/**
 * What a channel's buffer is let fall to before sending resumes. A channel
 * sets its `bufferedAmountLowThreshold` to this, so `bufferedamountlow` fires
 * while a quarter of a megabyte is still queued and the link never goes idle.
 */
export const BUFFER_LOW_WATER = 256 * 1024

/** One guest's end of the pipe, as the host sees it. A data channel is all it takes. */
export interface StateChannel {
  send(message: SessionMessage): void
  /** Bytes queued and not yet sent, like RTCDataChannel's own. */
  readonly bufferedAmount: number
  /**
   * Settles once `bufferedAmount` has fallen to BUFFER_LOW_WATER or below, or
   * the channel has closed: a closed channel must not leave the host waiting.
   */
  drained(): Promise<void>
}

export interface StateHostOptions {
  /** A guest's channel, or undefined once it has gone. */
  channelFor: (peerId: string) => StateChannel | undefined
  highWater?: number
}

export interface StateHost {
  /** The version the latest projection is; 0 until the first. */
  readonly seq: number
  /**
   * Takes a new projection and brings every guest up to it. Nothing is sent
   * when nothing a player sees changed.
   */
  broadcast(projection: PlayerProjection): void
  /**
   * Starts a guest off with the whole state, then keeps it up to date. With a
   * projection, that becomes the latest first, and everyone else is patched up
   * to it; without one the guest gets the latest there is, or waits for one.
   */
  sendSnapshot(peerId: string, projection?: PlayerProjection): void
  /** Stops sending to a guest that left or was sent away. */
  remove(peerId: string): void
  /** Answers a guest's resync; true when the message was this module's to handle. */
  receive(message: SessionMessage, from: string): boolean
  /** Settles once everything queued has gone out. */
  idle(): Promise<void>
}

interface Version {
  seq: number
  projection: PlayerProjection
}

interface Guest {
  /** The version the guest has been sent, or will have once what is going out arrives. */
  sent: Version | null
  wantsSnapshot: boolean
  sending: Promise<void> | null
}

/**
 * Keeps guests in step with the host's projection. Each guest is caught up
 * from whatever it was last sent to whatever is latest whenever its channel is
 * free, so a guest on a slow link skips the versions it was too slow for
 * rather than queueing a patch for each, and one slow guest holds up nobody
 * else.
 *
 * A patch too big for one message is cut into pieces just as a snapshot is:
 * after a wide reveal it can run past one message yet still be a small part of
 * a state that may run to megabytes, and the guest already puts pieces back
 * together.
 */
export function createStateHost({
  channelFor,
  highWater = BUFFER_HIGH_WATER,
}: StateHostOptions): StateHost {
  const guests = new Map<string, Guest>()
  let latest: Version | null = null
  // Counted up across every guest, so each transfer a guest sees is newer than its last.
  let transfers = 0
  // The latest version's encodings, made once however many guests want them.
  let snapshotPieces: Chunk[] | null = null
  const patchTexts = new Map<number, string>()

  // Cut for the widest id there is, so any transfer's id can be stamped on afterwards.
  const piecesOf = (text: string): Chunk[] => chunk(text, { id: Number.MAX_SAFE_INTEGER })

  const snapshotMessages = (version: Version): SessionMessage[] => {
    snapshotPieces ??= piecesOf(encodeState(version.projection))
    const id = transfers++
    return snapshotPieces.map((piece) => ({
      type: 'state',
      seq: version.seq,
      chunk: { ...piece, id },
    }))
  }

  const patchMessages = (from: Version, to: Version): SessionMessage[] => {
    let text = patchTexts.get(from.seq)
    if (text === undefined) {
      text = JSON.stringify(diffState(from.projection, to.projection))
      patchTexts.set(from.seq, text)
    }
    const id = transfers++
    return piecesOf(text).map((piece) => ({
      type: 'patch',
      base: from.seq,
      seq: to.seq,
      chunk: { ...piece, id },
    }))
  }

  /** False once the guest is gone, so the rest of what was going to it is dropped. */
  const deliver = async (
    peerId: string,
    guest: Guest,
    messages: SessionMessage[],
  ): Promise<boolean> => {
    for (const message of messages) {
      let channel = channelFor(peerId)
      if (!channel) return false
      if (channel.bufferedAmount > highWater) {
        await channel.drained()
        channel = channelFor(peerId)
        if (!channel) return false
      }
      // Removed while waiting, or removed and let back in, which starts it over.
      if (guests.get(peerId) !== guest) return true
      channel.send(message)
    }
    return true
  }

  const catchUp = async (peerId: string, guest: Guest): Promise<void> => {
    while (latest && guests.get(peerId) === guest) {
      const target = latest
      let messages: SessionMessage[]
      if (guest.wantsSnapshot || !guest.sent) messages = snapshotMessages(target)
      else if (guest.sent.seq !== target.seq) messages = patchMessages(guest.sent, target)
      else return
      guest.sent = target
      guest.wantsSnapshot = false
      if (!(await deliver(peerId, guest, messages))) {
        if (guests.get(peerId) === guest) guests.delete(peerId)
        return
      }
    }
  }

  const pump = (peerId: string): void => {
    const guest = guests.get(peerId)
    if (!guest || guest.sending) return
    // Begun a beat later, so whatever else this moment asks of the guest goes
    // in the same catching up, and an answer that comes straight back finds it busy.
    guest.sending = Promise.resolve()
      .then(() => catchUp(peerId, guest))
      .finally(() => {
        guest.sending = null
      })
  }

  const broadcast = (projection: PlayerProjection): void => {
    if (latest) {
      const patch = diffState(latest.projection, projection)
      if (Object.keys(patch.set).length === 0 && Object.keys(patch.edit).length === 0) return
      // Every guest in step with the old latest wants this very patch.
      patchTexts.clear()
      patchTexts.set(latest.seq, JSON.stringify(patch))
    }
    latest = { seq: (latest?.seq ?? 0) + 1, projection }
    snapshotPieces = null
    for (const peerId of guests.keys()) pump(peerId)
  }

  return {
    get seq() {
      return latest?.seq ?? 0
    },
    broadcast,
    sendSnapshot(peerId, projection) {
      if (projection && projection !== latest?.projection) broadcast(projection)
      const guest = guests.get(peerId)
      if (guest) guest.wantsSnapshot = true
      else guests.set(peerId, { sent: null, wantsSnapshot: true, sending: null })
      pump(peerId)
    },
    remove(peerId) {
      guests.delete(peerId)
    },
    receive(message, from) {
      if (message.type !== 'resync') return false
      const guest = guests.get(from)
      if (guest) {
        guest.wantsSnapshot = true
        pump(from)
      }
      return true
    },
    async idle() {
      for (;;) {
        const sending = [...guests.values()].flatMap((guest) => guest.sending ?? [])
        if (sending.length === 0) return
        await Promise.all(sending)
      }
    },
  }
}

export interface StateGuestOptions {
  /** Sends a message to the host. */
  send: (message: SessionMessage) => void
  /** Called with each new state the host's word brings. */
  onChange?: (projection: PlayerProjection, seq: number) => void
  /**
   * How long an unanswered resync stands before another may be asked for, in
   * ms. Until then further gaps are left alone, since the state on its way
   * will mend them.
   */
  resyncTimeout?: number
  now?: () => number
  reassembler?: Omit<ReassemblerOptions, 'now'>
}

export interface StateGuest {
  /** What the players see, as of `seq`; null until the first state arrives. */
  readonly projection: PlayerProjection | null
  readonly seq: number | null
  /** Takes a message from the host; true when it was this module's to handle. */
  receive(message: SessionMessage): boolean
}

interface Transfer {
  id: number
  type: 'state' | 'patch'
  base: number
  seq: number
  /** Its pieces disagreed about what it is, so none of it can be trusted. */
  mixed: boolean
}

/**
 * Follows the host's state. A patch only counts when it starts from the very
 * version held; one that is older than that is a leftover and ignored, and one
 * that starts from anything else means something went missing, so the guest
 * asks for the whole state again.
 */
export function createStateGuest({
  send,
  onChange,
  resyncTimeout = 30_000,
  now = Date.now,
  reassembler: reassemblerOptions,
}: StateGuestOptions): StateGuest {
  const reassembler = createReassembler({ ...reassemblerOptions, now })
  let current: Version | null = null
  let asked: number | null = null
  // What the pieces of the newest transfer said they were part of.
  let transfer: Transfer | null = null

  const resync = (): void => {
    if (asked !== null && now() - asked < resyncTimeout) return
    asked = now()
    send({ type: 'resync' })
  }

  const take = (version: Version): void => {
    current = version
    onChange?.(version.projection, version.seq)
  }

  const complete = (done: Transfer, text: string): void => {
    if (done.type === 'state') {
      if (current && done.seq < current.seq) return
      const projection = decodeState(text)
      if (!projection) return resync()
      asked = null
      return take({ seq: done.seq, projection })
    }

    if (current && done.seq <= current.seq) return
    if (!current || done.base !== current.seq) return resync()
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      return resync()
    }
    const patch = parsePatch(parsed)
    const projection = patch && applyPatch(current.projection, patch)
    if (!projection) return resync()
    take({ seq: done.seq, projection })
  }

  return {
    get projection() {
      return current?.projection ?? null
    },
    get seq() {
      return current?.seq ?? null
    },
    receive(message) {
      if (message.type !== 'state' && message.type !== 'patch') return false
      const said: Transfer = {
        id: message.chunk.id,
        type: message.type,
        base: message.type === 'patch' ? message.base : message.seq,
        seq: message.seq,
        mixed: false,
      }
      // The reassembler only ever finishes the newest transfer, so only its label is kept.
      if (!transfer || said.id > transfer.id) transfer = said
      else if (said.id === transfer.id)
        transfer.mixed ||=
          transfer.type !== said.type || transfer.base !== said.base || transfer.seq !== said.seq

      const text = reassembler.accept(message.chunk)
      if (text === null) return true
      if (transfer.mixed) resync()
      else complete(transfer, text)
      return true
    },
  }
}

/**
 * Runs `task` some time after it is asked for, never two at once: asks that
 * come while it waits or runs are folded into one more run after it. Making
 * the players' projection of a large map takes a noticeable while, and a
 * store can change many times in one gesture.
 */
export interface Coalescer {
  request(): void
  /** Drops a run that is waiting; one already running finishes. */
  cancel(): void
}

export function createCoalescer(
  task: () => void | Promise<void>,
  { delay = 100 }: { delay?: number } = {},
): Coalescer {
  let timer: ReturnType<typeof setTimeout> | null = null
  let running = false
  let again = false

  const run = async (): Promise<void> => {
    timer = null
    running = true
    try {
      await task()
    } finally {
      running = false
      if (again) {
        again = false
        timer = setTimeout(() => void run(), delay)
      }
    }
  }

  return {
    request() {
      if (running) again = true
      else timer ??= setTimeout(() => void run(), delay)
    },
    cancel() {
      if (timer !== null) clearTimeout(timer)
      timer = null
      again = false
    },
  }
}
