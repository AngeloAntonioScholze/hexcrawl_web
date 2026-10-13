import { describe, expect, it } from 'vitest'
import { MERCHANT_INFO, MERCHANT_TYPES } from './merchant'

describe('merchant types', () => {
  const infos = MERCHANT_TYPES.map((type) => MERCHANT_INFO[type])

  it('describes every type exactly once', () => {
    expect(Object.keys(MERCHANT_INFO).sort()).toEqual([...MERCHANT_TYPES].sort())
    expect(new Set(MERCHANT_TYPES).size).toBe(MERCHANT_TYPES.length)
  })

  it('gives each type its own title-case label', () => {
    for (const { label } of infos) expect(label).toMatch(/^[A-Z][a-z]+$/)
    expect(new Set(infos.map((info) => info.label)).size).toBe(infos.length)
  })

  it('gives each type a blurb, a single glyph and a distinct hex colour', () => {
    const graphemes = new Intl.Segmenter()
    for (const { blurb, icon, color } of infos) {
      expect(blurb.trim()).not.toBe('')
      expect([...graphemes.segment(icon)]).toHaveLength(1)
      expect(color).toMatch(/^#[0-9a-f]{6}$/)
    }
    expect(new Set(infos.map((info) => info.color)).size).toBe(infos.length)
  })
})
