import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { MapEntry } from '../persistence/mapIndex'
import type { MapSnapshot } from '../persistence/mapState'
import type { MapList } from '../persistence/protocol'

/** What the map session does on the list's behalf; it alone talks to the worker. */
export interface MapLibraryBackend {
  open(id: string): Promise<void>
  create(): Promise<void>
  importMap(fileName: string, snapshot: MapSnapshot): Promise<void>
  rename(id: string, name: string): Promise<void>
  remove(id: string): Promise<void>
}

/** The saved maps and which one the sandbox is writing to. */
export const useMapLibraryStore = defineStore('mapLibrary', () => {
  const maps = ref<MapEntry[]>([])
  const currentId = ref<string | null>(null)
  const busy = ref(false)
  let backend: MapLibraryBackend | null = null

  const current = computed(() => maps.value.find((one) => one.id === currentId.value) ?? null)

  const connect = (next: MapLibraryBackend): void => {
    backend = next
  }

  const show = (list: MapList): void => {
    maps.value = list.maps
    currentId.value = list.currentId
  }

  // One change at a time: a second click mid-switch would otherwise race the
  // first for which map ends up open.
  const run = async (work: (to: MapLibraryBackend) => Promise<void>): Promise<void> => {
    if (!backend || busy.value) return
    busy.value = true
    try {
      await work(backend)
    } finally {
      busy.value = false
    }
  }

  return {
    maps,
    currentId,
    busy,
    current,
    connect,
    show,
    open: (id: string) => run((to) => (id === currentId.value ? Promise.resolve() : to.open(id))),
    create: () => run((to) => to.create()),
    importMap: (fileName: string, snapshot: MapSnapshot) =>
      run((to) => to.importMap(fileName, snapshot)),
    rename: (id: string, name: string) => run((to) => to.rename(id, name)),
    remove: (id: string) => run((to) => to.remove(id)),
  }
})
