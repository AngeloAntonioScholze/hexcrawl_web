import { realpathSync } from 'node:fs'
import vue from '@vitejs/plugin-vue'
import { loadEnv, searchForWorkspaceRoot, type Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import { buildCsp } from './src/csp'

// Agent worktrees link node_modules to the main checkout, so Vite resolves
// dependency assets (sqlite3.wasm) outside the workspace and 403s them.
const nodeModules = realpathSync('node_modules')

// Pages cannot send headers, so the policy ships as a meta tag. Build only: the
// dev server needs inline HMR scripts and ws://localhost. The PostHog host is
// read from the same env var the app uses, so no host is hard-coded.
const csp = (mode: string): Plugin => ({
  name: 'hexcrawl-csp',
  apply: 'build',
  transformIndexHtml: () => {
    const policy = buildCsp(loadEnv(mode, process.cwd(), 'VITE_').VITE_POSTHOG_HOST)
    return [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: policy },
        injectTo: 'head-prepend',
      },
    ]
  },
})

export default defineConfig(({ mode }) => ({
  plugins: [vue(), csp(mode)],
  server: {
    fs: {
      allow: [searchForWorkspaceRoot(process.cwd()), nodeModules],
    },
  },
  // peerjs is only reached through a dynamic import, so the dev server misses
  // it on startup and serves its CommonJS dependency `sdp` unbundled.
  optimizeDeps: {
    include: ['peerjs'],
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
}))
