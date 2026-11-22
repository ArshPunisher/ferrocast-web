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
