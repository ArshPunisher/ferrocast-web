import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sample, type FerroEvent, type LiveFrame } from '@ferrocast/api'
import { currentToasts } from '@ferrocast/ui'
import { cloudModerationKey, isLimited, mergeChat, selectFeed, useLive } from './store'
import type { Connection } from './boot'
import { href, parseRoute } from './router'
import { lineActions, readableColors } from '../components/chat'
import { stageScale } from '../components/AlertStage'

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
    heldEvents: new Map(),
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
  it('clears a held message when any dashboard approves or removes it', () => {
    const s = useLive.getState()
    s.apply([
      ev(chat('c1')),
      { v: 1, type: 'held', data: { event_id: 'c1', reason: 'scam' } },
      ev(chat('c2')),
      { v: 1, type: 'held', data: { event_id: 'c2', reason: 'link' } },
    ])
    expect([...useLive.getState().heldEvents.keys()]).toEqual(['c1', 'c2'])
    s.apply([
      { v: 1, type: 'held_resolved', data: { event_id: 'c1', outcome: 'released' } },
      { v: 1, type: 'held_resolved', data: { event_id: 'c2', outcome: 'dropped' } },
    ])
    const st = useLive.getState()
    expect(st.held.size).toBe(0)
    expect(st.heldEvents.size).toBe(0)
    expect(st.deleted.has('src-c1')).toBe(false)
    expect(st.deleted.has('src-c2')).toBe(true)
  })
  it('takes the engine held list as the truth', () => {
    const s = useLive.getState()
    s.apply([ev(chat('c1')), { v: 1, type: 'held', data: { event_id: 'c1', reason: 'scam' } }])
    s.syncHeld([chat('c9')])
    const st = useLive.getState()
    expect([...st.held.keys()]).toEqual(['c9'])
    expect(st.held.get('c9')).toMatch(/held/i)
    expect(st.heldEvents.get('c9')?.id).toBe('c9')
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
    expect(useLive.getState().notices, 'panic is never a banner').toHaveLength(0)
  })
  it('panic on, off, on: no banners, one toast with the latest state', () => {
    const frame = (on: boolean): LiveFrame => ({
      v: 1,
      type: 'notice',
      data: {
        key: 'panic',
        level: on ? 'warn' : 'info',
        message: on ? 'Panic mode is on. Chat is locked down.' : 'Panic mode is off.',
      },
    })
    for (const on of [true, false, true]) useLive.getState().apply([frame(on)])
    expect(useLive.getState().notices).toHaveLength(0)
    expect(useLive.getState().panic).toBe(true)
    const panicToasts = currentToasts().filter((t) => t.key === 'panic')
    expect(panicToasts).toHaveLength(1)
    expect(panicToasts[0]?.message).toMatch(/Panic mode is on/)
    expect(panicToasts[0]?.tone).toBe('warn')
  })
  it('a notice with the same key replaces the shown one', () => {
    const n = (key: string | undefined, message: string): LiveFrame =>
      ({ v: 1, type: 'notice', data: { key, level: 'warn', message } }) as LiveFrame
    useLive
      .getState()
      .apply([
        n('account:twitch', 'Twitch needs you to sign in again.'),
        n('discord', 'The Discord post didn’t go out.'),
        n('account:twitch', 'Twitch is connected.'),
        n(undefined, 'Same words.'),
        n(undefined, 'Same words.'),
      ])
    expect(useLive.getState().notices.map((x) => x.message)).toEqual([
      'The Discord post didn’t go out.',
      'Twitch is connected.',
      'Same words.',
    ])
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
      '#/import',
      '#/import/streamlabs',
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

describe('alert preview', () => {
  it('shrinks the stage as one picture on narrow screens only', () => {
    expect(stageScale(1280)).toBe(1)
    expect(stageScale(640)).toBe(1)
    expect(stageScale(335)).toBeCloseTo(335 / 640)
    expect(stageScale(0)).toBe(1)
  })
})

describe('a phone whose PC is off (M10)', () => {
  it('is limited only with the cloud bot standing in', () => {
    expect(isLimited({ role: 'mod', name: 'M', pcOnline: false, cloud: true })).toBe(true)
    expect(isLimited({ role: 'mod', name: 'M', pcOnline: false, cloud: false })).toBe(false)
    expect(isLimited({ role: 'owner', name: 'P', pcOnline: true, cloud: true })).toBe(false)
    expect(isLimited(null)).toBe(false)
  })

  it('the cloud’s chat replaces the screen, keeping newer lines that came meanwhile', () => {
    const at = (e: FerroEvent, t: number): FerroEvent => ({ ...e, occurred_at: t })
    const fetched = [at(chat('c1'), 10), at(chat('c2'), 20)]
    const current = [at(chat('p9'), 5), at(chat('c2'), 20), at(chat('c3'), 30)]
    expect(mergeChat(fetched, current).map((e) => e.id)).toEqual(['c1', 'c2', 'c3'])
    expect(mergeChat([], current).map((e) => e.id)).toEqual(['p9', 'c2', 'c3'])
  })

  it('a remote frame switches the mode and the store remembers the cloud', () => {
    useLive.setState({ remote: { role: 'owner', name: 'P', pcOnline: true } })
    const f = {
      v: 1,
      type: 'remote',
      data: { pc_online: false, role: 'owner', cloud: true, cloud_paused: false },
    } as LiveFrame
    useLive.getState().apply([f])
    expect(isLimited(useLive.getState().remote)).toBe(true)
  })

  it('remembers where the cloud bot can ban and whether history is shown', () => {
    useLive.setState({ remote: { role: 'owner', name: 'P', pcOnline: true } })
    useLive.getState().apply([
      {
        v: 1,
        type: 'remote',
        data: {
          pc_online: false,
          role: 'owner',
          cloud: true,
          cloud_paused: false,
          cloud_moderation: { twitch: true, kick: false },
          history: true,
        },
      } as LiveFrame,
    ])
    const r = useLive.getState().remote
    expect(r?.cloudModeration).toEqual({ twitch: true, kick: false })
    expect(r?.history).toBe(true)
    expect(cloudModerationKey(r?.cloudModeration)).toBe('twitch')
    expect(cloudModerationKey({})).toBe('')
  })

  it('back from the limited dashboard, the PC’s resync loads everything (TTS, stats, media)', async () => {
    const calls: string[] = []
    const call =
      <T>(name: string, v: T) =>
      async () => {
        calls.push(name)
        return v
      }
    const client = {
      status: call('status', { setup_done: true, connectors: {} }),
      chat: call('chat', []),
      events: call('events', { events: [], next_before: null }),
      queue: call('queue', null),
      ttsPending: call('tts', []),
      sessionStats: call('stats', { viewers: 12 }),
      refreshMediaTicket: call('media', undefined),
    }
    useLive.setState({
      conn: { mode: 'remote', client, socket: () => null } as unknown as Connection,
      remote: { role: 'owner', name: 'P', pcOnline: false, cloud: true },
    })
    useLive
      .getState()
      .apply([
        { v: 1, type: 'remote', data: { pc_online: true, role: 'owner' } } as LiveFrame,
        { v: 1, type: 'resync', data: { missed: 0 } } as LiveFrame,
      ])
    await vi.waitFor(() => expect(calls).toContain('stats'))
    expect(calls).toEqual(expect.arrayContaining(['status', 'tts', 'stats', 'media', 'queue']))
    expect(useLive.getState().viewers).toBe(12)
    // The next resync is the plain one again (no TTS or stats).
    calls.length = 0
    useLive.getState().apply([{ v: 1, type: 'resync', data: { missed: 0 } } as LiveFrame])
    await vi.waitFor(() => expect(calls).toContain('events'))
    expect(calls).not.toContain('tts')
  })
})

describe('what a chat line offers', () => {
  const line = (source_id: string | null, platform: 'twitch' | 'kick' = 'twitch'): FerroEvent => ({
    ...chat('c1'),
    platform,
    source_id,
  })
  it('never offers Delete without the platform’s message id', () => {
    expect(lineActions({}, line('m1')).remove).toBe(true)
    expect(lineActions({}, line(null)).remove).toBe(false)
  })
  it('with the PC off, only moderation where the cloud bot has the opt-in', () => {
    const offline = { offline: true, moderates: (p: string) => p === 'twitch' }
    expect(lineActions(offline, line('m1'))).toEqual({
      reply: false,
      card: false,
      remove: true,
      timeout: true,
      ban: true,
    })
    expect(Object.values(lineActions(offline, line('m2', 'kick'))).some(Boolean)).toBe(false)
  })
})
