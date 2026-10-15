import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import type { MapSnapshot } from '../persistence/mapState'
import { useHexMapStore } from './hexMap'
import { useMapLibraryStore, type MapLibraryBackend } from './mapLibrary'

/** A backend that only writes down what it was asked to do. */
const recorder = (): { calls: string[]; backend: MapLibraryBackend } => {
  const calls: string[] = []
  const note = (name: string) => async (): Promise<void> => {
    calls.push(name)
  }
  return {
    calls,
    backend: {
      open: note('open'),
      create: note('create'),
      importMap: note('importMap'),
      rename: note('rename'),
      remove: note('remove'),
    },
  }
}

const everything = async (library: ReturnType<typeof useMapLibraryStore>): Promise<void> => {
  await library.open('other')
  await library.create()
  await library.importMap('a.json', {} as MapSnapshot)
  await library.rename('other', 'Westmarch')
  await library.remove('other')
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('the map library', () => {
  it('does whatever the DM asks of it', async () => {
    const library = useMapLibraryStore()
    const { calls, backend } = recorder()
    library.connect(backend)

    await everything(library)

    expect(calls).toEqual(['open', 'create', 'importMap', 'rename', 'remove'])
  })

  it('does nothing a player asks of it', async () => {
    const library = useMapLibraryStore()
    const { calls, backend } = recorder()
    library.connect(backend)
    useHexMapStore().dmView = false

    await everything(library)

    expect(calls).toEqual([])
    expect(library.busy).toBe(false)
  })
})
