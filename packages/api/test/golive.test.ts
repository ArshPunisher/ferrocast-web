import { describe, expect, it, vi } from 'vitest'
import {
  aitumClashes,
  andList,
  checkCut,
  goliveApi,
  goingTo,
  healthText,
  mbps,
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
    const bad = await refusal(api.addCustom('Backup', 'https://x.com/live', 'k'))
    expect(bad.message).toContain('rtmp:// or rtmps://')
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
    expect((await refusal(api.uploadCheck())).code).toBe('golive_none')
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
