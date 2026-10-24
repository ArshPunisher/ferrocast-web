// Renders the built-in alert sounds (recipes.js) into small MP3 files the overlay, the
// dashboard and OBS all play the same way. Run after changing a recipe:
//   node apps/overlays/sounds/render.mjs
//   node apps/overlays/sounds/render.mjs --screen   (the sound element's, screen-recipes.js)
// Needs Playwright's Chromium (pnpm exec playwright install chromium) and ffmpeg on PATH.
// Each file is peak-limited to -1 dBFS; the script prints every sound's length and peak.

import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const SCREEN = process.argv.includes('--screen')
const out = join(here, SCREEN ? '../src/design/sounds/screen' : '../src/design/sounds')
const SCREEN_IDS = [
  'whoosh',
  'riser',
  'impact',
  'tick',
  'chime',
  'glitch',
  'rain',
  'wind',
  'pad',
  'hum',
]
const ALERT_IDS = [
  'sparkle',
  'glint',
  'cascade',
  'bloom',
  'lift',
  'tally',
  'halo',
  'droplet',
  'kalimba',
  'marimba',
  'glow',
  'ember',
  'pebble',
  'feather',
  'hearth',
  'wink',
  'sparkle_classic',
]
const IDS = SCREEN ? SCREEN_IDS : ALERT_IDS

/** 16-bit stereo WAV from two float channels. */
function wav(sr, l, r, scale) {
  const n = l.length
  const b = Buffer.alloc(44 + n * 4)
  b.write('RIFF', 0)
  b.writeUInt32LE(36 + n * 4, 4)
  b.write('WAVE', 8)
  b.write('fmt ', 12)
  b.writeUInt32LE(16, 16)
  b.writeUInt16LE(1, 20)
  b.writeUInt16LE(2, 22)
  b.writeUInt32LE(sr, 24)
  b.writeUInt32LE(sr * 4, 28)
  b.writeUInt16LE(4, 32)
  b.writeUInt16LE(16, 34)
  b.write('data', 36)
  b.writeUInt32LE(n * 4, 40)
  const q = (v) => Math.max(-32768, Math.min(32767, Math.round(v * scale * 32767)))
  for (let i = 0; i < n; i++) {
    b.writeInt16LE(q(l[i]), 44 + i * 4)
    b.writeInt16LE(q(r[i]), 46 + i * 4)
  }
  return b
}

/** Drops the silent tail (below -60 dBFS), keeping a 60 ms fade so nothing clicks. */
function trimTail(l, r, sr) {
  let end = l.length
  while (end > 0 && Math.abs(l[end - 1]) < 0.001 && Math.abs(r[end - 1]) < 0.001) end--
  end = Math.min(l.length, end + Math.round(sr * 0.06))
  return [l.slice(0, end), r.slice(0, end)]
}

const browser = await chromium.launch(
  process.env.FC_CHROME_CHANNEL ? { channel: process.env.FC_CHROME_CHANNEL } : {},
)
const page = await browser.newPage()
await page.setContent('<!doctype html><title>render</title>')
await page.addScriptTag({
  content: readFileSync(join(here, SCREEN ? 'screen-recipes.js' : 'recipes.js'), 'utf8'),
})
mkdirSync(out, { recursive: true })
const tmp = mkdtempSync(join(tmpdir(), 'fc-sounds-'))
const lengths = {}
try {
  for (const id of IDS) {
    const r = await page.evaluate((x) => window.FC_RENDER(x), id)
    // A loop keeps its exact length, so it repeats without a gap.
    const [l, rr] = r.loop ? [r.left, r.right] : trimTail(r.left, r.right, r.sr)
    let peak = 0
    for (let i = 0; i < l.length; i++) peak = Math.max(peak, Math.abs(l[i]), Math.abs(rr[i]))
    const ceiling = 0.891 // -1 dBFS
    // Screen sounds are brought to one loudness: stingers near the ceiling, loops (a bed
    // behind the screen) well under it, so a volume slider means the same on each.
    const target = SCREEN ? (r.loop ? 0.45 : 0.85) : null
    const scale = target ? target / peak : peak > ceiling ? ceiling / peak : 1
    const w = join(tmp, `${id}.wav`)
    writeFileSync(w, wav(r.sr, l, rr, scale))
    const mp3 = join(out, `${id}.mp3`)
    // 48 kHz joint stereo VBR around 96 kbps, no ID3 tags (nothing personal in the file).
    execFileSync('ffmpeg', [
      '-y',
      '-loglevel',
      'error',
      '-i',
      w,
      '-codec:a',
      'libmp3lame',
      '-q:a',
      '4',
      '-map_metadata',
      '-1',
      '-id3v2_version',
      '0',
      '-write_xing',
      '1',
      mp3,
    ])
    lengths[id] = Math.round((l.length / r.sr) * 1000)
    process.stdout.write(
      `${id.padEnd(16)} ${String(lengths[id]).padStart(5)} ms  peak ${peak.toFixed(3)}${scale < 1 ? ' (limited)' : scale > 1 ? ' (raised)' : ''}  ${(statSync(mp3).size / 1024).toFixed(1)} KB\n`,
    )
  }
} finally {
  await browser.close()
  rmSync(tmp, { recursive: true, force: true })
}
process.stdout.write(
  `\nLengths for ${SCREEN ? 'screen-sounds.ts' : 'sounds.ts'}:\n${JSON.stringify(lengths)}\n`,
)
