import { afterEach, describe, expect, it } from 'vitest'
import {
  cloudBotApi,
  cloudBotCanEnable,
  cloudChannel,
  describeCloudBotError,
  dropLine,
  dutyLine,
  lastReplyLine,
  syncLine,
  type CloudBotChannel,
} from '../src/cloud-bot'
import { DemoEngine, DEMO_TOKEN } from '../src/demo'
import { FerroClient } from '../src/client'
import { ApiError } from '../src/errors'

const ch = (c: Partial<CloudBotChannel>): CloudBotChannel => ({
  platform: 'twitch',
  state: 'ready',
  bot: { id: '1', login: 'AshaBot' },
  channel: { id: '2', login: 'Asha' },
  moderation: false,
  connected_at: 0,
  last_reply_at: null,
  error: null,
  ...c,
})

describe('cloud bot helpers', () => {
  it('says who answers chat', () => {
    expect(
      dutyLine({ enabled: false, duty: { who: 'off', since: null, desktop_seen_at: null } }),
    ).toMatchObject({ tone: 'off', title: 'Off' })
    expect(
      dutyLine({ enabled: true, duty: { who: 'desktop', since: 1, desktop_seen_at: 1 } }),
    ).toMatchObject({ tone: 'standby', title: 'Standing by' })
    const since = new Date(2026, 9, 19, 21, 40).getTime()
    expect(
      dutyLine({ enabled: true, duty: { who: 'cloud', since, desktop_seen_at: null } }).title,
    ).toMatch(/^On duty since (21:40|9:40\s?PM)$/i)
    // Enabled but no ready channel reads as off.
    expect(
      dutyLine({ enabled: true, duty: { who: 'off', since: null, desktop_seen_at: null } }).tone,
    ).toBe('off')
  })

  it('words the duty line for a phone, another PC and a split by platform', () => {
    const desk = { enabled: true, duty: { who: 'desktop' as const, since: 1, desktop_seen_at: 1 } }
    expect(dutyLine(desk).detail).toMatch(/^This PC is answering/)
    expect(dutyLine(desk, { phone: true }).detail).toMatch(/^Your PC is answering/)
    expect(dutyLine({ ...desk, duty: { ...desk.duty, this_pc: false } }).detail).toMatch(
      /^Another of your PCs is answering/,
    )
    expect(dutyLine({ enabled: false, duty: desk.duty }, { phone: true }).detail).toBe(
      'Only your PC answers chat.',
    )
    const cloud = { enabled: true, duty: { who: 'cloud' as const, since: 1, desktop_seen_at: 1 } }
    expect(dutyLine(cloud).detail).toBe('No PC is answering, so Ferrocast’s servers answer chat.')
    const split = dutyLine({
      ...cloud,
      channels: [ch({ duty: 'desktop' }), ch({ platform: 'kick', duty: 'cloud' })],
    })
    expect(split.detail).toBe('Ferrocast’s servers answer Kick. This PC answers Twitch.')
  })

  it('notes a dropped reply until a later one goes out', () => {
    expect(dropLine({ last_drop: null, last_reply_at: null })).toBeNull()
    const at = new Date(2026, 9, 19, 21, 40).getTime()
    expect(dropLine({ last_drop: { reason: 'slow mode', at }, last_reply_at: at - 1 })).toMatch(
      /^A reply wasn’t shown at (21:40|9:40\s?PM): slow mode$/i,
    )
    expect(dropLine({ last_drop: { reason: 'slow mode', at }, last_reply_at: at + 1 })).toBeNull()
  })

  it('reads the last reply and the sync in words', () => {
    const now = 10_000_000_000
    expect(lastReplyLine(null, now)).toBe('No replies yet')
    expect(lastReplyLine(now - 10_000, now)).toBe('Last reply just now')
    expect(lastReplyLine(now - 5 * 60_000, now)).toBe('Last reply 5 min ago')
    expect(lastReplyLine(now - 3 * 3_600_000, now)).toBe('Last reply 3 h ago')
    expect(syncLine({ state: 'pending', version: 1, synced_at: null, error: null })).toMatch(
      /Sending/,
    )
    expect(
      syncLine({
        state: 'error',
        version: 1,
        synced_at: null,
        error: { code: 'too_many_timers', message: 'Up to 50 timers.', hint: '' },
      }),
    ).toBe('Up to 50 timers.')
    expect(syncLine({ state: 'off', version: 0, synced_at: null, error: null })).toMatch(/off/)
  })

  it('switches on only with a ready channel', () => {
    expect(cloudBotCanEnable({ channels: [] })).toBe(false)
    expect(cloudBotCanEnable({ channels: [ch({ state: 'needs_channel', channel: null })] })).toBe(
      false,
    )
    expect(
      cloudBotCanEnable({ channels: [ch({ state: 'error' }), ch({ platform: 'kick' })] }),
    ).toBe(true)
    expect(cloudChannel({ channels: [ch({ platform: 'kick' })] }, 'twitch')).toBeNull()
  })

  it('fills in a hint for the cloud bot’s codes', () => {
    const d = describeCloudBotError(new ApiError(409, 'kick_not_linked', 'Connect Kick first.', ''))
    expect(d).toEqual({
      message: 'Connect Kick first.',
      hint: 'Kick’s chat reaches the cloud through that connection.',
    })
    const own = describeCloudBotError(new ApiError(502, 'relay_unreachable', 'Down.', 'Own hint.'))
    expect(own.hint).toBe('Own hint.')
    expect(describeCloudBotError(new Error('x')).message).toBe('Something went wrong.')
  })
})

describe('the cloud bot in the demo', () => {
  let engine: DemoEngine | null = null
  afterEach(() => {
    engine?.dispose()
    engine = null
  })
  const setup = (active = true) => {
    engine = new DemoEngine({
      autoplay: false,
      latencyMs: 0,
      pro: { salesOpen: true, active, features: true },
    })
    const c = new FerroClient({
      base: 'http://127.0.0.1:47820',
      token: DEMO_TOKEN,
      fetch: engine.fetch,
      startupRetries: 0,
    })
    return { e: engine, api: cloudBotApi(c) }
  }
  const fails = async (p: Promise<unknown>) => {
    const e = await p.then(
      () => null,
      (x: unknown) => x,
    )
    expect(e).toBeInstanceOf(ApiError)
    return e as ApiError
  }

  it('answers 402 without Pro', async () => {
    const { api } = setup(false)
    const e = await fails(api.get())
    expect([e.status, e.code]).toEqual([402, 'pro_required'])
  })

  it('starts with Twitch ready and the PC answering', async () => {
    const { api, e } = setup()
    const v = await api.get()
    expect(v.enabled).toBe(true)
    expect(v.duty.who).toBe('desktop')
    expect(cloudChannel(v, 'twitch')?.state).toBe('ready')
    expect(cloudChannel(v, 'kick')).toBeNull()
    e.setCloudBot({ onDuty: true })
    expect((await api.get()).duty.who).toBe('cloud')
  })

  it('connects Twitch in two steps and Kick in one', async () => {
    const { api } = setup()
    await api.disconnect('twitch')
    let v = await api.get()
    expect(v.channels).toEqual([])
    expect(v.enabled).toBe(false)
    expect((await fails(api.setEnabled(true))).code).toBe('no_platform')

    const bot = await api.connect('twitch', { account: 'bot' })
    expect(bot.auth_url).toMatch(/^https:\/\/id\.twitch\.tv\/oauth2\/authorize/)
    expect(bot.auth_url).toContain('user%3Abot')
    v = await api.get()
    expect(cloudChannel(v, 'twitch')).toMatchObject({ state: 'needs_channel', channel: null })
    expect((await fails(api.setEnabled(true))).code).toBe('no_platform')
    const chan = await api.connect('twitch', { account: 'channel' })
    expect(chan.auth_url).toContain('channel%3Abot')
    v = await api.get()
    expect(cloudChannel(v, 'twitch')?.state).toBe('ready')
    expect((await api.setEnabled(true)).enabled).toBe(true)

    expect((await fails(api.connect('twitch'))).code).toBe('already_connected')
    await api.connect('kick')
    v = await api.get()
    expect(cloudChannel(v, 'kick')?.state).toBe('ready')
    expect((await fails(api.connect('kick'))).code).toBe('already_connected')
  })

  it('tries a retryable error again, never a sign-out', async () => {
    const { api, e } = setup()
    e.setCloudBot({ twitchUnreachable: true })
    const v = await api.get()
    expect(cloudChannel(v, 'twitch')?.error).toMatchObject({
      code: 'twitch_unavailable',
      retry: true,
    })
    expect(v.pc_code).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/)
    expect(cloudChannel(await api.retry('twitch'), 'twitch')?.error).toBeNull()
    e.setCloudBot({ twitchError: true })
    expect((await fails(api.retry('twitch'))).code).toBe('connect_again')
    expect((await fails(api.retry('kick'))).code).toBe('not_connected')
  })

  it('needs Kick in Accounts, and YouTube comes later', async () => {
    const { api, e } = setup()
    e.setCloudBot({ kickLinked: false })
    expect((await fails(api.connect('kick'))).code).toBe('kick_not_linked')
    const yt = await fails(api.connect('youtube' as 'kick'))
    expect([yt.status, yt.code]).toEqual([503, 'platform_unavailable'])
    const nope = await fails(api.connect('tiktok' as 'kick'))
    expect([nope.status, nope.code]).toEqual([404, 'platform_not_found'])
  })
})
