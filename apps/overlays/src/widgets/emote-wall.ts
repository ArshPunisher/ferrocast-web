// Emote Wall overlay widget: bursts live chat emotes across the widget stage using
// transform/opacity + requestAnimationFrame at 60 fps. Enforces strict platform CDN allowlist,
// active DOM caps, per-message caps, spawn rate caps, visibility pause, and reduced motion.

import { isTrustedEmoteUrl } from '@ferrocast/api'
import type {
  EmotePhysics,
  EmoteWallConfig,
  FerroEvent,
  Platform,
  Widget,
} from '@ferrocast/api/types'
import { el, themeOf } from '../dom'
import { place, type WidgetContext, type WidgetView } from '../widget'

const HARD_MAX_EMOTES = 120
const MAX_PER_MESSAGE = 8
const MAX_SPAWN_PER_SEC = 24
const FADE_IN_S = 0.18
const FADE_OUT_S = 0.35

interface Particle {
  node: HTMLImageElement
  msgId: string
  sourceId: string | null
  actorKey: string | null
  platform: Platform
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  vrot: number
  age: number
  lifetime: number
  swayPhase: number
  swayFreq: number
  timer: ReturnType<typeof setTimeout> | null
}

interface ParsedConfig {
  theme: string
  platforms: Set<string>
  maxEmotes: number
  size: number
  lifetimeS: number
  physics: EmotePhysics
}

function parseConfig(raw: Record<string, unknown>): ParsedConfig {
  const maxRaw =
    typeof raw.max_emotes === 'number' && Number.isFinite(raw.max_emotes)
      ? Math.round(raw.max_emotes)
      : 40
  const sizeRaw =
    typeof raw.size === 'number' && Number.isFinite(raw.size) ? Math.round(raw.size) : 56
  const lifeRaw =
    typeof raw.lifetime_s === 'number' && Number.isFinite(raw.lifetime_s) ? raw.lifetime_s : 6
  const phys =
    raw.physics === 'rain' || raw.physics === 'fountain' || raw.physics === 'bounce'
      ? raw.physics
      : 'bounce'
  const platforms = new Set<string>()
  if (Array.isArray(raw.platforms)) {
    for (const p of raw.platforms) {
      if (p === 'twitch' || p === 'youtube' || p === 'kick') platforms.add(p)
    }
  }
  return {
    theme: themeOf(raw.theme),
    platforms,
    maxEmotes: Math.min(HARD_MAX_EMOTES, Math.max(5, maxRaw)),
    size: Math.min(128, Math.max(24, sizeRaw)),
    lifetimeS: Math.min(20, Math.max(1, lifeRaw)),
    physics: phys,
  }
}

export class EmoteWallWidget implements WidgetView {
  readonly el: HTMLElement
  private cfg: ParsedConfig
  private boxW: number
  private boxH: number
  private particles: Particle[] = []
  private visible = true
  private low = false
  private raf: number | null = null
  private lastTs = 0
  private tokens: number
  private lastRefillMs = performance.now()
  private ro: ResizeObserver | null = null

  constructor(
    w: Widget & { kind: 'emote_wall' },
    private readonly ctx: WidgetContext,
    private readonly preview = false,
  ) {
    this.cfg = parseConfig((w.config ?? {}) as unknown as Record<string, unknown>)
    this.tokens = Math.min(this.cfg.maxEmotes, MAX_SPAWN_PER_SEC)
    this.boxW = w.w
    this.boxH = w.h
    this.el = el('section', 'fc-w fc-w-emote-wall')
    this.el.setAttribute('aria-hidden', 'true')
    if (typeof ResizeObserver === 'function') {
      this.ro = new ResizeObserver(() => {
        if (this.el.clientWidth > 0) this.boxW = this.el.clientWidth
        if (this.el.clientHeight > 0) this.boxH = this.el.clientHeight
      })
      this.ro.observe(this.el)
    }
    this.applyConfig(w)
  }

  onSnapshot(): void {
    // Live OBS overlays only animate new live emotes; editor previews seed a quick burst
    // if snapshot chat contains trusted emotes so the stage isn't blank.
    if (this.preview && this.particles.length === 0) {
      for (const e of this.ctx.state.chat.slice(-4)) {
        this.onEvent(e)
      }
    }
  }

  onEvent(e: FerroEvent): void {
    if (!this.visible) return
    if (e.kind?.type !== 'chat_message') return
    if (this.cfg.platforms.size > 0 && !this.cfg.platforms.has(e.platform)) return
    const fragments = e.kind.content?.fragments
    if (!Array.isArray(fragments) || fragments.length === 0) return

    this.refillTokens()
    const urls: string[] = []
    for (const f of fragments) {
      if (urls.length >= MAX_PER_MESSAGE) break
      if (f && typeof f === 'object' && f.type === 'emote' && isTrustedEmoteUrl(f.url)) {
        urls.push(f.url)
      }
    }
    if (urls.length === 0) return

    const actor = e.kind.actor
    const actorKey = actor?.id ? `${e.platform}:${actor.id}` : null
    for (const url of urls) {
      if (this.tokens < 1) break
      this.tokens -= 1
      this.spawn(url, e.id, e.source_id ?? null, actorKey, e.platform)
    }
  }

  update(w: Widget): void {
    if (w.kind !== 'emote_wall') return
    this.boxW = w.w
    this.boxH = w.h
    this.applyConfig(w)
    while (this.particles.length > this.cfg.maxEmotes) {
      this.removeAt(0)
    }
    this.syncMotion()
  }

  onVisibility(visible: boolean): void {
    this.visible = visible
    this.syncMotion()
  }

  onMotion(): void {
    this.syncMotion()
  }

  onDeleteMessage(platform: Platform, messageId: string): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!
      if (p.platform === platform && (p.sourceId === messageId || p.msgId === messageId)) {
        this.removeAt(i)
      }
    }
  }

  onDeleteUser(platform: Platform, userId: string): void {
    const key = `${platform}:${userId}`
    for (let i = this.particles.length - 1; i >= 0; i--) {
      if (this.particles[i]!.actorKey === key) this.removeAt(i)
    }
  }

  onClearChat(platform: Platform | null): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      if (platform === null || this.particles[i]!.platform === platform) this.removeAt(i)
    }
  }

  private applyConfig(w: Widget): void {
    place(this.el, w)
    this.cfg = parseConfig((w.config ?? {}) as unknown as EmoteWallConfig & Record<string, unknown>)
    this.el.dataset.theme = this.cfg.theme
    this.el.dataset.physics = this.cfg.physics
    this.el.style.setProperty('--fc-emote-size', `${this.cfg.size}px`)
    this.low = this.ctx.lowMotion()
    this.el.classList.toggle('is-static', this.low)
  }

  private refillTokens(): void {
    const now = performance.now()
    const elapsed = Math.max(0, (now - this.lastRefillMs) / 1000)
    this.lastRefillMs = now
    const cap = Math.min(this.cfg.maxEmotes, MAX_SPAWN_PER_SEC)
    this.tokens = Math.min(cap, this.tokens + elapsed * MAX_SPAWN_PER_SEC)
  }

  private spawn(
    url: string,
    msgId: string,
    sourceId: string | null,
    actorKey: string | null,
    platform: Platform,
  ): void {
    const maxAllowed = this.low ? Math.min(this.cfg.maxEmotes, 24) : this.cfg.maxEmotes
    while (this.particles.length >= maxAllowed) {
      this.removeAt(0)
    }

    const size = this.cfg.size
    const maxX = Math.max(0, this.boxW - size)
    const maxY = Math.max(0, this.boxH - size)

    const img = document.createElement('img')
    img.className = 'fc-emote-particle'
    img.alt = ''
    img.decoding = 'async'
    img.draggable = false
    img.referrerPolicy = 'no-referrer'
    img.src = url

    let x = Math.random() * maxX
    let y = Math.random() * maxY
    let vx = 0
    let vy = 0
    let vrot = 0

    if (this.low) {
      // Calm static placement when reduced motion is active: zero movement velocity.
      const cols = Math.max(1, Math.floor(this.boxW / (size + 12)))
      const slot = this.particles.length
      x = Math.min(maxX, (slot % cols) * (size + 12) + 8)
      y = Math.min(maxY, Math.floor(slot / cols) * (size + 12) + 8)
    } else if (this.cfg.physics === 'rain') {
      x = Math.random() * maxX
      y = -size * 0.4
      vx = (Math.random() - 0.5) * 40
      vy = 130 + Math.random() * 140
      vrot = (Math.random() - 0.5) * 30
    } else if (this.cfg.physics === 'fountain') {
      x = Math.min(maxX, Math.max(0, maxX * 0.5 + (Math.random() - 0.5) * Math.max(40, maxX * 0.2)))
      y = maxY
      vx = (Math.random() - 0.5) * 380
      vy = -(320 + Math.random() * 220)
      vrot = (Math.random() - 0.5) * 90
    } else {
      const angle = Math.random() * Math.PI * 2
      const speed = 110 + Math.random() * 140
      vx = Math.cos(angle) * speed
      vy = Math.sin(angle) * speed
      vrot = (Math.random() - 0.5) * 45
    }

    const p: Particle = {
      node: img,
      msgId,
      sourceId,
      actorKey,
      platform,
      x,
      y,
      vx,
      vy,
      rot: 0,
      vrot,
      age: 0,
      lifetime: this.cfg.lifetimeS,
      swayPhase: Math.random() * Math.PI * 2,
      swayFreq: 1.5 + Math.random() * 2,
      timer: null,
    }

    img.addEventListener('error', () => {
      const idx = this.particles.indexOf(p)
      if (idx !== -1) this.removeAt(idx)
    })

    if (this.low) {
      img.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
      img.style.opacity = '1'
      p.timer = setTimeout(
        () => {
          const idx = this.particles.indexOf(p)
          if (idx !== -1) this.removeAt(idx)
        },
        Math.round(this.cfg.lifetimeS * 1000),
      )
    } else {
      img.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(0.6)`
      img.style.opacity = '0'
    }

    this.particles.push(p)
    this.el.appendChild(img)
    this.syncMotion()
  }

  private removeAt(idx: number): void {
    const p = this.particles[idx]
    if (!p) return
    if (p.timer) clearTimeout(p.timer)
    p.node.remove()
    this.particles.splice(idx, 1)
    if (this.particles.length === 0) this.stopLoop()
  }

  private syncMotion(): void {
    this.low = this.ctx.lowMotion()
    this.el.classList.toggle('is-static', this.low)
    if (this.low || !this.visible || this.particles.length === 0) {
      this.stopLoop()
      return
    }
    this.startLoop()
  }

  private startLoop(): void {
    if (this.raf !== null) return
    this.lastTs = 0
    const step = (ts: number) => {
      if (!this.visible || this.low || this.particles.length === 0) {
        this.raf = null
        return
      }
      if (this.lastTs === 0) this.lastTs = ts
      const dt = Math.min(0.05, Math.max(0, (ts - this.lastTs) / 1000))
      this.lastTs = ts

      const size = this.cfg.size
      const maxX = Math.max(0, this.boxW - size)
      const maxY = Math.max(0, this.boxH - size)

      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i]!
        p.age += dt
        if (p.age >= p.lifetime) {
          this.removeAt(i)
          continue
        }

        if (this.cfg.physics === 'rain') {
          p.x += (p.vx + Math.sin(p.age * p.swayFreq + p.swayPhase) * 32) * dt
          p.y += p.vy * dt
          if (p.x < 0) p.x = 0
          else if (p.x > maxX) p.x = maxX
          p.rot += p.vrot * dt
        } else if (this.cfg.physics === 'fountain') {
          p.vy += 540 * dt
          p.x += p.vx * dt
          p.y += p.vy * dt
          if (p.x <= 0) {
            p.x = 0
            p.vx = Math.abs(p.vx) * 0.85
          } else if (p.x >= maxX) {
            p.x = maxX
            p.vx = -Math.abs(p.vx) * 0.85
          }
          if (p.y >= maxY && p.vy > 0) {
            p.y = maxY
            p.vy = -Math.abs(p.vy) * 0.65
          }
          p.rot += p.vrot * dt
        } else {
          p.x += p.vx * dt
          p.y += p.vy * dt
          if (p.x <= 0) {
            p.x = 0
            p.vx = Math.abs(p.vx)
          } else if (p.x >= maxX) {
            p.x = maxX
            p.vx = -Math.abs(p.vx)
          }
          if (p.y <= 0) {
            p.y = 0
            p.vy = Math.abs(p.vy)
          } else if (p.y >= maxY) {
            p.y = maxY
            p.vy = -Math.abs(p.vy)
          }
          p.rot += p.vrot * dt
        }

        const rem = p.lifetime - p.age
        const fadeIn = Math.min(1, p.age / FADE_IN_S)
        const fadeOut = rem < FADE_OUT_S ? Math.max(0, rem / FADE_OUT_S) : 1
        const opacity = Math.min(fadeIn, fadeOut)
        const scale = 0.72 + 0.28 * fadeIn - (rem < FADE_OUT_S ? 0.14 * (1 - fadeOut) : 0)

        p.node.style.opacity = opacity.toFixed(3)
        p.node.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) scale(${scale.toFixed(3)}) rotate(${p.rot.toFixed(1)}deg)`
      }

      if (this.particles.length > 0) {
        this.raf = requestAnimationFrame(step)
      } else {
        this.raf = null
      }
    }
    this.raf = requestAnimationFrame(step)
  }

  private stopLoop(): void {
    if (this.raf !== null) {
      cancelAnimationFrame(this.raf)
      this.raf = null
    }
    this.lastTs = 0
  }

  destroy(): void {
    this.stopLoop()
    for (const p of this.particles) {
      if (p.timer) clearTimeout(p.timer)
      p.node.remove()
    }
    this.particles = []
    this.ro?.disconnect()
    this.ro = null
    this.el.remove()
  }
}
