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
const ID = '112233445566778899'
const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWx_yz-0123'

describe('demo Discord settings', () => {
  it('checks the URL, never returns it, and explains test failures', async () => {
    expect((await fail(client.testDiscord()))?.status).toBe(422)
    for (const url of [
      `http://discord.com/api/webhooks/${ID}/${TOKEN}`,
      `https://evil.example/api/webhooks/${ID}/${TOKEN}`,
      `https://discord.com/api/webhooks/${ID}/${TOKEN}?x=1`,
    ]) {
      const e = await fail(client.saveDiscord({ webhook_url: url }))
      expect(e?.message).toMatch(/^webhook_url:/)
    }
    const saved = await client.saveDiscord({
      webhook_url: `https://discord.com/api/webhooks/${ID}/${TOKEN}`,
    })
    expect(saved.webhook_hint).toBe('discord.com webhook …8899')
    expect(JSON.stringify(saved)).not.toContain(TOKEN)
    await expect(client.testDiscord()).resolves.toBeUndefined()
    await client.saveDiscord({ webhook_url: `https://discord.com/api/webhooks/${ID}/${TOKEN}slow` })
    const slow = await fail(client.testDiscord())
    expect([slow?.status, slow?.retryAfter]).toEqual([429, 3])
    expect((await client.saveDiscord({ webhook_url: null })).has_webhook).toBe(false)
  })
})
