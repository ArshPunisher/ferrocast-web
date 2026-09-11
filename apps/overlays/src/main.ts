// The overlay page OBS loads: http://127.0.0.1:<port>/o/<token>/
//   ?test       ask the server for sample alerts on a loop (editor previews)
//   ?demo       run against the in-browser demo engine (development, screenshots);
//               without a token and without ?demo the page renders nothing
//   ?lowmotion  fades only (slow PCs, Linux OBS)
//   ?quiet      with ?demo: no simulated stream (tests trigger events themselves)

import './styles/index.css'
import bricolage from '@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2?url'
import hanken from '@fontsource-variable/hanken-grotesk/files/hanken-grotesk-latin-wght-normal.woff2?url'
import mono from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2?url'
import type { SocketFactory } from '@ferrocast/api/socket'
import { createOverlay } from './runtime'
import { connectOverlay, watchVisibility } from './connection'
import { warnOnce } from './dom'
import { registerDesignFonts } from './design/font-files'

function loadFonts(): void {
  // Latin only, from our own server (no font CDN: OBS may be offline, R-52).
  if (typeof FontFace !== 'function' || !document.fonts) return
  const faces = [
    new FontFace('Bricolage Grotesque Variable', `url(${bricolage}) format('woff2')`, {
      weight: '200 800',
      display: 'swap',
    }),
    new FontFace('Hanken Grotesk Variable', `url(${hanken}) format('woff2')`, {
      weight: '100 900',
      display: 'swap',
    }),
    // Alert designs and scene text may use the mono face (pixel and arcade looks).
    new FontFace('JetBrains Mono Variable', `url(${mono}) format('woff2')`, {
      weight: '100 800',
      display: 'swap',
    }),
  ]
  for (const f of faces)
    f.load()
      .then((loaded) => document.fonts.add(loaded))
      .catch(() => {
        /* system fallback is fine */
      })
}

async function boot(): Promise<void> {
  loadFonts()
  registerDesignFonts()
  const params = new URLSearchParams(location.search)
  const root = document.getElementById('overlay') ?? document.body
  const token = /\/o\/([^/]+)\/?/.exec(location.pathname)?.[1] ?? null
  const test = params.has('test')
  // The demo engine only on request (or in `vite dev`): a mistyped OBS URL must never
  // show fake alerts on a live stream.
  const demo = params.has('demo') || (import.meta.env.DEV && !token)
  if (!demo && !token) {
    warnOnce('this page needs an overlay URL from Ferrocast (…/o/<token>/)')
    return
  }

  let url: string
  let factory: SocketFactory | undefined
  if (demo) {
    // Code-split: production overlay pages never download the demo engine.
    const [{ DemoEngine, DEMO_TOKEN }, { FerroClient }, { BUILTINS }] = await Promise.all([
      import('@ferrocast/api/demo'),
      import('@ferrocast/api'),
      import('@ferrocast/designs'),
    ])
    const engine = new DemoEngine({ autoplay: !params.has('quiet'), designs: BUILTINS })
    const client = new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch })
    const overlays = await client.overlays()
    const pick = overlays.find((o) => o.id === params.get('overlay')) ?? overlays[0]
    const t = pick ? (/\/o\/([^/]+)\//.exec(pick.url)?.[1] ?? '') : ''
    url = `ws://127.0.0.1:47820/o/${t}/ws${test ? '?test' : ''}`
    factory = engine.socket
    ;(window as unknown as { __ferroDemo?: unknown }).__ferroDemo = {
      engine,
      client,
      overlay: pick,
    }
  } else {
    const ws = location.protocol === 'https:' ? 'wss:' : 'ws:'
    url = `${ws}//${location.host}/o/${token ?? ''}/ws${test ? '?test' : ''}`
  }

  let send: (d: string) => boolean = () => false
  const runtime = createOverlay(root, {
    send: (d) => void send(d),
    audio: true,
    lowMotion: params.has('lowmotion'),
  })
  const conn = connectOverlay(runtime, { url, ...(factory ? { factory } : {}) }, (s) => {
    send = s
  })
  watchVisibility((v) => conn.setVisible(v))
  document.documentElement.dataset.ready = '1'
}

void boot()
