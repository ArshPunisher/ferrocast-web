// Merged chat. Every piece of viewer text goes in through textContent; emotes become <img>
// only from trusted URL schemes. The DOM never holds more than `max_messages` lines.

import type { ChatConfig, FerroEvent, Fragment, Platform, Widget } from '@ferrocast/api/types'
import {
  DARK_THEMES,
  MAX_TEXT,
  el,
  platformGlyph,
  readableColor,
  safeImageUrl,
  safeText,
  textSpan,
  themeOf,
} from '../dom'
import { place, type WidgetContext, type WidgetView } from '../widget'

const BOT = 256
const DEFAULT: ChatConfig = {
  platforms: [],
  max_messages: 30,
  fade_after_s: null,
  show_badges: true,
  show_platform: true,
  hide_commands: true,
  hide_bots: true,
  font_size: 22,
  theme: 'molten',
}

function clampInt(v: unknown, min: number, max: number, def: number): number {
  return typeof v === 'number' && Number.isFinite(v)
    ? Math.min(max, Math.max(min, Math.round(v)))
    : def
}

/** Renders fragments (or the plain text) as nodes, never as HTML. */
export function renderFragments(parent: HTMLElement, text: string, fragments: unknown): void {
  let budget = MAX_TEXT
  const add = (n: Node, len: number) => {
    parent.appendChild(n)
    budget -= len
  }
  const frags: Fragment[] = Array.isArray(fragments) ? (fragments as Fragment[]) : []
  if (frags.length === 0) {
    parent.appendChild(document.createTextNode(safeText(text)))
    return
  }
  for (const f of frags) {
    if (budget <= 0) {
      parent.appendChild(document.createTextNode('…'))
      break
    }
    if (typeof f !== 'object' || f === null) continue
    switch (f.type) {
      case 'text': {
        const t = safeText(f.text, budget)
        add(document.createTextNode(t), t.length)
        break
      }
      case 'emote': {
        const name = safeText(f.name, 60)
        const url = safeImageUrl(f.url)
        if (url) {
          const img = el('img', f.zero_width ? 'fc-emote is-zw' : 'fc-emote')
          img.alt = name
          img.title = name
          img.decoding = 'async'
          img.src = url
          img.addEventListener('error', () => img.replaceWith(document.createTextNode(name)))
          add(img, 2)
        } else add(document.createTextNode(name), name.length)
        break
      }
      case 'mention': {
        const m = el('span', 'fc-mention', `@${safeText(f.login, 40)}`)
        add(m, 10)
        break
      }
      case 'link': {
        // Links are shown, never clickable or fetched.
        const l = el('span', 'fc-link', safeText(f.url, 120))
        add(l, 30)
        break
      }
      default:
        break
    }
  }
}

export class ChatWidget implements WidgetView {
  readonly el: HTMLElement
  private readonly list: HTMLElement
  private cfg: ChatConfig = DEFAULT
  private fades = new Map<HTMLElement, ReturnType<typeof setTimeout>>()
  /** Lines that already faded out, so a redraw doesn't bring them back. Bounded. */
  private faded = new Set<string>()

  constructor(
    w: Widget & { kind: 'chat' },
    private readonly ctx: WidgetContext,
  ) {
    this.el = el('section', 'fc-w fc-w-chat')
    this.list = el('div', 'fc-chat-list')
    this.el.appendChild(this.list)
    this.update(w)
  }

  update(w: Widget): void {
    if (w.kind !== 'chat') return
    const before = this.cfg
    const c = { ...DEFAULT, ...(w.config ?? {}) }
    this.cfg = {
      ...c,
      max_messages: clampInt(c.max_messages, 1, 200, 30),
      font_size: clampInt(c.font_size, 10, 72, 22),
      fade_after_s:
        typeof c.fade_after_s === 'number' && c.fade_after_s > 0
          ? Math.min(c.fade_after_s, 3600)
          : null,
      platforms: Array.isArray(c.platforms) ? c.platforms : [],
    }
    this.el.dataset.theme = themeOf(this.cfg.theme)
    this.el.style.setProperty('--chat-size', `${this.cfg.font_size}px`)
    place(this.el, w)
    // Name colours are tuned per theme, and the filters may have changed: redraw.
    const redraw =
      this.list.childElementCount > 0 &&
      (themeOf(before.theme) !== themeOf(this.cfg.theme) ||
        before.hide_bots !== this.cfg.hide_bots ||
        before.hide_commands !== this.cfg.hide_commands ||
        before.show_badges !== this.cfg.show_badges ||
        before.show_platform !== this.cfg.show_platform ||
        before.platforms.join() !== this.cfg.platforms.join())
    if (redraw) this.onSnapshot()
    else this.trim()
  }

  onSnapshot(): void {
    this.clear()
    const fadeMs = this.cfg.fade_after_s ? this.cfg.fade_after_s * 1000 : null
    const now = Date.now()
    const recent = this.ctx.state.chat
      .filter((e) => !this.faded.has(`${e.platform}:${e.source_id ?? e.id}`))
      // Lines that would already have faded stay gone (received_at 0 = unknown time).
      .filter((e) => !(fadeMs && e.received_at > 0 && now - e.received_at > fadeMs))
      .slice(-this.cfg.max_messages)
    for (const e of recent) this.add(e, false)
  }

  onEvent(e: FerroEvent): void {
    if (e.kind.type === 'chat_message') this.add(e, true)
  }

  private wants(e: FerroEvent): boolean {
    if (e.kind.type !== 'chat_message') return false
    const ps = this.cfg.platforms
    if (ps.length > 0 && !ps.includes(e.platform)) return false
    const k = e.kind
    if (this.cfg.hide_bots && typeof k.actor?.roles === 'number' && (k.actor.roles & BOT) !== 0)
      return false
    if (
      this.cfg.hide_commands &&
      typeof k.content?.text === 'string' &&
      k.content.text.trimStart().startsWith('!')
    )
      return false
    return true
  }

  private add(e: FerroEvent, animate: boolean): void {
    if (!this.wants(e) || e.kind.type !== 'chat_message') return
    const k = e.kind
    const actor = k.actor
    if (!actor || typeof actor !== 'object') return
    const line = el('div', animate && !this.ctx.lowMotion() ? 'fc-msg is-new' : 'fc-msg')
    line.dataset.platform = String(e.platform)
    line.dataset.mid = String(e.source_id ?? e.id)
    line.dataset.uid = String(actor.id ?? '')
    if (this.cfg.show_platform) {
      const g = platformGlyph(e.platform, Math.round(this.cfg.font_size * 0.8))
      if (g) line.appendChild(g)
    }
    if (this.cfg.show_badges && Array.isArray(actor.badges)) {
      for (const b of actor.badges.slice(0, 3)) {
        const url = safeImageUrl(b?.image_url)
        if (!url) continue
        const img = el('img', 'fc-badge')
        img.alt = safeText(b.title ?? b.set ?? '', 40)
        img.decoding = 'async'
        img.src = url
        img.addEventListener('error', () => img.remove())
        line.appendChild(img)
      }
    }
    const name = textSpan('fc-name', actor.display_name ?? actor.login ?? '', 60)
    const color = readableColor(actor.color, DARK_THEMES.has(themeOf(this.cfg.theme)))
    if (color) name.style.color = color
    line.appendChild(name)
    const text = el('span', k.is_action ? 'fc-text is-action' : 'fc-text')
    text.dir = 'auto'
    if (k.is_action && color) text.style.color = color
    renderFragments(text, k.content?.text ?? '', k.content?.fragments)
    line.appendChild(text)
    this.list.appendChild(line)
    if (this.cfg.fade_after_s) {
      const t = setTimeout(() => this.fadeOut(line), this.cfg.fade_after_s * 1000)
      this.fades.set(line, t)
    }
    this.trim()
  }

  private fadeOut(line: HTMLElement): void {
    this.fades.delete(line)
    this.faded.add(`${line.dataset.platform ?? ''}:${line.dataset.mid ?? ''}`)
    if (this.faded.size > 500) this.faded.delete(this.faded.values().next().value as string)
    line.classList.add('is-gone')
    setTimeout(() => line.remove(), this.ctx.lowMotion() ? 0 : 400)
  }

  private remove(line: Element): void {
    const t = this.fades.get(line as HTMLElement)
    if (t) clearTimeout(t)
    this.fades.delete(line as HTMLElement)
    line.remove()
  }

  private trim(): void {
    while (this.list.childElementCount > this.cfg.max_messages) {
      const first = this.list.firstElementChild
      if (!first) break
      this.remove(first)
    }
  }

  onDeleteMessage(platform: Platform, messageId: string): void {
    for (const n of Array.from(this.list.children))
      if (
        (n as HTMLElement).dataset.platform === platform &&
        (n as HTMLElement).dataset.mid === messageId
      )
        this.remove(n)
  }

  onDeleteUser(platform: Platform, userId: string): void {
    if (!userId) return
    for (const n of Array.from(this.list.children))
      if (
        (n as HTMLElement).dataset.platform === platform &&
        (n as HTMLElement).dataset.uid === userId
      )
        this.remove(n)
  }

  onClearChat(platform: Platform | null): void {
    for (const n of Array.from(this.list.children))
      if (platform === null || (n as HTMLElement).dataset.platform === platform) this.remove(n)
  }

  private clear(): void {
    for (const t of this.fades.values()) clearTimeout(t)
    this.fades.clear()
    this.list.replaceChildren()
  }

  destroy(): void {
    this.clear()
    this.el.remove()
  }
}
