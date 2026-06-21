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

const fail = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => e as ApiError,
  )

describe('demo welcome settings', () => {
  it('is off by default and names bad fields', async () => {
    const c = await client.welcome()
    expect(c.enabled).toBe(false)
    expect(c.returning_days).toBe(30)
    for (const [body, field] of [
      [{ enabled: 1 }, 'enabled:'],
      [{ template: '' }, 'template:'],
      [{ template: '{name' }, 'template:'],
      [{ returning_days: 3 }, 'returning_days:'],
      [{ returning_days: 'x' }, 'returning_days:'],
    ] as const) {
      const e = await fail(client.request('PUT', '/api/v1/welcome', body))
      expect(e?.status).toBe(400)
      expect(e?.message.startsWith(field), e?.message).toBe(true)
    }
    expect((await client.saveWelcome({ enabled: true })).enabled).toBe(true)
  })
})
