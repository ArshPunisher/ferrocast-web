// The demo engine matches the engine on the QA fixes of 18 Oct: backups with reasons,
// held-message review, scam filter actions, consistent viewer cards, pairing links.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DemoEngine, DEMO_SE_TOKEN, DEMO_TOKEN } from '../src/demo'
import { FerroClient } from '../src/client'
import { ApiError, fieldError } from '../src/errors'
import { plural } from '../src/format'
import { parseLiveFrame } from '../src/live'
import { parseOverlayFrame } from '../src/overlay-protocol'
import { Roles, type LiveFrame, type OverlayServerFrame } from '../src/types'

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

function openLive(): { frames: LiveFrame[]; close: () => void } {
  const sock = engine.socket(`ws://127.0.0.1:47820/api/v1/live?session=${DEMO_TOKEN}`)
  const frames: LiveFrame[] = []
  sock.onmessage = (ev) => {
    const f = parseLiveFrame(ev.data)
    if (f) frames.push(f)
  }
  return { frames, close: () => sock.close() }
}

describe('backups', () => {
  it('list newest first with a reason and version', async () => {
    const list = await client.backups()
    expect(list.map((b) => b.reason)).toEqual(['daily', 'update'])
    expect(list[0]!.created_at).toBeGreaterThan(list[1]!.created_at)
    expect(list.every((b) => typeof b.version === 'string')).toBe(true)
  })
  it('an import adds a backup row, and so does "Back up now"', async () => {
    const before = (await client.backups()).length
    const report = await client.importPack(new Blob(['x']), 'setup.ferropack')
    const after = await client.backups()
    expect(after).toHaveLength(before + 1)
    expect(after[0]).toMatchObject({ id: report.backup, reason: 'import' })
    const manual = await client.backupNow()
    expect(manual[0]?.reason).toBe('manual')
  })
  it('a StreamElements import backs up first and names that backup', async () => {
    const p = await client.previewStreamElements(DEMO_SE_TOKEN)
    const r = await client.applyImport(p.preview_id, 'keep')
    const list = await client.backups()
    expect(list[0]).toMatchObject({ id: r.backup, reason: 'import' })
  })
  it('restore says it finishes at the next start', async () => {
    // The demo is live; restoring waits until the stream is over.
    for (const p of ['twitch', 'youtube', 'kick'] as const) await client.disconnect(p)
    const [b] = await client.backups()
    const r = await client.restoreBackup(b!.id)
    expect(r).toEqual({ restart_needed: true, message: expect.stringMatching(/Restart/) })
  })
  it('an update takes a backup first', async () => {
    const s = await client.settings()
    await client.saveSettings({ ...s, never_update_while_live: false })
    await client.installUpdate()
    expect((await client.backups())[0]?.reason).toBe('update')
  })
  it('keeps the newest 7 daily backups and 10 others', () => {
    for (let i = 0; i < 12; i++) engine.takeBackup('daily')
    for (let i = 0; i < 14; i++) engine.takeBackup('manual')
    return client.backups().then((list) => {
      expect(list.filter((b) => b.reason === 'daily')).toHaveLength(7)
      expect(list.filter((b) => b.reason !== 'daily')).toHaveLength(10)
    })
  })
})

describe('held messages', () => {
  it('approve shows it in chat overlays; remove deletes it; both tell every dashboard', async () => {
    const live = openLive()
    const [main] = await client.overlays()
    const token = /\/o\/([^/]+)\//.exec(main!.url)?.[1] ?? ''
    const ov = engine.socket(`ws://127.0.0.1:47820/o/${token}/ws`)
    const overlay: OverlayServerFrame[] = []
    ov.onmessage = (ev) => {
      const f = parseOverlayFrame(ev.data)
      if (f) overlay.push(f)
    }
    await tick()
    const a = engine.holdSpam('twitch')
    const b = engine.holdSpam('kick')
    await tick()
    expect(overlay.some((f) => f.type === 'event' && f.data.id === a.id)).toBe(false)
    expect((await client.held()).map((e) => e.id)).toEqual([a.id, b.id])

    await client.releaseHeld(a.id)
    await client.dropHeld(b.id)
    await tick()
    expect(overlay.some((f) => f.type === 'event' && f.data.id === a.id)).toBe(true)
    expect(await client.held()).toEqual([])
    const resolved = live.frames.flatMap((f) => (f.type === 'held_resolved' ? [f.data] : []))
    expect(resolved).toEqual([
      { event_id: a.id, outcome: 'released' },
      { event_id: b.id, outcome: 'dropped' },
    ])
    const deleted = live.frames.some(
      (f) =>
        f.type === 'event' &&
        f.data.kind.type === 'message_deleted' &&
        f.data.kind.message_id === b.source_id,
    )
    expect(deleted).toBe(true)
    // Another mod got there first: a plain 404 the dashboard treats as done.
    const again = (await client.releaseHeld(a.id).catch((x: unknown) => x)) as ApiError
    expect(again).toBeInstanceOf(ApiError)
    expect([again.status, again.code]).toEqual([404, 'held_not_found'])
    live.close()
    ov.close()
  })
})

describe('scam filter', () => {
  it('does what its action says', async () => {
    const f = await client.filters()
    expect(f.solicitation.action).toBe('ban')
    const e = engine.spam('twitch')
    expect(await client.held()).toEqual([])
    const bans = await client.bans()
    const actor = e.kind.type === 'chat_message' ? e.kind.actor : null
    expect(bans[0]).toMatchObject({ user_id: actor?.id, reason: 'Scam filter' })

    await client.saveFilters({ ...f, solicitation: { enabled: true, action: 'hold' } })
    const held = engine.spam('twitch')
    expect((await client.held()).map((x) => x.id)).toEqual([held.id])

    await client.saveFilters({ ...f, solicitation: { enabled: true, action: 'delete' } })
    const before = (await client.bans()).length
    engine.spam('kick')
    expect((await client.bans()).length).toBe(before)
    expect((await client.held()).length).toBe(1)
  })
})

describe('viewer card', () => {
  it('a first-time chatter has no made-up history, and points can be added', async () => {
    const e = engine.holdSpam('twitch')
    const a = e.kind.type === 'chat_message' ? e.kind.actor : null
    expect(a && a.roles & Roles.FIRST_TIME).toBeTruthy()
    const card = await client.viewer('twitch', a!.id!)
    expect(card.messages).toBe(1)
    expect(card.timeouts).toBe(0)
    expect(card.follows_since).toBeNull()
    expect(card.other_identities).toEqual([])
    const r = await client.adjustPoints('twitch', a!.id!, 50)
    expect(r.points).toBe(50)
  })
})

describe('pairing links', () => {
  it('say whether other devices can open them', async () => {
    const off = await client.pairCode()
    expect(off.url).toMatch(/^http:\/\/127\.0\.0\.1/)
    expect(off.lan).toEqual({ active: false, restart_needed: false })
    const s = await client.settings()
    await client.saveSettings({ ...s, lan_access: true })
    const pending = await client.pairCode()
    expect(pending.lan).toEqual({ active: false, restart_needed: true })
  })
})

describe('words', () => {
  it('field errors read as whole sentences', () => {
    const e = (m: string) => new ApiError(400, 'invalid', m)
    expect(fieldError(e('options: give 2 to 5 answers.'))).toEqual({
      field: 'options',
      message: 'Give 2 to 5 answers.',
    })
    expect(fieldError(e('question: must be text.')).message).toBe('This must be text.')
    expect(
      fieldError(new ApiError(409, 'conflict', 'A poll is running.', 'End it first.')),
    ).toEqual({ field: null, message: 'A poll is running. End it first.' })
  })
  it('counts read right for one', () => {
    expect(plural(1, 'minute', 'minutes')).toBe('1 minute')
    expect(plural(1500, 'viewer', 'viewers')).toBe('1,500 viewers')
    expect(plural(0, 'point', 'points')).toBe('0 points')
  })
})
