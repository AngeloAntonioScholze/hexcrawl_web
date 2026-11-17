<script setup lang="ts">
import { computed } from 'vue'
import { orderOf, usePlayerView } from '../composables/usePlayerView'
import type { Abilities, Ability } from '../entities/abilities'
import { CHARACTER_LEVELS, PURSE_LIMITS, type Character } from '../entities/character'
import type { Entity } from '../entities/entity'
import { SUPPLY_LIMITS } from '../entities/supplies'
import { useHexMapStore } from '../stores/hexMap'
import CaravanCardBody from './CaravanCardBody.vue'
import { hexes, plateLines } from './cardMount'
import CardTally from './CardTally.vue'
import CharacterCard from './CharacterCard.vue'
import ShipCardBody from './ShipCardBody.vue'
import StatHexagon from './StatHexagon.vue'

// The mount behind CharacterCard: fills its slots, plate and body from the
// DM's store, or from the players' projection in the player view.
const props = withDefaults(defineProps<{ entity: Entity; headingLevel?: 2 | 3 | 4 }>(), {
  headingLevel: 3,
})

const store = useHexMapStore()
const player = usePlayerView()
const forPlayers = computed(() => !store.dmView)
const id = computed(() => props.entity.id)

const pickable = computed(() => !forPlayers.value && store.may('entitySettings', props.entity))

const plate = computed(() => {
  if (forPlayers.value) {
    const scene = player.scene.value
    const carrier = player.carrierOf(id.value)
    return plateLines({
      dmView: false,
      owner: props.entity.owner,
      player: null,
      riding: carrier ? (scene.entityOf.get(carrier)?.name ?? null) : null,
      ahead: orderOf(scene, id.value).length,
    })
  }
  const carrier = store.carrierOf(id.value)
  return plateLines({
    dmView: true,
    owner: props.entity.owner,
    player: store.playerOf(id.value),
    riding: carrier ? (store.entities.find((one) => one.id === carrier)?.name ?? null) : null,
    ahead: orderOf(
      {
        queue: store.queue,
        states: store.states,
        entityOf: new Map(store.entities.map((one) => [one.id, one])),
      },
      id.value,
    ).length,
  })
})

interface Tally {
  props: InstanceType<typeof CardTally>['$props']
  commit?: (value: number) => void
}

const shown = (word: string, value: number, groupLabel: string, decimal = false): Tally => ({
  props: {
    word,
    value,
    editable: false,
    min: 0,
    max: value,
    step: 1,
    label: word,
    invalidTitle: '',
    format: decimal ? 'decimal' : 'int',
    groupLabel,
  },
})

const pace = computed(() =>
  shown('pace', props.entity.pacePerTurn, `pace ${hexes(props.entity.pacePerTurn)} a turn`, true),
)
const sight = computed(() =>
  shown('sight', props.entity.sight, `sight ${hexes(props.entity.sight)}`),
)

const character = computed<Character | null>(() =>
  forPlayers.value
    ? (player.projection.value.characters.find((one) => one.entityId === id.value) ?? null)
    : store.characterOf(id.value),
)

const abilities = computed<Abilities | null>(() =>
  forPlayers.value
    ? (player.projection.value.abilities.find((one) => one.entityId === id.value) ?? null)
    : store.abilitiesOf(id.value),
)

const caravanGold = computed(
  () => (forPlayers.value ? player.suppliesOf(id.value) : store.suppliesOf(id.value)).gold,
)

const tallies = computed<readonly (Tally | null)[]>(() => {
  const kind = props.entity.kind
  if (kind === 'caravan') {
    const gold = caravanGold.value
    return [
      {
        props: {
          word: 'gp',
          value: gold,
          editable: store.may('supplies'),
          min: 0,
          max: SUPPLY_LIMITS.gold.max,
          step: 1,
          label: 'caravan gold, in coins',
          invalidTitle: `a whole number from 0 to ${SUPPLY_LIMITS.gold.max}`,
          groupLabel: `gold ${gold}`,
        },
        commit: (value) => store.setSupply(id.value, 'gold', value),
      },
      pace.value,
      sight.value,
    ]
  }
  if (kind === 'ship') return [pace.value, sight.value, null]
  const sheet = character.value
  if (!sheet) return [null, null, sight.value]
  const editable = store.may('editCharacter', props.entity)
  return [
    {
      props: {
        word: 'lv',
        value: sheet.level,
        editable,
        min: CHARACTER_LEVELS.min,
        max: CHARACTER_LEVELS.max,
        step: 1,
        label: 'level',
        invalidTitle: `a whole number from ${CHARACTER_LEVELS.min} to ${CHARACTER_LEVELS.max}`,
      },
      commit: (value) => store.setLevel(id.value, value),
    },
    {
      props: {
        word: 'gp',
        value: sheet.purse,
        editable,
        min: PURSE_LIMITS.min,
        max: PURSE_LIMITS.max,
        step: 1,
        label: 'gold, in coins',
        invalidTitle: `a whole number from ${PURSE_LIMITS.min} to ${PURSE_LIMITS.max}`,
        format: 'compact',
        groupLabel: `gold ${sheet.purse}`,
      },
      commit: (value) => store.setPurse(id.value, value),
    },
    sight.value,
  ]
})

const merchants = computed(() =>
  forPlayers.value ? player.merchantsOf(id.value) : store.merchantsOf(id.value),
)
const riders = computed(() =>
  forPlayers.value ? player.ridersOf(id.value) : store.ridersOf(id.value),
)

const setAbility = (ability: Ability, value: number): void =>
  store.setAbility(id.value, ability, value)
</script>

<template>
  <CharacterCard
    :entity="entity"
    :pickable="pickable"
    :heading-level="headingLevel"
    :plate="plate"
    @bust="store.setPortrait(entity.id, $event)"
  >
    <template v-if="tallies[0]" #slot1>
      <CardTally v-bind="tallies[0].props" @commit="tallies[0].commit?.($event)" />
    </template>
    <template v-if="tallies[1]" #slot2>
      <CardTally v-bind="tallies[1].props" @commit="tallies[1].commit?.($event)" />
    </template>
    <template v-if="tallies[2]" #slot3>
      <CardTally v-bind="tallies[2].props" @commit="tallies[2].commit?.($event)" />
    </template>

    <StatHexagon
      v-if="abilities"
      :abilities="abilities"
      :editable="store.may('abilities', entity)"
      @ability="setAbility"
    />
    <CaravanCardBody v-else-if="entity.kind === 'caravan'" :merchants="merchants" />
    <ShipCardBody v-else-if="entity.kind === 'ship'" :riders="riders" />
  </CharacterCard>
</template>
