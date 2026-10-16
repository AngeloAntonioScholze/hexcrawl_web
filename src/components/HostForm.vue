<script setup lang="ts">
import { computed, ref } from 'vue'
import { MAX_NAME_LENGTH } from '../session/messages'
import { useMapLibraryStore } from '../stores/mapLibrary'
import { codeSuffix, lastRoom, roomLink, useSessionStore } from '../stores/session'

// The enter screen (05c.12) shows this after the camera pans to the host mark.
defineProps<{ name: string }>()

const emit = defineEmits<{
  back: []
  /** The room is open; the enter screen steps aside. */
  started: []
  'update:name': [name: string]
}>()

const NEW_MAP = ''

const session = useSessionStore()
const library = useMapLibraryStore()

const chosenMap = ref(library.currentId ?? NEW_MAP)
// Read once: hosting writes a fresh one, and by then the room is open anyway.
const reopenable = lastRoom()

const connecting = computed(() => session.status === 'connecting')
const open = computed(() => session.role === 'host' && session.status === 'open' && !!session.code)
const link = computed(() =>
  session.code ? roomLink(location.origin, import.meta.env.BASE_URL, session.code) : '',
)

const copied = ref<'yes' | 'no' | null>(null)

const start = async (name: string, code?: string): Promise<void> => {
  if (library.maps.length > 0) {
    if (chosenMap.value === NEW_MAP) await library.create()
    else await library.open(chosenMap.value)
  }
  copied.value = null
  await session.host(name, { code })
}

const copyLink = async (): Promise<void> => {
  try {
    await navigator.clipboard.writeText(link.value)
    copied.value = 'yes'
  } catch {
    copied.value = 'no'
  }
}

const back = (): void => {
  if (session.role === 'host') session.leave()
  emit('back')
}
</script>

<template>
  <form class="host-form" @submit.prevent="start(name)">
    <template v-if="!open">
      <label>
        <span>your name</span>
        <input
          type="text"
          :value="name"
          :maxlength="MAX_NAME_LENGTH"
          placeholder="DM"
          autocomplete="nickname"
          :disabled="connecting"
          @input="emit('update:name', ($event.target as HTMLInputElement).value)"
        />
      </label>

      <label v-if="library.maps.length > 0">
        <span>map</span>
        <select v-model="chosenMap" :disabled="connecting || library.busy">
          <option v-for="map in library.maps" :key="map.id" :value="map.id">{{ map.name }}</option>
          <option :value="NEW_MAP">new map</option>
        </select>
      </label>

      <button type="submit" class="primary" :disabled="connecting || library.busy">
        {{ connecting ? 'opening the room…' : 'start session' }}
      </button>
      <button
        v-if="reopenable"
        type="button"
        :disabled="connecting || library.busy"
        @click="start(name, reopenable.code)"
      >
        reopen room <code>{{ codeSuffix(reopenable.code) }}</code>
      </button>

      <p v-if="session.role === 'host' && session.error" class="error" role="alert">
        {{ session.error }}
      </p>
    </template>

    <template v-else>
      <p class="label">room code</p>
      <p class="code">
        <code>{{ codeSuffix(session.code ?? '') }}</code>
      </p>
      <button type="button" @click="copyLink">copy link</button>
      <p v-if="copied === 'yes'" class="note" role="status">link copied</p>
      <p v-else-if="copied === 'no'" class="note" role="status">
        copy this link by hand: <span class="link">{{ link }}</span>
      </p>
      <button type="button" class="primary" @click="emit('started')">enter the map</button>
    </template>

    <button type="button" class="back" :disabled="connecting" @click="back">
      {{ open ? 'close the room' : 'back' }}
    </button>
  </form>
</template>

<style scoped>
.host-form {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  width: 100%;
  max-width: 26rem;
  font-size: 0.85rem;
}

label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

label span,
.label {
  margin: 0;
  color: var(--ink-dim);
  font-size: 0.78rem;
}

input,
select {
  min-width: 0;
  padding: 0.4rem 0.5rem;
  border: 1px solid var(--line);
  border-radius: 0.35rem;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
}

button {
  padding: 0.45rem 0.7rem;
  border: 1px solid var(--line);
  border-radius: 0.35rem;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  cursor: pointer;
}

button:hover:not(:disabled) {
  border-color: #7aa2c8;
}

button:disabled {
  opacity: 0.5;
  cursor: default;
}

.primary {
  border-color: #7aa2c8;
  background: color-mix(in srgb, #7aa2c8 22%, var(--surface));
}

.back {
  border: none;
  background: none;
  color: var(--ink-dim);
}

.code {
  margin: 0;
  text-align: center;
}

.code code {
  color: var(--ink);
  font-size: 1.6rem;
  letter-spacing: 0.18em;
  user-select: all;
}

.note {
  margin: 0;
  color: var(--ink-dim);
  font-size: 0.78rem;
}

.link {
  color: var(--ink);
  overflow-wrap: anywhere;
  user-select: all;
}

.error {
  margin: 0;
  color: #e07a6a;
}
</style>
