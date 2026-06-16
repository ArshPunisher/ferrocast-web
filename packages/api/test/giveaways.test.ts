import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DemoEngine, DEMO_TOKEN } from '../src/demo'
import { FerroClient } from '../src/client'
import { ApiError } from '../src/errors'

let engine: DemoEngine
let client: FerroClient

beforeEach(() => {
  vi.useFakeTimers()
  engine = new DemoEngine({ autoplay: false, latencyMs: 0 })
  client = new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch })
})
afterEach(() => {
  engine.dispose()
  vi.useRealTimers()
})

const fail = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => e as ApiError,
  )

describe('demo giveaways', () => {
  it('names the field for bad giveaways', async () => {
    const cases: [unknown, string][] = [
      ['x', 'Send the giveaway'],
      [{}, 'prize:'],
      [{ prize: ' ' }, 'prize:'],
      [{ prize: 'Key', keyword: 'join' }, 'keyword:'],
      [{ prize: 'Key', cost: -1 }, 'cost:'],
      [{ prize: 'Key', cost: '5' }, 'cost:'],
      [{ prize: 'Key', subscriber_bonus: 'yes' }, 'subscriber_bonus:'],
    ]
    for (const [body, prefix] of cases) {
      const e = await fail(client.request('POST', '/api/v1/giveaways', body))
      expect(e?.status, JSON.stringify(body)).toBe(400)
      expect(e?.message.startsWith(prefix), `${JSON.stringify(body)}: ${e?.message}`).toBe(true)
    }
  })

  it('takes paid entries, draws once, redraws someone else, refunds on cancel', async () => {
    expect((await fail(client.drawGiveaway()))?.code).toBe('giveaway_not_found')
    const top = (await client.leaderboard(100)).find((x) => x.points >= 50)!
    const before = top.points
    await client.startGiveaway({ prize: 'A game key', cost: 25, subscriber_bonus: true })
    expect((await fail(client.startGiveaway({ prize: 'Another' })))?.status).toBe(409)
    expect((await fail(client.drawGiveaway()))?.status).toBe(422)
    await vi.advanceTimersByTimeAsync(25_000)
    const g = (await client.giveaway())!
    expect(g.entries).toBeGreaterThan(1)
    expect(g.entrants.some((e) => e.display_name === 'NightbotWannabe')).toBe(false)
    const [a, b] = await Promise.all([fail(client.drawGiveaway()), fail(client.drawGiveaway())])
    expect([a, b].filter((x) => x === null).length).toBe(1)
    expect([a?.status, b?.status]).toContain(409)
    const again = await client.redrawGiveaway()
    expect(again.winners[0]!.user_id).not.toBe(again.winners[1]!.user_id)
    const entered = again.entrants.some((e) => e.user_id === top.user_id)
    const { refunded } = await client.cancelGiveaway()
    expect(refunded).toBe(again.entries)
    expect((await client.points(top.platform, top.user_id)).points).toBe(before)
    expect(entered || refunded > 0).toBe(true)
  })
})
