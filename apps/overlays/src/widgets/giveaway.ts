// The giveaway card: while open, the prize and how to enter (with a live entry count);
// once drawn, the winner's name with their platform. The reveal is one short scale and
// fade; low motion (or reduced motion) makes it a fade.

import { formatCount } from '@ferrocast/api/format'
import type { GiveawayCard, Widget } from '@ferrocast/api/types'
import { el, platformGlyph, safeText, textSpan, themeOf } from '../dom'
import { place, type WidgetContext, type WidgetView } from '../widget'

const PLATFORMS = new Set(['twitch', 'youtube', 'kick'])

function valid(c: unknown): c is GiveawayCard {
  if (typeof c !== 'object' || c === null) return false
  const v = c as Partial<GiveawayCard>
  const w = v.winner as Partial<NonNullable<GiveawayCard['winner']>> | null | undefined
  const winnerOk =
    w === null ||
    w === undefined ||
    (typeof w === 'object' &&
      typeof w.display_name === 'string' &&
      typeof w.user_id === 'string' &&
      typeof w.platform === 'string' &&
      PLATFORMS.has(w.platform))
  return (
    typeof v.id === 'string' &&
    typeof v.prize === 'string' &&
    typeof v.keyword === 'string' &&
    typeof v.open === 'boolean' &&
    winnerOk
  )
}

export class GiveawayWidget implements WidgetView {
  readonly el: HTMLElement
  private readonly label = el('span', 'fc-gw-label')
  private readonly prize = textSpan('fc-gw-prize', '')
  private readonly body = el('div', 'fc-gw-body')
  private readonly live = el('p', 'fc-sr')
  /** Which winner is on screen, so the reveal plays once per draw. */
  private shownWinner = ''

  constructor(
    w: Widget & { kind: 'giveaway' },
    private readonly ctx: WidgetContext,
  ) {
    this.el = el('section', 'fc-w fc-w-giveaway')
    this.el.setAttribute('aria-label', 'Giveaway')
    this.live.setAttribute('aria-live', 'polite')
    this.el.append(this.label, this.prize, this.body, this.live)
    this.update(w)
  }

  update(w: Widget): void {
    if (w.kind !== 'giveaway') return
    this.el.dataset.theme = themeOf(w.config?.theme)
    place(this.el, w)
    this.render(false)
  }

  /** A snapshot (reconnect, OBS refresh) shows what's known without replaying the reveal. */
  onSnapshot(): void {
    this.render(false)
  }

  onState(): void {
    this.render(true)
  }

  private render(reveal: boolean): void {
    const c = this.ctx.state.giveaway
    if (!valid(c)) {
      this.el.hidden = true
      return
    }
    this.el.hidden = false
    this.prize.textContent = safeText(c.prize, 100)
    const winner = c.winner ?? null
    this.el.classList.toggle('is-closed', !c.open && !winner)
    if (winner) {
      const key = `${c.id}:${winner.platform}:${winner.user_id}`
      this.label.textContent = 'Winner'
      if (key !== this.shownWinner) {
        this.shownWinner = key
        const name = textSpan('fc-gw-winner', winner.display_name, 40)
        const row = el('div', 'fc-gw-row')
        const glyph = platformGlyph(winner.platform, 26)
        if (glyph) row.append(glyph)
        row.append(name)
        this.body.replaceChildren(row)
        this.el.classList.remove('is-reveal')
        if (reveal) {
          // Restart the reveal for a redraw (reading offsetWidth applies the removal first).
          void this.el.offsetWidth
          this.el.classList.add('is-reveal')
          this.live.textContent = `Giveaway winner: ${safeText(winner.display_name, 40)}. Prize: ${safeText(c.prize, 100)}.`
        }
      }
      return
    }
    this.shownWinner = ''
    this.el.classList.remove('is-reveal')
    const entries = Number.isFinite(c.entries) ? Math.max(0, c.entries) : 0
    const count = el(
      'span',
      'fc-gw-count',
      `${formatCount(entries)} ${entries === 1 ? 'entry' : 'entries'}`,
    )
    if (!c.open) {
      // Entries closed, winner not drawn yet: keep the card up.
      this.label.textContent = 'Entries closed'
      this.body.replaceChildren(el('span', 'fc-gw-how', 'Drawing a winner soon'), count)
      return
    }
    this.label.textContent = 'Giveaway'
    const how = el('div', 'fc-gw-row')
    how.append(
      el('span', 'fc-gw-how', 'Type'),
      textSpan('fc-gw-keyword', c.keyword, 33),
      el('span', 'fc-gw-how', 'in chat to enter'),
    )
    this.body.replaceChildren(how, count)
  }

  destroy(): void {
    this.el.remove()
  }
}
