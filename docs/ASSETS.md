# Asset sources and licences

Where every non-code asset in this repo comes from, and under which terms it ships. The code is AGPL-3.0-or-later (`LICENSE`). An asset listed here with other terms is **not** covered by the AGPL. Add a row in the same change that adds an asset.

| asset | source | licence |
|---|---|---|
| `docs/reference/character-card-frame.jpg` | **User-supplied** by the project owner (supplied 2026-10-17 as `Gemini_Generated_Image_herkgcherkgcherk.jpg`). Three card frames (steel, bronze, crimson) on black, 1156×912, 1×. No higher-resolution or transparent version exists. | Supplied for use in this project by its owner. Terms still to be confirmed (decision bead, see `design/hexcrawl_web-1a1.10.md` Q1). Until then it is not relicensed under the AGPL. |
| `src/assets/frames/<variant>-frame.webp`, `<variant>-window.png` | Derived from `docs/reference/character-card-frame.jpg`: cropped and keyed by `design/tools/card-frames.mjs` | Same as the source image |
| `src/assets/fonts/inter-tight/*.woff2` | `@fontsource/inter-tight` 5.3.0 (Inter Tight, The Inter Project Authors) | SIL OFL 1.1, `src/assets/fonts/inter-tight/OFL.txt` |
| `src/assets/busts/*.svg` | Placeholder busts drawn in-repo (spec `design/hexcrawl_web-1a1.10.md`) | AGPL-3.0-or-later, with the code |
| `src/assets/professions/*.svg` | Placeholder icons drawn in-repo | AGPL-3.0-or-later, with the code |
| `docs/reference/player-card-sketch-2026-11-14.png` | Layout sketch by the project owner | Project-internal reference, not shipped in the build |
| `docs/reference/ability-modifiers.png` | Not recorded (added in `ed50f2a`) | Project-internal reference, not shipped in the build |
| `src/assets/sun-and-moon.png` | Not recorded (added in `bd6d331`) | Not recorded; ships in the build |
