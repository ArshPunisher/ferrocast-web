// Renders every promo loop into the website's public folder:
//   apps/site/public/media/<slug>.webm, <slug>.mp4, <slug>-poster.jpg
//
//   pnpm --filter @ferrocast/video render              all of them
//   pnpm --filter @ferrocast/video render hero-loop    one (by slug)
//   pnpm --filter @ferrocast/video render -- --posters    posters only
//   RENDER_GL=swangle pnpm --filter @ferrocast/video render   other WebGL backend
import { mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { bundle } from '@remotion/bundler'
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const out = join(root, '../site/public/media')
mkdirSync(out, { recursive: true })

execFileSync('node', [join(here, 'fonts.mjs')], { stdio: 'inherit' })

/** slug → composition, poster frame, optional scale (renders smaller than the composition). */
const JOBS = [
  { slug: 'hero-loop', id: 'HeroLoop', poster: 60, scale: 1 },
  { slug: 'alert-fires', id: 'AlertFires', poster: 70, scale: 1 },
  { slug: 'ban-everywhere', id: 'BanEverywhere', poster: 128, scale: 1 },
  { slug: 'setup-3-clicks', id: 'SetupThreeClicks', poster: 290, scale: 1 },
  { slug: 'setup-3-clicks-portrait', id: 'SetupThreeClicksPortrait', poster: 290, scale: 1 },
]

const args = process.argv.slice(2)
const postersOnly = args.includes('--posters')
const only = args.filter((a) => !a.startsWith('--'))
const jobs = only.length ? JOBS.filter((j) => only.includes(j.slug)) : JOBS
const gl = process.env.RENDER_GL ?? 'angle'
const chromiumOptions = { gl }

console.log('bundling…')
const serveUrl = await bundle({
  entryPoint: join(root, 'src/index.ts'),
  publicDir: join(root, 'public'),
})

const kb = (p) => `${Math.round(statSync(p).size / 1024)} KB`

for (const job of jobs) {
  const composition = await selectComposition({ serveUrl, id: job.id, chromiumOptions })
  const common = {
    composition,
    serveUrl,
    chromiumOptions,
    scale: job.scale,
    muted: true,
    concurrency: 4,
  }

  const poster = join(out, `${job.slug}-poster.jpg`)
  await renderStill({
    composition,
    serveUrl,
    chromiumOptions,
    scale: job.scale,
    output: poster,
    frame: job.poster,
    imageFormat: 'jpeg',
    jpegQuality: 82,
  })
  console.log(`${job.slug}: poster ${kb(poster)}`)
  if (postersOnly) continue

  const webm = join(out, `${job.slug}.webm`)
  await renderMedia({ ...common, codec: 'vp9', crf: 36, outputLocation: webm, overwrite: true })
  console.log(`${job.slug}: webm ${kb(webm)}`)

  const mp4 = join(out, `${job.slug}.mp4`)
  await renderMedia({
    ...common,
    codec: 'h264',
    crf: 25,
    pixelFormat: 'yuv420p',
    x264Preset: 'slow',
    outputLocation: mp4,
    overwrite: true,
  })
  console.log(`${job.slug}: mp4 ${kb(mp4)}`)
}
console.log('done')
