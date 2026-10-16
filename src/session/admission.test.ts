import { describe, expect, it } from 'vitest'
import {
  accept,
  decide,
  decline,
  disconnect,
  kick,
  nameKey,
  openRoom,
  setApproval,
  setLocked,
  type Admission,
} from './admission'

const joined = (state: Admission, name: string, peerId: string): Admission => {
  const { state: next, reply } = decide(state, name, peerId)
  expect(reply).toEqual({ type: 'welcome' })
  return next
}

describe('nameKey', () => {
  it('ignores case and surrounding space', () => {
    expect(nameKey('  Mira ')).toBe(nameKey('mIRA'))
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
    expect(reply).toEqual({ type: 'welcome' })
    expect(state.known.get('mira')).toBe('Mira')
    expect(state.online.get('mira')).toBe('p1')
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

  it('lets a known name back in when locked', () => {
    const room = setLocked(disconnect(joined(openRoom(), 'Mira', 'p1'), 'p1'), true)
    const { state, reply } = decide(room, 'mira', 'p2')
    expect(reply).toEqual({ type: 'welcome' })
    expect(state.online.get('mira')).toBe('p2')
  })

  it('lets a known name back in without approval', () => {
    const room = setApproval(disconnect(joined(openRoom(), 'Mira', 'p1'), 'p1'), true)
    expect(decide(room, 'Mira', 'p2').reply).toEqual({ type: 'welcome' })
  })

  it('lets a name known from before this session in when locked', () => {
    const room = openRoom({ known: ['Mira'], locked: true, approval: true })
    expect(decide(room, 'MIRA', 'p1').reply).toEqual({ type: 'welcome' })
  })

  it('keeps the first display form on a reconnect in another case', () => {
    const room = disconnect(joined(openRoom(), 'Mira', 'p1'), 'p1')
    expect(decide(room, 'MIRA', 'p2').state.known.get('mira')).toBe('Mira')
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
    expect(decision?.reply).toEqual({ type: 'welcome' })
    expect(decision?.state.pending.size).toBe(0)
    expect(decision?.state.online.get('mira')).toBe('p1')
    expect(decision?.state.known.get('mira')).toBe('Mira')
  })

  it('admits a waiting peer even after the room was locked', () => {
    const waiting = setLocked(decide(setApproval(openRoom(), true), 'Mira', 'p1').state, true)
    expect(accept(waiting, 'p1')?.reply).toEqual({ type: 'welcome' })
  })

  it('lets an accepted name reconnect without asking again', () => {
    const waiting = decide(setApproval(openRoom(), true), 'Mira', 'p1').state
    const room = disconnect(accept(waiting, 'p1')!.state, 'p1')
    expect(decide(room, 'Mira', 'p2').reply).toEqual({ type: 'welcome' })
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
    const back = decide(disconnect(room, 'p1'), 'Mira', 'p2')
    expect(back.reply).toEqual({ type: 'welcome' })
    expect(back.state.online.get('mira')).toBe('p2')
  })

  it('drops a waiting peer without remembering it', () => {
    const waiting = decide(setApproval(openRoom(), true), 'Mira', 'p1').state
    const room = disconnect(waiting, 'p1')
    expect(room.pending.size).toBe(0)
    expect(room.known.size).toBe(0)
  })

  it('ignores a stale peer whose name was reclaimed', () => {
    const room = joined(disconnect(joined(openRoom(), 'Mira', 'p1'), 'p1'), 'Mira', 'p2')
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

describe('setLocked and setApproval', () => {
  it('reopens a locked room to new names', () => {
    const room = setLocked(setLocked(openRoom(), true), false)
    expect(decide(room, 'Mira', 'p1').reply).toEqual({ type: 'welcome' })
  })

  it('admits new names directly once approval is off', () => {
    const room = setApproval(setApproval(openRoom(), true), false)
    expect(decide(room, 'Mira', 'p1').reply).toEqual({ type: 'welcome' })
  })

  it('keeps peers already waiting when approval is turned off', () => {
    const waiting = decide(setApproval(openRoom(), true), 'Mira', 'p1').state
    expect(setApproval(waiting, false).pending.get('p1')).toBe('Mira')
  })
})
