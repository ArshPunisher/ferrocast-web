// The Studio's engine (2.1, Track B; ferrocast API.md "Studio engine"): OBS's own libobs run
// by the desktop app. Every kind of source and filter OBS has, with every option, read live.

import type { FerroClient } from './client'

export interface StudioEngineStatus {
  /** OBS's engine can be used here (the desktop app, with OBS installed). */
  available: boolean
  running: boolean
  version: string | null
  renderer: string | null
  /** Why it isn't available, with what to do. */
  detail: string | null
}

export interface EngineKind {
  id: string
  name: string
}

export interface EngineKinds {
  inputs: EngineKind[]
  filters: EngineKind[]
  transitions: EngineKind[]
  encoders: EngineKind[]
  outputs: EngineKind[]
}

export type EngineOptionKind =
  | 'bool'
  | 'int'
  | 'float'
  | 'text'
  | 'path'
  | 'list'
  | 'color'
  | 'color_alpha'
  | 'button'
  | 'font'
  | 'editable_list'
  | 'frame_rate'
  | 'group'
  | 'other'

/** One option of a source or filter, as OBS describes it. */
export interface EngineOption {
  key: string
  label: string
  kind: EngineOptionKind
  help: string
  visible: boolean
  enabled: boolean
  min: number | null
  max: number | null
  step: number | null
  choices: string[]
  /** The value saved for each choice, in the same order. */
  values: (string | number | boolean)[]
  group: EngineOption[]
}

/** A source in the scene on air. */
export interface EngineSource {
  name: string
  kind: string
  visible: boolean
}

/** OBS's own settings for a source (the keys OBS saves in its scene collections). */
export type EngineSettings = Record<string, unknown>

export interface AddEngineSource {
  kind: string
  name: string
  settings?: EngineSettings
  /** Fit it to the screen once added. */
  fit?: boolean
}

/** How the Studio's stream into Go live is going (null: not streaming). */
export interface EngineStreamStats {
  active: boolean
  reconnecting: boolean
  bytes: number
  frames: number
  dropped: number
  error: string | null
}

export type EngineSourceEdit = 'show' | 'hide' | 'fit' | 'remove'

/** A box in the dashboard window (CSS pixels from its top-left corner). */
export interface PreviewRect {
  x: number
  y: number
  w: number
  h: number
}

export function studioEngineApi(c: FerroClient) {
  const enc = encodeURIComponent
  return {
    status: () => c.request<StudioEngineStatus>('GET', '/api/v1/studio/engine'),
    start: () => c.request<StudioEngineStatus>('POST', '/api/v1/studio/engine/start', {}),
    stop: () => c.request<StudioEngineStatus>('POST', '/api/v1/studio/engine/stop', {}),
    kinds: () => c.request<EngineKinds>('GET', '/api/v1/studio/engine/kinds'),
    options: (kind: string) =>
      c.request<EngineOption[]>('GET', `/api/v1/studio/engine/kinds/${enc(kind)}/options`),
    /** The settings a new source of this kind starts with. */
    defaults: (kind: string) =>
      c.request<EngineSettings>('GET', `/api/v1/studio/engine/kinds/${enc(kind)}/defaults`),
    sources: () => c.request<EngineSource[]>('GET', '/api/v1/studio/engine/sources'),
    addSource: (add: AddEngineSource) =>
      c.request<{ source: EngineSource | null; settings: EngineSettings }>(
        'POST',
        '/api/v1/studio/engine/sources',
        add,
      ),
    settings: (name: string) =>
      c.request<EngineSettings>('GET', `/api/v1/studio/engine/sources/${enc(name)}/settings`),
    /** Changes only the keys sent. */
    update: (name: string, settings: EngineSettings) =>
      c.request<void>('PUT', `/api/v1/studio/engine/sources/${enc(name)}/settings`, { settings }),
    /** The source's options as they look for its settings now. */
    sourceOptions: (name: string) =>
      c.request<EngineOption[]>('GET', `/api/v1/studio/engine/sources/${enc(name)}/options`),
    edit: (name: string, what: EngineSourceEdit) =>
      c.request<void>('POST', `/api/v1/studio/engine/sources/${enc(name)}/edit`, { do: what }),
    /** Starts or stops streaming the Studio into this PC's Go live. */
    stream: (on: boolean) =>
      c.request<EngineStreamStats | null>('POST', '/api/v1/studio/engine/stream', { on }),
    streamStats: () => c.request<EngineStreamStats | null>('GET', '/api/v1/studio/engine/stream'),
    /** Puts the live preview over the box, or takes it away (null). */
    preview: (rect: PreviewRect | null) =>
      c.request<void>('PUT', '/api/v1/studio/engine/preview', { rect }),
  }
}
