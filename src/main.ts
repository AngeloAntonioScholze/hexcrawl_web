import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { startMapSession } from './persistence/mapSession'
import { router } from './router'
import { useHexMapStore } from './stores/hexMap'
import { useMapLibraryStore } from './stores/mapLibrary'
import './style.css'

const app = createApp(App).use(createPinia()).use(router)

// Mounted only once the save is back, so the canvas builds the world the party
// left rather than a default one it has to tear down a frame later.
await startMapSession(useHexMapStore(), useMapLibraryStore())

app.mount('#app')
