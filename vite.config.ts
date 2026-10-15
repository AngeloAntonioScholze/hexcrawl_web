import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  // peerjs is only reached through a dynamic import, so the dev server misses
  // it on startup and serves its CommonJS dependency `sdp` unbundled.
  optimizeDeps: {
    include: ['peerjs'],
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
