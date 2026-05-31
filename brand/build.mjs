// Generates every brand file from one geometry (packages/ui/src/brand.ts, the Spark mark):
// logo mark (colour and mono), lockups, the app icons (macOS grid and full bleed) that the
// desktop app is built from, the menu-bar template icon, and the favicon set.
//
//   pnpm --filter @ferrocast/brand build
//
// The wordmark is already outlined in brand.ts, so no SVG here depends on a font.
//
// brand/desktop/ holds the desktop app's icon set under Tauri's file names; copy it into
// ../ferrocast/apps/desktop/icons after a change.

import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'
import {
  BRAND_PAINT,
  lockupSvg,
  sparkMonoShapes,
  sparkShapes,
  sparkSvg,
} from '../packages/ui/src/brand.ts'

const here = dirname(fileURLToPath(import.meta.url))
const out = (p) => join(here, p)
mkdirSync(out('png'), { recursive: true })
mkdirSync(out('favicon'), { recursive: true })

const pngOf = (svg, size) =>
  new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng()

// macOS-style continuous corner (superellipse, n = 5) for a square of side `s` at (x, y).
function squircle(x, y, s, n = 5) {
  const a = s / 2
  const pts = []
  for (let i = 0; i < 192; i++) {
    const t = (i / 192) * Math.PI * 2
    const c = Math.cos(t)
    const si = Math.sin(t)
    const px = x + a + a * Math.sign(c) * Math.abs(c) ** (2 / n)
    const py = y + a + a * Math.sign(si) * Math.abs(si) ** (2 / n)
    pts.push(`${px.toFixed(2)} ${py.toFixed(2)}`)
  }
  return `M${pts.join('L')}Z`
}

// ---------------------------------------------------------------- the mark

const { dark, light } = BRAND_PAINT
// Colour mark: dark ink by default, light ink when the viewer prefers dark.
writeFileSync(
  out('logo-mark.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Ferrocast">
  <style>
    .i { fill: ${light.ink} } .m { fill: ${light.molten} } .a { fill: ${light.arc} }
    @media (prefers-color-scheme: dark) { .i { fill: ${dark.ink} } .m { fill: ${dark.molten} } .a { fill: ${dark.arc} } }
  </style>
  ${sparkShapes({ ink: 'var(--i)', molten: 'var(--m)', arc: 'var(--a)' })
    .replace(/ style="fill:var\(--i\)"/g, ' class="i"')
    .replace(/ style="fill:var\(--m\)"/g, ' class="m"')
    .replace(/ style="fill:var\(--a\)"/g, ' class="a"')}
</svg>
`,
)
writeFileSync(out('logo-mark-dark.svg'), sparkSvg(dark, { size: 64, title: 'Ferrocast' }) + '\n') // for dark backgrounds
writeFileSync(out('logo-mark-light.svg'), sparkSvg(light, { size: 64, title: 'Ferrocast' }) + '\n') // for light backgrounds
writeFileSync(
  out('logo-mark-mono.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Ferrocast">${sparkMonoShapes('currentColor')}</svg>\n`,
)

// ---------------------------------------------------------------- lockups

writeFileSync(out('logo-wordmark-dark.svg'), lockupSvg(dark, { id: 'wd-o', height: 120, title: 'Ferrocast' }) + '\n') // for dark backgrounds
writeFileSync(out('logo-wordmark-light.svg'), lockupSvg(light, { id: 'wl-o', height: 120, title: 'Ferrocast' }) + '\n') // for light backgrounds

// ---------------------------------------------------------------- app icons

const TILE = ['#22252c', '#0d0e11']
/**
 * The app icon on a 1024 canvas. `grid: 'macos'` follows Apple's icon grid (an 824 body with
 * a soft shadow); `grid: 'bleed'` fills the canvas (Windows, Linux, the web manifest);
 * `grid: 'square'` is an unrounded square for iOS and maskable icons, which get cropped.
 */
function appIcon({ grid = 'macos', markScale = 0.63, small = false } = {}) {
  const body = grid === 'macos' ? 824 : 1024
  const o = (1024 - body) / 2
  const shape = grid === 'square' ? `M0 0H1024V1024H0Z` : squircle(o, o, body)
  const s = (body * markScale) / 64
  const mark = sparkShapes({ ink: '#f2f4f7', molten: dark.molten, arc: dark.arc }, { small })
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="${o}" x2="0" y2="${o + body}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${TILE[0]}"/>
      <stop offset="1" stop-color="${TILE[1]}"/>
    </linearGradient>
    <linearGradient id="edge" x1="0" y1="${o}" x2="0" y2="${o + body}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.26"/>
      <stop offset="0.5" stop-color="#ffffff" stop-opacity="0.04"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0.1"/>
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="125%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="14"/>
      <feOffset dy="10"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.35"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <path d="${shape}" fill="url(#bg)"${grid === 'macos' ? ' filter="url(#shadow)"' : ''}/>
  ${grid === 'square' ? '' : `<path d="${shape}" fill="none" stroke="url(#edge)" stroke-width="5" transform="translate(${512 * 0.006} ${512 * 0.006}) scale(0.994)"/>`}
  <g transform="translate(512 512) scale(${s.toFixed(4)}) translate(-32 -32)">${mark}</g>
</svg>
`
}

const iconMac = appIcon({ grid: 'macos' })
const iconBleed = appIcon({ grid: 'bleed' })
const iconSquare = appIcon({ grid: 'square' })
const maskable = appIcon({ grid: 'square', markScale: 0.5 })
writeFileSync(out('app-icon.svg'), iconMac)
writeFileSync(out('app-icon-bleed.svg'), iconBleed)
writeFileSync(out('png/app-icon-1024.png'), pngOf(iconMac, 1024)) // source for the macOS .icns
writeFileSync(out('png/app-icon-bleed-1024.png'), pngOf(iconBleed, 1024)) // source for .ico and Linux PNGs
writeFileSync(out('png/app-icon-512.png'), pngOf(iconMac, 512))
writeFileSync(out('png/app-icon-256.png'), pngOf(iconMac, 256))
writeFileSync(out('png/app-icon-128.png'), pngOf(iconMac, 128))
writeFileSync(out('png/maskable-512.png'), pngOf(maskable, 512))

// Small sizes of the app icon (Windows 16 to 48 px): the heavier small-size mark, larger.
const iconBleedSmall = appIcon({ grid: 'bleed', markScale: 0.86, small: true })
writeFileSync(out('app-icon-small.svg'), iconBleedSmall)
for (const size of [16, 24, 32, 48, 64]) writeFileSync(out(`png/app-icon-small-${size}.png`), pngOf(iconBleedSmall, size))

// ---------------------------------------------------------------- menu bar (tray)

// macOS template image: black + alpha only, the system tints it. The small-size mark, which
// has no split or second colour, so it reads at 18 pt.
const tray = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="4 4 56 56" width="64" height="64">${sparkMonoShapes('#000000')}</svg>\n`
writeFileSync(out('tray-template.svg'), tray)
writeFileSync(out('png/tray-template.png'), pngOf(tray, 64))

// ---------------------------------------------------------------- favicons

// The tile with the small-size mark, filling most of it (detail turns to mud at 16 px).
const favSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <path d="${squircle(0, 0, 64)}" fill="#111317"/>
  <g transform="translate(32 32) scale(0.87) translate(-32 -32)">${sparkShapes({ ink: '#f2f4f7', molten: dark.molten, arc: dark.arc }, { small: true })}</g>
</svg>
`
writeFileSync(out('favicon/favicon.svg'), favSvg)
const fav = (size) => pngOf(favSvg, size)
writeFileSync(out('favicon/favicon-16.png'), fav(16))
writeFileSync(out('favicon/favicon-32.png'), fav(32))
writeFileSync(out('favicon/favicon-48.png'), fav(48))
writeFileSync(out('favicon/apple-touch-icon.png'), pngOf(iconSquare, 180))
writeFileSync(out('favicon/icon-192.png'), pngOf(iconBleed, 192))
writeFileSync(out('favicon/icon-512.png'), pngOf(iconBleed, 512))

/** A minimal ICO container holding PNG frames (supported by every current browser). */
function ico(frames) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(frames.length, 4)
  const dir = Buffer.alloc(16 * frames.length)
  let offset = 6 + dir.length
  frames.forEach(({ size, data }, i) => {
    const o = i * 16
    dir.writeUInt8(size >= 256 ? 0 : size, o)
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1)
    dir.writeUInt8(0, o + 2)
    dir.writeUInt8(0, o + 3)
    dir.writeUInt16LE(1, o + 4)
    dir.writeUInt16LE(32, o + 6)
    dir.writeUInt32LE(data.length, o + 8)
    dir.writeUInt32LE(offset, o + 12)
    offset += data.length
  })
  return Buffer.concat([header, dir, ...frames.map((f) => f.data)])
}
writeFileSync(out('favicon/favicon.ico'), ico([16, 32, 48].map((size) => ({ size, data: fav(size) }))))

const manifest = {
  name: 'Ferrocast',
  short_name: 'Ferrocast',
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
  theme_color: '#0a0b0d',
  background_color: '#0a0b0d',
  display: 'standalone',
}
writeFileSync(out('favicon/site.webmanifest'), JSON.stringify(manifest, null, 2) + '\n')
writeFileSync(out('favicon/maskable-512.png'), pngOf(maskable, 512))

// ---------------------------------------------------------------- desktop app icon set

// Every file the Tauri app (../ferrocast/apps/desktop/icons) uses, with the same names.
// 16 to 64 px use the heavier small-size mark so it still reads.
mkdirSync(out('desktop'), { recursive: true })
const iconMacSmall = appIcon({ grid: 'macos', markScale: 0.8, small: true })
writeFileSync(out('desktop/32x32.png'), pngOf(iconBleedSmall, 32))
writeFileSync(out('desktop/64x64.png'), pngOf(iconBleedSmall, 64))
writeFileSync(out('desktop/128x128.png'), pngOf(iconBleed, 128))
writeFileSync(out('desktop/128x128@2x.png'), pngOf(iconBleed, 256))
writeFileSync(out('desktop/icon.png'), pngOf(iconBleed, 512))
writeFileSync(out('desktop/tray-template.png'), pngOf(tray, 64))
writeFileSync(
  out('desktop/icon.ico'),
  ico([
    ...[16, 24, 32, 48, 64].map((size) => ({ size, data: pngOf(iconBleedSmall, size) })),
    { size: 256, data: pngOf(iconBleed, 256) },
  ]),
)
// macOS .icns through iconutil (macOS only).
if (process.platform === 'darwin') {
  const set = join(tmpdir(), `ferrocast-${process.pid}.iconset`)
  rmSync(set, { recursive: true, force: true })
  mkdirSync(set)
  const slots = [
    ['icon_16x16.png', iconMacSmall, 16],
    ['icon_16x16@2x.png', iconMacSmall, 32],
    ['icon_32x32.png', iconMacSmall, 32],
    ['icon_32x32@2x.png', iconMac, 64],
    ['icon_128x128.png', iconMac, 128],
    ['icon_128x128@2x.png', iconMac, 256],
    ['icon_256x256.png', iconMac, 256],
    ['icon_256x256@2x.png', iconMac, 512],
    ['icon_512x512.png', iconMac, 512],
    ['icon_512x512@2x.png', iconMac, 1024],
  ]
  for (const [name, svg, size] of slots) writeFileSync(join(set, name), pngOf(svg, size))
  execFileSync('iconutil', ['-c', 'icns', '-o', out('desktop/icon.icns'), set])
  rmSync(set, { recursive: true, force: true })
} else {
  console.warn('brand: skipped desktop/icon.icns (needs macOS iconutil)')
}

// ---------------------------------------------------------------- previews

writeFileSync(out('png/logo-mark-256.png'), pngOf(sparkSvg(dark, { size: 64 }), 256))
writeFileSync(
  out('png/logo-wordmark-dark.png'),
  new Resvg(lockupSvg(dark, { id: 'wp-o', height: 120 }), {
    fitTo: { mode: 'height', value: 240 },
    background: '#0a0b0d',
  })
    .render()
    .asPng(),
)
console.log('brand: wrote mark, lockups, app icons, tray icon, favicons')
