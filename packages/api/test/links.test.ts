import { describe, expect, it, vi } from 'vitest'
import { DemoEngine, DEMO_TOKEN } from '../src/demo'
import {
  FerroClient,
  accountUrl,
  formatScheduleTime,
  normalizeDisplayLink,
  parseLiveFrame,
  resolveLayerItems,
  resolveLayerText,
  resolveLinks,
  validateCreatorLinks,
} from '../src'
import { scheduleApi } from '../src/schedule'

describe('links validation, normalization, and overlay tokens', () => {
  it('validates lengths, control chars, schemes, and custom rows', () => {
    expect(() => validateCreatorLinks({ discord: 'ok\nline', custom: [] })).toThrow(/discord/)
    expect(() => validateCreatorLinks({ website: 'a\0b', custom: [] })).toThrow(/website/)
    expect(() => validateCreatorLinks({ discord: '  JaVaScRiPt:alert(1)', custom: [] })).toThrow(
      /discord/,
    )
    expect(() =>
      validateCreatorLinks({ instagram: 'https://javascript:alert(1)', custom: [] }),
    ).toThrow(/instagram/)
    expect(() => validateCreatorLinks({ x: 'x'.repeat(121), custom: [] })).toThrow(/x:/)
    expect(() =>
      validateCreatorLinks({
        custom: Array.from({ length: 7 }, (_, i) => ({ label: `L${i}`, value: 'nova.gg' })),
      }),
    ).toThrow(/custom/)
    expect(() => validateCreatorLinks({ custom: [{ label: '', value: 'nova.gg' }] })).toThrow(
      /custom\.0\.label/,
    )

    const clean = validateCreatorLinks({
      discord: '  ',
      schedule_text: ' Saturdays 9 PM ',
      custom: [
        { label: '', value: '' },
        { label: ' Merch ', value: ' https://shop.nova.gg/ ' },
      ],
    })
    expect(clean.discord).toBeNull()
    expect(clean.schedule_text).toBe('Saturdays 9 PM')
    expect(clean.custom).toEqual([{ label: 'Merch', value: 'https://shop.nova.gg/' }])
  })

  it('derives account URLs cleanly per platform including YouTube legacy fallback', () => {
    expect(accountUrl('twitch', 'NovaGG', '1')).toBe('twitch.tv/novagg')
    expect(accountUrl('youtube', '@NovaPlays', 'UC1')).toBe('youtube.com/@NovaPlays')
    expect(accountUrl('youtube', 'Legacy Title With Spaces', 'UC_CH')).toBe(
      'youtube.com/channel/UC_CH',
    )
    expect(accountUrl('kick', 'novakick', '2')).toBe('kick.com/novakick')
    expect(accountUrl('facebook', 'My Page', 'fb1')).toBeNull()
    expect(normalizeDisplayLink('website', 'https://café.example/')).toBe('café.example')
  })

  it('resolves tokens and legacy placeholders in live and preview modes while keeping hand-edited text untouched', () => {
    const empty = resolveLinks({ custom: [] }, [], null)
    // Live mode never shows yourname and drops unconfigured items.
    expect(resolveLayerText('twitch.tv/yourname', empty, false)).toBe('')
    expect(resolveLayerText('Next stream: Friday, 8 PM', empty, false)).toBe('')
    expect(resolveLayerText('Next stream: {next_stream}', empty, false)).toBe('')
    expect(resolveLayerText('> ping {link:twitch}', empty, false)).toBe('')
    expect(resolveLayerItems('{socials}', undefined, empty, false)).toEqual([])
    expect(resolveLayerItems('', ['{socials}'], empty, false)).toEqual([])
    // Hand-edited text without tokens is NEVER modified.
    expect(resolveLayerText('Just vibing tonight — no socials', empty, false)).toBe(
      'Just vibing tonight — no socials',
    )
    expect(resolveLayerText('COUNTING DOWN {time}', empty, false)).toBe('COUNTING DOWN {time}')

    // Preview shows samples ONLY when nothing is connected or filled.
    expect(resolveLayerItems('{socials}', undefined, empty, true)).toEqual([
      'twitch.tv/novaplays',
      'youtube.com/@novaplays',
      'kick.com/novaplays',
      'discord.gg/novaplays',
    ])
    expect(resolveLayerText('Next stream: {next_stream}', empty, true)).toBe(
      'Next stream: Friday, 8 PM',
    )

    // Once Twitch is connected, preview uses real data (no fake Kick/Discord samples).
    const twitchOnly = resolveLinks(
      { custom: [] },
      [{ platform: 'twitch', name: 'Arsh', login: 'arsh', url: 'twitch.tv/arsh' }],
      null,
    )
    expect(resolveLayerItems('{socials}', undefined, twitchOnly, true)).toEqual(['twitch.tv/arsh'])
    expect(
      resolveLayerItems('TWITCH // {link:twitch}', ['KICK // {link:kick}'], twitchOnly, false),
    ).toEqual(['TWITCH // twitch.tv/arsh'])
    expect(resolveLayerText('TWITCH.TV/YOURNAME', twitchOnly, false)).toBe('TWITCH.TV/ARSH')
    expect(resolveLayerText('twitch.tv/yourname', twitchOnly, false)).toBe('twitch.tv/arsh')
    expect(resolveLayerText('kick.com/yourname', twitchOnly, false)).toBe('')
    expect(resolveLayerText('Next stream: {next_stream}', twitchOnly, true)).toBe('')

    // Legacy YouTube channel fallback avoids doubling youtube.com/@...
    const ytLegacy = resolveLinks(
      { custom: [] },
      [
        {
          platform: 'youtube',
          name: 'Channel',
          login: 'Legacy Name',
          url: 'youtube.com/channel/UC123',
        },
      ],
      null,
    )
    expect(resolveLayerText('youtube.com/@yourname', ytLegacy, false)).toBe(
      'youtube.com/channel/UC123',
    )

    // Schedule timestamp takes precedence over schedule_text and formats cleanly.
    const ms = new Date(2027, 0, 15, 20, 0, 0).getTime() // Friday, 8 PM local
    const withSched = resolveLinks({ schedule_text: 'Mondays 5 PM', custom: [] }, [], ms)
    expect(resolveLayerText('Next stream: {next_stream}', withSched, false)).toBe(
      `Next stream: ${formatScheduleTime(ms)}`,
    )
  })
})

describe('DemoEngine links, labels, and account URLs', () => {
  it('exposes login/url on accounts & connectors, serves /links and /labels, and pushes overlay updates', async () => {
    vi.useFakeTimers()
    const engine = new DemoEngine({ autoplay: false, latencyMs: 0 })
    const client = new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch })
    try {
      const [status, accts, labels, links] = await Promise.all([
        client.status(),
        client.accounts(),
        client.labels(),
        client.links(),
      ])

      const tw = accts.find((a) => a.platform === 'twitch')!
      const yt = accts.find((a) => a.platform === 'youtube')!
      expect(tw.login).toBe('novaplays')
      expect(tw.url).toBe('twitch.tv/novaplays')
      expect(yt.login).toBe('@NovaPlays')
      expect(yt.url).toBe('youtube.com/@NovaPlays')
      expect(status.connectors.twitch.account?.url).toBe('twitch.tv/novaplays')
      expect(status.connectors.youtube.account?.login).toBe('@NovaPlays')
      expect(labels.latest_follower).toBe('LunaLagoon')
      expect(labels.session_follows).toBe('23')
      expect(links.resolved.socials).toContain('twitch.tv/novaplays')

      const overlays = await client.overlays()
      const ov = overlays[0]!
      const tok = /\/o\/([^/]+)\//.exec(ov.url)![1]!
      const sock = engine.socket(`ws://127.0.0.1:47820/o/${tok}/ws`)
      const frames: Record<string, unknown>[] = []
      sock.onmessage = (ev) => frames.push(JSON.parse(String(ev.data)) as Record<string, unknown>)
      await vi.advanceTimersByTimeAsync(1)
      sock.send(JSON.stringify({ v: 1, type: 'hello', data: { since_seq: 0 } }))
      await vi.advanceTimersByTimeAsync(1)

      const snap = frames.find((f) => f.type === 'snapshot') as {
        data: { state: { links?: { twitch?: string } } }
      }
      expect(snap.data.state.links?.twitch).toBe('twitch.tv/novaplays')

      // Save links -> validates and broadcasts live state update to overlay.
      await expect(
        client.saveLinks({ discord: 'javascript:alert(1)', custom: [] }),
      ).rejects.toThrow()

      const updated = await client.saveLinks({
        discord: 'https://discord.gg/novahub/',
        schedule_text: 'Fridays, 8 PM',
        custom: [{ label: 'Merch', value: 'https://shop.nova.gg/' }],
      })
      expect(updated.resolved.discord).toBe('discord.gg/novahub')
      expect(updated.resolved.next_stream).toBe('Fridays, 8 PM')
      const stateFrame = frames.find(
        (f) =>
          f.type === 'state' &&
          (f.data as { links?: { discord?: string } }).links?.discord === 'discord.gg/novahub',
      )
      expect(stateFrame).toBeDefined()

      // Creating and deleting a schedule item updates overlay state live.
      const schedApi = scheduleApi(client)
      const startMs = Date.now() + 86_400_000
      const sched = await schedApi.create({
        info: { title: 'Weekend Run' },
        platforms: ['twitch'],
        start_ms: startMs,
      })
      const schedFrame = frames.find(
        (f) =>
          f.type === 'state' &&
          (f.data as { links?: { next_stream_at?: number | null } }).links?.next_stream_at ===
            startMs,
      )
      expect(schedFrame).toBeDefined()

      await schedApi.remove(sched.id)
      const clearedFrame = frames.at(-1) as {
        type: string
        data: { links?: { next_stream_at?: number | null; next_stream?: string | null } }
      }
      expect(clearedFrame.data.links?.next_stream_at).toBeNull()
      expect(clearedFrame.data.links?.next_stream).toBe('Fridays, 8 PM')

      // Disconnecting YouTube drops its auto-derived link live.
      await client.disconnect('youtube')
      const dcFrame = frames.at(-1) as {
        type: string
        data: { links?: { youtube?: string | null } }
      }
      expect(dcFrame.data.links?.youtube).toBeNull()
      sock.close()
    } finally {
      engine.dispose()
      vi.useRealTimers()
    }
  })

  it('parses live links frames and broadcasts them on DemoEngine live socket', async () => {
    vi.useFakeTimers()
    const valid = parseLiveFrame(
      JSON.stringify({
        v: 1,
        type: 'links',
        data: {
          custom: [],
          resolved: {
            twitch: 'twitch.tv/nova',
            custom: [],
            socials: ['twitch.tv/nova'],
          },
        },
      }),
    )
    expect(valid?.type).toBe('links')
    expect(parseLiveFrame(JSON.stringify({ v: 1, type: 'links', data: {} }))).toBeNull()
    expect(
      parseLiveFrame(
        JSON.stringify({
          v: 1,
          type: 'links',
          data: { resolved: { custom: 'bad', socials: [] } },
        }),
      ),
    ).toBeNull()

    const engine = new DemoEngine({ autoplay: false, latencyMs: 0 })
    const client = new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch })
    try {
      const liveSock = engine.socket(`ws://127.0.0.1:47820/api/v1/live?session=${DEMO_TOKEN}`)
      const liveFrames: Record<string, unknown>[] = []
      liveSock.onmessage = (ev) =>
        liveFrames.push(JSON.parse(String(ev.data)) as Record<string, unknown>)
      await vi.advanceTimersByTimeAsync(1)

      await client.saveLinks({ discord: 'https://discord.gg/liveframe' })
      const linkLive = liveFrames.find((f) => f.type === 'links') as
        { data?: { resolved?: { discord?: string } } } | undefined
      expect(linkLive?.data?.resolved?.discord).toBe('discord.gg/liveframe')
      liveSock.close()
    } finally {
      engine.dispose()
      vi.useRealTimers()
    }
  })
})
