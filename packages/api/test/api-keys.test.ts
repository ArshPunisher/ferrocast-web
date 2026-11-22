import { describe, expect, it } from 'vitest'
import { API_KEY_LIMITS, FerroClient, remoteAllowed } from '../src'
import { DEMO_TOKEN, DemoEngine } from '../src/demo'

function makeClient() {
  const engine = new DemoEngine({ autoplay: false, latencyMs: 0 })
  const client = new FerroClient({
    base: engine.base,
    token: DEMO_TOKEN,
    fetch: engine.fetch,
  })
  return { engine, client }
}

describe('local API keys (R34)', () => {
  it('creates a scoped key once, hides secret in list, and revokes cleanly', async () => {
    const { client } = makeClient()
    const before = await client.apiKeys()
    expect(before.keys.length).toBeGreaterThanOrEqual(2)
    expect(before.audit.length).toBeGreaterThanOrEqual(2)

    const future = Date.now() + 7 * 86_400_000
    const created = await client.createApiKey({
      name: '  Python Controller  ',
      scopes: ['studio_control', 'read_only', 'studio_control'],
      expires_at: future,
    })

    expect(created.key.name).toBe('Python Controller')
    expect(created.key.scopes).toEqual(['read_only', 'studio_control'])
    expect(created.key.expires_at).toBe(future)
    expect(created.key.revoked_at).toBeNull()
    expect(created.token).toMatch(/^fc_key_[0-9a-f]{64}$/)
    expect(created.key.prefix).toBe(`${created.token.slice(0, 15)}...`)

    const after = await client.apiKeys()
    expect(after.keys[0]?.id).toBe(created.key.id)
    expect(JSON.stringify(after)).not.toContain(created.token)

    await client.revokeApiKey(created.key.id)
    const afterRevoke = await client.apiKeys()
    const revoked = afterRevoke.keys.find((k) => k.id === created.key.id)
    expect(revoked?.revoked_at).not.toBeNull()
  })

  it('rejects empty names, empty scopes, past expiry, and exceeding active cap', async () => {
    const { engine, client } = makeClient()
    engine.apiKeys.setEmpty()

    await expect(client.createApiKey({ name: '   ', scopes: ['read_only'] })).rejects.toMatchObject(
      {
        status: 400,
      },
    )
    await expect(client.createApiKey({ name: 'Ok', scopes: [] })).rejects.toMatchObject({
      status: 400,
    })
    await expect(
      client.createApiKey({ name: 'Old', scopes: ['read_only'], expires_at: Date.now() - 1000 }),
    ).rejects.toMatchObject({ status: 400 })

    for (let i = 0; i < API_KEY_LIMITS.maxActiveKeys; i++) {
      await client.createApiKey({ name: `Key ${i}`, scopes: ['read_only'] })
    }
    await expect(
      client.createApiKey({ name: 'Too many', scopes: ['read_only'] }),
    ).rejects.toMatchObject({
      status: 409,
    })
  })

  it('denies /api-keys on remote owner and mod sessions', () => {
    for (const role of ['owner', 'mod'] as const) {
      expect(remoteAllowed(role, 'GET', '/api-keys')).toBe(false)
      expect(remoteAllowed(role, 'POST', '/api-keys')).toBe(false)
      expect(remoteAllowed(role, 'DELETE', '/api-keys/k1')).toBe(false)
    }
  })
})
