// Go live everywhere (2.0, API.md §4 "Go live everywhere"): OBS streams once to Ferrocast on
// this PC, and Ferrocast sends it on to every ticked platform. Free: it runs on the PC.

import type { FerroClient } from './client'

export type Service = 'twitch' | 'youtube' | 'kick' | 'custom'

/** Which picture a destination gets: OBS's normal stream, or its vertical canvas. */
export type Canvas = 'main' | 'vertical'

/** YouTube Shorts live: Ferrocast makes its stream and broadcast. */
export const YOUTUBE_VERTICAL = 'youtube_vertical'

export interface DestinationConfig {
  /** `twitch`, `youtube`, `kick`, `youtube_vertical`, or `c_<hex>` for a custom server. */
  id: string
  kind: Service
  name?: string
  url?: string
  enabled: boolean
  /** Left out: `main`. */
  canvas?: Canvas
}

export type PushState =
  | { state: 'waiting' | 'connecting' | 'live' | 'stopped' }
  | { state: 'reconnecting'; attempt: number; retry_in_ms: number; reason: string }
  /** Upload protection paused it; it comes back by itself, no earlier than `until_ms`. */
  | { state: 'paused'; until_ms: number; reason: string }

export type PushHealth = PushState & { kbps: number; dropped: number; since_ms: number }

export type VideoCodec = 'h264' | 'hevc' | 'av1' | 'vp9'

/** Measured from the stream OBS sends (not its settings); empty while nothing streams. */
export interface StreamStats {
  kbps: number
  keyframe_interval_ms: number | null
  video_codec: VideoCodec | null
  width: number | null
  height: number | null
  fps: number | null
}

export interface DestinationView {
  id: string
  kind: Service
  canvas: Canvas
  name: string
  /** The platform account, or a custom server's host. */
  account: string | null
  enabled: boolean
  connected: boolean
  health: PushHealth | null
  /** Why it can't start, in words. */
  blocked: string | null
  /** The platform's rules this stream breaks, in words. */
  rules: string[]
}

export interface UploadRow {
  id: string
  name: string
  server: string | null
  delay_ms: number | null
  need_kbps: number
  problem?: string
}

export interface Verdict {
  upload_kbps: number
  need_kbps: number
  fits: boolean
  fit_count: number
  message: string
}

export interface UploadCheck {
  at: number
  measured_by: 'twitch' | 'cloudflare'
  rows: UploadRow[]
  verdict: Verdict
}

export interface ObsSetup {
  connected: boolean
  points_here: boolean
  streaming: boolean
  /** What "Put OBS back" restores ("Twitch", "a custom server"). */
  before: string | null
  /** Aitum Multistream's outputs, when OBS has that plugin. */
  aitum: AitumOutput[] | null
  /** OBS's vertical canvas (Aitum Vertical), when OBS has it. */
  vertical: VerticalObs | null
}

export interface VerticalObs {
  /** Its stream goes to Ferrocast's vertical key. */
  points_here: boolean
  streaming: boolean
  /** Where "Put it back" sends it again (a host). */
  before: string | null
}

/** One Aitum Multistream output: where it goes (when known) and whether it's sending now. */
export interface AitumOutput {
  name: string
  platform: Exclude<Service, 'custom'> | null
  live: boolean
}

export interface GoLiveView {
  ingest: string | null
  obs: ObsSetup
  live: boolean
  stats: StreamStats
  /** OBS's vertical canvas is streaming to Ferrocast. */
  vertical_live: boolean
  vertical_stats: StreamStats
  destinations: DestinationView[]
  upload: UploadCheck | null
  /** Upload protection: the bottom platform pauses when the upload can't carry them all. */
  protect: boolean
  /** The streamer said they run Aitum Multistream on purpose (hides the setup note). */
  aitum_ok: boolean
  /** Where the vertical picture comes from, and the cut-from-stream layout. */
  cut: CutView
  /** Advanced mode's settings (A2.5). */
  advanced: Advanced
}

/** Upload protection's rule, as Advanced mode writes it. */
export interface ProtectRules {
  /** 50 to 95: a destination under this share of its stream is slow. */
  slow_pct: number
  trouble_s: number
  calm_s: number
  first_pause_s: number
  max_pause_s: number
  /** A destination that always pauses first, when it's live. */
  first_to_pause: string | null
}

export interface DestAdvanced {
  /** A platform's own address instead (another region; rtmp or rtmps). */
  server: string | null
  first_retry_s: number
  max_retry_s: number
}

export interface Advanced {
  rules: ProtectRules
  /** The upload check's reserve for the game and chat, 0 to 50 percent. */
  keep_free_pct: number
  /** The local server's port (from the next start). */
  port: number
  per: Record<string, DestAdvanced>
}

export const DEST_ADVANCED_DEFAULT: DestAdvanced = {
  server: null,
  first_retry_s: 1,
  max_retry_s: 30,
}

/** Same rules as the engine, so Advanced mode can say what's wrong before saving. */
export function checkAdvanced(a: Advanced, ids: string[]): string | null {
  if (typeof a !== 'object' || a === null || typeof a.rules !== 'object' || a.rules === null)
    return 'rules: send the protection rule as an object.'
  if (typeof a.per !== 'object' || a.per === null)
    return 'per: send the per-destination settings as an object.'
  const r = a.rules
  const int = (v: unknown, lo: number, hi: number) =>
    typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi
  if (!int(r.slow_pct, 50, 95)) return 'rules.slow_pct: 50 to 95 percent.'
  if (!int(r.trouble_s, 2, 30)) return 'rules.trouble_s: 2 to 30 seconds.'
  if (!int(r.calm_s, 5, 120)) return 'rules.calm_s: 5 to 120 seconds.'
  if (!int(r.first_pause_s, 10, 3600)) return 'rules.first_pause_s: 10 seconds to an hour.'
  if (!int(r.max_pause_s, r.first_pause_s, 7200))
    return 'rules.max_pause_s: at least the first pause, at most two hours.'
  if (r.first_to_pause && !ids.includes(r.first_to_pause))
    return 'rules.first_to_pause: no such destination.'
  if (!int(a.keep_free_pct, 0, 50)) return 'keep_free_pct: 0 to 50 percent.'
  if (!int(a.port, 1024, 65535)) return 'port: 1024 to 65535.'
  for (const [id, d] of Object.entries(a.per)) {
    if (!ids.includes(id)) return `per.${id}: no such destination.`
    if (d.server && !/^rtmps?:\/\/[^/\s]+\/\S+/i.test(d.server))
      return `per.${id}.server: the address must start with rtmp:// or rtmps:// and have a path.`
    if (!int(d.first_retry_s, 1, 30)) return `per.${id}.first_retry_s: 1 to 30 seconds.`
    if (!int(d.max_retry_s, d.first_retry_s, 600))
      return `per.${id}.max_retry_s: at least the first wait, at most 600 seconds.`
  }
  return null
}

/** A box on the normal picture, as fractions (0 to 1) of its width and height. */
export interface CutBox {
  x: number
  y: number
  w: number
  h: number
}

export type CutLayout = 'camera_top' | 'small_camera' | 'half_half' | 'game_only'

export interface CutConfig {
  layout: CutLayout
  camera: CutBox
  game: CutBox
  /** camera_top: the camera's share of the height, 20 to 60 percent. */
  camera_share: number
  width: 1080 | 720
  height: 1920 | 1280
  fps: 30 | 60
  kbps: number
  /** The graphics card when there is one (auto), or always the processor. */
  encoder: 'auto' | 'processor'
}

export type CutState =
  | { state: 'waiting' | 'starting' }
  | { state: 'running'; encoder: string; on: string }
  | { state: 'failed'; reason: string }

export type VerticalSource = 'canvas' | 'cut'

export interface CutView {
  source: VerticalSource
  config: CutConfig
  /** `null` while not needed (another source, or no vertical destination ticked). */
  state: CutState | null
  /** Whether ffmpeg is here or being fetched (cutting needs it). */
  ffmpeg: FfmpegState
}

export type FfmpegState =
  | { state: 'ready' | 'missing' | 'unsupported' }
  | { state: 'downloading'; percent: number }
  | { state: 'failed'; reason: string }

const CUT_LAYOUTS: CutLayout[] = ['camera_top', 'small_camera', 'half_half', 'game_only']

/**
 * Same rules as the engine (`golive::cut`), so the editor can say so before saving. Takes any
 * value (a request body too) and names the field that's wrong.
 */
export function checkCut(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return 'Send the layout as an object.'
  const c = value as Partial<Record<keyof CutConfig, unknown>>
  const box = (v: unknown, what: string) => {
    const b = (typeof v === 'object' && v !== null ? v : {}) as Partial<
      Record<keyof CutBox, unknown>
    >
    const n = [b.x, b.y, b.w, b.h]
    if (!n.every((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1))
      return `${what}: the box must be inside the picture and not tiny.`
    const [x, y, w, h] = n as number[]
    if ((w as number) < 0.02 || (h as number) < 0.02)
      return `${what}: the box must be inside the picture and not tiny.`
    if ((x as number) + (w as number) > 1.0001 || (y as number) + (h as number) > 1.0001)
      return `${what}: the box goes past the edge of the picture.`
    return null
  }
  if (!CUT_LAYOUTS.includes(c.layout as CutLayout))
    return 'layout: camera_top, small_camera, half_half or game_only.'
  const share = c.camera_share
  const size = `${String(c.width)}x${String(c.height)}`
  return (
    box(c.game, 'game') ??
    (c.layout === 'game_only' ? null : box(c.camera, 'camera')) ??
    (typeof share !== 'number' || share < 20 || share > 60
      ? 'camera_share: 20 to 60 percent of the height.'
      : null) ??
    (size !== '1080x1920' && size !== '720x1280' ? 'size: 1080×1920 or 720×1280.' : null) ??
    (c.fps !== 30 && c.fps !== 60 ? 'fps: 30 or 60.' : null) ??
    (typeof c.kbps !== 'number' || c.kbps < 1000 || c.kbps > 12000
      ? 'kbps: 1,000 to 12,000.'
      : null) ??
    (c.encoder !== undefined && c.encoder !== 'auto' && c.encoder !== 'processor'
      ? 'encoder: auto or processor.'
      : null)
  )
}

/** Where each part goes in the upright picture (fractions of it), for the preview. */
export function cutSlots(
  c: CutConfig,
): { part: 'camera' | 'game'; x: number; y: number; w: number; h: number }[] {
  switch (c.layout) {
    case 'game_only':
      return [{ part: 'game', x: 0, y: 0, w: 1, h: 1 }]
    case 'small_camera': {
      const pw = 0.42
      const cam = c.camera
      // The camera keeps its shape (its pixels' aspect) at 42% of the width.
      const ph = Math.min(0.5, ((pw * cam.h) / Math.max(cam.w, 0.001)) * (9 / 16) * (9 / 16))
      return [
        { part: 'game', x: 0, y: 0, w: 1, h: 1 },
        { part: 'camera', x: 1 - pw - 0.04, y: 0.03, w: pw, h: ph },
      ]
    }
    default: {
      const share = c.layout === 'half_half' ? 0.5 : c.camera_share / 100
      return [
        { part: 'camera', x: 0, y: 0, w: 1, h: share },
        { part: 'game', x: 0, y: share, w: 1, h: 1 - share },
      ]
    }
  }
}

/** The `golive` live frame: every second while OBS streams to Ferrocast, and on changes. */
export interface GoLiveFrame {
  live: boolean
  stats: StreamStats
  vertical_live: boolean
  vertical_stats: StreamStats
  destinations: DestinationView[]
  /** What the cutter is doing (A2.4), every second. */
  cut_state?: CutState | null
  /** Fetching ffmpeg: progress. */
  ffmpeg?: FfmpegState
}

export function goliveApi(c: FerroClient) {
  const get = <T>(p: string) => c.request<T>('GET', `/api/v1${p}`)
  const post = <T>(p: string, b: unknown = {}) => c.request<T>('POST', `/api/v1${p}`, b)
  return {
    view: () => get<GoLiveView>('/golive'),
    ingest: () => get<{ server: string; key: string; vertical_key: string }>('/golive/ingest'),
    /** Every destination once, top first (the bottom one pauses first). */
    saveOrder: (destinations: { id: string; enabled: boolean }[]) =>
      c.request<{ destinations: DestinationConfig[] }>('PUT', '/api/v1/golive/destinations', {
        destinations,
      }),
    addCustom: (name: string, url: string, key: string, canvas: Canvas = 'main') =>
      post<DestinationConfig>('/golive/destinations', { name, url, key, canvas }),
    removeCustom: (id: string) =>
      c.request<void>('DELETE', `/api/v1/golive/destinations/${encodeURIComponent(id)}`),
    pointObs: () => post<ObsSetup>('/golive/obs/setup'),
    restoreObs: () => post<ObsSetup>('/golive/obs/restore'),
    /** Points Aitum Vertical (OBS's vertical canvas) at Ferrocast. */
    pointVertical: () => post<VerticalObs | null>('/golive/vertical/obs/setup'),
    restoreVertical: () => post<VerticalObs | null>('/golive/vertical/obs/restore'),
    uploadCheck: () => post<UploadCheck>('/golive/upload-check'),
    setProtect: (on: boolean) =>
      c.request<{ destinations: DestinationConfig[]; protect: boolean }>(
        'PUT',
        '/api/v1/golive/protection',
        { on },
      ),
    /** Where the vertical picture comes from. */
    setVerticalSource: (source: VerticalSource) =>
      c.request<{ destinations: DestinationConfig[] }>('PUT', '/api/v1/golive/vertical/source', {
        source,
      }),
    /** Saves the cut-from-stream layout; a running cut restarts with it. */
    setVerticalCut: (cut: CutConfig) =>
      c.request<{ cut: CutConfig }>('PUT', '/api/v1/golive/vertical/cut', cut),
    /** Go live's Advanced settings (A2.5). */
    setAdvanced: (advanced: Advanced) =>
      c.request<{ advanced: Advanced }>('PUT', '/api/v1/golive/advanced', advanced),
    /** A new local stream key; OBS and Aitum Vertical follow it. */
    newKey: () => post<void>('/golive/new-key'),
    /** Fetches ffmpeg (again, after a failure); progress shows in `cut.ffmpeg`. */
    getFfmpeg: () => post<FfmpegState>('/golive/ffmpeg'),
    /** What's on air in OBS, to mark the camera and game on. */
    picture: () => get<{ image: string; width: number; height: number }>('/golive/picture'),
    /** "I use Aitum Multistream on purpose": hides the setup note. */
    setAitumOk: (ok: boolean) =>
      c.request<{ destinations: DestinationConfig[]; aitum_ok: boolean }>(
        'PUT',
        '/api/v1/golive/aitum',
        { ok },
      ),
    /** "Resume now" on a platform upload protection paused. */
    resume: (id: string) => post<void>(`/golive/resume/${encodeURIComponent(id)}`),
  }
}

/** `12 Mbps` (one decimal under 10). */
export function mbps(kbps: number): string {
  const m = kbps / 1000
  return m < 10 ? `${m.toFixed(1)} Mbps` : `${Math.round(m)} Mbps`
}

/** How many destinations are ticked, in words ("Going to 3 places"). */
export function goingTo(destinations: Pick<DestinationView, 'enabled'>[]): string {
  const n = destinations.filter((d) => d.enabled).length
  if (n === 0) return 'No platform ticked'
  return n === 1 ? 'Going to 1 place' : `Going to ${n} places`
}

/** The health line's words for one destination. */
export function healthText(
  h: PushHealth | null,
  blocked: string | null,
): {
  tone: 'ok' | 'warn' | 'off' | 'bad' | 'paused'
  label: string
  detail: string | null
} {
  if (blocked) return { tone: 'bad', label: 'Can’t start', detail: blocked }
  if (!h) return { tone: 'off', label: 'Waiting for OBS', detail: null }
  switch (h.state) {
    case 'live':
      return {
        tone: 'ok',
        label: 'Live',
        detail: `${mbps(h.kbps)}${h.dropped ? ` · ${h.dropped} skipped` : ''}`,
      }
    case 'connecting':
      return { tone: 'warn', label: 'Connecting', detail: null }
    case 'reconnecting':
      return {
        tone: 'warn',
        label: `Reconnecting, try ${h.attempt}`,
        detail: `${h.reason} Trying again in ${Math.max(1, Math.round(h.retry_in_ms / 1000))} s.`,
      }
    case 'waiting':
      return { tone: 'off', label: 'Waiting for OBS', detail: null }
    case 'stopped':
      return { tone: 'off', label: 'Stopped', detail: null }
    case 'paused':
      return { tone: 'paused', label: 'Paused', detail: h.reason }
  }
}

/**
 * Destinations ticked in Go live that an Aitum Multistream output also streams to (with
 * `live`, only outputs sending now): those platforms would get the stream twice.
 */
export function aitumClashes(
  outputs: AitumOutput[] | null,
  destinations: Pick<DestinationView, 'id' | 'kind' | 'name' | 'enabled'>[],
  live = false,
): { id: string; name: string; outputs: string[] }[] {
  if (!outputs) return []
  return destinations
    .filter((d) => d.enabled && d.kind !== 'custom')
    .map((d) => ({
      id: d.id,
      name: d.name,
      outputs: outputs.filter((o) => o.platform === d.kind && (!live || o.live)).map((o) => o.name),
    }))
    .filter((c) => c.outputs.length > 0)
}

/** "Twitch", "Twitch and YouTube", "Twitch, YouTube and Kick". */
export function andList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

/** Destinations of one picture, in order. */
export function onCanvas<T extends { canvas?: Canvas }>(list: T[], canvas: Canvas): T[] {
  return list.filter((d) => (d.canvas ?? 'main') === canvas)
}
