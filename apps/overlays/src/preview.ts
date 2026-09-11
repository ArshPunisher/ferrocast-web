// Development preview of the built-in designs (not part of the OBS bundle): every theme
// scene, alert look and widget design drawn by the real renderer with sample state, for
// contact sheets and for checking a new design. Run `pnpm --filter @ferrocast/overlays dev`
// and open /preview.html?sheet=themes (or alerts, alert&id=…, widgets, scenes, theme&id=…,
// scene&id=…&key=…). The page sets html[data-ready="1"] when everything has drawn.

import './styles/index.css'
import bricolage from '@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2?url'
import hanken from '@fontsource-variable/hanken-grotesk/files/hanken-grotesk-latin-wght-normal.woff2?url'
import mono from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2?url'
import {
  EVENT_KEYS,
  EVENT_LABEL,
  anySample,
  namedActor,
  previewAlert,
  type Design,
  type EventKey,
  type FerroEvent,
  type Overlay,
  type Scene,
  type Widget,
} from '@ferrocast/api'
import { BUILTINS } from '@ferrocast/designs'
import { createOverlay } from './runtime'
import { buildDesignAlert } from './design/alert'
import { registerDesignFonts } from './design/font-files'

const q = new URLSearchParams(location.search)
const main = document.getElementById('preview') as HTMLElement
const low = q.has('lowmotion')

function fonts(): void {
  for (const [family, url, weight] of [
    ['Bricolage Grotesque Variable', bricolage, '200 800'],
    ['Hanken Grotesk Variable', hanken, '100 900'],
    ['JetBrains Mono Variable', mono, '100 800'],
  ] as const)
    document.fonts.add(new FontFace(family, `url(${url}) format('woff2')`, { weight }))
  registerDesignFonts()
}

const LABELS: Record<string, string> = {
  latest_follower: 'NeelaMoth',
  latest_sub: 'rohanbuilds',
  latest_tip: 'Kavya_Plays ₹750',
  top_tip_session: 'MeeraDraws ₹2,500',
  session_follows: '41',
  session_subs: '7',
}

function events(): FerroEvent[] {
  const out: FerroEvent[] = []
  for (const [i, k] of (
    ['follow', 'tip', 'subscription', 'raid', 'gift_batch'] as const
  ).entries()) {
    const e = anySample(k, Date.now() - i * 60_000)
    if (e) out.push({ ...e, id: `s-${k}`, origin: 'live' })
  }
  return out
}

function chat(): FerroEvent[] {
  const lines: [string, string, string][] = [
    ['Tarun.exe', 'that clutch was unreal', '#ff7a59'],
    ['pixel_paratha', 'hi from Pune!', '#7ad7ff'],
    ['ishq_fps', 'what keyboard is that?', '#b18cff'],
    ['NeelaMoth', 'GG everyone', '#5be39a'],
    ['MeeraDraws', 'lurking with chai, as always', '#ffd23f'],
    ['rohanbuilds', 'the new overlay looks so clean', '#ff8bd1'],
  ]
  return lines.map(([name, text, color], i) => ({
    id: `chat-${i}`,
    seq: i,
    platform: i % 3 === 1 ? 'youtube' : 'twitch',
    channel: null,
    source_id: `c${i}`,
    occurred_at: 0,
    received_at: 0,
    origin: 'live',
    kind: {
      type: 'chat_message',
      actor: { ...namedActor('twitch', name), id: `c${i}`, color },
      content: { text, fragments: [{ type: 'text', text }] },
      reply_to: null,
      is_action: false,
    },
  })) as FerroEvent[]
}

const backdrop = (light = false) =>
  light
    ? 'linear-gradient(180deg,#9fd3ff 0%,#d9f0ff 45%,#8fbf6a 46%,#5d8f3f 100%)'
    : 'radial-gradient(circle at 70% 30%,#41506e,transparent 55%),radial-gradient(circle at 20% 80%,#5a3a2a,transparent 50%),linear-gradient(160deg,#1d2433,#0e1118 60%,#151a12)'

function box(w: number, h: number, label?: string): HTMLElement {
  const fig = document.createElement('figure')
  fig.style.cssText = `margin:0;display:flex;flex-direction:column;gap:6px;width:${w}px`
  const stage = document.createElement('div')
  stage.style.cssText = `position:relative;width:${w}px;height:${h}px;overflow:hidden;border-radius:6px;background:${backdrop(q.has('light'))}`
  fig.appendChild(stage)
  if (label) {
    const cap = document.createElement('figcaption')
    cap.textContent = label
    cap.style.cssText =
      'font-size:13px;color:#aab1bd;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'
    fig.appendChild(cap)
  }
  return fig
}

/** One scene drawn into a box, scaled to fit. */
function drawScene(scene: Scene, w: number, label: string, branded = true): HTMLElement {
  const h = Math.round((w * scene.height) / scene.width)
  const fig = box(w, h, label)
  const stage = fig.firstElementChild as HTMLElement
  const k = w / scene.width
  // A grey "camera" behind webcam frames, so the frame reads like it will on stream.
  for (const l of scene.layers)
    if (l.kind === 'layer' && l.config.type === 'webcam') {
      const cam = document.createElement('div')
      cam.style.cssText = `position:absolute;left:${l.x * k}px;top:${l.y * k}px;width:${l.w * k}px;height:${l.h * k}px;background:radial-gradient(circle at 50% 38%,#9aa3b0 0 14%,transparent 15%),radial-gradient(ellipse at 50% 100%,#7d8694 0 38%,transparent 39%),#3a414d;border-radius:${Math.min(l.w, l.h) * k * 0.04}px`
      stage.appendChild(cam)
    }
  const root = document.createElement('div')
  root.style.cssText = 'position:absolute;inset:0'
  stage.appendChild(root)
  const rt = createOverlay(root, { audio: false, fit: 'contain', lowMotion: low })
  const overlay: Overlay = {
    id: `p-${label}`,
    name: scene.name,
    url: '',
    width: scene.width,
    height: scene.height,
    widgets: scene.layers,
    updated_at: 0,
    design: { id: 'preview', scene: scene.key, branded },
  } as Overlay
  const labels = Object.fromEntries(
    scene.layers.flatMap((l: Widget) =>
      l.kind === 'label'
        ? [
            [
              l.id,
              l.config.template.replace(
                /\{(value|name)\}/g,
                LABELS[l.config.source] ?? 'NeelaMoth',
              ),
            ],
          ]
        : [],
    ),
  )
  rt.apply({
    v: 1,
    seq: 1,
    type: 'snapshot',
    data: {
      overlay,
      state: {
        goals: [
          {
            id: 'g',
            title: 'New mic',
            kind: 'subs',
            target: 50,
            currency: null,
            starts_at: 0,
            ends_at: null,
            current: 32,
          },
        ],
        labels,
        viewers: { twitch: 412, youtube: 188 },
        events: events(),
        chat: chat(),
      },
    },
  } as never)
  return fig
}

function widgetScene(d: Extract<Design, { kind: 'widget' }>): Scene {
  const pad = 40
  return {
    key: 'custom_1',
    name: d.name,
    width: Math.max(320, d.content.w + pad * 2),
    height: Math.max(180, d.content.h + pad * 2),
    background: null,
    layers: [
      {
        id: 'w',
        kind: d.content.widget,
        x: pad,
        y: pad,
        w: d.content.w,
        h: d.content.h,
        config: { ...d.content.config, style: d.content.style, design_id: d.id, branded: true },
      } as Widget,
    ],
  }
}

function drawAlert(d: Design, key: EventKey, w: number, label: string): HTMLElement {
  const h = Math.round((w * 450) / 800)
  const fig = box(w, h, label)
  const stage = fig.firstElementChild as HTMLElement
  const a = previewAlert(d, key, { id: `${d.id}-${key}`, longName: q.has('long') })
  if (!a) return fig
  const shell = document.createElement('div')
  shell.className = 'fc-ov'
  shell.style.cssText = 'position:absolute;inset:0'
  stage.appendChild(shell)
  const alert = buildDesignAlert(a, { lowMotion: low })
  alert.host.style.cssText = 'position:absolute;inset:0'
  shell.appendChild(alert.host)
  requestAnimationFrame(() => alert.start())
  return fig
}

function grid(cols: number, gap = 18): HTMLElement {
  const g = document.createElement('div')
  g.style.cssText = `display:grid;grid-template-columns:repeat(${cols},max-content);gap:${gap}px;padding:${gap}px`
  main.appendChild(g)
  return g
}

function heading(text: string): void {
  const h = document.createElement('h2')
  h.textContent = text
  h.style.cssText = 'margin:18px 18px 0;font-size:18px;font-weight:700'
  main.appendChild(h)
}

const of = <K extends Design['kind']>(k: K) =>
  BUILTINS.filter((d): d is Extract<Design, { kind: K }> => d.kind === k)
const only = q.get('only')?.split(',') ?? null
const pick = <T extends Design>(ds: T[]) =>
  only ? ds.filter((d) => only.some((o) => d.id.includes(o))) : ds

function render(): void {
  const sheet = q.get('sheet') ?? 'themes'
  const id = q.get('id')
  const d = id ? BUILTINS.find((x) => x.id === id) : undefined
  if (sheet === 'themes') {
    const g = grid(5, 14)
    for (const t of pick(of('theme')))
      for (const s of t.content.scenes)
        g.appendChild(drawScene(s, 384, `${t.name} · ${s.name}${t.pro ? ' · Pro' : ''}`))
  } else if (sheet === 'theme' && d?.kind === 'theme') {
    const g = grid(2)
    for (const s of d.content.scenes) g.appendChild(drawScene(s, 940, `${d.name} · ${s.name}`))
  } else if (sheet === 'scene' && d && (d.kind === 'theme' || d.kind === 'scene')) {
    const s = d.kind === 'theme' ? d.content.scenes.find((x) => x.key === q.get('key')) : d.content
    if (s) main.appendChild(drawScene(s, s.width, `${d.name} · ${s.name}`))
  } else if (sheet === 'alerts') {
    const key = (q.get('event') ?? 'tip') as EventKey
    const g = grid(4)
    for (const a of pick(of('alert')))
      g.appendChild(drawAlert(a, key, 440, `${a.name}${a.pro ? ' · Pro' : ''}`))
  } else if (sheet === 'alert' && d?.kind === 'alert') {
    const g = grid(4)
    for (const k of EVENT_KEYS) g.appendChild(drawAlert(d, k, 440, `${d.name} · ${EVENT_LABEL[k]}`))
  } else if (sheet === 'widgets') {
    heading('Widget designs')
    const g = grid(4)
    for (const w of pick(of('widget'))) {
      const s = widgetScene(w)
      g.appendChild(
        drawScene(
          s,
          Math.min(440, s.width),
          `${w.name} · ${w.content.widget}${w.pro ? ' · Pro' : ''}`,
        ),
      )
    }
  } else if (sheet === 'scenes') {
    const g = grid(3)
    for (const s of pick(of('scene')))
      g.appendChild(
        drawScene(s.content, Math.min(560, s.content.width), `${s.name}${s.pro ? ' · Pro' : ''}`),
      )
  }
  const wait = Number(q.get('wait') ?? 1600)
  void document.fonts.ready.then(() =>
    setTimeout(() => {
      document.documentElement.dataset.ready = '1'
    }, wait),
  )
}

fonts()
render()
