<script setup lang="ts">
import { reactive, useId } from 'vue'
import {
  ABILITIES,
  ABILITY_LIMITS,
  abilityModifier,
  type Abilities,
  type Ability,
} from '../entities/abilities'
import { CHARACTER_LEVELS, PURSE_LIMITS, type Character } from '../entities/character'

const props = defineProps<{
  abilities: Abilities
  character: Character
  editable: boolean
}>()

const emit = defineEmits<{
  ability: [ability: Ability, value: number]
  purse: [value: number]
  level: [value: number]
}>()

type Field = Ability | keyof Character
type Limits = { readonly min: number; readonly max: number }

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

const TALLY = [
  { field: 'level', word: 'level', label: 'level' },
  { field: 'purse', word: 'gold', label: 'gold, in coins' },
] as const

const limitsOf = (field: Field): Limits =>
  field === 'purse' ? PURSE_LIMITS : field === 'level' ? CHARACTER_LEVELS : ABILITY_LIMITS

const hint = (field: Field): string => {
  const { min, max } = limitsOf(field)
  return `a whole number from ${min} to ${max}`
}

const stored = (field: Field): number =>
  field === 'purse' || field === 'level' ? props.character[field] : props.abilities[field]

// What is being typed, kept until commit so a store change mid-edit doesn't
// overwrite it. A field without a draft shows the stored value.
const drafts = reactive<Partial<Record<Field, string>>>({})

const shown = (field: Field): string | number => drafts[field] ?? stored(field)

const isValid = (text: string, { min, max }: Limits): boolean => {
  if (text.trim() === '') return false
  const value = Number(text)
  return Number.isInteger(value) && value >= min && value <= max
}

const invalid = (field: Field): boolean => {
  const draft = drafts[field]
  return draft !== undefined && !isValid(draft, limitsOf(field))
}

const signed = (modifier: number): string =>
  modifier > 0 ? `+${modifier}` : modifier < 0 ? `−${-modifier}` : '0'

const modifierOf = (ability: Ability): string => {
  const draft = drafts[ability]
  const score =
    draft !== undefined && isValid(draft, ABILITY_LIMITS) ? Number(draft) : stored(ability)
  return signed(abilityModifier(score))
}

const onInput = (field: Field, event: Event): void => {
  drafts[field] = (event.target as HTMLInputElement).value
}

// No change fires when the value typed back matches the one at focus, so the
// draft is dropped on blur too: an unfocused field always shows the stored value.
const onBlur = (field: Field, event: Event): void => {
  if (drafts[field] === undefined) return
  delete drafts[field]
  ;(event.target as HTMLInputElement).value = String(stored(field))
}

// Commit on change, not input, so each correction is one undo step. The store
// clamps; the field is put back to what it kept, so a blank reads as before.
const onChange = (field: Field, event: Event): void => {
  const input = event.target as HTMLInputElement
  const value = input.value.trim() === '' ? NaN : Number(input.value)
  delete drafts[field]
  if (Number.isFinite(value)) {
    const whole = Math.round(value)
    if (field === 'purse') emit('purse', whole)
    else if (field === 'level') emit('level', whole)
    else emit('ability', field, whole)
  }
  input.value = String(stored(field))
}

const uid = useId()
const modifierId = (ability: Ability): string => `${uid}-${ability}-modifier`
</script>

<template>
  <div class="stats" :class="{ editable }">
    <div class="tally">
      <template v-for="{ field, word, label } in TALLY" :key="field">
        <label v-if="editable" class="cell" :class="[field, { invalid: invalid(field) }]">
          <span class="word">{{ word }}</span>
          <input
            class="value"
            type="number"
            :min="limitsOf(field).min"
            :max="limitsOf(field).max"
            step="1"
            inputmode="numeric"
            :value="shown(field)"
            :aria-label="label"
            :aria-invalid="invalid(field) ? 'true' : undefined"
            :title="invalid(field) ? hint(field) : undefined"
            @input="onInput(field, $event)"
            @change="onChange(field, $event)"
            @blur="onBlur(field, $event)"
          />
        </label>
        <span v-else class="cell" :class="field">
          <span class="word">{{ word }}</span> <span class="value">{{ stored(field) }}</span>
        </span>
      </template>
    </div>

    <div class="hexagon">
      <svg viewBox="0 0 256 284" aria-hidden="true">
        <polygon class="outer" points="128,36 214.6,86 214.6,186 128,236 41.4,186 41.4,86" />
        <polygon class="rim" points="128,48 204.21,92 204.21,180 128,224 51.79,180 51.79,92" />
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
          editable ? undefined : `${ability} ${stored(ability)}, modifier ${modifierOf(ability)}`
        "
      >
        <svg viewBox="-29.445 -34 58.89 68" aria-hidden="true">
          <polygon class="hex" points="0,-34 29.445,-17 29.445,17 0,34 -29.445,17 -29.445,-17" />
          <polygon class="cell-rim" points="0,-30 25.98,-15 25.98,15 0,30 -25.98,15 -25.98,-15" />
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
            :title="invalid(ability) ? hint(ability) : undefined"
            @input="onInput(ability, $event)"
            @change="onChange(ability, $event)"
            @blur="onBlur(ability, $event)"
          />
          <span v-else class="score">{{ stored(ability) }}</span>
        </span>
        <span :id="modifierId(ability)" class="mod" :aria-hidden="editable ? undefined : 'true'"
          ><span class="hidden">modifier </span>{{ modifierOf(ability) }}</span
        >
      </component>
    </div>
  </div>
</template>

<style scoped>
.stats {
  --metal-light: var(--card-metal-light, #a9c0d8);
  --metal-mid: var(--card-metal-mid, #5b7898);
  --metal-dark: var(--card-metal-dark, #24344a);
  --window: var(--card-window, #0b1119);
  --field-h: var(--card-field-h, 1.75rem);
  --hover: var(--card-motion-hover, 120ms ease-out);
  display: grid;
  justify-items: center;
  width: 100%;
  min-width: 14rem;
  cursor: default;
}

.tally {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1.5rem;
  height: var(--field-h);
  margin-bottom: 0.75rem;
}

.cell {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
}

.word {
  font-size: 0.75rem;
  line-height: 1;
  color: var(--metal-light);
}

.value {
  font-size: 1rem;
  line-height: 1;
  font-weight: 600;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}

input {
  margin: 0;
  padding: 0;
  border: none;
  outline: none;
  background: transparent;
  font: inherit;
  appearance: textfield;
  -moz-appearance: textfield;
}

input::-webkit-inner-spin-button,
input::-webkit-outer-spin-button {
  appearance: none;
  margin: 0;
}

input.value {
  box-sizing: border-box;
  height: var(--field-h);
  padding: 0 0.375rem;
  text-align: center;
  color: var(--ink);
  background: var(--window);
  border: 1px solid var(--metal-light);
  border-radius: var(--radius-control, 6px);
  transition: background-color var(--hover);
}

.level input.value {
  width: 2.5rem;
}

.purse input.value {
  width: 4.5rem;
}

.editable input.value:hover {
  background: color-mix(in srgb, var(--metal-dark) 45%, var(--window));
}

input.value:focus {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
}

.cell.invalid input.value {
  border: 1px dashed var(--danger);
}

.hexagon {
  position: relative;
  width: 100%;
  max-width: 16rem;
  aspect-ratio: 256 / 284;
}

svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.outer {
  fill: var(--window);
  fill-opacity: 0.35;
  stroke: var(--metal-mid);
  stroke-width: 2;
}

.rim {
  fill: none;
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

.cell-rim {
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
  fill: color-mix(in srgb, var(--metal-dark) 45%, var(--window));
}

.stat:focus-within .ring {
  visibility: visible;
}

.stat.invalid .hex {
  stroke: var(--danger);
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
  text-align: center;
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
  background: var(--metal-dark);
  border: 1.5px solid var(--metal-light);
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
