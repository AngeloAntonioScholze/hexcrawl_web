<script setup lang="ts">
import { computed } from 'vue'
import { MAX_NAME_LENGTH } from '../session/messages'
import { normaliseRoomCode } from '../session/roomCode'
import { useSessionStore } from '../stores/session'

// The enter screen (05c.12) shows this after the camera pans to the join mark,
// or straight away for a ?room= link.
const props = defineProps<{ name: string; code: string }>()

const emit = defineEmits<{
  back: []
  /** Admitted with the DM's map in hand; the enter screen steps aside. Not sent until the player client (05c.9) can show that map. */
  joined: []
  'update:name': [name: string]
  'update:code': [code: string]
}>()

const session = useSessionStore()

const asGuest = computed(() => session.role === 'guest')
// Until the host answers the hello, being connected is still only connecting.
const connecting = computed(
  () =>
    asGuest.value &&
    (session.status === 'connecting' ||
      (session.status === 'open' && session.admission === 'asking')),
)
const waiting = computed(() => asGuest.value && session.admission === 'pending')
const admitted = computed(() => asGuest.value && session.admission === 'admitted')
const reconnecting = computed(() => asGuest.value && session.reconnecting)
const connected = computed(() => waiting.value || admitted.value || reconnecting.value)
const codeValid = computed(() => normaliseRoomCode(props.code) !== null)
const ready = computed(() => props.name.trim() !== '' && codeValid.value)

const join = (): void => {
  if (ready.value && !connecting.value) void session.join(props.name, props.code)
}

const back = (): void => {
  if (asGuest.value) session.leave()
  emit('back')
}

const typed = (event: Event): string => (event.target as HTMLInputElement).value
</script>

<template>
  <form class="join-form" @submit.prevent="join">
    <label>
      <span>your name</span>
      <input
        type="text"
        :value="name"
        :maxlength="MAX_NAME_LENGTH"
        autocomplete="nickname"
        :disabled="connecting || connected"
        @input="emit('update:name', typed($event))"
      />
    </label>

    <label>
      <span>room code</span>
      <input
        type="text"
        :value="code"
        maxlength="24"
        placeholder="e.g. k7mq2x"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        :disabled="connecting || connected"
        @input="emit('update:code', typed($event))"
      />
    </label>
    <p v-if="code.trim() && !codeValid" class="note">a room code is six letters and digits</p>

    <p v-if="reconnecting" class="note" role="status">the DM left — reconnecting…</p>
    <p v-else-if="waiting" class="note" role="status">waiting for the DM to let you in</p>
    <p v-else-if="admitted" class="note" role="status">connected — waiting for the DM's map</p>
    <template v-else>
      <button type="submit" class="primary" :disabled="!ready || connecting">
        {{ connecting ? 'connecting…' : 'join' }}
      </button>
      <p v-if="asGuest && session.error" class="error" role="alert">{{ session.error }}</p>
    </template>

    <button type="button" class="back" @click="back">{{ connected ? 'leave' : 'back' }}</button>
  </form>
</template>

<style scoped>
.join-form {
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

label span {
  color: var(--ink-dim);
  font-size: 0.78rem;
}

input {
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

.note {
  margin: 0;
  color: var(--ink-dim);
  font-size: 0.78rem;
}

.error {
  margin: 0;
  color: #e07a6a;
}
</style>
