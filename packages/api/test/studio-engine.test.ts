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
    await expect(
      client.sourceStill('av_capture_input_v2', 'device', 'usb/cam:1', 240, ac.signal, {
        fresh: true,
      }),
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
    expect(calls[2]?.url).toBe(
      'http://127.0.0.1:47820/api/v1/studio/engine/still?kind=av_capture_input_v2&key=device&value=usb%2Fcam%3A1&w=240&fresh=1',
    )
  })

  it('returns waiting:true when cameraSleeping in DemoStudioEngine and error only when cameraDenied', async () => {
    const sleeping = new DemoEngine({
      autoplay: false,
      latencyMs: 0,
      studioEngine: { cameraSleeping: true },
    })
    const denied = new DemoEngine({
      autoplay: false,
      latencyMs: 0,
      studioEngine: { cameraDenied: true },
    })
    try {
      const sleepApi = studioEngineApi(
        new FerroClient({ base: sleeping.base, token: DEMO_TOKEN, fetch: sleeping.fetch }),
      )
      const deniedApi = studioEngineApi(
        new FerroClient({ base: denied.base, token: DEMO_TOKEN, fetch: denied.fetch }),
      )
      await expect(
        sleepApi.sourceStill('av_capture_input_v2', 'device', 'cam-facetime', 240),
      ).resolves.toEqual({ image: null, waiting: true, error: null })

      const errRes = await deniedApi.sourceStill(
        'av_capture_input_v2',
        'device',
        'cam-facetime',
        240,
      )
      expect(errRes.image).toBeNull()
      expect(errRes.waiting).toBeFalsy()
      expect(errRes.error).toContain('turned off for Ferrocast')
    } finally {
      sleeping.dispose()
      denied.dispose()
    }
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

    it('accepts optional scene and item in body or query on POST sources/{name}/screenshot', async () => {
      const engine = new DemoEngine({ autoplay: false, latencyMs: 0, studioEngine: true })
      try {
        const client = new FerroClient({
          base: engine.base,
          token: DEMO_TOKEN,
          fetch: engine.fetch,
        })
        const api = studioEngineApi(client)
        const scene = 'Main'
        const items = await api.items(scene)
        const webcam = items.find((i) => i.name === 'Webcam')!

        const fromBody = await client.request<{ file: string }>(
          'POST',
          `/api/v1/studio/engine/sources/${encodeURIComponent(webcam.name)}/screenshot`,
          { scene, item: webcam.id },
        )
        expect(fromBody.file).toMatch(/Webcam screenshot\.png$/)

        const fromQuery = await client.request<{ file: string }>(
          'POST',
          `/api/v1/studio/engine/sources/${encodeURIComponent(webcam.name)}/screenshot?scene=${encodeURIComponent(scene)}&item=${webcam.id}`,
        )
        expect(fromQuery.file).toMatch(/Webcam screenshot\.png$/)

        await expect(
          client.request(
            'POST',
            `/api/v1/studio/engine/sources/${encodeURIComponent(webcam.name)}/screenshot`,
            { scene },
          ),
        ).rejects.toMatchObject({ status: 400, code: 'invalid' })

        await expect(
          client.request(
            'POST',
            `/api/v1/studio/engine/sources/${encodeURIComponent(webcam.name)}/screenshot?scene=${encodeURIComponent(scene)}&item=${webcam.id}`,
            { scene: 'Gameplay', item: webcam.id },
          ),
        ).rejects.toMatchObject({ status: 400, code: 'invalid' })

        await expect(
          client.request(
            'POST',
            `/api/v1/studio/engine/sources/${encodeURIComponent(webcam.name)}/screenshot`,
            { scene, item: 999_999 },
          ),
        ).rejects.toMatchObject({ status: 404 })
      } finally {
        engine.dispose()
      }
    })
  })

  describe('demo engine transform, drag undo, and flip/turn parity', () => {
    it('keeps flip and rotate edits centred in place and syncs parent group frames', async () => {
      const engine = new DemoEngine({ autoplay: false, latencyMs: 0, studioEngine: true })
      try {
        const api = studioEngineApi(
          new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch }),
        )
        const scene = 'Main'
        const added = await api.addSource(scene, {
          kind: 'color_source_v3',
          name: 'Box',
          settings: { color: 0xffff0000, width: 400, height: 200 },
        })
        const id = added.item.id
        await api.setTransform(scene, id, {
          x: 500,
          y: 300,
          rotation: 0,
          scale_x: 1,
          scale_y: 1,
          alignment: 5,
          bounds: 'stretch',
          bounds_alignment: 5,
          bounds_width: 400,
          bounds_height: 200,
          crop_left: 0,
          crop_top: 0,
          crop_right: 0,
          crop_bottom: 0,
          width: 400,
          height: 200,
        })
        const centreOf = (f: [number, number, number, number, number, number]) => ({
          x: f[4] + (f[0] + f[2]) * 0.5,
          y: f[5] + (f[1] + f[3]) * 0.5,
        })
        const find = async (targetId: number) => {
          const list = await api.items(scene)
          return list.flatMap((i) => [i, ...i.children]).find((i) => i.id === targetId)!
        }

        for (const edit of ['flip_h', 'flip_v', 'rotate_cw', 'rotate_ccw', 'rotate180'] as const) {
          await api.editItem(scene, id, edit)
          const item = await find(id)
          const c = centreOf(item.frame!)
          expect(c.x).toBeCloseTo(700, 2)
          expect(c.y).toBeCloseTo(400, 2)
        }

        // Grouped child: rotating 90 deg updates the parent group bounding box.
        const grp = await api.groupItems(scene, [id], 'Turn Group')
        await api.editItem(scene, id, 'rotate_cw')
        const grpNow = (await api.items(scene)).find((i) => i.id === grp.id)!
        const childNow = grpNow.children.find((c) => c.id === id)!
        expect(centreOf(childNow.frame!).x).toBeCloseTo(700, 2)
        expect(centreOf(childNow.frame!).y).toBeCloseTo(400, 2)
        // 400x200 rotated 90 deg around (700, 400) spans x=[600..800], y=[200..600].
        expect(grpNow.frame).toEqual([200, 0, 0, 400, 600, 200])
      } finally {
        engine.dispose()
      }
    })

    it('skips no-op crop undo entries and reverts an open drag when undo is called mid-drag', async () => {
      const engine = new DemoEngine({ autoplay: false, latencyMs: 0, studioEngine: true })
      try {
        const api = studioEngineApi(
          new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch }),
        )
        const scene = 'Main'
        const webcam = (await api.items(scene)).find((i) => i.name === 'Webcam')!
        await api.addScene('Prior Scene')
        const baselineUndoCount = (await api.history()).undo.length

        // 1. Direct no-op save:true and round-trip save:false -> back to start save:true push nothing.
        await api.setItemCrop(scene, webcam.id, {
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          save: true,
        })
        expect((await api.history()).undo.length).toBe(baselineUndoCount)

        await api.setItemCrop(scene, webcam.id, {
          left: 40,
          top: 0,
          right: 0,
          bottom: 0,
          save: false,
        })
        await api.setItemCrop(scene, webcam.id, {
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          save: true,
        })
        expect((await api.history()).undo.length).toBe(baselineUndoCount)

        // 2. Calling POST /undo while a drag (save:false) is open reverts that drag without popping Prior Scene.
        await api.setItemCrop(scene, webcam.id, {
          left: 60,
          top: 0,
          right: 0,
          bottom: 0,
          save: false,
        })
        expect((await api.transform(scene, webcam.id)).crop_left).toBe(60)
        const undone = await api.undo()
        expect(undone.done).toContain('Crop')
        expect((await api.transform(scene, webcam.id)).crop_left).toBe(0)
        expect((await api.scenes()).scenes.map((s) => s.name)).toContain('Prior Scene')
        expect((await api.history()).undo.length).toBe(baselineUndoCount)
      } finally {
        engine.dispose()
      }
    })
  })

  describe('setItemCrop anchoring, group sync, clamping, and undo coalescing', () => {
    it('anchors visible pixels for bounded, unbounded scaled/flipped/rotated, and grouped items', async () => {
      const engine = new DemoEngine({ autoplay: false, latencyMs: 0, studioEngine: true })
      try {
        const client = new FerroClient({
          base: engine.base,
          token: DEMO_TOKEN,
          fetch: engine.fetch,
        })
        const api = studioEngineApi(client)
        const scene = 'Main'
        const items = await api.items(scene)
        const webcam = items.find((i) => i.name === 'Webcam')!

        // Top-level bounded item: crop_left=100, crop_top=50 anchors opposite corner and shrinks bounds.
        await api.setTransform(scene, webcam.id, {
          x: 960,
          y: 540,
          rotation: 0,
          scale_x: 1,
          scale_y: 1,
          alignment: 5,
          bounds: 'stretch',
          bounds_alignment: 5,
          bounds_width: 480,
          bounds_height: 270,
          crop_left: 0,
          crop_top: 0,
          crop_right: 0,
          crop_bottom: 0,
          width: 1920,
          height: 1080,
        })
        const afterBounded = await api.setItemCrop(scene, webcam.id, {
          left: 192,
          top: 108,
          right: 0,
          bottom: 0,
          save: true,
        })
        const trBounded = await api.transform(scene, webcam.id)
        expect(trBounded.x).toBeCloseTo(1008, 2)
        expect(trBounded.y).toBeCloseTo(567, 2)
        expect(trBounded.bounds_width).toBeCloseTo(432, 2)
        expect(trBounded.bounds_height).toBeCloseTo(243, 2)
        expect(trBounded.bounds).toBe('stretch')
        expect(afterBounded.frame?.[4]).toBeCloseTo(1008, 2)
        expect((afterBounded.frame?.[4] ?? 0) + (afterBounded.frame?.[0] ?? 0)).toBeCloseTo(1440, 2)
        expect((afterBounded.frame?.[5] ?? 0) + (afterBounded.frame?.[3] ?? 0)).toBeCloseTo(810, 2)

        // Bounds fit preserves 'fit' when crop aspect stays equal, switches to 'stretch' otherwise.
        await api.setTransform(scene, webcam.id, {
          ...trBounded,
          bounds: 'fit',
          bounds_width: 480,
          bounds_height: 270,
          crop_left: 0,
          crop_top: 0,
          crop_right: 0,
          crop_bottom: 0,
          x: 960,
          y: 540,
        })
        await api.setItemCrop(scene, webcam.id, {
          left: 160,
          top: 90,
          right: 160,
          bottom: 90,
          save: false,
        })
        expect((await api.transform(scene, webcam.id)).bounds).toBe('fit')
        await api.setItemCrop(scene, webcam.id, {
          left: 200,
          top: 90,
          right: 160,
          bottom: 90,
          save: false,
        })
        expect((await api.transform(scene, webcam.id)).bounds).toBe('stretch')

        // Unbounded flipped + rotated item: shifts x,y along item axes so far edge remains anchored.
        await api.setTransform(scene, webcam.id, {
          x: 500,
          y: 100,
          rotation: 90,
          scale_x: -0.5,
          scale_y: 0.5,
          alignment: 5,
          bounds: 'none',
          bounds_alignment: 5,
          bounds_width: 0,
          bounds_height: 0,
          crop_left: 0,
          crop_top: 0,
          crop_right: 0,
          crop_bottom: 0,
          width: 1000,
          height: 500,
        })
        const rotRes = await api.setItemCrop(scene, webcam.id, {
          left: 100,
          top: 40,
          right: 0,
          bottom: 0,
          save: true,
        })
        // At rotation 90 & scale (-0.5, 0.5), initial frame is [0, -500, -250, 0, 500, 100].
        // Cropping left=100 (du=0.1) and top=40 (dv=0.08) shifts x by -250*0.08 = -20 and y by -500*0.1 = -50.
        const rotTr = await api.transform(scene, webcam.id)
        expect(rotTr.x).toBeCloseTo(480, 2)
        expect(rotTr.y).toBeCloseTo(50, 2)
        expect(rotRes.frame?.[4]).toBeCloseTo(480, 2)
        expect(rotRes.frame?.[5]).toBeCloseTo(50, 2)

        // Grouped item: cropping child updates both child and parent group frame.
        const addedRes = await api.addSource(scene, {
          kind: 'color_source_v3',
          name: 'Crop Child',
          settings: { color: 0xffff0000, width: 400, height: 200 },
        })
        const added = addedRes.item
        await api.setTransform(scene, added.id, {
          x: 100,
          y: 100,
          rotation: 0,
          scale_x: 1,
          scale_y: 1,
          alignment: 5,
          bounds: 'stretch',
          bounds_alignment: 5,
          bounds_width: 400,
          bounds_height: 200,
          crop_left: 0,
          crop_top: 0,
          crop_right: 0,
          crop_bottom: 0,
          width: 400,
          height: 200,
        })
        const grp = await api.groupItems(scene, [added.id], 'Crop Group')
        await api.setItemCrop(scene, added.id, {
          left: 80,
          top: 20,
          right: 0,
          bottom: 0,
          save: true,
        })
        const updatedItems = await api.items(scene)
        const groupNow = updatedItems.find((i) => i.id === grp.id)!
        const childNow = groupNow.children.find((c) => c.id === added.id)!
        expect(childNow.frame).toEqual([320, 0, 0, 180, 180, 120])
        expect(groupNow.frame).toEqual([320, 0, 0, 180, 180, 120])

        // Clamping: at least 1 pixel remains each way.
        await api.setItemCrop(scene, added.id, {
          left: 500,
          top: 500,
          right: 500,
          bottom: 500,
          save: true,
        })
        const clampedTr = await api.transform(scene, added.id)
        expect(400 - clampedTr.crop_left - clampedTr.crop_right).toBe(1)
        expect(200 - clampedTr.crop_top - clampedTr.crop_bottom).toBe(1)
      } finally {
        engine.dispose()
      }
    })

    it('coalesces save:false drag steps into one pre-drag undo step committed on save:true', async () => {
      const engine = new DemoEngine({ autoplay: false, latencyMs: 0, studioEngine: true })
      try {
        const client = new FerroClient({
          base: engine.base,
          token: DEMO_TOKEN,
          fetch: engine.fetch,
        })
        const api = studioEngineApi(client)
        const scene = 'Main'
        const items = await api.items(scene)
        const webcam = items.find((i) => i.name === 'Webcam')!
        await api.setTransform(scene, webcam.id, {
          x: 960,
          y: 540,
          rotation: 0,
          scale_x: 1,
          scale_y: 1,
          alignment: 5,
          bounds: 'stretch',
          bounds_alignment: 5,
          bounds_width: 480,
          bounds_height: 270,
          crop_left: 0,
          crop_top: 0,
          crop_right: 0,
          crop_bottom: 0,
          width: 1920,
          height: 1080,
        })
        const beforeUndoCount = (await api.history()).undo.length

        await api.setItemCrop(scene, webcam.id, {
          left: 40,
          top: 0,
          right: 0,
          bottom: 0,
          save: false,
        })
        await api.setItemCrop(scene, webcam.id, {
          left: 80,
          top: 0,
          right: 0,
          bottom: 0,
          save: false,
        })
        await api.setItemCrop(scene, webcam.id, {
          left: 160,
          top: 0,
          right: 0,
          bottom: 0,
          save: false,
        })
        // Nothing pushed to undo stack yet during drag.
        expect((await api.history()).undo.length).toBe(beforeUndoCount)

        await api.setItemCrop(scene, webcam.id, {
          left: 200,
          top: 0,
          right: 0,
          bottom: 0,
          save: true,
        })
        const histAfter = await api.history()
        expect(histAfter.undo.length).toBe(beforeUndoCount + 1)
        expect(histAfter.undo[0]).toContain('Crop')

        // Single undo restores the pre-drag position, size, and zero crop.
        await api.undo()
        const restored = await api.transform(scene, webcam.id)
        expect(restored.crop_left).toBe(0)
        expect(restored.x).toBe(960)
        expect(restored.bounds_width).toBe(480)
      } finally {
        engine.dispose()
      }
    })

    it('scopes pending crop undo to the active collection and clears pendingUndo on collection switch', async () => {
      const engine = new DemoEngine({ autoplay: false, latencyMs: 0, studioEngine: true })
      try {
        const client = new FerroClient({
          base: engine.base,
          token: DEMO_TOKEN,
          fetch: engine.fetch,
        })
        const api = studioEngineApi(client)
        const colA = (await api.shelf('collections')).current
        const webcam = (await api.items('Main')).find((i) => i.name === 'Webcam')!

        // Start a crop preview in collection A, then copy A -> B, add a B-only scene, and finish crop on same ID in B.
        await api.setItemCrop('Main', webcam.id, {
          left: 40,
          top: 0,
          right: 0,
          bottom: 0,
          save: false,
        })
        const { id: colB } = await api.newShelf('collections', 'Collection B', true)
        await api.addScene('B Only Scene')
        await api.setItemCrop('Main', webcam.id, {
          left: 120,
          top: 0,
          right: 0,
          bottom: 0,
          save: true,
        })

        // Undo in B must not restore collection A's stale snapshot (which would erase B Only Scene).
        await api.undo()
        const bScenes = (await api.scenes()).scenes.map((s) => s.name)
        expect(bScenes).toContain('B Only Scene')
        expect((await api.transform('Main', webcam.id)).crop_left).toBe(40)

        // Switching back to A and saving crop on matching ID does not leak from B.
        await api.switchShelf('collections', colA)
        await api.setItemCrop('Main', webcam.id, {
          left: 100,
          top: 0,
          right: 0,
          bottom: 0,
          save: true,
        })
        await api.switchShelf('collections', colB)
        expect((await api.scenes()).scenes.map((s) => s.name)).toContain('B Only Scene')
      } finally {
        engine.dispose()
      }
    })

    it('keeps intervening edits intact when undoing a save:false -> save:true crop', async () => {
      const engine = new DemoEngine({ autoplay: false, latencyMs: 0, studioEngine: true })
      try {
        const client = new FerroClient({
          base: engine.base,
          token: DEMO_TOKEN,
          fetch: engine.fetch,
        })
        const api = studioEngineApi(client)
        const scene = 'Main'
        const webcam = (await api.items(scene)).find((i) => i.name === 'Webcam')!
        await api.setItemCrop(scene, webcam.id, {
          left: 50,
          top: 0,
          right: 0,
          bottom: 0,
          save: false,
        })
        // Intervening undoable edit while preview crop is open.
        await api.addScene('Intervening Scene')
        await api.setItemCrop(scene, webcam.id, {
          left: 150,
          top: 0,
          right: 0,
          bottom: 0,
          save: true,
        })

        // Undoing the crop reverts Webcam's crop without deleting Intervening Scene.
        await api.undo()
        let scenes = (await api.scenes()).scenes.map((s) => s.name)
        expect(scenes).toContain('Intervening Scene')
        expect((await api.transform(scene, webcam.id)).crop_left).toBe(0)

        // Second undo removes Intervening Scene and still keeps last committed crop_left (0, not 50).
        await api.undo()
        scenes = (await api.scenes()).scenes.map((s) => s.name)
        expect(scenes).not.toContain('Intervening Scene')
        expect((await api.transform(scene, webcam.id)).crop_left).toBe(0)

        // Two redos bring back Intervening Scene and then the saved crop_left (150).
        await api.redo()
        scenes = (await api.scenes()).scenes.map((s) => s.name)
        expect(scenes).toContain('Intervening Scene')
        expect((await api.transform(scene, webcam.id)).crop_left).toBe(0)

        await api.redo()
        expect((await api.transform(scene, webcam.id)).crop_left).toBe(150)
      } finally {
        engine.dispose()
      }
    })

    it('handles fresh stills and macos-avcapture camera options in DemoStudioEngine', async () => {
      const engine = new DemoEngine({ autoplay: false, latencyMs: 0, studioEngine: true })
      try {
        const api = studioEngineApi(
          new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch }),
        )
        const spy = vi.spyOn(engine.studioEngine!, 'stillForDevice')
        const res = await api.sourceStill(
          'macos-avcapture',
          'device',
          'cam-facetime',
          480,
          undefined,
          {
            fresh: true,
          },
        )
        expect(res.image).toMatch(/^data:image\/svg\+xml/)
        expect(spy).toHaveBeenCalledWith('cam-facetime', { fresh: true })

        const optsFast = await api.options('macos-avcapture-fast')
        expect(optsFast.some((o) => o.key === 'device' && (o.choices?.length ?? 0) > 0)).toBe(true)
      } finally {
        engine.dispose()
      }
    })

    it('guards moveScene against no-ops and rejects negative/non-integer indices like Rust usize', async () => {
      const engine = new DemoEngine({ autoplay: false, latencyMs: 0, studioEngine: true })
      try {
        const client = new FerroClient({
          base: engine.base,
          token: DEMO_TOKEN,
          fetch: engine.fetch,
        })
        const api = studioEngineApi(client)
        const initial = (await api.scenes()).scenes.map((s) => s.name)
        const baselineUndoCount = (await api.history()).undo.length
        const first = initial[0]!
        const last = initial[initial.length - 1]!

        // Negative or fractional `to` is rejected (matching MoveBody { to: usize } in Rust).
        await expect(api.moveScene(first, -3)).rejects.toBeTruthy()
        await expect(
          client.request('POST', `/api/v1/studio/engine/scenes/${encodeURIComponent(first)}/move`, {
            to: 1.5,
          }),
        ).rejects.toBeTruthy()

        // Exact current position and clamped upper edge push no undo.
        await api.moveScene(first, 0)
        await api.moveScene(last, 999)
        expect((await api.history()).undo.length).toBe(baselineUndoCount)
        expect((await api.scenes()).scenes.map((s) => s.name)).toEqual(initial)

        // An actual move pushes one undo entry and undo restores the prior order.
        await api.moveScene(last, 0)
        expect((await api.history()).undo.length).toBe(baselineUndoCount + 1)
        expect((await api.scenes()).scenes[0]!.name).toBe(last)

        await api.undo()
        expect((await api.scenes()).scenes.map((s) => s.name)).toEqual(initial)
      } finally {
        engine.dispose()
      }
    })

    it('supports vertical-canvas scenes lifecycle, moveScene reorder, undo/redo, collisions, screenshots, and nested-scene addExisting', async () => {
      const engine = new DemoEngine({ autoplay: false, latencyMs: 0, studioEngine: true })
      try {
        const api = studioEngineApi(
          new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch }),
        )
        expect((await api.scenes()).vertical).toBeNull()

        const undoBeforeVertical = (await api.history()).undo.length
        await api.startVertical('Tall 1')
        expect((await api.history()).undo.length).toBe(undoBeforeVertical)
        await api.addScene('Tall 2', true)
        await api.addScene('Tall 3', true)

        // Source names and group renames cannot collide with vertical scene names.
        await expect(
          api.addSource('Main', { kind: 'color_source_v3', name: 'Tall 2' }),
        ).rejects.toBeTruthy()
        await api.addSource('Main', { kind: 'color_source_v3', name: 'Box' })
        await api.addScene('Box 2', true)
        const copied = await api.pasteCopy('Gameplay', 'Box')
        expect(copied.name).toBe('Box 3')
        const grpBox = await api.groupItems('Main', [], 'Group A')
        expect(grpBox.name).toBe('Group A')
        await expect(api.rename('Group A', 'Tall 2')).rejects.toBeTruthy()

        // Active vertical scenes can be screenshotted.
        const shot = await api.screenshot('Tall 2')
        expect(shot.file).toContain('Tall 2')

        const before = await api.scenes()
        expect(before.vertical?.width).toBe(1080)
        expect(before.vertical?.height).toBe(1920)
        expect(before.vertical?.current).toBe('Tall 1')
        expect(before.vertical?.scenes.map((s) => s.name)).toEqual([
          'Tall 1',
          'Tall 2',
          'Tall 3',
          'Box 2',
        ])
        expect(before.scenes.some((s) => s.name.startsWith('Tall '))).toBe(false)

        // No-op move on vertical scene pushes no undo.
        const undoCountBeforeNoop = (await api.history()).undo.length
        await api.moveScene('Tall 1', 0)
        await api.moveScene('Box 2', 99)
        expect((await api.history()).undo.length).toBe(undoCountBeforeNoop)

        // Real move on vertical scene updates vertical.scenes without switching main or vertical current.
        await api.moveScene('Tall 3', 0)
        const afterMove = await api.scenes()
        expect(afterMove.vertical?.scenes.map((s) => s.name)).toEqual([
          'Tall 3',
          'Tall 1',
          'Tall 2',
          'Box 2',
        ])
        expect(afterMove.vertical?.current).toBe('Tall 1')
        expect((await api.history()).undo.length).toBe(undoCountBeforeNoop + 1)

        await api.undo()
        expect((await api.scenes()).vertical?.scenes.map((s) => s.name)).toEqual([
          'Tall 1',
          'Tall 2',
          'Tall 3',
          'Box 2',
        ])
        await api.redo()
        expect((await api.scenes()).vertical?.scenes.map((s) => s.name)).toEqual([
          'Tall 3',
          'Tall 1',
          'Tall 2',
          'Box 2',
        ])

        // setCurrent switches vertical scene when vertical is active, then stopVertical hides it without pushing undo.
        await api.setCurrent('Tall 2')
        expect((await api.scenes()).vertical?.current).toBe('Tall 2')
        const undoBeforeStop = (await api.history()).undo.length
        await api.stopVertical()
        expect((await api.history()).undo.length).toBe(undoBeforeStop)
        expect((await api.scenes()).vertical).toBeNull()
        await expect(api.moveScene('Tall 2', 0)).rejects.toBeTruthy()
        await expect(api.screenshot('Tall 2')).rejects.toBeTruthy()

        // Re-starting restores previous vertical scenes without pushing undo.
        await api.startVertical('Ignored')
        expect((await api.history()).undo.length).toBe(undoBeforeStop)
        expect((await api.scenes()).vertical?.scenes.map((s) => s.name)).toEqual([
          'Tall 3',
          'Tall 1',
          'Tall 2',
          'Box 2',
        ])

        // Nested scene addExisting mirrors Rust stage.rs (allows another scene, blocks self).
        await api.addScene('Sub Scene')
        const nested = await api.addExisting('Gameplay', 'Sub Scene')
        expect(nested.item.name).toBe('Sub Scene')
        expect(nested.item.kind).toBe('scene')
        await expect(api.addExisting('Main', 'Main')).rejects.toBeTruthy()

        // Group the nested scene item, then rename and remove the referenced scene recursively.
        await api.groupItems('Gameplay', [nested.item.id], 'Nested Group')
        await api.rename('Sub Scene', 'Sub Scene Renamed')
        const afterRename = await api.items('Gameplay')
        const grp = afterRename.find((it) => it.group && it.name === 'Nested Group')!
        expect(grp.children.some((c) => c.kind === 'scene' && c.name === 'Sub Scene Renamed')).toBe(
          true,
        )

        await api.removeScene('Sub Scene Renamed')
        const afterRemove = await api.items('Gameplay')
        const grpAfter = afterRemove.find((it) => it.group && it.name === 'Nested Group')!
        expect(grpAfter.children.some((c) => c.name === 'Sub Scene Renamed')).toBe(false)
      } finally {
        engine.dispose()
      }
    })

    it('keeps vertical mode unchanged and preserves initial vertical scene across unrelated undo/redo while isolating collections', async () => {
      const engine = new DemoEngine({ autoplay: false, latencyMs: 0, studioEngine: true })
      try {
        const api = studioEngineApi(
          new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch }),
        )

        // 1. Main-canvas edit before first startVertical, then startVertical, then undo main edit.
        await api.addScene('Main Extra')
        await api.startVertical('Tall 1')
        await api.undo()
        const afterMainUndo = await api.scenes()
        expect(afterMainUndo.scenes.some((s) => s.name === 'Main Extra')).toBe(false)
        expect(afterMainUndo.vertical).not.toBeNull()
        expect(afterMainUndo.vertical?.scenes.map((s) => s.name)).toEqual(['Tall 1'])
        expect(afterMainUndo.vertical?.current).toBe('Tall 1')

        // Redo restores Main Extra without dropping Tall 1 or toggling Vertical off.
        await api.redo()
        const afterMainRedo = await api.scenes()
        expect(afterMainRedo.scenes.some((s) => s.name === 'Main Extra')).toBe(true)
        expect(afterMainRedo.vertical?.scenes.map((s) => s.name)).toEqual(['Tall 1'])

        // 2. Add Tall 2, select it, stop Vertical, then undo the add: Vertical must stay off.
        await api.addScene('Tall 2', true)
        await api.setCurrent('Tall 2')
        await api.stopVertical()
        expect((await api.scenes()).vertical).toBeNull()

        await api.undo()
        expect((await api.scenes()).vertical).toBeNull()

        // Re-enabling Vertical shows Tall 2 was undone and current fell back safely to Tall 1.
        await api.startVertical('Ignored')
        const reEnabled = await api.scenes()
        expect(reEnabled.vertical?.scenes.map((s) => s.name)).toEqual(['Tall 1'])
        expect(reEnabled.vertical?.current).toBe('Tall 1')

        // Stopping Vertical then redoing Add Tall 2 keeps Vertical off and restores Tall 2.
        await api.stopVertical()
        await api.redo()
        expect((await api.scenes()).vertical).toBeNull()
        await api.startVertical('Ignored')
        expect((await api.scenes()).vertical?.scenes.map((s) => s.name)).toEqual([
          'Tall 1',
          'Tall 2',
        ])

        // 3. Collection switching still restores each collection's own vertical state.
        const colA = (await api.shelf('collections')).current
        const { id: colB } = await api.newShelf('collections', 'Collection B', false)
        expect((await api.scenes()).vertical).toBeNull()
        await api.switchShelf('collections', colA)
        expect((await api.scenes()).vertical?.scenes.map((s) => s.name)).toEqual([
          'Tall 1',
          'Tall 2',
        ])
        await api.switchShelf('collections', colB)
        expect((await api.scenes()).vertical).toBeNull()
      } finally {
        engine.dispose()
      }
    })

    it('prunes grouped orphan sources when deleting a vertical scene while retaining shared sources', async () => {
      const engine = new DemoEngine({ autoplay: false, latencyMs: 0, studioEngine: true })
      try {
        const api = studioEngineApi(
          new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch }),
        )
        await api.startVertical('Tall 1')
        await api.addScene('Tall 2', true)
        const onlyTall = await api.addSource('Tall 2', {
          kind: 'color_source_v3',
          name: 'Tall Only Color',
        })
        await api.addSource('Main', {
          kind: 'color_source_v3',
          name: 'Shared Color',
        })
        const sharedInTall = await api.addExisting('Tall 2', 'Shared Color')
        await api.groupItems('Tall 2', [onlyTall.item.id, sharedInTall.item.id], 'Tall Group')
        await api.removeScene('Tall 2')
        await expect(
          api.addSource('Main', { kind: 'color_source_v3', name: 'Tall Only Color' }),
        ).resolves.toBeTruthy()
        await expect(
          api.addSource('Gameplay', { kind: 'color_source_v3', name: 'Shared Color' }),
        ).rejects.toMatchObject({ status: 409, code: 'studio_name_taken' })
      } finally {
        engine.dispose()
      }
    })

    it('allows stopping an active vertical source recording after vertical is turned off', async () => {
      const engine = new DemoEngine({ autoplay: false, latencyMs: 0, studioEngine: true })
      try {
        const api = studioEngineApi(
          new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch }),
        )
        await api.startVertical('Tall 1')
        await api.recordSource('Tall 1', true)
        expect((await api.stats()).source_records?.map((r) => r.name)).toContain('Tall 1')
        await api.stopVertical()
        await expect(api.recordSource('Tall 1', false)).resolves.toEqual({ file: null })
        expect((await api.stats()).source_records ?? []).toEqual([])
      } finally {
        engine.dispose()
      }
    })

    it('updates group bounds and transform when deleting a nested scene reference inside a group', async () => {
      const engine = new DemoEngine({ autoplay: false, latencyMs: 0, studioEngine: true })
      try {
        const api = studioEngineApi(
          new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch }),
        )
        await api.addScene('Full Nested')
        const nestedRef = await api.addExisting('Gameplay', 'Full Nested')
        const small = await api.addSource('Gameplay', {
          kind: 'color_source_v3',
          name: 'Small Box',
        })
        await api.setItemBox('Gameplay', small.item.id, {
          x: 200,
          y: 150,
          w: 120,
          h: 80,
          save: true,
        })
        const grp = await api.groupItems(
          'Gameplay',
          [nestedRef.item.id, small.item.id],
          'Mixed Group',
        )
        expect(grp.frame).toEqual([1920, 0, 0, 1080, 0, 0])

        await api.removeScene('Full Nested')
        const grpAfter = (await api.items('Gameplay')).find((i) => i.id === grp.id)!
        expect(grpAfter.frame).toEqual([120, 0, 0, 80, 200, 150])
        const grpTransform = await api.transform('Gameplay', grp.id)
        expect([
          grpTransform.x,
          grpTransform.y,
          grpTransform.bounds_width,
          grpTransform.bounds_height,
        ]).toEqual([200, 150, 120, 80])
      } finally {
        engine.dispose()
      }
    })

    it('removes global audio devices via setChannel(ch, null) and restores volume and filters on undo', async () => {
      const engine = new DemoEngine({ autoplay: false, latencyMs: 0, studioEngine: true })
      try {
        const api = studioEngineApi(
          new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch }),
        )
        await api.start()
        await api.setAudio('Desktop Audio', { volume_db: -8.5, monitor: 'only_me' })
        await api.addFilter('Desktop Audio', {
          kind: 'gain_filter',
          name: 'Desk Boost',
          settings: { db: 4 },
        })

        await api.setChannel(1, null)
        expect((await api.audio('Main')).some((a) => a.name === 'Desktop Audio')).toBe(false)

        await api.undo()
        const restored = (await api.audio('Main')).find((a) => a.name === 'Desktop Audio')
        expect(restored).toMatchObject({
          channel: 1,
          volume_db: -8.5,
          monitor: 'only_me',
        })
        expect((await api.filters('Desktop Audio')).map((f) => f.name)).toEqual(['Desk Boost'])

        // Also works for Mic on channel 3
        await api.setChannel(3, null)
        expect((await api.audio('Main')).some((a) => a.name === 'Mic')).toBe(false)
        await api.undo()
        expect((await api.audio('Main')).some((a) => a.name === 'Mic')).toBe(true)
      } finally {
        engine.dispose()
      }
    })

    it('returns realistic filterOptions metadata for clean-mic filters', async () => {
      const engine = new DemoEngine({ autoplay: false, latencyMs: 0, studioEngine: true })
      try {
        const api = studioEngineApi(
          new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch }),
        )
        await api.start()
        await api.addFilter('Mic', {
          kind: 'compressor_filter',
          name: 'Even out loud moments',
          settings: { ratio: 3, threshold: -26, output_gain: 9 },
        })
        await api.addFilter('Mic', {
          kind: 'expander_filter',
          name: 'Quiet between words',
          settings: { presets: 'expander', ratio: 3.5, threshold: -40, output_gain: 0 },
        })
        const compOpts = await api.filterOptions('Mic', 'Even out loud moments')
        expect(compOpts.some((o) => o.key === 'output_gain')).toBe(true)
        const expOpts = await api.filterOptions('Mic', 'Quiet between words')
        expect(expOpts.map((o) => o.key)).toContain('presets')
        expect(expOpts.map((o) => o.key)).toContain('threshold')
      } finally {
        engine.dispose()
      }
    })

    it('reports speech in levels and silences mic:quiet alerts for the stream', async () => {
      const silent = new DemoEngine({
        autoplay: false,
        latencyMs: 0,
        studioEngine: { micPreset: 'silent' },
      })
      const active = new DemoEngine({
        autoplay: false,
        latencyMs: 0,
        studioEngine: { micPreset: 'quiet' },
      })
      try {
        const apiSilent = studioEngineApi(
          new FerroClient({ base: silent.base, token: DEMO_TOKEN, fetch: silent.fetch }),
        )
        const apiActive = studioEngineApi(
          new FerroClient({ base: active.base, token: DEMO_TOKEN, fetch: active.fetch }),
        )
        await apiSilent.start()
        await apiActive.start()

        const sLevels = await apiSilent.levels(['Mic', 'Desktop Audio'])
        expect(sLevels.Mic?.speech).toBe(false)
        expect(sLevels['Desktop Audio']?.speech).toBe(false)

        const aLevels = await apiActive.levels(['Mic', 'Desktop Audio'])
        expect(aLevels.Mic?.speech).toBe(true)
        expect(aLevels['Desktop Audio']?.speech).toBe(false)

        await apiActive.setAudio('Mic', { muted: true })
        expect((await apiActive.levels(['Mic'])).Mic?.speech).toBe(false)
        await apiActive.setAudio('Mic', { muted: false })

        const alert = {
          id: 'mic:quiet:Mic',
          level: 'warn' as const,
          message: 'Mic sounds quiet.',
          cleared: false,
          source: 'Mic',
          action: 'gain_up' as const,
          dismiss: 'quiet_ok' as const,
        }
        expect(active.emitLiveAlert(alert)).toBe(true)
        await apiActive.silenceLiveAlert('mic:quiet:Mic')
        expect(active.emitLiveAlert(alert)).toBe(false)
        await expect(apiActive.silenceLiveAlert('camera:Cam:black')).rejects.toThrow()

        // Starting a new stream clears silenced alerts.
        await apiActive.stream(true)
        expect(active.emitLiveAlert(alert)).toBe(true)
      } finally {
        silent.dispose()
        active.dispose()
      }
    })
  })
})
