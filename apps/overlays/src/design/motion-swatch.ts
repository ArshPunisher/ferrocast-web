// The designer's live option tiles: a tiny alert card in the look's own colours that loops
// one entrance, text effect, exit, idle loop, particle type or recipe through the very same
// engine the overlay uses. Swatches never make a sound and stay still with reduced motion.

import type {
  AlertLook,
  Motion,
  MotionIdle,
  MotionIn,
  MotionOut,
  MotionParticles,
  MotionRecipe,
  TextAnim,
} from '@ferrocast/api/types'
import { EXIT_MS, RECIPES, entranceTiming, motionOf, springOf } from '@ferrocast/api/motion'
import {
  Clock,
  Ctx,
  runEntrance,
  runExit,
  runIdle,
  runText,
  type MotionHost,
  type MotionView,
} from './motion-engine'
import { Particles } from './motion-fx'

export type SwatchKind = 'in' | 'text' | 'out' | 'idle' | 'parts' | 'recipe'

export interface MotionSwatch {
  start(): void
  stop(): void
  destroy(): void
}

const CSS = `
:host{all:initial;display:block;position:absolute;inset:0}
*{box-sizing:border-box}
.st{position:absolute;inset:0;overflow:hidden;isolation:isolate;border-radius:inherit;
  background:radial-gradient(55% 75% at 78% 18%,rgb(64 86 130/.55) 0,transparent 62%),radial-gradient(45% 60% at 12% 96%,rgb(150 70 16/.45) 0,transparent 70%),linear-gradient(180deg,#151a24 0%,#0b0d12 100%)}
.p,.s{position:absolute;inset:0}
.pos{position:absolute;inset:0;display:grid;place-items:center}
.w{position:relative}
.c{position:relative;display:flex;align-items:center;gap:4px;padding:4px 8px 4px 4px;border-radius:5px;white-space:nowrap;
  background:var(--plate);color:var(--tx);border:1px solid rgb(255 255 255/.14);box-shadow:0 6px 12px -6px rgb(0 0 0/.85);will-change:transform,opacity}
.e{width:15px;height:15px;border-radius:4px;flex:none;background:radial-gradient(circle at 30% 25%,color-mix(in srgb,var(--hl) 80%,#fff),var(--hl) 45%,color-mix(in srgb,var(--hl) 40%,#05060a))}
.t{display:grid;gap:1px;font-family:"Bricolage Grotesque Variable","Bricolage Grotesque",system-ui,sans-serif}
.n{font-size:9px;font-weight:800;line-height:1;color:var(--ac)}
.n .ch{display:inline-block;white-space:pre}
.a{font-size:6px;font-weight:600;line-height:1;opacity:.8}
.a b{color:var(--hl)}
.clip{position:absolute;inset:0;border-radius:inherit;overflow:hidden;pointer-events:none}
.sh{position:absolute;top:-20%;bottom:-20%;left:0;width:45%;background:linear-gradient(100deg,transparent,rgb(255 255 255/.55) 45%,rgb(255 255 255/.85) 50%,rgb(255 255 255/.55) 55%,transparent);transform:translateX(-130%) skewX(-18deg);opacity:0;mix-blend-mode:overlay}
canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.fl,.vg{position:absolute;inset:0;opacity:0;pointer-events:none}
.fl{background:#fff;mix-blend-mode:screen}
.vg{background:radial-gradient(75% 75% at 50% 50%,transparent 45%,rgb(0 0 0/.75) 100%)}
.fa-tmp{position:absolute;inset:0;pointer-events:none}
.c.fa-tmp{margin:0}
.fa-ghost{mix-blend-mode:screen}
.fa-ghost,.fa-ghost *{background:transparent!important;box-shadow:none!important;color:var(--gc)!important;border-color:var(--gc)!important}
.fa-ring{inset:auto;left:50%;top:50%;border-radius:50%;border:1px solid color-mix(in srgb,var(--ring,#33d4ff) 55%,#fff);box-shadow:0 0 6px var(--ring,#33d4ff)}
.fa-pour{border-radius:5px;background:linear-gradient(180deg,#fff1c2 0%,#ffc04d 18%,#ff9a1a 55%,#d95f00 100%)}
.fa-caret{display:inline-block;width:.09em;height:.95em;margin-left:.06em;vertical-align:-.1em;background:var(--hl)}
`

const hex = (v: unknown, d: string) =>
  typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v) ? v : d

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

/** Mounts a swatch in `box` (sized by the page; the swatch fills it). */
export function mountMotionSwatch(
  box: HTMLElement,
  kind: SwatchKind,
  id: string,
  look: AlertLook,
  opts: { name?: string; amount?: string } = {},
): MotionSwatch {
  const host = el('div', 'fc-swatch')
  host.style.cssText = 'position:absolute;inset:0;border-radius:inherit;overflow:hidden'
  const root: ShadowRoot | HTMLElement =
    typeof host.attachShadow === 'function' ? host.attachShadow({ mode: 'open' }) : host
  const style = document.createElement('style')
  style.textContent = CSS
  root.appendChild(style)
  const st = el('div', 'st')
  const punch = el('div', 'p')
  const shk = el('div', 's')
  const pos = el('div', 'pos')
  const wrap = el('div', 'w')
  const card = el('div', 'c')
  const c = look.colors
  card.style.setProperty('--plate', hex(c?.plate, '#101216'))
  card.style.setProperty('--tx', hex(c?.text, '#eef0f4'))
  card.style.setProperty('--hl', hex(c?.highlight, '#ffa424'))
  card.style.setProperty('--ac', hex(c?.accent, '#33d4ff'))
  const name = el('b', 'n')
  for (const ch of Array.from(opts.name ?? 'noor')) name.appendChild(el('span', 'ch', ch))
  const amount = el('small', 'a')
  amount.appendChild(el('b', '', opts.amount ?? '₹500'))
  const t = el('span', 't')
  t.append(name, amount)
  const clip = el('span', 'clip')
  const sheen = el('i', 'sh')
  clip.appendChild(sheen)
  card.append(el('span', 'e'), t, clip)
  wrap.appendChild(card)
  pos.appendChild(wrap)
  const cv = el('canvas', '')
  shk.append(pos, cv)
  punch.appendChild(shk)
  const flash = el('div', 'fl')
  const vig = el('div', 'vg')
  st.append(punch, vig, flash)
  root.appendChild(st)
  box.appendChild(host)

  const W = Math.max(1, box.clientWidth || 92)
  const H = Math.max(1, box.clientHeight || 58)
  const fx = new Particles(cv, W, H)
  fx.fit(globalThis.devicePixelRatio || 1)
  const view: MotionView = {
    W,
    H,
    stage: st,
    punch,
    shk,
    wrap,
    card,
    sheen,
    flash,
    vig,
    fx,
    mini: true,
    colors: {
      accent: hex(c?.accent, '#33d4ff'),
      highlight: hex(c?.highlight, '#ffa424'),
      text: hex(c?.text, '#eef0f4'),
    },
    chars: () => Array.from(name.querySelectorAll<HTMLElement>('.ch')),
    clone(cls) {
      const k = card.cloneNode(true) as HTMLElement
      k.classList.add('fa-tmp', cls)
      k.setAttribute('aria-hidden', 'true')
      wrap.appendChild(k)
      return k
    },
  }

  let anims: Animation[] = []
  let clock = new Clock()
  let alive = false
  const reduced = () =>
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

  const tidy: (() => void)[] = []
  const reset = () => {
    // Put back what a cut-short effect changed (Decode's letters, shards, the cursor).
    for (const fn of tidy.splice(0)) {
      try {
        fn()
      } catch {
        /* already gone */
      }
    }
    for (const a of anims) a.cancel()
    anims = []
    clock.kill()
    clock = new Clock()
    fx.clear()
    for (const e of Array.from(wrap.querySelectorAll('.fa-tmp'))) e.remove()
    card.removeAttribute('style')
    card.style.setProperty('--plate', hex(c?.plate, '#101216'))
    card.style.setProperty('--tx', hex(c?.text, '#eef0f4'))
    card.style.setProperty('--hl', hex(c?.highlight, '#ffa424'))
    card.style.setProperty('--ac', hex(c?.accent, '#33d4ff'))
    for (const e of view.chars()) e.removeAttribute('style')
  }

  const ctxFor = (m: Motion) => {
    const h: MotionHost = {
      clock,
      track: (a) => (anims.push(a), a),
      sound: false,
      ownSound: false,
      volume: 0,
      onEnd: (fn) => void tidy.push(fn),
    }
    return new Ctx(view, m, h, 1)
  }

  const loop = () => {
    if (!alive) return
    reset()
    let m = motionOf(look)
    let next = 1500
    const speed = Math.min(1.6, Math.max(0.6, m.speed / 100))
    if (kind === 'in' || kind === 'recipe') {
      const r = kind === 'recipe' ? RECIPES[id as MotionRecipe]?.set : null
      if (r) m = { ...m, ...r.motion }
      const enter = (r ? r.in : id) as MotionIn
      const ctx = ctxFor(m)
      ctx.forceParts = r ? r.motion.particles : 'auto'
      const T = entranceTiming(enter, springOf(m.bounce).dur).T / speed
      runEntrance(enter, ctx)
      clock.at(T + 650, () => {
        if (r) {
          const x = ctxFor(m)
          runExit(r.out, x)
        } else {
          const a = card.animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: 160,
            fill: 'forwards',
          })
          anims.push(a)
        }
      })
      next = T + 650 + (r ? EXIT_MS[r.out] / speed + 300 : 260)
    } else if (kind === 'text') {
      const ctx = ctxFor(m)
      const T = runText(id as TextAnim, ctx, 0)
      next = T / speed + 900
    } else if (kind === 'out') {
      clock.at(450, () => runExit(id as MotionOut, ctxFor(m)))
      next = 450 + EXIT_MS[id as MotionOut] / speed + 350
    } else if (kind === 'idle') {
      runIdle(id as MotionIdle, ctxFor(m))
      next = 3400
    } else if (kind === 'parts') {
      if (id !== 'none') {
        const ctx = ctxFor(m)
        ctx.forceParts = id === 'auto' ? 'sparks' : (id as MotionParticles)
        ctx.impact({ burst: 'sparks' })
      }
      next = 1700
    }
    const g = clock
    g.at(Math.max(400, next), () => {
      if (g === clock) loop()
    })
  }

  return {
    start() {
      if (alive || reduced()) return
      alive = true
      // A small random start, so a column of swatches doesn't move in lockstep.
      setTimeout(loop, Math.random() * 400)
    },
    stop() {
      alive = false
      reset()
    },
    destroy() {
      alive = false
      reset()
      clock.kill()
      fx.destroy()
      host.remove()
    },
  }
}
