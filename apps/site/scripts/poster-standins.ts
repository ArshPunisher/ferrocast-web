// Writes simple poster images into public/media for any video loop whose poster doesn't
// exist yet, so pages look finished before apps/video has rendered. The Remotion render
// overwrites them. Run: node scripts/poster-standins.ts
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { renderCard } from '../src/lib/card.ts'

const dir = fileURLToPath(new URL('../public/media/', import.meta.url))
mkdirSync(dir, { recursive: true })
const posters: [string, string, string][] = [
  ['hero-loop', 'Ferrocast', 'Stream tools on your PC'],
  ['alert-fires', 'Alerts', 'An alert, the moment it lands'],
  ['ban-everywhere', 'Moderation', 'One ban. Every platform.'],
  ['setup-3-clicks', 'Setup', 'Sign in, pick a look, add to OBS'],
]
for (const [name, kicker, title] of posters) {
  const file = `${dir}${name}-poster.jpg`
  if (existsSync(file)) continue
  const png = await renderCard({ kicker, title, width: 1280, height: 720 })
  writeFileSync(file, await sharp(png).jpeg({ quality: 82, mozjpeg: true }).toBuffer())
  console.log('wrote', file)
}
