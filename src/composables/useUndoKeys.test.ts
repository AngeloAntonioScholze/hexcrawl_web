import { describe, expect, it } from 'vitest'
import { undoKey } from './useUndoKeys'

const press = (key: string, change: Partial<Parameters<typeof undoKey>[0]> = {}) =>
  undoKey({ key, ctrlKey: true, metaKey: false, shiftKey: false, target: null, ...change })

describe('undoKey', () => {
  it('reads Ctrl+Z as undo and Ctrl+Shift+Z or Ctrl+Y as redo', () => {
    expect(press('z')).toBe('undo')
    expect(press('Z', { shiftKey: true })).toBe('redo')
    expect(press('y')).toBe('redo')
  })

  it('takes Cmd as well as Ctrl', () => {
    expect(press('z', { ctrlKey: false, metaKey: true })).toBe('undo')
  })

  it('ignores the keys without a modifier, and other keys', () => {
    expect(press('z', { ctrlKey: false })).toBeNull()
    expect(press('x')).toBeNull()
  })

  it('leaves the keys to a box being typed in', () => {
    expect(press('z', { target: { tagName: 'TEXTAREA' } })).toBeNull()
    expect(press('z', { target: { tagName: 'INPUT', type: 'text' } })).toBeNull()
    expect(press('y', { target: { tagName: 'DIV', isContentEditable: true } })).toBeNull()
  })

  it('still answers from a slider or a checkbox, which hold no text', () => {
    expect(press('z', { target: { tagName: 'INPUT', type: 'range' } })).toBe('undo')
    expect(press('z', { target: { tagName: 'INPUT', type: 'checkbox' } })).toBe('undo')
  })
})
