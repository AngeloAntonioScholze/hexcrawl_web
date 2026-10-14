import { describe, expect, it } from 'vitest'
import { editsText } from './editsText'

describe('editsText', () => {
  it('counts text boxes, text areas and editable content as typing', () => {
    expect(editsText({ tagName: 'TEXTAREA' })).toBe(true)
    expect(editsText({ tagName: 'INPUT', type: 'text' })).toBe(true)
    expect(editsText({ tagName: 'INPUT', type: 'number' })).toBe(true)
    expect(editsText({ tagName: 'DIV', isContentEditable: true })).toBe(true)
  })

  it('leaves sliders, checkboxes, buttons and the page to the map', () => {
    expect(editsText({ tagName: 'INPUT', type: 'range' })).toBe(false)
    expect(editsText({ tagName: 'INPUT', type: 'checkbox' })).toBe(false)
    expect(editsText({ tagName: 'BUTTON' })).toBe(false)
    expect(editsText(null)).toBe(false)
  })
})
