import { afterEach, describe, expect, it, vi } from 'vitest'
import { publishAccount, resetAccount, watchAccount } from './account-status'

describe('account status', () => {
  afterEach(() => {
    resetAccount()
    vi.unstubAllGlobals()
    delete (window as { __FERROCAST__?: unknown }).__FERROCAST__
  })

  it('asks again when the window comes back, so Pro given elsewhere shows (owner, 10 Nov)', async () => {
    ;(window as { __FERROCAST__?: unknown }).__FERROCAST__ = {
      remote: true,
      api: 'https://relay.example/r',
    }
    const asked: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        asked.push(String(url))
        return new Response(JSON.stringify({ plan: 'pro', pro: { active: true } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }),
    )
    publishAccount({ state: 'signed_in', plan: 'free', pro: null })
    watchAccount()
    window.dispatchEvent(new Event('focus'))
    await vi.waitFor(() => expect(asked.some((u) => u.endsWith('/v1/account'))).toBe(true))
    // Coming back again at once doesn't ask again.
    const n = asked.length
    window.dispatchEvent(new Event('focus'))
    expect(asked.length).toBe(n)
  })
})
