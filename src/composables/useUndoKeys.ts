import { onBeforeUnmount, onMounted } from 'vue'
import { useHexMapStore } from '../stores/hexMap'

/** Inputs that hold no text of their own, so there is no native undo to keep. */
const TEXTLESS_INPUTS = new Set([
  'checkbox',
  'radio',
  'range',
  'button',
  'submit',
  'reset',
  'color',
])

interface KeyTarget {
  tagName?: string
  type?: string
  isContentEditable?: boolean
}

type UndoKeyEvent = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey'> & {
  target: unknown
}

const editsText = (target: unknown): boolean => {
  if (typeof target !== 'object' || target === null) return false
  const { tagName, type, isContentEditable } = target as KeyTarget
  if (isContentEditable) return true
  if (tagName === 'TEXTAREA') return true
  return tagName === 'INPUT' && !TEXTLESS_INPUTS.has(type ?? 'text')
}

/**
 * Ctrl+Z takes a step back, Ctrl+Shift+Z or Ctrl+Y takes it again; Cmd on a
 * Mac. A key pressed while typing is the text box's own undo, not the map's.
 */
export function undoKey(event: UndoKeyEvent): 'undo' | 'redo' | null {
  if (!(event.ctrlKey || event.metaKey) || editsText(event.target)) return null
  const key = event.key.toLowerCase()
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo'
  if (key === 'y' && !event.shiftKey) return 'redo'
  return null
}

export function useUndoKeys(): void {
  const store = useHexMapStore()

  const onKey = (event: KeyboardEvent): void => {
    const step = undoKey(event)
    if (!step) return
    event.preventDefault()
    if (step === 'undo') store.undo()
    else store.redo()
  }

  onMounted(() => window.addEventListener('keydown', onKey))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
}
