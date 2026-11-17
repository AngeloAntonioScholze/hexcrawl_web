import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { capture } from '../analytics/analytics'
import type { MapSnapshot } from '../persistence/mapState'
import { useHexMapStore } from './hexMap'
import { useMapLibraryStore, type MapLibraryBackend } from './mapLibrary'

vi.mock('../analytics/analytics', () => ({ capture: vi.fn() }))

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
  vi.mocked(capture).mockClear()
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

  it('counts a map made, opened or imported, once it is the open one', async () => {
    const library = useMapLibraryStore()
    let next = 1
    const arrive = async (): Promise<void> => {
      library.show({ maps: [], currentId: `map-${next++}` })
    }
    library.connect({ ...recorder().backend, open: arrive, create: arrive, importMap: arrive })

    await library.create()
    await library.open('other')
    await library.importMap('secret plans.json', {} as MapSnapshot)

    expect(vi.mocked(capture).mock.calls).toEqual([
      ['map_created', { source: 'new' }],
      ['map_loaded', { source: 'storage' }],
      ['map_loaded', { source: 'file' }],
    ])
  })

  it('counts nothing when the map did not change', async () => {
    const library = useMapLibraryStore()
    library.connect(recorder().backend)
    library.show({ maps: [], currentId: 'here' })

    await library.open('here')
    await everything(library)
    useHexMapStore().dmView = false
    await everything(library)

    expect(capture).not.toHaveBeenCalled()
  })
})
