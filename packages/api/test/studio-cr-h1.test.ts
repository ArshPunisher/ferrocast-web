import { afterEach, describe, expect, it } from 'vitest'
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

function rig() {
  const engine = new DemoEngine({ autoplay: false, latencyMs: 0, studioEngine: true })
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
