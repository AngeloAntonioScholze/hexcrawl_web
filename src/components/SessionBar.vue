<script setup lang="ts">
import { computed, ref } from 'vue'
import { useStage } from '../composables/useStage'
import { codeSuffix, roomLink, useSessionStore } from '../stores/session'
import PopupDialog from './PopupDialog.vue'

const session = useSessionStore()
const stage = useStage()

const hosting = computed(() => session.role === 'host')
const link = computed(() =>
  session.code ? roomLink(location.origin, import.meta.env.BASE_URL, session.code) : '',
)

const copied = ref<'yes' | 'no' | null>(null)

const copyLink = async (): Promise<void> => {
  try {
    await navigator.clipboard.writeText(link.value)
    copied.value = 'yes'
  } catch {
    copied.value = 'no'
  }
}

/** The player the DM is being asked to confirm removing. */
const removing = ref<string | null>(null)
const confirming = computed({
  get: () => removing.value !== null,
  set: (open) => {
    if (!open) removing.value = null
  },
})

const remove = (): void => {
  if (removing.value !== null) session.kick(removing.value)
  removing.value = null
}

const checked = (event: Event): boolean => (event.target as HTMLInputElement).checked

const leave = async (): Promise<void> => {
  session.leave()
  stage.veiled.value = true
  await stage.zoomOut()
}
</script>

<template>
  <section class="session-bar" aria-label="session">
    <div class="row">
      <span class="room">
        room <code>{{ codeSuffix(session.code ?? '') }}</code>
      </span>
      <button type="button" @click="copyLink">copy link</button>
      <button type="button" class="leave" @click="leave">
        {{ hosting ? 'end session' : 'leave' }}
      </button>
    </div>

    <p v-if="copied === 'no'" class="note">
      copy by hand: <span class="link">{{ link }}</span>
    </p>
    <p v-else-if="copied === 'yes'" class="note" role="status">link copied</p>

    <p v-if="session.error" class="error" role="alert">{{ session.error }}</p>

    <template v-if="hosting">
      <div class="row toggles">
        <label title="only players already let in this session can come back">
          <input
            type="checkbox"
            :checked="session.locked"
            @change="session.setLocked(checked($event))"
          />
          lock room
        </label>
        <label title="new players wait for you to let them in">
          <input
            type="checkbox"
            :checked="session.approval"
            @change="session.setApproval(checked($event))"
          />
          approve joins
        </label>
      </div>

      <ul v-if="session.pending.length" class="pending" aria-label="asking to join">
        <li v-for="asking in session.pending" :key="asking.peerId">
          <span class="who">{{ asking.name }} wants in</span>
          <button type="button" @click="session.accept(asking.peerId)">let in</button>
          <button type="button" @click="session.decline(asking.peerId)">turn away</button>
        </li>
      </ul>

      <ul class="players" aria-label="players">
        <li v-if="session.players.length === 0" class="note">no players yet</li>
        <li
          v-for="player in session.players"
          :key="player.name"
          :class="{ offline: player.peerId === null }"
        >
          <span class="dot" :aria-label="player.peerId === null ? 'offline' : 'online'"></span>
          {{ player.name }}
          <button
            type="button"
            class="kick"
            :aria-label="`remove ${player.name}`"
            title="remove from the session"
            @click="removing = player.name"
          >
            ×
          </button>
        </li>
      </ul>

      <PopupDialog v-model="confirming" title="remove player">
        <p class="confirm">Remove {{ removing }} from the session?</p>
        <div class="row actions">
          <button type="button" class="danger" @click="remove">Remove</button>
          <button type="button" @click="removing = null">Cancel</button>
        </div>
      </PopupDialog>
    </template>
  </section>
</template>

<style scoped>
.session-bar {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  max-width: min(22rem, calc(100% - 24px));
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--line);
  border-radius: 0.5rem;
  background: color-mix(in srgb, var(--surface-raised) 88%, transparent);
  color: var(--ink);
  font-size: 0.78rem;
}

/* Clear of the DM/player toggle, which only shows in debug mode. */
.session-bar.beside {
  right: 6rem;
}

.row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.room {
  margin-right: auto;
  color: var(--ink-dim);
}

.room code {
  color: var(--ink);
  font-size: 0.85rem;
  letter-spacing: 0.06em;
}

button {
  padding: 0.2rem 0.5rem;
  border: 1px solid var(--line);
  border-radius: 0.35rem;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  cursor: pointer;
}

button:hover {
  border-color: var(--ink-dim);
}

.players {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem 0.7rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.players li {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.toggles {
  gap: 0.8rem;
}

.toggles label {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--ink-dim);
  cursor: pointer;
}

.toggles input {
  margin: 0;
}

.pending {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.pending li {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.pending .who {
  margin-right: auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kick {
  padding: 0 0.2rem;
  border: none;
  background: none;
  color: var(--ink-dim);
  line-height: 1;
}

.kick:hover {
  color: #e07a6a;
}

.confirm {
  margin: 0 0 0.8rem;
}

.actions {
  justify-content: flex-end;
}

.danger {
  border-color: #e07a6a;
  color: #e07a6a;
}

.dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: #4caf6a;
}

.offline {
  color: var(--ink-dim);
}

.offline .dot {
  background: var(--ink-dim);
}

.note,
.error {
  margin: 0;
  color: var(--ink-dim);
}

.error {
  color: #e07a6a;
}

.link {
  word-break: break-all;
  user-select: all;
}
</style>
