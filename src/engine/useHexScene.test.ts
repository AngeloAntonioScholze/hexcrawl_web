// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { capture } from '../analytics/analytics'
import { createHexScene, type HexScene, type HexSceneOptions } from './scene'
import { useHexScene } from './useHexScene'

vi.mock('../analytics/analytics', () => ({ capture: vi.fn() }))
vi.mock('./scene', () => ({ createHexScene: vi.fn() }))

const Host = defineComponent({
  setup() {
    const canvas = ref<HTMLCanvasElement | null>(null)
    useHexScene(canvas, {} as HexSceneOptions)
    return () => h('canvas', { ref: canvas })
  },
})

const mountHost = (): void => {
  mount(Host)
}

beforeEach(() => {
  vi.mocked(capture).mockClear()
  vi.mocked(createHexScene).mockReset()
})

describe('useHexScene usage stats', () => {
  it('reports a browser without WebGL, and still fails as before', () => {
    const failure = new Error('WebGL not supported')
    vi.mocked(createHexScene).mockImplementation(() => {
      throw failure
    })
    expect(mountHost).toThrow(failure)
    expect(capture).toHaveBeenCalledWith('render_init_failed', { reason: 'no_webgl' })
  })

  it('reports any other failure to build the scene', () => {
    vi.mocked(createHexScene).mockImplementation(() => {
      throw new Error('shader compile')
    })
    expect(mountHost).toThrow('shader compile')
    expect(capture).toHaveBeenCalledWith('render_init_failed', { reason: 'other' })
  })

  it('reports a lost context, and nothing while the scene is fine', () => {
    let lose = (): void => {}
    vi.mocked(createHexScene).mockReturnValue({
      engine: { onContextLostObservable: { add: (run: () => void) => (lose = run) } },
      resize: vi.fn(),
      dispose: vi.fn(),
    } as unknown as HexScene)
    mountHost()
    expect(capture).not.toHaveBeenCalled()

    lose()
    expect(capture).toHaveBeenCalledWith('render_init_failed', { reason: 'context_lost' })
  })
})
