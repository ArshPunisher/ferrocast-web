import { describe, expect, it } from 'vitest'
import {
  auditLabel,
  phoneApi,
  remoteAllowed,
  remoteApi,
  remoteLiveAllowed,
  remoteScreenAllowed,
  type RemoteView,
} from '../src/remote'
import { DemoEngine, DEMO_TOKEN } from '../src/demo'
import { FerroClient } from '../src/client'
import { ApiError } from '../src/errors'
import { parseLiveFrame } from '../src/live'

// The same cases as `crates/relay/src/remote/scope.rs` and the server's copy.
describe('the role rules (same as the PC and the relay)', () => {
  it('lets mods do only their list', () => {
    for (const [m, p] of [
      ['GET', '/chat'],
      ['POST', '/mod/ban'],
      ['POST', '/mod/timeout'],
      ['POST', '/mod/delete'],
      ['POST', '/mod/unban'],
      ['POST', '/mod/held/ev_1/release'],
      ['POST', '/mod/held/ev_1/drop'],
      ['POST', '/mod/panic'],
      ['GET', '/mod/panic'],
      ['GET', '/viewers/twitch/123'],
      ['GET', '/status'],
    ] as const)
      expect(remoteAllowed('mod', m, p), `${m} ${p}`).toBe(true)
    for (const [m, p] of [
      ['POST', '/chat/send'],
      ['GET', '/settings'],
      ['PUT', '/mod/filters'],
      ['PUT', '/mod/panic/config'],
      ['PUT', '/viewers/twitch/123/note'],
      ['GET', '/accounts'],
      ['GET', '/pro'],
      ['DELETE', '/mod/ban'],
      ['GET', '/mod/held/ev_1/drop'],
      ['POST', '/mod/held/a/b/drop'],
      ['GET', '/events'],
      ['GET', '/live'],
    ] as const)
      expect(remoteAllowed('mod', m, p), `${m} ${p}`).toBe(false)
  })

  it('lets owners do everything but the denied list', () => {
    for (const [m, p] of [
      ['GET', '/settings'],
      ['PUT', '/settings'],
      ['POST', '/chat/send'],
      ['GET', '/tips'],
      ['PUT', '/tips/brand'],
      ['GET', '/obs'],
      ['POST', '/obs/scene'],
      ['GET', '/media/m1'],
      ['POST', '/backups'],
      ['PUT', '/designs/d1'],
    ] as const)
      expect(remoteAllowed('owner', m, p), `${m} ${p}`).toBe(true)
    for (const [m, p] of [
      ['GET', '/accounts'],
      ['POST', '/accounts/twitch/connect'],
      ['POST', '/session/pair-code'],
      ['GET', '/pro'],
      ['POST', '/pro/remote/codes'],
      ['PUT', '/tips'],
      ['DELETE', '/tips'],
      ['PUT', '/tips/brand/avatar'],
      ['GET', '/discord'],
      ['PUT', '/obs'],
      ['POST', '/obs/detect'],
      ['POST', '/export'],
      ['POST', '/import/apply'],
      ['POST', '/designs/d1/export'],
      ['POST', '/backups/b1/restore'],
      ['POST', '/media'],
      ['POST', '/updates/install'],
      ['PATCH', '/settings'],
    ] as const)
      expect(remoteAllowed('owner', m, p), `${m} ${p}`).toBe(false)
  })

  it('lets an owner phone look at and switch the cloud bot, nothing else under /pro', () => {
    expect(remoteAllowed('owner', 'GET', '/pro/bot')).toBe(true)
    expect(remoteAllowed('owner', 'PUT', '/pro/bot/enabled')).toBe(true)
    for (const [m, p] of [
      ['POST', '/pro/bot/twitch/connect'],
      ['DELETE', '/pro/bot/kick'],
      ['PUT', '/pro/bot'],
      ['GET', '/pro/bot/enabled'],
      ['DELETE', '/pro/bot/enabled'],
      ['GET', '/pro/bots'],
      ['GET', '/pro'],
    ] as const)
      expect(remoteAllowed('owner', m, p), `${m} ${p}`).toBe(false)
    for (const [m, p] of [
      ['GET', '/pro/bot'],
      ['PUT', '/pro/bot/enabled'],
    ] as const)
      expect(remoteAllowed('mod', m, p), `${m} ${p}`).toBe(false)
  })

  it('refuses odd paths for everyone', () => {
    for (const p of [
      '',
      '/',
      'mod/ban',
      '/mod//ban',
      '/mod/../accounts',
      '/media/%2e%2e',
      '/media/a%2Fb',
      '/media/a%00',
      '/media/a b',
      '/chat?x=1',
    ])
      for (const role of ['owner', 'mod'] as const)
        expect(remoteAllowed(role, 'GET', p), p).toBe(false)
    expect(remoteAllowed('owner', 'GET', '/counters/deaths%20today')).toBe(true)
  })

  it('sends mods chat frames only, and every frame to owners', () => {
    const ev = (type: string) => ({ type: 'event', data: { kind: { type } } })
    expect(remoteLiveAllowed('mod', ev('chat_message'))).toBe(true)
    expect(remoteLiveAllowed('mod', ev('tip'))).toBe(false)
    expect(remoteLiveAllowed('mod', { type: 'queue', data: {} })).toBe(false)
    expect(remoteLiveAllowed('mod', { type: 'notice', data: { key: 'panic' } })).toBe(true)
    expect(remoteLiveAllowed('mod', { type: 'notice', data: { key: 'discord' } })).toBe(false)
    expect(remoteLiveAllowed('owner', ev('tip'))).toBe(true)
  })

  it('shows mods two screens and hides import from owners', () => {
    expect(remoteScreenAllowed('mod', 'chat')).toBe(true)
    expect(remoteScreenAllowed('mod', 'moderation')).toBe(true)
    expect(remoteScreenAllowed('mod', 'home')).toBe(false)
    expect(remoteScreenAllowed('mod', 'settings')).toBe(false)
    expect(remoteScreenAllowed('owner', 'settings')).toBe(true)
    expect(remoteScreenAllowed('owner', 'import')).toBe(false)
  })

  it('says audit lines in words', () => {
    expect(auditLabel({ action: 'POST /mod/ban', status: 200 })).toBe('Banned someone')
    expect(auditLabel({ action: 'PUT /mod/filters', status: 403 })).toBe(
      'Tried: changed /mod/filters (not allowed)',
    )
    expect(auditLabel({ action: 'POST /mod/timeout', status: 504 })).toBe(
      'Timed someone out (failed)',
    )
    expect(auditLabel({ action: 'PAIR device', status: 200 })).toBe('Paired')
  })

  it('parses the relay’s remote frame', () => {
    const f = parseLiveFrame(
      JSON.stringify({ v: 1, type: 'remote', data: { pc_online: false, role: 'mod' } }),
    )
    expect(f?.type).toBe('remote')
  })
})

function demo(opts: ConstructorParameters<typeof DemoEngine>[0] = {}) {
  const engine = new DemoEngine({ autoplay: false, latencyMs: 0, ...opts })
  const client = new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch })
  return { engine, client }
}

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p
    return 'ok'
  } catch (e) {
    return e instanceof ApiError ? `${e.status} ${e.code}` : String(e)
  }
}

describe('demo: Settings › Dashboard anywhere', () => {
  it('lists devices without Pro, makes links only with it', async () => {
    const { engine, client } = demo()
    const api = remoteApi(client)
    const v: RemoteView = await api.view()
    expect(v.available).toBe(false)
    expect(v.devices.length).toBe(2)
    expect(await code(api.link('owner'))).toBe('402 pro_required')
    engine.setPro({ active: true, features: true })
    expect((await api.view()).available).toBe(true)
    const link = await api.link('mod', 'Meera')
    expect(link.url).toMatch(/^https:\/\/remote\.clearcraftlabs\.com\/app\/#pair=[2-9A-Z]{10}$/)
    expect(link.role).toBe('mod')
    expect(link.expires_at - Date.now()).toBeGreaterThan(9 * 60_000)
    expect(await code(api.link('boss' as 'mod'))).toBe('400 invalid')
    const d = engine.remoteDevices.pairNewest()
    expect(d?.name).toBe('Meera')
    expect((await api.view()).devices.length).toBe(3)
    await api.revoke(d!.id)
    expect((await api.view()).audit[0]?.action).toBe('REVOKE device')
    expect(await code(api.revoke('dv_nope'))).toBe('404 not_found')
  })

  it('stops at 5 own devices, unused links included', async () => {
    const { engine, client } = demo({ pro: { active: true, features: true } })
    const api = remoteApi(client)
    for (let i = 0; i < 4; i++) await api.link('owner')
    expect(await code(api.link('owner'))).toBe('409 too_many_devices')
    void engine
  })
})

describe('demo: acting as a phone', () => {
  it('refuses what the role may not do, and everything with the PC off', async () => {
    const { engine, client } = demo({ remote: { role: 'mod' } })
    expect(await code(client.chat(10))).toBe('ok')
    expect(await code(client.settings())).toBe('403 not_allowed_for_role')
    expect(await code(client.queue())).toBe('403 not_allowed_for_role')
    engine.setRemotePc(false)
    expect(await code(client.chat(10))).toBe('503 pc_offline')
  })

  it('filters the live socket by role and says when the PC goes away', async () => {
    const { engine, client } = demo({ remote: { role: 'mod' } })
    const got: { type: string; data: Record<string, unknown> }[] = []
    const sock = engine.socket(client.liveUrl())
    sock.onmessage = (ev) => got.push(JSON.parse(String(ev.data)))
    await new Promise((r) => setTimeout(r, 5))
    expect(got[0]).toEqual({ v: 1, type: 'remote', data: { pc_online: true, role: 'mod' } })
    expect(got.map((f) => f.type)).not.toContain('queue')
    expect(got.map((f) => f.type)).not.toContain('tts_pending')
    engine.setRemotePc(false)
    expect(got.at(-1)).toEqual({ v: 1, type: 'remote', data: { pc_online: false, role: 'mod' } })
    sock.close()
  })
})

describe('the phone’s pairing calls', () => {
  it('pairs and asks who it is, with the relay’s errors kept', async () => {
    const seen: string[] = []
    const fake = async (url: string, init?: RequestInit) => {
      seen.push(`${init?.method ?? 'GET'} ${url}`)
      if (url.endsWith('/v1/pair'))
        return JSON.parse(String(init?.body)).code === 'GOODCODE23'
          ? new Response(
              JSON.stringify({
                token: 'fcr_dv_1.s',
                device_id: 'dv_1',
                role: 'owner',
                name: 'P',
                expires_at: 1,
              }),
            )
          : new Response(
              JSON.stringify({
                error: {
                  code: 'not_found',
                  message: 'That link has expired or was already used.',
                  hint: null,
                },
              }),
              { status: 404 },
            )
      return new Response(
        JSON.stringify({
          device_id: 'dv_1',
          name: 'P',
          role: 'owner',
          expires_at: 1,
          pc_online: true,
        }),
      )
    }
    const api = phoneApi('https://remote.example.com/r/', fake)
    expect((await api.pair('GOODCODE23')).token).toBe('fcr_dv_1.s')
    expect(await code(api.pair('BAD'))).toBe('404 not_found')
    expect((await api.me('fcr_dv_1.s')).pc_online).toBe(true)
    expect(seen[0]).toBe('POST https://remote.example.com/r/v1/pair')
    expect(seen[2]).toBe('GET https://remote.example.com/r/v1/me')
  })
})
