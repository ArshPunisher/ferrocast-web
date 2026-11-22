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

describe('performance mode and the clipboard requests', () => {
  it('send the shapes the engine takes', async () => {
    const calls: { m: string; u: string; b: unknown }[] = []
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        m: String(init?.method),
        u: new URL(url).pathname,
        b: init?.body ? JSON.parse(String(init.body)) : undefined,
      })
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    })
    const api = studioEngineApi(
      new FerroClient({ base: 'http://x', token: 't', fetch: fetchFn as unknown as typeof fetch }),
    )
    await api.previewPaused()
    await api.setPreviewPaused(true)
    await api.copySource('Main', 4)
    await api.copyFilters('Mic')
    await api.copyFilters('Mic', { scene: 'Main', id: 2 })
    await api.pasteSource('Two')
    await api.pasteFilterClip('Voice')
    await api.pasteFilterClip('', { scene: 'Main', id: 2 })
    await api.clipboard()
    expect(calls.map((c) => `${c.m} ${c.u}`)).toEqual([
      'GET /api/v1/studio/engine/preview/pause',
      'PUT /api/v1/studio/engine/preview/pause',
      'POST /api/v1/studio/engine/clipboard/source',
      'POST /api/v1/studio/engine/clipboard/filters',
      'POST /api/v1/studio/engine/clipboard/filters',
      'POST /api/v1/studio/engine/clipboard/paste/source',
      'POST /api/v1/studio/engine/clipboard/paste/filters',
      'POST /api/v1/studio/engine/clipboard/paste/filters',
      'GET /api/v1/studio/engine/clipboard',
    ])
    expect(calls.map((c) => c.b)).toEqual([
      undefined,
      { paused: true },
      { scene: 'Main', id: 4 },
      { name: 'Mic' },
      { name: 'Mic', item: { scene: 'Main', id: 2 } },
      { scene: 'Two' },
      { name: 'Voice' },
      { name: '', item: { scene: 'Main', id: 2 } },
      undefined,
    ])
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
      () => api.previewPaused(),
      () => api.setPreviewPaused(true),
      () => api.clipboard(),
      () => api.copySource('Gameplay', 3),
      () => api.copyFilters('Mic'),
      () => api.pasteSource('Gameplay'),
      () => api.pasteFilterClip('Mic'),
      () => api.clearClipboard(),
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

  it('changing the mic device in place keeps its filters, volume and mute', async () => {
    const { engine, api } = mkApi()
    try {
      await api.setChannel(3, {
        kind: 'coreaudio_input_capture',
        name: 'Mic',
        settings: { device_id: 'default' },
      })
      await api.addFilter('Mic', { kind: 'noise_suppress_filter', name: 'Noise', settings: {} })
      await api.setAudio('Mic', { volume_db: -6, muted: true })
      await api.update('Mic', { device_id: 'usb-1' })
      expect((await api.settings('Mic')).device_id).toBe('usb-1')
      expect((await api.filters('Mic')).map((f) => f.name)).toEqual(['Noise'])
      const scenes = await api.scenes()
      const mic = (await api.audio(scenes.current)).find((a) => a.name === 'Mic')
      expect([mic?.volume_db, mic?.muted]).toEqual([-6, true])
      await expect(api.update('Nope', { device_id: 'x' })).rejects.toBeTruthy()
    } finally {
      engine.dispose()
    }
  })

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

  it('runs encoder stress benchmark, combines upload speed, and refuses when live (409)', async () => {
    const { engine, api } = mkApi({
      studioEngine: { benchProfile: 'qsv_stepdown', benchStepMs: 25 },
    })
    engine.golive.setup({ upload_kbps: 20_000 })
    try {
      await api.start()
      expect((await api.autoConfig()).state).toBe('idle')

      // Refuses 409 when recording or streaming.
      engine.studioEngine!.setRecordActive(true)
      const busyErr = await api
        .startAutoConfigBenchmark({ mode: 'stream' })
        .catch((e: unknown) => e)
      expect((busyErr as ApiError).status).toBe(409)
      expect((busyErr as ApiError).code).toBe('studio_busy')
      engine.studioEngine!.setRecordActive(false)

      // Mid-run cancel cleans up immediately.
      const started = await api.startAutoConfigBenchmark({ mode: 'stream', fps_preference: 60 })
      expect(started.state).toBe('running')
      const cancelled = await api.cancelAutoConfigBenchmark()
      expect(cancelled.state).toBe('idle')

      // Full run on qsv_stepdown steps down to 720p60 Intel Quick Sync because 1080p60 lagged.
      await api.startAutoConfigBenchmark({ mode: 'stream', fps_preference: 60 })
      let st = await api.autoConfig()
      for (let i = 0; i < 40 && st.state === 'running'; i++) {
        await new Promise((r) => setTimeout(r, 25))
        st = await api.autoConfig()
      }
      expect(st.state).toBe('done')
      expect(st.candidates.length).toBeGreaterThanOrEqual(2)
      expect(st.candidates[0]?.family).toBe('qsv')
      expect(st.candidates[0]?.passed).toBe(false)
      expect(st.picked).toMatchObject({
        encoder: 'hardware',
        scale: [1280, 720],
        fps: 60,
        limited_by: 'headroom',
      })
    } finally {
      engine.dispose()
    }
  })

  it('snapshots settings and handles Keep, Undo, 30s timeout, and first-minute dropped frames rollback', async () => {
    // 1. Keep clears timeout, Undo restores exact snapshot
    const a = mkApi({
      studioEngine: { confirmTimeoutMs: 120, watchWindowMs: 320, benchStepMs: 20 },
    })
    try {
      await a.api.start()
      const orig = await a.api.studioSettings()
      expect(orig.video_kbps).toBe(6000)

      const applied = await a.api.applyAutoConfig({
        encoder: 'software',
        fps: 30,
        scale: [1280, 720],
        video_kbps: 4500,
        label: 'x264 (veryfast)',
      })
      expect(applied.state).toBe('applied')
      expect((await a.api.studioSettings()).video_kbps).toBe(4500)

      const kept = await a.api.keepAutoConfig()
      expect(kept.confirmed).toBe(true)
      await new Promise((r) => setTimeout(r, 150))
      expect((await a.api.studioSettings()).video_kbps).toBe(4500)

      const undone = await a.api.undoAutoConfig()
      expect(undone.state).toBe('rolled_back')
      expect(undone.rollback_trigger).toBe('user_undo')
      const afterUndo = await a.api.studioSettings()
      expect(afterUndo.video_kbps).toBe(6000)
      expect(afterUndo.fps).toBe(60)
      expect(afterUndo.scale).toBeNull()
    } finally {
      a.engine.dispose()
    }

    // 2. Auto rollback on 30 s inaction timeout
    const b = mkApi({
      studioEngine: { confirmTimeoutMs: 80, watchWindowMs: 240, benchStepMs: 20 },
    })
    try {
      await b.api.applyAutoConfig({ encoder: 'hardware', fps: 30, video_kbps: 3500 })
      expect((await b.api.studioSettings()).video_kbps).toBe(3500)
      await new Promise((r) => setTimeout(r, 130))
      const timedOut = await b.api.autoConfig()
      expect(timedOut.state).toBe('rolled_back')
      expect(timedOut.rollback_trigger).toBe('timeout')
      expect((await b.api.studioSettings()).video_kbps).toBe(6000)
    } finally {
      b.engine.dispose()
    }

    // 3. Auto rollback on dropped/lagged frames during first minute (even after Keep)
    const c = mkApi({
      studioEngine: { confirmTimeoutMs: 200, watchWindowMs: 500, benchStepMs: 20 },
    })
    try {
      await c.api.applyAutoConfig({ encoder: 'hardware', fps: 60, video_kbps: 8000 })
      await c.api.keepAutoConfig()
      c.engine.studioEngine!.injectDroppedFrames(6, 2)
      const rb = await c.api.autoConfig()
      expect(rb.state).toBe('rolled_back')
      expect(rb.rollback_trigger).toBe('dropped_frames')
      expect(rb.rollback_reason).toContain('dropped')
      expect((await c.api.studioSettings()).video_kbps).toBe(6000)
    } finally {
      c.engine.dispose()
    }
  })
})
