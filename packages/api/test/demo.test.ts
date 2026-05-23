import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DemoEngine, DEMO_TOKEN, DEMO_PAIR } from '../src/demo'
import { FerroClient } from '../src/client'
import { ApiError } from '../src/errors'
import { parseOverlayFrame, ackFrame, helloFrame, visibilityFrame } from '../src/overlay-protocol'
import type { OverlayServerFrame, Overlay } from '../src/types'
import type { SocketLike } from '../src/socket'

let engine: DemoEngine
let client: FerroClient

beforeEach(() => {
  engine = new DemoEngine({ autoplay: false, latencyMs: 0 })
  client = new FerroClient({
    base: engine.base,
    token: DEMO_TOKEN,
    fetch: engine.fetch,
    sleep: async () => {},
  })
})
afterEach(() => engine.dispose())

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms))

async function openOverlay(
  o: Overlay,
  query = '',
): Promise<{ sock: SocketLike; frames: OverlayServerFrame[] }> {
  const token = /\/o\/([^/]+)\//.exec(o.url)?.[1] ?? ''
  const sock = engine.socket(`ws://127.0.0.1:47820/o/${token}/ws${query}`)
  const frames: OverlayServerFrame[] = []
  sock.onmessage = (ev) => {
    const f = parseOverlayFrame(ev.data)
    if (f) frames.push(f)
  }
  await tick()
  return { sock, frames }
}

describe('demo engine: session', () => {
  it('rejects calls without the session token', async () => {
    const anon = new FerroClient({ base: engine.base, token: null, fetch: engine.fetch })
    const e = (await anon.status().catch((x: unknown) => x)) as ApiError
    expect(e.status).toBe(401)
  })
  it('pairs with a code, and explains expired and used codes', async () => {
    const anon = new FerroClient({ base: engine.base, token: null, fetch: engine.fetch })
    await expect(anon.pair('K7M2QX')).resolves.toEqual({ token: DEMO_TOKEN })
    const expired = (await anon.pair(DEMO_PAIR.expired).catch((x: unknown) => x)) as ApiError
    expect(expired.status).toBe(401)
    expect(expired.message).toMatch(/expired/)
    const used = (await anon.pair(DEMO_PAIR.used).catch((x: unknown) => x)) as ApiError
    expect(used.message).toMatch(/already used/)
    const junk = (await anon.pair('<script>').catch((x: unknown) => x)) as ApiError
    expect(junk.status).toBe(400)
  })
  it('reports status with every connector', async () => {
    const s = await client.status()
    expect(Object.keys(s.connectors).sort()).toEqual(['kick', 'obs', 'relay', 'twitch', 'youtube'])
    expect(s.setup_done).toBe(true)
  })
})

describe('demo engine: faults and offline', () => {
  it.each([400, 401, 403, 404, 409, 413, 415, 422, 429, 503])(
    'injects a %i with the documented body',
    async (status) => {
      engine.addFault({ path: '/api/v1/overlays', status, times: 10 })
      const c = new FerroClient({
        base: engine.base,
        token: DEMO_TOKEN,
        fetch: engine.fetch,
        sleep: async () => {},
        startupRetries: 0,
      })
      const e = (await c.overlays().catch((x: unknown) => x)) as ApiError
      expect(e).toBeInstanceOf(ApiError)
      expect(e.status).toBe(status)
      expect(e.message.length).toBeGreaterThan(5)
      if (status === 429 || status === 503) expect(e.retryAfter).not.toBeNull()
    },
  )
  it('a one-shot fault clears itself', async () => {
    engine.addFault({ path: /overlays/, status: 422 })
    await expect(client.overlays()).rejects.toBeInstanceOf(ApiError)
    await expect(client.overlays()).resolves.toHaveLength(2)
  })
  it('offline makes fetch fail like a dead engine', async () => {
    engine.setOffline(true)
    const e = (await client.status().catch((x: unknown) => x)) as ApiError
    expect(e.offline).toBe(true)
    engine.setOffline(false)
    await expect(client.status()).resolves.toBeTruthy()
  })
  it('unknown routes are a 404 with copy', async () => {
    const e = (await client.request('GET', '/api/v1/nope').catch((x: unknown) => x)) as ApiError
    expect(e.status).toBe(404)
  })
  it('bad JSON is a 400', async () => {
    const r = await engine.fetch(`${engine.base}/api/v1/overlays`, {
      method: 'POST',
      body: '{',
      headers: { Authorization: `Bearer ${DEMO_TOKEN}` },
    })
    expect(r.status).toBe(400)
    expect(await r.json()).toMatchObject({ error: { code: 'invalid' } })
  })
})

describe('demo engine: overlays', () => {
  it('creates, renames with conflict checks, regenerates and deletes', async () => {
    const o = await client.createOverlay('Starting soon', 'chat_only')
    expect(o.widgets.map((w) => w.kind)).toEqual(['chat'])
    const dup = (await client.createOverlay('starting SOON').catch((x: unknown) => x)) as ApiError
    expect(dup.status).toBe(409)
    const empty = (await client.createOverlay('   ').catch((x: unknown) => x)) as ApiError
    expect(empty.status).toBe(400)
    const re = await client.regenerateUrl(o.id)
    expect(re.url).not.toBe(o.url)
    await client.deleteOverlay(o.id)
    const gone = (await client.overlay(o.id).catch((x: unknown) => x)) as ApiError
    expect(gone.status).toBe(404)
    expect(gone.hint).toMatch(/Reload/)
  })
  it('add to OBS works when connected and is a 422 otherwise', async () => {
    const [o] = await client.overlays()
    await expect(client.addToObs(o!.id)).resolves.toMatchObject({ scene: 'Gameplay' })
    const fresh = new DemoEngine({ autoplay: false, latencyMs: 0, setupDone: false })
    const c = new FerroClient({ base: fresh.base, token: DEMO_TOKEN, fetch: fresh.fetch })
    // A fresh install starts with no overlay, like the real engine.
    expect(await c.overlays()).toEqual([])
    const o2 = await c.createOverlay('Main', 'starter')
    const e = (await c.addToObs(o2.id).catch((x: unknown) => x)) as ApiError
    expect(e.status).toBe(422)
    expect(e.hint).toMatch(/copy the URL/i)
    fresh.dispose()
  })
  it('rejects bad widget layouts', async () => {
    const [o] = await client.overlays()
    const bad = { ...o!, widgets: [{ ...o!.widgets[0]!, w: 2 }] }
    await expect(client.saveOverlay(bad)).rejects.toMatchObject({ status: 400 })
    await expect(client.saveOverlay({ ...o!, width: 99999 })).rejects.toMatchObject({ status: 400 })
  })
})

describe('demo engine: overlay socket', () => {
  it('sends the snapshot first, then alerts; acks move the queue', async () => {
    const [main] = await client.overlays()
    const { sock, frames } = await openOverlay(main!)
    expect(frames[0]?.type).toBe('snapshot')
    sock.send(helloFrame(0))
    const { event_id } = await client.test('follow')
    expect(event_id).toBeTruthy()
    await tick()
    const alert = frames.find((f) => f.type === 'alert')
    expect(alert).toBeTruthy()
    if (alert?.type !== 'alert') throw new Error('no alert')
    expect(alert.data.test).toBe(true)
    expect(alert.data.title).toBe('NovaRiver followed!')
    const q1 = await client.queue()
    expect(q1.playing?.alert.alert_id).toBe(alert.data.alert_id)
    sock.send(ackFrame(alert.data.alert_id, 'started'))
    sock.send(ackFrame(alert.data.alert_id, 'finished'))
    await tick()
    expect((await client.queue()).playing).toBeNull()
    sock.close()
  })
  it('ignores forged acks and unknown client frames (an overlay can never create events)', async () => {
    const [main] = await client.overlays()
    const { sock } = await openOverlay(main!)
    await client.test('tip')
    await tick()
    const before = await client.queue()
    sock.send(ackFrame('not-the-current-alert', 'finished'))
    sock.send(JSON.stringify({ v: 1, type: 'event', data: { kind: { type: 'tip' } } }))
    sock.send('{garbage')
    await tick()
    const after = await client.queue()
    expect(after.playing?.alert.alert_id).toBe(before.playing?.alert.alert_id)
    const { events } = await client.events({ kinds: ['tip'] })
    expect(events.filter((e) => e.origin === 'test')).toHaveLength(1)
    sock.close()
  })
  it('an unknown overlay token gets no socket', async () => {
    const sock = engine.socket('ws://127.0.0.1:47820/o/deadbeef/ws')
    let closed = false
    sock.onclose = () => {
      closed = true
    }
    await tick()
    expect(closed).toBe(true)
  })
  it('regenerating the URL drops the old socket', async () => {
    const [main] = await client.overlays()
    const { sock } = await openOverlay(main!)
    let closed = false
    sock.onclose = () => {
      closed = true
    }
    await client.regenerateUrl(main!.id)
    expect(closed).toBe(true)
  })
  it('a hidden overlay gets nothing until visible again, then a fresh snapshot', async () => {
    const [main] = await client.overlays()
    const { sock, frames } = await openOverlay(main!)
    sock.send(visibilityFrame(false))
    const n = frames.length
    engine.injectSample('follow', 'twitch')
    await tick()
    expect(frames.length).toBe(n)
    sock.send(visibilityFrame(true))
    await tick()
    expect(frames.at(-1)?.type).toBe('snapshot')
    sock.close()
  })
  it('chat reaches overlays with a chat widget and deletes follow mod actions', async () => {
    const [main] = await client.overlays()
    const { frames, sock } = await openOverlay(main!)
    const e = engine.inject(
      {
        type: 'chat_message',
        actor: {
          platform: 'twitch',
          id: 'u1',
          login: 'evil',
          display_name: '<img src=x onerror=alert(1)>',
          avatar_url: null,
          color: null,
          roles: 0,
          badges: [],
          anonymous: false,
        },
        content: {
          text: '<script>alert(1)</script>',
          fragments: [{ type: 'text', text: '<script>alert(1)</script>' }],
        },
        reply_to: null,
        is_action: false,
      },
      'twitch',
    )
    await tick()
    expect(frames.some((f) => f.type === 'event' && f.data.id === e.id)).toBe(true)
    await client.deleteMessage('twitch', e.source_id ?? '')
    await client.ban({ platform: 'twitch', user_id: 'u1', login: 'evil' }, true, 'xss')
    await tick()
    expect(frames.some((f) => f.type === 'delete_message')).toBe(true)
    expect(frames.some((f) => f.type === 'delete_user')).toBe(true)
    sock.close()
  })
  it('test mode loops sample alerts on that socket only', async () => {
    const [main] = await client.overlays()
    const { frames, sock } = await openOverlay(main!, '?test')
    await tick(450)
    expect(frames.some((f) => f.type === 'alert')).toBe(true)
    sock.close()
  })
})

describe('demo engine: alerts and events', () => {
  it('tests every testable kind and refuses impossible ones', async () => {
    for (const k of [
      'follow',
      'subscription',
      'gift_batch',
      'platform_gift',
      'paid_message',
      'tip',
      'raid',
      'reward_redemption',
    ])
      await expect(client.test(k)).resolves.toHaveProperty('event_id')
    await expect(client.test('follow', 'youtube')).rejects.toMatchObject({ status: 400 })
    await expect(client.test('chat_message')).rejects.toMatchObject({ status: 400 })
  })
  it('queue controls: pause, skip, clear', async () => {
    await client.queuePause()
    await client.test('follow')
    await client.test('raid')
    let q = await client.queue()
    expect(q.paused).toBe(true)
    expect(q.waiting).toHaveLength(2)
    q = await client.queueResume()
    expect(q.playing).not.toBeNull()
    q = await client.queueSkip()
    expect(q.playing).toBeNull() // the 600 ms gap before the next one
    expect(q.waiting).toHaveLength(1)
    q = await client.queueClear()
    expect(q.waiting).toHaveLength(0)
  })
  it('explains why an alert did not fire', async () => {
    const { events } = await client.events({ limit: 50 })
    const hidden = events.find(
      (e) =>
        e.kind.type === 'follow' &&
        'actor' in e.kind &&
        e.kind.actor.display_name === 'quietfan_2009',
    )
    const why = await client.why(hidden!.id)
    expect(why.alerted).toBe(false)
    expect(why.reasons[0]).toMatch(/Twitch hid/)
    const raid = events.find((e) => e.kind.type === 'raid')
    expect((await client.why(raid!.id)).reasons[0]).toMatch(/Kick raids/)
    const backfill = events.find((e) => e.origin === 'backfill')
    expect((await client.why(backfill!.id)).reasons[0]).toMatch(/reconnect/)
  })
  it('pages the event log', async () => {
    const page = await client.events({ limit: 3 })
    expect(page.events).toHaveLength(3)
    expect(page.next_before).not.toBeNull()
    const next = await client.events({ limit: 3, before: page.next_before ?? 0 })
    expect(next.events[0]!.seq).toBeLessThan(page.events[2]!.seq)
  })
  it('replays an alertable event and refuses chat', async () => {
    const { events } = await client.events({ kinds: ['subscription'] })
    await expect(client.replay(events[0]!.id)).resolves.toHaveProperty('event_id')
    const chat = await client.chat(5)
    await expect(client.replay(chat[0]!.id)).rejects.toMatchObject({ status: 422 })
  })
  it('validates rules like the engine', async () => {
    const [rule] = await client.alertRules()
    await expect(
      client.saveAlertRule({
        ...rule!,
        variations: rule!.variations.map((v) => ({ ...v, duration_ms: 0 })),
      }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(client.saveAlertRule({ ...rule!, name: 'Follows!' })).resolves.toMatchObject({
      name: 'Follows!',
    })
  })
})

describe('demo engine: chat and moderation', () => {
  it('sends to all and reports per-platform failures', async () => {
    await client.disconnect('kick')
    const r = await client.send('hello chat', 'all')
    expect(r.sent.sort()).toEqual(['twitch', 'youtube'])
    expect(r.failed).toEqual([{ platform: 'kick', reason: 'Kick isn’t connected.' }])
    await expect(client.send('   ', 'all')).rejects.toMatchObject({ status: 400 })
    await expect(client.send('x'.repeat(501), 'all')).rejects.toMatchObject({ status: 400 })
  })
  it('replies only on the source platform (R-11)', async () => {
    const r = await client.send('thanks!', 'all', { platform: 'youtube', message_id: 'yt-1' })
    expect(r.sent).toEqual(['youtube'])
  })
  it('bans everywhere and lists it', async () => {
    const r = await client.ban({ platform: 'kick', user_id: 'k-1', login: 'spammer' }, true, 'spam')
    expect(r.banned.sort()).toEqual(['kick', 'twitch', 'youtube'])
    const bans = await client.bans()
    expect(bans[0]).toMatchObject({ user_id: 'k-1', everywhere: true })
    await client.unban('kick', 'k-1')
    await expect(client.unban('kick', 'k-1')).rejects.toMatchObject({ status: 404 })
  })
  it('panic mode pauses alerts and says what it applied', async () => {
    const r = await client.panic(true)
    expect(r.on).toBe(true)
    expect(r.applied.length).toBe(3)
    expect((await client.queue()).paused).toBe(true)
    await client.panic(false)
    expect((await client.queue()).paused).toBe(false)
  })
  it('timeouts respect platform limits', async () => {
    await expect(client.timeout('youtube', 'u', 2 * 86_400)).rejects.toMatchObject({ status: 422 })
    await expect(client.timeout('twitch', 'u', 0)).rejects.toMatchObject({ status: 400 })
  })
  it('notes round-trip and are capped', async () => {
    await client.saveNote('twitch', 'u1', 'Was nice in raid. Ask about the mod job.')
    expect((await client.note('twitch', 'u1')).text).toMatch(/mod job/)
    await expect(client.saveNote('twitch', 'u1', 'x'.repeat(2001))).rejects.toMatchObject({
      status: 400,
    })
  })
})

describe('demo engine: media uploads', () => {
  const file = (bytes: number, type: string, name: string) =>
    new File([new Uint8Array(bytes)], name, { type })
  it('accepts a small sound', async () => {
    const m = await client.upload(file(2048, 'audio/mpeg', 'ding.mp3'), 'ding.mp3')
    expect(m.kind).toBe('sound')
  })
  it('413 states the limit', async () => {
    const e = (await client
      .upload(file(5 * 1024 * 1024 + 1, 'audio/mpeg', 'long.mp3'), 'long.mp3')
      .catch((x: unknown) => x)) as ApiError
    expect(e.status).toBe(413)
    expect(e.message).toBe('Sounds can be up to 5 MB.')
  })
  it('415 says which types are allowed and refuses SVG', async () => {
    const e = (await client
      .upload(file(10, 'application/x-msdownload', 'virus.exe'), 'virus.exe')
      .catch((x: unknown) => x)) as ApiError
    expect(e.status).toBe(415)
    expect(e.hint).toMatch(/PNG/)
    const svg = (await client
      .upload(file(10, 'image/svg+xml', 'a.svg'), 'a.svg')
      .catch((x: unknown) => x)) as ApiError
    expect(svg.status).toBe(415)
    expect(svg.message).toMatch(/scripts/)
  })
  it('409 when a file is still used by an alert', async () => {
    const e = (await client.deleteMedia('m-chime').catch((x: unknown) => x)) as ApiError
    expect(e.status).toBe(409)
    expect(e.hint).toMatch(/Pick another/)
  })
})

describe('demo engine: live socket', () => {
  it('greets, then streams events and drops on offline', async () => {
    const sock = engine.socket(`ws://127.0.0.1:47820/api/v1/live?session=${DEMO_TOKEN}`)
    const types: string[] = []
    let closed = false
    sock.onmessage = (ev) => types.push((JSON.parse(String(ev.data)) as { type: string }).type)
    sock.onclose = () => {
      closed = true
    }
    await tick()
    expect(types.slice(0, 4)).toEqual(['hello', 'status', 'queue', 'tts_pending'])
    engine.injectSample('raid', 'twitch')
    expect(types).toContain('event')
    engine.setOffline(true)
    expect(closed).toBe(true)
  })
  it('a wrong session gets no socket', async () => {
    const sock = engine.socket('ws://127.0.0.1:47820/api/v1/live?session=wrong')
    let closed = false
    sock.onclose = () => {
      closed = true
    }
    await tick()
    expect(closed).toBe(true)
  })
})

describe('demo engine: first run', () => {
  it('connects Twitch with a device code and announces it', async () => {
    const fresh = new DemoEngine({ autoplay: false, latencyMs: 0, setupDone: false })
    const c = new FerroClient({ base: fresh.base, token: DEMO_TOKEN, fetch: fresh.fetch })
    expect((await c.status()).setup_done).toBe(false)
    const flow = await c.connect('twitch')
    expect(flow).toMatchObject({ flow: 'device_code', user_code: 'FRRO-4821' })
    await expect(c.connect('twitch')).resolves.toBeTruthy()
    const yt = await c.connect('youtube')
    expect(yt.flow).toBe('browser')
    await c.completeSetup()
    expect((await c.status()).setup_done).toBe(true)
    fresh.dispose()
  })
  it('409 when connecting twice', async () => {
    await expect(client.connect('twitch')).rejects.toMatchObject({ status: 409 })
  })
})

describe('demo engine: frames added in API.md §5–6', () => {
  const liveTypes = async (query = '') => {
    const sock = engine.socket(`ws://127.0.0.1:47820/api/v1/live?session=${DEMO_TOKEN}${query}`)
    const frames: { type: string; data: unknown }[] = []
    sock.onmessage = (ev) =>
      frames.push(JSON.parse(String(ev.data)) as { type: string; data: unknown })
    await tick()
    return { sock, frames }
  }
  it('sends goals after a goal change and panic with its plan', async () => {
    const { frames, sock } = await liveTypes()
    await client.adjustGoal('g-subs', 2)
    await client.panic(true)
    expect(frames.some((f) => f.type === 'goals' && Array.isArray(f.data))).toBe(true)
    const p = frames.find((f) => f.type === 'panic') as {
      data: { on: boolean; plan: { hotkey: string } }
    }
    expect(p.data.on).toBe(true)
    expect(p.data.plan.hotkey).toBeTruthy()
    sock.close()
  })
  it('announces held messages and keeps them off overlays', async () => {
    const [main] = await client.overlays()
    const ov = await openOverlay(main!)
    const { frames, sock } = await liveTypes()
    const e = engine.holdSpam('twitch')
    expect(frames.find((f) => f.type === 'held')).toMatchObject({ data: { event_id: e.id } })
    expect(ov.frames.some((f) => f.type === 'event' && f.data.id === e.id)).toBe(false)
    sock.close()
    ov.sock.close()
  })
  it('replays missed events after a reconnect, or asks for a resync', async () => {
    const seq = (await client.events({ limit: 1 })).events[0]!.seq
    engine.injectSample('follow', 'twitch')
    const a = await liveTypes(`&since=${seq}`)
    expect(a.frames.filter((f) => f.type === 'event').length).toBeGreaterThanOrEqual(1)
    const b = await liveTypes('&since=0')
    expect(b.frames.some((f) => f.type === 'resync')).toBe(true)
    a.sock.close()
    b.sock.close()
  })
  it('tells an overlay it was revoked before closing it', async () => {
    const [main] = await client.overlays()
    const { frames } = await openOverlay(main!)
    await client.regenerateUrl(main!.id)
    expect(frames.at(-1)?.type).toBe('revoked')
  })
  it('sends approved TTS to overlays with an alerts widget', async () => {
    await client.saveTts({ ...(await client.tts()), enabled: true, hold_for_approval: true })
    const [main] = await client.overlays()
    const { frames, sock } = await openOverlay(main!)
    engine.inject(
      {
        type: 'tip',
        actor: {
          platform: 'tips',
          id: null,
          login: 'r',
          display_name: 'Ravi',
          avatar_url: null,
          color: null,
          roles: 0,
          badges: [],
          anonymous: false,
        },
        money: { minor: 200_000, currency: 'INR' },
        message: 'read this please',
        provider: 'razorpay',
        payment_ref: 'p',
        status: 'captured',
      },
      'tips',
    )
    const [pending] = await client.ttsPending()
    expect(pending?.text).toBe('read this please')
    await client.ttsApprove(pending!.id)
    expect(frames.find((f) => f.type === 'tts')).toMatchObject({
      data: { text: 'read this please' },
    })
    sock.close()
  })
  it('media preview URLs carry the session', () => {
    expect(client.mediaUrl('m 1')).toBe(`${engine.base}/api/v1/media/m%201?session=${DEMO_TOKEN}`)
  })
})
