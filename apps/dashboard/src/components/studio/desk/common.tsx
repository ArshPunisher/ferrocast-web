// What every part of the Studio shares: the engine's API, the scene being shown and its
// sources and sounds, and the friendly names and icons for OBS's kinds of source and filter.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react'
import {
  AppWindow,
  ArrowsInLineVertical,
  ArrowsLeftRight,
  BellRinging,
  BoundingBox,
  Browser,
  CardsThree,
  ChatCircleText,
  CircleDashed,
  CopySimple,
  ClockCounterClockwise,
  Crop,
  Cube,
  Ear,
  Equalizer,
  FilmStrip,
  FolderSimple,
  FrameCorners,
  Globe,
  Keyboard,
  GridFour,
  Image as ImageIcon,
  Microphone,
  MicrophoneSlash,
  Monitor,
  MagicWand,
  Moon,
  Palette,
  Aperture,
  SelectionBackground,
  Shapes,
  ShieldCheck,
  SlidersHorizontal,
  Snowflake,
  Slideshow,
  Sparkle,
  SpeakerHigh,
  Stack,
  Swatches,
  TextT,
  Timer,
  UserFocus,
  UserSquare,
  UsersThree,
  VideoCamera,
  Waveform,
  Webcam,
  type Icon,
  Plugs,
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
  /** Counts undos and redos: what an open drawer reads again (its filters and settings). */
  undone: number
  selected: number | null
  /** Picks one source (or none), dropping any others picked with it. */
  select: (id: number | null) => void
  /** More sources picked with `selected` (⌘-click, Shift-click), as OBS's multi-select. */
  also: number[]
  /** ⌘-click: picks or unpicks `id` beside the others. Shift-click: picks every source in
   * `order` from the picked one to `id`. */
  pickMore: (id: number, how: 'toggle' | 'range', order?: number[]) => void
  /** Picks exactly these sources, the first as the main pick (a box dragged round them). */
  pickSet: (ids: number[]) => void
  /** The Sources panel's right-click menu for a source (or the empty list, null), so a
   * right-click on the preview opens the same one, as in OBS. */
  itemMenu: { current: ((e: React.MouseEvent, id: number | null) => void) | null }
  /** The source whose settings are open. */
  editing: string | null
  /** Opens a source's drawer (on `tab`, else its first), or closes it with null. */
  edit: (name: string | null, tab?: DrawerTab) => void
  /** The drawer tab asked for when it was opened. */
  editTab: DrawerTab | null
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

export interface DeskStatsStore {
  get: () => EngineStats | null
  set: (next: EngineStats | null) => void
  subscribe: (listener: () => void) => () => void
}

export function createDeskStatsStore(): DeskStatsStore {
  let current: EngineStats | null = null
  const listeners = new Set<() => void>()
  return {
    get: () => current,
    set: (next) => {
      if (current === next) return
      current = next
      for (const l of listeners) l()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

const Ctx = createContext<Desk | null>(null)
const StatsCtx = createContext<DeskStatsStore | null>(null)

/**
 * Where the Studio's bar (Record, Go live, the tools) is drawn: the page header's own row
 * when the screen gives one (the compact Studio, owner's pick "A joined", 10 Nov), else above
 * the panels as before.
 */
export const BarSlot = createContext<HTMLElement | null>(null)

export function DeskProvider({
  value,
  statsStore,
  children,
}: {
  value: Desk
  statsStore?: DeskStatsStore
  children: ReactNode
}) {
  const inner = <Ctx.Provider value={value}>{children}</Ctx.Provider>
  return statsStore ? <StatsCtx.Provider value={statsStore}>{inner}</StatsCtx.Provider> : inner
}

export function useDesk(): Desk {
  const d = useContext(Ctx)
  if (!d) throw new Error('useDesk outside the Studio')
  return d
}

export function useDeskOptional(): Desk | null {
  return useContext(Ctx)
}

const noopSubscribe = () => () => {}

export function useDeskStats(): EngineStats | null
export function useDeskStats<T>(
  select: (s: EngineStats | null) => T,
  isEqual?: (a: T, b: T) => boolean,
): T
export function useDeskStats<T = EngineStats | null>(
  select?: (s: EngineStats | null) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T | EngineStats | null {
  const store = useContext(StatsCtx)
  const desk = useContext(Ctx)
  const cache = useRef<{ has: boolean; raw: EngineStats | null; val: T } | null>(null)

  const getSnap = useCallback((): T | EngineStats | null => {
    const raw = store ? store.get() : (desk?.stats ?? null)
    if (!select) return raw
    const prev = cache.current
    if (prev && prev.has && prev.raw === raw) return prev.val
    const next = select(raw)
    if (prev && prev.has && isEqual(prev.val, next)) {
      prev.raw = raw
      return prev.val
    }
    cache.current = { has: true, raw, val: next }
    return next
  }, [store, desk?.stats, select, isEqual])

  return useSyncExternalStore(store ? store.subscribe : noopSubscribe, getSnap, getSnap)
}

export function useSetDeskStats(): (next: EngineStats) => void {
  const store = useContext(StatsCtx)
  const desk = useContext(Ctx)
  return useCallback(
    (next: EngineStats) => {
      if (store) store.set(next)
      else desk?.setStats(next)
    },
    [store, desk],
  )
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
  /** Guest links instead of a source to add (a guest adds their own when they join). */
  guest?: boolean
  /** Its own colour, when not its group's (cameras violet among the captures). */
  tone?: string
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
        tone: 'var(--fc-twitch)',
        kinds: ['macos-avcapture', 'av_capture_input_v2', 'dshow_input', 'v4l2_input'],
        device: ['device', 'video_device_id', 'device_id'],
      },
      {
        key: 'screen',
        label: 'Screen',
        icon: Monitor,
        kinds: ['screen_capture', 'monitor_capture', 'xshm_input'],
        settings: { type: 0 },
        // Ferrocore's keys (display on a Mac, monitor on Windows, screen on Linux), then OBS's.
        device: ['display', 'monitor', 'screen', 'display_uuid', 'monitor_id'],
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
        tone: 'var(--fc-twitch)',
        kinds: ['macos-avcapture-fast', 'av_capture_input_v2', 'dshow_input'],
        device: ['device', 'video_device_id'],
        fit: true,
      },
      {
        key: 'guest',
        label: 'Guest',
        icon: UsersThree,
        // A guest's camera plays in a media source.
        kinds: ['ffmpeg_source'],
        guest: true,
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
        kinds: ['coreaudio_input_capture', 'wasapi_input_capture', 'pulse_input_capture'],
        device: ['device_id'],
      },
      {
        key: 'desktop',
        label: 'Desktop sound',
        icon: SpeakerHigh,
        kinds: ['sck_audio_capture', 'wasapi_output_capture', 'pulse_output_capture'],
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
    tone: 'var(--fc-pink)',
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
      {
        key: 'web',
        label: 'Browser',
        icon: Browser,
        kinds: ['ferrocast_web', 'browser_source'],
        tone: 'var(--fc-accent-text)',
      },
      // Each replay saved plays here (OBS's Replay Source, built in).
      {
        key: 'replay',
        label: 'Instant replay',
        icon: ClockCounterClockwise,
        kinds: ['ferrocast_replay'],
      },
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
      // Exeldro's Source Clone, built in: pick what it shows in its settings.
      // A "Starting in 4:59" countdown (the OBS countdown plugins, built in).
      { key: 'countdown', label: 'Countdown', icon: Timer, kinds: ['ferrocast_countdown'] },
      // Text read from a web address every so often (the OBS URL/API source, built in).
      { key: 'webtext', label: 'Web text', icon: Globe, kinds: ['ferrocast_web_text'] },
      // Keys and mouse buttons lit while held (the OBS Input Overlay plugin, built in).
      { key: 'inputs', label: 'Keys on screen', icon: Keyboard, kinds: ['ferrocast_inputs'] },
      // Bars that move with the sound (the OBS audio visualizer plugins, built in).
      { key: 'bars', label: 'Sound bars', icon: Equalizer, kinds: ['ferrocast_visualizer'] },
      {
        key: 'clone',
        label: 'Copy of a source',
        icon: CopySimple,
        kinds: ['ferrocast_clone', 'source-clone'],
        device: ['clone'],
      },
    ],
  },
]

const ICONS: Record<string, Icon> = Object.fromEntries(
  KIND_GROUPS.flatMap((g) => g.entries.flatMap((e) => e.kinds.map((k) => [k, e.icon]))),
)
const TONES: Record<string, string> = Object.fromEntries(
  KIND_GROUPS.flatMap((g) => g.entries.flatMap((e) => e.kinds.map((k) => [k, e.tone ?? g.tone]))),
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
      className="grid shrink-0 place-items-center rounded-[6px]"
      style={
        {
          width: size,
          height: size,
          color: c,
          background: `color-mix(in oklab, ${c} 15%, transparent)`,
          // Its own colour again on a picked row in the Studio (styles.css, .fc-desk).
          '--kt': c,
        } as CSSProperties
      }
    >
      <I size={Math.round(size * 0.58)} weight="bold" />
    </span>
  )
}

/** A source's kind as a bare two-tone icon in its colour (the Sources list, owner's pick F2,
 * 11 Nov): a light fill inside a line, both in the kind's colour. */
export function KindGlyph({
  kind,
  size = 17,
  dim,
}: {
  kind: string
  size?: number
  /** Hidden: greyed. */
  dim?: boolean | undefined
}) {
  const I = kindIcon(kind)
  return (
    <I
      aria-hidden
      data-kind-glyph
      size={size}
      weight="duotone"
      className={dim ? 'shrink-0 opacity-45' : 'shrink-0'}
      style={{ color: dim ? 'var(--fc-text-3)' : kindTone(kind) }}
    />
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
/** A kind as the Add dialog names it ("Camera", "Colour"), not OBS's "Video Capture Device";
 *  null when the dialog doesn't have it. A Mac screen capture is a screen, a window or an
 *  app: "Screen capture" covers all three; a kind two entries share gets both names ("Camera
 *  or capture card"). */
export function friendlyKind(kind: string): string | null {
  if (kind === 'screen_capture') return 'Screen capture'
  const found = KIND_GROUPS.flatMap((g) => g.entries).filter((e) => e.kinds.includes(kind))
  if (found.length === 1) return found[0]?.label ?? null
  // One kind for two entries (a Mac camera or capture card): both names.
  if (found.length === 2) return `${found[0]?.label} or ${found[1]?.label.toLowerCase()}`
  return null
}

export function pickKind(e: KindEntry, kinds: EngineKinds | null): string | null {
  if (e.scene) return 'scene'
  const have = new Set(kinds?.inputs.map((k) => k.id))
  return e.kinds.find((k) => have.has(k)) ?? null
}

/** The source drawer's tabs. */
/** The drawer's tabs: Sound & filters, Settings. `filters` opens the first one at its filters. */
export type DrawerTab = 'sound' | 'filters' | 'settings' | 'position'

/** Sources with sound and no picture: they get no picture filters (every other source has a
 * picture, and a screen or window capture may have sound too). */
export const SOUND_ONLY = new Set([
  'coreaudio_input_capture',
  'coreaudio_output_capture',
  'sck_audio_capture',
  'wasapi_input_capture',
  'wasapi_output_capture',
  'wasapi_process_output_capture',
  'pulse_input_capture',
  'pulse_output_capture',
  'alsa_input_capture',
  'jack_output_capture',
])

/** Friendly filters by what they're for; every other OBS filter is under "More". */
export interface FilterEntry {
  kinds: string[]
  label: string
  help: string
  audio?: boolean
  /** Its picture in the drawer. */
  icon: Icon
  /** What it starts with when added (else its kind's defaults). */
  settings?: Record<string, unknown>
}

export const FILTERS: FilterEntry[] = [
  {
    kinds: ['noise_suppress_filter_v2', 'noise_suppress_filter'],
    label: 'Remove background noise',
    help: 'Fans, keyboards, hum.',
    audio: true,
    icon: Waveform,
  },
  {
    kinds: ['ferrocast_deepfilter'],
    label: 'Strong noise removal',
    help: 'Loud keyboards, busy rooms. Keeps your voice natural.',
    audio: true,
    icon: Ear,
  },
  {
    kinds: ['ferrocast_vst'],
    label: 'VST plugin',
    help: 'A sound plugin of your own, kept apart so it can’t stop your stream.',
    audio: true,
    icon: Plugs,
  },
  {
    kinds: ['noise_gate_filter'],
    label: 'Cut silence',
    help: 'Mutes the mic between words.',
    audio: true,
    icon: MicrophoneSlash,
  },
  {
    kinds: ['compressor_filter'],
    label: 'Even out loud moments',
    help: 'Keeps shouts from blasting.',
    audio: true,
    icon: ArrowsInLineVertical,
  },
  {
    kinds: ['gain_filter'],
    label: 'Make it louder',
    help: 'Boosts a quiet mic.',
    audio: true,
    icon: SpeakerHigh,
  },
  {
    kinds: ['limiter_filter'],
    label: 'Stop clipping',
    help: 'Never goes over a ceiling.',
    audio: true,
    icon: ShieldCheck,
  },
  {
    kinds: ['basic_eq_filter'],
    label: 'Bass, mid and treble',
    help: 'A 3-band equaliser.',
    audio: true,
    icon: SlidersHorizontal,
  },
  {
    kinds: ['expander_filter'],
    label: 'Quieten the room',
    help: 'Lowers sound between words.',
    audio: true,
    icon: Moon,
  },
  {
    kinds: ['upward_compressor_filter'],
    label: 'Lift quiet sounds',
    help: 'Brings up soft speech without raising the loud parts.',
    audio: true,
    icon: Moon,
  },
  {
    kinds: ['chroma_key_filter_v2', 'chroma_key_filter'],
    label: 'Green screen',
    help: 'Removes a green or blue background.',
    icon: UserSquare,
  },
  { kinds: ['crop_filter'], label: 'Crop', help: 'Trims the edges.', icon: Crop },
  {
    kinds: ['ferrocast_rounded_corners'],
    label: 'Rounded corners',
    help: 'Rounds its corners, like a webcam frame.',
    icon: FrameCorners,
  },
  {
    kinds: ['ferrocast_remove_background'],
    label: 'Remove background',
    help: 'Takes out or blurs what’s behind you. No green screen.',
    icon: UserFocus,
  },
  {
    kinds: ['ferrocast_border'],
    label: 'Border',
    help: 'A coloured edge, square or rounded.',
    icon: BoundingBox,
  },
  {
    kinds: ['ferrocast_shadow'],
    label: 'Shadow and glow',
    help: 'Lifts it off the scene.',
    icon: SelectionBackground,
  },
  {
    kinds: ['ferrocast_shape'],
    label: 'Shape',
    help: 'Circle, hexagon, diamond, star or heart.',
    icon: Shapes,
  },
  {
    kinds: ['ferrocast_blur_area'],
    label: 'Blur or pixelate an area',
    help: 'Hides a part of it.',
    icon: GridFour,
  },
  {
    // A photo app's sliders, on the graphics card (owner, 15 Nov).
    kinds: ['ferrocast_adjust'],
    label: 'Adjust colour',
    help: 'Exposure, contrast, shadows and warmth, like a photo app.',
    icon: Aperture,
  },
  {
    kinds: ['ferrocast_look'],
    label: 'Colour look',
    help: 'Warm, cool, cinematic or black and white.',
    icon: Swatches,
  },
  {
    kinds: ['color_filter_v2', 'color_filter'],
    label: 'OBS colour correction',
    help: 'OBS’s own sliders, as in scenes made in OBS.',
    icon: Palette,
  },
  {
    kinds: ['sharpness_filter_v2', 'sharpness_filter'],
    label: 'Sharpen',
    help: 'Crisper edges.',
    icon: Sparkle,
  },
  {
    kinds: ['mask_filter_v2', 'mask_filter'],
    label: 'Shape or mask',
    help: 'Rounds or cuts it with an image.',
    icon: CircleDashed,
  },
  {
    kinds: ['scroll_filter'],
    label: 'Scroll',
    help: 'Moves it sideways or up, on a loop.',
    icon: ArrowsLeftRight,
  },
  {
    // The shader gallery (OBS's Shaderfilter, built in): a ready-made look to start with.
    kinds: ['ferrocast_shader'],
    label: 'Effects',
    help: 'CRT, pixelate, glitch, old film and more.',
    icon: MagicWand,
    settings: { preset: 'crt', param1: 0.6, param2: 0.5 },
  },
  {
    kinds: ['ferrocast_freeze', 'freeze_filter'],
    label: 'Freeze',
    help: 'Holds the picture still. Switch it off to move again.',
    icon: Snowflake,
  },
  {
    // OBS's Render Delay (pictures only) and Video Delay Async (pictures and sound).
    kinds: ['ferrocast_video_delay', 'gpu_delay', 'async_delay_filter'],
    label: 'Video delay',
    help: 'Shows its picture a little late, to line a fast camera up with a slow capture card.',
    icon: Timer,
    settings: { delay_ms: 200, audio: false },
  },
]

/** Filters with nothing to set: their row is the whole of them (no body, no Reset). */
const TONE_OF_FILTER: Record<string, string> = {
  'Green screen': 'var(--fc-molten-text)',
  'Remove background': 'var(--fc-molten-text)',
  Crop: 'var(--fc-accent-text)',
  'Blur or pixelate an area': 'var(--fc-accent-text)',
  Sharpen: 'var(--fc-accent-text)',
  'Rounded corners': 'var(--fc-warn)',
  Border: 'var(--fc-warn)',
  'Shadow and glow': 'var(--fc-warn)',
  Shape: 'var(--fc-warn)',
  'Shape or mask': 'var(--fc-warn)',
  'Colour look': 'var(--fc-twitch)',
  Colour: 'var(--fc-twitch)',
  Scroll: 'var(--fc-ok)',
  Freeze: 'var(--fc-ok)',
  Effects: 'var(--fc-teal)',
}

/**
 * A filter's colour in the drawer, by what it does (owner's pick, design A, 10 Nov): keying
 * orange, picture blue, shape yellow, colour violet, motion and sound green, effects teal;
 * OBS's own grey.
 */
export function filterTone(e: FilterEntry | undefined): string {
  if (!e) return 'var(--fc-text-3)'
  if (e.audio) return 'var(--fc-ok)'
  return TONE_OF_FILTER[e.label] ?? 'var(--fc-accent-text)'
}

export const NO_FORM = new Set(['ferrocast_freeze', 'freeze_filter'])

export const FILTER_LABEL: Record<string, string> = Object.fromEntries(
  FILTERS.flatMap((f) => f.kinds.map((k) => [k, f.label])),
)

/** A filter kind's entry above, when it's one of the friendly ones. */
export const FILTER_OF: Record<string, FilterEntry> = Object.fromEntries(
  FILTERS.flatMap((f) => f.kinds.map((k) => [k, f])),
)
