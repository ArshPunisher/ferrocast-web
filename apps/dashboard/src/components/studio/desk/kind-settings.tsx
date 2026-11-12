// The Settings tab laid out per kind of source (owner's pick, design A, 10 Nov: Projects/
// ferrocast/design/source-drawer/types.html): coloured sections in the order people think of
// them (a countdown's Timing, Words, Look), a live picture for cameras, screens and web text,
// a file row and a player for videos, key layouts drawn as keys. Every option the engine
// describes still shows: what a layout doesn't name goes under More.

import { useEffect, useState, type ReactNode } from 'react'
import {
  Camera,
  Clock,
  Code,
  Copy,
  DotsThreeCircle,
  FileVideo,
  FolderOpen,
  Globe,
  Image as ImageIcon,
  Keyboard,
  Link,
  Microphone,
  Monitor,
  Palette,
  Pause,
  Play,
  Repeat,
  Rewind,
  ShareNetwork,
  SlidersHorizontal,
  SpeakerHigh,
  SquaresFour,
  Swap,
  TextAa,
  WarningCircle,
  type Icon as PhIcon,
} from '@phosphor-icons/react'
import type { EngineMedia, EngineOption, EngineSettings, EngineSourceStatus } from '@ferrocast/api'
import { IconButton, Switch, cx } from '@ferrocast/ui'
import { inDesktopApp } from '../../../lib/external'
import { done, useAction } from '../../../lib/hooks'
import { useDesk, useEngine } from './common'
import { Band, NumBox, Pad, Prop } from './drawer-kit'
import { OptionsForm, valueOf } from './options'

/** `@` entries are drawn by hand: the countdown's length, a video's file and player, a key
 *  layout picker. */
type Key = string
interface Section {
  title: string
  icon: PhIcon
  tone: string
  keys: Key[]
}
interface Layout {
  /** A live picture of the source on top. */
  preview?: boolean
  sections: Section[]
  /** Clearer names (and tips) than the engine's for its options. */
  words?: Record<string, { label: string; help?: string; suffix?: string }>
  /** Options never shown (always on, or set by the app itself). */
  hide?: string[]
}

const ARC = 'var(--fc-accent-text)'
const MOLTEN = 'var(--fc-molten-text)'
const VIOLET = 'var(--fc-twitch)'
const GREEN = 'var(--fc-ok)'
const YELLOW = 'var(--fc-warn)'

const LOOK: Section = {
  title: 'Look',
  icon: Palette,
  tone: VIOLET,
  keys: ['font', 'color1', 'color2', 'outline', 'drop_shadow'],
}
const LOOK_WORDS = {
  color1: { label: 'Colour' },
  color2: { label: 'Second colour', help: 'The text fades from the first colour to this one.' },
  drop_shadow: { label: 'Drop shadow' },
}

const CAMERA: Layout = {
  preview: true,
  sections: [
    {
      title: 'Device',
      icon: Camera,
      tone: ARC,
      keys: ['device', 'video_device_id', 'device_id', 'resolution', 'fps'],
    },
    { title: 'Picture', icon: SlidersHorizontal, tone: VIOLET, keys: ['@mirror'] },
  ],
  words: {
    device: { label: 'Camera' },
    video_device_id: { label: 'Camera' },
    device_id: { label: 'Camera' },
    resolution: {
      label: 'Size',
      help: 'What to ask the camera for. One it can’t do gives the nearest it can.',
    },
    fps: { label: 'Frame rate' },
  },
}
const MIC: Layout = {
  sections: [{ title: 'Device', icon: Microphone, tone: GREEN, keys: ['device_id', 'device'] }],
  words: { device_id: { label: 'Microphone' }, device: { label: 'Microphone' } },
}
const DESKTOP_SOUND: Layout = {
  sections: [
    {
      title: 'What it hears',
      icon: SpeakerHigh,
      tone: GREEN,
      keys: ['type', 'application', 'device_id'],
    },
  ],
  words: {
    type: { label: 'Hear' },
    application: { label: 'App' },
    device_id: { label: 'Device' },
  },
}
const SCREEN: Layout = {
  preview: true,
  sections: [
    {
      title: 'What to show',
      icon: Monitor,
      tone: ARC,
      keys: ['monitor', 'screen', 'window', 'capture_cursor', 'cursor', 'show_cursor'],
    },
  ],
  words: {
    monitor: { label: 'Screen' },
    screen: { label: 'Screen' },
    capture_cursor: { label: 'Show cursor' },
    cursor: { label: 'Show cursor' },
    show_cursor: { label: 'Show cursor' },
  },
}

const LAYOUTS: Record<string, Layout> = {
  av_capture_input: CAMERA,
  av_capture_input_v2: CAMERA,
  dshow_input: CAMERA,
  v4l2_input: CAMERA,
  coreaudio_input_capture: MIC,
  wasapi_input_capture: MIC,
  pulse_input_capture: MIC,
  alsa_input_capture: MIC,
  sck_audio_capture: DESKTOP_SOUND,
  coreaudio_output_capture: DESKTOP_SOUND,
  wasapi_output_capture: DESKTOP_SOUND,
  pulse_output_capture: DESKTOP_SOUND,
  monitor_capture: SCREEN,
  xshm_input: SCREEN,
  window_capture: SCREEN,
  ffmpeg_source: {
    sections: [
      { title: 'File', icon: FileVideo, tone: VIOLET, keys: ['@media'] },
      {
        title: 'Playback',
        icon: Repeat,
        tone: GREEN,
        keys: ['looping', 'restart_on_activate', 'speed_percent', 'close_when_inactive'],
      },
    ],
    words: {
      looping: { label: 'Loop' },
      restart_on_activate: {
        label: 'Restart on show',
        help: 'Plays from the start each time it shows.',
      },
      speed_percent: { label: 'Speed' },
      close_when_inactive: {
        label: 'Close if hidden',
        help: 'Lets go of the file while it isn’t shown.',
      },
    },
    hide: ['is_local_file', 'local_file'],
  },
  vlc_source: {
    sections: [
      { title: 'Playlist', icon: FileVideo, tone: VIOLET, keys: ['playlist'] },
      { title: 'Playback', icon: Repeat, tone: GREEN, keys: ['loop', 'shuffle'] },
    ],
    words: { loop: { label: 'Loop' }, shuffle: { label: 'Shuffle' } },
  },
  image_source: {
    preview: true,
    sections: [{ title: 'File', icon: ImageIcon, tone: VIOLET, keys: ['file'] }],
    words: {
      file: { label: 'Picture' },
      unload: { label: 'Free when hidden', help: 'Frees its memory while it isn’t shown.' },
      linear_alpha: { label: 'Linear see-through' },
    },
  },
  ...Object.fromEntries(
    ['slideshow', 'slideshow_v2', 'image_slide_show'].map((k) => [
      k,
      {
        sections: [
          { title: 'Pictures', icon: ImageIcon, tone: VIOLET, keys: ['files'] },
          {
            title: 'Playback',
            icon: Repeat,
            tone: GREEN,
            keys: ['slide_time', 'transition', 'transition_speed', 'loop', 'randomize'],
          },
        ],
        words: {
          slide_time: { label: 'Each picture' },
          transition_speed: { label: 'Change takes' },
          randomize: { label: 'Shuffle' },
        },
      } satisfies Layout,
    ]),
  ),
  ...Object.fromEntries(
    ['text_ft2_source', 'text_ft2_source_v2'].map((k) => [
      k,
      {
        sections: [
          {
            title: 'Words',
            icon: TextAa,
            tone: MOLTEN,
            keys: ['text', 'from_file', 'text_file'],
          },
          { ...LOOK, keys: [...LOOK.keys, 'align', 'bk_color', 'bk_opacity'] },
        ],
        words: {
          ...LOOK_WORDS,
          bk_color: { label: 'Background' },
          bk_opacity: {
            label: 'Its opacity',
            help: 'How solid the box behind the words is; 0 is none.',
          },
          from_file: { label: 'From a file' },
          text_file: { label: 'Its file' },
          antialiasing: { label: 'Smooth edges' },
          custom_width: { label: 'Width' },
          word_wrap: { label: 'Wrap lines' },
        },
      } satisfies Layout,
    ]),
  ),
  ferrocast_countdown: {
    sections: [
      { title: 'Timing', icon: Clock, tone: ARC, keys: ['mode', '@length', 'until'] },
      { title: 'Words', icon: TextAa, tone: MOLTEN, keys: ['before', 'end'] },
      LOOK,
    ],
    words: { ...LOOK_WORDS, until: { label: 'Time of day', help: 'Like 21:30.' } },
    hide: ['minutes', 'seconds'],
  },
  ferrocast_web_text: {
    preview: true,
    sections: [
      {
        title: 'Where it reads',
        icon: Link,
        tone: ARC,
        keys: ['@read', 'url', 'path', 'every'],
      },
      { title: 'Words', icon: TextAa, tone: MOLTEN, keys: ['words'] },
      LOOK,
    ],
    words: {
      ...LOOK_WORDS,
      path: { label: 'Value', help: 'Where the value is in the reply, like data.viewers.' },
      words: { label: 'Shown as', help: '{} is where the value goes.' },
    },
  },
  ferrocast_inputs: {
    sections: [
      { title: 'Layout', icon: SquaresFour, tone: YELLOW, keys: ['@layouts', 'keys', 'size'] },
      {
        title: 'Colours',
        icon: Palette,
        tone: VIOLET,
        keys: ['color_rest', 'color_held', 'color_text'],
      },
    ],
    words: {
      keys: { label: 'Your own', help: 'Rows split by /, like Q W E / A S D.' },
      color_held: { label: 'Pressed' },
    },
    hide: ['layout'],
  },
  ...Object.fromEntries(
    ['color_source', 'color_source_v2', 'color_source_v3'].map((k) => [
      k,
      {
        sections: [
          { title: 'Look', icon: Palette, tone: VIOLET, keys: ['color', 'width', 'height'] },
        ],
        words: { color: { label: 'Colour' } },
      } satisfies Layout,
    ]),
  ),
  ferrocast_visualizer: {
    sections: [
      { title: 'Sound', icon: SpeakerHigh, tone: GREEN, keys: ['source'] },
      {
        title: 'Look',
        icon: Palette,
        tone: VIOLET,
        keys: ['bars', 'color', 'mirror', 'width', 'height'],
      },
    ],
    words: { color: { label: 'Colour' }, bars: { label: 'Bars', suffix: 'bars' } },
  },
  ndi_source: {
    sections: [
      { title: 'From the network', icon: ShareNetwork, tone: ARC, keys: ['ndi_source_name'] },
    ],
    words: {
      ndi_source_name: {
        label: 'Source',
        help: 'Computers on your network sending NDI. None? Check NDI is installed and on.',
      },
    },
  },
  ferrocast_clone: {
    sections: [{ title: 'Copy of', icon: Copy, tone: ARC, keys: ['clone', 'filters'] }],
    words: { clone: { label: 'Source' }, filters: { label: 'With its filters' } },
  },
  ferrocast_replay: {
    sections: [{ title: 'When a replay is saved', icon: Swap, tone: GREEN, keys: ['switch'] }],
    words: {
      switch: {
        label: 'Show its scene',
        help: 'Switches to this scene while the replay plays, then back.',
      },
    },
  },
  ...Object.fromEntries(
    ['browser_source', 'ferrocast_web'].map((k) => [
      k,
      {
        sections: [
          {
            title: 'Page',
            icon: Globe,
            tone: ARC,
            keys: ['is_local_file', 'url', '@page', 'local_file', 'width', 'height', 'fps'],
          },
          { title: 'Your own style', icon: Code, tone: VIOLET, keys: ['css'] },
        ],
        words: {
          is_local_file: { label: 'A file here' },
          url: { label: 'Address' },
          local_file: { label: 'File' },
          fps: { label: 'Frame rate' },
          css: { label: 'CSS' },
        },
      } satisfies Layout,
    ]),
  ),
  ferrocast_shader: {
    sections: [
      {
        title: 'Effect',
        icon: SlidersHorizontal,
        tone: VIOLET,
        keys: ['preset', 'shader_file', 'shader_text'],
      },
      {
        title: 'Sliders',
        icon: SlidersHorizontal,
        tone: ARC,
        keys: ['param1', 'param2', 'param3', 'param4'],
      },
    ],
  },
}

/** A kind's layout, if it has one. */
export function layoutOf(kind: string): Layout | null {
  return LAYOUTS[kind] ?? null
}

export function KindSettings({
  name,
  kind,
  opts,
  values,
  onChange,
}: {
  name: string
  kind: string
  opts: EngineOption[]
  values: EngineSettings
  onChange: (key: string, value: unknown) => void
}) {
  const layout = LAYOUTS[kind]
  if (!layout)
    return (
      <>
        <Band icon={SlidersHorizontal} tone={ARC} title="Settings" />
        <OptionsForm compact opts={opts} values={values} onChange={onChange} />
      </>
    )
  const words = layout.words ?? {}
  const worded = opts.map((o) => {
    const w = words[o.key]
    return w ? { ...o, label: w.label, help: w.help ?? o.help, suffix: w.suffix ?? o.suffix } : o
  })
  const named = new Set(layout.sections.flatMap((s) => s.keys))
  const hidden = new Set(layout.hide ?? [])
  const rest = worded.filter((o) => !named.has(o.key) && !hidden.has(o.key) && o.visible)
  const form = (keys: string[]) => {
    const list = keys
      .map((k) => worded.find((o) => o.key === k))
      .filter((o): o is EngineOption => !!o && !hidden.has(o.key))
    return list.length ? (
      <OptionsForm compact opts={list} all={worded} values={values} onChange={onChange} />
    ) : null
  }
  // Runs of plain options go through the one form; `@` entries are drawn here.
  const body = (keys: string[]) => {
    const out: ReactNode[] = []
    let run: string[] = []
    const flush = () => {
      if (run.length) out.push(<div key={`f-${out.length}`}>{form(run)}</div>)
      run = []
    }
    for (const k of keys) {
      if (!k.startsWith('@')) {
        run.push(k)
        continue
      }
      flush()
      out.push(
        <Special key={k} what={k} name={name} opts={worded} values={values} onChange={onChange} />,
      )
    }
    flush()
    return out
  }
  const shows = (s: Section) =>
    s.keys.some((k) => k.startsWith('@') || worded.some((o) => o.key === k && !hidden.has(k)))
  return (
    <>
      {layout.preview && <SourcePreview name={name} />}
      {layout.sections.filter(shows).map((s) => (
        <section key={s.title} aria-label={s.title} className="flex flex-col">
          <Band icon={s.icon} tone={s.tone} title={s.title} />
          {body(s.keys)}
        </section>
      ))}
      {rest.length > 0 && (
        <section aria-label="More" className="flex flex-col">
          <Band icon={DotsThreeCircle} tone="var(--fc-text-3)" title="More" />
          <OptionsForm compact opts={rest} all={worded} values={values} onChange={onChange} />
        </section>
      )}
    </>
  )
}

function Special({
  what,
  name,
  opts,
  values,
  onChange,
}: {
  what: string
  name: string
  opts: EngineOption[]
  values: EngineSettings
  onChange: (key: string, value: unknown) => void
}) {
  if (what === '@length') return <Length opts={opts} values={values} onChange={onChange} />
  if (what === '@media')
    return <MediaBlock name={name} opts={opts} values={values} onChange={onChange} />
  if (what === '@layouts') return <KeyLayouts opts={opts} values={values} onChange={onChange} />
  if (what === '@mirror') return <Mirror name={name} />
  if (what === '@read') return <LastRead name={name} values={values} />
  if (what === '@page') return <PageCheck name={name} values={values} />
  return null
}

/** A camera seen as in a mirror: its picture flipped sideways in this scene (the Position
 *  tab's Flip across, here where people look for it). */
function Mirror({ name }: { name: string }) {
  const { api, scene, items } = useDesk()
  const { run, busy } = useAction()
  const item = items.data?.flatMap((i) => [i, ...i.children]).find((i) => i.name === name)
  const [on, setOn] = useState<boolean | null>(null)
  const id = item?.id
  useEffect(() => {
    if (id === undefined) return
    let alive = true
    void api
      .transform(scene, id)
      .then((t) => alive && setOn(t.scale_x < 0))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [api, scene, id])
  if (!item || on === null) return null
  return (
    <Prop label="Mirror" hint="Flips it sideways, as you see yourself in a mirror.">
      {(id) => (
        <span className="ml-auto">
          <Switch
            id={id}
            label="Mirror"
            hideLabel
            checked={on}
            disabled={busy !== null || item.locked}
            onChange={(to) =>
              void run('mirror', () => done(api.editItem(scene, item.id, 'flip_h'))).then(
                (ok) => ok && setOn(to),
              )
            }
          />
        </span>
      )}
    </Prop>
  )
}

/** A source's status (API.md …/status), read again every `every` ms and when `key` changes. */
function useSourceStatus(name: string, every: number, key: string) {
  const api = useEngine()
  const [st, setSt] = useState<EngineSourceStatus | null>(null)
  useEffect(() => {
    let alive = true
    const read = () =>
      void api
        .sourceStatus(name)
        .then((r) => alive && setSt(r))
        .catch(() => clearInterval(t))
    const t = setInterval(read, every)
    read()
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [api, name, every, key])
  return st
}

/** "12 s ago", "3 min ago". */
function ago(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000))
  return s < 60 ? `${s} s ago` : `${Math.round(s / 60)} min ago`
}

/** A Web text's last read: when, or why it failed. */
function LastRead({ name, values }: { name: string; values: EngineSettings }) {
  const st = useSourceStatus(name, 3000, `${String(values.url)}|${String(values.path)}`)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const r = st?.web_text
  if (!st) return null
  if (!r)
    return (
      <div className="flex h-9 items-center gap-2 border-b border-line px-3 text-[12px] text-text-3">
        <span aria-hidden className="size-1.5 rounded-full bg-text-3" /> Not read yet
      </div>
    )
  return r.error ? (
    <div
      role="status"
      title={r.error}
      className="flex h-9 items-center gap-2 border-b border-[color-mix(in_oklab,var(--fc-danger)_30%,transparent)] bg-danger-soft px-3 text-[12px] font-semibold text-danger"
    >
      <WarningCircle size={14} weight="bold" aria-hidden className="shrink-0" />
      <span className="truncate">Couldn’t read it: {r.error}</span>
      <span className="ml-auto shrink-0 font-mono text-[11px] font-normal">
        {ago(r.at_ms, now)}
      </span>
    </div>
  ) : (
    <div
      role="status"
      className="flex h-9 items-center gap-2 border-b border-line px-3 text-[12px] text-text-2"
    >
      <span
        aria-hidden
        className="size-1.5 rounded-full bg-ok shadow-[0_0_0_3px_var(--fc-ok-soft)]"
      />
      Read {ago(r.at_ms, now)}
      {r.value !== null && (
        <span className="ml-auto truncate rounded-[4px] bg-ok-soft px-1.5 py-0.5 font-mono text-[10.5px] text-ok">
          = {r.value}
        </span>
      )}
    </div>
  )
}

/** A Browser source's page on the web: a red line when it doesn't load (tried on opening and
 *  when the address changes). */
function PageCheck({ name, values }: { name: string; values: EngineSettings }) {
  const st = useSourceStatus(name, 60_000, String(values.url))
  const page = st?.page
  if (!page || page.ok) return null
  return (
    <div
      role="alert"
      title={page.error ?? undefined}
      className="flex h-[30px] items-center gap-2 border-b border-[color-mix(in_oklab,var(--fc-danger)_30%,transparent)] bg-danger-soft px-3 text-[12px] font-semibold text-danger"
    >
      <WarningCircle size={14} weight="bold" aria-hidden className="shrink-0" />
      <span className="truncate">
        The page didn’t load{page.error ? ` (${page.error})` : ''}. Check the address.
      </span>
    </div>
  )
}

/** A countdown's length: minutes and seconds on one line (only for "For a set time"). */
function Length({
  opts,
  values,
  onChange,
}: {
  opts: EngineOption[]
  values: EngineSettings
  onChange: (key: string, value: unknown) => void
}) {
  const min = opts.find((o) => o.key === 'minutes')
  const sec = opts.find((o) => o.key === 'seconds')
  const mode = opts.find((o) => o.key === 'mode')
  if (!min || !sec) return null
  if (mode && min.shown_when && !min.shown_when.values.includes(valueOf(mode, values) as string))
    return null
  return (
    <Prop label="Length">
      <NumBox
        label="Minutes"
        unit="min"
        min={0}
        max={min.max ?? 1440}
        value={Number(valueOf(min, values)) || 0}
        onLeave
        onChange={(n) => onChange('minutes', Math.round(n))}
      />
      <NumBox
        label="Seconds"
        unit="sec"
        min={0}
        max={59}
        value={Number(valueOf(sec, values)) || 0}
        onLeave
        onChange={(n) => onChange('seconds', Math.round(n))}
      />
    </Prop>
  )
}

/** A video's file: its name and folder, and Replace for the computer's own file picker. */
/** A video's file and its player, from one reading of where it is (every second). */
function MediaBlock({
  name,
  opts,
  values,
  onChange,
}: {
  name: string
  opts: EngineOption[]
  values: EngineSettings
  onChange: (key: string, value: unknown) => void
}) {
  const [m, send] = useMedia(name)
  const info =
    m && m.state !== 'none'
      ? [m.duration_ms > 0 ? clock(m.duration_ms) : null, m.file_bytes ? bytes(m.file_bytes) : null]
          .filter(Boolean)
          .join(' · ')
      : ''
  return (
    <>
      <FileRow opts={opts} values={values} onChange={onChange} info={info} />
      {m && m.state !== 'none' && <Player name={name} m={m} send={send} />}
    </>
  )
}

/** A size in bytes as people read it: 48 MB, 1.2 GB. */
export function bytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`
  if (n >= 1e6) return `${Math.round(n / 1e6)} MB`
  if (n >= 1e3) return `${Math.round(n / 1e3)} KB`
  return `${n} B`
}

function FileRow({
  opts,
  values,
  onChange,
  info,
}: {
  opts: EngineOption[]
  values: EngineSettings
  onChange: (key: string, value: unknown) => void
  /** Its length and size ("1:12 · 48 MB"), shown under its name. */
  info: string
}) {
  const api = useEngine()
  const { run, busy } = useAction()
  const o = opts.find((x) => x.key === 'local_file')
  if (!o) return null
  const path = typeof values.local_file === 'string' ? values.local_file : ''
  const file = path.split(/[\\/]/).pop() ?? ''
  const folder = path.slice(0, Math.max(0, path.length - file.length - 1))
  const pick = async () => {
    const r = await run('pick', () => api.pickFile('file', o.filter ?? ''))
    if (r?.path) {
      onChange('is_local_file', true)
      onChange('local_file', r.path)
    }
  }
  return (
    <Pad>
      <div className="flex items-center gap-2.5 rounded-[6px] border border-line bg-surface-2 p-2">
        <span
          aria-hidden
          className="grid h-8 w-11 shrink-0 place-items-center rounded-[4px] bg-[linear-gradient(135deg,#1d1330,#4a2b6b)] text-white"
        >
          <FileVideo size={15} weight="fill" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <b className="truncate text-[12.5px] font-semibold" title={path || undefined}>
            {file || 'No file yet'}
          </b>
          <small className="truncate font-mono text-[10.5px] text-text-3" title={path || undefined}>
            {file ? info || folder : 'Pick a video on this computer'}
          </small>
        </span>
        {inDesktopApp() && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void pick()}
            className="fc-press inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-[5px] border border-line-strong px-2 text-[12px] font-semibold outline-none hover:bg-surface-3 focus-visible:shadow-[var(--fc-focus)] disabled:opacity-50"
          >
            <FolderOpen size={13} weight="bold" aria-hidden /> {file ? 'Replace' : 'Pick'}
          </button>
        )}
      </div>
    </Pad>
  )
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Where a video is, read every second; one that can't be played or paused (the engine says
 *  so) stops being asked, so it isn't an error a second. */
function useMedia(
  name: string,
): [EngineMedia | null, (what?: 'play_pause' | 'restart', seek?: number) => void] {
  const api = useEngine()
  const [m, setM] = useState<EngineMedia | null>(null)
  useEffect(() => {
    let alive = true
    const read = () =>
      void api
        .media(name)
        .then((r) => alive && setM(r))
        .catch(() => {
          clearInterval(t)
          if (alive) setM(null)
        })
    const t = setInterval(read, 1000)
    read()
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [api, name])
  const send = (what?: 'play_pause' | 'restart', seek?: number) =>
    void api
      .media(name, what, seek)
      .then(setM)
      .catch(() => undefined)
  return [m, send]
}

/** Play, pause, where it is (drag to move), and back to the start. */
function Player({
  name,
  m,
  send,
}: {
  name: string
  m: EngineMedia
  send: (what?: 'play_pause' | 'restart', seek?: number) => void
}) {
  const [drag, setDrag] = useState<number | null>(null)
  const playing = m.state === 'playing' || m.state === 'opening' || m.state === 'buffering'
  const at = drag ?? m.time_ms
  const pct = m.duration_ms > 0 ? (at / m.duration_ms) * 100 : 0
  return (
    <div className="flex h-11 items-center gap-2 border-b border-line pr-2.5 pl-3">
      <button
        type="button"
        aria-label={playing ? `Pause ${name}` : `Play ${name}`}
        onClick={() => send('play_pause')}
        className="fc-press fc-picked grid size-7 shrink-0 place-items-center rounded-full outline-none focus-visible:shadow-[var(--fc-focus)]"
      >
        {playing ? <Pause size={13} weight="fill" /> : <Play size={13} weight="fill" />}
      </button>
      <span className="w-9 shrink-0 font-mono text-[11px] text-text-3 tabular-nums">
        {clock(at)}
      </span>
      <input
        type="range"
        aria-label={`Where ${name} is`}
        aria-valuetext={`${clock(at)} of ${clock(m.duration_ms)}`}
        min={0}
        max={Math.max(1, m.duration_ms)}
        step={100}
        value={at}
        disabled={m.duration_ms <= 0}
        onChange={(e) => setDrag(Number(e.target.value))}
        onPointerUp={() => {
          if (drag !== null) send(undefined, drag)
          setDrag(null)
        }}
        onKeyUp={() => {
          if (drag !== null) send(undefined, drag)
          setDrag(null)
        }}
        className="fc-slim min-w-0 flex-1"
        style={{ ['--from' as string]: '0%', ['--fill' as string]: `${pct}%` }}
      />
      <span className="w-9 shrink-0 text-right font-mono text-[11px] text-text-3 tabular-nums">
        {clock(m.duration_ms)}
      </span>
      <IconButton
        size="xs"
        variant="ghost"
        label={`Play ${name} from the start`}
        onClick={() => send('restart')}
      >
        <Rewind size={14} />
      </IconButton>
    </div>
  )
}

/** The key layouts the engine has, drawn as small keys (the pressed ones lit). */
const KEYS_OF: Record<string, { cols: number; keys: string[]; lit: number[] }> = {
  wasd: { cols: 3, keys: ['', 'W', '', 'A', 'S', 'D'], lit: [1, 4] },
  arrows: { cols: 3, keys: ['', '↑', '', '←', '↓', '→'], lit: [1] },
  fps: { cols: 3, keys: ['Q', 'W', 'E', 'A', 'S', 'D'], lit: [1] },
  mouse: { cols: 2, keys: ['L', 'R'], lit: [0] },
}

function KeyLayouts({
  opts,
  values,
  onChange,
}: {
  opts: EngineOption[]
  values: EngineSettings
  onChange: (key: string, value: unknown) => void
}) {
  const o = opts.find((x) => x.key === 'layout')
  if (!o) return null
  const now = valueOf(o, values)
  return (
    <Pad>
      <div role="radiogroup" aria-label="Keys" className="grid grid-cols-4 gap-1.5">
        {o.choices.map((label, i) => {
          const id = String(o.values[i])
          const on = o.values[i] === now
          const k = KEYS_OF[id]
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange('layout', o.values[i])}
              className={cx(
                'flex min-w-0 flex-col items-center gap-1.5 rounded-[6px] border px-1 py-2 text-[11.5px] font-semibold outline-none transition-colors focus-visible:shadow-[var(--fc-focus)]',
                on
                  ? 'border-arc text-text shadow-[inset_0_0_0_1px_var(--fc-arc)]'
                  : 'border-line text-text-2 hover:border-line-strong',
              )}
            >
              {k ? (
                <span
                  aria-hidden
                  className="grid gap-[2px]"
                  style={{ gridTemplateColumns: `repeat(${k.cols}, 13px)` }}
                >
                  {k.keys.map((c, j) =>
                    c ? (
                      <span
                        key={j}
                        className={cx(
                          'h-[13px] rounded-[2px] border text-center font-mono text-[7px] leading-[11px] font-semibold',
                          k.lit.includes(j)
                            ? 'border-transparent bg-accent text-on-accent'
                            : 'border-line-strong bg-surface-3 text-text-2',
                        )}
                      >
                        {c}
                      </span>
                    ) : (
                      <span key={j} />
                    ),
                  )}
                </span>
              ) : (
                <Keyboard size={22} aria-hidden className="text-text-3" />
              )}
              <span className="max-w-full truncate">{label}</span>
            </button>
          )
        })}
      </div>
    </Pad>
  )
}

/** The source as it looks now, read again every 1.5 s while the drawer is open. */
function SourcePreview({ name }: { name: string }) {
  const api = useEngine()
  const [pic, setPic] = useState<{ image: string | null; width?: number; height?: number } | null>(
    null,
  )
  useEffect(() => {
    let alive = true
    const read = () =>
      void api
        .sourcePicture(name, 640)
        .then((r) => alive && setPic(r))
        .catch(() => clearInterval(t))
    const t = setInterval(read, 1500)
    read()
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [api, name])
  return (
    <Pad>
      <div className="relative aspect-video overflow-hidden rounded-[6px] border border-line-strong bg-[#000]">
        {pic?.image ? (
          <img src={pic.image} alt={`${name} now`} className="size-full object-contain" />
        ) : (
          <span className="grid size-full place-items-center text-[12px] text-text-3">
            {pic ? 'Nothing to show yet.' : ''}
          </span>
        )}
        {pic?.image && (
          <span className="absolute top-1.5 left-1.5 flex items-center gap-1 rounded-[4px] bg-black/55 px-1.5 py-[3px] font-mono text-[10px] font-semibold text-white">
            <span aria-hidden className="size-1.5 rounded-full bg-[#3ddc84]" /> LIVE
          </span>
        )}
        {pic?.width && pic.height && pic.width > 8 && pic.height > 8 ? (
          <span className="absolute top-1.5 right-1.5 rounded-[4px] bg-black/55 px-1.5 py-[3px] font-mono text-[10px] font-semibold text-white tabular-nums">
            {pic.width}×{pic.height}
          </span>
        ) : null}
      </div>
    </Pad>
  )
}
