// @vitest-environment happy-dom
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { capture } from '../analytics/analytics'
import { hexKey } from '../hex/coords'
import { useHexMapStore } from '../stores/hexMap'
import HexEncounter from './HexEncounter.vue'

vi.mock('../analytics/analytics', () => ({ capture: vi.fn() }))

const HEX = { q: 0, r: 0 }

const mountOnGrass = () => {
  const store = useHexMapStore()
  store.setTiles(
    new Map([
      [
        hexKey(HEX),
        { hex: HEX, terrain: 'grass', height: 1, level: 1, elevation: 1.5, color: new Color3() },
      ],
    ]),
  )
  return mount(HexEncounter, { props: { hex: hexKey(HEX) } })
}

const button = (wrapper: ReturnType<typeof mount>, label: string) =>
  wrapper.findAll('button').find((one) => one.text() === label)!

beforeEach(() => {
  setActivePinia(createPinia())
  vi.mocked(capture).mockClear()
  vi.spyOn(Math, 'random').mockReturnValue(0)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('HexEncounter usage stats', () => {
  it('counts an accepted encounter, with no detail of it', async () => {
    const wrapper = mountOnGrass()
    await button(wrapper, 'roll encounter').trigger('click')
    await button(wrapper, 'accept').trigger('click')
    expect(vi.mocked(capture).mock.calls).toEqual([['encounter_accepted']])
  })

  it('counts nothing for a roll, a reroll or a dismiss', async () => {
    const wrapper = mountOnGrass()
    await button(wrapper, 'roll encounter').trigger('click')
    expect(button(wrapper, 'accept').exists()).toBe(true)
    await button(wrapper, 'reroll').trigger('click')
    await button(wrapper, 'dismiss').trigger('click')
    expect(capture).not.toHaveBeenCalled()
  })
})
