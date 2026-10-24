// Go live everywhere in the demo, matching the engine (`crates/engine/src/golive.rs`): the
// destinations (Twitch, YouTube, Kick, custom servers), OBS setup, the upload check and health
// lines while the pretend OBS streams. Same routes, shapes, error codes and messages as API.md
// §4 "Go live everywhere".

import type {
  AitumOutput,
  DestinationConfig,
  DestinationView,
  GoLiveFrame,
  GoLiveView,
  ObsSetup,
  PushHealth,
  Service,
  StreamStats,
  UploadCheck,
  VideoCodec,
} from '../../golive'
import type { Account } from '../../types'
import { HttpError } from '../http-error'
import { NOT_MINE, clone, requireObj, type DemoHost, type Routed } from './host'

/** Steers the demo for tests: upload speed, OBS already set up, what the stream breaks. */
export interface DemoGoLiveSetup {
  upload_kbps?: number
  points_here?: boolean
  codec?: VideoCodec
  keyframe_interval_ms?: number
  /** Aitum Multistream's outputs in the pretend OBS (`null`: not installed). */
  aitum?: AitumOutput[] | null
}

const INGEST = 'rtmp://127.0.0.1:1935/live'
const MAX_CUSTOM = 8
const SERVERS: Record<Exclude<Service, 'custom'>, string> = {
  twitch: 'bom01.contribute.live-video.net',
  youtube: 'a.rtmps.youtube.com',
  kick: 'fa723fc1b171.global-contribute.live-video.net',
}
/** As the engine's `protect.rs`: 4 trouble seconds pause the bottom one, 10 calm ones bring it
 * back no earlier than its pause (60 s, doubling to 10 min). */
const STRUGGLE_TICKS = 4
const CALM_TICKS = 10
const FIRST_PAUSE_MS = 60_000
const MAX_PAUSE_MS = 600_000
const DELAYS: Record<Service, number> = { twitch: 18, youtube: 24, kick: 140, custom: 35 }
const LABELS: Record<Exclude<Service, 'custom'>, string> = {
  twitch: 'Twitch',
  youtube: 'YouTube',
  kick: 'Kick',
}

export class DemoGoLive {
  private cfg: DestinationConfig[] = [
    { id: 'twitch', kind: 'twitch', enabled: true },
    { id: 'youtube', kind: 'youtube', enabled: true },
    { id: 'kick', kind: 'kick', enabled: false },
  ]
  private pointsHere = false
  private before: string | null = null
  private upload: UploadCheck | null = null
  private uploadKbps = 24_000
  private codec: VideoCodec = 'h264'
  private keyint = 2000
  /** When each destination started sending this stream. */
  private started = new Map<string, number>()
  private protect = true
  private aitum: AitumOutput[] | null = null
  private aitumOk = false
  /** Paused by upload protection: until when, and since when. */
  private paused = new Map<string, { until: number; since: number; reason: string }>()
  private struggle = 0
  private calm = 0
  private nextPause = FIRST_PAUSE_MS
  private watching = false
  private wasLive = false
  private seq = 0

  constructor(
    private readonly host: DemoHost,
    private readonly accounts: () => Account[],
    private readonly obsStreaming: () => boolean,
    private readonly obsConnected: () => boolean,
  ) {}

  setup(s: DemoGoLiveSetup): void {
    if (s.upload_kbps !== undefined) this.uploadKbps = s.upload_kbps
    if (s.points_here !== undefined) {
      this.pointsHere = s.points_here
      this.before = s.points_here ? 'Twitch' : null
    }
    if (s.codec) this.codec = s.codec
    if (s.keyframe_interval_ms !== undefined) this.keyint = s.keyframe_interval_ms
    if (s.aitum !== undefined) this.aitum = s.aitum
    this.tick()
  }

  private live(): boolean {
    return this.pointsHere && this.obsStreaming()
  }

  private stats(): StreamStats {
    if (!this.live())
      return {
        kbps: 0,
        keyframe_interval_ms: null,
        video_codec: null,
        width: null,
        height: null,
        fps: null,
      }
    return {
      kbps: 6100,
      keyframe_interval_ms: this.keyint,
      video_codec: this.codec,
      width: 1920,
      height: 1080,
      fps: 60,
    }
  }

  private account(kind: Service): Account | undefined {
    return this.accounts().find((a) => a.platform === kind)
  }

  private health(d: DestinationConfig, now: number): PushHealth | null {
    if (!this.live() || !d.enabled || this.blocked(d)) return null
    const p = this.paused.get(d.id)
    if (p)
      return {
        state: 'paused',
        until_ms: p.until,
        reason: p.reason,
        kbps: 0,
        dropped: 0,
        since_ms: p.since,
      }
    let since = this.started.get(d.id)
    if (since === undefined) {
      since = now
      this.started.set(d.id, now)
    }
    const age = now - since
    // Kick's server drops the first tries, then takes it: how a reconnect looks.
    if (d.kind === 'kick' && age < 6000) {
      const attempt = Math.floor(age / 2000) + 1
      return {
        state: 'reconnecting',
        attempt,
        retry_in_ms: 2000 - (age % 2000),
        reason: 'Kick’s server didn’t answer.',
        kbps: 0,
        dropped: 0,
        since_ms: since,
      }
    }
    const wobble = Math.round((this.host.random() - 0.5) * 300)
    return { state: 'live', kbps: 6100 + wobble, dropped: 0, since_ms: since }
  }

  private blocked(d: DestinationConfig): string | null {
    if (d.kind === 'custom') return null
    return this.account(d.kind) ? null : `Connect ${LABELS[d.kind]} in Settings, Accounts first.`
  }

  private rules(kind: Service, s: StreamStats): string[] {
    if (kind === 'custom' || !this.live()) return []
    const name = LABELS[kind]
    const out: string[] = []
    const codecs: VideoCodec[] = kind === 'youtube' ? ['h264', 'hevc', 'av1'] : ['h264']
    if (s.video_codec && !codecs.includes(s.video_codec))
      out.push(
        `${name} doesn’t take ${s.video_codec === 'hevc' ? 'HEVC (H.265)' : s.video_codec.toUpperCase()} video. Pick H.264 in OBS (Settings, Output, Video Encoder), or turn ${name} off.`,
      )
    const max = kind === 'youtube' ? 4000 : 2000
    if (s.keyframe_interval_ms !== null && s.keyframe_interval_ms > max + 250)
      out.push(
        `${name} needs a keyframe at least every ${max / 1000} s; yours come every ${(s.keyframe_interval_ms / 1000).toFixed(1)} s. Set Keyframe Interval to 2 in OBS (Settings, Output).`,
      )
    return out
  }

  private destinations(): DestinationView[] {
    const now = Date.now()
    const s = this.stats()
    return this.cfg.map((d) => {
      const custom = d.kind === 'custom'
      const acct = custom ? null : this.account(d.kind)
      return {
        id: d.id,
        kind: d.kind,
        name: custom ? (d.name ?? 'Custom server') : LABELS[d.kind as Exclude<Service, 'custom'>],
        account: custom ? hostOf(d.url ?? '') : (acct?.name ?? null),
        enabled: d.enabled,
        connected: custom || !!acct,
        health: this.health(d, now),
        blocked: d.enabled && this.live() ? this.blocked(d) : null,
        rules: d.enabled ? this.rules(d.kind, s) : [],
      }
    })
  }

  private obs(): ObsSetup {
    return {
      connected: this.obsConnected(),
      points_here: this.pointsHere,
      streaming: this.obsStreaming(),
      before: this.before,
      aitum: this.obsConnected() ? clone(this.aitum) : null,
    }
  }

  private view(): GoLiveView {
    return {
      ingest: INGEST,
      obs: this.obs(),
      live: this.live(),
      stats: this.stats(),
      destinations: this.destinations(),
      upload: clone(this.upload),
      protect: this.protect,
      aitum_ok: this.aitumOk,
    }
  }

  private frame(): GoLiveFrame {
    return { live: this.live(), stats: this.stats(), destinations: this.destinations() }
  }

  /** Sends the health lines while live, and once when live changes. */
  private tick(): void {
    const live = this.live()
    if (!live) {
      this.started.clear()
      this.resetProtect()
    }
    if (live || live !== this.wasLive) {
      this.wasLive = live
      this.host.broadcastLive({ v: 1, type: 'golive', data: this.frame() })
    }
  }

  /** Once a dashboard looks at Go live, a tick every second (OBS may start any time). */
  private watch(): void {
    if (this.watching) return
    this.watching = true
    const loop = () => {
      this.protectTick(Date.now())
      this.tick()
      this.host.later(loop, 1000)
    }
    this.host.later(loop, 1000)
  }

  route(method: string, seg: string[], body: unknown): Routed {
    if (seg[0] !== 'golive') return NOT_MINE
    const path = seg.slice(1).join('/')
    if (method === 'GET' && path === '') {
      this.watch()
      return this.view()
    }
    if (method === 'GET' && path === 'ingest')
      return { server: INGEST, key: 'fc_demo0000000000000000000000000000' }
    if (method === 'PUT' && path === 'destinations') return this.saveOrder(body)
    if (method === 'POST' && path === 'destinations') return this.addCustom(body)
    if (method === 'DELETE' && seg[1] === 'destinations' && seg.length === 3)
      return this.remove(seg[2] ?? '')
    if (method === 'POST' && path === 'obs/setup') return this.point()
    if (method === 'POST' && path === 'obs/restore') return this.restore()
    if (method === 'POST' && path === 'upload-check') return this.check()
    if (method === 'PUT' && path === 'protection') return this.setProtect(body)
    if (method === 'PUT' && path === 'aitum') {
      const b = requireObj(body)
      if (typeof b.ok !== 'boolean') throw new HttpError(400, 'invalid', 'ok: true or false.')
      this.aitumOk = b.ok
      return { destinations: clone(this.cfg), aitum_ok: this.aitumOk }
    }
    if (method === 'POST' && seg[1] === 'resume' && seg.length === 3)
      return this.resume(seg[2] ?? '')
    return NOT_MINE
  }

  private saveOrder(body: unknown): { destinations: DestinationConfig[] } {
    const b = requireObj(body)
    const list = b.destinations
    if (!Array.isArray(list) || list.length !== this.cfg.length)
      throw new HttpError(
        400,
        'invalid',
        'destinations: list every destination once, in the new order.',
      )
    const next: DestinationConfig[] = []
    for (const raw of list) {
      const item = requireObj(raw)
      const id = typeof item.id === 'string' ? item.id : ''
      const d = this.cfg.find((x) => x.id === id)
      if (!d)
        throw new HttpError(400, 'invalid', `destinations: no destination "${id.slice(0, 40)}".`)
      if (next.some((x) => x.id === id))
        throw new HttpError(400, 'invalid', 'destinations: each destination only once.')
      if (typeof item.enabled !== 'boolean')
        throw new HttpError(400, 'invalid', 'destinations: enabled must be true or false.')
      next.push({ ...d, enabled: item.enabled })
    }
    this.cfg = next
    for (const d of next)
      if (!d.enabled) {
        this.started.delete(d.id)
        this.paused.delete(d.id)
      }
    this.tick()
    return { destinations: clone(this.cfg) }
  }

  private addCustom(body: unknown): DestinationConfig {
    const b = requireObj(body)
    const name = typeof b.name === 'string' ? b.name.trim() : ''
    const url = typeof b.url === 'string' ? b.url.trim() : ''
    const key = typeof b.key === 'string' ? b.key.trim() : ''
    if (!name || [...name].length > 40)
      throw new HttpError(400, 'invalid', 'name: 1 to 40 characters.')
    const problem = urlProblem(url)
    if (problem) throw new HttpError(400, 'invalid', `url: ${problem}`)
    if (!key || key.length > 512 || /\s/.test(key))
      throw new HttpError(
        400,
        'invalid',
        'key: the stream key the server gave you, without spaces.',
      )
    if (this.cfg.filter((d) => d.kind === 'custom').length >= MAX_CUSTOM)
      throw new HttpError(409, 'conflict', `You can add up to ${MAX_CUSTOM} servers of your own.`)
    const d: DestinationConfig = {
      id: `c_${(++this.seq).toString(16).padStart(12, '0')}`,
      kind: 'custom',
      name,
      url: url.replace(/\/+$/, ''),
      enabled: true,
    }
    this.cfg.push(d)
    this.tick()
    return clone(d)
  }

  private remove(id: string): undefined {
    const d = this.cfg.find((x) => x.id === id)
    if (!d) throw new HttpError(404, 'not_found', 'destination not found')
    if (d.kind !== 'custom')
      throw new HttpError(
        400,
        'invalid',
        'Twitch, YouTube and Kick can be switched off, not removed.',
      )
    this.cfg = this.cfg.filter((x) => x.id !== id)
    this.started.delete(id)
    this.tick()
    return undefined
  }

  /** One second of upload protection: the demo's line carries what its upload speed allows. */
  private protectTick(now: number): void {
    if (!this.protect || !this.live()) return
    const sending = this.destinations().filter((d) => d.health?.state === 'live')
    const judged = sending.filter((d) => now - (d.health?.since_ms ?? now) >= 3000)
    const trouble = judged.length > 0 && sending.length * 6100 > this.uploadKbps
    if (trouble) {
      this.struggle++
      this.calm = 0
    } else {
      this.calm++
      this.struggle = 0
    }
    const order = this.cfg.filter((d) => d.enabled).map((d) => d.id)
    if (this.struggle >= STRUGGLE_TICKS && sending.length >= 2) {
      const victim = [...order].reverse().find((id) => sending.some((d) => d.id === id))
      if (!victim) return
      const top = sending.find((d) => d.id !== victim)?.name ?? ''
      this.struggle = 0
      this.paused.set(victim, {
        until: now + this.nextPause,
        since: now,
        reason: `Your upload dipped, so this paused to keep ${top} smooth. It comes back by itself.`,
      })
      this.started.delete(victim)
      this.nextPause = Math.min(this.nextPause * 2, MAX_PAUSE_MS)
    } else if (this.calm >= CALM_TICKS) {
      const ready = order.find((id) => (this.paused.get(id)?.until ?? Infinity) <= now)
      if (!ready) return
      this.paused.delete(ready)
      this.calm = 0
    }
  }

  private resetProtect(): void {
    this.paused.clear()
    this.struggle = 0
    this.calm = 0
    this.nextPause = FIRST_PAUSE_MS
  }

  private setProtect(body: unknown): { destinations: DestinationConfig[]; protect: boolean } {
    const b = requireObj(body)
    if (typeof b.on !== 'boolean') throw new HttpError(400, 'invalid', 'on: true or false.')
    this.protect = b.on
    if (!b.on) this.resetProtect()
    this.tick()
    return { destinations: clone(this.cfg), protect: this.protect }
  }

  private resume(id: string): undefined {
    if (!this.paused.has(id))
      throw new HttpError(
        422,
        'golive_not_paused',
        'That platform isn’t paused.',
        'Nothing to resume.',
      )
    this.paused.delete(id)
    this.tick()
    return undefined
  }

  private refuseWhileStreaming(): void {
    if (!this.obsConnected())
      throw new HttpError(
        422,
        'obs_unreachable',
        'Couldn’t reach OBS.',
        'Open OBS on this computer, then check Settings, OBS.',
      )
    if (this.obsStreaming())
      throw new HttpError(
        422,
        'obs_streaming',
        'OBS is streaming right now.',
        'Stop the stream in OBS first; Ferrocast changes this between streams.',
      )
  }

  private point(): ObsSetup {
    this.refuseWhileStreaming()
    if (!this.pointsHere) {
      this.pointsHere = true
      this.before = 'Twitch'
    }
    this.tick()
    return this.obs()
  }

  private restore(): ObsSetup {
    if (!this.before)
      throw new HttpError(
        422,
        'golive_nothing_saved',
        'There’s no earlier OBS setting to put back.',
        'Set OBS’s stream in OBS, Settings, Stream.',
      )
    this.refuseWhileStreaming()
    this.pointsHere = false
    this.before = null
    this.tick()
    return this.obs()
  }

  private check(): UploadCheck {
    const ticked = this.cfg.filter((d) => d.enabled)
    if (ticked.length === 0)
      throw new HttpError(
        422,
        'golive_none',
        'No platform is ticked.',
        'Tick at least one platform, then check again.',
      )
    const need = this.live() ? 6100 : 6160
    const rows = ticked.map((d) => {
      const custom = d.kind === 'custom'
      const blocked = this.blocked(d)
      const name = custom
        ? (d.name ?? 'Custom server')
        : LABELS[d.kind as Exclude<Service, 'custom'>]
      return {
        id: d.id,
        name,
        server: blocked
          ? null
          : custom
            ? hostOf(d.url ?? '')
            : SERVERS[d.kind as Exclude<Service, 'custom'>],
        delay_ms: blocked ? null : DELAYS[d.kind],
        need_kbps: need,
        ...(blocked ? { problem: blocked } : {}),
      }
    })
    const needs = rows.filter((r) => !r.problem).map((r) => r.need_kbps)
    this.upload = {
      at: Date.now(),
      measured_by: ticked.some((d) => d.kind === 'twitch' && !this.blocked(d))
        ? 'twitch'
        : 'cloudflare',
      rows,
      verdict: unreachable(verdict(this.uploadKbps, needs), rows, this.uploadKbps),
    }
    return clone(this.upload)
  }
}

function hostOf(url: string): string | null {
  const m = /^rtmps?:\/\/([^/:]+)/i.exec(url)
  return m?.[1]?.toLowerCase() ?? null
}

function urlProblem(url: string): string | null {
  if (!/^rtmps?:\/\//i.test(url)) return 'The server address must start with rtmp:// or rtmps://.'
  if (/[\s#@]/.test(url)) return 'The server address can’t contain a user name, spaces or a #.'
  const rest = url.replace(/^rtmps?:\/\//i, '')
  const [host, ...app] = rest.split('/')
  if (!host) return 'The server address is missing its host name.'
  if (!app.join('/').replace(/\/+/g, ''))
    return 'The server address is missing the part after the host (for example /live).'
  return null
}

/** As the engine's `probe::verdict`: 20% kept free, the first ones in order fit. */
function verdict(upload: number, needs: number[]) {
  const mb = (k: number) => {
    const m = k / 1000
    return m < 10 ? `${m.toFixed(1)} Mbps` : `${Math.round(m)} Mbps`
  }
  const count = (n: number) => (n === 1 ? '1 platform' : `${n} platforms`)
  const need = needs.reduce((a, b) => a + b, 0)
  const usable = Math.floor(upload * 0.8)
  let fit = 0
  let total = 0
  for (const n of needs) {
    total += n
    if (total > usable) break
    fit++
  }
  const n = needs.length
  const fits = need <= usable
  let message: string
  if (n === 0) message = `Your upload is ${mb(upload)}. Turn on a platform to check it.`
  else if (fits)
    message = `Your upload is ${mb(upload)}. ${count(n)} fit${n === 1 ? 's' : ''}, using ${mb(need)}.`
  else {
    message = `${count(n)} need ${mb(need)}; you have ${mb(upload)}.`
    message +=
      fit > 0
        ? ` Send ${count(fit)} at this quality, or all ${n} at about ${mb(Math.floor(usable / n))} each (lower the bitrate in OBS).`
        : ` Lower the bitrate in OBS to about ${mb(usable)} for one platform.`
  }
  return { upload_kbps: upload, need_kbps: need, fits, fit_count: fit, message }
}

/** As the engine: servers that couldn't be reached are named and not counted. */
function unreachable(
  v: ReturnType<typeof verdict>,
  rows: { name: string; problem?: string }[],
  upload: number,
): ReturnType<typeof verdict> {
  const names = rows.filter((r) => r.problem).map((r) => r.name)
  if (names.length === 0) return v
  const list = names.join(', ')
  const counted = rows.length > names.length
  const m = upload / 1000
  const mb = m < 10 ? `${m.toFixed(1)} Mbps` : `${Math.round(m)} Mbps`
  return {
    ...v,
    message: counted
      ? `${v.message} ${list} couldn’t be reached and isn’t counted.`
      : `Your upload is ${mb}. Ferrocast couldn’t reach ${list}, so nothing was counted yet.`,
  }
}
