import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FerroClient } from '../src/client'
import { DemoEngine, DEMO_TOKEN } from '../src/demo'
import { ApiError } from '../src/errors'
import { goliveApi } from '../src/golive'
import {
  studioEngineApi,
  resolveTransitionFromScenes,
  type EngineScenes,
} from '../src/studio-engine'

/** Waits (bounded) until a started benchmark has reached a state that isn't `running`. */
async function benchmarkSettled(api: ReturnType<typeof studioEngineApi>) {
  let st = await api.autoConfig()
  for (let i = 0; i < 200 && st.state === 'running'; i++) {
    await new Promise((r) => setTimeout(r, 10))
    st = await api.autoConfig()
  }
  return st
}

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

  it('resolves named transitions and matrix precedence, lifecycle cleanup, and switch paths', async () => {
    const sample: EngineScenes = {
      scenes: [
        { name: 'Main', items: 1, current: true, transition: null },
        { name: 'BRB', items: 1, current: false, transition: { kind: 'cut_transition', ms: 0 } },
        { name: 'Outro', items: 1, current: false, transition: null },
      ],
      current: 'Main',
      transition: { kind: 'fade_transition', ms: 300 },
      named_transitions: [
        { name: 'Fade', kind: 'fade_transition', ms: 300, settings: {}, default: true },
        {
          name: 'PairSwipe',
          kind: 'swipe_transition',
          ms: 450,
          settings: { direction: 'right' },
          default: false,
        },
        {
          name: 'MainOut',
          kind: 'slide_transition',
          ms: 500,
          settings: { direction: 'up' },
          default: false,
        },
      ],
      transition_matrix: [
        { from: 'Main', to: 'BRB', transition: 'PairSwipe' },
        { from: 'Main', to: null, transition: 'MainOut' },
      ],
    }

    expect(resolveTransitionFromScenes(sample, 'Main', 'BRB')).toMatchObject({
      name: 'PairSwipe',
      via: 'pair',
      ms: 450,
    })
    expect(resolveTransitionFromScenes(sample, 'Outro', 'BRB')).toMatchObject({
      kind: 'cut_transition',
      via: 'to',
      ms: 0,
    })
    expect(resolveTransitionFromScenes(sample, 'Main', 'Outro')).toMatchObject({
      name: 'MainOut',
      via: 'from',
      ms: 500,
    })
    expect(resolveTransitionFromScenes(sample, 'BRB', 'Outro')).toMatchObject({
      name: 'Fade',
      via: 'default',
      ms: 300,
    })

    const { engine, api } = mkApi({ studioEngine: { running: true } })
    try {
      const added = await api.addNamedTransition({
        name: 'Stinger 1',
        kind: 'obs_stinger_transition',
        ms: 0,
        settings: { path: '/a.mp4', transition_point: 350 },
      })
      expect(added.name).toBe('Stinger 1')

      const dup = await api.duplicateNamedTransition('Stinger 1')
      expect(dup.name).toBe('Stinger 1 2')
      expect(dup.default).toBe(false)

      await api.setTransitionMatrixRule({ from: 'Main', to: 'Chatting', transition: 'Stinger 1' })
      await api.renameNamedTransition('Stinger 1', 'Intro Stinger')
      await api.setCurrent('Chatting')
      expect(engine.studioEngine?.lastResolvedTransition?.name).toBe('Intro Stinger')

      await api.setDefaultNamedTransition('Intro Stinger')
      await api.deleteNamedTransition('Intro Stinger')
      const after = await api.scenes()
      expect(after.named_transitions?.some((t) => t.default)).toBe(true)
      expect(after.transition_matrix?.some((r) => r.transition === 'Intro Stinger')).toBe(false)

      // Deleting last remaining transition fails cleanly.
      for (const extra of after.named_transitions ?? []) {
        if (!extra.default) await api.deleteNamedTransition(extra.name)
      }
      await expect(
        api.deleteNamedTransition((await api.scenes()).named_transitions![0]!.name),
      ).rejects.toMatchObject({ status: 409, code: 'studio_last_transition' })
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

    // 3. C5: network drops ignored; encoder skips while live never mutate live settings and offer rollback after stream
    const c = mkApi({
      studioEngine: { confirmTimeoutMs: 200, watchWindowMs: 500, benchStepMs: 20 },
    })
    try {
      await c.api.applyAutoConfig({ encoder: 'hardware', fps: 60, video_kbps: 8000 })
      await c.api.keepAutoConfig()
      c.engine.studioEngine!.setStreamActive(true)
      c.engine.studioEngine!.injectDroppedFrames(10, 0)
      expect((await c.api.autoConfig()).rollback_offered).toBe(false)
      expect((await c.api.studioSettings()).video_kbps).toBe(8000)

      c.engine.studioEngine!.injectDroppedFrames(0, 6)
      const whileLive = await c.api.autoConfig()
      expect(whileLive.state).toBe('applied')
      expect(whileLive.rollback_offered).toBe(false)
      expect((await c.api.studioSettings()).video_kbps).toBe(8000)

      c.engine.studioEngine!.setStreamActive(false)
      const offered = await c.api.autoConfig()
      expect(offered.state).toBe('applied')
      expect(offered.rollback_offered).toBe(true)
      expect(offered.rollback_trigger).toBe('dropped_frames')
      expect(offered.rollback_reason).toContain('dropped')
      expect((await c.api.studioSettings()).video_kbps).toBe(8000)

      const rb = await c.api.undoAutoConfig()
      expect(rb.state).toBe('rolled_back')
      expect((await c.api.studioSettings()).video_kbps).toBe(6000)
    } finally {
      c.engine.dispose()
    }

    // 4. H4/M1/M2/H6/H7 DemoEngine parity: vertical canvas, 1440p record, 500 kbps floor, double apply, manual disarm
    const d = mkApi({
      studioEngine: { confirmTimeoutMs: 400, watchWindowMs: 800, benchStepMs: 15 },
    })
    try {
      await d.api.setStudioSettings({ width: 1080, height: 1920, fps: 60 } as never)
      d.engine.golive.setup({ upload_kbps: 24_000 })
      await d.api.startAutoConfigBenchmark({
        mode: 'stream',
        fps_preference: 60,
        include_upload: true,
      })
      await benchmarkSettled(d.api)
      const portraitDone = await d.api.autoConfig()
      expect(portraitDone.state).toBe('done')
      expect(portraitDone.picked?.width).toBe(1080)
      expect(portraitDone.picked?.height).toBe(1920)
      expect(portraitDone.picked?.scale).toBeNull()

      d.engine.golive.setup({ upload_kbps: 900 })
      await d.api.startAutoConfigBenchmark({
        mode: 'stream',
        fps_preference: 60,
        include_upload: true,
      })
      await benchmarkSettled(d.api)
      const lowUpload = await d.api.autoConfig()
      expect(lowUpload.picked!.video_kbps).toBeGreaterThanOrEqual(500)
      expect(lowUpload.picked!.video_kbps).toBeLessThan(1500)

      await d.api.setStudioSettings({ width: 2560, height: 1440, fps: 60 } as never)
      await d.api.startAutoConfigBenchmark({
        mode: 'record',
        fps_preference: 60,
        include_upload: false,
      })
      await benchmarkSettled(d.api)
      const rec1440 = await d.api.autoConfig()
      expect(rec1440.picked?.height).toBe(1440)

      await d.api.applyAutoConfig({ encoder: 'hardware', fps: 60, video_kbps: 7000 })
      await d.api.applyAutoConfig({ encoder: 'hardware', fps: 30, video_kbps: 5000 })
      await d.api.undoAutoConfig()
      expect((await d.api.studioSettings()).video_kbps).toBe(6000)

      await d.api.applyAutoConfig({ encoder: 'hardware', fps: 60, video_kbps: 7500 })
      await d.api.setStudioSettings({ video_kbps: 4200 } as never)
      expect((await d.api.autoConfig()).state).toBe('idle')
    } finally {
      d.engine.dispose()
    }
  })

  it('resolves a repeated pair the way the engine does: the last rule wins', () => {
    const scenes = {
      scenes: [
        { name: 'Main', items: 1, current: true, transition: null },
        { name: 'BRB', items: 1, current: false, transition: null },
      ],
      current: 'Main',
      transition: { kind: 'fade_transition', ms: 300 },
      named_transitions: [
        { name: 'Fade', kind: 'fade_transition', ms: 300, settings: {}, default: true },
        { name: 'First', kind: 'swipe_transition', ms: 400, settings: {}, default: false },
        { name: 'Second', kind: 'slide_transition', ms: 500, settings: {}, default: false },
      ],
      transition_matrix: [
        { from: 'Main', to: 'BRB', transition: 'First' },
        { from: 'Main', to: 'BRB', transition: 'Second' },
      ],
    } as never
    expect(resolveTransitionFromScenes(scenes, 'Main', 'BRB')).toMatchObject({ name: 'Second' })
  })

  describe('named transitions and Studio Mode as the engine has them (CodeRabbit)', () => {
    it('a switch by the legacy route never gives two presets the same name or both the default', async () => {
      const { api } = mkApi()
      // A Fade preset that happens to be called slide_transition...
      await api.addNamedTransition({ name: 'slide_transition', kind: 'fade_transition', ms: 300 })
      // ...then Slide is picked by the old route: a preset of its own is made with another name.
      await api.setTransition({ kind: 'slide_transition', ms: 400 })
      const list = (await api.scenes()).named_transitions ?? []
      const names = list.map((t) => t.name)
      expect(new Set(names).size).toBe(names.length)
      await api.setDefaultNamedTransition('slide_transition')
      expect((await api.scenes()).named_transitions?.filter((t) => t.default).length).toBe(1)
    })

    it("a write to a kind's settings reaches the preset that plays", async () => {
      const { api } = mkApi()
      await api.addNamedTransition({
        name: 'Wipe It',
        kind: 'swipe_transition',
        ms: 500,
        settings: { direction: 'left' },
        default: true,
      })
      await api.setTransitionSettings('swipe_transition', { direction: 'right' })
      const list = (await api.scenes()).named_transitions ?? []
      expect(list.find((t) => t.name === 'Wipe It')?.settings).toMatchObject({ direction: 'right' })
      // Another preset of another kind is left alone.
      expect(list.find((t) => t.kind === 'fade_transition')?.settings).not.toHaveProperty(
        'direction',
      )
    })

    it('the T-bar position is the one set until it is released', async () => {
      const { api } = mkApi()
      await api.studioMode(true)
      await api.tbar(0.4)
      expect((await api.scenes()).tbar).toEqual({ active: true, at: 0.4 })
      await api.tbar(0.4, true)
      expect((await api.scenes()).tbar).toEqual({ active: false, at: 0 })
    })

    it('swap off: the old scene does not go to the preview when a transition ends', async () => {
      const { api } = mkApi()
      const scenes = await api.scenes()
      const other = scenes.scenes.find((s) => !s.current)!.name
      await api.studioMode(true)
      await api.setStudioOptions({ swap: false } as never)
      const before = scenes.current
      await api.setPreview(other)
      await api.transitionNow()
      const after = await api.scenes()
      expect(after.current).toBe(other)
      expect(after.scenes.find((s) => s.preview)?.name).toBe(other) // the preview stays where it was
      expect(after.scenes.find((s) => s.name === before)?.preview).toBe(false)
    })

    it('the encode budget has every field the client needs', async () => {
      const { api } = mkApi()
      const b = await api.encodeBudget()
      expect(b).toHaveProperty('budget_mpx')
      expect(['ok', 'limit', 'over', 'unknown']).toContain(b.level)
    })

    it('refuses a benchmark while a new setting is still on trial, and checks what an apply sends', async () => {
      const d = mkApi({
        studioEngine: { confirmTimeoutMs: 400, watchWindowMs: 800, benchStepMs: 15 },
      })
      try {
        await d.api.applyAutoConfig({ encoder: 'hardware', fps: 60, video_kbps: 3500 })
        const refused = await d.api
          .startAutoConfigBenchmark({ mode: 'stream' })
          .catch((e: unknown) => e)
        expect((refused as ApiError).status).toBe(409)
        // The trial is untouched: Undo still restores what was there.
        expect((await d.api.autoConfig()).state).toBe('applied')
        const undone = await d.api.undoAutoConfig()
        expect(undone.state).toBe('rolled_back')
        expect((await d.api.studioSettings()).video_kbps).toBe(6000)
        // A bitrate that isn't a number is refused before anything changes.
        const nan = await d.api
          .applyAutoConfig({ video_kbps: 'fast' } as never)
          .catch((e: unknown) => e)
        expect((nan as ApiError).status).toBe(400)
        expect((await d.api.studioSettings()).video_kbps).toBe(6000)
        // A scale on its own is a valid request, with no benchmark behind it.
        const scaled = await d.api.applyAutoConfig({ scale: [1280, 720] } as never)
        expect(scaled.state).toBe('applied')
        expect((await d.api.studioSettings()).scale).toEqual([1280, 720])
      } finally {
        d.engine.dispose()
      }
    })

    it('shows an active stream in the stats, and idle lag never counts against a stream', async () => {
      const d = mkApi({
        studioEngine: { confirmTimeoutMs: 400, watchWindowMs: 800, benchStepMs: 15 },
      })
      try {
        d.engine.studioEngine!.setStreamActive(true)
        const live = await d.api.stats()
        expect(live.stream).not.toBeNull()
        expect(live.scene).toBeTruthy()
        d.engine.studioEngine!.setStreamActive(false)
        // Six frames lag while idle, after the apply: the first live check must not count them.
        await d.api.applyAutoConfig({ encoder: 'hardware', fps: 60, video_kbps: 5000 })
        await d.api.keepAutoConfig()
        d.engine.studioEngine!.injectDroppedFrames(0, 6)
        d.engine.studioEngine!.setStreamActive(true)
        await d.api.autoConfig()
        d.engine.studioEngine!.setStreamActive(false)
        const after = await d.api.autoConfig()
        expect(after.rollback_offered).toBe(false)
      } finally {
        d.engine.dispose()
      }
    })

    it('says so when the upload cannot carry the encoder minimum', async () => {
      const d = mkApi({ studioEngine: { benchStepMs: 15 } })
      d.engine.golive.setup({ upload_kbps: 900 })
      try {
        await d.api.startAutoConfigBenchmark({
          mode: 'stream',
          fps_preference: 60,
          include_upload: true,
        })
        let st = await d.api.autoConfig()
        for (let i = 0; i < 100 && st.state === 'running'; i++) {
          await new Promise((r) => setTimeout(r, 15))
          st = await d.api.autoConfig()
        }
        expect(st.state).toBe('done')
        expect(st.picked!.limited_by).toBe('upload_too_slow')
        expect(st.picked!.why).toMatch(/can't carry|cannot carry/i)
      } finally {
        d.engine.dispose()
      }
    })
  })

  describe('scenes, items, clipboard, push-to-show, and selective recording (Problem 1)', () => {
    it('models scene items matching scene counts and supports item CRUD, layout, and undo/redo', async () => {
      const { engine, api } = mkApi()
      try {
        const scenes = await api.scenes()
        for (const s of scenes.scenes) {
          const list = await api.items(s.name)
          expect(list.length).toBe(s.items)
        }
        const mainItems = await api.items('Main')
        expect(mainItems.length).toBeGreaterThanOrEqual(2)
        expect(mainItems.some((i) => i.name === 'Webcam')).toBe(true)

        const created = await api.addSource(
          'Main',
          { kind: 'color_source_v3', name: 'Backdrop', settings: { color: 0xff112233 } },
          true,
        )
        expect(created.item.name).toBe('Backdrop')
        expect(created.item.frame).toEqual([1920, 0, 0, 1080, 0, 0])
        expect((await api.items('Main'))[0]?.id).toBe(created.item.id)

        const moved = await api.setItemBox('Main', created.item.id, {
          x: 100,
          y: 50,
          w: 640,
          h: 360,
          save: true,
        })
        expect(moved.frame).toEqual([640, 0, 0, 360, 100, 50])

        await api.editItem('Main', created.item.id, 'hide')
        await api.editItem('Main', created.item.id, 'lock')
        await api.editItem('Main', created.item.id, 'blend_screen')
        await api.editItem('Main', created.item.id, 'scale_lanczos')
        const edited = (await api.items('Main')).find((i) => i.id === created.item.id)!
        expect(edited).toMatchObject({
          visible: false,
          locked: true,
          blend: 'screen',
          scale_filter: 'lanczos',
        })

        // Undo & Redo track mutations cleanly.
        const histBeforeUndo = await api.history()
        expect(histBeforeUndo.undo.length).toBeGreaterThan(0)
        await api.undo()
        expect((await api.items('Main')).find((i) => i.id === created.item.id)?.scale_filter).toBe(
          'off',
        )
        await api.redo()
        expect((await api.items('Main')).find((i) => i.id === created.item.id)?.scale_filter).toBe(
          'lanczos',
        )

        // Shared existing source and grouping across scenes.
        const existing = await api.addExisting('Gameplay', 'Backdrop')
        expect(existing.item.name).toBe('Backdrop')
        const grp = await api.groupItems('Main', [created.item.id], 'Stage Group')
        expect(grp.group).toBe(true)
        expect(grp.children.map((c) => c.id)).toEqual([created.item.id])
        await api.ungroup('Main', grp.id)
        expect((await api.items('Main')).some((i) => i.id === created.item.id)).toBe(true)

        // Batch boxes rejects invalid id atomically without mutating others.
        const beforeBoxes = await api.items('Main')
        await expect(
          api.setItemBoxes('Main', {
            items: [
              { id: created.item.id, x: 10, y: 10, w: 300, h: 200 },
              { id: 999999, x: 0, y: 0, w: 100, h: 100 },
            ],
            save: true,
          }),
        ).rejects.toMatchObject({ status: 404, code: 'studio_no_source' })
        expect((await api.items('Main')).find((i) => i.id === created.item.id)?.frame).toEqual(
          beforeBoxes.find((i) => i.id === created.item.id)?.frame,
        )
      } finally {
        engine.dispose()
      }
    })

    it('supports copy/paste across scenes & collections matching clipboard error semantics', async () => {
      const { engine, api } = mkApi()
      try {
        await expect(api.clipboard()).rejects.toMatchObject({
          status: 404,
          code: 'clipboard_empty',
        })

        const mainItems = await api.items('Main')
        const cam = mainItems.find((i) => i.name === 'Webcam')!
        await api.addFilter('Webcam', { kind: 'compressor_filter', name: 'Comp', settings: {} })
        const clip = await api.copySource('Main', cam.id)
        expect(clip).toEqual({ kind: 'source', name: 'Webcam', from: 'Main', count: 1 })
        expect(await api.clipboard()).toEqual(clip)

        // Switch collection: copied source survives on the clipboard and pastes cleanly.
        const colB = await api.newShelf('collections', 'Secondary Show', false)
        expect((await api.shelf('collections')).current).toBe(colB.id)
        const targetScene = (await api.scenes()).current
        const pasted = await api.pasteSource(targetScene)
        expect(pasted.item?.name).toBe('Webcam')
        expect((await api.items(targetScene)).some((i) => i.name === 'Webcam')).toBe(true)

        // Copy & paste filters, refusing empty filter lists and wrong clipboard kind.
        await api.pasteSource(targetScene) // second paste renames to avoid collision
        const namesAfter = (await api.items(targetScene)).map((i) => i.name)
        expect(namesAfter.some((n) => n === 'Webcam 2')).toBe(true)

        await api.addSource(targetScene, { kind: 'color_source_v3', name: 'Filterless' }, true)
        await expect(api.pasteFilterClip('Webcam')).rejects.toMatchObject({ status: 400 })
        await expect(api.copyFilters('Filterless')).rejects.toMatchObject({ status: 400 })
        const filterClip = await api.copyFilters('Webcam')
        expect(filterClip).toMatchObject({ kind: 'filters', name: 'Webcam', count: 1 })
        await expect(api.pasteSource(targetScene)).rejects.toMatchObject({ status: 400 })
        await api.pasteFilterClip('Filterless')
        expect((await api.filters('Filterless')).map((f) => f.name)).toContain('Comp')

        await api.clearClipboard()
        await expect(api.clipboard()).rejects.toMatchObject({
          status: 404,
          code: 'clipboard_empty',
        })
      } finally {
        engine.dispose()
      }
    })

    it('supports selective recording, source recording, encode budget, and push-to-show hotkeys', async () => {
      const { engine, api } = mkApi()
      try {
        const items = await api.items('Main')
        const cam = items.find((i) => i.name === 'Webcam')!

        // Item show modes & encode budget reflection.
        await api.editItem('Main', cam.id, 'stream_only')
        expect((await api.items('Main')).find((i) => i.id === cam.id)?.show).toBe('stream')
        const splitBudget = await api.encodeBudget()
        expect(splitBudget.shared).toBe(false)
        expect(splitBudget.why_not_shared).toBeTruthy()

        await api.editItem('Main', cam.id, 'recording_only')
        expect((await api.items('Main')).find((i) => i.id === cam.id)?.show).toBe('recording')

        await api.editItem('Main', cam.id, 'stream_and_recording')
        expect((await api.items('Main')).find((i) => i.id === cam.id)?.show).toBe('both')
        expect((await api.encodeBudget()).shared).toBe(true)

        // While recording with shared encode ("stream"), selective visibility change is refused.
        const settings = await api.studioSettings()
        await api.setStudioSettings({ ...settings, record_quality: 'stream' })
        await api.record(true)
        expect((await api.stats()).record?.active).toBe(true)
        await expect(api.editItem('Main', cam.id, 'stream_only')).rejects.toMatchObject({
          status: 422,
          code: 'studio_failed',
        })
        await api.record(false)
        expect((await api.stats()).record).toBeNull()

        // Source-isolated recording populates stats.source_records and stops cleanly.
        const started = await api.recordSource('Webcam', true)
        expect(started.file).toContain('Webcam')
        expect((await api.stats()).source_records).toEqual([{ name: 'Webcam', file: started.file }])
        const stopped = await api.recordSource('Webcam', false)
        expect(stopped.file).toBeNull()
        expect((await api.stats()).source_records ?? []).toEqual([])
        await expect(api.recordSource('Missing Source', true)).rejects.toMatchObject({
          status: 422,
          code: 'studio_failed',
        })

        // Push-to-show hotkey capture and persistence succeed cleanly.
        await api.captureKeys(true)
        await api.setStudioSettings({
          ...(await api.studioSettings()),
          hotkeys: {
            'push_show:Main\nWebcam': 'F9',
            'push_hide:Main\nWebcam': 'F10',
          },
        })
        await api.captureKeys(false)
        expect((await api.studioSettings()).hotkeys).toMatchObject({
          'push_show:Main\nWebcam': 'F9',
          'push_hide:Main\nWebcam': 'F10',
        })
      } finally {
        engine.dispose()
      }
    })

    it('escapes XML special characters in SVG previews, preserves per-item filters on clipboard paste, and clears source recordings on stop', async () => {
      const { engine, api } = mkApi()
      try {
        await api.addScene('S & <Live>')
        const created = await api.addSource('S & <Live>', {
          kind: 'color_source_v3',
          name: 'Banner <1> & "2"',
        })

        const pic = await api.itemPicture('S & <Live>', created.item.id)
        const svgPic = decodeURIComponent(String(pic.image).split(',')[1] ?? '')
        expect(svgPic).toContain('Banner &lt;1&gt; &amp; &quot;2&quot;')
        expect(svgPic).not.toContain('Banner <1>')

        const thumb = await api.thumbnail('S & <Live>')
        const svgThumb = decodeURIComponent(thumb.image.split(',')[1] ?? '')
        expect(svgThumb).toContain('S &amp; &lt;Live&gt;')
        expect(svgThumb).not.toContain('S & <Live>')

        await api.setItemFilterScope('S & <Live>', created.item.id, true)
        await api.addItemFilter('S & <Live>', created.item.id, {
          kind: 'color_filter_v2',
          name: 'OwnTint',
        })
        await api.copySource('S & <Live>', created.item.id)
        await api.newShelf('collections', 'After Copy', false)
        const destScene = (await api.scenes()).current
        const pasted = await api.pasteSource(destScene)
        expect(pasted.item?.own_filters).toBe(true)
        const pastedFilters = await api.itemFilters(destScene, pasted.item!.id)
        expect(pastedFilters.map((f) => f.name)).toContain('OwnTint')

        await api.recordSource(pasted.item!.name, true)
        expect((await api.stats()).source_records?.length).toBe(1)
        await api.stop()
        await api.start()
        expect((await api.stats()).source_records ?? []).toEqual([])
      } finally {
        engine.dispose()
      }
    })
  })

  describe('stream control, ticking stats, and Go live integration (Problem 3)', () => {
    it('starts/stops Studio stream, ticks frames & bytes in stats, and marks Go live active without OBS points_here', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-11-22T12:00:00Z'))
      const engine = new DemoEngine({ autoplay: false, latencyMs: 0, studioEngine: true })
      try {
        const client = new FerroClient({
          base: engine.base,
          token: DEMO_TOKEN,
          fetch: engine.fetch,
        })
        const api = studioEngineApi(client)
        const golive = goliveApi(client)
        engine.studio.obs.streaming = false

        await api.start()
        expect(await api.streamStats()).toBeNull()
        expect((await api.stats()).stream).toBeNull()
        expect((await golive.view()).live).toBe(false)

        const started = await api.stream(true)
        expect(started).toMatchObject({
          active: true,
          reconnecting: false,
          dropped: 0,
          error: null,
        })
        expect((await api.streamStats())?.active).toBe(true)
        expect((await golive.view()).live).toBe(true)

        vi.advanceTimersByTime(3000)
        const s1 = await api.stats()
        expect(s1.stream?.active).toBe(true)
        expect(s1.stream?.frames ?? 0).toBeGreaterThanOrEqual(85)
        expect(s1.stream?.bytes ?? 0).toBeGreaterThan(1_000_000)

        await api.stream(false)
        expect(await api.streamStats()).toBeNull()
        expect((await api.stats()).stream).toBeNull()
        expect((await golive.view()).live).toBe(false)
      } finally {
        vi.useRealTimers()
        engine.dispose()
      }
    })
  })

  describe('item screenshot routing', () => {
    it('routes item screenshots through scenes/{scene}/items/{id}/screenshot and keeps name-only when omitted', async () => {
      const requests: { method: string; url: string }[] = []
      const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
        requests.push({ method: init?.method ?? 'GET', url })
        return new Response(JSON.stringify({ file: '/recordings/Screenshot.png' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })
      const api = studioEngineApi(
        new FerroClient({ base: 'http://127.0.0.1:47820', token: 't', fetch: fetchMock }),
      )

      await api.screenshot('Camera', { scene: 'Gameplay', item: 7 })
      await api.screenshot('Gameplay')

      expect(requests).toEqual([
        {
          method: 'POST',
          url: 'http://127.0.0.1:47820/api/v1/studio/engine/scenes/Gameplay/items/7/screenshot',
        },
        {
          method: 'POST',
          url: 'http://127.0.0.1:47820/api/v1/studio/engine/sources/Gameplay/screenshot',
        },
      ])
    })

    it('handles scene item screenshots in DemoStudioEngine and rejects missing items', async () => {
      const engine = new DemoEngine({ autoplay: false, latencyMs: 0, studioEngine: true })
      try {
        const client = new FerroClient({
          base: engine.base,
          token: DEMO_TOKEN,
          fetch: engine.fetch,
        })
        const api = studioEngineApi(client)
        const scene = (await api.scenes()).current
        const items = await api.items(scene)
        const target = items.find((i) => !i.group)!

        const shot = await api.screenshot(target.name, { scene, item: target.id })
        expect(shot.file).toMatch(/\.png$/)

        await expect(api.screenshot(target.name, { scene, item: 999_999 })).rejects.toMatchObject({
          status: 404,
          code: 'studio_no_source',
        })
      } finally {
        engine.dispose()
      }
    })
  })
})
