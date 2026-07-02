// Giveaways in the demo, matching the engine (`crates/core/src/giveaway.rs`,
// `crates/server/src/routes/giveaways.rs`): keyword entry, optional point cost, two
// tickets for subs, the streamer and bots can't enter, draws never repeat a winner.

import type { Actor, FerroEvent, GiveawayCard, GiveawayEntrant, GiveawayView } from '../../types'
import { POINTS_LIMITS } from '../../types'
import { HttpError } from '../http-error'
import { NOT_MINE, clone, type DemoHost, type Routed } from './host'
import type { DemoLoyalty } from './loyalty'
import { pointsLabel } from './loyalty'

const BOTS = new Set(['nightbot', 'streamelements', 'streamlabs', 'moobot', 'fossabot', 'wizebot'])

interface Entrant extends GiveawayEntrant {
  key: string
  paid: number
}

interface Giveaway {
  id: string
  prize: string
  keyword: string
  cost: number
  subscriber_bonus: boolean
  started_at: number
  open: boolean
  ended: boolean
  entrants: Entrant[]
  winners: Entrant[]
}

const notFound = () =>
  new HttpError(
    404,
    'giveaway_not_found',
    'There’s no giveaway running.',
    'Start one from Community → Giveaway.',
  )

const strip = ({ key: _k, paid: _p, ...e }: Entrant): GiveawayEntrant => e

export class DemoGiveaways {
  private g: Giveaway | null = null
  private told = new Set<string>()
  private n = 0

  constructor(
    private readonly host: DemoHost,
    private readonly loyalty: DemoLoyalty,
  ) {}

  view(): GiveawayView | null {
    const g = this.g
    if (!g) return null
    return {
      id: g.id,
      prize: g.prize,
      keyword: g.keyword,
      cost: g.cost,
      subscriber_bonus: g.subscriber_bonus,
      started_at: g.started_at,
      open: g.open,
      ended: g.ended,
      entries: g.entrants.length,
      tickets: g.entrants.reduce((n, e) => n + e.tickets, 0),
      entrants: [...g.entrants].reverse().slice(0, 500).map(strip),
      winners: g.winners.map(strip),
    }
  }

  card(): GiveawayCard | null {
    const g = this.g
    if (!g) return null
    const w = g.winners.at(-1)
    return {
      id: g.id,
      prize: g.prize,
      keyword: g.keyword,
      open: g.open,
      entries: g.entrants.length,
      winner: w ? strip(w) : null,
    }
  }

  private push(): void {
    this.host.broadcastLive({ v: 1, type: 'giveaway', data: { giveaway: clone(this.view()) } })
    this.host.pushOverlayState({ giveaway: clone(this.card()) })
  }

  onChat(e: FerroEvent): void {
    const g = this.g
    if (!g || !g.open || g.ended || e.kind.type !== 'chat_message' || e.origin !== 'live') return
    const a: Actor = e.kind.actor
    const word = e.kind.content.text.trim().split(/\s+/)[0]?.toLowerCase()
    if (word !== g.keyword || !a.id || a.anonymous || a.roles & 1 || a.roles & 256) return
    if (BOTS.has((a.login ?? a.display_name).toLowerCase())) return
    const key = `${e.platform}:${a.id}`
    if (g.entrants.some((x) => x.key === key)) return
    if (g.cost > 0 && !this.loyalty.spend(e.platform, a.id, g.cost)) {
      if (!this.told.has(key)) {
        this.told.add(key)
        const name = this.loyalty.config.name
        this.host.say(
          `@${a.display_name}, entering costs ${pointsLabel(g.cost, name)} and you have ${pointsLabel(this.loyalty.balanceOf(e.platform, a.id), name)}.`,
        )
      }
      return
    }
    const sub = (a.roles & (8 | 16 | 32)) !== 0
    g.entrants.push({
      key,
      paid: g.cost,
      platform: e.platform as GiveawayEntrant['platform'],
      user_id: a.id,
      login: a.login ?? a.display_name,
      display_name: a.display_name,
      tickets: g.subscriber_bonus && sub ? 2 : 1,
    })
    this.push()
  }

  private draw(redraw: boolean): GiveawayView {
    const g = this.g
    if (!g) throw notFound()
    if (g.ended) throw new HttpError(409, 'conflict', 'This giveaway has ended.')
    if (!redraw && g.winners.length)
      throw new HttpError(
        409,
        'conflict',
        'A winner was already drawn. Use Redraw to pick another.',
      )
    if (redraw && !g.winners.length) throw new HttpError(409, 'conflict', 'Draw a winner first.')
    if (!g.entrants.length) throw new HttpError(422, 'unavailable', 'Nobody has entered yet.')
    const pool = g.entrants.filter((e) => !g.winners.some((w) => w.key === e.key))
    if (!pool.length)
      throw new HttpError(422, 'unavailable', 'Everyone who entered has already won.')
    g.open = false
    const total = pool.reduce((n, e) => n + e.tickets, 0)
    const buf = new Uint32Array(1)
    crypto.getRandomValues(buf)
    let r = (buf[0] ?? 0) % total
    const winner = pool.find((e) => (r -= e.tickets) < 0) ?? pool[0]!
    g.winners.push(winner)
    this.push()
    this.host.say(`Congratulations @${winner.display_name}, you won ${g.prize}!`)
    return this.view()!
  }

  route(method: string, seg: string[], body: unknown): Routed {
    if (seg[0] !== 'giveaways') return NOT_MINE
    if (seg.length === 1 && method === 'POST') {
      if (typeof body !== 'object' || body === null || Array.isArray(body))
        throw new HttpError(
          400,
          'invalid',
          'Send the giveaway as an object: { prize, keyword, cost, subscriber_bonus }.',
        )
      const b = body as Record<string, unknown>
      if (typeof b.prize !== 'string') throw new HttpError(400, 'invalid', 'prize: must be text.')
      const prize = b.prize.split(/\s+/).filter(Boolean).join(' ')
      if (!prize || [...prize].length > 100)
        throw new HttpError(400, 'invalid', 'prize: say what they can win, in 1 to 100 characters.')
      if (b.keyword !== undefined && b.keyword !== null && typeof b.keyword !== 'string')
        throw new HttpError(400, 'invalid', 'keyword: must be text, like !join.')
      const keyword = (typeof b.keyword === 'string' ? b.keyword : '!join').trim().toLowerCase()
      if (!/^![\p{L}\p{N}_-]{1,32}$/u.test(keyword))
        throw new HttpError(400, 'invalid', 'keyword: one word starting with !, like !join.')
      if (b.cost !== undefined && b.cost !== null && typeof b.cost !== 'number')
        throw new HttpError(400, 'invalid', 'cost: must be a whole number of points.')
      const cost = typeof b.cost === 'number' ? b.cost : 0
      if (!Number.isInteger(cost) || cost < 0 || cost > POINTS_LIMITS.maxAdjust)
        throw new HttpError(
          400,
          'invalid',
          'cost: must be a whole number from 0 to 1,000,000,000 points.',
        )
      if (
        b.subscriber_bonus !== undefined &&
        b.subscriber_bonus !== null &&
        typeof b.subscriber_bonus !== 'boolean'
      )
        throw new HttpError(400, 'invalid', 'subscriber_bonus: must be true or false.')
      if (cost > 0 && !this.loyalty.config.enabled)
        throw new HttpError(
          400,
          'invalid',
          'cost: points are turned off, so entries can’t cost points. Turn points on or make it free.',
        )
      if (this.g && !this.g.ended)
        throw new HttpError(
          409,
          'conflict',
          'A giveaway is already running. End it before starting another.',
        )
      const now = Date.now()
      this.g = {
        id: `gw-${now.toString(36)}-${++this.n}`,
        prize,
        keyword,
        cost,
        subscriber_bonus: b.subscriber_bonus === true,
        started_at: now,
        open: true,
        ended: false,
        entrants: [],
        winners: [],
      }
      this.told.clear()
      this.push()
      let msg = `Giveaway: ${prize}! Type ${keyword} to enter.`
      if (cost > 0) msg += ` It costs ${pointsLabel(cost, 'points')}.`
      if (this.g.subscriber_bonus) msg += ' Subscribers get 2 entries.'
      this.host.say(msg)
      this.simulateEntries(this.g.id)
      return clone(this.view())
    }
    if (seg[1] !== 'current') return NOT_MINE
    if (seg.length === 2 && method === 'GET') return clone(this.view())
    if (seg.length === 2 && method === 'DELETE') {
      const g = this.g
      if (!g) throw notFound()
      let refunded = 0
      if (!g.ended)
        for (const e of g.entrants)
          if (e.paid > 0) {
            this.loyalty.credit(e.platform, e.user_id, e.paid)
            refunded += 1
          }
      this.g = null
      this.push()
      return { refunded }
    }
    if (seg.length !== 3 || method !== 'POST') return NOT_MINE
    const g = this.g
    if (!g) throw notFound()
    switch (seg[2]) {
      case 'close':
        if (g.ended || !g.open) throw new HttpError(409, 'conflict', 'Entries are already closed.')
        g.open = false
        this.push()
        return this.view()
      case 'draw':
        return this.draw(false)
      case 'redraw':
        return this.draw(true)
      case 'end':
        if (g.ended) throw new HttpError(409, 'conflict', 'This giveaway has already ended.')
        g.ended = true
        g.open = false
        this.push()
        return this.view()
    }
    return NOT_MINE
  }

  /** The demo audience joins over the next 20 seconds. */
  private simulateEntries(id: string): void {
    const people = this.host.knownActors().filter((a) => !(a.roles & 256))
    people.forEach((a, i) => {
      if (this.host.random() < 0.3) return
      this.host.later(
        () => {
          if (this.g?.id === id && this.g.open) this.host.chat(a, this.g.keyword)
        },
        800 + i * 1200 + this.host.random() * 800,
      )
    })
  }
}
