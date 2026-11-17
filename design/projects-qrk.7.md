# projects-qrk.7: analytics consent prompt

Status: spec, 2026-11-17. Written against `agent/qrk.7` at `684f9f7` (wizard PostHog commit). Dark theme only (memory `hexcrawl-web-dark-theme-only`). Tokens are from `design/tokens.md`. The q55 tokens (`--accent`, `--line-strong`, `--control-h`, `--radius-panel`, `--shadow-panel`, `--surface-deep`) are not in `style.css` yet, so every use carries the literal fallback listed in tokens.md, the same way tdj.27 did: `var(--accent, #7aa2c8)`.

Builds on:
- bead projects-qrk.7 (event plan in its notes): nothing stored before an answer, accept = analytics on with persistence, decline = off
- `design/hexcrawl_web-tb0.md` (dock, `--dock-reserve`, `--minimap-reserve`)
- `src/components/EnterScreen.vue`, `DmToolbar.vue`, `SessionBar.vue`, `MiniMap.vue`, `DayNightDial.vue`, `views/MapView.vue` (what must stay uncovered)

## Goal
For anyone who opens hexcrawl (DM, player, or someone preparing a map alone), on the first load where analytics is configured. The one action is to **answer yes or no to usage stats without being stopped from using the app.** The prompt is a small note at the edge of the screen. It is not a wall, it is not modal, and the app works the same whether it gets an answer or not.

## When it shows
| condition | prompt | settings switch (see "Change later") |
|---|---|---|
| analytics not configured (`VITE_POSTHOG_*` missing; the analytics module is a no-op) | never | hidden |
| configured, no stored answer | shown on every route: enter screen, map view, DM and player | hidden (the prompt is the control) |
| configured, answer stored `granted` | never | shown, on |
| configured, answer stored `declined` (open question 1, default b) | never | shown, off |

Until there is an answer, posthog is not initialised with persistence and nothing is written to localStorage, sessionStorage, cookies or IndexedDB by the app or posthog for analytics. Showing the prompt writes nothing either: whether it was "seen" is not stored.

**Stored answer.** One localStorage key, `hexcrawl.analytics`, value `granted` or `declined`, named like the existing `hexcrawl.sectionFolds`. Nothing else: no timestamp, no id. The implementer may use posthog's own opt-in/out API under it, provided that a decline writes nothing posthog-side (no `__ph_opt_in_out_*` key). Only `hexcrawl.analytics` may be written.

## Placement
The prompt is mounted once in `App.vue`, after `<RouterView />`. It is `position: fixed`, so it does not depend on what the view renders. It has two modes, chosen by one media query (the component and CSS use the same string):

```
STRIP = '(max-width: 1023px), (max-height: 640px)'
```

The touch-size rule for the buttons (`2.5rem` tall) stays on its own `(max-width: 720px)` query; only the strip/card switch uses STRIP.

### Card mode (desktop 1024+, viewport taller than 640px)
Bottom right, directly above the minimap's slot. That column is kept clear of the DM toolbar by `--minimap-reserve`. It stays clear of the session bar (top right), the dial (top centre) and the dock (left), and it stays off-centre of the free map area.

```
desktop 1280 x 800
+--------------------------------------------------------------+
| [dock 22rem]          ( dial )               [session bar]   |
| |          |                                                 |
| |          |              map centre                         |
| |          |                 +                               |
| |          |                               +---------------+ |
| |          |                               | Usage stats   | |
| |          |                               | ...           | |
| |          |                               | [Share][Don't]| |
| |          |                               +---------------+ |
| |          |                                  0.75rem gap    |
| |          |        [ DM toolbar ]              [minimap]    |
+--------------------------------------------------------------+
```

| property | value |
|---|---|
| `right` | `1rem` |
| `bottom` | `var(--minimap-reserve)` (1rem + 176px + 0.75rem = 204px), the same for players, who have no minimap, so the position never changes |
| `width` | `min(19.5rem, 100vw - var(--dock-reserve) - 1rem)` (312px at 1024 and up; at 296px or more the body fits in 2 lines, 288px gave 3) |
| `z-index` | `12` (above the enter screen's `10`, which takes the pointer over the whole viewport) |

Measured clearance (UI review round 1, 312px card): at 1280x800 the card spans x 952 to 1264 and y about 445 to 596; the minimap starts at y 608 and the DM toolbar at y 692 even with paint terrain open. The free map centre is (726, 400). At 1024x800 the card spans x 696 to 1008, same y.

Why not card mode on tablet: from 721 to 1023px wide `DmToolbar.vue` lifts the toolbar into the right column above the minimap (`bottom: calc(1rem + 176px + 0.5rem)`, up to 124px tall with paint terrain). That is the card's slot, so at 768x1024 the card covered the toolbar and blocked its buttons. Tablets use the strip, which lifts the toolbar through `--consent-reserve` (the tablet `.dm-toolbar` rule already adds it).

### Strip mode (phone 360, tablet 768, any width up to 1023px, or any viewport 640px tall or less)
A full-width strip at the bottom. It **reserves its own height**, so nothing bottom-anchored ends up under it:

```
phone 360 x 740
+------------------------------+
| [world        v]             |  folded dock headers
| [entities     v]             |
|          ( dial )            |
|              [session bar]   |
|                              |
|          map centre          |
|                              |
|        [ DM toolbar ]        |  lifted by --consent-reserve
| +--------------------------+ |
| | Usage stats              | |
| | Count which tools ...    | |
| | [ Share stats][Don't sh.]| |
| +--------------------------+ |
+------------------------------+
```

| property | value |
|---|---|
| `left`, `right`, `bottom` | `0.5rem` |
| `width` | auto |
| `z-index` | `12` |

**`--consent-reserve` (new layout token).** While the prompt is shown in strip mode, the component sets `--consent-reserve` on `document.documentElement` as an inline px value: prompt `offsetHeight` + 8px (bottom inset) + 8px (gap). It removes the property when the prompt leaves, and whenever the STRIP query stops matching. It updates from a `ResizeObserver` on the prompt and a `matchMedia(STRIP)` change listener. These are event-driven only, with no rAF and no per-frame work, and nothing touches the Babylon loop.

These consumers add `var(--consent-reserve, 0px)` to their bottom offset (one declaration each):
| file | rule | new value |
|---|---|---|
| `DmToolbar.vue` | `.dm-toolbar` bottom | `calc(12px + var(--consent-reserve, 0px))` |
| `MiniMap.vue` | `.minimap` bottom | `calc(1rem + var(--consent-reserve, 0px))` (tablet strip and short desktop windows; hidden on phone) |
| `MapView.vue` | `.panels` and `.subpanels` bottom | desktop `calc(1rem + var(--consent-reserve, 0px))`; inside the phone block, after `inset: 0.5rem`, `bottom: calc(0.5rem + var(--consent-reserve, 0px))` (both `.panels` and `.subpanels.stacked`) |
| `EnterScreen.vue` | `.enter` | `padding-bottom: calc(1rem + var(--consent-reserve, 0px))`, so the cards centre in the space above the strip |

`MapView.vue` is a hot spot. This is a small, separate CSS addition and allowed under PROJECT.md "Hot spots".

## Component: `src/components/ConsentPrompt.vue` (new)
Reads and writes consent only through the `src/analytics` module (bead notes: no direct posthog-js imports in components). The module exposes, by name: `configured: boolean`, `consent: Ref<'granted' | 'declined' | null>`, `grant()` and `decline()`.

### Structure
```html
<section class="consent" aria-labelledby="consent-title">
  <h2 id="consent-title">Usage stats</h2>
  <p>Count which tools and views get used, to make hexcrawl better. Never your maps or names.</p>
  <div class="actions">
    <button type="button">Share stats</button>
    <button type="button">Don't share</button>
  </div>
</section>
```
- `section` + `aria-labelledby` makes it a named region landmark ("Usage stats"), so screen-reader users can find it from the landmarks list.
- Not `dialog` or `alertdialog`, not `aria-modal`, and no live region: it doesn't interrupt and doesn't trap.

### Layout and tokens
| element | value |
|---|---|
| box | `padding: var(--space-3)` (12px); `border: 1px solid var(--line)`; `border-radius: var(--radius-panel, 0.5rem)`; `box-shadow: var(--shadow-panel, 0 6px 24px -8px rgb(0 0 0 / 0.6))` |
| background | **opaque** `var(--surface-raised)`. Not `--panel-bg`: at 94% over a snow or white hex, `--ink-dim` drops to about 4.3:1 |
| grid | `display: grid; gap: var(--space-2)` (8px) |
| heading `h2` | `margin: 0`; 0.875rem / 1.3, weight 600 (`--text-heading`); colour `--ink`; no uppercase, no letter-spacing |
| body `p` | `margin: 0`; 0.8125rem / 1.4, weight 400; colour `--ink-dim`; max 2 lines in card mode at 312px, 3 lines on a 360 phone, 1 line in the tablet strip |
| `.actions` | `display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2)`; `margin-top: var(--space-1)` |

### Buttons: equal weight
Both buttons use **the same style**, the neutral control. Neither gets the accent fill, neither is larger, bolder or first-focused. Order is `Share stats` then `Don't share` in DOM and visually, both at the same width (`1fr`).

| state | style |
|---|---|
| default | height `var(--control-h, 2rem)` (phone `2.5rem`); `padding: 0 var(--space-3)`; `border: 1px solid var(--line-strong, #666e7d)`; `border-radius: var(--radius-control, 0.25rem)`; `background: var(--surface)`; `color: var(--ink)`; 0.8125rem / 1.4, weight 400; `font: inherit` for the family; `cursor: pointer` |
| hover | `border-color: var(--accent, #7aa2c8)` |
| focus-visible | `outline: 2px solid var(--accent, #7aa2c8); outline-offset: 2px` |
| active | `background: var(--surface-deep, #0f1114)` |
| disabled | none (never disabled) |
| loading | none. `grant()` is synchronous (init with persistence). If it throws, analytics stays off, the answer is not stored, and the prompt still closes: there is nothing the user can do about it, so it isn't shown |
| empty, error | none |

### On answer
1. `Share stats` calls `grant()`: store `granted`, init posthog with persistence, send the single `$pageview` and register the super props (bead notes). `Don't share` calls `decline()`: store `declined` (or nothing, open question 1) and init nothing.
2. The prompt leaves (motion below) and `--consent-reserve` is removed, so the toolbar, dock and enter cards settle back.
3. **Focus**: the prompt never takes focus on its own. If focus was inside it when answered, focus moves back to the element that had focus just before the user entered the prompt (the `relatedTarget` of the first `focusin` on the prompt). If that element is gone or null, `document.body`. On the enter screen that is normally the last-choice button the screen auto-focuses.
4. No toast or confirmation. The settings switch shows the state from then on.

## Change later
Default (open question 2, option a): **one switch on the enter screen's title card**, which every role passes through (first load, and again after leaving or ending a session, when the veil drops).

- Placed in `EnterScreen.vue`, title card, below `.choices`, `margin-top: var(--space-4)`, centred like the card.
- Shown only when `configured && consent !== null`.
- Markup: `<button type="button" role="switch" :aria-checked="consent === 'granted'" class="stats-switch">Share usage stats: <span>on|off</span></button>`.
- Style: a text button. No border, `background: none`, `color: var(--ink-dim)`, 0.75rem / 1.3, `min-height: 1.5rem` (24px, WCAG 2.5.8; phone `2.5rem`), `padding: 0 var(--space-1)`. The value word (`on`/`off`) is `--ink`. Hover: `text-decoration: underline`. Focus-visible: the same 2px accent outline, offset 2px. Not given the `.last` treatment and not in `buttons`/`focusLastChoice`.
- Tab order: after `Prepare`.
- Toggle off (`granted` to `declined`): `decline()` must also opt out and **remove every key posthog wrote** (localStorage, cookie, sessionStorage: posthog `opt_out_capturing()` + `reset()`, then delete the `ph_*` storage), so off leaves only `hexcrawl.analytics`. Toggle on: `grant()`, as above.
- Must not trigger `wave` (no `@pointerenter`/`@focus` stage effect): it is not a way into the app.

## Motion
| moment | value |
|---|---|
| appear | after mount, `opacity 0 → 1` and `translate: 0 8px → 0 0` over `var(--motion-fold, 200ms)` `var(--ease-fold, cubic-bezier(0.2, 0, 0, 1))`, with a `400ms` delay so it doesn't compete with the enter screen's first stage move |
| leave | `opacity 1 → 0`, `120ms ease-out`, no translate |
| reserve change | toolbar and dock jump to their new bottom (no transition on `bottom`), so no layout animation runs over the canvas |
| `prefers-reduced-motion: reduce` | appear and leave are instant (`0ms`, no translate, no delay). `--motion-fold` is already `0ms` there; the 400ms delay and 120ms leave also go to 0 |

CSS transitions only (Vue `<Transition>`), with no JS animation.

## Copy (English, the only shipped language)
| slot | text |
|---|---|
| heading | `Usage stats` |
| body | `Count which tools and views get used, to make hexcrawl better. Never your maps or names.` |
| accept | `Share stats` |
| decline | `Don't share` |
| settings switch | `Share usage stats: on` / `Share usage stats: off` |

Sentence case, per the hexcrawl title rule (review round 1): the heading, buttons and switch label start with a capital, with no trailing full stop on labels; the body is a sentence pair, so it keeps its stops. The switch value word (`on`/`off`) stays lower case. Don't mention PostHog, cookies, "we value your privacy", or "anonymous": with persistence there is a pseudonymous id, so "anonymous" would be untrue. The body matches the bead's event plan (tool and view events, no map content, no PII). If the event plan grows to anything about the user, the body copy must be revised.

## Accessibility
- **Contrast** (on opaque `--surface-raised`, tokens.md): heading `--ink` 14.0:1; body `--ink-dim` 5.2:1; button text `--ink` on `--surface` 14.7:1; button border `--line-strong` on `--surface-raised` 3.2:1 (3:1 non-text); focus ring `--accent` 6.1:1. Switch text `--ink-dim` on the enter card (`--surface-raised` at 92% over the dimmed stage) is at least 5.0:1 because the enter screen's radial veil darkens what is behind it. The UI review checks this on a bright map.
- **Focus order**: DOM order puts the prompt after the view, so on the enter screen Tab goes host, join, prepare, (switch,) then Share stats, then Don't share. In the map view it comes after every panel and tool. No focus trap: Tab leaves the prompt to the browser chrome or wraps as normal.
- **Keyboard**: Enter/Space on either button. **Escape does nothing**: dismissing without an answer would leave the state ambiguous, and the prompt doesn't block anything. No global shortcuts.
- **Screen reader**: region "Usage stats", h2, paragraph, two buttons. Nothing is announced on appear or leave.
- **Touch**: buttons at least 40px tall on phone (`--control-h` phone), with an 8px gap between them.
- **Zoom**: at 200% text zoom the card grows taller (fixed width, text wraps), and the strip's reserve follows through `ResizeObserver`.
- **Reduced motion**: see Motion.
- No images, so no alt text.

## Performance guard
No work per frame, no Babylon access, no observers on the canvas. `RenderStats` must read the same with the prompt shown, answered either way, or absent. Posthog autocapture and session replay stay off (bead notes), so the prompt's DOM is not recorded.

## Assets
None. No icons, images or fonts. No PostHog logo or branding.

## Tokens added (`design/tokens.md`, Layout)
`--consent-reserve`: px, set inline on `:root` by `ConsentPrompt` in strip mode only, unset otherwise. It is the bottom space the strip occupies (height + 16px), and bottom-anchored map chrome adds it. Default `0px` via the `var()` fallback. Bead: qrk.7.

## UI review checklist (for the designer pass)
Run with dummy `VITE_POSTHOG_PROJECT_TOKEN`/`VITE_POSTHOG_HOST` in `.env.local` (requests to it may fail, which is expected, but none may fire before accept). Clear `hexcrawl.analytics`. Then shoot:
1. enter screen, at 360, 768 and 1280
2. map as DM (via Prepare) with the toolbar, at 360, 768 (strip) and 1280, and also 1280x600 (strip mode on desktop); open paint terrain at 768 and check the toolbar clears the strip
3. map as DM in a session with the session bar and two sub-panel columns at 1280
4. phone with a panel open (the strip must not cover the panel body's foot)
5. after accept, and after decline: the prompt is gone, the reserve is removed, and the switch shows the right state on the enter screen
6. `--reduced-motion`
7. devtools Application tab before an answer: no `ph_*` keys, no cookies, no `hexcrawl.analytics`

Known edge: in card mode at heights 641 to 720px with the session bar lowered (two sub-columns) and four or more players listed, the bar can reach the card. Report it if seen; the fix would be raising the STRIP height threshold.

## Open questions (user)
1. **Decline storage.** (a) store nothing, so the prompt comes back every load; (b) store `hexcrawl.analytics = declined` in localStorage, a plain non-identifying preference. **Default b**: asking again every load nags the people who said no.
2. **Where the choice is changed later.** (a) the enter screen title card only (every role passes through it); (b) also the world panel's `view` section (DM only); (c) also a row in the session bar (sessions only). **Default a.**
3. **No env key, no prompt.** Hide the prompt and the switch when analytics isn't configured (dev, worktrees, gates). **Default yes.**
4. **Body copy** wording. **Default** as in Copy.
