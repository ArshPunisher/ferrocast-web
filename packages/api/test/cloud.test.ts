import { describe, expect, it } from 'vitest'
import { cloudBytes, cloudChannelLine, cloudFetch, cloudScreenAllowed } from '../src/cloud'

describe('cloud mode', () => {
  it('sends the cookie, the CSRF token on writes, and never a bearer token', async () => {
    const seen: { method: string; headers: Headers; credentials?: RequestCredentials }[] = []
    const f = cloudFetch(
      () => 'csrf-1',
      async (_i, init) => {
        seen.push({
          method: init?.method ?? 'GET',
          headers: new Headers(init?.headers),
          ...(init?.credentials ? { credentials: init.credentials } : {}),
        })
        return new Response('{}')
      },
    )
    await f('/c/api/v1/overlays', { headers: { Authorization: 'Bearer x' } })
    await f('/c/api/v1/overlays', { method: 'POST', headers: { Authorization: 'Bearer x' } })
    expect(seen[0]?.headers.get('x-csrf-token')).toBeNull()
    expect(seen[1]?.headers.get('x-csrf-token')).toBe('csrf-1')
    expect(seen.every((s) => s.headers.get('authorization') === null)).toBe(true)
    expect(seen.every((s) => s.credentials === 'same-origin')).toBe(true)
  })

  it('lists only the cloud screens', () => {
    for (const s of [
      'cloud',
      'chat',
      'alerts',
      'overlays',
      'overlay',
      'designs',
      'designer',
      'bot',
    ])
      expect(cloudScreenAllowed(s)).toBe(true)
    for (const s of ['home', 'studio', 'moderation', 'tips', 'settings', 'community'])
      expect(cloudScreenAllowed(s)).toBe(false)
  })

  it('says sizes and channel states plainly', () => {
    expect(cloudBytes(37_400_000)).toBe('37.4 MB')
    expect(cloudBytes(200_000_000)).toBe('200 MB')
    expect(cloudBytes(900_000)).toBe('900 KB')
    expect(cloudChannelLine(undefined, 'kick')).toBe('Kick isn’t connected.')
    const ch = {
      platform: 'twitch' as const,
      login: 'a',
      name: 'A',
      avatar_url: null,
      connected_at: 0,
      error: null,
    }
    expect(cloudChannelLine(ch, 'twitch')).toContain('from A')
    expect(
      cloudChannelLine(
        { ...ch, error: { code: 'x', message: 'Signed out.', hint: 'h' } },
        'twitch',
      ),
    ).toBe('Signed out.')
  })
})
