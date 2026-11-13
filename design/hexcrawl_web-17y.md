# hexcrawl_web-17y: smooth panel and section folding

This bead adds motion to the folds that tb0 (panels) and 0zz (sections) already have. It does not change what folds, when it folds, or the fold state. Tokens come from `design/tokens.md` (the Motion rows).

## Goal
Folding should show what changed. When a panel opens and another folds (tb0's one-open rule), the user sees one panel give way to the other instead of a jump. A section folds into its header. Motion here only answers a click; nothing animates on its own.

## Technique: CSS only, grid-rows fold
Use no JS height measuring, no `requestAnimationFrame` and no `ResizeObserver`. Each foldable body gets a wrapper:

```html
<div class="fold" :class="{ open }">        <!-- replaces the v-show element -->
  <div class="fold-inner"> …existing body… </div>
</div>
```

Global utility in `src/style.css`:
```css
.fold {
  display: grid;
  grid-template-rows: minmax(0, 0fr);
  visibility: hidden;
  transition:
    grid-template-rows var(--fold-duration, var(--motion-fold)) var(--ease-fold),
    visibility 0s linear var(--fold-duration, var(--motion-fold));
}
.fold.open {
  grid-template-rows: minmax(0, 1fr);
  visibility: visible;
  transition:
    grid-template-rows var(--fold-duration, var(--motion-fold)) var(--ease-fold),
    visibility 0s linear 0s;
}
.fold-inner { min-height: 0; overflow: hidden; }
@media (prefers-reduced-motion: reduce) {
  :root { --motion-fold: 0ms; --motion-fold-section: 0ms; }
}
```
- `visibility` is what removes folded content from the tab order and the accessibility tree. It switches at the **end** of a fold and at the **start** of an open. That replaces `v-show` (`display: none`), which cannot animate. Do not add `inert` as well.
- **Panels** (tb0 bodies):
  - The `.fold` becomes the flex child: `flex: 0 1 auto; min-height: 0`.
  - The scroller moves to `.fold-inner`: `overflow-y: auto; overscroll-behavior: contain`. It stays `overflow: hidden` while the panel is folding: add `.fold:not(.open) > .fold-inner { overflow: hidden }`.
  - Every tb0 rule (headers stay visible, only the body scrolls) still holds.
- **Sections** (0zz `PanelSection.vue`): the `.psec-body` becomes `.fold` with `style="--fold-duration: var(--motion-fold-section)"`, or set as a class rule `.psec .fold { --fold-duration: var(--motion-fold-section) }`.
- **Chevrons** (panel and section): `transition: transform var(--fold-duration, var(--motion-fold)) var(--ease-fold)`. This replaces the hard-coded `150ms ease`.
- **First paint**: transitions only run on change, so a section restored as folded from localStorage, or a panel mounting folded, appears in place without animating. A newly mounted panel that mounts open (caravan, details) also appears without sliding. That is accepted, not a bug.

## Timing
| fold | duration | easing |
|---|---|---|
| panel open / fold | `--motion-fold` 200ms | `--ease-fold` `cubic-bezier(0.2, 0, 0, 1)` |
| section open / fold | `--motion-fold-section` 160ms | same |
| chevron rotate | same as its fold | same |

When one panel opens and the other folds in the same click, both run at once, 200ms each. Their heights roughly trade, so the headers below move together.

## Reduced motion
`prefers-reduced-motion: reduce` sets both durations to `0ms`. The fold is instant, and `visibility` flips at once, because its delay is the duration, which is 0. The chevron also snaps. Do not keep a fade as a substitute.

## Babylon: no render stall
- Only the column (`.panels`) and its descendants animate. The canvas element, `<main>` and the HUD overlays never change size, so the engine's resize path is not touched.
- Add `contain: layout paint` to `aside.panel`, so the per-frame layout work stays inside the panel.
- Nothing in this bead runs per frame in JS. The scene's own rAF loop and `renderPacing` are untouched, and nothing is added to `redrawOnCall`.
- Verify in dev:
  1. Press `}` (RenderStats) and drag the map while toggling a panel and a section repeatedly. `[render]` lines keep reporting drawn frames during the drag, with no frozen snapshot (memory `hexcrawl-web-babylon-render-loop-gotchas`).
  2. In a DevTools Performance recording of 5 folds, no long task over 50ms comes from the fold.

## Accessibility
- `aria-expanded` flips on click, at the start of the motion, not at the end.
- Focus stays on the toggled header throughout.
- Content of an opening body is focusable as soon as the motion starts. Content of a folding body stays focusable until the motion ends. That is 200ms at most, which is accepted.
- Once folded, a body has `visibility: hidden`, so screen readers and Tab skip it, the same as `display: none` today.

## Files touched
- `src/style.css`: `.fold` utility and the reduced-motion override (tokens added by q55, or here if q55 has not landed)
- `src/views/MapView.vue`: world and entities bodies, `v-show` to `.fold`; panel scroller rules move to `.fold-inner`
- `src/components/CaravanPanel.vue`: body to `.fold`; chevron transition
- `src/components/HexDetails.vue`: body to `.fold`; chevron transition
- `src/components/PanelSection.vue`: body to `.fold`; chevron transition

No store, test or engine files.

## UI review checklist
Check at 360, 768 and 1280:
- open each panel from another: both move, the headers stay attached, and there is no jump at the end
- fold and open a section at the top and at the bottom of a scrolled body
- with OS reduced motion on, every fold is instant
- Tab after a fold skips the folded content
- the RenderStats drag test above passes

## Assumptions
1. Folds stay focusable during their at-most-200ms close.
2. Panels that mount already open do not slide in.
