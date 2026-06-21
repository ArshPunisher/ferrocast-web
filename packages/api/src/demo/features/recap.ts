// The end-of-stream recap in the demo, built from the demo's event log and session
// numbers like the engine (`crates/core/src/recap.rs`).

import type { FerroEvent, Money, Platform, Recap, SessionStats } from '../../types'
import { HttpError } from '../http-error'
import { NOT_MINE, type Routed } from './host'

const add = (list: Money[], m: Money) => {
  const x = list.find((y) => y.currency === m.currency)
  if (x) x.minor += m.minor
  else list.push({ ...m })
}

export function buildRecap(
  events: FerroEvent[],
  stats: SessionStats,
  live: boolean,
  since: number | null,
): Recap {
  const start = since ?? stats.started_at
  if (start === null)
    return {
      started_at: null,
      ended_at: null,
      live,
      follows: 0,
      subs: 0,
      tips: [],
      bits: 0,
      messages: 0,
      peak_viewers: 0,
      new_followers: [],
      subscribers: [],
      tippers: [],
      raiders: [],
      top_chatters: [],
      thanks: [],
    }
  const r: Recap = {
    started_at: start,
    ended_at: null,
    live,
    follows: stats.follows,
    subs: stats.subs,
    tips: stats.tips.map((m) => ({ ...m })),
    bits: stats.bits,
    messages: stats.messages,
    peak_viewers: stats.peak_viewers,
    new_followers: [],
    subscribers: [],
    tippers: [],
    raiders: [],
    top_chatters: [],
    thanks: [],
  }
  const chat = new Map<string, { platform: Platform; name: string; messages: number }>()
  for (const e of events) {
    if (e.origin !== 'live' || e.occurred_at < start) continue
    const k = e.kind
    switch (k.type) {
      case 'follow':
        if (!r.new_followers.some((f) => f.name === k.actor.display_name))
          r.new_followers.push({ platform: e.platform, name: k.actor.display_name })
        break
      case 'subscription':
        if (!k.gifted_by)
          r.subscribers.push({
            platform: e.platform,
            name: k.actor.display_name,
            months: k.months,
            gifts: 0,
          })
        break
      case 'gift_batch': {
        const s = r.subscribers.find((x) => x.name === k.gifter.display_name)
        if (s) s.gifts += k.count
        else
          r.subscribers.push({
            platform: e.platform,
            name: k.gifter.display_name,
            months: 0,
            gifts: k.count,
          })
        break
      }
      case 'tip':
      case 'paid_message': {
        if (k.type === 'tip' && k.status !== 'captured') break
        const name = k.actor.anonymous ? 'Anonymous' : k.actor.display_name
        const t = r.tippers.find((x) => x.name === name)
        if (t) add(t.amounts, k.money)
        else r.tippers.push({ platform: e.platform, name, amounts: [{ ...k.money }], bits: 0 })
        break
      }
      case 'platform_gift':
        if (k.value.unit === 'bits') {
          const t = r.tippers.find((x) => x.name === k.actor.display_name)
          if (t) t.bits += k.value.amount
          else
            r.tippers.push({
              platform: e.platform,
              name: k.actor.display_name,
              amounts: [],
              bits: k.value.amount,
            })
        }
        break
      case 'raid':
        r.raiders.push({ platform: e.platform, name: k.from.display_name, viewers: k.viewers })
        break
      case 'chat_message': {
        const a = k.actor
        if (!a.id || a.roles & (1 | 256)) break
        const key = `${e.platform}:${a.id}`
        const c = chat.get(key) ?? { platform: e.platform, name: a.display_name, messages: 0 }
        c.messages += 1
        chat.set(key, c)
        break
      }
    }
  }
  r.top_chatters = [...chat.values()].sort((a, b) => b.messages - a.messages).slice(0, 10)
  for (const n of [
    ...r.subscribers.map((s) => s.name),
    ...r.tippers.map((t) => t.name),
    ...r.raiders.map((x) => x.name),
    ...r.new_followers.map((f) => f.name),
  ])
    if (n !== 'Anonymous' && !r.thanks.some((t) => t.toLowerCase() === n.toLowerCase()))
      r.thanks.push(n)
  return r
}

export class DemoRecap {
  constructor(
    private readonly source: () => { events: FerroEvent[]; stats: SessionStats; live: boolean },
  ) {}

  route(method: string, seg: string[], _body: unknown, url: URL): Routed {
    if (seg[0] !== 'recap' || seg.length !== 1 || method !== 'GET') return NOT_MINE
    const raw = url.searchParams.get('since')
    let since: number | null = null
    if (raw !== null) {
      const n = Number(raw)
      if (!Number.isInteger(n) || n < 0 || n > Date.now())
        throw new HttpError(
          400,
          'invalid',
          'since: a time in Unix milliseconds, not in the future.',
        )
      since = n
    }
    const { events, stats, live } = this.source()
    return buildRecap(events, stats, live, since)
  }
}
