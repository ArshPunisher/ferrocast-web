import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FerroClient } from '../src/client'
import { DemoEngine, DEMO_TOKEN } from '../src/demo'
import { ApiError } from '../src/errors'
import { studioEngineApi } from '../src/studio-engine'

describe('levels request', () => {
  it("sends window only when asked (default stays the engine's 300 ms window)", async () => {
    const bodies: unknown[] = []
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)))
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    })
    const api = studioEngineApi(
      new FerroClient({ base: 'http://x', token: 't', fetch: fetchFn as unknown as typeof fetch }),
    )
    await api.levels(['Mic'])
    await api.levels(['Mic'], 'fast')
    expect(bodies).toEqual([{ names: ['Mic'] }, { names: ['Mic'], window: 'fast' }])
  })
})

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

describe('simulated Studio engine in demo mode (studioEngine option)', () => {
  const mkApi = (opts: ConstructorParameters<typeof DemoEngine>[0] = {}) => {
    const engine = new DemoEngine({ autoplay: false, latencyMs: 0, studioEngine: true, ...opts })
    const api = studioEngineApi(
      new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch }),
    )
    return { engine, api }
  }

  it('previews OBS and Streamlabs collections, imports with previous_id, and supports undo', async () => {
    const { engine, api } = mkApi()
    try {
      const obsList = await api.obsCollections()
      expect(obsList.length).toBeGreaterThanOrEqual(1)
      const firstId = obsList[0]!.id
      const obsPreview = await api.previewObs(firstId)
      expect(obsPreview.source).toBe('obs')
      expect(obsPreview.scenes).toBeGreaterThan(0)
      expect(obsPreview.sources).toBeGreaterThan(0)
      expect(obsPreview.skipped.length).toBeGreaterThan(0)
      expect(obsPreview.skipped[0]?.reason).toBeTruthy()

      const imported = await api.importObs(firstId)
      expect(imported.id).toBeTruthy()
      expect(imported.previous_id).toBe('untitled')
      const shelf1 = await api.shelf('collections')
      expect(shelf1.current).toBe(imported.id)

      // Undo: switch back and remove imported collection.
      await api.switchShelf('collections', imported.previous_id!)
      await api.removeShelf('collections', imported.id!)
      const shelf2 = await api.shelf('collections')
      expect(shelf2.current).toBe('untitled')
      expect(shelf2.list.some((x) => x.id === imported.id)).toBe(false)

      // Streamlabs preview & import includes device resets and widgets.
      const slList = await api.streamlabsCollections()
      expect(slList.length).toBeGreaterThanOrEqual(1)
      const slPreview = await api.previewStreamlabs(slList[0]!.id)
      expect(slPreview.source).toBe('streamlabs')
      expect(slPreview.device_resets.length).toBeGreaterThan(0)
    } finally {
      engine.dispose()
    }
  })

  it('handles empty, broken, and huge fixture presets', async () => {
    const empty = mkApi({ studioEngine: { obsPreset: 'empty', streamlabsPreset: 'empty' } })
    try {
      expect(await empty.api.obsCollections()).toEqual([])
      expect(await empty.api.streamlabsCollections()).toEqual([])
    } finally {
      empty.engine.dispose()
    }

    const broken = mkApi({ studioEngine: { obsPreset: 'broken', streamlabsPreset: 'broken' } })
    try {
      const obsList = await broken.api.obsCollections()
      expect(obsList.length).toBeGreaterThan(0)
      const e = (await broken.api.previewObs(obsList[0]!.id).catch((x: unknown) => x)) as ApiError
      expect(e.status).toBe(422)
      expect(e.code).toBe('studio_collection_broken')
    } finally {
      broken.engine.dispose()
    }

    const huge = mkApi({ studioEngine: { obsPreset: 'huge' } })
    try {
      const obsList = await huge.api.obsCollections()
      const p = await huge.api.previewObs(obsList[0]!.id)
      expect(p.scenes).toBeGreaterThanOrEqual(100)
      expect(p.scene_names.length).toBe(12)
      expect(p.truncated_scenes).toBe(p.scenes - 12)
    } finally {
      huge.engine.dispose()
    }
  })

  it('simulates camera preview, live mic levels, and Clean up my mic filters', async () => {
    const { engine, api } = mkApi({ studioEngine: { micPreset: 'quiet', hasCamera: true } })
    try {
      await api.start()
      const opts = await api.options('av_capture_input_v2')
      const deviceOpt = opts.find((o) => o.key === 'device')
      expect(deviceOpt?.values?.length).toBeGreaterThan(0)
      const still = await api.sourceStill(
        'av_capture_input_v2',
        'device',
        String(deviceOpt!.values![0]),
        320,
      )
      expect(still.image).toMatch(/^data:image\//)

      const lv1 = await api.levels(['Mic'], 'fast')
      expect(lv1.Mic!.peak[0]).toBeLessThan(-18)

      await api.addFilter('Mic', { kind: 'gain_filter', name: 'Gain', settings: { db: 10 } })
      await api.addFilter('Mic', { kind: 'noise_suppress_filter_v2', name: 'Noise' })
      await api.editFilter('Mic', 'Gain', 'top')
      const filters = await api.filters('Mic')
      expect(filters[0]?.kind).toBe('gain_filter')

      const lv2 = await api.levels(['Mic'], 'fast')
      expect(lv2.Mic!.peak[0]).toBeGreaterThan(lv1.Mic!.peak[0])
    } finally {
      engine.dispose()
    }

    const noCam = mkApi({ studioEngine: { hasCamera: false } })
    try {
      await noCam.api.start()
      const opts = await noCam.api.options('av_capture_input_v2')
      const deviceOpt = opts.find((o) => o.key === 'device')
      expect(deviceOpt?.choices).toEqual([])
    } finally {
      noCam.engine.dispose()
    }
  })
})
