import { beforeEach, describe, expect, it } from 'vitest'
import { sample, type FerroEvent, type LiveFrame } from '@ferrocast/api'
import { selectFeed, useLive } from './store'
import { href, parseRoute } from './router'
import { readableColors } from '../components/chat'

const chat = (id: string, text = 'hi'): FerroEvent => ({
  id,
  seq: Number(id.replace(/\D/g, '')) || 1,
  platform: 'twitch',
  channel: null,
  source_id: `src-${id}`,
  occurred_at: 0,
  received_at: 0,
  origin: 'live',
  kind: {
    type: 'chat_message',
    actor: {
      platform: 'twitch',
      id: 'u',
      login: 'u',
      display_name: 'U',
      avatar_url: null,
      color: null,
      roles: 0,
      badges: [],
      anonymous: false,
    },
    content: { text, fragments: [{ type: 'text', text }] },
    reply_to: null,
    is_action: false,
  },
})
const ev = (data: FerroEvent): LiveFrame => ({ v: 1, type: 'event', data })

beforeEach(() => {
  useLive.setState({
    chat: [],
    events: [],
    deleted: new Set(),
    held: new Map(),
    notices: [],
    panic: false,
    viewers: {},
    goals: null,
    resyncs: 0,
  })
})

describe('live store', () => {
  it('caps chat at 500 lines however big the flood', () => {
    const frames = Array.from({ length: 3000 }, (_, i) => ev(chat(`c${i}`)))
    useLive.getState().apply(frames)
    expect(useLive.getState().chat).toHaveLength(500)
    expect(useLive.getState().chat.at(-1)?.id).toBe('c2999')
  })
  it('marks deleted messages and keeps viewer counts separate from the feed', () => {
    const s = useLive.getState()
    s.apply([
      ev(chat('c1')),
      ev({ ...chat('c2'), kind: { type: 'message_deleted', message_id: 'src-c1' } }),
      ev({ ...chat('c3'), platform: 'kick', kind: { type: 'viewer_count', count: 42 } }),
    ])
    const st = useLive.getState()
    expect(st.deleted.has('src-c1')).toBe(true)
    expect(st.viewers.kick).toBe(42)
    expect(st.events).toHaveLength(0)
  })
  it('tracks held messages, bounded', () => {
    const frames: LiveFrame[] = Array.from({ length: 250 }, (_, i) => ({
      v: 1,
      type: 'held',
      data: { event_id: `e${i}`, reason: 'spam' },
    }))
    useLive.getState().apply(frames)
    expect(useLive.getState().held.size).toBe(200)
    expect(useLive.getState().held.get('e249')).toBe('spam')
  })
  it('follows panic frames and notices', () => {
    useLive.getState().apply([
      {
        v: 1,
        type: 'panic',
        data: {
          on: true,
          plan: {
            followers_only: true,
            followers_only_minutes: 10,
            emote_only: false,
            slow_mode_seconds: 0,
            hold_new_accounts: true,
            pause_alerts: true,
            pause_tts: true,
            hotkey: 'Ctrl+Alt+Shift+P',
          },
        },
      },
    ])
    expect(useLive.getState().panic).toBe(true)
    useLive.getState().apply([
      {
        v: 1,
        type: 'notice',
        data: {
          level: 'info',
          message: 'Panic mode is off. Chat and alerts are back to normal.',
        },
      },
    ])
    expect(useLive.getState().panic).toBe(false)
    expect(useLive.getState().notices).toHaveLength(1)
  })
  it('keeps at most three notices', () => {
    useLive
      .getState()
      .apply(
        Array.from(
          { length: 6 },
          (_, i) =>
            ({ v: 1, type: 'notice', data: { level: 'warn', message: `n${i}` } }) as LiveFrame,
        ),
      )
    expect(useLive.getState().notices.map((n) => n.message)).toEqual(['n3', 'n4', 'n5'])
  })
  it('the feed shows alertable events newest first', () => {
    const f = sample('follow', 'twitch', 1) as FerroEvent
    const r = sample('raid', 'twitch', 2) as FerroEvent
    const feed = selectFeed([{ ...f, seq: 1 }, chat('c9'), { ...r, seq: 2 }])
    expect(feed.map((e) => e.kind.type)).toEqual(['raid', 'follow'])
  })
})

describe('router', () => {
  it('round-trips every route', () => {
    for (const h of [
      '#/home',
      '#/chat',
      '#/alerts',
      '#/alerts/tip',
      '#/overlays',
      '#/overlays/ov-main',
      '#/moderation',
      '#/bot',
      '#/tips',
      '#/settings',
      '#/settings/obs',
    ])
      expect(href(parseRoute(h))).toBe(h)
  })
  it('falls back to home for junk, including the pairing hash', () => {
    expect(parseRoute('#pair=ABCD').name).toBe('home')
    expect(parseRoute('#/../../etc').name).toBe('home')
    expect(parseRoute('').name).toBe('home')
  })
  it('encodes ids', () => {
    expect(href({ name: 'overlay', id: 'a/b?c' })).toBe('#/overlays/a%2Fb%3Fc')
  })
})

describe('name colours', () => {
  it('keeps each theme only the colours that read on it, and drops hostile ones', () => {
    expect(readableColors('#ff7ab6')).toEqual({ dark: '#ff7ab6' })
    expect(readableColors('#000080')).toEqual({ light: '#000080' })
    expect(readableColors('#ffd166')).toEqual({ dark: '#ffd166' })
    expect(readableColors('#1a5fb4')).toEqual({ light: '#1a5fb4' })
    expect(readableColors('red; background:url(x)')).toEqual({})
    expect(readableColors(null)).toEqual({})
  })
})
