// Ferrocast voices (Pro, API.md §9.4): Google Cloud voices read through the relay. Only lines
// that passed the local TTS rules are sent; the system voice stays as the backup and reads
// whenever a Ferrocast voice can't (Pro lapsed, relay down or slow, month used up).

import type { FerroClient } from './client'
import type { TtsVoice } from './types'

/** Ferrocast voice ids start with their provider. */
export const CLOUD_VOICE_PREFIX = 'google:'
/** The relay reads up to this many characters per line. */
export const CLOUD_TTS_MAX_CHARS = 300
/** Characters per subscription per month. */
export const CLOUD_TTS_MONTHLY_CHARS = 20_000

export interface CloudVoice {
  id: string
  name: string
  /** BCP 47: `hi-IN`, `en-IN`, `en-US`. */
  language: string
  gender: string
  /** `Neural2`, `WaveNet`. */
  family: string
}

export interface CloudTtsUsage {
  used: number
  limit: number
  /** When the month starts again (ms, UTC). */
  reset_at: number
}

/** `GET /api/v1/tts/cloud`. */
export interface TtsCloudView {
  /** The Ferrocast voice that reads alerts; `null`: the system voice does. */
  voice: string | null
  /** Pro is active and the relay has Ferrocast voices. */
  available: boolean
  /** The relay's monthly cap for everyone is reached: back on the 1st. */
  resting: boolean
  usage: CloudTtsUsage | null
  /** Why the last line used the system voice, until a Ferrocast voice works again. */
  fallback: string | null
  max_chars: number
  voices: CloudVoice[]
}

/** `POST /api/v1/tts/preview`. */
export interface TtsPreview {
  media_id: string
  /** `/api/v1/media/<id>` from the engine (add the session with `client.mediaUrl`), or a data URL in the demo. */
  url: string
  voice: string | null
  cloud: boolean
  notice: string | null
}

export function isCloudVoice(id: string | null | undefined): boolean {
  return !!id && id.startsWith(CLOUD_VOICE_PREFIX)
}

const LANG_ORDER = ['hi-IN', 'en-IN']

/** Ferrocast voices for the picker: Hindi, then Indian English, then the rest, keeping the relay's order within each. */
export function orderCloudVoices<T extends { language: string }>(voices: readonly T[]): T[] {
  const rank = (l: string) => {
    const i = LANG_ORDER.indexOf(l)
    return i === -1 ? LANG_ORDER.length : i
  }
  return voices
    .map((v, i) => ({ v, i }))
    .sort((a, b) => rank(a.v.language) - rank(b.v.language) || a.i - b.i)
    .map((x) => x.v)
}

/** System voices and Ferrocast voices, from `GET /api/v1/tts/voices`. */
export function splitVoices(list: readonly TtsVoice[]): { system: TtsVoice[]; cloud: TtsVoice[] } {
  return {
    system: list.filter((v) => !v.pro && !isCloudVoice(v.id)),
    cloud: orderCloudVoices(list.filter((v) => v.pro || isCloudVoice(v.id))),
  }
}

/** "4,120 of 20,000 characters this month". */
export function cloudUsageLine(u: CloudTtsUsage): string {
  const n = (x: number) => Math.max(0, Math.trunc(x)).toLocaleString('en-US')
  return `${n(u.used)} of ${n(u.limit)} characters this month`
}

/** Share of the month used, 0 to 1. */
export function cloudUsageShare(u: CloudTtsUsage): number {
  return u.limit > 0 ? Math.min(1, Math.max(0, u.used / u.limit)) : 1
}

/** Ferrocast voices' routes on a dashboard client. */
export function ttsVoicesApi(c: FerroClient) {
  return {
    cloud: () => c.request<TtsCloudView>('GET', '/api/v1/tts/cloud'),
    setCloud: (voice: string | null) =>
      c.request<TtsCloudView>('PUT', '/api/v1/tts/cloud', { voice }),
    /** A short sample line in `voice` (default: what alerts use), through the same path as alerts. */
    preview: (voice?: string) =>
      c.request<TtsPreview>('POST', '/api/v1/tts/preview', voice ? { voice } : {}),
  }
}
