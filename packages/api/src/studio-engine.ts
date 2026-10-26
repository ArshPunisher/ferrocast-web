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
  /** OBS shows this number as a slider. */
  slider: boolean
  /** The number's unit as OBS writes it ("dB", "ms", "%"), or "". */
  suffix: string
  choices: string[]
  /** The value saved for each choice, in the same order. */
  values: (string | number | boolean)[]
  group: EngineOption[]
  /** A path's kind (open a file, save one, a folder); "files" for a list of files. */
  path?: 'file' | 'save' | 'folder' | 'files' | ''
  /** A path's file types, as OBS writes them: `Image Files (*.png *.jpg);;All Files (*.*)`. */
  filter?: string
  /** A group with its own on/off switch (its key holds true or false). */
  checkable?: boolean
}

/** OBS's own settings for a source (the keys OBS saves in its scene collections). */
export type EngineSettings = Record<string, unknown>

/** A scene, in the order shown. */
export interface EngineScene {
  name: string
  /** Sources directly in it. */
  items: number
  /** On air. */
  current: boolean
  /** Its own transition (OBS's Transition Override), or null for the Studio's. */
  transition: EngineTransition | null
}

export interface EngineTransition {
  /** `fade_transition`, `cut_transition`, `swipe_transition`… */
  kind: string
  ms: number
}

export interface EngineScenes {
  scenes: EngineScene[]
  current: string
  transition: EngineTransition
}

/** A source in a scene, top first. A group lists its own items. */
export interface EngineItem {
  id: number
  name: string
  kind: string
  visible: boolean
  locked: boolean
  /** It makes sound (shows in the mixer). */
  audio: boolean
  group: boolean
  /** How it mixes with what's under it. */
  blend: EngineBlend
  /** How it's scaled. */
  scale_filter: EngineScaleFilter
  /**
   * Where it is on the canvas, in pixels: `[sideX.x, sideX.y, sideY.x, sideY.y, corner.x,
   * corner.y]`. A point (u, v) of its box (each 0 to 1) is at `corner + u·sideX + v·sideY`.
   */
  frame?: [number, number, number, number, number, number]
  children: EngineItem[]
}

export const ENGINE_BLENDS = [
  'normal',
  'additive',
  'subtract',
  'screen',
  'multiply',
  'lighten',
  'darken',
] as const
export type EngineBlend = (typeof ENGINE_BLENDS)[number]

export const ENGINE_SCALE_FILTERS = [
  'off',
  'point',
  'bicubic',
  'bilinear',
  'lanczos',
  'area',
] as const
export type EngineScaleFilter = (typeof ENGINE_SCALE_FILTERS)[number]

export type EngineItemEdit =
  | 'show'
  | 'hide'
  | 'lock'
  | 'unlock'
  | 'fit'
  | 'remove'
  | 'up'
  | 'down'
  | 'top'
  | 'bottom'
  /** Fills the screen, ignoring its shape. */
  | 'stretch'
  /** To the middle of the screen, size kept. */
  | 'center'
  /** Its own size at the top left, not turned or flipped. */
  | 'reset'
  | 'flip_h'
  | 'flip_v'
  | 'rotate_cw'
  | 'rotate_ccw'
  | 'rotate180'
  /** A copy of the source just above it. */
  | 'duplicate'
  | `blend_${EngineBlend}`
  | `scale_${EngineScaleFilter}`

export interface NewEngineSource {
  kind: string
  name: string
  settings?: EngineSettings
}

/** Who hears a sound besides the stream. */
/** One of OBS's scene collections, to bring into the Studio. */
export interface EngineObsCollection {
  id: string
  name: string
  scenes: number
  sources: number
}

/** What an import from OBS brought in. */
export interface EngineImportReport {
  name: string
  scenes: number
  sources: number
  /** Browser sources changed into Web page sources. */
  web_pages: number
  /** Kinds of source this computer's OBS doesn't have. */
  missing: string[]
}

export type EngineMonitor = 'off' | 'only_me' | 'me_and_stream'

/** A sound in a scene's mixer. */
export interface EngineAudio {
  name: string
  kind: string
  /** A global device (1 to 6), heard in every scene; null for one in this scene only. */
  channel: number | null
  /** -100 (silent) to 26. */
  volume_db: number
  muted: boolean
  monitor: EngineMonitor
}

/** A source and the scenes it's in. */
export interface EngineSourceUse {
  name: string
  kind: string
  scenes: string[]
}

export interface EngineFilter {
  name: string
  kind: string
  enabled: boolean
}

export type EngineFilterEdit = 'enable' | 'disable' | 'up' | 'down' | 'top' | 'bottom'

/** dBFS for the left and right channels; -100 is silence. */
export interface EngineLevel {
  peak: [number, number]
  magnitude: [number, number]
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

/** How the Studio streams, records and runs (every field has a default). */
export interface StudioSettings {
  /** "hardware" (the Mac's H.264) or "software" (x264). */
  encoder: 'hardware' | 'software'
  video_kbps: number
  vbr: boolean
  /** 0 lets the encoder pick. */
  keyframe_s: number
  profile: 'high' | 'main' | 'baseline'
  bframes: boolean
  /** Send at this size instead of the canvas's. */
  scale: [number, number] | null
  audio_kbps: number
  width: number
  height: number
  fps: number
  /** null: Movies/Ferrocast. */
  record_folder: string | null
  record_format: 'mp4' | 'mov'
  record_quality: 'stream' | 'high' | 'lossless'
  reconnect: boolean
  reconnect_every_s: number
  reconnect_tries: number
  delay_s: number
  sample_rate: 44100 | 48000
  stereo: boolean
  /** [name, id]; null: the system's. */
  monitoring: [string, string] | null
  /** action (go_live, end_stream, record, pause_record, scene:<name>, mute:<sound>,
   * push_to_talk:<sound>) → keys ("CmdOrCtrl+Shift+L"). */
  hotkeys: Record<string, string>
}

export interface EngineRecordStats {
  active: boolean
  paused: boolean
  bytes: number
  frames: number
  file: string
  seconds: number
  error: string | null
}

export interface EngineStats {
  engine: {
    cpu: number
    fps: number
    frame_ms: number
    lagged: number
    frames: number
    memory_mb: number
  }
  canvas: { width: number; height: number; fps: number }
  stream: EngineStreamStats | null
  record: EngineRecordStats | null
  /** The scene on air (switches made elsewhere show up here first). */
  scene?: string | null
  /** What Undo and Redo would do now (labels), or null. */
  history?: { undo: string | null; redo: string | null }
}

/** Kinds of bounding box, as OBS orders them (fit = scale inner, fill = scale outer). */
export const ENGINE_BOUNDS = ['none', 'stretch', 'fit', 'fill', 'width', 'height', 'max'] as const
export type EngineBounds = (typeof ENGINE_BOUNDS)[number]

/** Everything OBS's Edit Transform shows for an item. */
export interface EngineTransform {
  /** Where its alignment point is on the canvas. */
  x: number
  y: number
  /** Degrees, clockwise. */
  rotation: number
  /** Minus flips. */
  scale_x: number
  scale_y: number
  /** OBS's bits: 0 the middle; 1 left, 2 right, 4 top, 8 bottom. */
  alignment: number
  bounds: EngineBounds
  bounds_alignment: number
  bounds_width: number
  bounds_height: number
  crop_left: number
  crop_top: number
  crop_right: number
  crop_bottom: number
  /** The source's own size before cropping (only read). */
  width: number
  height: number
}

/** A display a full-screen projector can go on. */
export interface EngineScreen {
  index: number
  name: string
  width: number
  height: number
  /** The one with the menu bar. */
  main: boolean
}

/** What a projector shows: what's on air, one scene or source, or every scene. */
export type EngineProjector =
  | { what: 'program' | 'multiview'; screen?: number }
  | { what: 'source'; name: string; screen?: number }

/** A box in the dashboard window (CSS pixels from its top-left corner). */
export interface PreviewRect {
  x: number
  y: number
  w: number
  h: number
  /** The page's visible height (`window.innerHeight`): where its top is inside the window. */
  vh?: number
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
    scenes: () => c.request<EngineScenes>('GET', '/api/v1/studio/engine/scenes'),
    addScene: (name: string) => c.request<void>('POST', '/api/v1/studio/engine/scenes', { name }),
    removeScene: (scene: string) =>
      c.request<void>('DELETE', `/api/v1/studio/engine/scenes/${enc(scene)}`),
    duplicateScene: (scene: string, name: string) =>
      c.request<void>('POST', `/api/v1/studio/engine/scenes/${enc(scene)}/duplicate`, { name }),
    /** Moves a scene to `to` in the list (0 is the top). */
    moveScene: (scene: string, to: number) =>
      c.request<void>('POST', `/api/v1/studio/engine/scenes/${enc(scene)}/move`, { to }),
    /** Puts a scene on air through the transition. */
    setCurrent: (scene: string) =>
      c.request<void>('POST', `/api/v1/studio/engine/scenes/${enc(scene)}/current`, {}),
    setTransition: (t: EngineTransition) =>
      c.request<void>('PUT', '/api/v1/studio/engine/transition', t),
    items: (scene: string) =>
      c.request<EngineItem[]>('GET', `/api/v1/studio/engine/scenes/${enc(scene)}/items`),
    /** A new source on top of the scene; `fit` fits it to the screen. */
    addSource: (scene: string, source: NewEngineSource, fit = false) =>
      c.request<{ item: EngineItem; settings: EngineSettings }>(
        'POST',
        `/api/v1/studio/engine/scenes/${enc(scene)}/items`,
        { ...source, fit },
      ),
    /** A source from another scene: the same one, shown in both. */
    addExisting: (scene: string, name: string) =>
      c.request<{ item: EngineItem }>('POST', `/api/v1/studio/engine/scenes/${enc(scene)}/items`, {
        existing: name,
      }),
    editItem: (scene: string, id: number, what: EngineItemEdit) =>
      c.request<void>('POST', `/api/v1/studio/engine/scenes/${enc(scene)}/items/${id}/edit`, {
        do: what,
      }),
    audio: (scene: string) =>
      c.request<EngineAudio[]>('GET', `/api/v1/studio/engine/scenes/${enc(scene)}/audio`),
    /** Every source in a scene, with the scenes it's in. */
    sources: () => c.request<EngineSourceUse[]>('GET', '/api/v1/studio/engine/sources'),
    rename: (name: string, to: string) =>
      c.request<void>('POST', `/api/v1/studio/engine/sources/${enc(name)}/rename`, { name: to }),
    settings: (name: string) =>
      c.request<EngineSettings>('GET', `/api/v1/studio/engine/sources/${enc(name)}/settings`),
    /** Changes only the keys sent. */
    update: (name: string, settings: EngineSettings) =>
      c.request<void>('PUT', `/api/v1/studio/engine/sources/${enc(name)}/settings`, { settings }),
    /** The source's options as they look for its settings now. */
    sourceOptions: (name: string) =>
      c.request<EngineOption[]>('GET', `/api/v1/studio/engine/sources/${enc(name)}/options`),
    setAudio: (name: string, a: { volume_db?: number; muted?: boolean; monitor?: EngineMonitor }) =>
      c.request<void>('PUT', `/api/v1/studio/engine/sources/${enc(name)}/audio`, a),
    filters: (name: string) =>
      c.request<EngineFilter[]>('GET', `/api/v1/studio/engine/sources/${enc(name)}/filters`),
    addFilter: (name: string, filter: NewEngineSource) =>
      c.request<void>('POST', `/api/v1/studio/engine/sources/${enc(name)}/filters`, filter),
    removeFilter: (name: string, filter: string) =>
      c.request<void>(
        'DELETE',
        `/api/v1/studio/engine/sources/${enc(name)}/filters/${enc(filter)}`,
      ),
    editFilter: (name: string, filter: string, what: EngineFilterEdit) =>
      c.request<void>(
        'POST',
        `/api/v1/studio/engine/sources/${enc(name)}/filters/${enc(filter)}/edit`,
        { do: what },
      ),
    filterSettings: (name: string, filter: string) =>
      c.request<EngineSettings>(
        'GET',
        `/api/v1/studio/engine/sources/${enc(name)}/filters/${enc(filter)}/settings`,
      ),
    filterOptions: (name: string, filter: string) =>
      c.request<EngineOption[]>(
        'GET',
        `/api/v1/studio/engine/sources/${enc(name)}/filters/${enc(filter)}/options`,
      ),
    updateFilter: (name: string, filter: string, settings: EngineSettings) =>
      c.request<void>(
        'PUT',
        `/api/v1/studio/engine/sources/${enc(name)}/filters/${enc(filter)}/settings`,
        { settings },
      ),
    /** A global sound device heard in every scene: 1, 2 desktop sound; 3 to 6 mics. */
    /** A scene's own transition, or null to use the Studio's. */
    setSceneTransition: (scene: string, transition: EngineTransition | null) =>
      c.request<void>('PUT', `/api/v1/studio/engine/scenes/${enc(scene)}/transition`, {
        transition,
      }),
    /** A PNG of a scene or source, saved where recordings go. */
    screenshot: (name: string) =>
      c.request<{ file: string }>(
        'POST',
        `/api/v1/studio/engine/sources/${enc(name)}/screenshot`,
        {},
      ),
    /** A Web page source: on screen to click and type in, back off-screen, or loaded again. */
    web: (name: string, what: 'interact' | 'stop' | 'reload') =>
      c.request<void>('POST', `/api/v1/studio/engine/sources/${enc(name)}/web`, { do: what }),
    /** OBS's scene collections on this computer. */
    obsCollections: () =>
      c.request<EngineObsCollection[]>('GET', '/api/v1/studio/engine/obs-collections'),
    /** Replaces the Studio's scenes with one of OBS's collections (the old ones are kept). */
    importObs: (id: string) =>
      c.request<EngineImportReport>('POST', '/api/v1/studio/engine/obs-collections/import', {
        id,
      }),
    /**
     * Moves and sizes an item from the preview: its box's first corner to (x, y), its sides
     * w and h long (canvas pixels). `save` at the end of a drag → the item as it is now.
     */
    setItemBox: (
      scene: string,
      id: number,
      box: { x: number; y: number; w: number; h: number; save?: boolean },
    ) =>
      c.request<EngineItem>(
        'PUT',
        `/api/v1/studio/engine/scenes/${enc(scene)}/items/${id}/box`,
        box,
      ),
    transform: (scene: string, id: number) =>
      c.request<EngineTransform>(
        'GET',
        `/api/v1/studio/engine/scenes/${enc(scene)}/items/${id}/transform`,
      ),
    /** Sets all of an item's transform at once → the item. */
    setTransform: (scene: string, id: number, t: EngineTransform) =>
      c.request<EngineItem>(
        'PUT',
        `/api/v1/studio/engine/scenes/${enc(scene)}/items/${id}/transform`,
        t,
      ),
    /** A transition kind's own settings (only what was set). */
    transitionSettings: (kind: string) =>
      c.request<EngineSettings>('GET', `/api/v1/studio/engine/transitions/${enc(kind)}/settings`),
    /** Changes only the keys sent; the transition on air takes them at once. */
    setTransitionSettings: (kind: string, settings: EngineSettings) =>
      c.request<void>('PUT', `/api/v1/studio/engine/transitions/${enc(kind)}/settings`, {
        settings,
      }),
    /** Undoes the newest change to sources → what it was, and what's next each way. */
    undo: () =>
      c.request<{ done: string | null; undo: string | null; redo: string | null }>(
        'POST',
        '/api/v1/studio/engine/undo',
        {},
      ),
    redo: () =>
      c.request<{ done: string | null; undo: string | null; redo: string | null }>(
        'POST',
        '/api/v1/studio/engine/redo',
        {},
      ),
    /** Outlines an item in the preview, or nothing. */
    select: (pick: { scene: string; id: number } | null) =>
      c.request<void>(
        'PUT',
        '/api/v1/studio/engine/preview/selection',
        pick ?? { scene: null, id: null },
      ),
    /** A file dialog on the computer Ferrocast runs on → the path, or null if cancelled. */
    pickFile: (kind: 'file' | 'save' | 'folder', filter = '') =>
      c.request<{ path: string | null }>('POST', '/api/v1/studio/engine/pick-file', {
        kind,
        filter,
      }),
    /** Several files at once → their paths, or null if cancelled. */
    pickFiles: (filter = '') =>
      c.request<{ path: string[] | null }>('POST', '/api/v1/studio/engine/pick-file', {
        kind: 'files',
        filter,
      }),
    /** macOS's Screen Recording switch for Ferrocast (as it was when Ferrocast opened). */
    screenAccess: () =>
      c.request<{ granted: boolean }>('GET', '/api/v1/studio/engine/screen-access'),
    /** Asks macOS again, forgetting what it said to an older Ferrocast. */
    fixScreenAccess: () =>
      c.request<{ granted: boolean }>('POST', '/api/v1/studio/engine/screen-access/fix', {}),
    /** Opens a projector window, or full screen on a display (`screen` from `screens`). */
    projector: (p: EngineProjector) =>
      c.request<{ id: number }>('POST', '/api/v1/studio/engine/projectors', p),
    closeProjectors: () => c.request<void>('DELETE', '/api/v1/studio/engine/projectors'),
    /** The displays a full-screen projector can go on. */
    screens: () => c.request<EngineScreen[]>('GET', '/api/v1/studio/engine/screens'),
    /** Quits and opens Ferrocast again (refused while streaming or recording). */
    restart: () => c.request<void>('POST', '/api/v1/studio/engine/restart', {}),
    /** Copies every filter of `from` onto `name`. */
    pasteFilters: (name: string, from: string) =>
      c.request<void>('POST', `/api/v1/studio/engine/sources/${enc(name)}/paste-filters`, {
        from,
      }),
    setChannel: (channel: number, device: NewEngineSource | null) =>
      device
        ? c.request<void>('PUT', `/api/v1/studio/engine/channels/${channel}`, device)
        : c.request<void>('DELETE', `/api/v1/studio/engine/channels/${channel}`),
    studioSettings: () => c.request<StudioSettings>('GET', '/api/v1/studio/engine/settings'),
    /** Saves and applies them → what needs a restart or didn't apply, in words (or null). */
    setStudioSettings: (s: StudioSettings) =>
      c.request<{ settings: StudioSettings; restart: string | null }>(
        'PUT',
        '/api/v1/studio/engine/settings',
        s,
      ),
    stats: () => c.request<EngineStats>('GET', '/api/v1/studio/engine/stats'),
    /** Starts or stops recording → its stats (null when stopped). */
    record: (on: boolean) =>
      c.request<EngineRecordStats | null>('POST', '/api/v1/studio/engine/record', { on }),
    pauseRecord: (on: boolean) =>
      c.request<void>('POST', '/api/v1/studio/engine/record/pause', { on }),
    /** Where "Hear it" can play. */
    monitoring: () =>
      c.request<{
        devices: { name: string; id: string }[]
        current: { name: string; id: string }
      }>('GET', '/api/v1/studio/engine/monitoring'),
    /** Levels now, for these sounds (a meter starts on the first ask). */
    levels: (names: string[]) =>
      c.request<Record<string, EngineLevel>>('POST', '/api/v1/studio/engine/levels', { names }),
    /** Starts or stops streaming the Studio into this PC's Go live. */
    stream: (on: boolean) =>
      c.request<EngineStreamStats | null>('POST', '/api/v1/studio/engine/stream', { on }),
    streamStats: () => c.request<EngineStreamStats | null>('GET', '/api/v1/studio/engine/stream'),
    /** Puts the live preview over the box, or takes it away (null). */
    preview: (rect: PreviewRect | null) =>
      c.request<void>('PUT', '/api/v1/studio/engine/preview', { rect }),
  }
}
