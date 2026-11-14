// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { ABILITIES, defaultAbilities, type Abilities } from '../entities/abilities'
import StatHexagon from './StatHexagon.vue'

const abilities = (change: Partial<Abilities> = {}): Abilities => ({
  ...defaultAbilities(),
  ...change,
})

const mountHexagon = (editable: boolean, change: Partial<Abilities> = {}) =>
  mount(StatHexagon, {
    props: { abilities: abilities(change), character: { purse: 1250, level: 2 }, editable },
  })

const modifierOf = (wrapper: ReturnType<typeof mountHexagon>, label: string): string => {
  const id = wrapper.find(`input[aria-label="${label}"]`).attributes('aria-describedby')
  return wrapper.find(`[id="${id}"]`).text()
}

describe('StatHexagon', () => {
  describe('editable', () => {
    it('renders level, gold and six ability inputs in DOM order', () => {
      const wrapper = mountHexagon(true)
      expect(wrapper.findAll('input').map((input) => input.attributes('aria-label'))).toEqual([
        'level',
        'gold, in coins',
        ...ABILITIES.map((ability) => `${ability} score`),
      ])
    })

    it('emits the ability on change', async () => {
      const wrapper = mountHexagon(true, { strength: 12 })
      const strength = wrapper.find('input[aria-label="strength score"]')
      await strength.setValue('15')
      expect(wrapper.emitted('ability')).toEqual([['strength', 15]])
    })

    it('rounds a fractional score and leaves clamping to the store', async () => {
      const wrapper = mountHexagon(true)
      await wrapper.find('input[aria-label="wisdom score"]').setValue('25')
      await wrapper.find('input[aria-label="dexterity score"]').setValue('13.6')
      expect(wrapper.emitted('ability')).toEqual([
        ['wisdom', 25],
        ['dexterity', 14],
      ])
    })

    it('emits nothing on a cleared field and restores the value', async () => {
      const wrapper = mountHexagon(true, { strength: 12 })
      const strength = wrapper.find('input[aria-label="strength score"]')
      await strength.setValue('')
      expect(wrapper.emitted('ability')).toBeUndefined()
      expect((strength.element as HTMLInputElement).value).toBe('12')
      expect(strength.attributes('aria-invalid')).toBeUndefined()
    })

    it('emits the level and the purse on change', async () => {
      const wrapper = mountHexagon(true)
      await wrapper.find('input[aria-label="level"]').setValue('3')
      await wrapper.find('input[aria-label="gold, in coins"]').setValue('999999')
      expect(wrapper.emitted('level')).toEqual([[3]])
      expect(wrapper.emitted('purse')).toEqual([[999999]])
    })

    it('marks an out-of-range draft invalid until it is committed', async () => {
      const wrapper = mountHexagon(true, { strength: 12 })
      const strength = wrapper.find('input[aria-label="strength score"]')
      ;(strength.element as HTMLInputElement).value = '25'
      await strength.trigger('input')
      expect(strength.attributes('aria-invalid')).toBe('true')
      expect(strength.attributes('title')).toBe('a whole number from 1 to 20')
      expect(wrapper.find('.stat.invalid').exists()).toBe(true)
      expect(modifierOf(wrapper, 'strength score')).toBe('modifier +1')
      await strength.trigger('change')
      expect(strength.attributes('aria-invalid')).toBeUndefined()
    })

    it('titles an invalid level draft with its limits', async () => {
      const wrapper = mountHexagon(true)
      const level = wrapper.find('input[aria-label="level"]')
      ;(level.element as HTMLInputElement).value = '21'
      await level.trigger('input')
      expect(level.attributes('aria-invalid')).toBe('true')
      expect(level.attributes('title')).toBe('a whole number from 1 to 20')
    })

    it('titles an invalid purse draft with its limits', async () => {
      const wrapper = mountHexagon(true)
      const purse = wrapper.find('input[aria-label="gold, in coins"]')
      ;(purse.element as HTMLInputElement).value = '1000000'
      await purse.trigger('input')
      expect(purse.attributes('aria-invalid')).toBe('true')
      expect(purse.attributes('title')).toBe('a whole number from 0 to 999999')
      expect(wrapper.find('.cell.invalid').exists()).toBe(true)
    })

    it.each<[label: string, was: string]>([
      ...ABILITIES.map((ability): [string, string] => [`${ability} score`, '10']),
      ['gold, in coins', '1250'],
      ['level', '2'],
    ])('drops the draft of %s on blur when it was typed back unchanged', async (label, was) => {
      const wrapper = mountHexagon(true)
      const input = wrapper.find(`input[aria-label="${label}"]`)
      const element = input.element as HTMLInputElement
      element.value = ''
      await input.trigger('input')
      element.value = was
      await input.trigger('input')
      await input.trigger('blur')
      expect(wrapper.emitted()).not.toHaveProperty('ability')
      await wrapper.setProps({
        abilities: abilities({
          strength: 4,
          dexterity: 4,
          constitution: 4,
          intelligence: 4,
          wisdom: 4,
          charisma: 4,
        }),
        character: { purse: 4, level: 4 },
      })
      expect(element.value).toBe('4')
    })

    it('keeps a draft when the stored value changes mid-edit', async () => {
      const wrapper = mountHexagon(true, { strength: 12 })
      const strength = wrapper.find('input[aria-label="strength score"]')
      ;(strength.element as HTMLInputElement).value = '17'
      await strength.trigger('input')
      await wrapper.setProps({ abilities: abilities({ strength: 8 }) })
      expect((strength.element as HTMLInputElement).value).toBe('17')
      expect(modifierOf(wrapper, 'strength score')).toBe('modifier +3')
    })

    it('shows a new stored value after commit', async () => {
      const wrapper = mountHexagon(true, { strength: 12 })
      const strength = wrapper.find('input[aria-label="strength score"]')
      await strength.setValue('25')
      await wrapper.setProps({ abilities: abilities({ strength: 20 }) })
      expect((strength.element as HTMLInputElement).value).toBe('20')
      expect(modifierOf(wrapper, 'strength score')).toBe('modifier +5')
    })
  })

  describe('read-only', () => {
    it('has no inputs and shows every value as text', () => {
      const wrapper = mountHexagon(false, { strength: 14, charisma: 7 })
      expect(wrapper.findAll('input')).toHaveLength(0)
      expect(wrapper.findAll('.stat .score').map((score) => score.text())).toEqual([
        '14',
        '10',
        '10',
        '10',
        '10',
        '7',
      ])
      expect(wrapper.find('.purse').text()).toBe('gold 1250')
      expect(wrapper.find('.level').text()).toBe('level 2')
      expect(wrapper.find('.stat').attributes('role')).toBe('group')
      expect(wrapper.find('.stat').attributes('aria-label')).toBe('strength 14, modifier +2')
      expect(wrapper.find('.stat .contents').attributes('aria-hidden')).toBe('true')
      expect(wrapper.find('.stat .mod').attributes('aria-hidden')).toBe('true')
    })
  })

  it('shows a signed modifier under each score', () => {
    const wrapper = mountHexagon(false, {
      strength: 8,
      dexterity: 10,
      constitution: 15,
      intelligence: 20,
      wisdom: 1,
      charisma: 11,
    })
    expect(wrapper.findAll('.stat .mod').map((modifier) => modifier.text())).toEqual([
      'modifier −1',
      'modifier 0',
      'modifier +2',
      'modifier +5',
      'modifier −5',
      'modifier 0',
    ])
  })
})
