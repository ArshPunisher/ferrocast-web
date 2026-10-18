// Ferrocast voices in the demo, like the engine and relay (`crates/engine/src/speech/cloud.rs`,
// `crates/relay/src/tts`): listed only with Pro and the feature, 402 / 404 when picking, the
// month's characters counted per preview (each voice's preview once), and the demo's chime
// standing in for the audio (the demo can't reach Google).

import type { ProView } from '../../pro'
import type { TtsVoice } from '../../types'
import {
  CLOUD_TTS_MAX_CHARS,
  CLOUD_TTS_MONTHLY_CHARS,
  isCloudVoice,
  type CloudVoice,
  type TtsCloudView,
  type TtsPreview,
} from '../../tts-voices'
import { chimeDataUrl } from '../chime'
import { HttpError } from '../http-error'
import { NOT_MINE, clone, requireObj, type DemoFeature, type Routed } from './host'

/** The relay's curated list (`crates/relay/src/tts/google.rs`). */
export const DEMO_CLOUD_VOICES: CloudVoice[] = [
  ['hi-IN-Neural2-A', 'hi-IN', 'female'],
  ['hi-IN-Neural2-B', 'hi-IN', 'male'],
  ['hi-IN-Wavenet-D', 'hi-IN', 'female'],
  ['hi-IN-Wavenet-C', 'hi-IN', 'male'],
  ['en-IN-Neural2-A', 'en-IN', 'female'],
  ['en-IN-Neural2-B', 'en-IN', 'male'],
  ['en-IN-Wavenet-D', 'en-IN', 'female'],
  ['en-IN-Wavenet-C', 'en-IN', 'male'],
  ['en-US-Neural2-F', 'en-US', 'female'],
  ['en-US-Neural2-D', 'en-US', 'male'],
].map(([name, language, gender]) => {
  const family = name!.includes('Neural2') ? 'Neural2' : 'WaveNet'
  const lang =
    language === 'hi-IN' ? 'Hindi' : language === 'en-IN' ? 'Indian English' : 'US English'
  return {
    id: `google:${name}`,
    name: `${lang}, ${gender} (${family})`,
    language: language!,
    gender: gender!,
    family,
  }
})

/** What a month looks like in the demo: some characters already used. */
export const DEMO_TTS_USED = 4_120

function sample(language: string): string {
  return language.startsWith('hi')
    ? 'आशा, टिप के लिए शुक्रिया! आपके मैसेज ऐसे सुनाई देंगे।'
    : 'Thanks for the tip, Asha! This is how your messages will sound.'
}

export class DemoTtsVoices implements DemoFeature {
  private voice: string | null = null
  private used = DEMO_TTS_USED
  private resting = false
  private previews = new Map<string, string>()
  private n = 0

  constructor(
    private readonly pro: () => ProView,
    /** This computer's voices (free). */
    private readonly system: () => TtsVoice[],
    /** The system voice picked in the TTS settings (the backup). */
    private readonly systemVoice: () => string,
  ) {}

  /** Tests: the relay's monthly cap for everyone reached, or the month's characters set. */
  setState(s: { resting?: boolean; used?: number }): void {
    if (s.resting !== undefined) this.resting = s.resting
    if (s.used !== undefined) this.used = s.used
  }

  private available(): boolean {
    const p = this.pro()
    return p.active && p.features.tts
  }

  private resetAt(): number {
    const d = new Date()
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
  }

  private view(): TtsCloudView {
    const on = this.available()
    return clone({
      voice: this.voice,
      available: on,
      resting: on && this.resting,
      usage: on
        ? { used: this.used, limit: CLOUD_TTS_MONTHLY_CHARS, reset_at: this.resetAt() }
        : null,
      fallback: null,
      max_chars: CLOUD_TTS_MAX_CHARS,
      voices: on ? DEMO_CLOUD_VOICES : [],
    })
  }

  private known(id: string): CloudVoice {
    const v = DEMO_CLOUD_VOICES.find((x) => x.id === id)
    if (!v)
      throw new HttpError(
        404,
        'voice_not_found',
        'That Ferrocast voice doesn’t exist.',
        'Pick one from the list again.',
      )
    return v
  }

  private preview(body: unknown): TtsPreview {
    const b = requireObj(body)
    const asked = typeof b.voice === 'string' && b.voice.trim() ? b.voice.trim() : null
    const voice = asked ?? this.voice ?? (this.systemVoice() || null)
    if (!isCloudVoice(voice)) {
      return {
        media_id: `mprev${++this.n}`,
        url: chimeDataUrl(),
        voice,
        cloud: false,
        notice: null,
      }
    }
    const v = this.known(voice!)
    const why = !this.available()
      ? 'Ferrocast voices are part of Pro, and Pro isn’t active on this PC.'
      : this.resting
        ? 'Ferrocast voices are resting until next month.'
        : null
    const fallback = this.systemVoice() || null
    if (why)
      return {
        media_id: `mprev${++this.n}`,
        url: chimeDataUrl(),
        voice: fallback,
        cloud: false,
        notice: why,
      }
    const cached = this.previews.get(v.id)
    if (cached)
      return { media_id: cached, url: chimeDataUrl(), voice: v.id, cloud: true, notice: null }
    const line = [...sample(v.language)].length
    if (this.used + line > CLOUD_TTS_MONTHLY_CHARS)
      return {
        media_id: `mprev${++this.n}`,
        url: chimeDataUrl(),
        voice: fallback,
        cloud: false,
        notice: 'You’ve used this month’s Ferrocast voice characters.',
      }
    this.used += line
    const id = `mprev${++this.n}`
    this.previews.set(v.id, id)
    return { media_id: id, url: chimeDataUrl(), voice: v.id, cloud: true, notice: null }
  }

  route(method: string, seg: string[], body: unknown): Routed {
    if (seg[0] !== 'tts') return NOT_MINE
    const sub = seg[1]
    if (seg.length === 2 && sub === 'voices' && method === 'GET') {
      const list: TtsVoice[] = clone(this.system()).map((v) => ({ ...v, pro: false }))
      if (this.available()) for (const v of DEMO_CLOUD_VOICES) list.push({ ...v, pro: true })
      return list
    }
    if (seg.length === 2 && sub === 'cloud') {
      if (method === 'GET') return this.view()
      if (method === 'PUT') {
        const b = requireObj(body)
        if (b.voice !== null && typeof b.voice !== 'string')
          throw new HttpError(400, 'invalid', 'voice: a Ferrocast voice id or null.')
        const voice = typeof b.voice === 'string' && b.voice.trim() ? b.voice.trim() : null
        if (voice) {
          if (!this.available())
            throw new HttpError(
              402,
              'pro_required',
              'This runs on Ferrocast’s servers and is part of Pro.',
              'See Settings › Pro. The voices on this computer stay free.',
            )
          this.known(voice)
        }
        this.voice = voice
        return this.view()
      }
    }
    if (seg.length === 2 && sub === 'preview' && method === 'POST') return this.preview(body)
    return NOT_MINE
  }
}
