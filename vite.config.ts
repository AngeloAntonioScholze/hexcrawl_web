import { realpathSync } from 'node:fs'
import vue from '@vitejs/plugin-vue'
import { searchForWorkspaceRoot } from 'vite'
import { defineConfig } from 'vitest/config'

// Agent worktrees link node_modules to the main checkout, so Vite resolves
// dependency assets (sqlite3.wasm) outside the workspace and 403s them.
const nodeModules = realpathSync('node_modules')

export default defineConfig({
  plugins: [vue()],
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
})
