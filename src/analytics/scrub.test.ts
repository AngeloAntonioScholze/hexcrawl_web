import type { CaptureResult } from 'posthog-js'
import { describe, expect, it } from 'vitest'
import { scrubEvent, stripRoom } from './scrub'

const event = (properties: Record<string, unknown>): CaptureResult =>
  ({ uuid: 'u', event: 'e', properties }) as CaptureResult

describe('stripRoom', () => {
  it('removes the room param and keeps the rest', () => {
    expect(stripRoom('https://x.io/?room=abc234')).toBe('https://x.io/')
    expect(stripRoom('https://x.io/?room=abc234&debug=1')).toBe('https://x.io/?debug=1')
    expect(stripRoom('https://x.io/?debug=1&room=abc234#h')).toBe('https://x.io/?debug=1#h')
    expect(stripRoom('?room=abc234')).toBe('')
  })

  it('removes every room param, however many or encoded', () => {
    expect(stripRoom('https://x.io/?room=a&room=b')).toBe('https://x.io/')
    expect(stripRoom('https://x.io/?r%6Fom=a&k=1')).toBe('https://x.io/?k=1')
    expect(stripRoom('?room=a&room=b&x=2')).toBe('?x=2')
  })

  it('leaves strings without a room param untouched', () => {
    expect(stripRoom('Are you sure?')).toBe('Are you sure?')
    expect(stripRoom('https://x.io?')).toBe('https://x.io?')
    expect(stripRoom('plain')).toBe('plain')
  })

  it('leaves other text alone', () => {
    expect(stripRoom('https://x.io/rooms?roomy=1')).toBe('https://x.io/rooms?roomy=1')
  })
})

describe('scrubEvent', () => {
  it('strips the room from every url-ish property, nested too', () => {
    const out = scrubEvent(
      event({
        $current_url: 'https://x.io/?room=abc234',
        $referrer: 'https://y.io/?room=abc234&a=1',
        $initial_current_url: 'https://x.io/?room=abc234',
        view: 'dm',
      }),
    )!
    expect(JSON.stringify(out.properties)).not.toContain('abc234')
    expect(out.properties.$referrer).toBe('https://y.io/?a=1')
    expect(out.properties.view).toBe('dm')
  })

  it('strips the room from top-level $set and $set_once', () => {
    const out = scrubEvent({
      ...event({}),
      $set: { $current_url: 'https://x.io/?room=abc234' },
      $set_once: {
        $initial_current_url: 'https://x.io/?room=abc234',
        $initial_referrer: '$direct',
      },
    } as CaptureResult)! as unknown as Record<string, Record<string, string>>
    expect(JSON.stringify(out)).not.toContain('abc234')
    expect(out.$set_once.$initial_referrer).toBe('$direct')
  })

  it('keeps exception type and frames but drops message text', () => {
    const out = scrubEvent(
      event({
        $exception_list: [
          {
            type: 'TypeError',
            value: 'bad name "Gandalf"',
            stacktrace: { frames: [{ filename: 'https://x.io/a.js?room=abc234', lineno: 3 }] },
          },
        ],
        $exception_message: 'bad name "Gandalf"',
      }),
    )!
    const [item] = out.properties.$exception_list
    expect(item.type).toBe('TypeError')
    expect(item.value).toBeUndefined()
    expect(item.stacktrace.frames[0]).toEqual({ filename: 'https://x.io/a.js', lineno: 3 })
    expect(out.properties.$exception_message).toBeUndefined()
  })

  it('passes non-plain objects through unchanged', () => {
    const when = new Date(0)
    class Box {
      size = 3
    }
    const box = new Box()
    const out = scrubEvent(event({ when, box }))!
    expect(out.properties.when).toBe(when)
    expect(out.properties.box).toBe(box)
  })

  it('passes null through', () => {
    expect(scrubEvent(null)).toBeNull()
  })
})
