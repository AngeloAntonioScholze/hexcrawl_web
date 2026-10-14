/** Inputs that hold no text of their own, so a key pressed in one is free for the map. */
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

/** Whether a key pressed on this target is typing, and so belongs to the field rather than the map. */
export const editsText = (target: unknown): boolean => {
  if (typeof target !== 'object' || target === null) return false
  const { tagName, type, isContentEditable } = target as KeyTarget
  if (isContentEditable) return true
  if (tagName === 'TEXTAREA') return true
  return tagName === 'INPUT' && !TEXTLESS_INPUTS.has(type ?? 'text')
}
