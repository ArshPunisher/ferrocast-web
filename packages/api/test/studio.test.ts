import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DemoEngine, DEMO_TOKEN } from '../src/demo'
import { FerroClient } from '../src/client'
import { ApiError } from '../src/errors'
import { parseLiveFrame } from '../src/live'
import { checkStreamInfo, studioApi, timecode } from '../src/studio'
import { markersCsv, markersTxt } from '../src/demo/features/studio'

let engine: DemoEngine
let studio: ReturnType<typeof studioApi>
let client: FerroClient

beforeEach(() => {
  engine = new DemoEngine({ autoplay: false, latencyMs: 0 })
  client = new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch })
  studio = studioApi(client)
})
afterEach(() => engine.dispose())

const fail = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => e as ApiError,
  )

describe('studio helpers (mirror core::stream_info)', () => {
  it('checks stream info like the engine', () => {
    expect(checkStreamInfo({})).toMatch(/at least one/)
    expect(checkStreamInfo({ title: '  ' })).toMatch(/^title:/)
    expect(checkStreamInfo({ title: 'é'.repeat(140) })).toBeNull()
    expect(checkStreamInfo({ title: 'x'.repeat(141) })).toMatch(/^title:/)
    expect(checkStreamInfo({ tags: ['no spaces'] })).toMatch(/^tags:/)
    expect(checkStreamInfo({ tags: ['हिंदी', '#FPS'] })).toBeNull()
    expect(checkStreamInfo({ tags: Array.from({ length: 11 }, (_, i) => `t${i}`) })).toMatch(
      /10 tags/,
    )
    expect(checkStreamInfo({ language: 'eng' })).toMatch(/^language:/)
    expect(checkStreamInfo({ tags: [] })).toBeNull()
  })

  it('timecodes and exports match the engine', () => {
    expect(timecode(3_723_000)).toBe('01:02:03')
    expect(timecode(-5)).toBe('00:00:00')
    const m = [
      {
        id: 1,
        at: 1000,
        offset_ms: 3_723_000,
        kind: 'raid' as const,
        label: 'Bo raided, "30"',
        platform: 'twitch' as const,
        clip: true,
      },
      {
        id: 2,
        at: 2000,
        offset_ms: null,
        kind: 'manual' as const,
        label: '=HYPERLINK("x")\nhi',
        platform: null,
        clip: false,
      },
    ]
    const csv = markersCsv(m).split('\n')
    expect(csv[1]).toBe('01:02:03,3723,raid,"Bo raided, ""30""",Twitch,yes,1000')
    expect(csv[2]).toBe(',,manual,"\'=HYPERLINK(""x"") hi",,no,2000')
    expect(markersTxt(m)).toBe(
      '01:02:03  Bo raided, "30" [clip saved]\n--:--:--  =HYPERLINK("x") hi\n',
    )
  })

  it('parses Studio frames and refuses malformed ones', () => {
    const f = (type: string, data: unknown) => JSON.stringify({ v: 1, type, data })
    expect(
      parseLiveFrame(f('lane', { items: [], added: null, sound: 'chime', volume: 70 }))?.type,
    ).toBe('lane')
    expect(parseLiveFrame(f('lane', { items: 'x' }))).toBeNull()
    expect(parseLiveFrame(f('obs_health', { warnings: [] }))?.type).toBe('obs_health')
    expect(parseLiveFrame(f('obs_health', {}))).toBeNull()
    expect(parseLiveFrame(f('show', { show: null }))?.type).toBe('show')
    expect(parseLiveFrame(f('counter', { name: 'deaths', value: 'x' }))).toBeNull()
    expect(parseLiveFrame(f('counter', { name: 'deaths', value: 3 }))?.type).toBe('counter')
  })
})

describe('demo studio (same contract as API.md §4 Studio)', () => {
  it('counters: create, change, clash, 404', async () => {
    const c = await studio.createCounter({ name: 'Boss Wins' })
    expect(c).toMatchObject({ name: 'boss_wins', command: '!boss_wins', value: 0 })
    expect((await studio.changeCounter('boss_wins', 'add', 3)).value).toBe(3)
    expect((await studio.changeCounter('boss_wins', 'reset')).value).toBe(0)
    expect((await fail(studio.createCounter({ name: 'boss wins' })))?.status).toBe(409)
    expect((await fail(studio.createCounter({ name: 'x', command: '!quote' })))?.status).toBe(409)
    expect((await fail(studio.changeCounter('ghost', 'add')))?.code).toBe('counter_not_found')
    expect((await fail(studio.changeCounter('boss_wins', 'set')))?.status).toBe(400)
  })

  it('stream info: partial success, then nobody', async () => {
    const r = await studio.applyStreamInfo({ title: 'Ranked' })
    expect(r.ok).toBe(2)
    expect(r.results.find((x) => x.platform === 'kick')?.error?.code).toBe('reconnect_needed')
    const e = await fail(studio.applyStreamInfo({ title: 'x' }, ['kick']))
    expect(e?.status).toBe(422)
    expect(e?.code).toBe('stream_info_failed')
    expect((await studio.streamInfo()).history[0]?.results[0]?.platform).toBe('kick')
    expect((await fail(studio.applyStreamInfo({})))?.status).toBe(400)
  })

  it('show: preflight, start, countdown, end', async () => {
    const pf = await studio.preflight()
    expect(pf.ready).toBe(true)
    const run = await studio.startShow()
    expect(run.show.phase).toBe('countdown')
    expect((await fail(studio.startShow(true)))?.status).toBe(409)
    expect((await studio.skipCountdown()).show.phase).toBe('live')
    expect((await fail(studio.skipCountdown()))?.code).toBe('no_countdown')
    expect((await studio.endShow()).show.phase).toBe('ended')
  })

  it('obs: replay not running, then a clip with a marker; BRB needs a scene', async () => {
    expect((await fail(studio.clip()))?.status).toBe(422)
    await studio.preflightFix('action:start_replay_buffer')
    const c = await studio.clip('Ace')
    expect(c.marker).toMatchObject({ kind: 'clip', clip: true, label: 'Ace' })
    await studio.saveSwitcher({ brb_scene: null, brb_on_ads: false })
    expect((await fail(studio.brb(true)))?.code).toBe('no_brb_scene')
  })

  it('moments: lane dismissals and a CSV download', async () => {
    const lane = await studio.lane()
    expect(lane.length).toBeGreaterThan(0)
    await studio.dismiss(lane[0]!.id)
    expect((await fail(studio.dismiss(lane[0]!.id)))?.code).toBe('lane_item_not_found')
    const blob = await client.downloadFile(studio.exportPath('csv', 0))
    expect((await blob.text()).startsWith('timecode,offset_seconds,kind,label')).toBe(true)
    expect(
      (await fail(client.downloadFile('/api/v1/moments/markers/export?format=pdf')))?.status,
    ).toBe(400)
  })
})
