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
}

/** The `golive` live frame: every second while OBS streams to Ferrocast, and on changes. */
export interface GoLiveFrame {
  live: boolean
  stats: StreamStats
  vertical_live: boolean
  vertical_stats: StreamStats
  destinations: DestinationView[]
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
