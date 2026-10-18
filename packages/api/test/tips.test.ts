import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DemoEngine, DEMO_TOKEN } from '../src/demo'
import { FerroClient } from '../src/client'
import { ApiError } from '../src/errors'
import {
  checkedTipPage,
  cleanTipText,
  tipDisplayNameProblem,
  tipHandleProblem,
  tipLinkProblem,
  tipMessageProblem,
  tipPageIdProblem,
  tipSecretProblem,
} from '../src/tips'
import type { TipSettingsInput } from '../src/types'

let engine: DemoEngine
let client: FerroClient

function make(opts: ConstructorParameters<typeof DemoEngine>[0] = {}) {
  engine?.dispose()
  engine = new DemoEngine({ autoplay: false, latencyMs: 0, ...opts })
  client = new FerroClient({
    base: engine.base,
    token: DEMO_TOKEN,
    fetch: engine.fetch,
    sleep: async () => {},
  })
}

beforeEach(() => make({ tips: 'empty' }))
afterEach(() => engine.dispose())

const fail = (p: Promise<unknown>) =>
  p.then(
    () => {
      throw new Error('expected a failure')
    },
    (e: unknown) => e as ApiError,
  )

const page = (over: Partial<TipSettingsInput> = {}): TipSettingsInput => ({
  handle: 'nova',
  display_name: 'Nova',
  message: '',
  razorpay: null,
  kofi: null,
  stripe: null,
  ...over,
})

describe('tip rules', () => {
  it('checks the tip page name like the relay', () => {
    expect(tipHandleProblem('  NoVa ')).toBeNull()
    expect(tipHandleProblem('no')).toMatch(/3 to 30/)
    expect(tipHandleProblem('a'.repeat(31))).toMatch(/3 to 30/)
    expect(tipHandleProblem('nova plays')).toMatch(/3 to 30/)
    expect(tipHandleProblem('növa')).toMatch(/3 to 30/)
    for (const h of [
      'admin',
      'help',
      'login',
      'pay',
      'tips',
      'novaofficial',
      'my-kofi',
      'ko-fi-nova',
    ])
      expect(tipHandleProblem(h), h).toMatch(/reserved/)
    expect(tipHandleProblem('nova_plays-2')).toBeNull()
  })

  it('checks display names and messages by characters, not bytes', () => {
    expect(tipDisplayNameProblem('   ')).toMatch(/1 to 40/)
    expect(tipDisplayNameProblem('\u202e')).toMatch(/1 to 40/)
    expect(tipDisplayNameProblem('😀'.repeat(40))).toBeNull()
    expect(tipDisplayNameProblem('x'.repeat(41))).toMatch(/1 to 40/)
    expect(tipMessageProblem('😀'.repeat(280))).toBeNull()
    expect(tipMessageProblem('x'.repeat(281))).toMatch(/280/)
    expect(cleanTipText(' Asha\u202e\u200b ')).toBe('Asha')
  })

  it('takes payment links only on each provider’s own https domains', () => {
    expect(checkedTipPage('razorpay', ' https://razorpay.me/@nova ')).toBe(
      'https://razorpay.me/@nova',
    )
    expect(checkedTipPage('razorpay', 'https://rzp.io/l/abc')).not.toBeNull()
    expect(checkedTipPage('razorpay', 'https://pages.razorpay.com/nova')).not.toBeNull()
    expect(checkedTipPage('razorpay', 'http://razorpay.me/@nova')).toBeNull()
    expect(checkedTipPage('razorpay', 'https://razorpay.me.evil.com/x')).toBeNull()
    expect(checkedTipPage('razorpay', 'https://user:pw@razorpay.me/x')).toBeNull()
    expect(checkedTipPage('kofi', 'https://ko-fi.com/nova')).not.toBeNull()
    expect(checkedTipPage('stripe', 'https://buy.stripe.com/test_abc')).not.toBeNull()
    expect(checkedTipPage('stripe', 'https://stripe.com/x')).toBeNull()
    expect(tipLinkProblem('stripe', 'nope')).toBe(
      'The Stripe link must be an https link on buy.stripe.com.',
    )
  })

  it('refuses secrets that are clearly the wrong thing', () => {
    expect(tipSecretProblem('stripe', 'sk_live_123', false)).toMatch(/API key/)
    expect(tipSecretProblem('stripe', 'rk_live_123', false)).toMatch(/API key/)
    expect(tipSecretProblem('stripe', 'pk_live_123', false)).toMatch(/API key/)
    expect(tipSecretProblem('stripe', 'abc12345', false)).toMatch(/starts with whsec_/)
    expect(tipSecretProblem('stripe', 'whsec_abc', false)).toBeNull()
    expect(tipSecretProblem('razorpay', 'short', false)).toMatch(/at least 8/)
    expect(tipSecretProblem('kofi', 'x'.repeat(201), false)).toMatch(/too long/)
    expect(tipSecretProblem('kofi', '', false)).toMatch(/Add the Ko-fi webhook secret/)
    expect(tipSecretProblem('kofi', '  ', true)).toBeNull()
  })

  it('takes Payment Link ids only where a webhook carries them', () => {
    expect(tipPageIdProblem('razorpay', ' plink_Abc123 ')).toBeNull()
    expect(tipPageIdProblem('stripe', '')).toBeNull()
    expect(tipPageIdProblem('stripe', 'pl_123')).toMatch(/plink_/)
    expect(tipPageIdProblem('stripe', 'plink_a-b')).toMatch(/plink_/)
    expect(tipPageIdProblem('kofi', 'plink_abc')).toMatch(/plink_/)
  })
})

describe('client: tips', () => {
  it('puts the page, deletes it with a 204', async () => {
    const calls: { url: string; method: string; body: string | undefined }[] = []
    const fn = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? 'GET', body: init?.body as string | undefined })
      return init?.method === 'DELETE'
        ? new Response(null, { status: 204 })
        : new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    const c = new FerroClient({ base: 'http://x', token: 't', fetch: fn })
    await c.saveTips(page())
    await expect(c.deleteTips()).resolves.toBeUndefined()
    expect(calls.map((x) => `${x.method} ${x.url}`)).toEqual([
      'PUT http://x/api/v1/tips',
      'DELETE http://x/api/v1/tips',
    ])
    expect(JSON.parse(calls[0]?.body ?? '{}')).toMatchObject({ handle: 'nova', razorpay: null })
  })
})

describe('demo engine: tips', () => {
  it('has no page, link or webhooks before the first save', async () => {
    const t = await client.tips()
    expect(t).toMatchObject({ handle: '', page_url: null, webhooks: null, razorpay: null })
  })

  it('normalises the save and only then shows the page and webhooks', async () => {
    const t = await client.saveTips(page({ handle: '  NoVa ', display_name: ' Nova\u202e ' }))
    expect(t.handle).toBe('nova')
    expect(t.display_name).toBe('Nova')
    expect(t.page_url).toBe('https://tip.clearcraftlabs.com/nova')
    expect(t.webhooks?.razorpay).toMatch(/\/v1\/tips\/razorpay\//)
    expect(t.webhooks?.kofi).toMatch(/\/v1\/tips\/kofi\//)
    expect(t.webhooks?.stripe).toMatch(/\/v1\/tips\/stripe\//)
    await expect(client.tips()).resolves.toEqual(t)
  })

  it('keeps a saved secret when the next save leaves it blank, and never returns it', async () => {
    const secret = 'rzp-secret-1'
    const first = await client.saveTips(
      page({ razorpay: { page_url: 'https://razorpay.me/@nova', secret } }),
    )
    expect(first.razorpay).toEqual({
      page_url: 'https://razorpay.me/@nova',
      page_id: null,
      test_mode: false,
      has_secret: true,
    })
    const edit = await client.saveTips(
      page({
        message: 'thanks!',
        razorpay: { page_url: 'https://razorpay.me/@nova', secret: '', page_id: ' plink_X1 ' },
      }),
    )
    expect(edit.razorpay?.has_secret).toBe(true)
    expect(edit.razorpay?.page_id).toBe('plink_X1')
    expect(edit.message).toBe('thanks!')
    expect(JSON.stringify(await client.tips())).not.toContain(secret)
  })

  it('needs the secret the first time a provider is added', async () => {
    const e = await fail(client.saveTips(page({ kofi: { page_url: 'https://ko-fi.com/nova' } })))
    expect([e.status, e.code]).toEqual([400, 'invalid'])
    expect(e.message).toMatch(/Add the Ko-fi webhook secret/)
  })

  it('turning a provider off forgets its secret', async () => {
    const kofi = { page_url: 'https://ko-fi.com/nova', secret: 'kofi-token-1', test_mode: true }
    const on = await client.saveTips(page({ kofi }))
    expect(on.kofi?.test_mode).toBe(true)
    await client.saveTips(page({ kofi: null }))
    const e = await fail(client.saveTips(page({ kofi: { page_url: kofi.page_url } })))
    expect(e.message).toMatch(/Add the Ko-fi webhook secret/)
  })

  it('refuses bad fields with the relay’s words', async () => {
    const cases: [Partial<TipSettingsInput>, RegExp][] = [
      [{ handle: 'pay' }, /reserved/],
      [{ handle: 'x' }, /3 to 30/],
      [{ display_name: '' }, /1 to 40/],
      [{ message: 'x'.repeat(281) }, /280/],
      [
        { razorpay: { page_url: 'https://razorpay.me.evil.com/x', secret: 'longenough' } },
        /https link on razorpay.me/,
      ],
      [{ stripe: { page_url: 'https://buy.stripe.com/x', secret: 'sk_live_1' } }, /API key/],
      [
        { stripe: { page_url: 'https://buy.stripe.com/x', secret: 'whsec_1', page_id: 'abc' } },
        /plink_/,
      ],
      [
        { kofi: { page_url: 'https://ko-fi.com/x', secret: 'longenough', page_id: 'plink_1' } },
        /plink_/,
      ],
    ]
    for (const [over, msg] of cases) {
      const e = await fail(client.saveTips(page(over)))
      expect(e.status, JSON.stringify(over)).toBe(400)
      expect(e.message).toMatch(msg)
    }
    const arr = await fail(client.request('PUT', '/api/v1/tips', [1, 2]))
    expect([arr.status, arr.code]).toEqual([400, 'invalid'])
  })

  it('says when a name is taken, with the 30-day hint', async () => {
    const e = await fail(client.saveTips(page({ handle: 'asha' })))
    expect([e.status, e.code, e.message]).toEqual([409, 'taken', 'That tip page name is taken.'])
    expect(e.hint).toMatch(/30 days/)
  })

  it('allows three new names a day, then a 429; the same name never counts', async () => {
    for (const handle of ['nova', 'nova', 'nova-two', 'nova-three'])
      await client.saveTips(page({ handle }))
    const e = await fail(client.saveTips(page({ handle: 'nova-four' })))
    expect([e.status, e.code]).toEqual([429, 'rate_limited'])
    expect(e.hint).toMatch(/tomorrow/)
    await expect(
      client.saveTips(page({ handle: 'nova-three', message: 'hi' })),
    ).resolves.toMatchObject({
      message: 'hi',
    })
  })

  it('is a 422 when the build has no relay', async () => {
    make({ tips: 'empty', relay: false })
    const e = await fail(client.saveTips(page()))
    expect([e.status, e.code]).toEqual([422, 'unavailable'])
    expect(e.message).toMatch(/no relay set up/)
    const d = await fail(client.deleteTips())
    expect([d.status, d.code]).toEqual([422, 'unavailable'])
  })

  it('takes the page down with a 204 and starts empty again', async () => {
    make()
    expect((await client.tips()).page_url).not.toBeNull()
    await expect(client.deleteTips()).resolves.toBeUndefined()
    expect(await client.tips()).toMatchObject({ page_url: null, webhooks: null, razorpay: null })
    // The name stays with its owner, so taking it back works.
    await expect(client.saveTips(page({ handle: 'novaplays' }))).resolves.toMatchObject({
      handle: 'novaplays',
    })
  })

  it('lets tests inject the documented faults', async () => {
    engine.addFault({
      method: 'PUT',
      path: '/api/v1/tips',
      status: 409,
      code: 'taken',
      message: 'That tip page name is taken.',
    })
    const e = await fail(client.saveTips(page()))
    expect(e.status).toBe(409)
    await expect(client.saveTips(page())).resolves.toMatchObject({ handle: 'nova' })
  })
})
