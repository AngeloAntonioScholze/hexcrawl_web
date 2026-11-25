import type { CaptureResult } from 'posthog-js'

/** Drops the room param from a URL or query string; the code never leaves the browser. */
export const stripRoom = (text: string): string => {
  const absolute = URL.canParse(text) ? new URL(text) : null
  if (absolute) {
    const kept = withoutRoom(absolute.searchParams)
    if (!kept) return text
    absolute.search = kept.toString()
    return absolute.toString()
  }
  const start = text.indexOf('?')
  if (start === -1) return text
  const hash = text.indexOf('#', start)
  const end = hash === -1 ? text.length : hash
  const kept = withoutRoom(new URLSearchParams(text.slice(start + 1, end)))
  if (!kept) return text
  const query = kept.toString()
  return text.slice(0, start) + (query ? `?${query}` : '') + text.slice(end)
}

/** The params minus every room, or null when there was none to remove. */
const withoutRoom = (params: URLSearchParams): URLSearchParams | null => {
  const kept = new URLSearchParams()
  for (const [key, value] of params) if (key.toLowerCase() !== 'room') kept.append(key, value)
  return [...kept].length === [...params].length ? null : kept
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

const scrubValue = (value: unknown): unknown => {
  if (typeof value === 'string') return stripRoom(value)
  if (Array.isArray(value)) return value.map(scrubValue)
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, scrubValue(inner)]))
  }
  return value
}

// Exception messages and stacks can quote what the visitor typed: the type and
// the frames stay, the free text goes.
const scrubException = (item: unknown): unknown => {
  if (item === null || typeof item !== 'object') return item
  return Object.fromEntries(Object.entries(item).filter(([key]) => key !== 'value'))
}

/** Posthog's before_send hook: no room code in any URL, no free text in exceptions. */
export const scrubEvent = (event: CaptureResult | null): CaptureResult | null => {
  if (!event) return event
  const properties = scrubValue(event.properties) as Record<string, unknown>
  if (Array.isArray(properties.$exception_list)) {
    properties.$exception_list = properties.$exception_list.map(scrubException)
  }
  delete properties.$exception_message
  delete properties.$exception_values
  const original = event as unknown as Record<string, unknown>
  const scrubbed: Record<string, unknown> = { ...original, properties }
  for (const key of ['$set', '$set_once']) {
    if (key in original) scrubbed[key] = scrubValue(original[key])
  }
  return scrubbed as unknown as CaptureResult
}
