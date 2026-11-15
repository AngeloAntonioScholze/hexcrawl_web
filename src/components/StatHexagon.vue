<script setup lang="ts">
import { reactive, useId } from 'vue'
import {
  ABILITIES,
  ABILITY_LIMITS,
  abilityModifier,
  type Abilities,
  type Ability,
} from '../entities/abilities'
import { draftCommit, draftValid } from './cardBody'

const props = defineProps<{
  abilities: Abilities
  editable: boolean
}>()

const emit = defineEmits<{
  ability: [ability: Ability, value: number]
}>()

const SHORT: Record<Ability, string> = {
  strength: 'STR',
  dexterity: 'DEX',
  constitution: 'CON',
  intelligence: 'INT',
  wisdom: 'WIS',
  charisma: 'CHA',
}

const VERTICES: Record<Ability, { left: string; top: string }> = {
  strength: { left: '50%', top: '12.68%' },
  dexterity: { left: '83.83%', top: '30.28%' },
  constitution: { left: '83.83%', top: '65.49%' },
  intelligence: { left: '50%', top: '83.1%' },
  wisdom: { left: '16.17%', top: '65.49%' },
  charisma: { left: '16.17%', top: '30.28%' },
}

const HINT = `a whole number from ${ABILITY_LIMITS.min} to ${ABILITY_LIMITS.max}`

const valid = (text: string): boolean => draftValid(text, ABILITY_LIMITS.min, ABILITY_LIMITS.max)

// What is being typed, kept until commit so a store change mid-edit doesn't
// overwrite it. A field without a draft shows the stored value.
const drafts = reactive<Partial<Record<Ability, string>>>({})

const shown = (ability: Ability): string | number => drafts[ability] ?? props.abilities[ability]

const invalid = (ability: Ability): boolean => {
  const draft = drafts[ability]
  return draft !== undefined && !valid(draft)
}

const signed = (modifier: number): string =>
  modifier > 0 ? `+${modifier}` : modifier < 0 ? `−${-modifier}` : '0'

const modifierOf = (ability: Ability): string => {
  const draft = drafts[ability]
  const score = draft !== undefined && valid(draft) ? Number(draft) : props.abilities[ability]
  return signed(abilityModifier(score))
}

const onInput = (ability: Ability, event: Event): void => {
  drafts[ability] = (event.target as HTMLInputElement).value
}

// No change fires when the value typed back matches the one at focus, so the
// draft is dropped on blur too: an unfocused field always shows the stored value.
const onBlur = (ability: Ability, event: Event): void => {
  if (drafts[ability] === undefined) return
  delete drafts[ability]
  ;(event.target as HTMLInputElement).value = String(props.abilities[ability])
}

// Commit on change, not input, so each correction is one undo step. The store
// clamps; the field is put back to what it kept, so a blank reads as before.
const onChange = (ability: Ability, event: Event): void => {
  const input = event.target as HTMLInputElement
  const value = draftCommit(input.value)
  delete drafts[ability]
  if (value !== null) emit('ability', ability, value)
  input.value = String(props.abilities[ability])
}

const uid = useId()
const modifierId = (ability: Ability): string => `${uid}-${ability}-modifier`
</script>

<template>
  <div class="stats" :class="{ editable }">
    <svg viewBox="0 0 256 284" aria-hidden="true">
      <polygon class="plate" points="128,36 214.60,86 214.60,186 128,236 41.40,186 41.40,86" />
      <polygon class="highlight" points="128,42 209.41,89 209.41,183 128,230 46.59,183 46.59,89" />
      <polygon class="well" points="128,74 181.69,105 181.69,167 128,198 74.31,167 74.31,105" />
    </svg>
    <component
      :is="editable ? 'label' : 'div'"
      v-for="ability in ABILITIES"
      :key="ability"
      class="stat"
      :class="{ invalid: invalid(ability) }"
      :style="VERTICES[ability]"
      :role="editable ? undefined : 'group'"
      :aria-label="
        editable ? undefined : `${ability} ${abilities[ability]}, modifier ${modifierOf(ability)}`
      "
    >
      <svg viewBox="-29.445 -34 58.89 68" aria-hidden="true">
        <polygon class="hex" points="0,-34 29.445,-17 29.445,17 0,34 -29.445,17 -29.445,-17" />
        <polygon class="rim" points="0,-30 25.98,-15 25.98,15 0,30 -25.98,15 -25.98,-15" />
        <polygon
          class="ring"
          points="0,-39 33.775,-19.5 33.775,19.5 0,39 -33.775,19.5 -33.775,-19.5"
        />
      </svg>
      <span class="contents" :aria-hidden="editable ? undefined : 'true'">
        <span class="short" aria-hidden="true">{{ SHORT[ability] }}</span>
        <input
          v-if="editable"
          class="score"
          type="number"
          :min="ABILITY_LIMITS.min"
          :max="ABILITY_LIMITS.max"
          step="1"
          inputmode="numeric"
          :value="shown(ability)"
          :aria-label="`${ability} score`"
          :aria-describedby="modifierId(ability)"
          :aria-invalid="invalid(ability) ? 'true' : undefined"
          :title="invalid(ability) ? HINT : undefined"
          @input="onInput(ability, $event)"
          @change="onChange(ability, $event)"
          @blur="onBlur(ability, $event)"
        />
        <span v-else class="score">{{ abilities[ability] }}</span>
      </span>
      <span :id="modifierId(ability)" class="mod" :aria-hidden="editable ? undefined : 'true'"
        ><span class="hidden">modifier </span>{{ modifierOf(ability) }}</span
      >
    </component>
  </div>
</template>

<style scoped>
.stats {
  --metal-light: var(--card-metal-light, #a5b2bf);
  --metal-mid: var(--card-metal-mid, #7e8c9c);
  --metal-dark: var(--card-metal-dark, #17293d);
  --plate: var(--card-plate, #1a314d);
  --window: var(--card-window, #0b1014);
  --hover: var(--card-motion-hover, 120ms ease-out);
  position: relative;
  width: min(100%, 16rem);
  min-width: 14rem;
  aspect-ratio: 256 / 284;
  margin-inline: auto;
  cursor: default;
}

svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.plate {
  fill: var(--plate);
  stroke: var(--metal-mid);
  stroke-width: 2;
}

.highlight {
  fill: none;
  stroke: var(--metal-light);
  stroke-opacity: 0.35;
  stroke-width: 1;
}

.well {
  fill: var(--window);
  fill-opacity: 0.55;
  stroke: var(--metal-dark);
  stroke-width: 1;
}

.stat {
  position: absolute;
  width: 23%;
  aspect-ratio: 58.89 / 68;
  translate: -50% -50%;
}

.stat svg {
  overflow: visible;
}

.hex {
  fill: var(--window);
  stroke: var(--metal-light);
  stroke-width: 1.5;
  transition: fill var(--hover);
}

.rim {
  fill: none;
  stroke: var(--metal-dark);
  stroke-width: 1;
}

.ring {
  fill: none;
  stroke: var(--ink);
  stroke-width: 2;
  visibility: hidden;
}

.editable .stat:hover .hex {
  fill: color-mix(in srgb, var(--plate) 45%, var(--window));
}

.stat:focus-within .ring {
  visibility: visible;
}

.stat.invalid .hex {
  stroke: var(--danger, #e07a6a);
  stroke-width: 2;
  stroke-dasharray: 4 3;
}

.contents {
  position: relative;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 2px;
  height: 100%;
  padding-bottom: 0.875rem;
  box-sizing: border-box;
}

.short {
  font-size: 0.625rem;
  line-height: 1;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--metal-light);
}

.score {
  font-size: 1.25rem;
  line-height: 1;
  font-weight: 600;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}

input.score {
  box-sizing: border-box;
  width: 75%;
  height: 1.75rem;
  margin: 0;
  padding: 0;
  border: none;
  outline: none;
  background: transparent;
  font-family: inherit;
  text-align: center;
  appearance: textfield;
}

input.score::-webkit-inner-spin-button,
input.score::-webkit-outer-spin-button {
  appearance: none;
  margin: 0;
}

.mod {
  position: absolute;
  left: 50%;
  top: 100%;
  translate: -50% -50%;
  width: 47.5%;
  aspect-ratio: 1;
  border-radius: 50%;
  display: grid;
  place-items: center;
  box-sizing: border-box;
  background: var(--plate);
  border: 1.5px solid var(--metal-light);
  box-shadow: 0 0 0 1px var(--metal-dark);
  font-size: 0.75rem;
  line-height: 1;
  font-weight: 600;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}

.hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
