# hexcrawl_web-0zz: sections inside panels fold on their own

This spec builds on `design/hexcrawl_web-tb0.md`: the one-column dock, panel headers as `h2 > button`, and the scrolling body.

Not in this spec:
- visual restyle (q55): this spec gives only the sizes needed for target size and focus
- height animation (17y): folding here is instant (`v-show`)

## Goal
For the DM and players working inside a long panel, such as the world knobs, a caravan's stock, or a hex's notebook. The one action: **fold the section you are not using**, so the one you are using sits near the header. The browser remembers what was folded.

## The section component: `src/components/PanelSection.vue` (new)
Props:
- `foldKey: string`: stable and unique across the app, for example `caravan.merchants` (see the key table)
- `title: string`: the visible title

Slots:
- `meta` (optional): plain text shown in the header after the title, for example a count. **Text only**: it renders inside the toggle button.
- `actions` (optional): interactive controls shown at the header's right, outside the toggle button. Example: `edit table`.
- default: the section body

Markup:
```html
<section class="psec" :class="{ folded }" :aria-labelledby="headId">
  <div class="psec-head">
    <h3 class="psec-title">
      <button :id="headId" type="button" class="psec-toggle"
              :aria-expanded="!folded" :aria-controls="bodyId" @click="toggle">
        <span class="psec-name">{{ title }}</span>
        <span v-if="$slots.meta" class="psec-meta"><slot name="meta" /></span>
        <span class="psec-chevron" aria-hidden="true">▾</span>
      </button>
    </h3>
    <div v-if="$slots.actions" class="psec-actions"><slot name="actions" /></div>
  </div>
  <div v-show="!folded" :id="bodyId" class="psec-body"><slot /></div>
</section>
```
- Ids:
  - `headId = 'sec-' + foldKey.replace('.', '-') + '-head'`
  - `bodyId = 'sec-' + foldKey.replace('.', '-')`
- Each `foldKey` appears at most once in the DOM at a time, so the ids are unique.

Layout. These are the minimum rules this bead needs; q55 restyles the rest.
- `.psec-head`: `display: flex; align-items: center; min-height: var(--section-row)`. Add the token to `:root`: `2rem`, and `2.5rem` on phone.
- `.psec-title`: `flex: 1; min-width: 0; margin: 0; font: inherit`.
- `.psec-toggle`:
  - `width: 100%; min-height: var(--section-row); display: flex; align-items: center; gap: 0.5rem; padding: 0; border: none; background: none; color: inherit; text-align: left; cursor: pointer`
  - this is not the `:where(.panel) button` look, so override it
- `.psec-meta`: `margin-left: auto; color: var(--ink-dim); font-variant-numeric: tabular-nums`.
- `.psec-chevron`:
  - `width: 1rem` and centred
  - `rotate(0)` when open, `rotate(-90deg)` when folded, the same as the tb0 panel chevron
  - no transition in this bead
- `.psec-actions`: `flex: none; margin-left: 0.5rem`.
- `.psec + .psec`: `margin-top: 0.75rem` (q55 replaces this).

States:
| state | rule |
|---|---|
| default | title `var(--ink)`, chevron and meta `var(--ink-dim)` |
| hover | chevron `var(--ink)` |
| focus-visible | `outline: 2px solid #7aa2c8; outline-offset: 2px; border-radius: 0.25rem` on `.psec-toggle` |
| folded | body hidden (`v-show`), chevron `-90deg`, `aria-expanded="false"` |
| empty | not a fold state. A section with nothing to say keeps its own empty line ("carrying nothing", "nobody aboard", …) inside the body |

## Fold state: `src/composables/useSectionFolds.ts` (new) and its test
- localStorage key: `hexcrawl.sectionFolds`. It follows `hexcrawl.zoomLimit` and `hexcrawl.debug`.
- Value: a JSON array of the **folded** keys, sorted, for example `["caravan.merchants","world.resources"]`. Every section starts **open**, so a new section never needs a migration.
- One shared reactive `Set<string>`, created at module level and read lazily on first use. API: `isFolded(key): boolean` and `toggle(key): void`. `toggle` writes the whole array back.
- Storage access follows `useEnterPrefs.ts`:
  - wrap both getting `localStorage` and each call in `try/catch`
  - with storage blocked, folds still work for the visit and are not kept
- Validate on read:
  - not JSON, not an array, or holding entries that are not strings: start empty
  - keys that no longer exist: ignored, not pruned
- Per browser only. Never saved with a map, never synced in a session, not in the Pinia store. Two players on one machine share it, which is accepted.
- Allow injecting storage for tests, as `useEnterPrefs(storage)` does.
- Tests (`useSectionFolds.test.ts`):
  1. Every key starts open.
  2. `toggle` folds, and a second `toggle` opens.
  3. The fold survives a fresh composable over the same storage.
  4. Malformed JSON, or a non-array, gives all open.
  5. Storage that throws on get and set still toggles in memory.

## Sections per panel
Each panel's top summary stays outside any section and never folds:
- world: the `hover` dl
- entities: the `turn / standing / headed` dl
- caravan: the portrait row, where tdj.4's card goes
- hex details: the `terrain / shore / position` dl

The entities hint line (`<p>{{ hint }}</p>`) also stays outside, at the foot of the body.

| foldKey | title | meta slot | actions slot | contents (existing markup moved in) | file |
|---|---|---|---|---|---|
| `world.terrain` | terrain | `seed {n}` | none | seed and `roll a new world`, then world size, map style, landmass, sea level, relief | MapView.vue |
| `world.maps` | maps | none | none | `<MapList />`, export/import buttons, file input | MapView.vue, MapList.vue |
| `world.resources` | resources | `{spacing} hex` | none | spacing slider; `resource odds` `<details>` (stays native, nested); generate button | MapView.vue |
| `world.fog` | fog and sight | `{reach} hex` when shown | none | fog, see-through, sight field checkboxes; seeing / explored rows | MapView.vue |
| `world.view` | view | none | none | zoom-out limit, debug mode, the controls hint `p` | MapView.vue |
| `entities.list` | entities | `{count}` | none | list, add row, remove, played by, `players may plan past one turn` | MapView.vue |
| `entities.route` | route | `{km} km` | none | route dl and legs list; rendered only while `store.route` | MapView.vue |
| `entities.selected` | `{selected entity name}` | `{kind}` | none | name, colour, pace, sight, darkvision, order buttons / "not yours to order". tdj.4's card goes at the top of this body | MapView.vue |
| `entities.inventory` | inventory | `{count} · {wt} wt` | none | `<InventoryList fold-key="entities.inventory">` | InventoryList.vue |
| `entities.paths` | paths | none | none | show full path history; show all entities paths | MapView.vue |
| `entities.log` | adventure log | `{km} km` | none | hexes walked, journey list, "and N earlier", clear the history | MapView.vue |
| `caravan.supplies` | supplies | none | none | `CaravanSupplies` body | CaravanSupplies.vue |
| `caravan.inventory` | inventory | `{count} · {wt} wt` | none | `<InventoryList fold-key="caravan.inventory">` | InventoryList.vue |
| `caravan.riders` | riders | `{count}` | none | riders list / "nobody aboard" | CaravanPanel.vue |
| `caravan.merchants` | merchants | `{count}` | none | `CaravanMerchants` body | CaravanMerchants.vue |
| `details.notes` | notes | none | none | the notes textarea. The label text `notes` moves to the title; give the textarea `aria-labelledby` set to the section head id | HexDetails.vue |
| `details.encounter` | encounter | none | `edit table` link button | `HexEncounter` body | HexEncounter.vue |
| `details.events` | events | `{count}` | none | `HexEvents` body | HexEvents.vue |
| `details.locations` | locations | `{count}` | none | `HexLocations` body | HexLocations.vue |
| `details.resources` | resources | `{count}` | none | `HexResources` body | HexResources.vue |

### Rules for moving markup in
- Components that render their own section (InventoryList, CaravanSupplies, CaravanMerchants, Hex*) **replace their root `<section>` with `<PanelSection>`**. Drop their own title row or `<h2>`: the title and count move to `title` and `meta`. Keep their `aria-label` text only as the title; the section is labelled by its heading.
- InventoryList gets a required `foldKey` prop because it shows in two panels. The other components hard-code their key.
- In MapView, sections wrap existing `.control` blocks. Inner markup and handlers do not change.
- World DOM order changes so that seed and `roll a new world` sit in `terrain`, and maps follows terrain. This is the only reorder.
- MapList: drop its own `maps` label span. Its `new map` button stays where it is, in its own row.
- Sections that render conditionally today (route, adventure log, selected entity, world blocks behind `may()`) keep their `v-if` on the `<PanelSection>`. Their fold state persists while they are absent.
- A fold never changes which panel is open (tb0), and never moves focus.

## Copy
English only. Lowercase as the app writes everything. New visible text: the section titles in the table above. Of those, `terrain`, `fog and sight`, `view` and `paths` are new words; the rest are already shown today.

## Accessibility
- This is the APG disclosure pattern, as in tb0.
  - Toggle: a native button with `aria-expanded` and `aria-controls`.
  - The `<section>` is labelled by its heading (`aria-labelledby`).
  - Heading level is `h3`, under the panel's `h2`.
- The accessible name is the title plus the meta text, for example "riders 3". Accepted.
- Keyboard: Tab reaches each section toggle in DOM order. Enter or Space folds it. Focus stays on the toggle. Folded bodies are `display: none`, so they leave the tab order. No arrow keys are needed.
- Target: `--section-row`, which is 32px desktop and 40px phone, both above the 24px minimum.
- Contrast: same inks as tb0, already checked.

## Files touched
New:
- `src/components/PanelSection.vue`
- `src/composables/useSectionFolds.ts`
- `src/composables/useSectionFolds.test.ts`

Changed:
- `src/style.css`: one token, `--section-row`
- `src/views/MapView.vue`: template only, plus import
- `src/components/CaravanPanel.vue`
- `src/components/HexDetails.vue`
- `src/components/InventoryList.vue`
- `src/components/CaravanSupplies.vue`
- `src/components/CaravanMerchants.vue`
- `src/components/HexEncounter.vue`
- `src/components/HexEvents.vue`
- `src/components/HexLocations.vue`
- `src/components/HexResources.vue`
- `src/components/MapList.vue`

No store change, no `may()`, nothing saved with a map.

## UI review checklist
At 360, 768 and 1280, as DM and as a player:
- every section in the table folds and opens
- folds survive reload
- folding `caravan.inventory` leaves `entities.inventory` open
- Tab and Enter work on the toggles
- `aria-expanded` flips

## Assumptions
1. Every section starts open, and only folded keys are stored.
2. The four new section titles (`terrain`, `fog and sight`, `view`, `paths`) and the regrouping of the world panel's controls are mine to choose; the user can rename them.
3. `resource odds` stays a native `<details>` nested inside `world.resources` and does not persist its fold.
