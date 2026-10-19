<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import CaravanPanel from '../components/CaravanPanel.vue'
import DayNightDial from '../components/DayNightDial.vue'
import DmToolbar from '../components/DmToolbar.vue'
import EnterScreen from '../components/EnterScreen.vue'
import HexCanvas from '../components/HexCanvas.vue'
import HexDetails from '../components/HexDetails.vue'
import InventoryList from '../components/InventoryList.vue'
import MapList from '../components/MapList.vue'
import SessionBar from '../components/SessionBar.vue'
import ViewToggle from '../components/ViewToggle.vue'
import { useDebugMode } from '../composables/useDebugMode'
import { MIN_MAX_ZOOM } from '../composables/useHexWindow'
import { useStage } from '../composables/useStage'
import { useUndoKeys } from '../composables/useUndoKeys'
import { useViewMode } from '../composables/useViewMode'
import { useZoomLimit } from '../composables/useZoomLimit'
import type { EntityKind } from '../entities/entity'
import { carriesInventory } from '../entities/inventory'
import { MAP_FILE_EXTENSION, parseMapFile, serialiseMap } from '../persistence/mapFile'
import {
  MAX_SIGHT,
  MIN_SIGHT,
  PACE_LIMITS,
  TERRAIN_LIMITS,
  WORLD_SIZES,
  useHexMapStore,
  type WorldSize,
} from '../stores/hexMap'
import { useMapLibraryStore } from '../stores/mapLibrary'
import { useSessionStore } from '../stores/session'
import { MAP_STYLE_LABELS, MAP_STYLES, type MapStyle } from '../terrain/mapStyles'
import { RESOURCE_SPACING_LIMITS, countByOrigin } from '../terrain/resources'
import { TERRAIN_IDS, TERRAIN_LABELS, type TerrainId } from '../terrain/terrain'
import { KM_PER_HEX } from '../terrain/travel'

const store = useHexMapStore()
const library = useMapLibraryStore()
const { veiled } = useStage()
useUndoKeys()

/** Narrower than this and a panel would be most of the window. */
const NARROW = 720

// View state, not map state: collapsing a panel hands the map back the room
// and the pointer, which a scroll container has to hold on to while it is open.
// A small window opens collapsed, so a phone gets the map first.
const narrow = (): boolean => window.innerWidth < NARROW

store.setPanelOpen('world', !narrow(), narrow())
store.setPanelOpen('entities', !narrow(), narrow())
const worldCollapsed = computed(() => !store.panelsOpen.world)
const entitiesCollapsed = computed(() => !store.panelsOpen.entities)
const toggleWorld = (): void => store.setPanelOpen('world', worldCollapsed.value, narrow())
const toggleEntities = (): void => store.setPanelOpen('entities', entitiesCollapsed.value, narrow())

const onSight = (event: Event): void => {
  store.setEntitySight(store.selectedId, Number((event.target as HTMLInputElement).value))
}

const onPace = (event: Event): void => {
  store.setPace(store.selectedId, Number((event.target as HTMLInputElement).value))
}

const onDarkvision = (event: Event): void => {
  store.setDarkvision(store.selectedId, (event.target as HTMLInputElement).checked)
}

const onReachUncapped = (event: Event): void => {
  store.setPlayerReachCapped(!(event.target as HTMLInputElement).checked)
}

const onSpacing = (event: Event): void => {
  store.setResourceSpacing(Number((event.target as HTMLInputElement).value))
}

const onChance = (terrainId: TerrainId, event: Event): void => {
  store.setResourceChance(terrainId, Number((event.target as HTMLInputElement).value) / 100)
}

const debug = useDebugMode()
const session = useSessionStore()

useViewMode(store, session)

// The host is always the DM; peeking at the players' view is a debugging aid,
// and turning it off hands the DM their own view back.
watchEffect(() => {
  if (!debug.value && !store.dmView && session.role !== 'guest') store.dmView = true
})

// Picking the picked token again puts it down, so the DM's clicks go back to the ground.
const pick = (id: string): void => store.selectEntity(id === store.selectedId ? '' : id)

const zoomLimit = useZoomLimit()

const onZoomLimit = (event: Event): void => {
  zoomLimit.choose(Number((event.target as HTMLInputElement).value))
}

const resourceCounts = computed(() => countByOrigin(store.resources))

const generateResources = (): void => {
  const generated = resourceCounts.value.generated
  if (
    generated > 0 &&
    !window.confirm(`Replace the ${generated} generated resources? Hand-placed ones stay.`)
  )
    return
  store.generateResources()
}

const onTerrain = (key: 'scale' | 'seaLevel' | 'relief', event: Event): void => {
  store.setTerrain({ [key]: Number((event.target as HTMLInputElement).value) })
}

const onStyle = (event: Event): void => {
  store.setTerrain({ style: (event.target as HTMLSelectElement).value as MapStyle })
}

const addKind = ref<EntityKind>('caravan')

const exportMap = (): void => {
  const blob = new Blob([serialiseMap(store.snapshot)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `hexcrawl-${store.terrain.seed}${MAP_FILE_EXTENSION}`
  link.click()
  // Revoked a tick later: some browsers start the download only after click returns.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

const importInput = ref<HTMLInputElement | null>(null)
const importError = ref<string | null>(null)

const importMap = async (event: Event): Promise<void> => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // Cleared so picking the same file again still fires a change.
  input.value = ''
  if (!file) return

  const result = parseMapFile(await file.text())
  if (!result.ok) {
    importError.value = result.error
    return
  }
  importError.value = null
  if (library.maps.length > 0) {
    await library.importMap(file.name, result.snapshot)
    return
  }
  // Without storage there is no list to add it to, only the one map to replace.
  if (!window.confirm(`Replace the current map with ${file.name}? This cannot be undone.`)) return
  store.restore(result.snapshot)
}

const worldSizes = Object.keys(WORLD_SIZES) as WorldSize[]

// The controls below ask the store's own permission check, so the players' view
// offers exactly what the store would carry out and the two cannot drift apart.
// The world panel as a whole is the DM's: players are shown none of it.
const shapesWorld = computed(
  () => store.may('terrain') || store.may('maps') || store.may('resources'),
)

/** Whether the selected entity takes orders from whoever is at this browser. */
const orderable = computed(
  () => store.selectedEntity !== null && store.may('order', store.selectedEntity),
)

const onRename = (event: Event): void => {
  const input = event.target as HTMLInputElement
  if (store.selectedEntity) store.renameEntity(store.selectedEntity.id, input.value)
  // A blank name is refused; the field goes back to the name the entity kept.
  input.value = store.selectedEntity?.name ?? ''
}

const onRecolor = (event: Event): void => {
  const one = store.selectedEntity
  if (one) store.recolorEntity(one.id, (event.target as HTMLInputElement).value)
}

// Whoever plays the selected entity, and the players it could be handed to:
// everyone let in this session, and its player from before even while away.
const playedBy = computed(() =>
  store.selectedEntity ? store.playerOf(store.selectedEntity.id) : null,
)
const playerNames = computed(() => {
  const names = session.players.map((one) => one.name)
  return playedBy.value === null || names.includes(playedBy.value)
    ? names
    : [playedBy.value, ...names]
})

const onAssign = (event: Event): void => {
  const name = (event.target as HTMLSelectElement).value
  if (store.selectedEntity) store.assignEntity(store.selectedEntity.id, name || null)
}

/** Riders are listed under their caravan, not among those walking on their own. */
const walking = computed(() => store.shownEntities.filter((one) => !store.carrierOf(one.id)))

const carrierName = computed(() => {
  const carrier = store.carrierOf(store.selectedId)
  return carrier ? (store.entities.find((one) => one.id === carrier)?.name ?? null) : null
})

// A caravan's list sits in the caravan panel already; twice over is once too many.
const ownInventory = computed(() => {
  const selected = store.selectedEntity
  return selected && carriesInventory(selected.kind) && store.shownCaravan?.id !== selected.id
    ? selected
    : null
})

const hint = computed(() => {
  if (store.selectedEntity && !orderable.value) {
    return `${store.selectedEntity.name} is not yours to order · you can only watch it`
  }
  if (!store.start && store.selectedEntity?.kind === 'ship') {
    return 'click a water hex to put the ship there'
  }
  if (!store.start) return 'click a hex to put the entity there'
  if (carrierName.value && store.atSea(store.selectedId)) {
    return `aboard ${carrierName.value} at sea · no orders until it lies beside land`
  }
  if (carrierName.value) {
    return `riding in ${carrierName.value} · click a hex to climb out and walk there`
  }
  if (!store.goal) return 'click a hex to give it a route'
  return 'shift-click adds a stop · press the arrow on the dial: it walks as the turns pass'
})

const straightLine = computed(() => (store.route ? `${store.route.steps * KM_PER_HEX} km` : '—'))

/** A long crawl would otherwise hang hundreds of rows off the panel. */
const TURNS_SHOWN = 40

// Newest first: the last turn is the one anybody is looking for.
const recentTurns = computed(() => {
  const from = Math.max(0, store.adventureLog.length - TURNS_SHOWN)
  return store.adventureLog.slice(from).reverse()
})

const olderTurns = computed(() => Math.max(0, store.adventureLog.length - TURNS_SHOWN))
</script>

<template>
  <main>
    <HexCanvas />
    <!-- Nothing but the fogged map behind the enter screen: no tools to reach
         past it, and nothing to give the map away before anyone is in. -->
    <template v-if="!veiled">
      <DayNightDial />
      <ViewToggle v-if="debug" />
      <SessionBar v-if="session.role" :class="{ beside: debug }" />
      <DmToolbar />
      <HexDetails />
    </template>
    <EnterScreen />
    <div v-if="!veiled" class="panels">
      <aside v-if="shapesWorld" class="panel" :class="{ collapsed: worldCollapsed }">
        <header>
          <h1>world</h1>
          <button
            type="button"
            class="toggle"
            :aria-expanded="!worldCollapsed"
            :aria-label="worldCollapsed ? 'open the world panel' : 'collapse the world panel'"
            @click="toggleWorld"
          >
            <span aria-hidden="true">▾</span>
          </button>
        </header>

        <div v-show="!worldCollapsed" class="body">
          <dl>
            <dt>hover</dt>
            <dd>
              {{ store.hovered ?? '—' }}
              <span v-if="store.hoveredTile" class="dim">
                {{ store.hoveredTile.terrain }} · lv {{ store.hoveredTile.level }}
              </span>
            </dd>
          </dl>

          <div class="control stack">
            <template v-if="store.may('terrain')">
              <div class="row">
                <span>seed</span>
                <span class="value">{{ store.terrain.seed }}</span>
              </div>
              <button type="button" @click="store.reseed">roll a new world</button>
            </template>
            <template v-if="store.may('maps')">
              <MapList />
              <div class="row">
                <button type="button" @click="exportMap">export map</button>
                <button type="button" @click="importInput?.click()">import map</button>
              </div>
              <input
                ref="importInput"
                type="file"
                :accept="`${MAP_FILE_EXTENSION},application/json`"
                hidden
                @change="importMap"
              />
              <p v-if="importError" class="error" role="alert">{{ importError }}</p>
            </template>

            <template v-if="store.may('terrain')">
              <div class="row">
                <span>world size</span>
                <span class="value">{{ store.worldRadius }} hex</span>
              </div>
              <div class="sizes">
                <button
                  v-for="size in worldSizes"
                  :key="size"
                  type="button"
                  :class="{ here: store.worldSize === size }"
                  @click="store.setWorldSize(size)"
                >
                  {{ size }}
                </button>
              </div>

              <div class="row">
                <span>map style</span>
                <select :value="store.terrain.style" @change="onStyle">
                  <option v-for="style in MAP_STYLES" :key="style" :value="style">
                    {{ MAP_STYLE_LABELS[style] }}
                  </option>
                </select>
              </div>

              <div class="row">
                <span>landmass size</span>
                <span class="value">{{ store.terrain.scale }}</span>
              </div>
              <input
                :value="store.terrain.scale"
                type="range"
                :min="TERRAIN_LIMITS.scale.min"
                :max="TERRAIN_LIMITS.scale.max"
                :step="TERRAIN_LIMITS.scale.step"
                @input="onTerrain('scale', $event)"
              />

              <div class="row">
                <span>sea level</span>
                <span class="value">{{ store.terrain.seaLevel.toFixed(2) }}</span>
              </div>
              <input
                :value="store.terrain.seaLevel"
                type="range"
                :min="TERRAIN_LIMITS.seaLevel.min"
                :max="TERRAIN_LIMITS.seaLevel.max"
                :step="TERRAIN_LIMITS.seaLevel.step"
                @input="onTerrain('seaLevel', $event)"
              />

              <div class="row">
                <span>relief</span>
                <span class="value">{{ store.terrain.relief.toFixed(1) }}</span>
              </div>
              <input
                :value="store.terrain.relief"
                type="range"
                :min="TERRAIN_LIMITS.relief.min"
                :max="TERRAIN_LIMITS.relief.max"
                :step="TERRAIN_LIMITS.relief.step"
                @input="onTerrain('relief', $event)"
              />
            </template>

            <template v-if="store.may('resources')">
              <div class="row">
                <span>resource spacing</span>
                <span class="value">{{ store.resourceSpacing }} hex</span>
              </div>
              <input
                :value="store.resourceSpacing"
                type="range"
                :min="RESOURCE_SPACING_LIMITS.min"
                :max="RESOURCE_SPACING_LIMITS.max"
                :step="RESOURCE_SPACING_LIMITS.step"
                @input="onSpacing"
              />
              <details class="odds">
                <summary>resource odds</summary>
                <template v-for="terrainId in TERRAIN_IDS" :key="terrainId">
                  <div class="row">
                    <span>{{ TERRAIN_LABELS[terrainId] }}</span>
                    <span class="value">
                      {{ Math.round(store.resourceChances[terrainId] * 100) }}%
                    </span>
                  </div>
                  <input
                    :value="Math.round(store.resourceChances[terrainId] * 100)"
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    :aria-label="`resource odds on ${TERRAIN_LABELS[terrainId]}`"
                    @input="onChance(terrainId, $event)"
                  />
                </template>
              </details>
              <button type="button" @click="generateResources">generate resources</button>
              <p class="dim">
                {{ store.resources.length }} resources: {{ resourceCounts.generated }} generated,
                {{ resourceCounts.manual }} manual
              </p>
            </template>
          </div>

          <!-- What the fog shows is the DM's to say. The sight field goes with it:
               it is drawn from everything the parties see, hexes the DM hid included. -->
          <template v-if="store.may('fog')">
            <label class="control">
              <input v-model="store.fog" type="checkbox" />
              <span>fog of war</span>
            </label>

            <label v-if="store.fog" class="control indent">
              <input v-model="store.fogSeeThrough" type="checkbox" />
              <span>see the map through the fog</span>
            </label>

            <label class="control">
              <input v-model="store.showSight" type="checkbox" />
              <span>show the sight field</span>
            </label>
          </template>

          <div v-if="store.fog || store.showSight" class="control stack">
            <div class="row">
              <span>seeing</span>
              <span class="value">{{ store.reach }} hex</span>
            </div>
            <div v-if="store.fog" class="row">
              <span>explored</span>
              <span class="value">{{ store.exploredCount }}</span>
            </div>
          </div>

          <div class="control stack">
            <div class="row">
              <span>zoom-out limit</span>
              <span class="value">{{ zoomLimit.limit.value }}</span>
            </div>
            <input
              :value="zoomLimit.limit.value"
              type="range"
              :min="MIN_MAX_ZOOM"
              :max="zoomLimit.farthest.value"
              step="1"
              @input="onZoomLimit"
            />
          </div>

          <label class="control">
            <input v-model="debug" type="checkbox" />
            <span>debug mode</span>
          </label>

          <p class="dim">drag to pan · wheel to zoom · Q / E to rotate</p>
        </div>
      </aside>

      <aside class="panel" :class="{ collapsed: entitiesCollapsed }">
        <header>
          <h1>entities</h1>
          <button
            type="button"
            class="toggle"
            :aria-expanded="!entitiesCollapsed"
            :aria-label="
              entitiesCollapsed ? 'open the entities panel' : 'collapse the entities panel'
            "
            @click="toggleEntities"
          >
            <span aria-hidden="true">▾</span>
          </button>
        </header>

        <div v-show="!entitiesCollapsed" class="body">
          <dl>
            <dt>turn</dt>
            <dd>
              {{ store.turn }}
              <span class="dim">{{ store.clock.phase }} {{ store.clock.index + 1 }}/4</span>
            </dd>

            <dt>standing</dt>
            <dd>{{ store.start ?? '—' }}</dd>

            <dt>headed</dt>
            <dd>{{ store.goal ?? '—' }}</dd>
          </dl>

          <div class="control stack">
            <div class="row">
              <span>entities</span>
              <span class="value">{{ store.shownEntities.length }}</span>
            </div>

            <ul class="entities">
              <li v-for="one in walking" :key="one.id">
                <button
                  type="button"
                  :class="{ here: one.id === store.selectedId }"
                  :title="
                    store.may('order', one)
                      ? `give ${one.name} the orders`
                      : `look at ${one.name}; it is not yours to order`
                  "
                  @click="pick(one.id)"
                >
                  <span class="pip" :style="{ background: one.color }" />
                  <span>{{ one.name }}</span>
                  <span class="dim">{{ one.kind }}</span>
                  <span class="value">{{ one.pacePerTurn }}/turn</span>
                </button>
                <ul v-if="store.ridersOf(one.id).length" class="riders">
                  <li v-for="rider in store.ridersOf(one.id)" :key="rider.id">
                    <button
                      type="button"
                      :class="{ here: rider.id === store.selectedId }"
                      :title="
                        store.atSea(rider.id)
                          ? `${rider.name} is aboard ${one.name} at sea and cannot be ordered off`
                          : `${rider.name} rides in ${one.name}; an order takes it out`
                      "
                      @click="pick(rider.id)"
                    >
                      <span class="pip" :style="{ background: rider.color }" />
                      <span>{{ rider.name }}</span>
                      <span class="dim">{{ store.atSea(rider.id) ? 'at sea' : 'riding' }}</span>
                      <span class="value">{{ one.pacePerTurn }}/turn</span>
                    </button>
                  </li>
                </ul>
              </li>
            </ul>

            <div v-if="store.may('addEntity')" class="row">
              <select v-model="addKind">
                <option value="party">party</option>
                <option value="caravan">caravan</option>
                <option value="npc">npc</option>
                <option value="ship">ship</option>
              </select>
              <button type="button" @click="store.addEntity(undefined, addKind, 'player')">
                add
              </button>
            </div>
            <button
              v-if="store.may('removeEntity', store.selectedEntity ?? undefined)"
              type="button"
              :disabled="!store.selectedEntity"
              @click="store.removeEntity(store.selectedId)"
            >
              {{
                store.selectedEntity ? `remove ${store.selectedEntity.name}` : 'nobody on the map'
              }}
            </button>
            <label
              v-if="store.may('assignEntity') && store.selectedEntity && playerNames.length"
              class="row"
            >
              <span>played by</span>
              <select :value="playedBy ?? ''" @change="onAssign">
                <option value="">nobody</option>
                <option v-for="name in playerNames" :key="name" :value="name">{{ name }}</option>
              </select>
            </label>
          </div>

          <label v-if="store.may('entitySettings')" class="control">
            <input type="checkbox" :checked="!store.playerReachCapped" @change="onReachUncapped" />
            <span>players may plan past one turn</span>
          </label>

          <dl v-if="store.route" class="route">
            <dt>hexes left</dt>
            <dd>{{ store.plannedHexes.length }}</dd>

            <dt>travel</dt>
            <dd>
              {{ store.route.km }} km
              <span v-if="store.routeBySea" class="dim">by sea</span>
            </dd>

            <dt>turns</dt>
            <dd>~{{ store.routeTurns }}</dd>

            <dt>flat</dt>
            <dd class="dim">{{ straightLine }}</dd>
          </dl>

          <ol v-if="store.legs.length" class="legs">
            <li v-for="(leg, index) in store.legs" :key="`${index}:${leg.to}`">
              <span class="dim">{{ index + 1 }}</span>
              <span>{{ leg.to }}</span>
              <span class="value">
                {{ leg.km }} km · ~{{ leg.turns }}t
                <span v-if="leg.landfall" class="dim" title="riders can step ashore here">
                  · puts in
                </span>
              </span>
              <button
                v-if="orderable"
                type="button"
                class="drop"
                :title="`drop the stop at ${leg.to}`"
                @click="store.removeWaypoint(index)"
              >
                ×
              </button>
            </li>
          </ol>

          <div v-if="store.selectedEntity" class="control stack">
            <label v-if="store.may('renameEntity', store.selectedEntity)" class="row naming">
              <span>name</span>
              <input
                :key="store.selectedId"
                class="name"
                type="text"
                maxlength="40"
                :value="store.selectedEntity.name"
                aria-label="the entity's name"
                @change="onRename"
              />
            </label>
            <label v-if="store.may('recolorEntity', store.selectedEntity)" class="row naming">
              <span>colour</span>
              <input
                type="color"
                :value="store.selectedEntity.color"
                aria-label="the entity's colour"
                @input="onRecolor"
              />
            </label>
            <div class="row">
              <span>pace</span>
              <span class="value">{{ store.selectedEntity.pacePerTurn }} hex a turn</span>
            </div>
            <input
              v-if="store.may('entitySettings', store.selectedEntity)"
              :value="store.selectedEntity.pacePerTurn"
              type="range"
              :min="PACE_LIMITS.min"
              :max="PACE_LIMITS.max"
              :step="PACE_LIMITS.step"
              @input="onPace"
            />
            <div class="row">
              <span>sight by daylight</span>
              <span class="value">{{ store.selectedEntity.sight }} hex</span>
            </div>
            <input
              v-if="store.may('entitySettings', store.selectedEntity)"
              :value="store.selectedEntity.sight"
              type="range"
              :min="MIN_SIGHT"
              :max="MAX_SIGHT"
              step="1"
              @input="onSight"
            />
            <label v-if="store.may('entitySettings', store.selectedEntity)" class="row naming">
              <span>darkvision</span>
              <input
                type="checkbox"
                :checked="store.selectedEntity.darkvision"
                aria-label="sees as far by night as by day"
                @change="onDarkvision"
              />
            </label>
            <template v-if="orderable">
              <button
                type="button"
                :disabled="!store.goal || store.atSea(store.selectedId)"
                :title="store.atSea(store.selectedId) ? 'no orders for a rider at sea' : undefined"
                @click="store.clear"
              >
                call off the order
              </button>
              <button
                type="button"
                :disabled="!store.start"
                @click="store.queueAction(store.selectedId, { kind: 'camp' })"
              >
                make camp this turn
              </button>
            </template>
            <p v-else class="dim">not yours to order</p>
          </div>

          <InventoryList v-if="ownInventory" :owner-id="ownInventory.id" />

          <label class="control">
            <input v-model="store.showHistory" type="checkbox" />
            <span>show full path history</span>
          </label>

          <label class="control">
            <input v-model="store.showAllPaths" type="checkbox" />
            <span>show all entities paths</span>
          </label>

          <div v-if="store.adventureLog.length" class="control stack">
            <div class="row">
              <span>adventure log</span>
              <span class="value">{{ store.travelledKm }} km</span>
            </div>
            <div class="row">
              <span>hexes walked</span>
              <span class="value">{{ store.hexesWalked }}</span>
            </div>

            <ol class="journey">
              <li
                v-for="entry in recentTurns"
                :key="entry.kind === 'turn' ? `turn:${entry.row.turn}` : entry.encounter.id"
              >
                <button
                  v-if="entry.kind === 'turn'"
                  type="button"
                  :class="{ here: entry.row.turn === store.turn - 1, ahead: !entry.row.spent }"
                  :disabled="!store.may('clock')"
                  :title="
                    store.may('clock')
                      ? `put the crawl back as it stood at the end of turn ${entry.row.turn}`
                      : undefined
                  "
                  @click="store.goToTurn(entry.row.turn + 1)"
                >
                  <span class="dim">{{ entry.row.turn }}</span>
                  <span>{{ entry.row.hex }}</span>
                  <span class="dim">{{ entry.row.terrain }}</span>
                  <span class="value">{{
                    entry.row.entered === 0 ? entry.row.kind : `${entry.row.entered} hex`
                  }}</span>
                </button>
                <button
                  v-else
                  type="button"
                  class="met"
                  :class="{
                    here: entry.encounter.turn === store.turn,
                    ahead: entry.encounter.turn > store.turn,
                  }"
                  :disabled="!store.may('clock')"
                  :title="
                    store.may('clock')
                      ? `put the crawl back to turn ${entry.encounter.turn}, when this was met`
                      : undefined
                  "
                  @click="store.goToTurn(entry.encounter.turn)"
                >
                  <span class="dim">!</span>
                  <span class="encounter">{{ entry.encounter.title }}</span>
                  <span class="dim">{{ entry.encounter.hex }}</span>
                </button>
              </li>
            </ol>
            <p v-if="olderTurns" class="dim">and {{ olderTurns }} earlier</p>

            <button v-if="store.may('clearHistory')" type="button" @click="store.clearHistory">
              clear the history
            </button>
          </div>

          <p>{{ hint }}</p>
        </div>
      </aside>

      <CaravanPanel />
    </div>
  </main>
</template>

<style scoped>
main {
  position: relative;
  height: 100%;
  overflow: hidden;
  touch-action: none;
}

/* The strip the panels sit in lets the pointer through to the map; only the
   panels themselves take it. */
.panels {
  position: absolute;
  top: 1rem;
  left: 1rem;
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  height: calc(100% - 2rem);
  pointer-events: none;
}

/* A panel outgrew the viewport once the terrain knobs landed. It scrolls
   inside itself rather than taking the page with it, which costs the drag-through
   it used to have: a scroll container has to receive the pointer. */
aside:where(.panel) {
  box-sizing: border-box;
  max-height: 100%;
  width: min(var(--panel-width), calc(100vw - 2rem));
  padding: 0.75rem 1rem;
  border: 1px solid var(--line);
  border-radius: 0.5rem;
  background: color-mix(in srgb, var(--surface-raised) 88%, transparent);
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--line) transparent;
  pointer-events: auto;
}

.journey {
  max-height: 11rem;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  list-style: none;
}

.journey li button {
  display: grid;
  width: 100%;
  grid-template-columns: 1.75rem 1fr auto auto;
  gap: 0.4rem;
  padding: 0.1rem 0.25rem;
  border: none;
  border-radius: 0.2rem;
  background: none;
  color: inherit;
  font: inherit;
  font-variant-numeric: tabular-nums;
  text-align: left;
  cursor: pointer;
}

.journey li button.met {
  grid-template-columns: 1.75rem 1fr auto;
  font-style: italic;
}

.journey .encounter {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.journey li button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--line) 45%, transparent);
}

/* Read-only for whoever may not wind the clock: a record, not a control. */
.journey li button:disabled {
  color: inherit;
  cursor: default;
}

.legs {
  margin: 0.4rem 0 0;
  padding: 0;
  font-size: 0.78rem;
  list-style: none;
}

.legs li {
  display: grid;
  grid-template-columns: 1rem 1fr auto 1.4rem;
  align-items: center;
  gap: 0.4rem;
  font-variant-numeric: tabular-nums;
}

.legs .drop {
  padding: 0;
  border: none;
  background: none;
  color: var(--ink-dim);
  line-height: 1.2;
}

.legs .drop:hover {
  color: var(--ink);
}

.entities {
  margin: 0;
  padding: 0;
  list-style: none;
}

.entities li button {
  display: grid;
  width: 100%;
  grid-template-columns: 0.6rem 1fr auto auto;
  align-items: center;
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

.entities .riders {
  margin: 0 0 0 0.9rem;
  padding: 0 0 0 0.35rem;
  border-left: 1px solid var(--line);
  list-style: none;
}

.entities li button:hover {
  background: color-mix(in srgb, var(--line) 45%, transparent);
}

.entities li button.here {
  background: color-mix(in srgb, var(--line) 70%, transparent);
}

.odds {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.odds summary {
  color: var(--ink-dim);
  cursor: pointer;
}

.odds summary:hover {
  color: var(--ink);
}

.sizes {
  display: flex;
  gap: 0.3rem;
}

.sizes button.here {
  border-color: #7aa2c8;
  color: var(--ink);
}

.pip {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
}

select {
  flex: 1;
  padding: 0.3rem;
  border: 1px solid var(--line);
  border-radius: 0.35rem;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  font-size: 0.78rem;
}

/* The turn the crawl stands on, so a rewound record still reads. */
.journey li button.here {
  background: color-mix(in srgb, var(--line) 70%, transparent);
}

/* Turns the crawl has been wound back past: still recorded, not yet lived. */
.journey li button.ahead {
  color: var(--ink-dim);
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
}

h1 {
  margin: 0;
  font-size: 0.9rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.body {
  margin-top: 0.5rem;
}

/* Collapsed the panel is one row: no scroller, no width to speak of, and the
   map gets the pointer everywhere the row is not. */
aside:where(.panel).collapsed {
  width: auto;
  max-height: none;
  overflow: visible;
}

.toggle {
  width: auto;
  padding: 0.1rem 0.35rem;
  border: none;
  background: none;
  color: var(--ink-dim);
  font-size: 1.7rem;
  line-height: 1;
}

.toggle:hover {
  color: var(--ink);
}

.toggle span {
  display: block;
  transition: transform 150ms ease;
}

aside:where(.panel).collapsed .toggle span {
  transform: rotate(-90deg);
}

dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.15rem 0.75rem;
  margin: 0;
  font-size: 0.8rem;
}

dl.route {
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--line);
}

dt {
  color: var(--ink-dim);
}

dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
}

.dim {
  color: var(--ink-dim);
}

.error {
  margin: 0;
  color: #e07a6a;
}

p {
  margin: 0.6rem 0 0;
  font-size: 0.75rem;
}

.control.indent {
  margin-top: 0.35rem;
  padding-top: 0;
  padding-left: 1.2rem;
  border-top: none;
}

.control {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin-top: 0.75rem;
  padding-top: 0.6rem;
  border-top: 1px solid var(--line);
  font-size: 0.78rem;
  cursor: pointer;
  user-select: none;
}

.control input {
  margin: 0;
  accent-color: #7aa2c8;
  cursor: pointer;
}

.control.stack {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.4rem;
}

.control.stack .row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}

.control.stack .value {
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}

.control.stack span {
  color: var(--ink-dim);
}

.control.stack .row.naming {
  align-items: center;
}

.control.stack input.name {
  flex: 1;
  min-width: 0;
  padding: 0.25rem 0.45rem;
  border: 1px solid var(--line);
  border-radius: 0.35rem;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  cursor: text;
}

.control.stack input.name:focus {
  border-color: #7aa2c8;
  outline: none;
}

.control.stack input[type='range'] {
  width: 100%;
  margin: 0.1rem 0;
}

:where(.panel) button {
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

:where(.panel) button:hover:not(:disabled) {
  border-color: #7aa2c8;
}

:where(.panel) button:disabled {
  color: var(--ink-dim);
  cursor: default;
}

/* Room is the scarce thing on a phone: the panels stack in the corner, only
   one open at a time, and the dial drops below them rather than straddling them. */
@media (max-width: 720px) {
  .panels {
    top: 0.5rem;
    left: 0.5rem;
    flex-direction: column;
    gap: 0.5rem;
    height: calc(100% - 7rem);
  }
}
</style>
