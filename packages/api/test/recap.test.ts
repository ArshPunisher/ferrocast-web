import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DemoEngine, DEMO_TOKEN } from '../src/demo'
import { FerroClient } from '../src/client'
import { ApiError } from '../src/errors'

let engine: DemoEngine
let client: FerroClient

beforeEach(() => {
  engine = new DemoEngine({ autoplay: false, latencyMs: 0 })
  client = new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch })
})
afterEach(() => engine.dispose())

describe('demo recap', () => {
  it('lists supporters and chatters, thanks each once, and checks since', async () => {
    const r = await client.recap()
    expect(r.started_at).not.toBeNull()
    expect(r.top_chatters.length).toBeGreaterThan(0)
    expect(new Set(r.thanks.map((t) => t.toLowerCase())).size).toBe(r.thanks.length)
    expect(r.top_chatters.every((c, i, a) => i === 0 || a[i - 1]!.messages >= c.messages)).toBe(
      true,
    )
    const bad = (await client.recap(Date.now() + 60_000).catch((e: unknown) => e)) as ApiError
    expect(bad.status).toBe(400)
    expect(bad.message).toMatch(/^since:/)
  })
})
