import { describe, expect, it } from 'vitest'
import {
  accept,
  decide,
  decline,
  disconnect,
  forgetSecrets,
  kick,
  nameKey,
  newSecret,
  openRoom,
  proves,
  seatProof,
  secretToProve,
  setApproval,
  setLocked,
  type Admission,
} from './admission'

const welcome = { type: 'welcome', secret: expect.stringMatching(/^[0-9a-f]{32}$/) }

/** A proven seat's welcome: its secret is the guest's already and stays off the wire. */
const rejoined = { type: 'welcome' }

const SAVED = '0123456789abcdef0123456789abcdef'

const joined = (state: Admission, name: string, peerId: string): Admission => {
  const { state: next, reply } = decide(state, name, peerId)
  expect(reply).toEqual(welcome)
  return next
}

const secretOf = (state: Admission, name: string): string => state.secrets.get(nameKey(name))!

/** Mira let in, then gone again: the room still knows her and her secret. */
const away = (): Admission => disconnect(joined(openRoom(), 'Mira', 'p1'), 'p1')

describe('nameKey', () => {
  it('ignores case and surrounding space', () => {
    expect(nameKey('  Mira ')).toBe(nameKey('mIRA'))
  })

  it('folds compatibility forms', () => {
    expect(nameKey('Ｍｉｒａ')).toBe('mira')
    expect(nameKey('Miﬁ')).toBe('mifi')
  })

  it('drops zero-width, bidi and control characters', () => {
    for (const name of ['Mi​ra', '‍Mira﻿', '‮Mira‬', '⁦Mira⁩', 'Mi\u0000ra\u0007']) {
      expect(nameKey(name)).toBe('mira')
    }
  })
})

describe('newSecret', () => {
  it('is 128 random bits in hex, new each time', () => {
    const secrets = new Set(Array.from({ length: 50 }, newSecret))
    expect(secrets.size).toBe(50)
    for (const secret of secrets) expect(secret).toMatch(/^[0-9a-f]{32}$/)
  })
})

describe('seatProof and proves', () => {
  const NONCE = 'fedcba9876543210fedcba9876543210'

  const ROOM = 'hexcrawl-abcdef'

  it('is HMAC-SHA256 in hex, the same for the same secret, nonce, room and name', async () => {
    const proof = await seatProof(SAVED, NONCE, ROOM, 'Mira')
    expect(proof).toMatch(/^[0-9a-f]{64}$/)
    expect(proof).not.toContain(SAVED)
    expect(await seatProof(SAVED, NONCE, ROOM, ' MI​RA')).toBe(proof)
  })

  it('proves the secret it was made with, for its nonce, room and name only', async () => {
    const proof = await seatProof(SAVED, NONCE, ROOM, 'Mira')
    expect(await proves(proof, SAVED, NONCE, ROOM, 'mira')).toBe(true)
    expect(await proves(proof, newSecret(), NONCE, ROOM, 'Mira')).toBe(false)
    expect(await proves(proof, SAVED, newSecret(), ROOM, 'Mira')).toBe(false)
    expect(await proves(proof, SAVED, NONCE, ROOM, 'Tobin')).toBe(false)
    expect(await proves(proof.slice(0, 63), SAVED, NONCE, ROOM, 'Mira')).toBe(false)
  })

  it('makes a proof for one room that another room refuses, same nonce and all', async () => {
    const forA = await seatProof(SAVED, NONCE, 'hexcrawl-aaaaaa', 'Mira')
    expect(await proves(forA, SAVED, NONCE, 'hexcrawl-aaaaaa', 'Mira')).toBe(true)
    expect(await proves(forA, SAVED, NONCE, 'hexcrawl-bbbbbb', 'Mira')).toBe(false)
  })
})

describe('secretToProve', () => {
  it("is the room's secret for a name, else the one the map kept", () => {
    const room = away()
    expect(secretToProve(room, 'MIRA', SAVED)).toBe(secretOf(room, 'Mira'))
    expect(secretToProve(room, 'Tobin', SAVED)).toBe(SAVED)
    expect(secretToProve(room, 'Tobin')).toBeUndefined()
  })
})

describe('openRoom', () => {
  it('starts open, without approval, with nobody online', () => {
    const room = openRoom()
    expect(room.locked).toBe(false)
    expect(room.approval).toBe(false)
    expect(room.known.size).toBe(0)
    expect(room.online.size).toBe(0)
    expect(room.kicked.size).toBe(0)
    expect(room.pending.size).toBe(0)
  })

  it('remembers the given names in their display form', () => {
    const room = openRoom({ known: [' Mira ', 'Tobin'], locked: true, approval: true })
    expect([...room.known.values()]).toEqual(['Mira', 'Tobin'])
    expect(room.locked).toBe(true)
    expect(room.approval).toBe(true)
  })
})

describe('decide', () => {
  it('welcomes a new name to an open room and remembers it', () => {
    const { state, reply } = decide(openRoom(), ' Mira ', 'p1')
    expect(reply).toEqual(welcome)
    expect(state.known.get('mira')).toBe('Mira')
    expect(state.online.get('mira')).toBe('p1')
    expect(state.secrets.get('mira')).toBe(reply.type === 'welcome' && reply.secret)
  })

  it('hands each new name a secret of its own', () => {
    const room = joined(joined(openRoom(), 'Mira', 'p1'), 'Tobin', 'p2')
    expect(secretOf(room, 'Mira')).not.toBe(secretOf(room, 'Tobin'))
  })

  it('leaves the given state alone', () => {
    const room = openRoom()
    decide(room, 'Mira', 'p1')
    expect(room.known.size).toBe(0)
    expect(room.online.size).toBe(0)
  })

  it('refuses a new name when locked', () => {
    const room = setLocked(openRoom(), true)
    const { state, reply } = decide(room, 'Mira', 'p1')
    expect(reply).toEqual({ type: 'refused', reason: 'locked' })
    expect(state).toBe(room)
  })

  it('holds a new name for approval', () => {
    const { state, reply } = decide(setApproval(openRoom(), true), 'Mira ', 'p1')
    expect(reply).toEqual({ type: 'pending' })
    expect(state.pending.get('p1')).toBe('Mira')
    expect(state.online.size).toBe(0)
    expect(state.known.size).toBe(0)
  })

  it('prefers locked over approval for a new name', () => {
    const room = setApproval(setLocked(openRoom(), true), true)
    expect(decide(room, 'Mira', 'p1').reply).toEqual({ type: 'refused', reason: 'locked' })
  })

  it('refuses a name online now, whatever its case', () => {
    const room = joined(openRoom(), 'Mira', 'p1')
    const { state, reply } = decide(room, ' MIRA', 'p2')
    expect(reply).toEqual({ type: 'refused', reason: 'name-taken' })
    expect(state.online.get('mira')).toBe('p1')
  })

  it('refuses a name already waiting for approval', () => {
    const room = decide(setApproval(openRoom(), true), 'Mira', 'p1').state
    const { state, reply } = decide(room, 'mira', 'p2')
    expect(reply).toEqual({ type: 'refused', reason: 'name-taken' })
    expect([...state.pending.keys()]).toEqual(['p1'])
  })

  it('lets a known name back in when locked, with its secret, under that secret', () => {
    const room = setLocked(away(), true)
    const secret = secretOf(room, 'Mira')
    const { state, reply } = decide(room, 'mira', 'p2', { proven: secret })
    expect(reply).toEqual(rejoined)
    expect(state.online.get('mira')).toBe('p2')
    expect(secretOf(state, 'Mira')).toBe(secret)
  })

  it('lets a known name back in without approval, with its secret', () => {
    const room = setApproval(away(), true)
    const secret = secretOf(room, 'Mira')
    expect(decide(room, 'Mira', 'p2', { proven: secret }).reply).toEqual(rejoined)
  })

  it('sends a proven seat no secret, so nothing of it crosses the wire again', () => {
    const room = away()
    const secret = secretOf(room, 'Mira')
    const { reply } = decide(room, 'Mira', 'p2', { proven: secret })
    expect(reply).toEqual({ type: 'welcome' })
    expect(JSON.stringify(reply)).not.toContain(secret)
  })

  it('keeps a known name typed without its secret out of a locked room', () => {
    const room = setLocked(away(), true)
    expect(decide(room, 'Mira', 'p2').reply).toEqual({ type: 'refused', reason: 'locked' })
  })

  it('sends a known name with a wrong secret to the DM when approval is on', () => {
    const room = setApproval(away(), true)
    const { state, reply } = decide(room, 'Mira', 'p2', { proven: SAVED })
    expect(reply).toEqual({ type: 'pending' })
    expect(state.pending.get('p2')).toBe('Mira')
    expect(state.online.size).toBe(0)
  })

  it('turns away a known name without its secret even from an open room', () => {
    const room = away()
    expect(decide(room, 'Mira', 'p2').reply).toEqual({ type: 'refused', reason: 'name-taken' })
    expect(decide(room, 'Mira', 'p2', { proven: SAVED }).reply).toEqual({
      type: 'refused',
      reason: 'name-taken',
    })
  })

  it('takes a look-alike of a known name for that name, secret and all', () => {
    const room = setLocked(away(), true)
    expect(decide(room, 'Mi​ra', 'p2').reply).toEqual({ type: 'refused', reason: 'locked' })
    expect(decide(away(), '‮ＭＩＲＡ', 'p2').reply).toEqual({
      type: 'refused',
      reason: 'name-taken',
    })
  })

  it('does not let a name in by being given to the room as known', () => {
    const room = openRoom({ known: ['Mira'], locked: true, approval: true })
    expect(decide(room, 'MIRA', 'p1').reply).toEqual({ type: 'refused', reason: 'locked' })
  })

  it('lets a name seated before this room in past the lock and approval with its secret', () => {
    const room = openRoom({ locked: true, approval: true })
    const { state, reply } = decide(room, ' Mira', 'p1', { held: SAVED, proven: SAVED })
    expect(reply).toEqual(rejoined)
    expect(state.known.get('mira')).toBe('Mira')
    expect(state.online.get('mira')).toBe('p1')
    expect(state.secrets.get('mira')).toBe(SAVED)
  })

  it('treats a name seated before this room as a stranger without its secret', () => {
    const locked = setLocked(openRoom(), true)
    expect(decide(locked, 'Mira', 'p1', { held: SAVED }).reply).toEqual({
      type: 'refused',
      reason: 'locked',
    })
    const approval = setApproval(openRoom(), true)
    expect(decide(approval, 'Mira', 'p1', { held: SAVED, proven: newSecret() }).reply).toEqual({
      type: 'pending',
    })
    expect(decide(openRoom(), 'Mira', 'p1', { held: SAVED }).reply).toEqual({
      type: 'refused',
      reason: 'name-taken',
    })
  })

  it('lets no proof in for a name that holds no secret', () => {
    const room = setLocked(openRoom(), true)
    expect(decide(room, 'Mira', 'p1', { proven: SAVED }).reply).toEqual({
      type: 'refused',
      reason: 'locked',
    })
  })

  it("asks for this session's secret over the one the map held", () => {
    const room = setLocked(away(), true)
    expect(decide(room, 'Mira', 'p2', { held: SAVED, proven: SAVED }).reply).toEqual({
      type: 'refused',
      reason: 'locked',
    })
  })

  it('still refuses a name with its secret that is kicked or online now', () => {
    const kicked = kick(openRoom(), 'Mira').state
    expect(decide(kicked, 'Mira', 'p1', { held: SAVED, proven: SAVED }).reply).toEqual({
      type: 'refused',
      reason: 'kicked',
    })
    const online = joined(openRoom(), 'Mira', 'p1')
    expect(decide(online, 'Mira', 'p2', { proven: secretOf(online, 'Mira') }).reply).toEqual({
      type: 'refused',
      reason: 'name-taken',
    })
  })

  it('keeps the first display form on a reconnect in another case', () => {
    const room = away()
    const proven = secretOf(room, 'Mira')
    expect(decide(room, 'MIRA', 'p2', { proven }).state.known.get('mira')).toBe('Mira')
  })

  it('marks a stranger waiting under a held seat as claiming it, and nobody else', () => {
    const approval = setApproval(openRoom(), true)
    const stranger = decide(approval, 'Mira', 'p1', { held: SAVED }).state
    expect(stranger.claimsHeld.has('p1')).toBe(true)
    const wrong = decide(setApproval(away(), true), 'Mira', 'p2', { proven: SAVED }).state
    expect(wrong.claimsHeld.has('p2')).toBe(true)
    const newcomer = decide(approval, 'Tobin', 'p3').state
    expect(newcomer.claimsHeld.size).toBe(0)
  })

  it("lets a seat's owner in past a stranger waiting under its name, and puts the stranger out", () => {
    const waiting = decide(setApproval(openRoom(), true), 'Mira', 'p1', { held: SAVED }).state
    const decision = decide(waiting, 'mira', 'p2', { held: SAVED, proven: SAVED })
    expect(decision.reply).toEqual(rejoined)
    expect(decision.displaced).toBe('p1')
    expect(decision.state.online.get('mira')).toBe('p2')
    expect(decision.state.pending.size).toBe(0)
    expect(decision.state.claimsHeld.size).toBe(0)
    expect(accept(decision.state, 'p1')).toBeNull()
  })

  it('displaces nobody when no one waits under the name', () => {
    const room = away()
    expect(decide(room, 'Mira', 'p2', { proven: secretOf(room, 'Mira') }).displaced).toBeUndefined()
  })

  it('still refuses a proven name while it is online now', () => {
    const online = joined(openRoom(), 'Mira', 'p1')
    const decision = decide(online, 'Mira', 'p2', { proven: secretOf(online, 'Mira') })
    expect(decision.reply).toEqual({ type: 'refused', reason: 'name-taken' })
    expect(decision.displaced).toBeUndefined()
  })

  it('refuses a kicked name even when known and the room is open', () => {
    const room = kick(joined(openRoom(), 'Mira', 'p1'), 'Mira').state
    expect(decide(room, ' mira', 'p2').reply).toEqual({ type: 'refused', reason: 'kicked' })
  })

  it('refuses a kicked name before calling it taken', () => {
    const room = kick(joined(openRoom(), 'Mira', 'p1'), 'Mira').state
    const retaken = { ...room, online: new Map([['mira', 'p1']]) }
    expect(decide(retaken, 'Mira', 'p2').reply).toEqual({ type: 'refused', reason: 'kicked' })
  })
})

describe('accept', () => {
  it('admits a waiting peer and remembers its name', () => {
    const waiting = decide(setApproval(openRoom(), true), 'Mira', 'p1').state
    const decision = accept(waiting, 'p1')
    expect(decision?.reply).toEqual(welcome)
    expect(decision?.state.pending.size).toBe(0)
    expect(decision?.state.online.get('mira')).toBe('p1')
    expect(decision?.state.known.get('mira')).toBe('Mira')
  })

  it('admits a waiting peer even after the room was locked', () => {
    const waiting = setLocked(decide(setApproval(openRoom(), true), 'Mira', 'p1').state, true)
    expect(accept(waiting, 'p1')?.reply).toEqual(welcome)
  })

  it('lets an accepted name reconnect with its secret without asking again', () => {
    const waiting = decide(setApproval(openRoom(), true), 'Mira', 'p1').state
    const room = disconnect(accept(waiting, 'p1')!.state, 'p1')
    const proven = secretOf(room, 'Mira')
    expect(decide(room, 'Mira', 'p2', { proven }).reply).toEqual(rejoined)
  })

  it('hands a seat the DM gives to a stranger a fresh secret', () => {
    const waiting = decide(setApproval(openRoom(), true), 'Mira', 'p1', { held: SAVED }).state
    const decision = accept(waiting, 'p1')!
    expect(decision.reply).toEqual(welcome)
    expect(decision.reply).not.toEqual({ type: 'welcome', secret: SAVED })
    expect(secretOf(decision.state, 'Mira')).not.toBe(SAVED)
    expect(decision.state.claimsHeld.size).toBe(0)
  })

  it('is null for a peer that is not waiting', () => {
    expect(accept(openRoom(), 'p1')).toBeNull()
    expect(accept(joined(openRoom(), 'Mira', 'p1'), 'p1')).toBeNull()
  })
})

describe('decline', () => {
  it('refuses a waiting peer and forgets it', () => {
    const waiting = decide(setApproval(openRoom(), true), 'Mira', 'p1').state
    const decision = decline(waiting, 'p1')
    expect(decision?.reply).toEqual({ type: 'refused', reason: 'declined' })
    expect(decision?.state.pending.size).toBe(0)
    expect(decision?.state.known.size).toBe(0)
    expect(decision?.state.kicked.size).toBe(0)
  })

  it('clears the mark of a declined peer that claimed a held seat', () => {
    const waiting = decide(setApproval(openRoom(), true), 'Mira', 'p1', { held: SAVED }).state
    expect(decline(waiting, 'p1')!.state.claimsHeld.size).toBe(0)
  })

  it('lets a declined name ask again', () => {
    const waiting = decide(setApproval(openRoom(), true), 'Mira', 'p1').state
    const room = decline(waiting, 'p1')!.state
    const retry = decide(room, 'Mira', 'p2')
    expect(retry.reply).toEqual({ type: 'pending' })
    expect(retry.state.pending.get('p2')).toBe('Mira')
  })

  it('is null for a peer that is not waiting', () => {
    expect(decline(openRoom(), 'p1')).toBeNull()
  })
})

describe('disconnect', () => {
  it('takes a name offline but keeps it known', () => {
    const room = disconnect(joined(openRoom(), 'Mira', 'p1'), 'p1')
    expect(room.online.size).toBe(0)
    expect(room.known.get('mira')).toBe('Mira')
  })

  it('frees the name for its owner to reclaim', () => {
    const room = joined(openRoom(), 'Mira', 'p1')
    expect(decide(room, 'Mira', 'p2').reply).toEqual({ type: 'refused', reason: 'name-taken' })
    const back = decide(disconnect(room, 'p1'), 'Mira', 'p2', { proven: secretOf(room, 'Mira') })
    expect(back.reply).toEqual(rejoined)
    expect(back.state.online.get('mira')).toBe('p2')
  })

  it('drops a waiting peer without remembering it', () => {
    const waiting = decide(setApproval(openRoom(), true), 'Mira', 'p1').state
    const room = disconnect(waiting, 'p1')
    expect(room.pending.size).toBe(0)
    expect(room.known.size).toBe(0)
  })

  it('clears the mark of a peer that claimed a held seat and left', () => {
    const waiting = decide(setApproval(openRoom(), true), 'Mira', 'p1', { held: SAVED }).state
    expect(disconnect(waiting, 'p1').claimsHeld.size).toBe(0)
  })

  it('ignores a stale peer whose name was reclaimed', () => {
    const gone = away()
    const room = decide(gone, 'Mira', 'p2', { proven: secretOf(gone, 'Mira') }).state
    expect(disconnect(room, 'p1')).toBe(room)
  })

  it('returns the same state for an unknown peer', () => {
    const room = joined(openRoom(), 'Mira', 'p1')
    expect(disconnect(room, 'p9')).toBe(room)
  })
})

describe('kick', () => {
  it('removes an online name and names the peer to close', () => {
    const { state, peerId } = kick(joined(openRoom(), 'Mira', 'p1'), ' MIRA ')
    expect(peerId).toBe('p1')
    expect(state.online.size).toBe(0)
    expect(state.known.size).toBe(0)
    expect(state.kicked.has('mira')).toBe(true)
  })

  it('removes a waiting name and names its peer', () => {
    const waiting = decide(setApproval(openRoom(), true), 'Mira', 'p1').state
    const { state, peerId } = kick(waiting, 'mira')
    expect(peerId).toBe('p1')
    expect(state.pending.size).toBe(0)
    expect(state.kicked.has('mira')).toBe(true)
  })

  it('clears the mark of a kicked peer that claimed a held seat', () => {
    const waiting = decide(setApproval(openRoom(), true), 'Mira', 'p1', { held: SAVED }).state
    expect(kick(waiting, 'Mira').state.claimsHeld.size).toBe(0)
  })

  it('bans a known-offline name with nobody to close', () => {
    const { state, peerId } = kick(disconnect(joined(openRoom(), 'Mira', 'p1'), 'p1'), 'Mira')
    expect(peerId).toBeUndefined()
    expect(state.known.size).toBe(0)
    expect(decide(state, 'Mira', 'p2').reply).toEqual({ type: 'refused', reason: 'kicked' })
  })

  it('leaves everyone else alone', () => {
    const room = joined(joined(openRoom(), 'Mira', 'p1'), 'Tobin', 'p2')
    const { state } = kick(room, 'Mira')
    expect(state.online.get('tobin')).toBe('p2')
    expect(state.known.get('tobin')).toBe('Tobin')
  })
})

describe('forgetSecrets', () => {
  it('forgets the secrets handed out, so a seat is proven against what the map kept', () => {
    const room = setLocked(away(), true)
    const old = secretOf(room, 'Mira')
    const fresh = forgetSecrets(room)
    expect(fresh.secrets.size).toBe(0)
    expect(fresh.known.get('mira')).toBe('Mira')
    expect(decide(fresh, 'Mira', 'p2', { proven: old }).reply).toEqual({
      type: 'refused',
      reason: 'locked',
    })
    expect(decide(fresh, 'Mira', 'p2', { held: SAVED, proven: SAVED }).reply).toEqual(rejoined)
  })

  it('leaves a room with no secrets as it was', () => {
    const room = openRoom()
    expect(forgetSecrets(room)).toBe(room)
  })
})

describe('setLocked and setApproval', () => {
  it('reopens a locked room to new names', () => {
    const room = setLocked(setLocked(openRoom(), true), false)
    expect(decide(room, 'Mira', 'p1').reply).toEqual(welcome)
  })

  it('admits new names directly once approval is off', () => {
    const room = setApproval(setApproval(openRoom(), true), false)
    expect(decide(room, 'Mira', 'p1').reply).toEqual(welcome)
  })

  it('keeps peers already waiting when approval is turned off', () => {
    const waiting = decide(setApproval(openRoom(), true), 'Mira', 'p1').state
    expect(setApproval(waiting, false).pending.get('p1')).toBe('Mira')
  })
})
