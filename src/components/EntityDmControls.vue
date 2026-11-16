<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { Entity } from '../entities/entity'
import { useHexMapStore } from '../stores/hexMap'
import PopupDialog from './PopupDialog.vue'

const props = defineProps<{ entity: Entity }>()

const store = useHexMapStore()

const confirming = ref(false)
const select = ref<HTMLSelectElement>()
const keep = ref<HTMLButtonElement>()

const player = ref('')

const ownerHint = computed((): string | null => {
  const { owner, hidden, hostile } = props.entity
  if (owner !== 'dm') return null
  if (hidden && hostile) return 'handing it to the players shows it on their map and clears hostile'
  if (hidden) return 'handing it to the players also shows it on their map'
  if (hostile) return 'handing it to the players also clears hostile'
  return null
})

const onOwner = (event: Event): void => {
  const el = event.target as HTMLSelectElement
  const owner = el.value === 'dm' ? 'dm' : 'player'
  const seated = store.playerOf(props.entity.id)
  if (owner === 'dm' && seated !== null) {
    player.value = seated
    el.value = props.entity.owner
    confirming.value = true
    void nextTick(() => keep.value?.focus())
    return
  }
  store.setEntityOwner(props.entity.id, owner)
}

watch(confirming, (open) => {
  if (!open) void nextTick(() => select.value?.focus())
})

const cancel = (): void => {
  confirming.value = false
}

const takeIt = (): void => {
  store.setEntityOwner(props.entity.id, 'dm')
  cancel()
}

const onHidden = (event: Event): void =>
  store.setEntityHidden(props.entity.id, (event.target as HTMLInputElement).checked)

const onHostile = (event: Event): void =>
  store.setEntityHostile(props.entity.id, (event.target as HTMLInputElement).checked)
</script>

<template>
  <div class="dm-controls">
    <label class="row">
      <span>owner</span>
      <select
        ref="select"
        :value="entity.owner"
        aria-label="who the entity belongs to"
        :aria-describedby="ownerHint ? `dm-${entity.id}-owner-hint` : undefined"
        @change="onOwner"
      >
        <option value="player">player</option>
        <option value="dm">dm</option>
      </select>
    </label>
    <p v-if="ownerHint" :id="`dm-${entity.id}-owner-hint`" class="hint">
      {{ ownerHint }}
    </p>

    <label class="row" :class="{ off: entity.owner === 'player' }">
      <span>hidden</span>
      <input
        type="checkbox"
        :checked="entity.hidden"
        :disabled="entity.owner === 'player'"
        aria-label="kept off the players' map"
        :aria-describedby="entity.owner === 'player' ? `dm-${entity.id}-hidden-hint` : undefined"
        @change="onHidden"
      />
    </label>
    <p v-if="entity.owner === 'player'" :id="`dm-${entity.id}-hidden-hint`" class="hint">
      players' entities are always on the map
    </p>

    <label class="row" :class="{ off: entity.owner === 'player' }">
      <span>hostile</span>
      <input
        type="checkbox"
        :checked="entity.hostile"
        :disabled="entity.owner === 'player'"
        aria-label="hostile to the players"
        :aria-describedby="`dm-${entity.id}-hostile-hint`"
        @change="onHostile"
      />
    </label>
    <p :id="`dm-${entity.id}-hostile-hint`" class="hint">
      {{
        entity.owner === 'player'
          ? "players' entities are never hostile"
          : 'players see it as a foe'
      }}
    </p>

    <PopupDialog v-model="confirming" :title="`take ${entity.name} from ${player}?`">
      <p class="body">
        {{ player }} plays {{ entity.name }} now. making it a dm entity takes it off their seat, and
        undo can't bring it back.
      </p>
      <div class="actions">
        <button ref="keep" type="button" @click="cancel">keep it with {{ player }}</button>
        <button type="button" class="danger" @click="takeIt">take it</button>
      </div>
    </PopupDialog>
  </div>
</template>

<style scoped>
.dm-controls {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-top: 0.2rem;
  padding-top: 0.6rem;
  border-top: 1px solid var(--line);
  font-size: 0.78rem;
}

.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  min-height: var(--control-h);
  cursor: pointer;
}

.row span {
  color: var(--ink-dim);
}

.row.off {
  cursor: default;
}

select {
  flex: 0 1 8rem;
  min-width: 0;
  padding: 0.3rem;
  border: 1px solid var(--line);
  border-radius: 0.35rem;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
}

select:hover {
  border-color: var(--accent);
}

input[type='checkbox'] {
  margin: 0;
  accent-color: var(--accent);
  cursor: pointer;
}

input[type='checkbox']:disabled {
  cursor: not-allowed;
}

select:focus-visible,
input:focus-visible,
button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.hint {
  margin: -0.2rem 0 0;
  color: var(--ink-dim);
  font-size: 0.75rem;
  line-height: 1.3;
}

.body {
  margin: 0 0 0.8rem;
}

.actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}

.actions button {
  padding: 0.35rem 0.7rem;
  border: 1px solid var(--line);
  border-radius: 0.35rem;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  cursor: pointer;
}

.actions .danger {
  border-color: var(--danger);
  color: var(--danger);
}

.actions .danger:hover {
  background: color-mix(in srgb, var(--danger) 12%, transparent);
}
</style>
