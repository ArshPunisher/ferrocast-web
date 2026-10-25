// Studio settings (2.1): what OBS's Settings window has for streaming, sound, the picture,
// recording, shortcuts and reconnecting, as plain choices first and the details under "More
// options". Saved together; what can't change now (live, or until a restart) says so.

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Broadcast,
  Keyboard,
  Monitor,
  Record,
  SlidersHorizontal,
  SpeakerHigh,
  X,
} from '@phosphor-icons/react'
import { describeError, type StudioSettings } from '@ferrocast/api'
import {
  Button,
  Dialog,
  IconButton,
  InfoTip,
  Input,
  Segmented,
  Select,
  Skeleton,
  Switch,
  cx,
  toast,
} from '@ferrocast/ui'
import { LoadError } from '../../Panel'
import { useResource } from '../../../lib/hooks'
import { useDesk } from './common'

export type Page = 'stream' | 'audio' | 'picture' | 'record' | 'keys' | 'advanced'

const PAGES: { id: Page; label: string; icon: typeof Broadcast }[] = [
  { id: 'stream', label: 'Stream quality', icon: Broadcast },
  { id: 'audio', label: 'Audio', icon: SpeakerHigh },
  { id: 'picture', label: 'Picture', icon: Monitor },
  { id: 'record', label: 'Recording', icon: Record },
  { id: 'keys', label: 'Shortcuts', icon: Keyboard },
  { id: 'advanced', label: 'Advanced', icon: SlidersHorizontal },
]

export function SettingsDialog({
  open,
  onClose,
  start,
}: {
  open: boolean
  onClose: () => void
  start?: Page | undefined
}) {
  return (
    <Dialog open={open} onClose={onClose} size="lg" title="Studio settings">
      {open && <Settings start={start ?? 'stream'} onClose={onClose} />}
    </Dialog>
  )
}

function Settings({ start, onClose }: { start: Page; onClose: () => void }) {
  const { api } = useDesk()
  const loaded = useResource(() => api.studioSettings(), [api])
  const [page, setPage] = useState<Page>(start)
  const [draft, setDraft] = useState<StudioSettings | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (loaded.data && !draft) setDraft(loaded.data)
  }, [loaded.data, draft])
  if (loaded.error && !loaded.data)
    return <LoadError error={loaded.error} onRetry={loaded.reload} />
  if (!draft || !loaded.data) return <Skeleton className="h-96" />
  const set = (patch: Partial<StudioSettings>) => setDraft((d) => (d ? { ...d, ...patch } : d))
  const changed = JSON.stringify(draft) !== JSON.stringify(loaded.data)
  const save = async () => {
    setSaving(true)
    try {
      const r = await api.setStudioSettings(draft)
      loaded.set(r.settings)
      setDraft(r.settings)
      toast(
        r.restart
          ? { tone: 'warn', message: 'Saved.', hint: r.restart }
          : { tone: 'ok', message: 'Saved.' },
      )
    } catch (e) {
      const d = describeError(e)
      toast({ tone: 'error', message: d.message, ...(d.hint ? { hint: d.hint } : {}) })
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="-mx-1 flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:grid sm:grid-cols-[190px_minmax(0,1fr)]">
        <nav aria-label="Settings" className="flex gap-1 overflow-x-auto sm:flex-col">
          {PAGES.map((p) => {
            const Icon = p.icon
            return (
              <button
                key={p.id}
                type="button"
                aria-current={page === p.id ? 'page' : undefined}
                onClick={() => setPage(p.id)}
                className={cx(
                  'flex h-9 shrink-0 items-center gap-2.5 rounded-[9px] px-2.5 text-left text-[13.5px] whitespace-nowrap hover:bg-surface-2',
                  page === p.id &&
                    'bg-accent-soft font-semibold text-accent-text hover:bg-accent-soft',
                )}
              >
                <Icon
                  size={17}
                  aria-hidden
                  className={page === p.id ? 'text-accent-text' : 'text-text-3'}
                />
                {p.label}
              </button>
            )
          })}
        </nav>
        <div className="flex min-h-[420px] min-w-0 flex-col gap-5">
          {page === 'stream' && <StreamPage s={draft} set={set} />}
          {page === 'audio' && <AudioPage s={draft} set={set} />}
          {page === 'picture' && <PicturePage s={draft} set={set} />}
          {page === 'record' && <RecordPage s={draft} set={set} />}
          {page === 'keys' && <KeysPage s={draft} set={set} />}
          {page === 'advanced' && <AdvancedPage s={draft} set={set} />}
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-line pt-4">
        {changed && (
          <Button variant="ghost" onClick={() => setDraft(loaded.data)}>
            Undo changes
          </Button>
        )}
        <span className="flex-1" />
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
        <Button variant="primary" busy={saving} disabled={!changed} onClick={() => void save()}>
          Save
        </Button>
      </div>
    </div>
  )
}

interface PageProps {
  s: StudioSettings
  set: (patch: Partial<StudioSettings>) => void
}

function Heading({ children, info }: { children: ReactNode; info?: string }) {
  return (
    <h3 className="m-0 flex items-center gap-1 font-display text-[16px] font-bold tracking-tight">
      {children}
      {info && <InfoTip label={`About ${String(children).toLowerCase()}`}>{info}</InfoTip>}
    </h3>
  )
}

/** A choice drawn as a card; the picked one is outlined. */
function Choice({
  on,
  title,
  sub,
  note,
  onPick,
}: {
  on: boolean
  title: string
  sub?: string
  note?: string
  onPick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onPick}
      className={cx(
        'relative flex min-w-0 flex-col items-start gap-0.5 rounded-control border border-line-strong bg-surface-2 px-3.5 py-3 text-left transition-colors hover:border-text-3',
        on && 'border-arc bg-accent-soft shadow-[inset_0_0_0_1px_var(--fc-arc)] hover:border-arc',
      )}
    >
      <b className="font-display text-[15px]">{title}</b>
      {sub && <span className="font-mono text-[12.5px] text-text-2 tabular-nums">{sub}</span>}
      {note && <span className="text-[12.5px] text-text-3">{note}</span>}
    </button>
  )
}

/** One setting as a row: the label left, its control right (stacked on a phone). */
function Row({
  label,
  sub,
  children,
  info,
}: {
  label: string
  sub?: string | undefined
  children: ReactNode
  info?: string
}) {
  return (
    <div className="grid grid-cols-1 items-center gap-2 border-t border-line py-2.5 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,260px)] sm:gap-4">
      <div className="flex items-center gap-1 text-[13.5px]">
        <span>
          {label}
          {sub && <span className="block text-[12px] text-text-3">{sub}</span>}
        </span>
        {info && <InfoTip label={`About ${label.toLowerCase()}`}>{info}</InfoTip>}
      </div>
      <div className="flex items-center justify-start gap-2 sm:justify-end">{children}</div>
    </div>
  )
}

function NumberBox({
  label,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  unit?: string
  onChange: (n: number) => void
}) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  return (
    <span className="flex items-center gap-2">
      <Input
        aria-label={label}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={text}
        className="w-24! text-right tabular-nums"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const n = Math.round(Number(text))
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)))
          else setText(String(value))
        }}
      />
      {unit && <span className="text-[13px] text-text-3">{unit}</span>}
    </span>
  )
}

const PRESETS = [
  {
    id: 'smooth',
    title: 'Smooth',
    kbps: 4500,
    scale: [1280, 720] as [number, number],
    note: 'Steady on a slow upload',
  },
  { id: 'sharp', title: 'Sharp', kbps: 6000, scale: null, note: 'What Twitch takes' },
  { id: 'max', title: 'Max', kbps: 12000, scale: null, note: 'YouTube only' },
] as const

function StreamPage({ s, set }: PageProps) {
  const sent = s.scale ?? [s.width, s.height]
  const preset = PRESETS.find(
    (p) =>
      p.kbps === s.video_kbps &&
      JSON.stringify(p.scale) === JSON.stringify(p.scale ? s.scale : null),
  )
  return (
    <>
      <Heading info="Higher quality needs a faster upload. Kick refuses over 8 Mbps.">
        Quality
      </Heading>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {PRESETS.map((p) => {
          const size = p.scale ?? [s.width, s.height]
          return (
            <Choice
              key={p.id}
              on={preset?.id === p.id}
              title={p.title}
              sub={`${size[1]}p · ${s.fps} fps · ${(p.kbps / 1000).toFixed(1)} Mbps`}
              note={p.note}
              onPick={() =>
                set({
                  video_kbps: p.kbps,
                  scale: p.scale && p.scale[1] < s.height ? p.scale : null,
                })
              }
            />
          )
        })}
      </div>
      {!preset && (
        <p className="m-0 text-[13px] text-text-3">
          Your own: {sent[1]}p at {(s.video_kbps / 1000).toFixed(1)} Mbps.
        </p>
      )}
      <Heading info="The encoder turns the picture into video. The Mac's own is light on the computer.">
        Encoder
      </Heading>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <Choice
          on={s.encoder === 'hardware'}
          title="Mac hardware"
          note="Recommended. Keeps games smooth."
          onPick={() => set({ encoder: 'hardware' })}
        />
        <Choice
          on={s.encoder === 'software'}
          title="Software (x264)"
          note="Sharper at low bitrates, uses more CPU."
          onPick={() => set({ encoder: 'software' })}
        />
      </div>
      <details className="rounded-control border border-line">
        <summary className="cursor-pointer px-3.5 py-2.5 text-[13.5px] font-semibold text-accent-text">
          More options
        </summary>
        <div className="border-t border-line px-3.5 py-1">
          <Row label="Bitrate" sub="Video sent to each platform">
            <NumberBox
              label="Bitrate"
              value={s.video_kbps}
              min={500}
              max={60000}
              unit="Kbps"
              onChange={(video_kbps) => set({ video_kbps })}
            />
          </Row>
          <Row label="Rate control" info="Platforms ask for steady (CBR).">
            <Segmented
              label="Rate control"
              value={s.vbr ? 'vbr' : 'cbr'}
              options={[
                { value: 'cbr', label: 'Steady' },
                { value: 'vbr', label: 'Varies' },
              ]}
              onChange={(v) => set({ vbr: v === 'vbr' })}
            />
          </Row>
          <Row label="Keyframe every">
            <Select
              aria-label="Keyframe every"
              value={String(s.keyframe_s)}
              onChange={(e) => set({ keyframe_s: Number(e.target.value) })}
            >
              <option value="2">2 s (recommended)</option>
              <option value="1">1 s</option>
              <option value="4">4 s</option>
              <option value="0">Let the encoder pick</option>
            </Select>
          </Row>
          <Row label="Profile">
            <Select
              aria-label="Profile"
              value={s.profile}
              onChange={(e) => set({ profile: e.target.value as StudioSettings['profile'] })}
            >
              <option value="high">High</option>
              <option value="main">Main</option>
              <option value="baseline">Baseline</option>
            </Select>
          </Row>
          <Row label="B-frames" sub="Better quality at the same bitrate">
            <Switch
              label="B-frames"
              hideLabel
              checked={s.bframes}
              onChange={(bframes) => set({ bframes })}
            />
          </Row>
          <Row label="Send at" sub="Smaller than the picture saves upload">
            <Select
              aria-label="Send at"
              value={s.scale ? s.scale.join('x') : 'canvas'}
              onChange={(e) =>
                set({
                  scale:
                    e.target.value === 'canvas'
                      ? null
                      : (e.target.value.split('x').map(Number) as [number, number]),
                })
              }
            >
              <option value="canvas">
                The picture&apos;s size ({s.width}×{s.height})
              </option>
              {[
                [1920, 1080],
                [1600, 900],
                [1280, 720],
                [960, 540],
                [852, 480],
              ]
                .filter(([, h]) => (h ?? 0) < s.height)
                .map(([w, h]) => (
                  <option key={`${w}x${h}`} value={`${w}x${h}`}>
                    {w}×{h}
                  </option>
                ))}
            </Select>
          </Row>
          <Row label="Audio quality">
            <Select
              aria-label="Audio quality"
              value={String(s.audio_kbps)}
              onChange={(e) => set({ audio_kbps: Number(e.target.value) })}
            >
              {[96, 128, 160, 192, 256, 320].map((k) => (
                <option key={k} value={k}>
                  {k} Kbps{k === 160 ? ' (recommended)' : ''}
                </option>
              ))}
            </Select>
          </Row>
        </div>
      </details>
    </>
  )
}

function AudioPage({ s, set }: PageProps) {
  const { api } = useDesk()
  const devices = useResource(() => api.monitoring(), [api])
  const current = s.monitoring ? s.monitoring[1] : 'default'
  return (
    <>
      <Heading info="Where sounds set to Hear it play.">Listening</Heading>
      <div className="flex flex-col">
        <Row label="Hear sounds on">
          {devices.data ? (
            <Select
              aria-label="Hear sounds on"
              value={current}
              onChange={(e) => {
                const d = devices.data?.devices.find((x) => x.id === e.target.value)
                set({ monitoring: !d || d.id === 'default' ? null : [d.name, d.id] })
              }}
            >
              {!devices.data.devices.some((d) => d.id === 'default') && (
                <option value="default">The Mac&apos;s output</option>
              )}
              {devices.data.devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.id === 'default' ? 'The Mac’s output' : d.name}
                </option>
              ))}
            </Select>
          ) : (
            <Skeleton className="h-9 w-48" />
          )}
        </Row>
      </div>
      <Heading info="Changes here apply after Ferrocast restarts.">Sound</Heading>
      <div className="flex flex-col">
        <Row label="Sample rate">
          <Segmented
            label="Sample rate"
            value={String(s.sample_rate)}
            options={[
              { value: '44100', label: '44.1 kHz' },
              { value: '48000', label: '48 kHz' },
            ]}
            onChange={(v) => set({ sample_rate: Number(v) as StudioSettings['sample_rate'] })}
          />
        </Row>
        <Row label="Channels">
          <Segmented
            label="Channels"
            value={s.stereo ? 'stereo' : 'mono'}
            options={[
              { value: 'mono', label: 'Mono' },
              { value: 'stereo', label: 'Stereo' },
            ]}
            onChange={(v) => set({ stereo: v === 'stereo' })}
          />
        </Row>
      </div>
    </>
  )
}

const CANVASES = [
  { w: 1920, h: 1080, title: '1920×1080', note: 'Landscape, most streams' },
  { w: 2560, h: 1440, title: '2560×1440', note: 'Sharper, needs more upload' },
  { w: 1280, h: 720, title: '1280×720', note: 'Light on slow computers' },
  { w: 1080, h: 1920, title: '1080×1920', note: 'Vertical, for Shorts' },
]

function PicturePage({ s, set }: PageProps) {
  return (
    <>
      <Heading info="What scenes are built on. It can't change while you're live or recording.">
        Canvas
      </Heading>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {CANVASES.map((c) => (
          <Choice
            key={c.title}
            on={s.width === c.w && s.height === c.h}
            title={c.title}
            note={c.note}
            onPick={() =>
              set({ width: c.w, height: c.h, scale: s.scale && s.scale[1] < c.h ? s.scale : null })
            }
          />
        ))}
      </div>
      <div className="flex flex-col">
        <Row label="Frame rate">
          <Select
            aria-label="Frame rate"
            value={String(s.fps)}
            onChange={(e) => set({ fps: Number(e.target.value) })}
          >
            {[24, 25, 30, 48, 50, 60, 120].map((f) => (
              <option key={f} value={f}>
                {f} fps{f === 60 ? ' (smooth games)' : f === 30 ? ' (most streams)' : ''}
              </option>
            ))}
          </Select>
        </Row>
      </div>
    </>
  )
}

function RecordPage({ s, set }: PageProps) {
  const name = useMemo(() => {
    const d = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}.${s.record_format}`
  }, [s.record_format])
  const [folder, setFolder] = useState(s.record_folder ?? '')
  // Follows the draft (Undo changes, or a value the engine saved).
  useEffect(() => setFolder(s.record_folder ?? ''), [s.record_folder])
  return (
    <>
      <Heading>Quality</Heading>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <Choice
          on={s.record_quality === 'stream'}
          title="Same as stream"
          note="Small files"
          onPick={() => set({ record_quality: 'stream' })}
        />
        <Choice
          on={s.record_quality === 'high'}
          title="High"
          note="For editing; bigger files"
          onPick={() => set({ record_quality: 'high' })}
        />
        <Choice
          on={s.record_quality === 'lossless'}
          title="Lossless"
          note="Huge files, heavy on CPU"
          onPick={() => set({ record_quality: 'lossless' })}
        />
      </div>
      <div className="flex flex-col">
        <Row
          label="File type"
          info="Both stay playable if the app or the Mac stops while recording."
        >
          <Segmented
            label="File type"
            value={s.record_format}
            options={[
              { value: 'mp4', label: 'MP4' },
              { value: 'mov', label: 'MOV' },
            ]}
            onChange={(record_format) => set({ record_format })}
          />
        </Row>
        <Row label="Save to" sub={s.record_folder ? undefined : 'Movies › Ferrocast'}>
          <Input
            aria-label="Recordings folder"
            placeholder="/Users/you/Movies/Ferrocast…"
            autoComplete="off"
            spellCheck={false}
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            onBlur={() => set({ record_folder: folder.trim() ? folder.trim() : null })}
          />
        </Row>
        <Row label="File names">
          <span className="font-mono text-[12.5px] text-text-2" translate="no">
            {name}
          </span>
        </Row>
      </div>
    </>
  )
}

/** "CmdOrCtrl+Shift+KeyL" → "⌘⇧L". */
function pretty(keys: string): string {
  const sym: Record<string, string> = {
    Cmd: '⌘',
    Super: '⌘',
    Ctrl: '⌃',
    Control: '⌃',
    Alt: '⌥',
    Option: '⌥',
    Shift: '⇧',
  }
  return keys
    .split('+')
    .map((k) => sym[k] ?? k.replace(/^Key/, '').replace(/^Digit/, ''))
    .join(' ')
}

/** Listens for the next key press with at least one modifier (or an F key) → its keys. */
function KeyCapture({ onKeys, onCancel }: { onKeys: (k: string) => void; onCancel: () => void }) {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') return onCancel()
      if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return
      const mods = [
        e.metaKey && 'Cmd',
        e.ctrlKey && 'Ctrl',
        e.altKey && 'Alt',
        e.shiftKey && 'Shift',
      ].filter(Boolean) as string[]
      const fkey = /^F\d{1,2}$/.test(e.code)
      if (!mods.length && !fkey) return
      onKeys([...mods, e.code].join('+'))
    }
    window.addEventListener('keydown', down, true)
    return () => window.removeEventListener('keydown', down, true)
  }, [onKeys, onCancel])
  return (
    <span
      className="inline-flex h-8 items-center rounded-[8px] border border-arc bg-accent-soft px-2.5 text-[12.5px] font-semibold text-accent-text"
      aria-live="polite"
    >
      Press keys…
    </span>
  )
}

function KeysPage({ s, set }: PageProps) {
  const { scenes, audio } = useDesk()
  const [listening, setListening] = useState<string | null>(null)
  const groups: { title: string; actions: { id: string; label: string }[] }[] = [
    {
      title: 'Streaming',
      actions: [
        { id: 'go_live', label: 'Go live' },
        { id: 'end_stream', label: 'End stream' },
      ],
    },
    {
      title: 'Recording',
      actions: [
        { id: 'record', label: 'Start or stop recording' },
        { id: 'pause_record', label: 'Pause or resume recording' },
      ],
    },
    {
      title: 'Scenes',
      actions: (scenes.data?.scenes ?? []).map((x) => ({ id: `scene:${x.name}`, label: x.name })),
    },
    {
      title: 'Sound',
      actions: (audio.data ?? []).flatMap((a) => [
        { id: `mute:${a.name}`, label: `Mute or unmute ${a.name}` },
        { id: `push_to_talk:${a.name}`, label: `Push to talk: ${a.name}` },
      ]),
    },
  ]
  const setKey = (id: string, keys: string | null) => {
    const next = { ...s.hotkeys }
    if (keys) {
      // One action per keys.
      for (const [k, v] of Object.entries(next)) if (v === keys) delete next[k]
      next[id] = keys
    } else delete next[id]
    set({ hotkeys: next })
    setListening(null)
  }
  return (
    <>
      <Heading info="They work while a game has the keyboard. Push to talk mutes the sound until held.">
        Shortcuts
      </Heading>
      {groups
        .filter((g) => g.actions.length > 0)
        .map((g) => (
          <section key={g.title} aria-label={g.title} className="flex flex-col">
            <h4 className="m-0 mb-1 text-[12.5px] font-bold text-text-3">{g.title}</h4>
            {g.actions.map((a) => {
              const keys = s.hotkeys[a.id]
              return (
                <div
                  key={a.id}
                  className="flex min-h-11 items-center gap-2 border-t border-line text-[13.5px]"
                >
                  <span className="min-w-0 flex-1 truncate">{a.label}</span>
                  {listening === a.id ? (
                    <KeyCapture
                      onKeys={(k) => setKey(a.id, k)}
                      onCancel={() => setListening(null)}
                    />
                  ) : keys ? (
                    <kbd className="inline-flex h-7 items-center rounded-[8px] border border-line-strong bg-inset px-2 font-mono text-[12.5px] font-semibold shadow-[0_1px_0_var(--fc-line-strong)]">
                      {pretty(keys)}
                    </kbd>
                  ) : (
                    <span className="text-[13px] text-text-3">None</span>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setListening(a.id)}>
                    {keys ? 'Change' : 'Set'}
                  </Button>
                  {keys && (
                    <IconButton
                      size="sm"
                      variant="ghost"
                      label={`Clear the shortcut for ${a.label}`}
                      onClick={() => setKey(a.id, null)}
                    >
                      <X size={14} />
                    </IconButton>
                  )}
                </div>
              )
            })}
          </section>
        ))}
    </>
  )
}

function AdvancedPage({ s, set }: PageProps) {
  return (
    <>
      <Heading>If the connection drops</Heading>
      <div className="flex flex-col">
        <Row label="Reconnect by itself">
          <Switch
            label="Reconnect by itself"
            hideLabel
            checked={s.reconnect}
            onChange={(reconnect) => set({ reconnect })}
          />
        </Row>
        {s.reconnect && (
          <>
            <Row label="Try again every">
              <NumberBox
                label="Try again every"
                value={s.reconnect_every_s}
                min={1}
                max={60}
                unit="s"
                onChange={(reconnect_every_s) => set({ reconnect_every_s })}
              />
            </Row>
            <Row label="Give up after">
              <NumberBox
                label="Give up after"
                value={s.reconnect_tries}
                min={1}
                max={10000}
                unit="tries"
                onChange={(reconnect_tries) => set({ reconnect_tries })}
              />
            </Row>
          </>
        )}
      </div>
      <Heading info="Viewers see everything this much later. Stops stream snipers.">
        Stream delay
      </Heading>
      <div className="flex flex-col">
        <Row label="Delay the stream">
          <Switch
            label="Delay the stream"
            hideLabel
            checked={s.delay_s > 0}
            onChange={(on) => set({ delay_s: on ? 20 : 0 })}
          />
        </Row>
        {s.delay_s > 0 && (
          <Row label="By">
            <NumberBox
              label="Delay"
              value={s.delay_s}
              min={1}
              max={1800}
              unit="s"
              onChange={(delay_s) => set({ delay_s })}
            />
          </Row>
        )}
      </div>
    </>
  )
}
