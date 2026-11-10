import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DemoEngine, DEMO_TOKEN } from '../src/demo'
import { FerroClient } from '../src/client'
import { ApiError } from '../src/errors'
import { automationsApi, type Rule } from '../src/automations'

let engine: DemoEngine
let api: ReturnType<typeof automationsApi>

beforeEach(() => {
  engine = new DemoEngine({ autoplay: false, latencyMs: 0 })
  api = automationsApi(
    new FerroClient({
      base: engine.base,
      token: DEMO_TOKEN,
      fetch: engine.fetch,
      sleep: async () => {},
    }),
  )
})
afterEach(() => engine.dispose())

const rule = (over: Partial<Rule> = {}): Rule => ({
  id: 'thanks',
  name: 'Thanks',
  on: true,
  cooldown_s: 10,
  when: { type: 'follow' },
  then: [{ type: 'chat', text: 'Thanks {name}!' }],
  ...over,
})

async function refusal(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p
  } catch (e) {
    if (e instanceof ApiError) return e
    throw e
  }
  throw new Error('not refused')
}

describe('automations (demo engine)', () => {
  it('starts with a sample, saves a list and runs a rule', async () => {
    const start = await api.list()
    expect(start.map((r) => r.id)).toEqual(['clip'])
    const saved = await api.save([...start, rule()])
    expect(saved.map((r) => r.id)).toEqual(['clip', 'thanks'])
    expect((await api.list())[1]?.then[0]).toEqual({ type: 'chat', text: 'Thanks {name}!' })
    await expect(api.run('thanks')).resolves.toBeNull()
    const gone = await refusal(api.run('nope'))
    expect([gone.status, gone.code]).toEqual([404, 'automation_not_found'])
  })

  it('refuses a bad list with why and keeps the old one', async () => {
    const cases: [Partial<Rule>, RegExp][] = [
      [{ id: 'bad id' }, /isn’t one/],
      [{ name: ' ' }, /name is empty/],
      [{ cooldown_s: 1 }, /3 to 3600/],
      [{ then: [] }, /nothing to do/],
      [{ then: Array(11).fill({ type: 'save_replay' }) }, /up to 10 steps/],
      [{ when: { type: 'chat', text: '', anyone: true } }, /chat command is empty/],
      [{ when: { type: 'every', minutes: 0 } }, /1 to 720/],
      [{ then: [{ type: 'wait', seconds: 601 }] }, /1 to 600/],
      [{ then: [{ type: 'chat', text: 'x'.repeat(301) }] }, /longer than 300/],
      [{ then: [{ type: 'show', scene: 'Main', source: '' }] }, /source is empty/],
    ]
    for (const [over, why] of cases) {
      const e = await refusal(api.save([rule(over)]))
      expect([e.status, e.code], JSON.stringify(over)).toEqual([422, 'automation_invalid'])
      expect(e.message).toMatch(why)
    }
    const twice = await refusal(api.save([rule(), rule()]))
    expect(twice.message).toMatch(/Two rules/)
    const many = await refusal(
      api.save(Array.from({ length: 51 }, (_, i) => rule({ id: `r${i}` }))),
    )
    expect(many.message).toMatch(/Up to 50/)
    expect((await api.list()).map((r) => r.id)).toEqual(['clip'])
  })
})
