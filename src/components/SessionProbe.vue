<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import type { SessionMessage } from '../session/messages'
import {
  hostRoom,
  joinRoom,
  type Session,
  type SessionHandlers,
  type SessionStatus,
} from '../session/peer'

// A dev probe for the data channel: two tabs, one hosts, one joins, ping across.
// The real host and join flow replaces this.

interface Remote {
  name: string | null
  rttMs: number | null
}

const name = ref('')
const codeInput = ref('')
const session = ref<Session | null>(null)
const status = ref<SessionStatus | null>(null)
const detail = ref<string | null>(null)
const remotes = ref<Record<string, Remote>>({})

const helloName = (): string =>
  name.value.trim() || (session.value?.role === 'host' ? 'host' : 'guest')

const onMessage = (message: SessionMessage, from: string): void => {
  const remote = remotes.value[from]
  if (!remote) return
  switch (message.type) {
    case 'hello':
      remote.name = message.name
      break
    case 'ping':
      session.value?.send({ type: 'pong', at: message.at }, from)
      break
    case 'pong':
      remote.rttMs = Math.round(performance.now() - message.at)
      break
  }
}

const handlers: SessionHandlers = {
  status: (next, why) => {
    status.value = next
    detail.value = why ?? null
  },
  message: onMessage,
  peer: (peerId, connected) => {
    if (!connected) {
      delete remotes.value[peerId]
      return
    }
    remotes.value[peerId] = { name: null, rttMs: null }
    session.value?.send({ type: 'hello', name: helloName() }, peerId)
  },
}

const start = async (open: () => Promise<Session>): Promise<void> => {
  session.value?.close()
  remotes.value = {}
  detail.value = null
  try {
    session.value = await open()
  } catch (error) {
    status.value = 'error'
    detail.value = error instanceof Error ? error.message : String(error)
  }
}

const host = (): Promise<void> => start(() => hostRoom(handlers))
const join = (): Promise<void> => start(() => joinRoom(codeInput.value, handlers))
const ping = (): void => session.value?.send({ type: 'ping', at: performance.now() })

const leave = (): void => {
  session.value?.close()
  session.value = null
  remotes.value = {}
}

onBeforeUnmount(() => session.value?.close())
</script>

<template>
  <div class="control stack probe">
    <div class="row">
      <span>live session (test)</span>
      <span class="value">{{ status ?? 'idle' }}</span>
    </div>

    <input v-model="name" type="text" placeholder="your name" maxlength="40" />

    <template v-if="!session">
      <button type="button" @click="host">host a room</button>
      <div class="row">
        <input v-model="codeInput" type="text" placeholder="room code" @keydown.enter="join" />
        <button type="button" :disabled="!codeInput.trim()" @click="join">join</button>
      </div>
    </template>

    <template v-else>
      <div class="row">
        <span>room</span>
        <code>{{ session.code }}</code>
      </div>
      <div v-for="(remote, peerId) in remotes" :key="peerId" class="row">
        <span>{{ remote.name ?? peerId }}</span>
        <span class="value">{{ remote.rttMs === null ? '—' : `${remote.rttMs} ms` }}</span>
      </div>
      <div class="row">
        <button type="button" :disabled="Object.keys(remotes).length === 0" @click="ping">
          ping
        </button>
        <button type="button" @click="leave">leave</button>
      </div>
    </template>

    <p v-if="detail" class="error" role="alert">{{ detail }}</p>
  </div>
</template>

<style scoped>
.probe {
  cursor: default;
}

input[type='text'] {
  min-width: 0;
  flex: 1;
  padding: 0.3rem 0.45rem;
  border: 1px solid var(--line);
  border-radius: 0.35rem;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  cursor: text;
}

button {
  padding: 0.35rem 0.6rem;
  border: 1px solid var(--line);
  border-radius: 0.35rem;
  background: var(--surface);
  color: var(--ink-dim);
  font: inherit;
  cursor: pointer;
}

.row button {
  flex: 1;
}

button:hover:not(:disabled) {
  border-color: #7aa2c8;
}

button:disabled {
  opacity: 0.5;
  cursor: default;
}

code {
  color: var(--ink);
  user-select: all;
}

.error {
  margin: 0;
  color: #e07a6a;
}
</style>
