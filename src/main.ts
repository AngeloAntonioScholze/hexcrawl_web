import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { captureException, configured, startAnalytics } from './analytics/analytics'
import { startMapSession } from './persistence/mapSession'
import { router } from './router'
import { useHexMapStore } from './stores/hexMap'
import { useMapLibraryStore } from './stores/mapLibrary'
import './style.css'

startAnalytics()

const app = createApp(App).use(createPinia()).use(router)

if (configured) {
  // Setting a handler stops Vue logging the error itself, so it is logged here.
  app.config.errorHandler = (error) => {
    console.error(error)
    captureException(error)
  }
}

// Mounted only once the save is back, so the canvas builds the world the party
// left rather than a default one it has to tear down a frame later.
await startMapSession(useHexMapStore(), useMapLibraryStore())

app.mount('#app')
