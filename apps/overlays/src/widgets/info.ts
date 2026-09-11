// The small widgets: recent events, goal bar, text label and the combined viewer count.

import {
  describeEvent,
  actorOf,
  exponent,
  formatCount,
  formatMoney,
  isAlertable,
} from '@ferrocast/api/format'
import type {
  EventsConfig,
  FerroEvent,
  GoalConfig,
  LabelConfig,
  Platform,
  ViewersConfig,
  Widget,
} from '@ferrocast/api/types'
import { el, platformGlyph, safeText, textSpan, themeOf } from '../dom'
import { place, type WidgetContext, type WidgetView } from '../widget'

const CHAT: Platform[] = ['twitch', 'youtube', 'kick']

export class EventsWidget implements WidgetView {
  readonly el: HTMLElement
  private readonly list: HTMLElement
  private cfg: EventsConfig = { kinds: [], max_items: 6, theme: 'molten' }
  private ids = new Set<string>()

  constructor(
    w: Widget & { kind: 'events' },
    private readonly ctx: WidgetContext,
  ) {
    this.el = el('section', 'fc-w fc-w-events')
    this.list = el('ol', 'fc-events')
    this.el.appendChild(this.list)
    this.update(w)
  }

  update(w: Widget): void {
    if (w.kind !== 'events') return
    const c = w.config ?? this.cfg
    this.cfg = {
      kinds: Array.isArray(c.kinds) ? c.kinds : [],
      max_items:
        typeof c.max_items === 'number' && c.max_items > 0
          ? Math.min(Math.round(c.max_items), 50)
          : 6,
      theme: themeOf(c.theme),
    }
    this.el.dataset.theme = this.cfg.theme
    place(this.el, w)
    this.trim()
  }

  private wants(e: FerroEvent): boolean {
    if (!e?.kind || !isAlertable(e) || this.ids.has(e.id)) return false
    return this.cfg.kinds.length === 0 || this.cfg.kinds.includes(e.kind.type)
  }

  onSnapshot(): void {
    this.ids.clear()
    this.list.replaceChildren()
    const recent = this.ctx.state.events.filter((e) => this.wants(e)).slice(-this.cfg.max_items)
    for (const e of recent) this.add(e, false)
  }

  onEvent(e: FerroEvent): void {
    if (this.wants(e)) this.add(e, !this.ctx.lowMotion())
  }

  private add(e: FerroEvent, animate: boolean): void {
    let d: { title: string; detail: string | null } | undefined
    try {
      d = describeEvent(e)
    } catch {
      d = undefined
    }
    if (!d) return // a kind we don't know: skip it
    this.ids.add(e.id)
    // Remember enough ids to drop replays, not a whole session's worth.
    if (this.ids.size > 300) this.ids.delete(this.ids.values().next().value as string)
    const li = el('li', animate ? 'fc-ev is-new' : 'fc-ev')
    li.dataset.kind = e.kind.type
    const g = platformGlyph(e.platform, 18)
    if (g) li.appendChild(g)
    const who = actorOf(e)
    li.appendChild(textSpan('fc-ev-name', who?.display_name ?? '', 40))
    li.appendChild(textSpan('fc-ev-what', ` ${d.title}`, 80))
    this.list.prepend(li)
    this.trim()
  }

  private trim(): void {
    while (this.list.childElementCount > this.cfg.max_items) this.list.lastElementChild?.remove()
  }

  destroy(): void {
    this.el.remove()
  }
}

export class GoalWidget implements WidgetView {
  readonly el: HTMLElement
  private cfg: GoalConfig = { goal_id: '', theme: 'molten' }
  private readonly title = textSpan('fc-goal-title', '')
  private readonly nums = el('span', 'fc-goal-nums')
  private readonly fill = el('div', 'fc-goal-fill')

  constructor(
    w: Widget & { kind: 'goal' },
    private readonly ctx: WidgetContext,
  ) {
    this.el = el('section', 'fc-w fc-w-goal')
    const head = el('div', 'fc-goal-head')
    head.append(this.title, this.nums)
    const bar = el('div', 'fc-goal-bar')
    bar.appendChild(this.fill)
    this.el.append(head, bar)
    this.update(w)
  }

  update(w: Widget): void {
    if (w.kind !== 'goal') return
    this.cfg = { goal_id: String(w.config?.goal_id ?? ''), theme: themeOf(w.config?.theme) }
    this.el.dataset.theme = this.cfg.theme
    place(this.el, w)
    this.onState()
  }

  onSnapshot(): void {
    this.onState()
  }

  onState(): void {
    // A goal widget from a gallery scene starts without a goal: it shows the first one.
    const goals = Array.isArray(this.ctx.state.goals) ? this.ctx.state.goals : []
    const g = this.cfg.goal_id ? goals.find((x) => x?.id === this.cfg.goal_id) : goals[0]
    this.el.hidden = !g
    if (!g) return
    const target = Number.isFinite(g.target) && g.target > 0 ? g.target : 1
    const current = Number.isFinite(g.current) ? Math.max(0, g.current) : 0
    const pct = Math.min(1, current / target)
    this.title.textContent = safeText(g.title, 80)
    const fmt = (n: number) =>
      g.currency && /^[A-Za-z]{3}$/.test(g.currency)
        ? formatMoney({
            minor: Math.round(n * 10 ** exponent(g.currency.toUpperCase())),
            currency: g.currency,
          })
        : formatCount(n)
    this.nums.textContent = `${fmt(current)} / ${fmt(target)}`
    this.fill.style.transform = `scaleX(${pct})`
    // Round goal looks draw from this (a conic fill can't use the bar's transform).
    this.el.style.setProperty('--pct', String(Math.round(pct * 1000) / 1000))
    this.el.classList.toggle('is-done', current >= target)
  }

  destroy(): void {
    this.el.remove()
  }
}

export class LabelWidget implements WidgetView {
  readonly el: HTMLElement
  private id = ''
  private readonly text = textSpan('fc-label-text', '')

  constructor(
    w: Widget & { kind: 'label' },
    private readonly ctx: WidgetContext,
  ) {
    this.el = el('section', 'fc-w fc-w-label')
    this.el.appendChild(this.text)
    this.update(w)
  }

  update(w: Widget): void {
    if (w.kind !== 'label') return
    this.id = w.id
    this.el.dataset.theme = themeOf((w.config as LabelConfig | undefined)?.theme)
    place(this.el, w)
    this.onState()
  }

  onSnapshot(): void {
    this.onState()
  }

  onState(): void {
    const v = this.ctx.state.labels?.[this.id]
    const t = safeText(typeof v === 'string' ? v : '', 200)
    if (this.text.textContent !== t) this.text.textContent = t
    this.el.hidden = t.trim() === ''
  }

  destroy(): void {
    this.el.remove()
  }
}

export class ViewersWidget implements WidgetView {
  readonly el: HTMLElement
  private cfg: ViewersConfig = { platforms: [], theme: 'molten' }
  private readonly marks = el('span', 'fc-viewers-marks')
  private readonly count = el('span', 'fc-viewers-count')
  private last = -1

  constructor(
    w: Widget & { kind: 'viewers' },
    private readonly ctx: WidgetContext,
  ) {
    this.el = el('section', 'fc-w fc-w-viewers')
    const dot = el('span', 'fc-live-dot')
    this.el.append(dot, this.count, this.marks)
    this.update(w)
  }

  update(w: Widget): void {
    if (w.kind !== 'viewers') return
    const c = w.config ?? this.cfg
    this.cfg = { platforms: Array.isArray(c.platforms) ? c.platforms : [], theme: themeOf(c.theme) }
    this.el.dataset.theme = this.cfg.theme
    place(this.el, w)
    this.last = -1
    this.onState()
  }

  onSnapshot(): void {
    this.onState()
  }

  onState(): void {
    const ps = (this.cfg.platforms.length ? this.cfg.platforms : CHAT).filter((p) =>
      CHAT.includes(p),
    )
    const v = this.ctx.state.viewers ?? {}
    let total = 0
    const live: Platform[] = []
    for (const p of ps) {
      const n = v[p]
      if (typeof n === 'number' && Number.isFinite(n) && n >= 0) {
        total += n
        if (n > 0) live.push(p)
      }
    }
    if (total === this.last) return
    this.last = total
    this.count.textContent = formatCount(total)
    this.marks.replaceChildren(
      ...live.map((p) => platformGlyph(p, 18)).filter((g): g is SVGSVGElement => g !== null),
    )
    this.el.setAttribute('aria-label', `${formatCount(total)} watching`)
  }

  destroy(): void {
    this.el.remove()
  }
}
