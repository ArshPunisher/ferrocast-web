import { afterEach, describe, expect, it } from 'vitest'
import {
  cloudBotApi,
  cloudBotCanEnable,
  cloudChannel,
  describeCloudBotError,
  cloudAvailable,
  dropLine,
  dutyLine,
  issueMessage,
  lastReplyLine,
  platformList,
  quotaBackLine,
  quotaLine,
  quotaUsedUpLine,
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
    expect(platformList(['twitch', 'kick', 'youtube'])).toBe('Twitch, Kick and YouTube')
    expect(platformList(['twitch', 'youtube'])).toBe('Twitch and YouTube')
    expect(platformList(['kick'])).toBe('Kick')
    expect(platformList([])).toBe('')
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

  it('needs Kick in Accounts', async () => {
    const { api, e } = setup()
    e.setCloudBot({ kickLinked: false })
    expect((await fails(api.connect('kick'))).code).toBe('kick_not_linked')
    const nope = await fails(api.connect('tiktok' as 'kick'))
    expect([nope.status, nope.code]).toEqual([404, 'platform_not_found'])
  })
})

describe('the YouTube cloud bot (M12)', () => {
  it('words the daily units and when they are back', () => {
    const q = { used: 212, limit: 1500, reset_at: Date.UTC(2026, 9, 20, 7), exhausted: false }
    expect(quotaLine(q)).toBe('Uses about 212 of 1,500 YouTube units today')
    expect(quotaLine({ ...q, used: 1499.6 })).toBe('Uses about 1,500 of 1,500 YouTube units today')
    expect(quotaLine(null)).toBeNull()
    expect(quotaUsedUpLine(q.reset_at)).toMatch(
      /^YouTube’s daily limit for the cloud bot is used up; it’s back at \d{1,2}:\d\d(\s?[AP]M)?\.$/i,
    )
    expect(quotaBackLine(q.reset_at)).toMatch(/^It’s back at /)
    expect(quotaBackLine(null)).toBeNull()
    // The relay's words say UTC; the dashboard shows the viewer's own clock.
    const e = {
      code: 'youtube_quota',
      message: '… 07:00 UTC.',
      hint: 'h',
      at: 1,
      reset_at: q.reset_at,
    }
    expect(issueMessage(e)).toBe(quotaUsedUpLine(q.reset_at))
    expect(issueMessage({ ...e, code: 'youtube_refused' })).toBe('… 07:00 UTC.')
    expect(describeCloudBotError(new ApiError(429, 'youtube_quota', '', null)).hint).toMatch(
      /midnight Pacific/,
    )
  })

  it('treats a relay without YouTube as not having it', () => {
    expect(cloudAvailable({ available: { twitch: true, kick: true } }, 'youtube')).toBe(false)
    expect(
      cloudAvailable({ available: { twitch: true, kick: true, youtube: true } }, 'youtube'),
    ).toBe(true)
  })

  let engine: DemoEngine | null = null
  afterEach(() => {
    engine?.dispose()
    engine = null
  })
  const setup = () => {
    engine = new DemoEngine({
      autoplay: false,
      latencyMs: 0,
      pro: { salesOpen: true, active: true, features: true },
    })
    const c = new FerroClient({
      base: 'http://127.0.0.1:47820',
      token: DEMO_TOKEN,
      fetch: engine.fetch,
      startupRetries: 0,
    })
    return { e: engine, api: cloudBotApi(c) }
  }

  it('connects YouTube in one Google step, a beta with its units', async () => {
    const { api } = setup()
    let v = await api.get()
    expect(v.available.youtube).toBe(true)
    expect(v.limits.youtube_daily_units).toBe(1500)
    const link = await api.connect('youtube')
    expect(link.auth_url).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth/)
    expect(link.auth_url).toContain('youtube.force-ssl')
    v = await api.get()
    const y = cloudChannel(v, 'youtube')
    expect(y).toMatchObject({ state: 'ready', beta: true, moderation: false })
    expect(y?.quota).toMatchObject({ limit: 1500, exhausted: false })
    const again = await api.connect('youtube').then(
      () => null,
      (x: unknown) => x as ApiError,
    )
    expect(again?.code).toBe('already_connected')
    await expect(api.connect('youtube', { moderation: true })).resolves.toBeTruthy()
    expect(cloudChannel(await api.get(), 'youtube')?.moderation).toBe(true)
    await api.disconnect('youtube')
    expect(cloudChannel(await api.get(), 'youtube')).toBeNull()
  })

  it('needs YouTube in Accounts and shows a spent budget', async () => {
    const { api, e } = setup()
    e.setCloudBot({ youtubeLinked: false })
    const err = await api.connect('youtube').then(
      () => null,
      (x: unknown) => x as ApiError,
    )
    expect([err?.status, err?.code]).toEqual([409, 'youtube_not_linked'])
    e.setCloudBot({ youtube: 'quota' })
    const y = cloudChannel(await api.get(), 'youtube')
    expect(y?.quota?.exhausted).toBe(true)
    expect(y?.error?.code).toBe('youtube_quota')
    expect(y?.error?.reset_at).toBeGreaterThan(Date.now())
  })
})
