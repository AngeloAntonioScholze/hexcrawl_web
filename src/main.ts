import { createPinia } from 'pinia'
import posthog from 'posthog-js'
import { createApp } from 'vue'
import App from './App.vue'
import { startMapSession } from './persistence/mapSession'
import { router } from './router'
import { useHexMapStore } from './stores/hexMap'
import { useMapLibraryStore } from './stores/mapLibrary'
import './style.css'

const posthogToken = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN
const posthogHost = import.meta.env.VITE_POSTHOG_HOST
let posthogLogger: typeof posthog.logger | undefined

if (posthogToken && posthogHost) {
  posthog.init(posthogToken, {
    api_host: posthogHost,
    defaults: '2026-08-30',
    logs: {
      serviceName: 'hexcrawl-web',
      environment: import.meta.env.MODE,
    },
  })
  posthogLogger = posthog.logger
  posthogLogger.info('hexcrawl client initialized', { lifecycle: 'client_initialization' })
} else if (import.meta.env.DEV) {
  const missingVariable = posthogToken
    ? 'VITE_POSTHOG_HOST'
    : 'VITE_POSTHOG_PROJECT_TOKEN'
  throw new Error(
    `${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`,
  )
}

const app = createApp(App).use(createPinia()).use(router)

if (posthogToken && posthogHost) {
  app.config.errorHandler = (error) => {
    posthog.captureException(error)
  }
}

// Mounted only once the save is back, so the canvas builds the world the party
// left rather than a default one it has to tear down a frame later.
await startMapSession(useHexMapStore(), useMapLibraryStore())
posthogLogger?.info('hexcrawl map session ready', { lifecycle: 'map_session_initialization' })

app.mount('#app')
