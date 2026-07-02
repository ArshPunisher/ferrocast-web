// The poll widget: the question, one bar per answer with its count and share, and the
// leader marked when the poll closes. Every number is also in the text, so the result
// reads without the bars (and screen readers get one live sentence per change).

import { formatCount } from '@ferrocast/api/format'
import type { PollView, Widget } from '@ferrocast/api/types'
import { el, safeText, textSpan, themeOf } from '../dom'
import { place, type WidgetContext, type WidgetView } from '../widget'

const MAX_OPTIONS = 5

function valid(p: unknown): p is PollView {
  if (typeof p !== 'object' || p === null) return false
  const v = p as Partial<PollView>
  return (
    typeof v.id === 'string' &&
    typeof v.question === 'string' &&
    typeof v.closed === 'boolean' &&
    Array.isArray(v.options) &&
    v.options.length >= 2 &&
    v.options.every((o) => typeof o?.text === 'string' && Number.isFinite(o?.votes)) &&
    Array.isArray(v.leaders) &&
    v.leaders.every((i) => Number.isInteger(i))
  )
}

export class PollWidget implements WidgetView {
  readonly el: HTMLElement
  private readonly question = textSpan('fc-poll-q', '')
  private readonly status = el('span', 'fc-poll-status')
  private readonly list = el('ol', 'fc-poll-list')
  /** One spoken summary per change, for screen readers in browser previews. */
  private readonly live = el('p', 'fc-sr')
  private shownId = ''
  /** What was last announced: a poll is spoken when it starts and when it closes. */
  private spoken = ''

  constructor(
    w: Widget & { kind: 'poll' },
    private readonly ctx: WidgetContext,
  ) {
    this.el = el('section', 'fc-w fc-w-poll')
    this.el.setAttribute('aria-label', 'Poll')
    this.live.setAttribute('aria-live', 'polite')
    const head = el('header', 'fc-poll-head')
    head.append(this.question, this.status)
    this.el.append(head, this.list, this.live)
    this.update(w)
  }

  update(w: Widget): void {
    if (w.kind !== 'poll') return
    this.el.dataset.theme = themeOf(w.config?.theme)
    place(this.el, w)
    this.onState()
  }

  onSnapshot(): void {
    this.onState()
  }

  onState(): void {
    const p = this.ctx.state.poll
    if (!valid(p)) {
      this.el.hidden = true
      this.shownId = ''
      return
    }
    this.el.hidden = false
    const options = p.options.slice(0, MAX_OPTIONS)
    const total = options.reduce((n, o) => n + Math.max(0, o.votes), 0)
    const leaders = new Set(Array.isArray(p.leaders) ? p.leaders : [])
    const fresh = p.id !== this.shownId
    this.shownId = p.id
    this.question.textContent = safeText(p.question, 120)
    this.status.textContent = p.closed
      ? 'Final result'
      : `Type !vote 1${options.length > 1 ? `-${options.length}` : ''}`
    this.el.classList.toggle('is-closed', !!p.closed)
    // Rows are reused so bars glide from their old length instead of jumping.
    if (fresh || this.list.children.length !== options.length) {
      this.list.replaceChildren(
        ...options.map(() => {
          const li = el('li', 'fc-poll-row')
          const line = el('div', 'fc-poll-line')
          const winner = el('span', 'fc-poll-winner', 'Winner')
          winner.hidden = true
          line.append(
            el('span', 'fc-poll-n'),
            textSpan('fc-poll-text', ''),
            winner,
            el('span', 'fc-poll-count'),
          )
          const bar = el('div', 'fc-poll-bar')
          bar.appendChild(el('div', 'fc-poll-fill'))
          li.append(line, bar)
          return li
        }),
      )
    }
    const said: string[] = []
    options.forEach((o, i) => {
      const li = this.list.children[i] as HTMLElement
      const votes = Math.max(0, o.votes)
      const pct = total > 0 ? Math.round((votes / total) * 100) : 0
      const n = li.querySelector<HTMLElement>('.fc-poll-n')
      const text = li.querySelector<HTMLElement>('.fc-poll-text')
      const count = li.querySelector<HTMLElement>('.fc-poll-count')
      const winner = li.querySelector<HTMLElement>('.fc-poll-winner')
      if (n) n.textContent = String(i + 1)
      if (text) text.textContent = safeText(o.text, 60)
      if (count) count.textContent = `${formatCount(votes)} · ${pct}%`
      const fill = li.querySelector<HTMLElement>('.fc-poll-fill')
      if (fill) fill.style.transform = `scaleX(${total > 0 ? votes / total : 0})`
      const lead = p.closed && leaders.has(i)
      li.classList.toggle('is-leader', lead)
      if (winner) winner.hidden = !lead
      said.push(`${safeText(o.text, 60)}: ${formatCount(votes)} ${votes === 1 ? 'vote' : 'votes'}`)
    })
    const q = safeText(p.question, 120)
    const end = /[.?!]$/.test(q) ? '' : '.'
    const names = [...leaders].flatMap((i) => (options[i] ? [safeText(options[i].text, 60)] : []))
    const result = !p.closed
      ? ''
      : names.length === 1
        ? ` Winner: ${names[0]}.`
        : names.length > 1
          ? ` Tie: ${names.join(' and ')}.`
          : ' Nobody voted.'
    // Spoken once when it starts and once when it closes, not after every vote.
    const key = `${p.id}:${p.closed}`
    if (key !== this.spoken) {
      this.spoken = key
      this.live.textContent = `${p.closed ? 'Poll closed' : 'Poll'}: ${q}${end} ${said.join(', ')}.${result}`
    }
  }

  destroy(): void {
    this.el.remove()
  }
}
