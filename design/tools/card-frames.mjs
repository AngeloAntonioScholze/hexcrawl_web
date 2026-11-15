// Design tool (not shipped, not part of the build). Spec: design/hexcrawl_web-1a1.10.md, "Art frame".
// Crops the three card frames out of docs/reference/character-card-frame.jpg, keys the black
// background to alpha, builds a window mask per frame and measures the art's slots.
// usage, from the hexcrawl_web root:
//   node design/tools/card-frames.mjs docs/reference/character-card-frame.jpg src/assets/frames
//   node design/tools/card-frames.mjs docs/reference/character-card-frame.jpg <tmpDir> --preview
// Writes per variant: <v>-frame.webp (shipped), <v>-window.png (shipped), <v>-frame.png
// (lossless copy for inspection, do not ship) and slots.json (measured regions, do not ship).
// With --preview also writes preview-<v>.png (keyed frame over the panel colour, region overlay,
// 3x zoom). Needs Playwright + Chromium; it is resolved from the projects root's ui-shots tool,
// or from the directory in PLAYWRIGHT_FROM.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(
  `${process.env.PLAYWRIGHT_FROM ?? 'C:/Users/angelo/Documents/projects/.agents/tools/ui-shots'}/package.json`,
)
const { chromium } = require('playwright')

const CROP_W = 340
const CROP_H = 438
// Crop origin per variant (source pixels). Each crop is centred on its shield's outer edges.
// seeds: a point inside each art region, in SOURCE pixels; region = 4-connected pixels with
// max(R,G,B) <= limit grown from the seed.
const VARIANTS = {
  steel: {
    x0: 43,
    y0: 115,
    seeds: {
      window: [213, 290, 44],
      banner: [150, 389, 42],
      slot1: [142, 416, 42],
      slot2: [213, 416, 44],
      slot3: [284, 416, 46],
      plate: [213, 456, 46],
    },
  },
  bronze: {
    x0: 402,
    y0: 115,
    seeds: {
      // the bronze window is arched and its inner band is as dark as the window, so the grow is
      // clipped: x 465..680 and below the arch y = 177 + 0.0034 * (x - 572.5)^2 (source px)
      window: [572, 290, 44, { x0: 465, x1: 680, arch: [572.5, 177, 0.0034] }],
      banner: [515, 400, 46],
      slot1: [506, 426, 42],
      slot2: [573, 426, 42],
      slot3: [639, 426, 44],
      plate: [572, 464, 44],
    },
  },
  crimson: {
    x0: 767,
    y0: 115,
    seeds: {
      window: [933, 290, 42],
      banner: [865, 389, 40],
      slot1: [864, 417, 40],
      slot2: [937, 417, 42],
      slot3: [1011, 417, 44],
      plate: [937, 460, 44],
    },
  },
}
// Background key: components of {max <= KEY_HI} that contain a pixel with max <= KEY_SEED are
// background. Their alpha ramps from 0 at KEY_LO to 1 at KEY_HI; colour is un-premultiplied
// against black. Everything else stays opaque.
const KEY = { seed: 4, lo: 4, hi: 14 }
const STEP = 2

const [jpg, outDir, flag] = process.argv.slice(2)
if (!jpg || !outDir) {
  console.error('usage: node cutout.mjs <jpg> <outDir> [--preview]')
  process.exit(2)
}
await mkdir(outDir, { recursive: true })
const data = (await readFile(jpg)).toString('base64')
const browser = await chromium.launch()
const page = await browser.newPage()
const result = await page.evaluate(
  async ({ data, VARIANTS, CROP_W, CROP_H, KEY, STEP, preview }) => {
    const img = new Image()
    img.src = `data:image/jpeg;base64,${data}`
    await img.decode()
    const files = {}
    const slots = {}
    const W = CROP_W
    const H = CROP_H
    const grow = (inSet, sx, sy) => {
      const seen = new Uint8Array(W * H)
      const stack = [sy * W + sx]
      seen[stack[0]] = 1
      const out = []
      while (stack.length) {
        const k = stack.pop()
        out.push(k)
        const x = k % W
        const y = (k - x) / W
        for (const [nx, ny] of [
          [x + 1, y],
          [x - 1, y],
          [x, y + 1],
          [x, y - 1],
        ]) {
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
          const n = ny * W + nx
          if (!seen[n] && inSet(n, k)) {
            seen[n] = 1
            stack.push(n)
          }
        }
      }
      return { seen, out }
    }
    for (const [name, v] of Object.entries(VARIANTS)) {
      const c = document.createElement('canvas')
      c.width = W
      c.height = H
      const g = c.getContext('2d')
      g.drawImage(img, v.x0, v.y0, W, H, 0, 0, W, H)
      const id = g.getImageData(0, 0, W, H)
      const px = id.data
      const m = new Uint8Array(W * H)
      for (let k = 0; k < W * H; k++) m[k] = Math.max(px[k * 4], px[k * 4 + 1], px[k * 4 + 2])

      // background key
      const bg = new Uint8Array(W * H)
      for (let k = 0; k < W * H; k++) {
        if (bg[k] || m[k] > KEY.seed) continue
        const { out } = grow((n) => m[n] <= KEY.hi && !bg[n], k % W, Math.floor(k / W))
        for (const n of out) bg[n] = 1
      }
      let keyed = 0
      for (let k = 0; k < W * H; k++) {
        if (!bg[k]) continue
        keyed++
        const a = Math.min(1, Math.max(0, (m[k] - KEY.lo) / (KEY.hi - KEY.lo)))
        for (let j = 0; j < 3; j++) px[k * 4 + j] = a > 0 ? Math.min(255, px[k * 4 + j] / a) : 0
        px[k * 4 + 3] = Math.round(a * 255)
      }
      g.putImageData(id, 0, 0)
      files[`${name}-frame.png`] = c.toDataURL('image/png')
      files[`${name}-frame.webp`] = c.toDataURL('image/webp', 0.92)

      // regions
      const regions = {}
      const seenAll = {}
      let windowSeen = null
      for (const [rname, [sx, sy, limit, clip]] of Object.entries(v.seeds)) {
        const inClip = (n) => {
          if (!clip) return true
          const xs = (n % W) + v.x0
          const ys = Math.floor(n / W) + v.y0
          const [ax, ay, ak] = clip.arch
          return xs >= clip.x0 && xs <= clip.x1 && ys >= ay + ak * (xs - ax) ** 2 + 1
        }
        const cx = sx - v.x0
        const cy = sy - v.y0
        // region pixels: below the limit, not background, and no step of more than STEP from the
        // neighbour that reached them (the art's rims are steps of 10+; panel gradients are ~1/px)
        const { seen, out } = grow(
          (n, k) => m[n] <= limit && !bg[n] && Math.abs(m[n] - m[k]) <= STEP && inClip(n),
          cx,
          cy,
        )
        let x0 = W
        let y0 = H
        let x1 = 0
        let y1 = 0
        for (const k of out) {
          const x = k % W
          const y = (k - x) / W
          x0 = Math.min(x0, x)
          x1 = Math.max(x1, x)
          y0 = Math.min(y0, y)
          y1 = Math.max(y1, y)
        }
        const box = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, area: out.length }
        // row extents at the top and bottom quarter, for trapezoid-like shapes
        const rowSpan = (yy) => {
          let a = W
          let b = -1
          for (let x = 0; x < W; x++)
            if (seen[yy * W + x]) {
              a = Math.min(a, x)
              b = Math.max(b, x)
            }
          return [a, b]
        }
        box.rowTop = rowSpan(y0 + 3)
        box.rowMid = rowSpan(Math.round((y0 + y1) / 2))
        box.rowBot = rowSpan(y1 - 3)
        box.pct = {
          left: +((x0 / W) * 100).toFixed(2),
          top: +((y0 / H) * 100).toFixed(2),
          width: +((box.w / W) * 100).toFixed(2),
          height: +((box.h / H) * 100).toFixed(2),
        }
        regions[rname] = box
        seenAll[rname] = seen
        if (rname === 'window') windowSeen = seen
      }
      // window mask: region grown from the window seed with its pinholes (JPEG specks the grow
      // skipped) filled, eroded 1px, then a 3x3 box blur
      {
        const wr = regions.window
        const outside = new Uint8Array(W * H)
        const stack = []
        for (let x = wr.x; x < wr.x + wr.w; x++)
          for (const y of [wr.y, wr.y + wr.h - 1]) stack.push(y * W + x)
        for (let y = wr.y; y < wr.y + wr.h; y++)
          for (const x of [wr.x, wr.x + wr.w - 1]) stack.push(y * W + x)
        while (stack.length) {
          const k = stack.pop()
          if (outside[k] || windowSeen[k]) continue
          outside[k] = 1
          const x = k % W
          const y = (k - x) / W
          if (x > wr.x) stack.push(k - 1)
          if (x < wr.x + wr.w - 1) stack.push(k + 1)
          if (y > wr.y) stack.push(k - W)
          if (y < wr.y + wr.h - 1) stack.push(k + W)
        }
        for (let y = wr.y; y < wr.y + wr.h; y++)
          for (let x = wr.x; x < wr.x + wr.w; x++)
            if (!outside[y * W + x]) windowSeen[y * W + x] = 1
      }
      const er = new Uint8Array(W * H)
      for (let y = 1; y < H - 1; y++)
        for (let x = 1; x < W - 1; x++) {
          const k = y * W + x
          er[k] =
            windowSeen[k] &&
            windowSeen[k - 1] &&
            windowSeen[k + 1] &&
            windowSeen[k - W] &&
            windowSeen[k + W]
              ? 1
              : 0
        }
      const wb = regions.window
      const mc = document.createElement('canvas')
      mc.width = wb.w
      mc.height = wb.h
      const mg = mc.getContext('2d')
      const md = mg.createImageData(wb.w, wb.h)
      for (let y = 0; y < wb.h; y++)
        for (let x = 0; x < wb.w; x++) {
          let s = 0
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const X = wb.x + x + dx
              const Y = wb.y + y + dy
              if (X >= 0 && Y >= 0 && X < W && Y < H) s += er[Y * W + X]
            }
          const i = (y * wb.w + x) * 4
          md.data[i] = md.data[i + 1] = md.data[i + 2] = 255
          md.data[i + 3] = Math.round((s / 9) * 255)
        }
      mg.putImageData(md, 0, 0)
      files[`${name}-window.png`] = mc.toDataURL('image/png')
      slots[name] = { crop: { x: v.x0, y: v.y0, w: W, h: H }, keyedPixels: keyed, regions }

      if (preview) {
        const pc = document.createElement('canvas')
        pc.width = W * 4 + 24
        pc.height = H * 3
        const pg = pc.getContext('2d')
        pg.fillStyle = '#1d2026'
        pg.fillRect(0, 0, pc.width, pc.height)
        pg.drawImage(c, 0, 0)
        // region overlay under the 1x frame
        pg.drawImage(c, 0, H + 8)
        const tint = { window: [0, 255, 0], banner: [255, 0, 255], plate: [0, 160, 255] }
        const od = pg.getImageData(0, H + 8, W, H)
        for (const [rname, seen] of Object.entries(seenAll)) {
          const [r, gg, b] = tint[rname] ?? [255, 200, 0]
          for (let k = 0; k < W * H; k++)
            if (seen[k]) {
              od.data[k * 4] = (od.data[k * 4] + r) / 2
              od.data[k * 4 + 1] = (od.data[k * 4 + 1] + gg) / 2
              od.data[k * 4 + 2] = (od.data[k * 4 + 2] + b) / 2
            }
        }
        pg.putImageData(od, 0, H + 8)
        pg.imageSmoothingEnabled = false
        // 3x of the top-left crest/corner area
        pg.drawImage(c, 0, 0, W / 1.5, H, W + 24, 0, W * 2, H * 3)
        files[`preview-${name}.png`] = pc.toDataURL('image/png')
      }
    }
    return { files, slots }
  },
  { data, VARIANTS, CROP_W, CROP_H, KEY, STEP, preview: flag === '--preview' },
)
for (const [file, url] of Object.entries(result.files)) {
  await writeFile(join(outDir, file), Buffer.from(url.split(',')[1], 'base64'))
}
await writeFile(join(outDir, 'slots.json'), JSON.stringify(result.slots, null, 1))
for (const [file, url] of Object.entries(result.files))
  console.log(`${file}  ${Math.round((url.length * 3) / 4 / 1024)} KB`)
await browser.close()
