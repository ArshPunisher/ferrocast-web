import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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
    ]) {
      const e = await call().then(
        () => null,
        (x: unknown) => x as ApiError,
      )
      expect(e?.status).toBe(422)
      expect(e?.code).toBe('studio_unavailable')
    }
  })
})
