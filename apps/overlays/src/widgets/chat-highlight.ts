// Chat Highlight overlay widget: shows one pinned chat message in a styled card until
// dismissed or timed out. Builds all DOM with textContent only, honours reduced motion
// and visibility pause, and reacts to message deletion / user bans / clear chat.

import type { ChatHighlight, ChatHighlightConfig, Platform, Widget } from '@ferrocast/api/types'
import {
  DARK_THEMES,
  el,
  platformGlyph,
  readableColor,
  safeText,
  textSpan,
  themeOf,
} from '../dom'
import { isTrustedEmoteUrl } from '@ferrocast/api'
import { renderFragments } from './chat'
import { place, type WidgetContext, type WidgetView } from '../widget'

/** Pinned messages show other people's images: only the known emote and badge CDNs. */
function trustedImage(u: unknown): string | null {
  return isTrustedEmoteUrl(u) ? u : null
}

const PLATFORMS = new Set<string>(['twitch', 'youtube', 'kick'])

interface ParsedConfig {
  theme: string
  durationS: number | null
  fontSize: number
  showBadges: boolean
  showPlatform: boolean
}

function parseConfig(raw: Record<string, unknown>): ParsedConfig {
  const durRaw = raw.duration_s
  const durationS =
    typeof durRaw === 'number' && Number.isInteger(durRaw) && durRaw >= 5 && durRaw <= 3600
      ? durRaw
      : null
  const sizeRaw =
    typeof raw.font_size === 'number' && Number.isFinite(raw.font_size)
      ? Math.round(raw.font_size)
      : 24
  return {
    theme: themeOf(raw.theme),
    durationS,
    fontSize: Math.min(48, Math.max(14, sizeRaw)),
    showBadges: raw.show_badges !== false,
    showPlatform: raw.show_platform !== false,
  }
}

export class ChatHighlightWidget implements WidgetView {
  readonly el: HTMLElement
  private readonly live = el('span', 'fc-sr')
  private readonly card = el('article', 'fc-hl-card')
  private readonly meta = el('header', 'fc-hl-meta')
  private readonly body = el('p', 'fc-hl-body')
  private cfg: ParsedConfig
  private current: ChatHighlight | null = null
  private lastShownId: string | null = null
  private timedOutId: string | null = null
  private lastSpokenId: string | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private visible = true

  constructor(
    w: Widget & { kind: 'chat_highlight' },
    private readonly ctx: WidgetContext,
  ) {
    this.cfg = parseConfig((w.config ?? {}) as unknown as Record<string, unknown>)
    this.el = el('section', 'fc-w fc-w-chat-highlight')
    this.el.setAttribute('role', 'region')
    this.el.setAttribute('aria-label', 'Highlighted chat message')
    this.live.setAttribute('aria-live', 'polite')
    this.card.append(this.meta, this.body)
    this.el.append(this.live, this.card)
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
    if (w.kind !== 'chat_highlight') return
    this.applyConfig(w)
    this.render(false)
  }

  onVisibility(visible: boolean): void {
    this.visible = visible
    if (!visible) {
      this.clearTimer()
    } else if (this.current && this.current.id !== this.timedOutId) {
      this.armTimeout(this.current)
    }
  }

  onDeleteMessage(platform: Platform, messageId: string): void {
    if (!this.current) return
    if (
      this.current.platform === platform &&
      (this.current.source_id === messageId || this.current.event_id === messageId)
    ) {
      this.hideForId(this.current.id)
    }
  }

  onDeleteUser(platform: Platform, userId: string): void {
    if (!this.current) return
    if (this.current.platform === platform && this.current.actor?.id === userId) {
      this.hideForId(this.current.id)
    }
  }

  onClearChat(platform: Platform | null): void {
    if (!this.current) return
    if (platform === null || this.current.platform === platform) {
      this.hideForId(this.current.id)
    }
  }

  private applyConfig(w: Widget): void {
    place(this.el, w)
    this.cfg = parseConfig(
      (w.config ?? {}) as unknown as ChatHighlightConfig & Record<string, unknown>,
    )
    this.el.dataset.theme = this.cfg.theme
    this.el.style.setProperty('--fc-hl-size', `${this.cfg.fontSize}px`)
  }

  private render(fromSnapshot: boolean): void {
    const h = this.ctx.state.chat_highlight ?? null
    if (
      !h ||
      typeof h !== 'object' ||
      typeof h.id !== 'string' ||
      !PLATFORMS.has(h.platform) ||
      !h.actor ||
      typeof h.actor.display_name !== 'string' ||
      !h.content ||
      typeof h.content.text !== 'string'
    ) {
      this.current = null
      this.lastShownId = null
      this.clearTimer()
      this.el.classList.remove('is-enter')
      this.el.hidden = true
      return
    }

    if (h.id === this.timedOutId) {
      this.el.hidden = true
      return
    }
    if (h.expires_at !== null && h.expires_at !== undefined && Date.now() >= h.expires_at) {
      this.hideForId(h.id)
      return
    }

    this.current = h
    const isNew = h.id !== this.lastShownId
    this.lastShownId = h.id

    const dark = DARK_THEMES.has(this.cfg.theme)
    const metaNodes: Node[] = []
    if (this.cfg.showPlatform) {
      const glyph = platformGlyph(h.platform, 18)
      if (glyph) metaNodes.push(glyph)
    }
    if (this.cfg.showBadges && Array.isArray(h.actor.badges)) {
      for (const b of h.actor.badges.slice(0, 6)) {
        const url = trustedImage(b?.image_url)
        if (!url) continue
        const img = document.createElement('img')
        img.className = 'fc-badge'
        img.alt = safeText(b.title ?? b.set, 40)
        img.referrerPolicy = 'no-referrer'
        img.decoding = 'async'
        img.addEventListener('error', () => img.remove())
        img.src = url
        metaNodes.push(img)
      }
    }
    const author = textSpan('fc-hl-author', h.actor.display_name, 80)
    const col = readableColor(h.actor.color, dark)
    if (col) author.style.color = col
    metaNodes.push(author)
    const tag = el('span', 'fc-hl-tag')
    tag.textContent = 'Highlighted'
    metaNodes.push(tag)

    this.meta.replaceChildren(...metaNodes)
    this.body.replaceChildren()
    this.body.classList.toggle('is-action', !!h.is_action)
    renderFragments(this.body, h.content.text, h.content.fragments, trustedImage)

    this.el.hidden = false
    if (isNew) {
      this.el.classList.remove('is-enter')
      if (!fromSnapshot) void this.el.offsetWidth
      this.el.classList.toggle('is-enter', !fromSnapshot)
      if (this.lastSpokenId !== h.id) {
        this.lastSpokenId = h.id
        this.live.textContent = `Highlighted message from ${safeText(h.actor.display_name, 80)}: ${safeText(h.content.text, 240)}`
      }
    }
    this.armTimeout(h)
  }

  private armTimeout(h: ChatHighlight): void {
    this.clearTimer()
    if (!this.visible) return
    const candidates: number[] = []
    if (h.expires_at !== null && h.expires_at !== undefined) {
      candidates.push(Math.max(0, h.expires_at - Date.now()))
    }
    if (this.cfg.durationS !== null) {
      candidates.push(this.cfg.durationS * 1000)
    }
    if (candidates.length === 0) return
    const ms = Math.min(...candidates)
    const id = h.id
    this.timer = setTimeout(() => this.hideForId(id), ms)
  }

  private hideForId(id: string): void {
    this.timedOutId = id
    this.clearTimer()
    this.el.classList.remove('is-enter')
    this.el.hidden = true
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  destroy(): void {
    this.clearTimer()
    this.el.remove()
  }
}
