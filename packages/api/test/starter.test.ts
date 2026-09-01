import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DemoEngine, DEMO_TOKEN } from '../src/demo'
import { FerroClient } from '../src/client'

let engine: DemoEngine
let client: FerroClient

beforeEach(() => {
  engine = new DemoEngine({ autoplay: false, latencyMs: 0 })
  client = new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch })
})
afterEach(() => engine.dispose())

describe('demo starter commands', () => {
  it('adds the missing ones once and skips names in use', async () => {
    const r = await client.addStarterCommands()
    expect(r.skipped).toEqual(['!so']) // the demo already has a !so
    expect(r.added.map((c) => c.name)).toEqual(['!socials', '!lurk', '!uptime'])
    // !socials waits for the streamer's links: viewers never get the placeholder.
    expect(r.added.map((c) => c.enabled)).toEqual([false, true, true])
    const again = await client.addStarterCommands()
    expect(again.added).toEqual([])
    expect(new Set((await client.commands()).map((c) => c.name)).size).toBe(
      (await client.commands()).length,
    )
  })
})
