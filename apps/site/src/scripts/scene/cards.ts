// Stream cards painted on 2D canvases (alerts, chat, tips, goals, OBS frames...). They
// become textures for the floating 3D cards. Everything is sample data, drawn in the brand
// fonts, with Phosphor icons and the platform glyphs from @ferrocast/ui.
import { ICON_PATHS } from '@ferrocast/ui/platform-icons'
import { SPARK } from '@ferrocast/ui/brand'
import coinsSvg from '@phosphor-icons/core/assets/fill/coins-fill.svg?raw'
import heartSvg from '@phosphor-icons/core/assets/fill/heart-fill.svg?raw'
import starSvg from '@phosphor-icons/core/assets/fill/star-fill.svg?raw'
import usersSvg from '@phosphor-icons/core/assets/fill/users-fill.svg?raw'
import chatSvg from '@phosphor-icons/core/assets/fill/chat-circle-fill.svg?raw'
import boltSvg from '@phosphor-icons/core/assets/fill/lightning-fill.svg?raw'
import shieldSvg from '@phosphor-icons/core/assets/fill/shield-check-fill.svg?raw'

export type Theme = 'dark' | 'light'
export type Platform = 'twitch' | 'youtube' | 'kick'
const DARK_PAL = {
    bg: '#0a0b0d', surface: '#16191e', surface2: '#21252c', line: 'rgba(255,255,255,0.09)',
    text: '#eef0f4', text2: '#b3b9c4', text3: '#8a919d', arc: '#33d4ff', onArc: '#06141b',
    molten: '#ffa424', moltenText: '#ffb54d', ink: '#eef0f3', onInk: '#0a0b0d',
    twitch: '#a970ff', youtube: '#ff4e5f', kick: '#53fc18', shadow: 'rgba(0,0,0,0.55)', guide: '#4c5566',
}
type Pal = { [K in keyof typeof DARK_PAL]: string }
export const PAL: Record<Theme, Pal> = {
  dark: DARK_PAL,
  light: {
    bg: '#f2f3f6', surface: '#ffffff', surface2: '#eef0f3', line: 'rgba(14,16,20,0.09)',
    text: '#0e1014', text2: '#424854', text3: '#5f6672', arc: '#0888b8', onArc: '#ffffff',
    molten: '#cf7400', moltenText: '#a35b00', ink: '#111317', onInk: '#f2f3f6',
    twitch: '#7a2ee6', youtube: '#d8102c', kick: '#13843a', shadow: 'rgba(40,46,60,0.2)', guide: '#a7adb8',
  },
}

const PH: Record<string, string> = {
  coins: coinsSvg, heart: heartSvg, star: starSvg, users: usersSvg, chat: chatSvg, bolt: boltSvg, shield: shieldSvg,
}
const iconCache = new Map<string, Path2D[]>()
const iconPaths = (n: string) => {
  let p = iconCache.get(n)
  if (!p) {
    p = [...(PH[n] ?? '').matchAll(/ d="([^"]+)"/g)].map((m) => new Path2D(m[1]))
    iconCache.set(n, p)
  }
  return p
}
const glyphCache = new Map<string, Path2D>()
const glyphPath = (n: Platform) => {
  let p = glyphCache.get(n)
  if (!p) glyphCache.set(n, (p = new Path2D(ICON_PATHS[n])))
  return p
}

export const FONTS = {
  d: "'Bricolage Grotesque Variable'",
  b: "'Hanken Grotesk Variable'",
  m: "'JetBrains Mono Variable'",
}
const SCALE = 2
export const MARGIN = 26

type G = CanvasRenderingContext2D
export interface Painted { c: HTMLCanvasElement; w: number; h: number }

function surface(w: number, h: number): Painted & { g: G } {
  const c = document.createElement('canvas')
  c.width = Math.ceil((w + 2 * MARGIN) * SCALE)
  c.height = Math.ceil((h + 2 * MARGIN) * SCALE)
  const g = c.getContext('2d') as G
  g.scale(SCALE, SCALE)
  g.translate(MARGIN, MARGIN)
  return { c, g, w, h }
}
const font = (g: G, weight: number, size: number, f: keyof typeof FONTS = 'b') => {
  g.font = `${weight} ${size}px ${FONTS[f]}`
}
function panel(g: G, w: number, h: number, r: number, p: Pal) {
  g.save()
  g.shadowColor = p.shadow
  g.shadowBlur = 24
  g.shadowOffsetY = 10
  g.fillStyle = p.surface
  g.beginPath()
  g.roundRect(0, 0, w, h, r)
  g.fill()
  g.restore()
  g.strokeStyle = p.line
  g.lineWidth = 1
  g.beginPath()
  g.roundRect(0.5, 0.5, w - 1, h - 1, r - 0.5)
  g.stroke()
}
function glyph(g: G, n: Platform, x: number, y: number, size: number, color: string) {
  g.save()
  g.translate(x, y)
  g.scale(size / 24, size / 24)
  g.fillStyle = color
  g.fill(glyphPath(n))
  g.restore()
}
function icon(g: G, n: string, x: number, y: number, size: number, color: string) {
  g.save()
  g.translate(x, y)
  g.scale(size / 256, size / 256)
  g.fillStyle = color
  for (const p of iconPaths(n)) g.fill(p)
  g.restore()
}
function wrap(g: G, text: string, maxW: number) {
  const lines: string[] = []
  let cur = ''
  for (const wd of text.split(' ')) {
    const t = cur ? `${cur} ${wd}` : wd
    if (g.measureText(t).width > maxW && cur) {
      lines.push(cur)
      cur = wd
    } else cur = t
  }
  if (cur) lines.push(cur)
  return lines
}
/** The Spark mark (f + split shard) from @ferrocast/ui/brand. `size` is the 64-unit box in px. */
export function drawMark(g: G, x: number, y: number, size: number, p: Pal) {
  g.save()
  g.translate(x, y)
  g.scale(size / 64, size / 64)
  g.fillStyle = p.ink as string
  g.fill(new Path2D(SPARK.f))
  g.fillStyle = p.molten as string
  g.fill(new Path2D(SPARK.boltTop))
  g.fillStyle = p.arc as string
  g.fill(new Path2D(SPARK.boltBottom))
  g.restore()
}

/* ---------------- the deck (sample data) ---------------- */
interface Alert { ico: string; t: string; amt?: string; m: string; src: Platform | 'tip' }
interface Chat { p: Platform; n: string; m: string }
const ALERTS: Alert[] = [
  { ico: 'coins', t: 'Asha tipped', amt: '₹500', m: 'Chai is on me. Great stream!', src: 'tip' },
  { ico: 'heart', t: 'NovaRiver followed', m: 'Welcome to the channel', src: 'twitch' },
  { ico: 'star', t: 'kestrel_92 subscribed', m: '12 months. Still here.', src: 'twitch' },
  { ico: 'users', t: 'Raid from mossbyte', m: '38 viewers are on their way', src: 'kick' },
  { ico: 'chat', t: 'Super Chat from Ira M.', amt: '₹200', m: 'Play the boss fight again', src: 'youtube' },
  { ico: 'star', t: 'lumen_fox became a member', m: 'Tier 1 on YouTube', src: 'youtube' },
  { ico: 'bolt', t: 'pixelmonk cheered', amt: '500 bits', m: 'that clutch was unreal', src: 'twitch' },
  { ico: 'heart', t: 'drift0r subscribed', m: 'First sub on Kick', src: 'kick' },
]
const CHATS: Chat[] = [
  { p: 'twitch', n: 'pixelmonk', m: 'that clutch was unreal' },
  { p: 'youtube', n: 'Rhea S', m: 'first time here, the overlay looks so clean' },
  { p: 'kick', n: 'drift0r', m: 'GG, same time tomorrow?' },
  { p: 'twitch', n: 'saltwaterjay', m: 'which mic is that?' },
  { p: 'youtube', n: 'Karan V', m: 'audio is perfect now' },
  { p: 'kick', n: 'ottermode', m: 'raid incoming, hold on' },
  { p: 'twitch', n: 'nightjar_ttv', m: 'LETS GO' },
  { p: 'youtube', n: 'Mei Tan', m: 'watching from Pune' },
  { p: 'kick', n: 'brassfox', m: 'the new alerts look great' },
  { p: 'twitch', n: 'quietlynx', m: 'can you show the settings?' },
]
const TIPS = [{ name: 'Asha', amt: '₹500' }, { name: 'Rohan', amt: '₹200' }, { name: 'Mei', amt: '₹100' }]
const GOALS = [
  { label: 'New mic', val: '₹3,200 / ₹5,000', pct: 0.64 },
  { label: 'Sub goal', val: '122 / 150', pct: 0.81 },
  { label: 'Charity stream', val: '₹18,400 / ₹25,000', pct: 0.74 },
]
const OBS: { p: Platform; alert: string; viewers: string }[] = [
  { p: 'twitch', alert: 'NovaRiver followed', viewers: '1,284 watching' },
  { p: 'youtube', alert: 'Ira M. sent ₹200', viewers: '846 watching' },
  { p: 'kick', alert: 'Raid from mossbyte', viewers: '412 watching' },
]
const MODS = [{ a: 'Spam link removed in', b: 'all 3 chats' }, { a: 'b0t_8812 banned on', b: 'Twitch, YouTube and Kick' }]
const STATS: { label: string; val: string; p: Platform }[] = [
  { label: 'Followers', val: '12,408', p: 'twitch' },
  { label: 'Subscribers', val: '3,912', p: 'youtube' },
  { label: 'Followers', val: '2,177', p: 'kick' },
]
const LOG: [Platform, string, string, string, boolean?][] = [
  ['twitch', 'Follow', 'NovaRiver', 'Played'],
  ['kick', 'Raid', 'mossbyte', 'Played'],
  ['twitch', 'Follow', 'b0t_8812', 'Held: new account', true],
]

export type Kind = 'alert' | 'chat' | 'tip' | 'goal' | 'obs' | 'mod' | 'log' | 'download' | 'stat'

/* ---------------- painters ---------------- */
const PAINT: Record<Kind, (i: number, p: Pal) => Painted> = {
  alert(i, p) {
    const d = ALERTS[i % ALERTS.length] as Alert
    const s = surface(340, 86), g = s.g
    panel(g, 340, 86, 16, p)
    g.fillStyle = p.arc
    g.beginPath(); g.roundRect(16, 19, 48, 48, 12); g.fill()
    icon(g, d.ico, 28, 31, 24, p.onArc)
    font(g, 600, 18, 'd'); g.fillStyle = p.text; g.fillText(d.t, 78, 40)
    if (d.amt) {
      const wT = g.measureText(`${d.t} `).width
      font(g, 700, 18, 'd'); g.fillStyle = p.moltenText; g.fillText(d.amt, 78 + wT, 40)
    }
    font(g, 400, 14); g.fillStyle = p.text2; g.fillText(d.m, 78, 62)
    if (d.src === 'tip') {
      font(g, 600, 11)
      const tw = g.measureText('Tip page').width
      g.strokeStyle = p.line; g.beginPath(); g.roundRect(340 - 22 - tw - 14, 13, tw + 14, 20, 10); g.stroke()
      g.fillStyle = p.text3; g.fillText('Tip page', 340 - 22 - tw - 7, 27)
    } else glyph(g, d.src, 340 - 32, 14, 16, p[d.src] as string)
    return s
  },
  chat(i, p) {
    const d = CHATS[i % CHATS.length] as Chat
    const probe = surface(1, 1).g
    font(probe, 400, 14.5)
    const lines = wrap(probe, d.m, 250)
    const lw = Math.max(...lines.map((l) => probe.measureText(l).width))
    font(probe, 600, 14)
    const nw = probe.measureText(d.n).width + 38
    const w = Math.ceil(Math.min(300, Math.max(nw, lw) + 30)), h = 44 + lines.length * 20
    const s = surface(w, h), g = s.g
    panel(g, w, h, 16, p)
    glyph(g, d.p, 15, 13, 16, p[d.p] as string)
    font(g, 600, 14); g.fillStyle = p[d.p] as string; g.fillText(d.n, 38, 26)
    font(g, 400, 14.5); g.fillStyle = p.text as string
    lines.forEach((l, k) => g.fillText(l, 15, 50 + k * 20))
    return s
  },
  tip(i, p) {
    const d = TIPS[i % TIPS.length] as (typeof TIPS)[number]
    const w = 252, h = 292, s = surface(w, h), g = s.g
    panel(g, w, h, 18, p)
    g.fillStyle = p.surface2 as string; g.beginPath(); g.arc(36, 38, 18, 0, 7); g.fill()
    font(g, 700, 16, 'd'); g.fillStyle = p.text as string; g.textAlign = 'center'; g.fillText(d.name.charAt(0), 36, 44); g.textAlign = 'left'
    font(g, 600, 16); g.fillText(d.name, 64, 34)
    font(g, 400, 12.5); g.fillStyle = p.text3 as string; g.fillText('Tip page', 64, 52)
    font(g, 700, 46, 'd'); g.fillStyle = p.text as string; g.fillText(d.amt, 18, 128)
    let x = 18
    font(g, 600, 13)
    for (const c of ['₹100', '₹200', '₹500']) {
      const cw = g.measureText(c).width + 22, on = c === d.amt
      g.beginPath(); g.roundRect(x, 148, cw, 30, 15)
      if (on) { g.fillStyle = p.arc as string; g.fill(); g.fillStyle = p.onArc as string }
      else { g.strokeStyle = p.line as string; g.lineWidth = 1.2; g.stroke(); g.fillStyle = p.text2 as string }
      g.fillText(c, x + 11, 168)
      x += cw + 8
    }
    g.fillStyle = p.ink as string; g.beginPath(); g.roundRect(18, 196, w - 36, 44, 10); g.fill()
    font(g, 600, 15); g.fillStyle = p.onInk as string; g.textAlign = 'center'; g.fillText('Send tip', w / 2, 223)
    font(g, 500, 12.5); g.fillStyle = p.moltenText as string; g.fillText(`100% goes to ${d.name}`, w / 2, 268); g.textAlign = 'left'
    return s
  },
  goal(i, p) {
    const d = GOALS[i % GOALS.length] as (typeof GOALS)[number]
    const w = 320, h = 100, s = surface(w, h), g = s.g
    panel(g, w, h, 16, p)
    font(g, 500, 10.5, 'm'); g.fillStyle = p.text3 as string; g.fillText('GOAL', 18, 28)
    font(g, 600, 17, 'd'); g.fillStyle = p.text as string; g.fillText(d.label, 18, 52)
    font(g, 500, 12.5, 'm'); g.fillStyle = p.text2 as string; g.textAlign = 'right'; g.fillText(d.val, w - 18, 52); g.textAlign = 'left'
    g.fillStyle = p.surface2 as string; g.beginPath(); g.roundRect(18, 68, w - 36, 10, 5); g.fill()
    g.fillStyle = p.molten as string; g.beginPath(); g.roundRect(18, 68, (w - 36) * d.pct, 10, 5); g.fill()
    return s
  },
  obs(i, p) {
    const d = OBS[i % OBS.length] as (typeof OBS)[number]
    const w = 400, h = 225, s = surface(w, h), g = s.g
    const ph = PAL.dark[d.p] as string
    g.save(); g.shadowColor = p.shadow as string; g.shadowBlur = 30; g.shadowOffsetY = 12
    g.fillStyle = '#0c0f16'; g.beginPath(); g.roundRect(0, 0, w, h, 14); g.fill(); g.restore()
    g.save(); g.beginPath(); g.roundRect(0, 0, w, h, 14); g.clip()
    const sky = g.createLinearGradient(0, 0, 0, h)
    sky.addColorStop(0, '#1c2338'); sky.addColorStop(0.62, '#2a2440'); sky.addColorStop(1, '#0b0e15')
    g.fillStyle = sky; g.fillRect(0, 0, w, h)
    g.globalAlpha = 0.5; g.fillStyle = ph; g.beginPath(); g.arc(w * 0.66, h * 0.5, h * 0.17, 0, 7); g.fill(); g.globalAlpha = 1
    g.fillStyle = '#151a28'; g.beginPath(); g.moveTo(0, h * 0.66); g.lineTo(w * 0.2, h * 0.46); g.lineTo(w * 0.38, h * 0.62); g.lineTo(w * 0.56, h * 0.4); g.lineTo(w * 0.8, h * 0.64); g.lineTo(w, h * 0.5); g.lineTo(w, h); g.lineTo(0, h); g.fill()
    g.fillStyle = '#0a0d14'; g.beginPath(); g.moveTo(0, h * 0.8); g.lineTo(w * 0.3, h * 0.7); g.lineTo(w * 0.62, h * 0.82); g.lineTo(w, h * 0.72); g.lineTo(w, h); g.lineTo(0, h); g.fill()
    g.fillStyle = ph; g.beginPath(); g.roundRect(12, 12, 44, 20, 5); g.fill()
    font(g, 700, 11, 'm'); g.fillStyle = d.p === 'kick' ? '#06140a' : '#ffffff'; g.fillText('LIVE', 19, 26)
    font(g, 500, 11, 'm'); g.fillStyle = 'rgba(255,255,255,0.82)'; g.fillText(d.viewers, 64, 26)
    g.fillStyle = '#1a1f2b'; g.strokeStyle = 'rgba(255,255,255,0.22)'; g.beginPath(); g.roundRect(12, h - 76, 100, 64, 8); g.fill(); g.stroke()
    g.fillStyle = '#3a4152'; g.beginPath(); g.arc(62, h - 52, 12, 0, 7); g.fill(); g.beginPath(); g.ellipse(62, h - 14, 26, 16, 0, Math.PI, 0); g.fill()
    g.fillStyle = 'rgba(10,11,13,0.78)'; g.beginPath(); g.roundRect(w - 186, 12, 174, 34, 8); g.fill()
    g.fillStyle = PAL.dark.arc as string; g.beginPath(); g.roundRect(w - 178, 20, 18, 18, 5); g.fill()
    font(g, 600, 12.5); g.fillStyle = '#ffffff'; g.fillText(d.alert, w - 152, 34)
    glyph(g, d.p, w - 30, h - 30, 18, 'rgba(255,255,255,0.75)')
    g.restore()
    g.strokeStyle = p[d.p] as string; g.lineWidth = 3; g.beginPath(); g.roundRect(1.5, 1.5, w - 3, h - 3, 13); g.stroke()
    return s
  },
  mod(i, p) {
    const d = MODS[i % MODS.length] as (typeof MODS)[number]
    const probe = surface(1, 1).g
    font(probe, 400, 14); const tw = probe.measureText(d.a).width
    font(probe, 600, 14); const bw = probe.measureText(d.b).width
    const w = Math.ceil(tw + bw + 70), h = 48, s = surface(w, h), g = s.g
    panel(g, w, h, 24, p)
    g.fillStyle = p.surface2 as string; g.beginPath(); g.arc(25, 24, 15, 0, 7); g.fill()
    icon(g, 'shield', 16, 15, 18, p.arc as string)
    font(g, 400, 14); g.fillStyle = p.text2 as string; g.fillText(d.a, 50, 29)
    font(g, 600, 14); g.fillStyle = p.text as string; g.fillText(d.b, 50 + tw + 4, 29)
    return s
  },
  log(_i, p) {
    const w = 340, h = 176, s = surface(w, h), g = s.g
    panel(g, w, h, 16, p)
    font(g, 500, 10.5, 'm'); g.fillStyle = p.text3 as string; g.fillText('EVENT LOG', 18, 28)
    LOG.forEach((r, k) => {
      const y = 62 + k * 38
      if (k) { g.fillStyle = p.line as string; g.fillRect(18, y - 24, w - 36, 1) }
      glyph(g, r[0], 18, y - 13, 14, p[r[0]] as string)
      font(g, 600, 13.5); g.fillStyle = p.text as string; g.fillText(r[1], 40, y)
      const off = g.measureText(r[1]).width + 30
      font(g, 400, 13.5); g.fillStyle = p.text2 as string; g.fillText(r[2], 40 + off, y)
      font(g, 500, 12.5); g.fillStyle = (r[4] ? p.moltenText : p.text3) as string
      g.textAlign = 'right'; g.fillText(r[3], w - 18, y); g.textAlign = 'left'
    })
    return s
  },
  download(_i, p) {
    const w = 300, h = 178, s = surface(w, h), g = s.g
    panel(g, w, h, 18, p)
    drawMark(g, 16, 14, 44, p)
    font(g, 700, 21, 'd'); g.fillStyle = p.text as string; g.fillText('Ferrocast', 66, 44)
    font(g, 400, 13.5); g.fillStyle = p.text2 as string; g.fillText('The free desktop app for streamers', 18, 84)
    g.fillStyle = p.molten as string; g.beginPath(); g.roundRect(18, 102, w - 36, 44, 10); g.fill()
    font(g, 600, 15); g.fillStyle = '#120a00'; g.textAlign = 'center'; g.fillText('Download free', w / 2, 129)
    font(g, 500, 11, 'm'); g.fillStyle = p.text3 as string; g.fillText('OPEN SOURCE  /  GPL-3.0', w / 2, 166); g.textAlign = 'left'
    return s
  },
  stat(i, p) {
    const d = STATS[i % STATS.length] as (typeof STATS)[number]
    const w = 176, h = 80, s = surface(w, h), g = s.g
    panel(g, w, h, 14, p)
    font(g, 500, 10.5, 'm'); g.fillStyle = p.text3 as string; g.fillText(d.label.toUpperCase(), 16, 26)
    font(g, 700, 26, 'd'); g.fillStyle = p.text as string; g.fillText(d.val, 16, 60)
    glyph(g, d.p, w - 32, 14, 16, p[d.p] as string)
    return s
  },
}

export function paint(kind: Kind, index: number, theme: Theme): Painted {
  return PAINT[kind](index, PAL[theme])
}

/** Card mixes per page type, so each page floats things that match what it is about. */
export const DECKS: Record<string, Kind[]> = {
  home: ['alert', 'chat', 'obs', 'tip', 'chat', 'goal', 'alert', 'stat', 'mod', 'chat', 'obs', 'log', 'alert', 'download'],
  alerts: ['alert', 'alert', 'obs', 'goal', 'alert', 'log', 'chat', 'alert'],
  overlays: ['obs', 'alert', 'goal', 'obs', 'chat', 'obs', 'stat'],
  chat: ['chat', 'mod', 'chat', 'chat', 'stat', 'mod', 'chat', 'log'],
  bot: ['chat', 'chat', 'mod', 'chat', 'stat', 'chat'],
  tips: ['tip', 'goal', 'alert', 'tip', 'log', 'goal'],
  own: ['log', 'download', 'stat', 'chat', 'obs', 'alert'],
  download: ['download', 'alert', 'obs', 'chat', 'tip', 'goal'],
  page: ['alert', 'chat', 'obs', 'tip', 'goal', 'stat', 'mod', 'chat'],
  calm: ['chat', 'alert', 'goal', 'stat'],
}
