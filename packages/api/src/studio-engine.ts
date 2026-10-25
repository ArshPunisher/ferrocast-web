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
  group: EngineOption[]
}

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
    /** Puts the live preview over the box, or takes it away (null). */
    preview: (rect: PreviewRect | null) =>
      c.request<void>('PUT', '/api/v1/studio/engine/preview', { rect }),
  }
}
