# hexcrawl_web

A 3D hexcrawl sandbox for the web — players and dungeon masters run hexcrawl-style maps for tabletop RPG campaigns in the browser.

## Overview

Hexcrawls are exploration-driven RPG campaigns played on a hex grid: the party moves hex to hex, revealing terrain, encounters, and points of interest as they go. This project turns that into a shared 3D sandbox in the browser.

Intended shape:

- **3D hex map** rendered in the browser — terrain, elevation, features.
- **DM tools** — author and edit maps, place encounters and POIs, control what players can see.
- **Player view** — move the party, reveal hexes, track travel.
- **Shared session** — DM and players on the same map at the same time.

## Status

Early, runnable single-player prototype: 3D hex terrain, party movement with routes and a travel log, fog of war, day/night time control, and maps saved in the browser. No shared session yet.

## Stack

- TypeScript (strict) + Vue 3, Pinia, Vue Router
- Babylon.js for the 3D scene
- SQLite WASM (`@sqlite.org/sqlite-wasm`) on the OPFS SAH pool VFS, run in a Web Worker, for map persistence
- Vite for dev/build, Vitest for tests, ESLint + Prettier

## Running

Requires [Bun](https://bun.sh) (1.4+) and a modern browser with OPFS support (recent Chrome, Edge, Firefox or Safari).

```bash
bun install      # install dependencies
bun dev          # start the Vite dev server (http://localhost:5173)
```

Production build:

```bash
bun run build    # type-check + build into dist/
bun preview      # serve dist/ locally
```

Maps persist in the browser's Origin Private File System, per origin — clearing site data wipes them.

## Scripts

| Command            | What it does                                   |
| ------------------ | ---------------------------------------------- |
| `bun dev`          | Vite dev server                                |
| `bun run build`    | `vue-tsc` type-check, then `vite build`        |
| `bun preview`      | Serve the production build                     |
| `bun run test`     | Run the Vitest suite once                      |
| `bun test:watch`   | Vitest in watch mode                           |
| `bun typecheck`    | `vue-tsc --noEmit`                             |
| `bun lint`         | ESLint (`bun lint:fix` to autofix)             |
| `bun format`       | Prettier write (`bun format:check` to verify)  |
| `bun bench`        | Benchmark fog recompute cost                   |
| `bun bench:window` | Benchmark moving the grid window across worlds |

Use `bun run test`, not `bun test` — the latter runs Bun's own test runner instead of Vitest.

## Development

Issue tracking uses [beads](https://github.com/gastownhall/beads), kept **local only** — no Dolt remote, `.beads/issues.jsonl` is a passive export.

```bash
bd ready       # available work
bd show <id>   # issue detail
```

## License

TODO
