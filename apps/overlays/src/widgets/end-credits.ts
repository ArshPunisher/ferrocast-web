// End Credits overlay widget: scrolling stream-end credits listing this session's
// followers, subs, gifters, bits/tips givers, raiders, and mods. Uses textContent only,
// 60 fps requestAnimationFrame + transform/opacity only, honours reduced motion and visibility.

import { formatCount, formatMoney, isColor } from '@ferrocast/api'
import type { Credits, CreditsSection, EndCreditsConfig, Widget } from '@ferrocast/api/types'
import { el, platformGlyph, safeText, textSpan, themeOf } from '../dom'
import { fontStack } from '../design/fonts'
import { place, type WidgetContext, type WidgetView } from '../widget'

const ALL_SECTIONS: readonly CreditsSection[] = [
  'followers',
  'subs',
  'gifters',
  'tippers',
  'raiders',
  'mods',
]
const SECTION_SET = new Set<string>(ALL_SECTIONS)
const MAX_ROWS = 200

const SECTION_TITLE: Record<CreditsSection, string> = {
  followers: 'New followers',
  subs: 'Subscribers',
  gifters: 'Community gifters',
  tippers: 'Tips & cheers',
  raiders: 'Raiders',
  mods: 'Moderators',
}

interface ParsedConfig {
  theme: string
  title: string
  sections: CreditsSection[]
  speed: number
  font: string
  textColor: string | null
  accentColor: string | null
  background: string | null
  loop: boolean
}

function parseConfig(raw: Record<string, unknown>): ParsedConfig {
  const sectionsRaw = Array.isArray(raw.sections) ? raw.sections : ALL_SECTIONS
  const sections: CreditsSection[] = []
  for (const s of sectionsRaw) {
    if (typeof s === 'string' && SECTION_SET.has(s) && !sections.includes(s as CreditsSection))
      sections.push(s as CreditsSection)
  }
  if (sections.length === 0) sections.push(...ALL_SECTIONS)
  const speedNum = typeof raw.speed === 'number' && Number.isFinite(raw.speed) ? raw.speed : 60
  return {
    theme: themeOf(raw.theme),
    title: safeText(
      typeof raw.title === 'string' && raw.title.trim() ? raw.title : 'Thanks for watching',
      80,
    ),
    sections,
    speed: Math.min(300, Math.max(20, speedNum)),
    font: fontStack(typeof raw.font === 'string' ? raw.font : 'system'),
    textColor:
      typeof raw.text_color === 'string' && isColor(raw.text_color) ? raw.text_color : null,
    accentColor:
      typeof raw.accent_color === 'string' && isColor(raw.accent_color) ? raw.accent_color : null,
    background:
      typeof raw.background === 'string' && isColor(raw.background) ? raw.background : null,
    loop: raw.loop !== false,
  }
}

function formatTipDetail(t: Credits['tippers'][number]): string {
  const parts: string[] = []
  if (Array.isArray(t.amounts)) {
    for (const m of t.amounts) {
      if (m && typeof m.minor === 'number' && typeof m.currency === 'string') {
        parts.push(formatMoney(m))
      }
    }
  }
  if (typeof t.bits === 'number' && t.bits > 0) parts.push(`${formatCount(t.bits)} Bits`)
  if (typeof t.kicks === 'number' && t.kicks > 0) parts.push(`${formatCount(t.kicks)} KICKs`)
  if (typeof t.jewels === 'number' && t.jewels > 0) parts.push(`${formatCount(t.jewels)} Jewels`)
  return parts.join(' + ')
}

export class EndCreditsWidget implements WidgetView {
  readonly el: HTMLElement
  private readonly viewport = el('div', 'fc-credits-viewport')
  private readonly track = el('div', 'fc-credits-track')
  private cfg: ParsedConfig
  private boxW: number
  private boxH: number
  private viewportH = 400
  private trackH = 0
  private offsetY = 400
  private finished = false
  private visible = true
  private low = false
  private hasData = false
  private raf: number | null = null
  private lastTs = 0
  private dataSig = ''
  private ro: ResizeObserver | null = null

  constructor(
    w: Widget & { kind: 'end_credits' },
    private readonly ctx: WidgetContext,
    private readonly preview = false,
  ) {
    this.cfg = parseConfig((w.config ?? {}) as unknown as Record<string, unknown>)
    this.boxW = w.w
    this.boxH = w.h
    this.el = el('section', 'fc-w fc-w-end-credits')
    this.el.setAttribute('aria-label', 'Stream end credits')
    this.viewport.appendChild(this.track)
    this.el.appendChild(this.viewport)
    if (typeof ResizeObserver === 'function') {
      this.ro = new ResizeObserver(() => this.measure())
      this.ro.observe(this.viewport)
    }
    this.applyConfig(w)
    this.render(true)
  }

  onSnapshot(): void {
    this.render(true)
  }

  onState(): void {
    this.render(false)
  }

  update(w: Widget): void {
    if (w.kind !== 'end_credits') return
    this.boxW = w.w
    this.boxH = w.h
    this.applyConfig(w)
    this.render(false)
  }

  onVisibility(visible: boolean): void {
    this.visible = visible
    this.syncMotion()
  }

  onMotion(): void {
    this.syncMotion()
  }

  private applyConfig(w: Widget): void {
    place(this.el, w)
    this.cfg = parseConfig((w.config ?? {}) as EndCreditsConfig & Record<string, unknown>)
    this.el.dataset.theme = this.cfg.theme
    this.el.style.setProperty('--fc-credits-font', this.cfg.font)
    if (this.cfg.textColor) this.el.style.setProperty('--fc-credits-text', this.cfg.textColor)
    else this.el.style.removeProperty('--fc-credits-text')
    if (this.cfg.accentColor) this.el.style.setProperty('--fc-credits-accent', this.cfg.accentColor)
    else this.el.style.removeProperty('--fc-credits-accent')
    if (this.cfg.background) this.el.style.setProperty('--fc-credits-bg', this.cfg.background)
    else this.el.style.removeProperty('--fc-credits-bg')
  }

  private render(resetPosition: boolean): void {
    const credits = this.ctx.state.credits
    const sectionsDom: HTMLElement[] = []

    const titleEl = el('h2', 'fc-credits-title')
    titleEl.textContent = this.cfg.title
    sectionsDom.push(titleEl)

    let totalEntries = 0
    if (credits) {
      for (const sec of this.cfg.sections) {
        const rows = this.buildSectionRows(sec, credits)
        if (rows.length === 0) continue
        totalEntries += rows.length
        const sectionEl = el('div', 'fc-credits-section')
        const heading = el('h3', 'fc-credits-heading')
        heading.textContent = SECTION_TITLE[sec]
        const list = el('ul', 'fc-credits-list')
        for (const row of rows) list.appendChild(row)
        sectionEl.append(heading, list)
        sectionsDom.push(sectionEl)
      }
    }

    this.el.classList.toggle('is-static', this.ctx.lowMotion())
    const wasEmpty = !this.hasData
    this.hasData = totalEntries > 0
    if (!this.hasData) {
      if (this.preview) {
        const empty = el('p', 'fc-credits-empty')
        empty.textContent = 'Credits will fill in as followers, subs, tips, raids and mods appear.'
        sectionsDom.push(empty)
        this.el.hidden = false
      } else {
        this.track.replaceChildren()
        this.el.hidden = true
        this.stopLoop()
        return
      }
    } else {
      const outro = el('p', 'fc-credits-outro')
      outro.textContent = 'Thanks for being part of the stream'
      sectionsDom.push(outro)
      this.el.hidden = false
    }

    const sig = JSON.stringify({
      t: this.cfg.title,
      s: this.cfg.sections,
      l: this.cfg.loop,
      c: credits,
    })
    const changed = sig !== this.dataSig
    this.dataSig = sig

    if (changed || resetPosition) {
      this.track.replaceChildren(...sectionsDom)
      this.measure()
      if (resetPosition || wasEmpty || !this.hasData) {
        this.offsetY = this.viewportH
        this.finished = false
      }
    }
    if (resetPosition && this.cfg.loop === false) {
      this.finished = false
      this.offsetY = this.viewportH
    }
    this.syncMotion()
  }

  private buildSectionRows(sec: CreditsSection, credits: Credits): HTMLLIElement[] {
    const items: { platform: string; name: string; detail?: string }[] = []
    switch (sec) {
      case 'followers':
        for (const f of (credits.followers ?? []).slice(0, MAX_ROWS))
          items.push({ platform: f.platform, name: safeText(f.name, 80) })
        break
      case 'subs':
        for (const s of (credits.subs ?? []).slice(0, MAX_ROWS))
          items.push({
            platform: s.platform,
            name: safeText(s.name, 80),
            detail: s.months > 1 ? `${s.months} months` : 'Subscriber',
          })
        break
      case 'gifters':
        for (const g of (credits.gifters ?? []).slice(0, MAX_ROWS))
          items.push({
            platform: g.platform,
            name: safeText(g.name, 80),
            detail: `${formatCount(g.gifts)} gifted`,
          })
        break
      case 'tippers':
        for (const t of (credits.tippers ?? []).slice(0, MAX_ROWS)) {
          const detail = formatTipDetail(t)
          items.push({
            platform: t.platform,
            name: safeText(t.name, 80),
            ...(detail ? { detail } : {}),
          })
        }
        break
      case 'raiders':
        for (const r of (credits.raiders ?? []).slice(0, MAX_ROWS))
          items.push({
            platform: r.platform,
            name: safeText(r.name, 80),
            detail: `${formatCount(r.viewers)} viewers`,
          })
        break
      case 'mods':
        for (const m of (credits.mods ?? []).slice(0, MAX_ROWS))
          items.push({ platform: m.platform, name: safeText(m.name, 80) })
        break
    }

    return items
      .filter((i) => i.name.length > 0)
      .map((item) => {
        const li = el('li', 'fc-credits-row')
        const left = el('span', 'fc-credits-name-wrap')
        const glyph = platformGlyph(item.platform, 15)
        if (glyph) left.appendChild(glyph)
        left.appendChild(textSpan('fc-credits-name', item.name, 80))
        li.appendChild(left)
        if (item.detail) li.appendChild(textSpan('fc-credits-detail', item.detail, 60))
        return li
      })
  }

  private measure(): void {
    this.viewportH = this.viewport.clientHeight || Math.max(120, this.boxH - 32)
    const fallbackH = Math.max(240, this.track.childElementCount * 48)
    this.trackH = this.track.scrollHeight || fallbackH
    void this.boxW
  }

  private syncMotion(): void {
    this.low = this.ctx.lowMotion()
    this.el.classList.toggle('is-static', this.low)
    if (this.low) {
      this.stopLoop()
      this.track.style.transform = 'none'
      this.track.style.opacity = '1'
      return
    }
    if (!this.visible || this.el.hidden || !this.hasData || this.finished) {
      this.stopLoop()
      return
    }
    this.startLoop()
  }

  private startLoop(): void {
    if (this.raf !== null) return
    this.lastTs = 0
    this.track.style.opacity = '1'
    this.applyTransform()
    const step = (ts: number) => {
      if (!this.visible || this.low || !this.hasData || this.finished) {
        this.raf = null
        return
      }
      if (this.lastTs === 0) this.lastTs = ts
      const dt = Math.min(0.1, Math.max(0, (ts - this.lastTs) / 1000))
      this.lastTs = ts
      this.offsetY -= this.cfg.speed * dt
      if (this.offsetY <= -this.trackH) {
        if (this.cfg.loop) {
          this.offsetY = this.viewportH
        } else {
          this.offsetY = -this.trackH
          this.finished = true
          this.track.style.opacity = '0'
          this.applyTransform()
          this.raf = null
          return
        }
      }
      this.applyTransform()
      this.raf = requestAnimationFrame(step)
    }
    this.raf = requestAnimationFrame(step)
  }

  private applyTransform(): void {
    this.track.style.transform = `translate3d(0, ${this.offsetY.toFixed(2)}px, 0)`
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
    this.ro?.disconnect()
    this.ro = null
  }
}
