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
  detail:
    | string
    | null /** Only from the Start after Ferrocast didn't close normally: what was on, what came back. */
  recovered?: EngineRecovered
}

export interface EngineRecovered {
  record: boolean
  replay: boolean
  /** It was live: the stream isn't started again by itself. */
  live: boolean
  /** What came back on ("recording", "replay buffer"). */
  again: string[]
  /** What didn't, in words. */
  failed: string[]
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
  /** A text's kind: a box of several lines, a password, read-only info, or one line (""). */
  text_type?: 'multiline' | 'password' | 'info' | ''
  /** A text OBS shows in a fixed-width font (code, CSS). */
  monospace?: boolean
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
  /** In Studio Mode's preview (what goes on air next). */
  preview?: boolean
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
  /** Studio Mode's preview scene (what goes on air next), or null when Studio Mode is off. */
  preview?: string | null
  /** OBS's quick transitions: one-click ways to send the preview on air. */
  quick?: EngineTransition[]
  /** How Studio Mode sends scenes on air. */
  studio_options?: EngineStudioOptions
  /** Where the T-bar stands. */
  tbar?: EngineTBar
  /** Faded to black now. */
  black?: boolean
  /** The vertical picture (its own scenes, 1080×1920), or null while it's off. */
  vertical?: EngineVertical | null
}

/** The vertical picture: a second canvas with scenes of its own, sharing sources. */
export interface EngineVertical {
  width: number
  height: number
  scenes: EngineScene[]
  current: string
}

/** Studio Mode's options, as OBS has them under the Transition button. */
export interface EngineStudioOptions {
  /** After a transition, the preview shows what was on air. */
  swap: boolean
  /** What goes on air is a copy: moving or hiding sources in the preview doesn't touch it. */
  duplicate_scene: boolean
  /** The copy has its own copies of the sources too. */
  duplicate_sources: boolean
  /** A double-click on a scene sends it on air. */
  double_click: boolean
}

export interface EngineTBar {
  /** Held between both scenes. */
  active: boolean
  /** 0 (on air) to 1 (the preview). */
  at: number
}

/** OBS's deinterlacing modes. */
export const ENGINE_DEINTERLACE = [
  'off',
  'discard',
  'retro',
  'blend',
  'blend_2x',
  'linear',
  'linear_2x',
  'yadif',
  'yadif_2x',
] as const
export type EngineDeinterlace = (typeof ENGINE_DEINTERLACE)[number]

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
  /** Blending with sRGB off (OBS's older blending method). */
  srgb_off?: boolean
  /**
   * Where it is on the canvas, in pixels: `[sideX.x, sideX.y, sideY.x, sideY.y, corner.x,
   * corner.y]`. A point (u, v) of its box (each 0 to 1) is at `corner + u·sideX + v·sideY`.
   */
  frame?: [number, number, number, number, number, number]
  children: EngineItem[]
  /** How it appears when shown, and goes when hidden (null: at once). */
  show_transition?: EngineTransition | null
  hide_transition?: EngineTransition | null
  /** For video from a device or file: how it's deinterlaced; null for other sources. */
  deinterlace?: EngineDeinterlace | null
  top_field_first?: boolean
  /** A video, playlist or slideshow with play controls. */
  media?: boolean
}

export type EngineMediaAct =
  'play' | 'pause' | 'play_pause' | 'restart' | 'stop' | 'next' | 'previous'

/** Where a video, playlist or slideshow is. */
export interface EngineMedia {
  state: 'none' | 'playing' | 'opening' | 'buffering' | 'paused' | 'stopped' | 'ended' | 'error'
  time_ms: number
  duration_ms: number
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
  | 'blend_method_default'
  | 'blend_method_srgb_off'
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
  /** Left to right, 0 to 1 (0.5 is the middle). */
  balance?: number
  /** Heard this much later (negative: earlier), ms. */
  sync_ms?: number
  /** Both speakers get the same sound. */
  mono?: boolean
  /** The audio tracks (1 to 6) it's mixed into. */
  tracks?: number[]
  /** Making sound now (a playing file, an open device). */
  active?: boolean
}

/** What to change in a sound's mixer settings (anything left out stays). */
export interface EngineAudioChange {
  volume_db?: number
  muted?: boolean
  monitor?: EngineMonitor
  balance?: number
  sync_ms?: number
  mono?: boolean
  tracks?: number[]
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
/** Recording formats: crash-safe MP4 and MOV, fragmented ones, and MKV, FLV and TS. */
export const ENGINE_RECORD_FORMATS = [
  'mp4',
  'mov',
  'fmp4',
  'fmov',
  'mkv',
  'flv',
  'ts',
  'hls',
] as const
export type EngineRecordFormat = (typeof ENGINE_RECORD_FORMATS)[number]

/** How the last remux went. */
/** A file a source, filter or transition uses that isn't on this computer. */
export interface EngineMissingFile {
  /** The source or filter's name; "" for a transition (its kind is `kind`). */
  source: string
  /** For a filter: the source it's on. */
  parent: string | null
  kind: string
  key: string
  label: string
  path: string
}

export interface EngineRemux {
  from: string
  to: string
  percent: number
  done: boolean
  error: string | null
}

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
  record_format: EngineRecordFormat
  record_quality: 'stream' | 'high' | 'lossless' | 'custom'
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
  /** A particular video encoder (an id from `kinds().encoders`) instead of `encoder`'s pick. */
  video_encoder?: string | null
  /** That encoder's own options (OBS's keys), applied over the ones above. */
  encoder_settings?: Record<string, unknown>
  /** The recording's encoder when `record_quality` is "custom", and its options. */
  record_encoder?: string | null
  record_encoder_settings?: Record<string, unknown>
  /** OBS's file name pattern (`%CCYY-%MM-%DD %hh-%mm-%ss`…). */
  record_name?: string
  record_spaces?: boolean
  record_overwrite?: boolean
  /** A new file every this many minutes or megabytes (0: never). */
  record_split_minutes?: number
  record_split_mb?: number
  /** Audio tracks (1 to 6) the recording keeps. */
  record_tracks?: number[]
  /** MKV, FLV and TS become MP4 when the recording ends. */
  record_remux?: boolean
  /** ffmpeg muxer settings of your own (key=value, space apart). */
  record_muxer?: string
  /** The replay buffer keeps the last this many seconds (5 to 21600), at most this many MB. */
  replay_seconds?: number
  replay_mb?: number
  replay_format?: 'mp4' | 'mkv' | 'mov' | 'flv' | 'ts'
  /** A surround layout instead of `stereo` (after a restart); null follows `stereo`. */
  speakers?: '2.1' | '4.0' | '4.1' | '5.1' | '7.1' | null
  /** Meters read true peak instead of sample peak. */
  true_peak?: boolean
  /** OBS's Low Latency Audio Buffering (after a restart). */
  low_latency_audio?: boolean
  /** How a Mac draws the picture: Metal (the default) or the older OpenGL. After a restart. */
  renderer?: 'metal' | 'opengl'
  /** Multiviews: what's on air above, below, left or right of the scenes, or scenes only. */
  multiview_layout?: 'top' | 'bottom' | 'left' | 'right' | 'scenes_only'
  multiview_labels?: boolean
  multiview_safe_areas?: boolean
  /** Snapping in the preview (OBS's): on, how near (screen pixels), and to what. */
  snapping?: boolean
  snap_px?: number
  snap_screen?: boolean
  snap_sources?: boolean
  snap_center?: boolean
  /** Asked "are you sure?" first. */
  confirm_go_live?: boolean
  confirm_end_stream?: boolean
  confirm_stop_record?: boolean
  /** Recording and the replay buffer start with the stream; they stop with it unless kept. */
  record_when_streaming?: boolean
  keep_recording?: boolean
  replay_when_streaming?: boolean
  keep_replay?: boolean
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

/** Live captions (Mac first): what macOS allows, and what was last heard. */
export interface EngineCaptions {
  access: 'allowed' | 'not_asked' | 'denied' | 'restricted' | 'unsupported'
  on: boolean
  /** The Studio sound they listen to. */
  source: string | null
  /** The end of what was heard, about two lines. */
  text: string
  /** Whether the scenes have a text source named "Captions" to show it. */
  box: boolean
  /** Times "clip that" was heard since Ferrocast opened. */
  clips_said?: number
}

/** Smart vertical: the vertical item that follows the face in it. */
export interface EngineFollow {
  on: boolean
  scene: string | null
  item: number | null
  /** A face was seen in the last look. */
  face: boolean
  /** What it follows (a face or the action) was seen in the last look. */
  found?: boolean
  /** What it follows: a face, or what stands out (the action in a game). */
  what?: 'face' | 'action' | null
}

export interface EngineCaptureProblem {
  source: string
  kind: string
  problem: 'permission' | 'no_picture' | 'black'
}

export interface EngineStats {
  engine: {
    cpu: number
    fps: number
    frame_ms: number
    lagged: number
    frames: number
    memory_mb: number
    /** Frames the encoders skipped (encoding lag), and all given to them. */
    skipped?: number
    encoded?: number
  }
  canvas: { width: number; height: number; fps: number }
  stream: EngineStreamStats | null
  record: EngineRecordStats | null
  /** The scene on air (switches made elsewhere show up here first). */
  scene?: string | null
  /** What Undo and Redo would do now (labels), or null. */
  history?: { undo: string | null; redo: string | null }
  /** The last remux (Remux, or MKV made into MP4 after recording), or null. */
  remux?: EngineRemux | null
  /** The replay buffer when on: the last file saved, or why it stopped. */
  replay?: { active: boolean; last: string | null; error: string | null } | null
  virtualcam?: { active: boolean } | null
  /** Captures on air that show nothing: macOS's Screen Recording off for Ferrocast, no picture
   * at all, or an all-black one (checked every 3 s). */
  captures?: EngineCaptureProblem[]
  /** Free space where recordings go, MB. */
  disk_free_mb?: number
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

/** Scene collections or profiles: which is in use, and all of them. */
export interface EngineShelf {
  current: string
  list: { id: string; name: string }[]
}
export type EngineShelfKind = 'collections' | 'profiles'

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
  | { what: 'program' | 'multiview'; screen?: number; on_top?: boolean }
  | { what: 'source'; name: string; screen?: number; on_top?: boolean }

/** The colour of a source's outline in the preview, by its item id: the app draws the same. */
export const FRAME_COLORS = [
  '#ff5a1f',
  '#33d4ff',
  '#a3e635',
  '#f472b6',
  '#facc15',
  '#a78bfa',
  '#2dd4bf',
  '#60a5fa',
] as const

export function frameColor(id: number): string {
  return FRAME_COLORS[((id % 8) + 8) % 8] as string
}

/** A box in the dashboard window (CSS pixels from its top-left corner). */
export interface PreviewRect {
  x: number
  y: number
  w: number
  h: number
  /** The page's visible height (`window.innerHeight`): where its top is inside the window. */
  vh?: number
  /** Where the canvas is inside the box (CSS pixels from its top-left). The box is then the
   * whole stage, and outlines of what's off the canvas show round it. */
  canvas?: { x: number; y: number; w: number; h: number }
  /** The page's colour round the canvas (0xRRGGBB), so the app's stage matches the theme. */
  bg?: number
  /** Where the page's menus and panels lie over the box (CSS pixels from its top-left), at
   * most 16: the app leaves its picture out there so they show, instead of hiding it all. */
  /** Menus and panels over the box, with their corner radius (`r`). */
  holes?: { x: number; y: number; w: number; h: number; r?: number }[]
  /** How much of the picture shows, 0 to 1 (missing: all): dimmed under a dialog's
   * backdrop, hidden while the window is resized. */
  opacity?: number
  /** A dark layer the app draws over the picture, 0 to 1: a dialog's backdrop dims it as it
   * dims the page round it. */
  shade?: number
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
    /** An empty scene at the end; in the vertical picture with `vertical`. */
    addScene: (name: string, vertical = false) =>
      c.request<void>(
        'POST',
        '/api/v1/studio/engine/scenes',
        vertical ? { name, vertical } : { name },
      ),
    /** Turns the vertical picture on with a first scene (nothing happens when it's on). */
    startVertical: (scene: string) =>
      c.request<void>('POST', '/api/v1/studio/engine/vertical', { scene }),
    /** Turns the vertical picture off: its scenes go. */
    stopVertical: () => c.request<void>('DELETE', '/api/v1/studio/engine/vertical'),
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
    setAudio: (name: string, a: EngineAudioChange) =>
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
    /** Streamlabs Desktop's scene collections on this computer. */
    streamlabsCollections: () =>
      c.request<EngineObsCollection[]>('GET', '/api/v1/studio/engine/streamlabs-collections'),
    /** Adds one of Streamlabs' collections as a new scene collection. */
    importStreamlabs: (id: string) =>
      c.request<EngineImportReport>('POST', '/api/v1/studio/engine/streamlabs-collections/import', {
        id,
      }),
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
    /**
     * Crops an item from the preview (OBS's Alt-drag on a handle): left, top, right, bottom in
     * the source's own pixels; what's left stays where it is on screen → the item.
     */
    setItemCrop: (
      scene: string,
      id: number,
      crop: { left: number; top: number; right: number; bottom: number; save?: boolean },
    ) =>
      c.request<EngineItem>(
        'PUT',
        `/api/v1/studio/engine/scenes/${enc(scene)}/items/${id}/crop`,
        crop,
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
    /** Scene collections or profiles. */
    shelf: (kind: EngineShelfKind) =>
      c.request<EngineShelf>('GET', `/api/v1/studio/engine/library/${kind}`),
    /** A new one (empty, or a copy of the one in use), switched to. */
    newShelf: (kind: EngineShelfKind, name: string, copy = false) =>
      c.request<{ id: string }>('POST', `/api/v1/studio/engine/library/${kind}`, { name, copy }),
    switchShelf: (kind: EngineShelfKind, id: string) =>
      c.request<{ id: string }>('PUT', `/api/v1/studio/engine/library/${kind}/current`, { id }),
    renameShelf: (kind: EngineShelfKind, id: string, name: string) =>
      c.request<void>('POST', `/api/v1/studio/engine/library/${kind}/${enc(id)}/rename`, { name }),
    removeShelf: (kind: EngineShelfKind, id: string) =>
      c.request<void>('DELETE', `/api/v1/studio/engine/library/${kind}/${enc(id)}`),
    /** The file (a collection as OBS writes it, or a profile's settings). */
    exportShelf: (kind: EngineShelfKind, id: string) =>
      c.request<Record<string, unknown>>(
        'GET',
        `/api/v1/studio/engine/library/${kind}/${enc(id)}/export`,
      ),
    /** A scene collection file as a new collection, switched to → what came in. */
    importCollection: (name: string, doc: unknown) =>
      c.request<EngineImportReport & { id: string }>(
        'POST',
        '/api/v1/studio/engine/library/collections/import',
        { name, doc },
      ),
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
    /** Every step Undo and Redo can take, newest first. */
    history: () =>
      c.request<{ undo: string[]; redo: string[] }>('GET', '/api/v1/studio/engine/history'),
    /** Outlines an item in the preview (and `also` these, picked with it), or nothing; with
     * `frames`, every source of the scene gets a thin outline in its own colour too
     * (`frameColor`). */
    select: (
      pick: { scene: string; id: number | null; frames?: boolean; also?: number[] } | null,
    ) =>
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
    /** Live captions: where they stand. */
    captions: () => c.request<EngineCaptions>('GET', '/api/v1/studio/engine/captions'),
    /** Shows macOS's speech recognition prompt (once). */
    askCaptions: () =>
      c.request<EngineCaptions>('PUT', '/api/v1/studio/engine/captions', { ask: true }),
    /** Listens to a Studio sound (`source`), or stops (null). */
    setCaptions: (source: string | null) =>
      c.request<EngineCaptions>(
        'PUT',
        '/api/v1/studio/engine/captions',
        source === null ? { on: false } : { on: true, source },
      ),
    /** The app in front and the apps open now (for a scene per game; Mac only for now). */
    apps: () =>
      c.request<{ front: string | null; running: string[] }>('GET', '/api/v1/studio/engine/apps'),
    /** Smart vertical: which item follows a face. */
    follow: () => c.request<EngineFollow>('GET', '/api/v1/studio/engine/vertical/follow'),
    /** Makes an item of a vertical scene follow the face in it, or stops (null). */
    setFollow: (to: { scene: string; item: number; what?: 'face' | 'action' } | null) =>
      c.request<EngineFollow>('PUT', '/api/v1/studio/engine/vertical/follow', to ?? {}),
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
    /** The app's log, newest last (stream keys and tokens already taken out). */
    log: (lines: number) =>
      c.request<{ file: string; lines: string[] }>(
        'GET',
        `/api/v1/studio/engine/log?lines=${lines}`,
      ),
    /** Shows the log file in Finder or Explorer. */
    showLog: () => c.request<null>('POST', '/api/v1/studio/engine/log/show'),
    /** Opens a web page in a window of its own in the app (a web panel the page won't frame). */
    webWindow: (name: string, url: string) =>
      c.request<{ ok: true }>('POST', '/api/v1/studio/engine/web-window', { name, url }),
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
      // `also`: what was set to start or stop with the stream but didn't, in words. Ending
      // answers null, or only `{ also }`.
      c.request<(EngineStreamStats & { also?: string }) | null>(
        'POST',
        '/api/v1/studio/engine/stream',
        { on },
      ),
    streamStats: () => c.request<EngineStreamStats | null>('GET', '/api/v1/studio/engine/stream'),
    /** Puts the live preview over the box, or takes it away (null). */
    /** The preview over the page's box; in Studio Mode, what's on air over `program`; the
     * vertical picture over `vertical`. */
    preview: (
      rect: PreviewRect | null,
      program: PreviewRect | null = null,
      vertical: PreviewRect | null = null,
    ) => c.request<void>('PUT', '/api/v1/studio/engine/preview', { rect, program, vertical }),
    /** Studio Mode on (its preview starts as what's on air) or off. */
    studioMode: (on: boolean) =>
      c.request<void>('PUT', '/api/v1/studio/engine/studio-mode', { on }),
    /** The scene Studio Mode's preview shows. */
    setPreview: (scene: string) =>
      c.request<void>('PUT', '/api/v1/studio/engine/studio-mode/preview', { scene }),
    /** Sends the preview on air (with a quick transition, or as a click on it would). */
    transitionNow: (quick?: EngineTransition) =>
      c.request<void>(
        'POST',
        '/api/v1/studio/engine/studio-mode/transition',
        quick ? { quick } : {},
      ),
    setQuickTransitions: (list: EngineTransition[]) =>
      c.request<void>('PUT', '/api/v1/studio/engine/quick-transitions', { list }),
    /** A new, empty group on top of a scene. */
    addGroup: (scene: string, name: string) =>
      c.request<EngineItem>('POST', `/api/v1/studio/engine/scenes/${enc(scene)}/items`, {
        group: name,
      }),
    /** A small picture of a scene as it looks now, `w` pixels wide (64 to 640) → a PNG data
     * URL (the Scenes grid's tiles, as OBS's multiview). */
    thumbnail: (scene: string, w = 256) =>
      c.request<{ image: string }>(
        'GET',
        `/api/v1/studio/engine/scenes/${enc(scene)}/thumbnail?w=${w}`,
      ),
    /** A new group holding these sources of the scene, each where it is on screen (OBS's
     * Group Selected Items) → the group. */
    groupItems: (scene: string, ids: number[], name: string) =>
      c.request<EngineItem>('POST', `/api/v1/studio/engine/scenes/${enc(scene)}/items`, {
        group: name,
        items: ids,
      }),
    /** A new, independent copy of a source on top of a scene (OBS's Paste (Duplicate)). */
    pasteCopy: (scene: string, name: string) =>
      c.request<EngineItem>('POST', `/api/v1/studio/engine/scenes/${enc(scene)}/items`, {
        existing: name,
        copy: true,
      }),
    /** Into a group of the scene, or out of its group (null). */
    setGroup: (scene: string, id: number, group: number | null) =>
      c.request<void>('PUT', `/api/v1/studio/engine/scenes/${enc(scene)}/items/${id}/group`, {
        group,
      }),
    /** Takes a group apart; its sources stay in the scene. */
    /** Moves a source to place `to` in its list (0 is the top: on top of everything). */
    itemOrder: (scene: string, id: number, to: number) =>
      c.request<void>('PUT', `/api/v1/studio/engine/scenes/${enc(scene)}/items/${id}/order`, {
        to,
      }),
    ungroup: (scene: string, id: number) =>
      c.request<void>('POST', `/api/v1/studio/engine/scenes/${enc(scene)}/items/${id}/ungroup`, {}),
    /** A video, playlist or slideshow's play controls (or, with nothing, where it is). */
    media: (name: string, what?: EngineMediaAct, seekMs?: number) =>
      c.request<EngineMedia>('POST', `/api/v1/studio/engine/sources/${enc(name)}/media`, {
        ...(what ? { do: what } : {}),
        ...(seekMs !== undefined ? { seek_ms: seekMs } : {}),
      }),
    /** Files sources use that aren't on this computer. */
    missingFiles: () =>
      c.request<EngineMissingFile[]>('GET', '/api/v1/studio/engine/missing-files'),
    /** Points a missing file's setting at `to`, or clears it (`to` empty). */
    replaceFile: (m: EngineMissingFile, to: string) =>
      c.request<void>('PUT', '/api/v1/studio/engine/missing-files', {
        source: m.source,
        parent: m.parent,
        kind: m.kind,
        key: m.key,
        path: m.path,
        to,
      }),
    /** Looks for the missing files by name in a folder → each found path's new place. */
    findMissing: (folder: string) =>
      c.request<{ found: Record<string, string> }>(
        'POST',
        '/api/v1/studio/engine/missing-files/search',
        { folder },
      ),
    /** OBS's replay buffer on or off. */
    replay: (on: boolean) =>
      c.request<{ active: boolean }>('POST', '/api/v1/studio/engine/replay', { on }),
    /** Saves the replay buffer's last seconds to a file. */
    saveReplay: () =>
      c.request<{ file: string | null }>('POST', '/api/v1/studio/engine/replay/save', {}),
    /** The virtual camera on (what's on air, or one scene or source) or off. */
    virtualCamera: (on: boolean, source?: string) =>
      c.request<{ active: boolean }>('POST', '/api/v1/studio/engine/virtualcam', {
        on,
        ...(source ? { source } : {}),
      }),
    /** The recording goes on in a new file. */
    recordSplit: () => c.request<void>('POST', '/api/v1/studio/engine/record/split', {}),
    /** A chapter marker here (MP4, MOV); empty names it by number. */
    recordChapter: (name = '') =>
      c.request<void>('POST', '/api/v1/studio/engine/record/chapter', { name }),
    /** Makes an MP4 beside a recording, in the background (progress in stats). */
    remux: (file: string) =>
      c.request<{ to: string }>('POST', '/api/v1/studio/engine/remux', { file }),
    /** An encoder's own options for these settings, and its values with defaults. */
    encoderOptions: (id: string, settings: Record<string, unknown>) =>
      c.request<{ options: EngineOption[]; values: EngineSettings }>(
        'POST',
        `/api/v1/studio/engine/encoders/${enc(id)}/options`,
        { settings },
      ),
    setStudioOptions: (options: EngineStudioOptions) =>
      c.request<void>('PUT', '/api/v1/studio/engine/studio-mode/options', options),
    /** Swaps the preview and what's on air, with a cut. */
    swapScenes: () => c.request<void>('POST', '/api/v1/studio/engine/studio-mode/swap', {}),
    /** Moves the T-bar (0 on air, 1 preview); `release` when let go. */
    tbar: (at: number, release = false) =>
      c.request<EngineTBar>('PUT', '/api/v1/studio/engine/studio-mode/tbar', { at, release }),
    /** Fades to black, or back. */
    fadeToBlack: () => c.request<{ black: boolean }>('POST', '/api/v1/studio/engine/black', {}),
    /** How an item appears when shown (or goes when hidden); null for at once. */
    setItemTransition: (
      scene: string,
      id: number,
      show: boolean,
      transition: EngineTransition | null,
    ) =>
      c.request<void>('PUT', `/api/v1/studio/engine/scenes/${enc(scene)}/items/${id}/transition`, {
        show,
        transition,
      }),
    setDeinterlace: (name: string, mode: EngineDeinterlace, topFieldFirst: boolean) =>
      c.request<void>('PUT', `/api/v1/studio/engine/sources/${enc(name)}/deinterlace`, {
        mode,
        top_field_first: topFieldFirst,
      }),
  }
}
