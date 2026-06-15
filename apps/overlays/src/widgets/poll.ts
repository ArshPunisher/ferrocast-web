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
    Array.isArray(v.options) &&
    v.options.every((o) => typeof o?.text === 'string' && Number.isFinite(o?.votes))
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
          line.append(
            el('span', 'fc-poll-n'),
            textSpan('fc-poll-text', ''),
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
      const [n, text, count] = Array.from(li.querySelectorAll('span')) as HTMLElement[]
      if (n) n.textContent = String(i + 1)
      if (text) text.textContent = safeText(o.text, 60)
      if (count) count.textContent = `${formatCount(votes)} · ${pct}%`
      const fill = li.querySelector<HTMLElement>('.fc-poll-fill')
      if (fill) fill.style.transform = `scaleX(${total > 0 ? votes / total : 0})`
      li.classList.toggle('is-leader', !!p.closed && leaders.has(i))
      said.push(`${safeText(o.text, 60)}: ${formatCount(votes)} ${votes === 1 ? 'vote' : 'votes'}`)
    })
    const q = safeText(p.question, 120)
    const summary = `${p.closed ? 'Poll closed' : 'Poll'}: ${q}${/[.?!]$/.test(q) ? '' : '.'} ${said.join(', ')}.`
    if (this.live.textContent !== summary) this.live.textContent = summary
  }

  destroy(): void {
    this.el.remove()
  }
}
