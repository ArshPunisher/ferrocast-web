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

describe('demo loyalty points', () => {
  it('has the engine defaults and saves only the fields sent', async () => {
    expect(await client.loyalty()).toEqual({
      enabled: true,
      name: 'points',
      per_interval: 10,
      interval_min: 5,
      follow_bonus: 50,
      sub_bonus: 250,
      tip_bonus: 100,
      raid_bonus: 100,
    })
    const saved = await client.saveLoyalty({ name: '  Coins ', follow_bonus: 0 })
    expect(saved.name).toBe('Coins')
    expect(saved.follow_bonus).toBe(0)
    expect(saved.sub_bonus).toBe(250)
  })

  it('names the field for every bad setting', async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ per_interval: 'ten' }, 'per_interval:'],
      [{ per_interval: -1 }, 'per_interval:'],
      [{ per_interval: 1.5 }, 'per_interval:'],
      [{ tip_bonus: 2_000_000 }, 'tip_bonus:'],
      [{ interval_min: 0 }, 'interval_min:'],
      [{ interval_min: 121 }, 'interval_min:'],
      [{ enabled: 'yes' }, 'enabled:'],
      [{ name: '' }, 'name:'],
      [{ name: '<b>' }, 'name:'],
    ]
    for (const [body, field] of cases) {
      const e = await fail(client.request('PUT', '/api/v1/loyalty', body))
      expect(e?.status, JSON.stringify(body)).toBe(400)
      expect(e?.message.startsWith(field), `${JSON.stringify(body)}: ${e?.message}`).toBe(true)
    }
  })

  it('ranks balances, shows them on the viewer card and adjusts them safely', async () => {
    const top = await client.leaderboard(5)
    expect(top.length).toBe(5)
    expect(top.map((t) => t.rank)).toEqual([1, 2, 3, 4, 5])
    expect(top[0]!.points).toBeGreaterThanOrEqual(top[4]!.points)
    expect(top.some((t) => t.display_name === 'NightbotWannabe')).toBe(false)
    const { platform, user_id, points } = top[0]!
    const card = await client.viewer(platform, user_id)
    expect(card.points).toBe(points)
    expect((await client.adjustPoints(platform, user_id, 25)).points).toBe(points + 25)
    for (const delta of [0, 1.5, 2e9]) {
      const e = await fail(client.adjustPoints(platform, user_id, delta))
      expect(e?.status).toBe(400)
      expect(e?.message).toMatch(/^delta:/)
    }
    const tooMuch = await fail(client.adjustPoints(platform, user_id, -(points + 26)))
    expect(tooMuch?.message).toMatch(/at most/)
    expect((await client.points(platform, user_id)).points).toBe(points + 25)
    const ghost = await fail(client.points('kick', 'nobody'))
    expect([ghost?.status, ghost?.code]).toEqual([404, 'viewer_not_found'])
    const badLimit = await fail(client.request('GET', '/api/v1/loyalty/leaderboard?limit=0'))
    expect(badLimit?.message).toMatch(/^limit:/)
  })
})
