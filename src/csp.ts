const HOST = /^https?:\/\/[A-Za-z0-9.-]+(:\d{1,5})?\/?$/

const postHogOrigin = (host: string): string => {
  if (!HOST.test(host)) {
    throw new Error(
      `VITE_POSTHOG_HOST must be an http(s) origin such as https://eu.i.posthog.com, got "${host}"`,
    )
  }
  return new URL(host).origin
}

/** The page's Content-Security-Policy; the PostHog host is the only build-time input. */
export const buildCsp = (postHogHost: string | undefined): string => {
  const connect = [
    "'self'",
    'https://0.peerjs.com',
    'wss://0.peerjs.com',
    ...(postHogHost ? [postHogOrigin(postHogHost)] : []),
  ]
  return [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "worker-src 'self' blob:",
    `connect-src ${connect.join(' ')}`,
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; ')
}
