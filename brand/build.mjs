// Generates every brand file from one geometry (packages/ui/src/ferro/mark.ts):
// logo mark (colour and mono), wordmark lockups, the 1024 px app icon (SVG + PNG) that the
// desktop app uses, the favicon set and the default Open Graph image.
//
//   pnpm --filter @ferrocast/brand build
//
// Text is outlined with satori so the SVGs never depend on a font being installed.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'
import sharp from 'sharp'
import { SPIKE_MARK_PATH, MARK_MAGNET } from '../packages/ui/src/ferro/mark.ts'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const out = (p) => join(here, p)
mkdirSync(out('png'), { recursive: true })
mkdirSync(out('favicon'), { recursive: true })

const COBALT = '#3461f5'
const COBALT_LIGHT = '#8eaaff'
const font = (w) =>
  readFileSync(
    require.resolve(
      `@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-${w}-normal.woff`,
    ),
  )

// ---------------------------------------------------------------- the mark

const chromeDefs = (id) => `
  <linearGradient id="${id}-chrome" x1="0" y1="10" x2="0" y2="58" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#ffffff"/>
    <stop offset="0.32" stop-color="#c3cad6"/>
    <stop offset="0.62" stop-color="#4a515d"/>
    <stop offset="0.82" stop-color="#14171c"/>
    <stop offset="1" stop-color="#2c323b"/>
  </linearGradient>
  <linearGradient id="${id}-sheen" x1="10" y1="0" x2="54" y2="0" gradientUnits="userSpaceOnUse">
    <stop offset="0.2" stop-color="#ffffff" stop-opacity="0"/>
    <stop offset="0.38" stop-color="#ffffff" stop-opacity="0.35"/>
    <stop offset="0.56" stop-color="#ffffff" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="${id}-rim" x1="0" y1="50" x2="0" y2="60" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="${COBALT}" stop-opacity="0"/>
    <stop offset="1" stop-color="${COBALT}" stop-opacity="0.55"/>
  </linearGradient>
  <clipPath id="${id}-clip"><path d="${SPIKE_MARK_PATH}"/></clipPath>`

/** The colour mark as a <g>, drawn in a 64×64 box. */
const markGroup = (id) => `
  <g>
    <path d="${SPIKE_MARK_PATH}" fill="url(#${id}-chrome)"/>
    <g clip-path="url(#${id}-clip)">
      <rect x="0" y="0" width="64" height="64" fill="url(#${id}-sheen)" opacity="0.5"/>
      <rect x="0" y="40" width="64" height="24" fill="url(#${id}-rim)"/>
    </g>
    <circle cx="${MARK_MAGNET.cx}" cy="${MARK_MAGNET.cy}" r="${MARK_MAGNET.r}" fill="${COBALT}"/>
  </g>`

const markSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Ferrocast">
  <defs>${chromeDefs('m')}</defs>${markGroup('m')}
</svg>
`
writeFileSync(out('logo-mark.svg'), markSvg)

const monoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Ferrocast">
  <path d="${SPIKE_MARK_PATH}" fill="currentColor"/>
  <circle cx="${MARK_MAGNET.cx}" cy="${MARK_MAGNET.cy}" r="${MARK_MAGNET.r}" fill="currentColor"/>
</svg>
`
writeFileSync(out('logo-mark-mono.svg'), monoSvg)

// ---------------------------------------------------------------- wordmark

async function outlinedText(text, size, weight, color, letterSpacing) {
  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          display: 'flex',
          fontFamily: 'Bricolage',
          fontSize: size,
          fontWeight: weight,
          color,
          letterSpacing,
          lineHeight: 1,
        },
        children: text,
      },
    },
    {
      width: Math.ceil(size * text.length * 0.7),
      height: Math.ceil(size * 1.25),
      fonts: [{ name: 'Bricolage', data: font(weight), weight, style: 'normal' }],
    },
  )
  const paths = [...svg.matchAll(/<path[^>]*d="([^"]+)"[^>]*\/>/g)].map((m) => m[1])
  // Measure the real ink width by rendering once.
  const png = new Resvg(svg).render()
  const raw = await sharp(png.asPng()).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true })
  return {
    d: paths.join(' '),
    width: raw.info.width + (raw.info.trimOffsetLeft ? -raw.info.trimOffsetLeft : 0),
    left: -(raw.info.trimOffsetLeft ?? 0),
  }
}

const word = await outlinedText('ferrocast', 100, 700, '#000', -3)

function wordmark(fillText, id) {
  // Mark at 0..120 (scaled 64→120), text after a 22 px gap, baseline aligned to the puddle.
  const s = 120 / 64
  const textX = 132 - word.left
  const width = Math.ceil(textX + word.left + word.width + 6)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 120" width="${width}" height="120" role="img" aria-label="Ferrocast">
  <defs>${chromeDefs(id)}</defs>
  <g transform="scale(${s})">${markGroup(id)}</g>
  <g transform="translate(${textX} 4)"><path d="${word.d}" fill="${fillText}"/></g>
</svg>
`
}
writeFileSync(out('logo-wordmark-dark.svg'), wordmark('#eef0f4', 'wd')) // for dark backgrounds
writeFileSync(out('logo-wordmark-light.svg'), wordmark('#0e1014', 'wl')) // for light backgrounds

// ---------------------------------------------------------------- app icon

function appIcon({ maskable = false } = {}) {
  const pad = maskable ? 210 : 150
  const inner = 1024 - pad * 2
  const s = inner / 64
  const radius = maskable ? 0 : 230
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1024" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#1b1f26"/>
      <stop offset="0.55" stop-color="#0c0e12"/>
      <stop offset="1" stop-color="#07080a"/>
    </linearGradient>
    <radialGradient id="glow" cx="512" cy="900" r="520" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${COBALT}" stop-opacity="0.55"/>
      <stop offset="1" stop-color="${COBALT}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="halo" cx="512" cy="${pad + MARK_MAGNET.cy * s}" r="${MARK_MAGNET.r * s * 3.2}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${COBALT_LIGHT}" stop-opacity="0.55"/>
      <stop offset="1" stop-color="${COBALT_LIGHT}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="edge" x1="0" y1="0" x2="0" y2="1024" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.22"/>
      <stop offset="0.3" stop-color="#ffffff" stop-opacity="0.04"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0.08"/>
    </linearGradient>
    ${chromeDefs('ai')}
  </defs>
  <rect width="1024" height="1024" rx="${radius}" fill="url(#bg)"/>
  <rect width="1024" height="1024" rx="${radius}" fill="url(#glow)"/>
  <circle cx="512" cy="${pad + MARK_MAGNET.cy * s}" r="${MARK_MAGNET.r * s * 3.2}" fill="url(#halo)"/>
  <g transform="translate(${pad} ${pad + 18}) scale(${s})">${markGroup('ai')}</g>
  ${maskable ? '' : `<rect x="3" y="3" width="1018" height="1018" rx="${radius - 3}" fill="none" stroke="url(#edge)" stroke-width="6"/>`}
</svg>
`
}
const iconSvg = appIcon()
writeFileSync(out('app-icon.svg'), iconSvg)
const pngOf = (svg, size) =>
  new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng()
writeFileSync(out('png/app-icon-1024.png'), pngOf(iconSvg, 1024))
writeFileSync(out('png/app-icon-512.png'), pngOf(iconSvg, 512))
writeFileSync(out('png/app-icon-256.png'), pngOf(iconSvg, 256))
writeFileSync(out('png/app-icon-128.png'), pngOf(iconSvg, 128))
const maskable = appIcon({ maskable: true })
writeFileSync(out('png/maskable-512.png'), pngOf(maskable, 512))

// ---------------------------------------------------------------- favicons

// Small sizes: a simplified, bolder mark on the dark tile (chrome detail turns to mud at 16 px).
const favSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <style>
    .tile { fill: #0c0e12 }
    .drop { fill: #e7eaf0 }
    @media (prefers-color-scheme: light) { .tile { fill: #0e1014 } }
  </style>
  <rect class="tile" width="64" height="64" rx="14"/>
  <g transform="translate(6 7) scale(0.8125)">
    <path class="drop" d="${SPIKE_MARK_PATH}"/>
    <circle cx="${MARK_MAGNET.cx}" cy="${MARK_MAGNET.cy}" r="${MARK_MAGNET.r + 0.8}" fill="${COBALT_LIGHT}"/>
  </g>
</svg>
`
writeFileSync(out('favicon/favicon.svg'), favSvg)
const fav = (size) => pngOf(favSvg, size)
writeFileSync(out('favicon/favicon-16.png'), fav(16))
writeFileSync(out('favicon/favicon-32.png'), fav(32))
writeFileSync(out('favicon/favicon-48.png'), fav(48))
writeFileSync(
  out('favicon/apple-touch-icon.png'),
  await sharp(pngOf(appIcon({ maskable: true }), 180))
    .png()
    .toBuffer(),
)
writeFileSync(out('favicon/icon-192.png'), pngOf(iconSvg, 192))
writeFileSync(out('favicon/icon-512.png'), pngOf(iconSvg, 512))

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
writeFileSync(
  out('favicon/favicon.ico'),
  ico([16, 32, 48].map((size) => ({ size, data: fav(size) }))),
)

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

// ---------------------------------------------------------------- previews

writeFileSync(out('png/logo-mark-256.png'), pngOf(markSvg, 256))
writeFileSync(
  out('png/logo-wordmark-dark.png'),
  new Resvg(wordmark('#eef0f4', 'wp'), {
    fitTo: { mode: 'height', value: 240 },
    background: '#0a0b0d',
  })
    .render()
    .asPng(),
)
console.log('brand: wrote logo, wordmarks, app icon, favicons')
