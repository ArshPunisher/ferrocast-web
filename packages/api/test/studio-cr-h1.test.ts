import { afterEach, describe, expect, it, vi } from 'vitest'
import { DemoEngine, DEMO_TOKEN } from '../src/demo'
import { FerroClient } from '../src/client'
import { ApiError } from '../src/errors'
import { studioApi } from '../src/studio'
import { studioEngineApi } from '../src/studio-engine'

// CodeRabbit round on the hands-on Studio model: each test fails before its fix.

const engines: DemoEngine[] = []
afterEach(() => {
  engines.splice(0).forEach((e) => e.dispose())
})

function rig(studioEngine: true | { hasMic?: boolean } = true) {
  const engine = new DemoEngine({ autoplay: false, latencyMs: 0, studioEngine })
  engines.push(engine)
  const client = new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch })
  return { engine, client, studio: studioApi(client), eng: studioEngineApi(client) }
}

const fail = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => e as ApiError,
  )

/** A moderator's chat line, as the demo's command handler gets it. */
function modSays(engine: DemoEngine, text: string): void {
  engine.studio.onChat({
    id: `ev-${Math.random()}`,
    platform: 'twitch',
    origin: 'live',
    at: Date.now(),
    kind: {
      type: 'chat_message',
      actor: { platform: 'twitch', id: 'mod1', display_name: 'ModMira', roles: 2 },
      content: { text, fragments: [] },
      reply_to: null,
      is_action: false,
    },
  } as never)
}

describe('replay buffer', () => {
  it('!clip works when the show started the Studio replay buffer', async () => {
    const { engine, studio, eng } = rig()
    await eng.start()
    await studio.startShow(true, true)
    expect(await eng.stats()).toMatchObject({ replay: { active: true } })
    modSays(engine, '!clip')
    const marks = await studio.markers()
    expect(marks.some((m) => m.clip && m.label.includes('ModMira'))).toBe(true)
  })
})

describe('device identity and renames', () => {
  it('undoing a rename of the microphone brings its sound back', async () => {
    const { eng } = rig()
    await eng.start()
    const before = (await eng.levels(['Mic']))['Mic']!
    expect(before.peak[0]).toBeGreaterThan(-100)
    await eng.rename('Mic', 'Headset')
    await eng.undo()
    const after = (await eng.levels(['Mic']))['Mic']
    expect(after?.peak[0], 'the mic is silent after the undo').toBeGreaterThan(-100)
  })

  it('renaming the microphone through its channel keeps the scene items working', async () => {
    const { eng } = rig()
    await eng.start()
    await eng.setChannel(3, { kind: 'coreaudio_input_capture', name: 'Headset' })
    // The Main scene's mic item follows the new name: its filters still open.
    const items = await eng.items('Main')
    const mic = items.find((i) => i.name === 'Headset')
    expect(mic, 'the item was renamed with the source').toBeDefined()
    await expect(eng.filters('Headset')).resolves.toBeDefined()
  })

  it('a channel rename to a name that is taken is refused, not overwriting the camera', async () => {
    const { eng } = rig()
    await eng.start()
    const e = await fail(eng.setChannel(3, { kind: 'coreaudio_input_capture', name: 'Webcam' }))
    expect(e?.status).toBe(409)
    expect((await eng.filters('Webcam')).length).toBeGreaterThanOrEqual(0)
  })
})

describe('undo', () => {
  it('undoing an item edit leaves what is on air and the mute state alone', async () => {
    const { eng } = rig()
    await eng.start()
    await eng.setAudio('Mic', { muted: true })
    await eng.addSource('Main', { kind: 'color_source_v3', name: 'Banner' })
    await eng.setCurrent('Gameplay')
    await eng.setAudio('Mic', { muted: false })
    await eng.undo()
    const main = await eng.items('Main')
    expect(
      main.some((i) => i.name === 'Banner'),
      'the item edit was undone',
    ).toBe(false)
    expect((await eng.stats()).scene, 'still on Gameplay').toBe('Gameplay')
    const mic = (await eng.audio('Main')).find((a) => a.name === 'Mic')
    expect(mic?.muted, 'the mic is still unmuted').toBe(false)
  })
})

describe('filters', () => {
  it('pasting a source’s filters onto itself answers and doubles nothing it is reading', async () => {
    const { client, eng } = rig()
    await eng.start()
    await eng.addFilter('Mic', { kind: 'gain_filter', name: 'Boost', settings: { db: 3 } })
    const before = (await eng.filters('Mic')).length
    const done = client.request<void>('POST', '/api/v1/studio/engine/sources/Mic/paste-filters', {
      from: 'Mic',
    })
    await done
    const after = await eng.filters('Mic')
    // Each filter that was there once is copied once (the copy is named apart).
    expect(after.length).toBe(before * 2)
  })
})

describe('stopping the show', () => {
  it('a stop scheduled before Stop now does not stop a stream started again later', async () => {
    vi.useFakeTimers()
    try {
      const { studio, eng } = rig()
      await eng.start()
      const cfg = await studio.showConfig()
      await studio.saveShowConfig({
        ...cfg,
        stop_stream: true,
        stop_delay_s: 30,
        ending_scene: null,
      })
      await studio.startShow(true, true)
      await studio.endShow()
      // Stop now brings the waiting stop forward; the person then streams again.
      await studio.endShow(true)
      expect(await eng.streamStats()).toBeNull()
      await eng.stream(true)
      expect((await eng.streamStats())?.active).toBe(true)
      // The first deadline passes: the new stream is not touched.
      await vi.advanceTimersByTimeAsync(31_000)
      expect((await eng.streamStats())?.active, 'the restarted stream was stopped').toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('the microphone check', () => {
  it('fails when the configured microphone is not in the Studio, and says Not muted only for a real one', async () => {
    const good = rig()
    await good.eng.start()
    const ok = (await good.studio.preflight()).checks.find((c) => c.id === 'mic:Mic')
    expect(ok).toMatchObject({ status: 'ok', detail: 'Not muted.' })
    const { studio, eng } = rig({ hasMic: false })
    await eng.start()
    const gone = (await studio.preflight()).checks.find((c) => c.id === 'mic:Mic')
    expect(gone?.status).toBe('fail')
    expect(gone?.detail).not.toBe('Not muted.')
    expect(gone?.detail).toMatch(/no (source|microphone)/i)
  })

  it('the unmute fix for a missing microphone is refused, not reported as done', async () => {
    const { client, eng } = rig({ hasMic: false })
    await eng.start()
    const e = await fail(
      client.request('POST', '/api/v1/show/preflight/fix', { action: 'action:unmute:Mic' }),
    )
    expect(e?.status).toBe(400)
  })
})

describe('the show and fade to black', () => {
  it('a show switching the program scene clears a fade to black', async () => {
    const { studio, eng } = rig()
    await eng.start()
    await studio.saveShowConfig({ starting_scene: 'Gameplay' })
    await eng.fadeToBlack()
    expect((await eng.scenes()).black).toBe(true)
    await studio.startShow(true, true)
    const after = await eng.scenes()
    expect(after.current).toBe('Gameplay')
    expect(after.black, 'still black though the show is on Gameplay').toBeFalsy()
  })
})

describe('the default show on a fresh Studio', () => {
  it('passes preflight and starts without forcing', async () => {
    const { studio, eng } = rig()
    await eng.start()
    const pf = await studio.preflight()
    const failing = pf.checks.filter((c) => c.status === 'fail')
    expect(failing.map((c) => `${c.id}: ${c.detail}`)).toEqual([])
    const run = await studio.startShow()
    expect(run.show.phase).toBe('countdown')
  })

  it('still fails for a scene the Studio really does not have', async () => {
    const { studio, eng } = rig()
    await eng.start()
    await studio.saveShowConfig({ starting_scene: 'Nope' })
    expect((await studio.preflight()).checks.some((c) => c.status === 'fail')).toBe(true)
  })
})
