<script setup lang="ts">
import { computed, ref } from 'vue'
import { QUANTITY_LIMITS, totalWeight, type Item } from '../entities/inventory'
import { useHexMapStore } from '../stores/hexMap'
import PopupDialog from './PopupDialog.vue'

const props = defineProps<{ ownerId: string }>()

const store = useHexMapStore()

const owner = computed(() => store.entities.find((one) => one.id === props.ownerId) ?? null)
const items = computed(() => store.itemsOf(props.ownerId))

const carried = computed(() => {
  const weighed = items.value.map(totalWeight).filter((one): one is number => one !== null)
  return weighed.length ? Math.round(weighed.reduce((sum, one) => sum + one, 0) * 100) / 100 : null
})

// Asked of the same rules the store holds to, so a player is offered only the
// edits and hand-overs it would carry out: never one to a carrier they cannot see.
const editable = computed(() => owner.value !== null && store.may('editInventory', owner.value))

const partners = computed(() => {
  const from = owner.value
  return from
    ? store.inventoryPartners(props.ownerId).filter((to) => store.may('transferItem', { from, to }))
    : []
})

const open = ref(false)
/** The line being edited, or null while a new one is being written. */
const editingId = ref<string | null>(null)
const editing = computed(() => items.value.find((one) => one.id === editingId.value) ?? null)

const name = ref('')
const quantity = ref(1)
// A number field hands back '' when cleared, which is an unweighed item.
const weight = ref<number | ''>('')
const notes = ref('')

const moveTo = ref('')
const moveCount = ref(1)

const canSave = computed(() => name.value.trim() !== '')

const startAdding = (): void => {
  editingId.value = null
  name.value = ''
  quantity.value = 1
  weight.value = ''
  notes.value = ''
  open.value = true
}

const startEditing = (item: Item): void => {
  editingId.value = item.id
  name.value = item.name
  quantity.value = item.quantity
  weight.value = item.weight ?? ''
  notes.value = item.notes
  moveTo.value = partners.value[0]?.id ?? ''
  moveCount.value = item.quantity
  open.value = true
}

const save = (): void => {
  if (!canSave.value) return
  const fields = {
    name: name.value,
    quantity: quantity.value,
    notes: notes.value,
    weight: weight.value === '' ? null : weight.value,
  }
  if (editing.value) store.editItem(editing.value.id, fields)
  else store.addItem(props.ownerId, fields)
  open.value = false
}

const move = (): void => {
  if (!editing.value || !moveTo.value) return
  store.transferItem(editing.value.id, moveTo.value, moveCount.value)
  open.value = false
}

const title = computed(() =>
  editing.value ? `edit ${editing.value.name}` : `new item · ${owner.value?.name ?? ''}`,
)
</script>

<template>
  <section class="inventory" aria-label="inventory">
    <div class="row">
      <span class="label">inventory</span>
      <span class="value">
        {{ items.length }}
        <span v-if="carried !== null" class="label">· {{ carried }} wt</span>
      </span>
    </div>

    <ul v-if="items.length" class="list" :class="{ fixed: !editable }">
      <li v-for="item in items" :key="item.id">
        <span v-if="!editable" class="item" :title="item.notes || undefined">
          <span class="name">{{ item.name }}</span>
          <span class="value">×{{ item.quantity }}</span>
          <span class="label">{{ item.weight === null ? '' : `${totalWeight(item)} wt` }}</span>
        </span>
        <button
          v-else
          type="button"
          class="item"
          :title="item.notes || `edit ${item.name}`"
          @click="startEditing(item)"
        >
          <span class="name">{{ item.name }}</span>
          <span class="value">×{{ item.quantity }}</span>
          <span class="label">{{ item.weight === null ? '' : `${totalWeight(item)} wt` }}</span>
        </button>
        <button
          v-if="editable"
          type="button"
          class="drop"
          :aria-label="`remove ${item.name}`"
          title="remove"
          @click="store.removeItem(item.id)"
        >
          ×
        </button>
      </li>
    </ul>
    <p v-else class="label">carrying nothing</p>

    <button v-if="editable" type="button" class="open" @click="startAdding">add item</button>

    <PopupDialog v-model="open" :title="title">
      <form class="form" @submit.prevent="save">
        <input v-model="name" type="text" placeholder="name" aria-label="name" required />
        <div class="pair">
          <label>
            <span class="label">quantity</span>
            <input
              v-model.number="quantity"
              type="number"
              :min="QUANTITY_LIMITS.min"
              :max="QUANTITY_LIMITS.max"
              step="1"
            />
          </label>
          <label>
            <span class="label">weight each</span>
            <input v-model.number="weight" type="number" min="0" step="any" placeholder="—" />
          </label>
        </div>
        <textarea v-model="notes" rows="3" placeholder="notes" aria-label="notes" />
        <button type="submit" :disabled="!canSave">{{ editing ? 'save' : 'add item' }}</button>
      </form>

      <form v-if="editing && partners.length" class="form move" @submit.prevent="move">
        <span class="label">hand over</span>
        <div class="pair">
          <input
            v-model.number="moveCount"
            type="number"
            :min="QUANTITY_LIMITS.min"
            :max="editing.quantity"
            step="1"
            aria-label="how many to hand over"
          />
          <select v-model="moveTo" aria-label="hand over to">
            <option v-for="one in partners" :key="one.id" :value="one.id">{{ one.name }}</option>
          </select>
        </div>
        <button type="submit" :disabled="!moveTo">move</button>
      </form>
    </PopupDialog>
  </section>
</template>

<style scoped>
.inventory {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  margin-top: 0.75rem;
  padding-top: 0.6rem;
  border-top: 1px solid var(--line);
  font-size: 0.78rem;
}

.row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}

.label {
  color: var(--ink-dim);
}

.value {
  font-variant-numeric: tabular-nums;
}

p {
  margin: 0;
}

.list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.list li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 1.4rem;
  align-items: center;
  gap: 0.2rem;
}

.item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: baseline;
  gap: 0.4rem;
  padding: 0.1rem 0.25rem;
  border: none;
  border-radius: 0.2rem;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.list.fixed li {
  grid-template-columns: minmax(0, 1fr);
}

.list.fixed .item {
  cursor: default;
}

button.item:hover {
  background: color-mix(in srgb, var(--line) 45%, transparent);
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drop {
  padding: 0;
  border: none;
  background: none;
  color: var(--ink-dim);
  font: inherit;
  line-height: 1.2;
  cursor: pointer;
}

.drop:hover {
  color: var(--ink);
}

.form {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.78rem;
}

.move {
  margin-top: 0.75rem;
  padding-top: 0.6rem;
  border-top: 1px solid var(--line);
}

.pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.35rem;
}

.pair label {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

input,
textarea,
select {
  box-sizing: border-box;
  width: 100%;
  padding: 0.3rem 0.45rem;
  border: 1px solid var(--line);
  border-radius: 0.35rem;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  font-size: 0.78rem;
}

textarea {
  resize: vertical;
}

input:focus,
textarea:focus,
select:focus {
  border-color: #7aa2c8;
  outline: none;
}

.open,
.form button {
  width: 100%;
  padding: 0.35rem 0.6rem;
  border: 1px solid var(--line);
  border-radius: 0.35rem;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  font-size: 0.78rem;
  cursor: pointer;
}

.open {
  margin-top: 0.3rem;
}

.open:hover,
.form button:hover:not(:disabled) {
  border-color: #7aa2c8;
}

.form button:disabled {
  color: var(--ink-dim);
  cursor: default;
}
</style>
