// Pro smart features in the demo, like the engine (`crates/engine/src/smart.rs`): the
// settings and the approval of the reply facts, a few seeded smart moderation suggestions
// with apply, undo and dismiss, the smart replies list, the written recap, and Insights'
// top supporters. Without Pro (or `features.smart`) the view says so and the recap is 402.

import type { Supporters } from '../../insights'
import type { ProView } from '../../pro'
import type {
  RecapSummary,
  SmartAction,
  SmartLog,
  SmartReply,
  SmartSettings,
  SmartSuggestion,
  SmartView,
} from '../../smart'
import type { Platform, Recap } from '../../types'
import { HttpError } from '../http-error'
import { NOT_MINE, clone, requireObj, type Routed } from './host'

const DAY = 86_400_000

function hash(s: string): string {
  // Not a real hash: the demo only compares the text it saved.
  return `h:${s.trim()}`
}

export class DemoSmart {
  private settings: SmartSettings = {
    moderation: 'suggest',
    act_timeout_s: 60,
    rules: '',
    replies: false,
    about:
      'Live Monday to Friday from 8pm IST. Discord: discord.gg/kabirlive. Rig: Ryzen 7, RTX 4070.',
    reply_gap_s: 60,
  }
  private approved: string | null = null
  private items: SmartSuggestion[] = []
  private replies: SmartReply[] = []
  private summary: RecapSummary = { started_at: null, summary: null, at: null }

  constructor(
    private readonly pro: () => ProView,
    private readonly recap: () => Recap,
  ) {
    const now = Date.now()
    const s = (
      i: number,
      platform: Platform,
      name: string,
      text: string,
      action: SmartAction,
      category: string,
      reason: string,
      confidence: number,
      extra: Partial<SmartSuggestion> = {},
    ): SmartSuggestion => ({
      id: `smart-${i}`,
      platform,
      user_id: `${platform}-${name.toLowerCase()}`,
      login: name.toLowerCase(),
      name,
      text,
      message_id: `msg-smart-${i}`,
      action,
      category,
      reason,
      confidence,
      at: now - i * 7 * 60_000,
      state: 'suggested',
      done: null,
      by: null,
      seconds: null,
      error: null,
      ...extra,
    })
    this.items = [
      s(
        1,
        'twitch',
        'raxxor_99',
        'bh3nch0d noob streamer',
        'timeout',
        'abuse',
        'Hinglish insult aimed at the streamer',
        0.93,
        {
          state: 'done',
          done: 'timeout',
          by: 'smart',
          seconds: 60,
        },
      ),
      s(
        2,
        'kick',
        'freefollows_now',
        'cheap followers here bit ly/grow4u',
        'delete',
        'spam',
        'Selling followers with a link',
        0.88,
      ),
      s(
        3,
        'youtube',
        'Ankit R',
        'tu toh pagal hai bhai lol',
        'delete',
        'other',
        'Mild teasing, likely banter',
        0.61,
      ),
    ]
    this.replies = [
      {
        at: now - 18 * 60_000,
        platform: 'twitch',
        name: 'meera_plays',
        question: 'kab stream hoti hai?',
        reply: 'Monday to Friday from 8pm IST!',
      },
    ]
  }

  private view(): SmartView {
    const p = this.pro()
    const reset = new Date()
    reset.setUTCHours(24, 0, 0, 0)
    return {
      settings: clone(this.settings),
      about_approved: !!this.settings.about.trim() && this.approved === hash(this.settings.about),
      pro: p.active,
      available: p.features.smart,
      active: p.active && p.features.smart,
      quotas: {
        smart_moderation: { used: 4, limit: 30, period: 'day', reset_at: reset.getTime() },
        smart_replies: {
          used: this.replies.length,
          limit: 20,
          period: 'day',
          reset_at: reset.getTime(),
        },
        smart_recaps: {
          used: this.summary.summary ? 1 : 0,
          limit: 3,
          period: 'day',
          reset_at: reset.getTime(),
        },
      },
      moderation_paused_until: null,
      replies_paused_until: null,
      last_error: null,
      waiting: 0,
    }
  }

  private find(id: string): SmartSuggestion {
    const s = this.items.find((x) => x.id === id)
    if (!s)
      throw new HttpError(
        404,
        'not_found',
        'That suggestion is gone.',
        'Ferrocast keeps the last 200 in this session. Reload the page.',
      )
    return s
  }

  private save(body: unknown): SmartView {
    const b = requireObj(body)
    const next = { ...this.settings }
    const allowed = ['moderation', 'act_timeout_s', 'rules', 'replies', 'about', 'reply_gap_s']
    for (const k of Object.keys(b))
      if (!allowed.includes(k))
        throw new HttpError(400, 'invalid', `A field is missing or wrong: unknown field \`${k}\``)
    if (b.moderation !== undefined) {
      if (b.moderation !== 'off' && b.moderation !== 'suggest' && b.moderation !== 'act')
        throw new HttpError(400, 'invalid', 'moderation: off, suggest or act.')
      next.moderation = b.moderation
    }
    if (b.act_timeout_s !== undefined) {
      const t = Number(b.act_timeout_s)
      if (!Number.isInteger(t) || t < 10 || t > 600)
        throw new HttpError(400, 'invalid', 'act_timeout_s: 10 seconds to 10 minutes.')
      next.act_timeout_s = t
    }
    if (b.rules !== undefined) {
      const r = String(b.rules).trim()
      if (r.length > 500) throw new HttpError(400, 'invalid', 'rules: at most 500 characters.')
      next.rules = r
    }
    if (b.replies !== undefined) next.replies = b.replies === true
    if (b.about !== undefined) {
      const a = String(b.about).trim()
      if (a.length > 2000) throw new HttpError(400, 'invalid', 'about: at most 2000 characters.')
      next.about = a
    }
    if (b.reply_gap_s !== undefined) {
      const g = Number(b.reply_gap_s)
      if (!Number.isInteger(g) || g < 30 || g > 3600)
        throw new HttpError(400, 'invalid', 'reply_gap_s: 30 seconds to an hour.')
      next.reply_gap_s = g
    }
    this.settings = next
    return this.view()
  }

  private supporters(url: URL): Supporters {
    const now = Date.now()
    const num = (k: string) => {
      const v = url.searchParams.get(k)
      if (v === null || v === '') return undefined
      const n = Number(v)
      if (!Number.isInteger(n) || n < 0 || n > now + 60_000)
        throw new HttpError(400, 'invalid', `${k}: a time in Unix milliseconds, not in the future.`)
      return n
    }
    const from = num('from') ?? now - 30 * DAY
    const to = num('to') ?? now
    if (to <= from)
      throw new HttpError(422, 'invalid_range', 'from must be before to.', 'Pick a range again.')
    if (to - from > 400 * DAY)
      throw new HttpError(
        422,
        'invalid_range',
        'A range can be up to 400 days.',
        'Pick a shorter range.',
      )
    // More history, more people: a believable spread that grows with the range.
    const k = Math.max(1, Math.min(12, Math.round((to - from) / (7 * DAY))))
    const pick = <T>(xs: T[]) => xs.slice(0, Math.min(xs.length, 3 + k))
    return {
      from,
      to,
      truncated: false,
      totals: {
        follows: 41 * k,
        subs: 9 * k,
        tips: [{ currency: 'INR', minor: 185_000 * k }],
        bits: 2_300 * k,
        messages: 5_200 * k,
        peak_viewers: 96,
      },
      new_followers: 41 * k,
      subscribers: pick([
        { platform: 'twitch', name: 'meera_plays', months: 14, gifts: 10 * k },
        { platform: 'kick', name: 'DesiDuo', months: 6, gifts: 5 * k },
        { platform: 'twitch', name: 'shadowkrish', months: 22, gifts: 2 },
        { platform: 'youtube', name: 'Ankit R', months: 3, gifts: 1 },
        { platform: 'twitch', name: 'pixelpooja', months: 9, gifts: 0 },
        { platform: 'kick', name: 'rohan.exe', months: 2, gifts: 0 },
      ]),
      tippers: pick([
        {
          platform: 'tips',
          name: 'Neha K',
          amounts: [{ currency: 'INR', minor: 120_000 * k }],
          bits: 0,
        },
        { platform: 'twitch', name: 'shadowkrish', amounts: [], bits: 1_500 * k },
        {
          platform: 'tips',
          name: 'Vikram',
          amounts: [
            { currency: 'INR', minor: 50_000 * k },
            { currency: 'USD', minor: 1_000 },
          ],
          bits: 0,
        },
        {
          platform: 'youtube',
          name: 'Ankit R',
          amounts: [{ currency: 'INR', minor: 15_000 }],
          bits: 0,
        },
        { platform: 'twitch', name: 'pixelpooja', amounts: [], bits: 300 },
      ]),
      raiders: pick([
        { platform: 'twitch', name: 'LoFiLakshya', viewers: 63 },
        { platform: 'kick', name: 'ArenaAnu', viewers: 28 },
        { platform: 'twitch', name: 'CozyKabir', viewers: 12 },
      ]),
      top_chatters: pick([
        { platform: 'twitch', name: 'meera_plays', messages: 410 * k },
        { platform: 'kick', name: 'rohan.exe', messages: 260 * k },
        { platform: 'youtube', name: 'Ankit R', messages: 190 * k },
        { platform: 'twitch', name: 'pixelpooja', messages: 150 * k },
        { platform: 'twitch', name: 'shadowkrish', messages: 120 * k },
        { platform: 'kick', name: 'DesiDuo', messages: 80 * k },
      ]),
    }
  }

  private writeRecap(): RecapSummary {
    const p = this.pro()
    if (!p.active)
      throw new HttpError(
        402,
        'pro_required',
        'This runs on Ferrocast’s servers and is part of Pro.',
        'See Settings › Pro. Everything free in Ferrocast stays free.',
      )
    if (!p.features.smart)
      throw new HttpError(
        503,
        'smart_off',
        'Smart features aren’t switched on on Ferrocast’s servers yet.',
        'Nothing to do: everything else works as usual, and these turn on by themselves once they’re set up.',
      )
    const r = this.recap()
    if (r.started_at === null)
      throw new HttpError(
        409,
        'no_stream',
        'There’s no stream to recap yet.',
        'Stream first, then ask for a recap.',
      )
    const end = r.ended_at ?? Date.now()
    const minutes = Math.max(1, Math.round((end - r.started_at) / 60_000))
    const thanks = r.thanks.slice(0, 6)
    const parts = [
      `You were live for ${minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`} and peaked at ${r.peak_viewers} viewers.`,
      `${r.follows} new ${r.follows === 1 ? 'follower' : 'followers'} and ${r.subs} ${r.subs === 1 ? 'sub' : 'subs'} came in, with ${r.messages} chat messages along the way.`,
      r.raiders[0]
        ? `${r.raiders[0].name} raided with ${r.raiders[0].viewers} viewers, a good moment to thank them on stream next time.`
        : 'Chat stayed steady through the stream.',
    ]
    const text = `${parts.join(' ')}\nThank: ${thanks.length ? thanks.join(', ') : 'your regulars in chat'}\n- Start at the same time next stream, so regulars know when to come.\n- Pin your Discord link early, while chat is busiest.`
    this.summary = { started_at: r.started_at, summary: text, at: Date.now() }
    return clone(this.summary)
  }

  route(method: string, seg: string[], body: unknown, url: URL): Routed {
    const [a, b, c, d] = seg
    if (a === 'insights' && b === 'supporters' && seg.length === 2 && method === 'GET')
      return this.supporters(url)
    if (a === 'recap' && b === 'summary' && seg.length === 2) {
      if (method === 'GET') return clone(this.summary)
      if (method === 'POST') return this.writeRecap()
    }
    if (a !== 'pro' || b !== 'smart') return NOT_MINE
    if (seg.length === 2 && method === 'GET') return this.view()
    if (seg.length === 2 && method === 'PUT') return this.save(body)
    if (c === 'about' && d === 'approve' && seg.length === 4 && method === 'POST') {
      const about = String(requireObj(body).about ?? '')
      if (!this.settings.about.trim())
        throw new HttpError(400, 'invalid', 'Write the facts for smart replies first.')
      if (about.trim() !== this.settings.about.trim())
        throw new HttpError(
          409,
          'about_changed',
          'The facts changed since this page loaded.',
          'Reload, read them again, then approve.',
        )
      this.approved = hash(this.settings.about)
      return this.view()
    }
    if (c === 'moderation' && seg.length === 3 && method === 'GET') {
      const log: SmartLog = { items: clone(this.items), replies: clone(this.replies) }
      return log
    }
    if (c === 'moderation' && seg.length === 5 && method === 'POST') {
      const s = this.find(d ?? '')
      const what = seg[4]
      if (what === 'apply') {
        if (s.state === 'done') throw new HttpError(409, 'conflict', 'That’s already done.')
        const o = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
        const action = (o.action as SmartAction | undefined) ?? s.action
        if (!['delete', 'timeout', 'ban'].includes(action))
          throw new HttpError(400, 'invalid', 'action: delete, timeout or ban.')
        Object.assign(s, {
          state: 'done',
          done: action,
          by: 'you',
          seconds: action === 'timeout' ? Number(o.seconds ?? 600) : null,
          error: null,
        })
        return clone(s)
      }
      if (what === 'undo') {
        if (s.state !== 'done')
          throw new HttpError(409, 'conflict', 'There’s nothing to undo here.')
        if (s.done === 'delete')
          throw new HttpError(
            409,
            'cant_undo',
            'A deleted message can’t be brought back.',
            'The person can still chat; nothing else was done to them.',
          )
        s.state = 'undone'
        return clone(s)
      }
      if (what === 'dismiss') {
        if (s.state === 'suggested') s.state = 'dismissed'
        return clone(s)
      }
    }
    return NOT_MINE
  }
}
