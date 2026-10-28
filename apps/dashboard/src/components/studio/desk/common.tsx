// What every part of the Studio shares: the engine's API, the scene being shown and its
// sources and sounds, and the friendly names and icons for OBS's kinds of source and filter.

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import {
  AppWindow,
  BellRinging,
  Browser,
  CardsThree,
  ChatCircleText,
  Cube,
  FilmStrip,
  FolderSimple,
  Image as ImageIcon,
  Microphone,
  Monitor,
  Palette,
  Slideshow,
  SpeakerHigh,
  Stack,
  TextT,
  VideoCamera,
  Waveform,
  Webcam,
  type Icon,
} from '@phosphor-icons/react'
import {
  studioEngineApi,
  type EngineAudio,
  type EngineItem,
  type EngineKinds,
  type EngineScene,
  type EngineScenes,
  type EngineScreen,
  type EngineStats,
  type EngineTransform,
  type StudioSettings,
} from '@ferrocast/api'
import { useClient, type Resource } from '../../../lib/hooks'

export type EngineApi = ReturnType<typeof studioEngineApi>

export function useEngine(): EngineApi {
  const client = useClient()
  return useMemo(() => studioEngineApi(client), [client])
}

export interface Desk {
  api: EngineApi
  scenes: Resource<EngineScenes>
  /** The scene the Sources and Audio panels show: the edited picture's (Studio Mode's
   * preview, else what's on air). */
  scene: string
  /** The picture the Scenes, Sources and Audio panels edit (the vertical one while it's on and
   * picked). */
  canvas: 'main' | 'vertical'
  setCanvas: (c: 'main' | 'vertical') => void
  /** The edited picture's size in pixels (null until the engine says). */
  size: { width: number; height: number } | null
  /** The edited picture's scenes, in order (the vertical picture's while it's picked): what
   * the panels offer for "this picture" (Plays in, the mixer's All, scenes in a scene). */
  pictureScenes: EngineScene[]
  /** The scene on air in the edited picture. */
  pictureCurrent: string
  /** Every scene in both pictures (names are one list): for name clashes, shortcuts and files. */
  allScenes: EngineScene[]
  items: Resource<EngineItem[]>
  audio: Resource<EngineAudio[]>
  kinds: Resource<EngineKinds>
  /** Studio settings, for what the desk itself honours (snapping, the "are you sure?"s). */
  prefs: Resource<StudioSettings>
  /** Reads scenes, sources and sounds again after a change. */
  refresh: () => void
  selected: number | null
  /** Picks one source (or none), dropping any others picked with it. */
  select: (id: number | null) => void
  /** More sources picked with `selected` (⌘-click, Shift-click), as OBS's multi-select. */
  also: number[]
  /** ⌘-click: picks or unpicks `id` beside the others. Shift-click: picks every source in
   * `order` from the picked one to `id`. */
  pickMore: (id: number, how: 'toggle' | 'range', order?: number[]) => void
  /** The Sources panel's right-click menu for a source (or the empty list, null), so a
   * right-click on the preview opens the same one, as in OBS. */
  itemMenu: { current: ((e: React.MouseEvent, id: number | null) => void) | null }
  /** The source whose settings are open. */
  editing: string | null
  edit: (name: string | null) => void
  /** "Add a source" is open, at this kind (an entry key from KIND_GROUPS, or "" for the first). */
  adding: string | null
  setAdding: (at: string | null) => void
  /** The engine, stream and recording now (read every second by the bar above). */
  stats: EngineStats | null
  setStats: (s: EngineStats) => void
  /** A source copied from a menu, to paste into another scene (as the same source). */
  clip: string | null
  setClip: (name: string | null) => void
  /** The source whose filters were copied, to paste onto another. */
  filterClip: string | null
  setFilterClip: (name: string | null) => void
  /** Bumped when the scene collections or profiles change (the library bar reads again). */
  library: number
  bumpLibrary: () => void
  /** The item whose Edit Transform is open. */
  transforming: { scene: string; id: number; name: string } | null
  setTransforming: (t: { scene: string; id: number; name: string } | null) => void
  /** A transform copied from a menu, to paste onto another item. */
  transformClip: EngineTransform | null
  setTransformClip: (t: EngineTransform | null) => void
  /** The displays a full-screen projector can go on (empty outside the app). */
  screens: Resource<EngineScreen[]>
  /** Opens Studio settings, at a page ("stream", "audio", "picture", "record", "keys",
   * "advanced"). */
  openSettings: (page?: string) => void
}

const Ctx = createContext<Desk | null>(null)

export function DeskProvider({ value, children }: { value: Desk; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useDesk(): Desk {
  const d = useContext(Ctx)
  if (!d) throw new Error('useDesk outside the Studio')
  return d
}

/** One entry in "Add a source": a friendly name for an OBS kind (macOS or Windows id). */
export interface KindEntry {
  key: string
  label: string
  icon: Icon
  /** The OBS kinds that do it, first available wins (macOS, then Windows). */
  kinds: string[]
  /** Settings it starts with (on top of OBS's defaults). */
  settings?: Record<string, unknown>
  /** The option listing the devices (cameras, mics, screens) to pick from. */
  device?: string[]
  /** Added fitted to the screen. */
  fit?: boolean
  /** Adds an existing scene instead of a new source. */
  scene?: boolean
  /** Lists Ferrocast's overlays to add as web pages. */
  overlays?: boolean
}

export interface KindGroup {
  label: string
  /** The group's colour (a CSS colour), on its icons. */
  tone: string
  entries: KindEntry[]
}

export const KIND_GROUPS: KindGroup[] = [
  {
    label: 'Capture',
    tone: 'var(--fc-accent-text)',
    entries: [
      {
        key: 'camera',
        label: 'Camera',
        icon: Webcam,
        kinds: ['macos-avcapture', 'av_capture_input_v2', 'dshow_input'],
        device: ['device', 'video_device_id'],
      },
      {
        key: 'screen',
        label: 'Screen',
        icon: Monitor,
        kinds: ['screen_capture', 'monitor_capture'],
        settings: { type: 0 },
        device: ['display_uuid', 'monitor_id'],
        fit: true,
      },
      {
        key: 'window',
        label: 'Window or game',
        icon: AppWindow,
        kinds: ['screen_capture', 'game_capture', 'window_capture'],
        settings: { type: 1 },
        device: ['window', 'window'],
        fit: true,
      },
      {
        key: 'card',
        label: 'Capture card',
        icon: VideoCamera,
        kinds: ['macos-avcapture-fast', 'dshow_input'],
        device: ['device', 'video_device_id'],
        fit: true,
      },
    ],
  },
  {
    label: 'Sound',
    tone: 'var(--fc-ok)',
    entries: [
      {
        key: 'mic',
        label: 'Microphone',
        icon: Microphone,
        kinds: ['coreaudio_input_capture', 'wasapi_input_capture'],
        device: ['device_id'],
      },
      {
        key: 'desktop',
        label: 'Desktop sound',
        icon: SpeakerHigh,
        kinds: ['sck_audio_capture', 'wasapi_output_capture'],
        settings: { type: 0 },
      },
      {
        key: 'app',
        label: 'App sound',
        icon: Waveform,
        kinds: ['sck_audio_capture', 'wasapi_process_output_capture'],
        settings: { type: 1 },
        device: ['application', 'window'],
      },
    ],
  },
  {
    label: 'Ferrocast',
    tone: 'var(--fc-molten-text)',
    entries: [
      {
        key: 'overlay',
        label: 'Your overlays',
        icon: Stack,
        kinds: ['ferrocast_web', 'browser_source'],
        overlays: true,
        fit: true,
      },
    ],
  },
  {
    label: 'Media',
    tone: 'var(--fc-twitch)',
    entries: [
      { key: 'image', label: 'Image', icon: ImageIcon, kinds: ['image_source'] },
      { key: 'video', label: 'Video', icon: FilmStrip, kinds: ['ffmpeg_source', 'vlc_source'] },
      {
        key: 'slides',
        label: 'Slideshow',
        icon: Slideshow,
        kinds: ['slideshow_v2', 'slideshow'],
        fit: true,
      },
      { key: 'web', label: 'Browser', icon: Browser, kinds: ['ferrocast_web', 'browser_source'] },
    ],
  },
  {
    label: 'Build',
    tone: 'var(--fc-warn)',
    entries: [
      {
        key: 'text',
        label: 'Text',
        icon: TextT,
        kinds: ['text_ft2_source_v2', 'text_gdiplus_v3', 'text_gdiplus_v2'],
        settings: { text: 'Your text' },
      },
      {
        key: 'color',
        label: 'Colour',
        icon: Palette,
        kinds: ['color_source_v3', 'color_source'],
        fit: true,
      },
      { key: 'scene', label: 'Scene', icon: CardsThree, kinds: ['scene'], scene: true },
    ],
  },
]

const ICONS: Record<string, Icon> = Object.fromEntries(
  KIND_GROUPS.flatMap((g) => g.entries.flatMap((e) => e.kinds.map((k) => [k, e.icon]))),
)
const TONES: Record<string, string> = Object.fromEntries(
  KIND_GROUPS.flatMap((g) => g.entries.flatMap((e) => e.kinds.map((k) => [k, g.tone]))),
)
/** Colour for the kinds "More" lists and anything unknown. */
export const PLAIN_TONE = 'var(--fc-text-2)'

/** A kind's colour: its group's in "Add a source" (sound kinds green). */
export function kindTone(kind: string): string {
  if (kind === 'group' || kind === 'scene') return 'var(--fc-warn)'
  return TONES[kind] ?? (kind.includes('audio') ? 'var(--fc-ok)' : PLAIN_TONE)
}

/** A kind's icon on a soft square of its colour. */
export function KindTile({
  kind,
  icon,
  tone,
  size = 28,
  dim,
}: {
  kind?: string | undefined
  icon?: Icon | undefined
  tone?: string | undefined
  size?: number
  /** Hidden or muted: greyed. */
  dim?: boolean | undefined
}) {
  const I = icon ?? kindIcon(kind ?? '')
  const c = dim ? 'var(--fc-text-3)' : (tone ?? kindTone(kind ?? ''))
  return (
    <span
      aria-hidden
      data-kind-tile
      className="grid shrink-0 place-items-center rounded-[8px]"
      style={{
        width: size,
        height: size,
        color: c,
        background: `color-mix(in oklab, ${c} 15%, transparent)`,
      }}
    >
      <I size={Math.round(size * 0.58)} weight="bold" />
    </span>
  )
}

/** The icon for a source's kind (sound kinds share the mic's). */
export function kindIcon(kind: string): Icon {
  if (kind === 'group') return FolderSimple
  if (kind === 'scene') return CardsThree
  if (kind.includes('alert')) return BellRinging
  if (kind.includes('chat')) return ChatCircleText
  if (kind === 'ferrocast_web') return Browser
  return ICONS[kind] ?? (kind.includes('audio') ? Waveform : Cube)
}

/** The first of these kinds this computer's OBS has. */
export function pickKind(e: KindEntry, kinds: EngineKinds | null): string | null {
  if (e.scene) return 'scene'
  const have = new Set(kinds?.inputs.map((k) => k.id))
  return e.kinds.find((k) => have.has(k)) ?? null
}

/** Friendly filters by what they're for; every other OBS filter is under "More". */
export interface FilterEntry {
  kinds: string[]
  label: string
  help: string
  audio?: boolean
}

export const FILTERS: FilterEntry[] = [
  {
    kinds: ['noise_suppress_filter_v2', 'noise_suppress_filter'],
    label: 'Remove background noise',
    help: 'Fans, keyboards, hum.',
    audio: true,
  },
  {
    kinds: ['noise_gate_filter'],
    label: 'Cut silence',
    help: 'Mutes the mic between words.',
    audio: true,
  },
  {
    kinds: ['compressor_filter'],
    label: 'Even out loud moments',
    help: 'Keeps shouts from blasting.',
    audio: true,
  },
  { kinds: ['gain_filter'], label: 'Make it louder', help: 'Boosts a quiet mic.', audio: true },
  {
    kinds: ['limiter_filter'],
    label: 'Stop clipping',
    help: 'Never goes over a ceiling.',
    audio: true,
  },
  {
    kinds: ['basic_eq_filter'],
    label: 'Bass, mid and treble',
    help: 'A 3-band equaliser.',
    audio: true,
  },
  {
    kinds: ['expander_filter'],
    label: 'Quieten the room',
    help: 'Lowers sound between words.',
    audio: true,
  },
  {
    kinds: ['chroma_key_filter_v2', 'chroma_key_filter'],
    label: 'Green screen',
    help: 'Removes a green or blue background.',
  },
  { kinds: ['crop_filter'], label: 'Crop', help: 'Trims the edges.' },
  {
    kinds: ['color_filter_v2', 'color_filter'],
    label: 'Colour',
    help: 'Brightness, contrast, saturation.',
  },
  { kinds: ['sharpness_filter_v2', 'sharpness_filter'], label: 'Sharpen', help: 'Crisper edges.' },
  {
    kinds: ['mask_filter_v2', 'mask_filter'],
    label: 'Shape or mask',
    help: 'Rounds or cuts it with an image.',
  },
  { kinds: ['scroll_filter'], label: 'Scroll', help: 'Moves it sideways or up, on a loop.' },
]

export const FILTER_LABEL: Record<string, string> = Object.fromEntries(
  FILTERS.flatMap((f) => f.kinds.map((k) => [k, f.label])),
)
