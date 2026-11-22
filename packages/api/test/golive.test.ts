import { describe, expect, it, vi } from 'vitest'
import {
  KICK_MULTISTREAM_DETAIL,
  allDestinationsFailed,
  directKind,
  aitumClashes,
  andList,
  checkAdvanced,
  checkCut,
  goliveApi,
  goingTo,
  healthText,
  linkText,
  mbps,
  reconnectingText,
  viaOf,
  withVia,
  type DestinationView,
} from '../src/golive'
import { remoteAllowed } from '../src/remote'
import { studioApi } from '../src/studio'
import { DemoEngine, DEMO_TOKEN } from '../src/demo'
import { FerroClient } from '../src/client'
import { ApiError } from '../src/errors'

function demo() {
  const engine = new DemoEngine({ autoplay: false, latencyMs: 0 })
  const client = new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch })
  return { engine, client, api: goliveApi(client), studio: studioApi(client) }
}

async function refusal(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p
  } catch (e) {
    if (e instanceof ApiError) return e
    throw e
  }
  throw new Error('expected a refusal')
}

describe('demo: Go live everywhere', () => {
  it('lists the platforms top first, with OBS not set up yet', async () => {
    const { api } = demo()
    const v = await api.view()
    expect(v.ingest).toBe('rtmp://127.0.0.1:1935/live')
    expect(v.destinations.map((d) => [d.id, d.enabled])).toEqual([
      ['twitch', true],
      ['youtube', true],
      ['kick', false],
      ['youtube_vertical', false],
    ])
    expect(v.obs.points_here).toBe(false)
    expect(v.live).toBe(false)
  })

  it('saves the order, refuses a bad list, and adds and removes a custom server', async () => {
    const { api } = demo()
    const saved = await api.saveOrder([
      { id: 'kick', enabled: true },
      { id: 'twitch', enabled: true },
      { id: 'youtube', enabled: false },
      { id: 'youtube_vertical', enabled: false },
    ])
    expect(saved.destinations.map((d) => d.id)).toEqual([
      'kick',
      'twitch',
      'youtube',
      'youtube_vertical',
    ])
    expect((await refusal(api.saveOrder([{ id: 'kick', enabled: true }]))).status).toBe(400)
    const bad = await refusal(api.addCustom('Backup', 'ftp://x.com/live', 'k'))
    expect(bad.message).toContain('rtmp://')
    // SRT, RIST and WebRTC: the key may be empty; main picture only; shown as direct.
    const srt = await api.addCustom('Studio SRT', 'srt://10.0.0.5:9000?latency=200', '')
    expect(srt.url).toBe('srt://10.0.0.5:9000?latency=200')
    expect(
      (await refusal(api.addCustom('V', 'srt://10.0.0.5:9000', '', 'vertical'))).message,
    ).toContain('main picture')
    expect((await refusal(api.addCustom('Empty', 'rtmp://x.com/live', ''))).status).toBe(400)
    const row = (await api.view()).destinations.find((d) => d.id === srt.id)
    expect(row).toMatchObject({ direct: 'srt', account: '10.0.0.5:9000' })
    await api.removeCustom(srt.id)
    expect((await refusal(api.addCustom('Backup', 'rtmp://x.com', 'k'))).message).toContain(
      'after the host',
    )
    expect((await refusal(api.addCustom('Backup', 'rtmp://x.com/live', 'a b'))).message).toContain(
      'without spaces',
    )
    const c = await api.addCustom('Backup PC', 'rtmp://Backup.local/live/', 'k1')
    expect(c).toMatchObject({
      kind: 'custom',
      name: 'Backup PC',
      url: 'rtmp://Backup.local/live',
      enabled: true,
    })
    const v = await api.view()
    expect(v.destinations.at(-1)?.account).toBe('backup.local')
    expect((await refusal(api.removeCustom('twitch'))).status).toBe(400)
    expect((await refusal(api.removeCustom('c_nope'))).status).toBe(404)
    await api.removeCustom(c.id)
    expect((await api.view()).destinations).toHaveLength(4)
  })

  it("Enhanced Broadcasting is Twitch's main picture only, and shows in the view", async () => {
    const { api } = demo()
    const saved = await api.setEnhanced('twitch', true)
    expect(saved.destinations.find((d) => d.id === 'twitch')?.enhanced).toBe(true)
    expect((await api.view()).destinations.find((d) => d.id === 'twitch')?.enhanced).toBe(true)
    expect((await refusal(api.setEnhanced('youtube', true))).status).toBe(422)
    const off = await api.setEnhanced('twitch', false)
    expect(off.destinations.every((d) => !d.enhanced)).toBe(true)
  })

  it('points OBS here and puts it back, never while OBS streams', async () => {
    const { api, studio } = demo()
    const nothing = await refusal(api.restoreObs())
    expect(nothing.code).toBe('golive_nothing_saved')
    // The demo's OBS is streaming: OBS's setting can't change now.
    expect((await refusal(api.pointObs())).code).toBe('obs_streaming')
    await studio.setObsStream(false)
    const s = await api.pointObs()
    expect(s.points_here && s.before === 'Twitch').toBe(true)
    const back = await api.restoreObs()
    expect(back.points_here).toBe(false)
  })

  it('the upload check gives a verdict in words', async () => {
    const { engine, api } = demo()
    const ok = await api.uploadCheck()
    expect(ok.measured_by).toBe('twitch')
    expect(ok.verdict.fits).toBe(true)
    expect(ok.rows.map((r) => r.name)).toEqual(['Twitch', 'YouTube'])
    engine.setGoLive({ upload_kbps: 9000 })
    const slow = await api.uploadCheck()
    expect(slow.verdict.fits).toBe(false)
    expect(slow.verdict.message).toBe(
      '2 platforms need 12 Mbps; you have 9.0 Mbps. Send 1 platform at this quality, or all 2 at about 3.6 Mbps each (lower the bitrate in OBS).',
    )
    await api.saveOrder([
      { id: 'twitch', enabled: false },
      { id: 'youtube', enabled: false },
      { id: 'kick', enabled: false },
      { id: 'youtube_vertical', enabled: false },
    ])
    const none = await api.uploadCheck()
    expect(none.rows).toEqual([])
    expect(none.verdict.message).toBe('Your upload is 9.0 Mbps. Turn on a platform to check it.')
  })
})

describe('demo: upload protection', () => {
  it('pauses the bottom platform on a weak upload, and Resume now brings it back', async () => {
    vi.useFakeTimers()
    try {
      const { engine, client, api } = demo()
      engine.setGoLive({ points_here: true, upload_kbps: 9000 })
      const first = await api.view()
      expect(first.protect).toBe(true)
      expect(first.destinations.filter((d) => d.health?.state === 'live')).toHaveLength(2)
      await vi.advanceTimersByTimeAsync(10_000)
      const v = await api.view()
      const yt = v.destinations.find((d) => d.id === 'youtube')
      expect(yt?.health).toMatchObject({ state: 'paused' })
      expect(healthText(yt?.health ?? null, null)).toMatchObject({
        tone: 'paused',
        label: 'Paused',
        detail:
          'Your upload dipped, so this paused to keep Twitch smooth. It comes back by itself.',
      })
      // Twitch, the top one, keeps going; the last one live never pauses.
      expect(v.destinations.find((d) => d.id === 'twitch')?.health?.state).toBe('live')
      await vi.advanceTimersByTimeAsync(20_000)
      expect((await api.view()).destinations[0]?.health?.state).toBe('live')

      await api.resume('youtube')
      expect((await api.view()).destinations[1]?.health?.state).toBe('live')
      expect((await refusal(api.resume('youtube'))).code).toBe('golive_not_paused')

      // Switched off: nothing pauses, and the setting shows.
      expect((await api.setProtect(false)).protect).toBe(false)
      await vi.advanceTimersByTimeAsync(15_000)
      const off = await api.view()
      expect(off.protect).toBe(false)
      expect(off.destinations.some((d) => d.health?.state === 'paused')).toBe(false)
      const bad = await refusal(client.request('PUT', '/api/v1/golive/protection', { on: 'yes' }))
      expect(bad.status).toBe(400)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('cut layout checks', () => {
  it('names the field, and odd bodies are a message not a crash', async () => {
    const { api, client } = demo()
    const ok = (await api.view()).cut.config
    expect(checkCut(ok)).toBeNull()
    expect(checkCut(null)).toMatch(/object/)
    expect(checkCut({ ...ok, game: undefined })).toMatch(/^game:/)
    expect(checkCut({ ...ok, camera: { x: 0.9, y: 0, w: 0.3, h: 0.2 } })).toMatch(/^camera: .*edge/)
    expect(checkCut({ ...ok, layout: 'game_only', camera: null })).toBeNull()
    expect(checkCut({ ...ok, camera_share: '38' })).toMatch(/^camera_share:/)
    expect(checkCut({ ...ok, layout: 'tiles' })).toMatch(/^layout:/)
    expect(checkCut({ ...ok, width: 1080, height: 1280 })).toMatch(/^size:/)
    expect(checkCut({ ...ok, fps: 50 })).toMatch(/^fps:/)
    expect(checkCut({ ...ok, kbps: 20000 })).toMatch(/^kbps:/)
    const bad = await refusal(
      client.request('PUT', '/api/v1/golive/vertical/cut', { layout: 'camera_top' }),
    )
    expect(bad.status).toBe(400)
    await api.setVerticalCut({ ...ok, layout: 'game_only' })
    expect((await api.view()).cut.config.layout).toBe('game_only')
    expect(
      (await refusal(client.request('PUT', '/api/v1/golive/vertical/source', { source: 'x' })))
        .status,
    ).toBe(400)
  })
})

describe('advanced settings', () => {
  it('are checked like the engine and saved by the demo', async () => {
    const { api, client } = demo()
    const v = await api.view()
    const ids = v.destinations.map((d) => d.id)
    const a = v.advanced
    expect(checkAdvanced(a, ids)).toBeNull()
    expect(checkAdvanced({ ...a, rules: { ...a.rules, slow_pct: 99 } }, ids)).toMatch(
      /^rules\.slow_pct:/,
    )
    expect(checkAdvanced({ ...a, rules: { ...a.rules, max_pause_s: 30 } }, ids)).toMatch(
      /^rules\.max_pause_s:/,
    )
    expect(checkAdvanced({ ...a, rules: { ...a.rules, first_to_pause: 'nope' } }, ids)).toMatch(
      /first_to_pause/,
    )
    expect(checkAdvanced({ ...a, port: 80 }, ids)).toMatch(/^port:/)
    // The IP version and the pinned connection (the engine's rules).
    expect(checkAdvanced({ ...a, ip_family: 'v4', bind: 'en7' }, ids)).toBeNull()
    expect(checkAdvanced({ ...a, ip_family: 'v6', bind: null }, ids)).toBeNull()
    expect(checkAdvanced({ ...a, ip_family: 'v5' as never }, ids)).toMatch(/^ip_family:/)
    expect(checkAdvanced({ ...a, bind: '  ' }, ids)).toMatch(/^bind:/)
    const per = (d: Partial<(typeof a.per)[string]>) => ({
      ...a,
      per: { twitch: { server: null, first_retry_s: 1, max_retry_s: 30, ...d } },
    })
    expect(checkAdvanced(per({ server: 'https://x' }), ids)).toMatch(/^per\.twitch\.server:/)
    expect(checkAdvanced(per({ first_retry_s: 0 }), ids)).toMatch(/first_retry_s/)
    expect(checkAdvanced(per({ server: 'rtmps://live-fra.twitch.tv/app' }), ids)).toBeNull()
    expect(checkAdvanced(null as never, ids)).toMatch(/^rules:/)
    const saved = await api.setAdvanced({ ...per({ first_retry_s: 2 }), keep_free_pct: 30 })
    expect(saved.advanced.keep_free_pct).toBe(30)
    expect((await api.view()).advanced.per.twitch?.first_retry_s).toBe(2)
    expect(
      (await refusal(client.request('PUT', '/api/v1/golive/advanced', { rules: 1 }))).status,
    ).toBe(400)
    expect(checkAdvanced({ ...a, ignore_service_limits: 'yes' as never }, ids)).toMatch(
      /ignore_service_limits/,
    )
    expect(checkAdvanced({ ...a, ignore_service_limits: true }, ids)).toBeNull()
    expect(checkAdvanced({ ...a, ignore_service_limits: false }, ids)).toBeNull()
    const withIgnore = await api.setAdvanced({ ...a, ignore_service_limits: true })
    expect(withIgnore.advanced.ignore_service_limits).toBe(true)
    expect((await api.view()).advanced.ignore_service_limits).toBe(true)
    await api.newKey()
  })

  it('demo emits structured rule issues for codec, keyint and bitrate, exempting Twitch Enhanced', async () => {
    const { engine, api } = demo()
    engine.setGoLive({
      points_here: true,
      kbps: 9000,
      codec: 'hevc',
      keyframe_interval_ms: 4000,
    })
    const live = await api.view()
    const twitch = live.destinations.find((d) => d.id === 'twitch')
    expect(twitch?.issues).toEqual([
      expect.objectContaining({ code: 'codec', summary: 'Twitch requires H.264' }),
      expect.objectContaining({
        code: 'keyint',
        summary: 'Keyframes every 4.0 s (need 2 s)',
      }),
      expect.objectContaining({
        code: 'bitrate',
        summary: 'Over Twitch’s 6,000 kbps limit',
        fix_kbps: 5500,
      }),
    ])
    expect(twitch?.issues?.find((i) => i.code === 'codec')?.fix_kbps).toBeUndefined()
    await api.setEnhanced('twitch', true)
    const enhanced = await api.view()
    expect(enhanced.destinations.find((d) => d.id === 'twitch')?.issues).toEqual([])
  })
})

describe('demo: vertical canvas', () => {
  it('Aitum Vertical is pointed here; only vertical destinations get its stream', async () => {
    const { engine, api, studio } = demo()
    const v = await api.view()
    expect(v.obs.vertical).toEqual({ points_here: false, streaming: false, before: null })
    expect(v.destinations.find((d) => d.id === 'youtube_vertical')?.name).toBe(
      'YouTube Shorts live',
    )
    const pointed = await api.pointVertical()
    expect(pointed?.points_here).toBe(true)
    await api.saveOrder(
      v.destinations.map((d) => ({ id: d.id, enabled: d.id === 'youtube_vertical' })),
    )
    engine.setGoLive({ vertical: { streaming: true } })
    await studio.setObsStream(false)
    const live = await api.view()
    expect(live.vertical_live).toBe(true)
    expect(live.live).toBe(false)
    expect(live.vertical_stats.height).toBe(1920)
    expect(live.destinations.find((d) => d.id === 'youtube_vertical')?.health?.state).toBe('live')
    expect((await refusal(api.restoreVertical())).code).toBe('obs_streaming')
    engine.setGoLive({ vertical: { streaming: false } })
    expect((await api.restoreVertical())?.points_here).toBe(false)
    expect((await refusal(api.restoreVertical())).code).toBe('golive_nothing_saved')
    const c = await api.addCustom('Shorts box', 'rtmp://box.local/live', 'k', 'vertical')
    expect(c.canvas).toBe('vertical')
    engine.setGoLive({ vertical: { installed: false } })
    expect((await api.view()).obs.vertical).toBeNull()
    expect((await refusal(api.pointVertical())).code).toBe('aitum_vertical_missing')
  })
})

describe('Aitum Multistream', () => {
  const dests = [
    { id: 'twitch', kind: 'twitch' as const, name: 'Twitch', enabled: true },
    { id: 'youtube', kind: 'youtube' as const, name: 'YouTube', enabled: true },
    { id: 'kick', kind: 'kick' as const, name: 'Kick', enabled: false },
  ]
  const outs = [
    { name: 'Twitch Output', platform: 'twitch' as const, live: true },
    { name: 'Kick', platform: 'kick' as const, live: true },
    { name: 'Backup', platform: null, live: true },
    { name: 'YT', platform: 'youtube' as const, live: false },
  ]

  it('only ticked platforms clash; live ones while live', () => {
    expect(aitumClashes(null, dests)).toEqual([])
    expect(aitumClashes(outs, dests).map((c) => c.name)).toEqual(['Twitch', 'YouTube'])
    expect(aitumClashes(outs, dests, true)).toEqual([
      { id: 'twitch', name: 'Twitch', outputs: ['Twitch Output'] },
    ])
    expect(andList(['Twitch'])).toBe('Twitch')
    expect(andList(['Twitch', 'YouTube', 'Kick'])).toBe('Twitch, YouTube and Kick')
  })

  it('the demo reports outputs and saves "on purpose"', async () => {
    const { engine, api } = demo()
    expect((await api.view()).obs.aitum).toBeNull()
    engine.setGoLive({ aitum: outs })
    const v = await api.view()
    expect(v.obs.aitum).toHaveLength(4)
    expect(v.aitum_ok).toBe(false)
    expect((await api.setAitumOk(true)).aitum_ok).toBe(true)
    expect((await api.view()).aitum_ok).toBe(true)
  })
})

describe('Go live words', () => {
  it('health lines', () => {
    expect(healthText(null, null)).toMatchObject({ tone: 'off', label: 'Waiting for OBS' })
    expect(healthText(null, 'Connect Kick first.')).toMatchObject({
      tone: 'bad',
      detail: 'Connect Kick first.',
    })
    expect(healthText({ state: 'live', kbps: 6100, dropped: 0, since_ms: 0 }, null)).toMatchObject({
      tone: 'ok',
      label: 'Live',
      detail: '6.1 Mbps',
    })
    expect(
      healthText(
        {
          state: 'reconnecting',
          attempt: 3,
          retry_in_ms: 3900,
          reason: 'Kick’s server didn’t answer.',
          kbps: 0,
          dropped: 0,
          since_ms: 0,
        },
        null,
      ),
    ).toMatchObject({
      tone: 'warn',
      label: 'Reconnecting, try 3',
      detail: 'Kick’s server didn’t answer. Trying again in 4 s.',
    })
  })

  it('counts and speeds', () => {
    expect(mbps(9600)).toBe('9.6 Mbps')
    expect(mbps(24000)).toBe('24 Mbps')
    expect(goingTo([{ enabled: true }, { enabled: false }])).toBe('Going to 1 place')
    expect(goingTo([{ enabled: true }, { enabled: true }, { enabled: true }])).toBe(
      'Going to 3 places',
    )
    expect(goingTo([])).toBe('No platform ticked')
  })

  it('a phone may watch and tick, never read the key or add a server', () => {
    expect(remoteAllowed('owner', 'GET', '/golive')).toBe(true)
    expect(remoteAllowed('owner', 'PUT', '/golive/destinations')).toBe(true)
    expect(remoteAllowed('owner', 'GET', '/golive/ingest')).toBe(false)
    expect(remoteAllowed('owner', 'POST', '/golive/destinations')).toBe(false)
    expect(remoteAllowed('owner', 'DELETE', '/golive/destinations/c_1')).toBe(false)
    expect(remoteAllowed('owner', 'POST', '/golive/resume/kick')).toBe(true)
    expect(remoteAllowed('owner', 'PUT', '/golive/protection')).toBe(true)
    expect(remoteAllowed('owner', 'PUT', '/golive/aitum')).toBe(true)
    expect(remoteAllowed('mod', 'GET', '/golive')).toBe(false)
  })
})

describe("a direct destination's network in words", () => {
  const live = { state: 'live', kbps: 6000, dropped: 0, since_ms: 0 } as const
  it('says how the network is doing beside the rate', () => {
    expect(healthText({ ...live, link: { rtt_ms: 42, lost_pct: 0, resent_pct: 0 } }, null)).toEqual(
      {
        tone: 'ok',
        label: 'Live · Strong network',
        detail: '6.0 Mbps · ping 42 ms',
      },
    )
    expect(linkText({ rtt_ms: 120, lost_pct: 3.2, resent_pct: 3.1 })).toEqual({
      tone: 'ok',
      label: 'Weak network, fixing itself',
      detail: 'ping 120 ms · 3.2% lost',
    })
    expect(linkText({ rtt_ms: 350, lost_pct: 0, resent_pct: 0 }).label).toBe('Slow network')
    expect(linkText({ rtt_ms: 90, lost_pct: 14, resent_pct: 9 })).toMatchObject({
      tone: 'warn',
      label: 'Network struggling',
    })
    // No measure yet (or RTMP): as before.
    expect(healthText(live, null).label).toBe('Live')
    // RTMP moved to another connection when the usual one failed.
    expect(healthText({ ...live, via: 'iPhone USB' }, null)).toEqual({
      tone: 'warn',
      label: 'Live · over iPhone USB',
      detail: '6.0 Mbps',
    })
  })
  it("keeps a direct destination's retry plain", () => {
    expect(
      healthText(
        {
          state: 'reconnecting',
          attempt: 0,
          retry_in_ms: 0,
          reason: 'The server refused it.',
          kbps: 0,
          dropped: 0,
          since_ms: 0,
        },
        null,
      ),
    ).toEqual({ tone: 'warn', label: 'Reconnecting', detail: 'The server refused it.' })
  })
})

describe('demo: Test connection', () => {
  it('tries a saved destination or an address, and says how it went', async () => {
    const { api } = demo()
    const twitch = await api.testDestination('twitch')
    expect(twitch.ok).toBe(true)
    expect(twitch.message).toContain('answered')
    const far = await api.testAddress('srt://far.example.com:9000', '')
    expect(far).toMatchObject({ ok: true, srt_latency_ms: 840 })
    const failed = await api.testAddress('rtmp://fail.example.com/live', 'k')
    expect(failed.ok).toBe(false)
    expect((await refusal(api.testAddress(' ', ''))).status).toBe(400)
    expect((await refusal(api.testDestination('nope'))).status).toBe(404)
  })
})

describe('backups', () => {
  it('are checked like the engine, and wait on standby', async () => {
    const { api } = demo()
    const v = await api.view()
    const ids = v.destinations.map((d) => d.id)
    const per = (backup: string, of = 'twitch') => ({
      ...v.advanced,
      per: { [of]: { server: null, first_retry_s: 1, max_retry_s: 30, backup } },
    })
    expect(checkAdvanced(per('kick'), ids)).toBeNull()
    expect(checkAdvanced(per('twitch'), ids)).toMatch(/back itself up/)
    expect(checkAdvanced(per('nope'), ids)).toMatch(/no such destination/)
    const two = {
      ...v.advanced,
      per: {
        twitch: { server: null, first_retry_s: 1, max_retry_s: 30, backup: 'kick' },
        youtube: { server: null, first_retry_s: 1, max_retry_s: 30, backup: 'kick' },
      },
    }
    expect(checkAdvanced(two, ids)).toMatch(/already backs up/)
    await api.setAdvanced(per('kick'))
    const kick = (await api.view()).destinations.find((d) => d.id === 'kick')
    expect(kick?.standby_for).toBe('Twitch')
  })
})

describe('RIST over two connections', () => {
  it('reads and writes via= and keeps the other settings', () => {
    expect(viaOf('rist://h:5000')).toEqual([])
    expect(viaOf('rist://h:5000?secret=x&via=en0,en7')).toEqual(['en0', 'en7'])
    expect(withVia('rist://h:5000', ['en0', 'en7'])).toBe('rist://h:5000?via=en0,en7')
    expect(withVia('rist://h:5000?secret=x&via=en0', ['en7'])).toBe(
      'rist://h:5000?secret=x&via=en7',
    )
    expect(withVia('rist://h:5000?via=en0', [])).toBe('rist://h:5000')
    // Windows names have spaces: encoded, and read back as they were.
    const spaced = withVia('rist://h:5000', ['Ethernet 2', 'Wi-Fi'])
    expect(spaced).toBe('rist://h:5000?via=Ethernet%202,Wi-Fi')
    expect(viaOf(spaced)).toEqual(['Ethernet 2', 'Wi-Fi'])
  })
  it("lists the demo computer's connections", async () => {
    const { api } = demo()
    expect((await api.networks()).map((n) => n.name)).toEqual(['en0', 'en7'])
  })
})

describe('simulcast', () => {
  it('is for WebRTC servers only', async () => {
    const { api } = demo()
    await api.addCustom('Web', 'https://whip.example/x', '')
    const v = await api.view()
    const web = v.destinations.find((d) => d.name === 'Web')!
    const per = (id: string) => ({
      ...v.advanced,
      per: { [id]: { server: null, first_retry_s: 1, max_retry_s: 30, simulcast: true } },
    })
    expect((await refusal(api.setAdvanced(per('twitch')))).message).toMatch(/simulcast/)
    const saved = await api.setAdvanced(per(web.id))
    expect(saved.advanced.per[web.id]?.simulcast).toBe(true)
  })
})

describe('which servers the Studio sends to itself', () => {
  it('knows SRT, SRTLA, RIST and WebRTC, and leaves RTMP to the forwarders', () => {
    expect(directKind('srt://a:1')).toBe('srt')
    expect(directKind('SRTLA://a:5000?via=en0,en8')).toBe('srt')
    expect(directKind('rist://a:1')).toBe('rist')
    expect(directKind('https://a/whip')).toBe('whip')
    expect(directKind('http://example.com/whip')).toBeNull()
    expect(directKind('rtmp://a/app')).toBeNull()
  })
})

describe('Contract C-1: PushState failed and all-failed detection', () => {
  const dest = (over: Partial<DestinationView>): DestinationView => ({
    id: 'kick',
    kind: 'kick',
    canvas: 'main',
    name: 'Kick',
    account: 'arsh',
    enabled: true,
    connected: true,
    health: null,
    blocked: null,
    rules: [],
    ...over,
  })

  it('formats failed PushState into one calm line with Kick multistream guidance behind (i)', () => {
    const kick = healthText(
      {
        state: 'failed',
        attempts: 3,
        reason: 'Kick refused the stream.',
        refused: true,
        kbps: 0,
        dropped: 0,
        since_ms: 0,
      },
      null,
      'kick',
    )
    expect(kick).toEqual({
      tone: 'bad',
      label: 'Kick refused the stream.',
      detail: KICK_MULTISTREAM_DETAIL,
    })

    const custom = healthText(
      {
        state: 'failed',
        attempts: 6,
        reason: 'Stream key was refused.',
        detail: 'Twitch refused the stream key. Check the key for this destination.',
        refused: true,
        kbps: 0,
        dropped: 0,
        since_ms: 0,
      },
      null,
      'twitch',
    )
    expect(custom).toEqual({
      tone: 'bad',
      label: 'Stream key was refused.',
      detail: 'Twitch refused the stream key. Check the key for this destination.',
    })
  })

  it('detects when every enabled destination refused or failed', () => {
    const kickFailed = dest({
      id: 'kick',
      kind: 'kick',
      name: 'Kick',
      health: {
        state: 'failed',
        attempts: 3,
        reason: 'Kick refused the stream.',
        refused: true,
        kbps: 0,
        dropped: 0,
        since_ms: 0,
      },
    })
    const ytLive = dest({
      id: 'youtube',
      kind: 'youtube',
      name: 'YouTube',
      health: { state: 'live', kbps: 6000, dropped: 0, since_ms: 0 },
    })
    // One live + one failed -> stream is still alive.
    expect(allDestinationsFailed([ytLive, kickFailed])).toBeNull()

    // Every enabled platform refused -> "Stream stopped: every platform refused".
    const ytRefused = dest({
      id: 'youtube',
      kind: 'youtube',
      name: 'YouTube',
      health: {
        state: 'failed',
        attempts: 3,
        reason: 'Stream key was refused.',
        refused: true,
        kbps: 0,
        dropped: 0,
        since_ms: 0,
      },
    })
    const refused = allDestinationsFailed([ytRefused, kickFailed])
    expect(refused?.allRefused).toBe(true)
    expect(refused?.summary).toBe('Stream stopped: every platform refused')
    expect(refused?.detail).toContain('Kick')
    expect(refused?.detail).toContain('multistreaming')

    // Network failure without refusal.
    const ytNet = dest({
      id: 'youtube',
      kind: 'youtube',
      name: 'YouTube',
      health: {
        state: 'failed',
        attempts: 6,
        reason: 'a.rtmps.youtube.com stopped taking the stream.',
        kbps: 0,
        dropped: 0,
        since_ms: 0,
      },
    })
    const netFailed = allDestinationsFailed([ytNet])
    expect(netFailed?.allRefused).toBe(false)
    expect(netFailed?.summary).toBe('Stream stopped: every platform failed')
  })

  it('demo engine supports failed destinations and clears them via resume', async () => {
    const { engine, api } = demo()
    engine.setGoLive({
      points_here: true,
      failed: {
        twitch: { attempts: 3, reason: 'Stream key was refused.', refused: true },
      },
    })
    const v1 = await api.view()
    const tw1 = v1.destinations.find((d) => d.id === 'twitch')
    expect(tw1?.health?.state).toBe('failed')
    await api.resume('twitch')
    const v2 = await api.view()
    const tw2 = v2.destinations.find((d) => d.id === 'twitch')
    expect(tw2?.health?.state).not.toBe('failed')
  })
})

describe('U6: reconnectingText keeps short reason in full and puts extras behind (i)', () => {
  const rec = (over: Partial<Extract<DestinationView['health'], { state: 'reconnecting' }>>) => ({
    state: 'reconnecting' as const,
    attempt: 3,
    retry_in_ms: 4000,
    reason: 'Couldn’t reach 127.0.0.1.',
    kbps: 0,
    dropped: 0,
    since_ms: 0,
    ...over,
  })

  it('keeps a short single-sentence reason in full and moves retry timing into detail', () => {
    expect(reconnectingText(rec({}))).toEqual({
      heading: 'Reconnecting, try 3',
      reason: 'Couldn’t reach 127.0.0.1.',
      detail: 'Trying again in 4 s.',
    })
  })

  it('splits multi-sentence Kick multistream advice into short reason + (i) detail', () => {
    const out = reconnectingText(
      rec({
        attempt: 2,
        retry_in_ms: 5000,
        reason:
          'Kick closed the stream. Kick took the stream and closed it at once: allow multistreaming in Kick’s settings.',
      }),
    )
    expect(out.heading).toBe('Reconnecting, try 2')
    expect(out.reason).toBe('Kick closed the stream.')
    expect(out.detail).toContain('allow multistreaming')
    expect(out.detail).toContain('Trying again in 5 s.')
  })

  it('splits a long single-sentence reason at colon or falls back without mid-word ellipsis', () => {
    const withColon = reconnectingText(
      rec({
        reason:
          'a.rtmps.youtube.com closed the connection: TLS handshake timed out after 10 seconds on en0',
      }),
    )
    expect(withColon.reason).toBe('a.rtmps.youtube.com closed the connection.')
    expect(withColon.detail).toContain('TLS handshake timed out')
    expect(withColon.reason).not.toContain('…')

    const direct = reconnectingText(
      rec({ attempt: 0, retry_in_ms: 0, reason: 'The server refused it.' }),
    )
    expect(direct).toEqual({
      heading: 'Reconnecting',
      reason: 'The server refused it.',
      detail: null,
    })
  })
})

describe('destinations while live (the demo answers like the engine)', () => {
  const setLive = (engine: DemoEngine, steer: Record<string, unknown> = {}) => {
    const d = engine as unknown as {
      studio: { obs: { streaming: boolean } }
      setGoLive: (s: Record<string, unknown>) => void
    }
    d.studio.obs.streaming = true
    d.setGoLive({ points_here: true, ...steer })
  }
  const list = (api: ReturnType<typeof goliveApi>, on: string[]) =>
    api.view().then((v) => v.destinations.map((d) => ({ id: d.id, enabled: on.includes(d.id) })))

  it('asks before the last destination goes, and goes on with the confirmation', async () => {
    const { engine, api } = demo()
    setLive(engine)
    await api.saveOrder(await list(api, ['twitch']))
    await expect(api.saveOrder(await list(api, []))).rejects.toMatchObject({
      code: 'golive_last_destination',
    })
    await expect(api.saveOrder(await list(api, []), { last: true })).resolves.toBeTruthy()
  })

  it('refuses what the running encode cannot serve, and asks when the upload will not carry it', async () => {
    const { engine, api } = demo()
    setLive(engine, { kbps: 7500, upload_kbps: 13000 })
    await api.saveOrder(await list(api, ['youtube']))
    await expect(api.saveOrder(await list(api, ['youtube', 'twitch']))).rejects.toMatchObject({
      status: 422,
      code: 'golive_needs_new_encode',
    })
    // Kick takes 8,000: it fits the encode; the measured upload decides.
    await api.uploadCheck()
    await expect(api.saveOrder(await list(api, ['youtube', 'kick']))).rejects.toMatchObject({
      status: 409,
      code: 'golive_upload_exceeded',
    })
    await expect(
      api.saveOrder(await list(api, ['youtube', 'kick']), { upload: true }),
    ).resolves.toBeTruthy()
  })

  it('refuses a codec the platform cannot take, mid-stream', async () => {
    const { engine, api } = demo()
    setLive(engine, { kbps: 5000, codec: 'hevc' })
    await api.saveOrder(await list(api, ['youtube']))
    await expect(api.saveOrder(await list(api, ['youtube', 'kick']))).rejects.toMatchObject({
      status: 422,
      code: 'golive_needs_new_encode',
    })
  })

  it('does not ask while nothing is live', async () => {
    const { api } = demo()
    await expect(api.saveOrder(await list(api, []))).resolves.toBeTruthy()
  })
})
