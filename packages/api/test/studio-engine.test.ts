import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FerroClient } from '../src/client'
import { DemoEngine, DEMO_TOKEN } from '../src/demo'
import { ApiError } from '../src/errors'
import { studioEngineApi } from '../src/studio-engine'

describe('the Studio engine in the demo (no desktop app)', () => {
  let engine: DemoEngine
  let api: ReturnType<typeof studioEngineApi>
  beforeEach(() => {
    engine = new DemoEngine({ autoplay: false, latencyMs: 0 })
    api = studioEngineApi(
      new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch }),
    )
  })
  afterEach(() => engine.dispose())

  it('says where it runs, like the engine without the desktop app', async () => {
    const s = await api.status()
    expect(s).toMatchObject({ available: false, running: false })
    expect(s.detail).toMatch(/Ferrocast app/)
    for (const call of [
      () => api.start(),
      () => api.kinds(),
      () => api.options('color_source'),
      () => api.preview(null),
      () => api.defaults('color_source_v3'),
      () => api.sources(),
      () => api.stream(true),
      () => api.streamStats(),
      () => api.scenes(),
      () => api.addScene('Gameplay'),
      () => api.removeScene('Gameplay'),
      () => api.duplicateScene('Gameplay', 'Gameplay 2'),
      () => api.moveScene('Gameplay', 0),
      () => api.setCurrent('Just chatting'),
      () => api.setTransition({ kind: 'fade_transition', ms: 300 }),
      () => api.items('Gameplay'),
      () => api.addSource('Gameplay', { kind: 'color_source', name: 'Back' }, true),
      () => api.addExisting('Gameplay', 'Back'),
      () => api.editItem('Gameplay', 3, 'lock'),
      () => api.audio('Gameplay'),
      () => api.rename('Back', 'Front'),
      () => api.settings('Back'),
      () => api.update('Back', { color: 1 }),
      () => api.sourceOptions('Back'),
      () => api.setAudio('Mic', { volume_db: -6, muted: true, monitor: 'only_me' }),
      () => api.filters('Mic'),
      () => api.addFilter('Mic', { kind: 'noise_gate_filter', name: 'Gate' }),
      () => api.removeFilter('Mic', 'Gate'),
      () => api.editFilter('Mic', 'Gate', 'disable'),
      () => api.filterSettings('Mic', 'Gate'),
      () => api.filterOptions('Mic', 'Gate'),
      () => api.updateFilter('Mic', 'Gate', {}),
      () => api.setChannel(3, { kind: 'coreaudio_input_capture', name: 'Mic' }),
      () => api.setChannel(3, null),
      () => api.levels(['Mic']),
      () => api.studioSettings(),
      () => api.setStudioSettings({} as never),
      () => api.stats(),
      () => api.record(true),
      () => api.pauseRecord(true),
      () => api.monitoring(),
      () => api.editItem('Gameplay', 3, 'flip_h'),
      () => api.editItem('Gameplay', 3, 'blend_screen'),
      () => api.pasteFilters('Mic', 'Cam'),
      () => api.web('Alerts', 'interact'),
      () => api.obsCollections(),
      () => api.importObs('Untitled'),
      () => api.setSceneTransition('Gameplay', { kind: 'cut_transition', ms: 0 }),
      () => api.screenshot('Gameplay'),
      () => api.editItem('Gameplay', 3, 'scale_lanczos'),
      () => api.audioCare(),
      () => api.privacy(),
      () => api.setPrivacy({ hide_notifications: true, hide_apps: ['Mail'] }),
    ]) {
      const e = await call().then(
        () => null,
        (x: unknown) => x as ApiError,
      )
      expect(e?.status).toBe(422)
      expect(e?.code).toBe('studio_unavailable')
    }
  })

  it('passes AbortSignal and encodes screenStill / sourceStill query parameters', async () => {
    const calls: { url: string; signal?: AbortSignal | null }[] = []
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, signal: init?.signal ?? null })
      return new Response(JSON.stringify({ image: 'data:image/jpeg;base64,abc' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    const client = studioEngineApi(
      new FerroClient({ base: 'http://127.0.0.1:47820', token: 't', fetch: fetchMock }),
    )
    const ac = new AbortController()
    await expect(client.screenStill(42, 240, true, ac.signal)).resolves.toEqual({
      image: 'data:image/jpeg;base64,abc',
    })
    await expect(
      client.sourceStill('av_capture_input_v2', 'device', 'usb/cam:1', 240, ac.signal),
    ).resolves.toEqual({
      image: 'data:image/jpeg;base64,abc',
    })
    expect(calls[0]?.url).toBe(
      'http://127.0.0.1:47820/api/v1/studio/engine/screens/42/still?w=240&window=true',
    )
    expect(calls[0]?.signal).toBe(ac.signal)
    expect(calls[1]?.url).toBe(
      'http://127.0.0.1:47820/api/v1/studio/engine/still?kind=av_capture_input_v2&key=device&value=usb%2Fcam%3A1&w=240',
    )
    expect(calls[1]?.signal).toBe(ac.signal)
  })
})
