import { describe, expect, it } from 'vitest'
import {
  accountIsPro,
  accountName,
  accountPlanLine,
  sessionLine,
  webAccountApi,
  type AccountView,
} from '../src/account'
import { FerroClient } from '../src/client'
import { DEMO_TOKEN, DemoEngine } from '../src/demo'

const json = (status: number, body: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

describe('account words', () => {
  const pro: AccountView = {
    state: 'signed_in',
    account: {
      id: 'ac_1',
      email: 'kabir@x.com',
      name: null,
      avatar_url: null,
      created_at: 0,
      providers: ['email'],
    },
    pro: {
      active: true,
      plan: 'yearly',
      source: 'subscription',
      status: 'active',
      subscription_id: 's',
      current_end: 1,
      access_until: 1,
      renews: true,
      cancel_at_period_end: false,
    },
  }
  it('names the plan and the person', () => {
    expect(accountIsPro(pro)).toBe(true)
    expect(accountPlanLine(pro)).toBe('Pro, yearly')
    expect(accountPlanLine({ state: 'signed_in' })).toBe('Free plan')
    expect(accountIsPro({ ...pro, state: 'signed_out' })).toBe(false)
    expect(accountName(pro.account)).toBe('kabir')
    expect(accountName({ name: '  Kabir Sethi ', email: 'k@x.com' })).toBe('Kabir Sethi')
    expect(sessionLine({ kind: 'app', label: 'Studio PC' })).toBe('Ferrocast app, Studio PC')
    expect(sessionLine({ kind: 'web', label: '' })).toBe('Web browser')
  })
})

describe('webAccountApi', () => {
  it('reads the cookie session and sends its CSRF token on writes', async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = []
    const api = webAccountApi('https://remote.example', async (url, init) => {
      calls.push({ url, init })
      if (url.endsWith('/v1/account'))
        return json(200, { account: { email: 'a@b.c' }, csrf_token: 'tok' })
      return json(204, undefined)
    })
    const v = await api.status()
    expect(v.state).toBe('signed_in')
    expect('csrf_token' in v).toBe(false)
    expect(api.csrfToken()).toBe('tok')
    await api.signOut(true)
    const out = calls[1]
    expect(out?.url).toBe('https://remote.example/v1/account/logout')
    expect((out?.init?.headers as Record<string, string>)['X-CSRF-Token']).toBe('tok')
    expect(out?.init?.body).toBe('{"everywhere":true}')
    expect(out?.init?.credentials).toBe('same-origin')
  })

  it('maps 401, a disabled account and a relay without accounts', async () => {
    const answer = (status: number, code: string) =>
      webAccountApi('https://r.x', async () =>
        json(status, { error: { code, message: 'm', hint: 'h' } }),
      )
    expect((await answer(401, 'signed_out').status()).state).toBe('signed_out')
    const d = await answer(403, 'account_disabled').status()
    expect(d.state).toBe('disabled')
    expect(d.error?.message).toBe('m')
    expect((await answer(404, 'not_found').status()).state).toBe('off')
    await expect(answer(503, 'storage').status()).rejects.toMatchObject({ status: 503 })
  })

  it('sends people to the relay’s sign-in page, back to /app/', async () => {
    const api = webAccountApi('https://remote.example/', async () => json(200, {}))
    expect((await api.signIn()).url).toBe('https://remote.example/login?next=%2Fapp%2F')
  })
})

describe('demo account', () => {
  it('signs in through the "browser", lists devices, signs out', async () => {
    const e = new DemoEngine({ autoplay: false, latencyMs: 0 })
    const c = new FerroClient({ base: 'http://127.0.0.1:47820', token: DEMO_TOKEN, fetch: e.fetch })
    expect((await c.request<AccountView>('GET', '/api/v1/pro/account')).state).toBe('signed_out')
    await expect(c.request('GET', '/api/v1/pro/account/sessions')).rejects.toMatchObject({
      status: 401,
    })
    e.setAccount('signed_in')
    const v = await c.request<AccountView>('GET', '/api/v1/pro/account')
    expect(v.state).toBe('signed_in')
    expect(v.plan).toBe('free')
    const s = await c.request<{ sessions: { id: string }[] }>('GET', '/api/v1/pro/account/sessions')
    expect(s.sessions).toHaveLength(3)
    await c.request('DELETE', '/api/v1/pro/account/sessions/se_phone')
    await expect(
      c.request('DELETE', '/api/v1/pro/account/sessions/se_phone'),
    ).rejects.toMatchObject({ status: 404 })
    await expect(c.request('POST', '/api/v1/pro/account/sign-in', {})).rejects.toMatchObject({
      status: 409,
    })
    await c.request('POST', '/api/v1/pro/account/sign-out', { everywhere: false })
    expect((await c.request<AccountView>('GET', '/api/v1/pro/account')).state).toBe('signed_out')
    e.dispose()
  })
})
