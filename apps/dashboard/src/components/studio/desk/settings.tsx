// Studio settings (2.1): what OBS's Settings window has for streaming, sound, the picture,
// recording, shortcuts and reconnecting, as plain choices first and the details under "More
// options". Saved together; what can't change now (live, or until a restart) says so.

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  CheckCircle,
  Broadcast,
  GearSix,
  Keyboard,
  Monitor,
  Record,
  SlidersHorizontal,
  Sparkle,
  SpeakerHigh,
  X,
} from '@phosphor-icons/react'
import {
  ENGINE_RECORD_FORMATS,
  describeError,
  type EngineRecordFormat,
  type StudioSettings,
} from '@ferrocast/api'
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
import { AutoConfigDialog } from './auto-config'
import { LogDialog } from './log-viewer'
import { OptionsForm } from './options'
import { TRANSITIONS } from './preview'

export type Page = 'stream' | 'audio' | 'picture' | 'record' | 'keys' | 'general' | 'advanced'

const PAGES: { id: Page; label: string; icon: typeof Broadcast }[] = [
  { id: 'stream', label: 'Stream quality', icon: Broadcast },
  { id: 'audio', label: 'Audio', icon: SpeakerHigh },
  { id: 'picture', label: 'Picture', icon: Monitor },
  { id: 'record', label: 'Recording', icon: Record },
  { id: 'keys', label: 'Shortcuts', icon: Keyboard },
  { id: 'general', label: 'General', icon: GearSix },
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
    <Dialog open={open} onClose={onClose} size="wide" flush title="Studio settings">
      {open && <Settings start={start ?? 'stream'} onClose={onClose} />}
    </Dialog>
  )
}

/** A Mac (the only place the drawing choice applies). */
const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent)

function Settings({ start, onClose }: { start: Page; onClose: () => void }) {
  const { api, prefs } = useDesk()
  const loaded = useResource(() => api.studioSettings(), [api])
  const [page, setPage] = useState<Page>(start)
  const [draft, setDraft] = useState<StudioSettings | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (loaded.data && !draft) setDraft(loaded.data)
  }, [loaded.data, draft])
  if (loaded.error && !loaded.data)
    return (
      <div className="p-6">
        <LoadError error={loaded.error} onRetry={loaded.reload} />
      </div>
    )
  if (!draft || !loaded.data) return <Skeleton className="m-6 h-96" />
  const set = (patch: Partial<StudioSettings>) => setDraft((d) => (d ? { ...d, ...patch } : d))
  const changed = JSON.stringify(draft) !== JSON.stringify(loaded.data)
  const save = async () => {
    setSaving(true)
    try {
      const r = await api.setStudioSettings(draft)
      loaded.set(r.settings)
      prefs.set(r.settings)
      setDraft(r.settings)
      toast(
        r.restart
          ? { tone: 'warn', message: 'Saved.', hint: r.restart }
          : { tone: 'ok', message: 'Saved.' },
      )
      // Saved: done here (owner, 29 Oct). A failure keeps it open to fix.
      onClose()
    } catch (e) {
      const d = describeError(e)
      toast({ tone: 'error', message: d.message, ...(d.hint ? { hint: d.hint } : {}) })
    } finally {
      setSaving(false)
    }
  }
  const here = PAGES.find((p) => p.id === page)
  return (
    <div className="flex min-h-0 flex-1 flex-col border-t border-line">
      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        {/* The pages: a side list like the system's settings (a strip on phones). */}
        <nav
          aria-label="Settings"
          className="flex shrink-0 gap-1 overflow-x-auto border-b border-line bg-surface-2 p-2 sm:w-[220px] sm:flex-col sm:overflow-y-auto sm:border-r sm:border-b-0 sm:p-3"
        >
          {PAGES.map((p) => {
            const Icon = p.icon
            const on = page === p.id
            return (
              <button
                key={p.id}
                type="button"
                aria-current={on ? 'page' : undefined}
                onClick={() => setPage(p.id)}
                className={cx(
                  'flex h-10 shrink-0 items-center gap-3 rounded-[10px] px-3 text-left text-[15px] font-semibold whitespace-nowrap transition-colors',
                  on ? 'fc-picked' : 'text-text-2 hover:bg-surface-3 hover:text-text',
                )}
              >
                <Icon size={18} weight={on ? 'fill' : 'regular'} aria-hidden />
                {p.label}
              </button>
            )
          })}
        </nav>
        <div
          key={page}
          className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-y-auto [&>*]:shrink-0 overscroll-contain px-5 py-5 sm:px-8 sm:py-6"
        >
          {here && (
            <h3 className="m-0 hidden font-display text-[22px] font-extrabold tracking-tight sm:block">
              {here.label}
            </h3>
          )}
          {page === 'stream' && <StreamPage s={draft} set={set} />}
          {page === 'audio' && <AudioPage s={draft} set={set} />}
          {page === 'picture' && <PicturePage s={draft} set={set} />}
          {page === 'record' && <RecordPage s={draft} set={set} />}
          {page === 'keys' && <KeysPage s={draft} set={set} />}
          {page === 'general' && <GeneralPage s={draft} set={set} />}
          {page === 'advanced' && <AdvancedPage s={draft} set={set} />}
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-line bg-surface-2 px-5 py-3 sm:px-6">
        {changed ? (
          <>
            <span className="text-[14px] font-semibold text-warn">Not saved yet</span>
            <Button variant="ghost" onClick={() => setDraft(loaded.data)}>
              Undo changes
            </Button>
          </>
        ) : null}
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
    <h3 className="m-0 flex items-center gap-1 font-display text-[17px] font-extrabold tracking-tight">
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
        'relative flex min-w-0 flex-col items-start gap-0.5 rounded-control border px-3.5 py-3 text-left transition-colors',
        // Picked: the same solid fill as every other pick (owner, 27 Oct), with a tick.
        on
          ? 'fc-picked border-transparent'
          : 'border-line-strong bg-surface-2 hover:border-text-3 hover:bg-surface-3',
      )}
    >
      {on && (
        <CheckCircle size={18} weight="fill" aria-hidden className="absolute top-2.5 right-2.5" />
      )}
      <b className="pr-6 font-display text-[16px]">{title}</b>
      {sub && <span className="font-mono text-[13.5px] text-text-2 tabular-nums">{sub}</span>}
      {note && <span className="text-[13.5px] text-text-3">{note}</span>}
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
      <div className="flex items-center gap-1 text-[14.5px]">
        <span>
          {label}
          {sub && <span className="block text-[13px] text-text-3">{sub}</span>}
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
  disabled,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  unit?: string
  disabled?: boolean
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
        disabled={disabled}
        className="w-24! text-right tabular-nums"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const n = Math.round(Number(text))
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)))
          else setText(String(value))
        }}
      />
      {/* A steady width, so boxes with different units line up. */}
      {unit && <span className="w-10 shrink-0 text-[14px] text-text-3">{unit}</span>}
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

const HARDWARE_H264 = 'com.apple.videotoolbox.videoencoder.ave.avc'

/** The encoder used: the one picked, else the Mac's hardware H.264 or x264. */
function effectiveEncoder(picked: string | null, encoder: StudioSettings['encoder']): string {
  return picked ?? (encoder === 'hardware' ? HARDWARE_H264 : 'obs_x264')
}

/** What the plain controls set on the encoder, shown under its own options. */
function baseOptions(s: StudioSettings): Record<string, unknown> {
  return {
    bitrate: s.video_kbps,
    rate_control: s.vbr ? 'VBR' : 'CBR',
    keyint_sec: s.keyframe_s,
    profile: s.profile,
    bframes: s.bframes,
  }
}

/** Every video encoder on this computer, or "picked for you". */
function EncoderSelect({
  label,
  value,
  onChange,
}: {
  label: string
  value: string | null
  onChange: (id: string | null) => void
}) {
  const { kinds } = useDesk()
  // Video encoders only (OBS lists sound ones alongside).
  const list = kinds.data?.encoders.filter((e) => !/aac|opus|pcm|alac|flac|audio/i.test(e.id)) ?? []
  return (
    <Select
      aria-label={label}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">Picked for you</option>
      {list.map((e) => (
        <option key={e.id} value={e.id}>
          {e.name}
        </option>
      ))}
      {value && !list.some((e) => e.id === value) && (
        <option value={value}>{value} (not here)</option>
      )}
    </Select>
  )
}

/**
 * OBS's Advanced output options for one encoder (preset, tune, lookahead, x264 options, GPU…),
 * drawn from what the encoder describes. Only changed keys are kept; they win over the plain
 * controls above.
 */
export function EncoderOptions({
  id,
  base,
  settings,
  onChange,
}: {
  id: string
  base: Record<string, unknown>
  settings: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
}) {
  const { api } = useDesk()
  const [open, setOpen] = useState(false)
  const merged = useMemo(() => ({ ...base, ...settings }), [base, settings])
  const key = JSON.stringify(merged)
  const got = useResource(
    () => (open ? api.encoderOptions(id, merged) : Promise.resolve(null)),

    [api, id, open, key],
  )
  const changed = Object.keys(settings).length
  return (
    <details
      className="my-1 rounded-control border border-line"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="cursor-pointer px-3 py-2 text-[14px] font-semibold text-accent-text">
        Every option of this encoder{changed ? ` (${changed} changed)` : ''}
      </summary>
      <div className="flex flex-col gap-3 border-t border-line p-3">
        {got.error && !got.data ? (
          <LoadError error={got.error} onRetry={got.reload} />
        ) : !got.data ? (
          <Skeleton className="h-32" />
        ) : (
          <OptionsForm
            opts={got.data.options}
            values={{ ...got.data.values, ...merged }}
            onChange={(k, v) => onChange({ ...settings, [k]: v })}
          />
        )}
        {changed > 0 && (
          <Button size="sm" variant="ghost" className="self-start" onClick={() => onChange({})}>
            Back to the plain settings
          </Button>
        )}
      </div>
    </details>
  )
}

function StreamPage({ s, set }: PageProps) {
  const [wizard, setWizard] = useState(false)
  const sent = s.scale ?? [s.width, s.height]
  const preset = PRESETS.find(
    (p) =>
      p.kbps === s.video_kbps &&
      JSON.stringify(p.scale) === JSON.stringify(p.scale ? s.scale : null),
  )
  return (
    <>
      <button
        type="button"
        onClick={() => setWizard(true)}
        className="fc-press flex items-center gap-3 rounded-panel border border-accent-line bg-accent-soft px-4 py-3 text-left hover:border-arc focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
      >
        <Sparkle size={22} weight="fill" className="shrink-0 text-accent-text" aria-hidden />
        <span className="flex flex-col">
          <b className="font-display text-[16px] text-text">Set up for me</b>
          <span className="text-[13.5px] text-text-2">Tests your upload and picks for you.</span>
        </span>
      </button>
      <AutoConfigDialog open={wizard} onClose={() => setWizard(false)} s={s} onApply={set} />
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
        <p className="m-0 text-[14px] text-text-3">
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
        <summary className="cursor-pointer px-3.5 py-2.5 text-[14.5px] font-semibold text-accent-text">
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
          <Row label="Encoder" info="One you pick here wins over the choice above (HEVC, AV1…).">
            <EncoderSelect
              label="Encoder"
              value={s.video_encoder ?? null}
              onChange={(video_encoder) => set({ video_encoder, encoder_settings: {} })}
            />
          </Row>
          <EncoderOptions
            id={effectiveEncoder(s.video_encoder ?? null, s.encoder)}
            base={baseOptions(s)}
            settings={s.encoder_settings ?? {}}
            onChange={(encoder_settings) => set({ encoder_settings })}
          />
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
        <Row
          label="Channels"
          info="Surround needs a surround player on the other end; most streams are stereo."
        >
          <Select
            aria-label="Channels"
            value={s.speakers ?? (s.stereo ? 'stereo' : 'mono')}
            onChange={(e) => {
              const v = e.target.value
              if (v === 'mono' || v === 'stereo') set({ stereo: v === 'stereo', speakers: null })
              else set({ stereo: true, speakers: v as NonNullable<StudioSettings['speakers']> })
            }}
          >
            <option value="mono">Mono</option>
            <option value="stereo">Stereo</option>
            <option value="2.1">2.1</option>
            <option value="4.0">4.0</option>
            <option value="4.1">4.1</option>
            <option value="5.1">5.1</option>
            <option value="7.1">7.1</option>
          </Select>
        </Row>
      </div>
      <div className="flex flex-col">
        <Row
          label="True peak meters"
          info="Catches peaks between samples (OBS's True Peak), a little more work for the computer."
        >
          <Switch
            label="True peak meters"
            hideLabel
            checked={!!s.true_peak}
            onChange={(true_peak) => set({ true_peak })}
          />
        </Row>
        <Row
          label="Low latency sound"
          info="Sound waits at most 20 ms for a late device instead of up to a second, so it stays in sync with you. A device that keeps running late may crackle. Applies after a restart."
        >
          <Switch
            label="Low latency sound"
            hideLabel
            checked={!!s.low_latency_audio}
            onChange={(low_latency_audio) => set({ low_latency_audio })}
          />
        </Row>
      </div>
      <Heading info="Heard in every scene. Changes apply at once.">Everywhere</Heading>
      <EverywhereDevices />
    </>
  )
}

/** The six sounds heard in every scene: desktop sound 1 and 2, mics 1 to 4. */
const SLOTS = [
  { ch: 1, label: 'Desktop sound', kind: 'desktop' as const },
  { ch: 2, label: 'Desktop sound 2', kind: 'desktop' as const },
  { ch: 3, label: 'Mic', kind: 'mic' as const },
  { ch: 4, label: 'Mic 2', kind: 'mic' as const },
  { ch: 5, label: 'Mic 3', kind: 'mic' as const },
  { ch: 6, label: 'Mic 4', kind: 'mic' as const },
]

function EverywhereDevices() {
  const { api, scene, kinds, refresh } = useDesk()
  const [busy, setBusy] = useState<number | null>(null)
  const have = (ids: string[]) =>
    ids.find((k) => kinds.data?.inputs.some((i) => i.id === k)) ?? null
  const micKind = have(['coreaudio_input_capture', 'wasapi_input_capture'])
  const deskKind = have(['sck_audio_capture', 'wasapi_output_capture'])
  const now = useResource(async () => {
    const list = await api.audio(scene)
    const on = list.filter((a) => a.channel !== null)
    const devices = await Promise.all(
      on.map(async (a) => [a.channel, (await api.settings(a.name)).device_id, a.name] as const),
    )
    return devices
  }, [api, scene])
  const mics = useResource(
    () => (micKind ? api.options(micKind) : Promise.resolve([])),
    [api, micKind],
  )
  const devOpt = mics.data?.find((o) => o.key === 'device_id')
  const set = async (slot: (typeof SLOTS)[number], value: string) => {
    setBusy(slot.ch)
    try {
      const kind = slot.kind === 'mic' ? micKind : deskKind
      if (value === 'off' || !kind) await api.setChannel(slot.ch, null)
      else
        await api.setChannel(slot.ch, {
          kind,
          name: slot.label,
          // Desktop sound on macOS is ScreenCaptureKit's type 0 (the whole computer).
          settings: slot.kind === 'mic' ? { device_id: value } : { type: 0 },
        })
      now.reload()
      refresh()
    } catch (e) {
      const d = describeError(e)
      toast({ tone: 'error', message: d.message, ...(d.hint ? { hint: d.hint } : {}) })
    } finally {
      setBusy(null)
    }
  }
  if (!now.data) return <Skeleton className="h-40" />
  return (
    <div className="flex flex-col">
      {SLOTS.map((slot) => {
        const cur = now.data?.find((d) => d[0] === slot.ch)
        const value = !cur ? 'off' : slot.kind === 'mic' ? String(cur[1] ?? 'default') : 'on'
        return (
          <Row key={slot.ch} label={cur ? cur[2] : slot.label}>
            <Select
              aria-label={`${slot.label}, heard everywhere`}
              value={value}
              disabled={busy === slot.ch}
              onChange={(e) => void set(slot, e.target.value)}
            >
              <option value="off">Off</option>
              {slot.kind === 'desktop' ? (
                <option value="on">The computer&apos;s sound</option>
              ) : (
                (devOpt?.values ?? ['default']).map((v, i) => (
                  <option key={String(v)} value={String(v)}>
                    {devOpt?.choices[i] ?? 'Default'}
                  </option>
                ))
              )}
            </Select>
          </Row>
        )
      })}
    </div>
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
        {/* Only a Mac has the choice (Windows draws with Direct3D). */}
        {isMac && (
          <Row
            label="Drawing"
            info="Metal is Apple's own way of drawing and the default. If a filter or plugin looks wrong, try OpenGL, the older way. Applies after a restart."
          >
            <Select
              aria-label="Drawing"
              value={s.renderer ?? 'metal'}
              onChange={(e) => set({ renderer: e.target.value as 'metal' | 'opengl' })}
            >
              <option value="metal">Metal</option>
              <option value="opengl">OpenGL</option>
            </Select>
          </Row>
        )}
      </div>
      <Heading info="A projector of every scene at once; a click puts one on air (in Studio Mode, in the preview).">
        Multiview
      </Heading>
      <div className="flex flex-col">
        <Row label="What's on air goes">
          <Select
            aria-label="Multiview layout"
            value={s.multiview_layout ?? 'top'}
            onChange={(e) =>
              set({
                multiview_layout: e.target.value as NonNullable<StudioSettings['multiview_layout']>,
              })
            }
          >
            <option value="top">Above the scenes</option>
            <option value="bottom">Below the scenes</option>
            <option value="left">Left of the scenes</option>
            <option value="right">Right of the scenes</option>
            <option value="scenes_only">Scenes only</option>
          </Select>
        </Row>
        <Row label="Scene names">
          <Switch
            label="Scene names"
            hideLabel
            checked={s.multiview_labels ?? true}
            onChange={(multiview_labels) => set({ multiview_labels })}
          />
        </Row>
        <Row label="Safe areas" info="EBU R95: where text and action stay clear of a TV's edges.">
          <Switch
            label="Safe areas"
            hideLabel
            checked={!!s.multiview_safe_areas}
            onChange={(multiview_safe_areas) => set({ multiview_safe_areas })}
          />
        </Row>
      </div>
    </>
  )
}

const FORMAT_LABEL: Record<EngineRecordFormat, string> = {
  mp4: 'MP4 (safe if the Mac stops)',
  mov: 'MOV (safe if the Mac stops)',
  fmp4: 'Fragmented MP4',
  fmov: 'Fragmented MOV',
  mkv: 'MKV',
  flv: 'FLV',
  ts: 'MPEG-TS',
  hls: 'HLS (playlist and segments)',
}

/** OBS's name pattern with today's date, for a preview (the common specifiers). */
export function previewName(
  pattern: string,
  s: Pick<StudioSettings, 'fps' | 'width' | 'height'>,
  at = new Date(),
): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const map: Record<string, string> = {
    '%CCYY': String(at.getFullYear()),
    '%YY': p(at.getFullYear() % 100),
    '%MM': p(at.getMonth() + 1),
    '%DD': p(at.getDate()),
    '%hh': p(at.getHours()),
    '%mm': p(at.getMinutes()),
    '%ss': p(at.getSeconds()),
    '%FPS': String(s.fps),
    '%CRES': `${s.width}x${s.height}`,
    '%%': '%',
  }
  return pattern.replace(/%CCYY|%YY|%MM|%DD|%hh|%mm|%ss|%FPS|%CRES|%%/g, (m) => map[m] ?? m)
}

/** OBS's Remux: pick a recording, an MP4 is made beside it (progress shows in the Studio). */
function RemuxButton() {
  const { api } = useDesk()
  const [busy, setBusy] = useState(false)
  const pick = async () => {
    setBusy(true)
    try {
      const got = await api.pickFile('file', 'Recordings (*.mkv *.flv *.ts *.mov *.mp4)')
      if (!got.path) return
      const r = await api.remux(got.path)
      toast({ tone: 'ok', message: 'Making an MP4.', hint: r.to })
    } catch (e) {
      const d = describeError(e)
      toast({ tone: 'error', message: d.message, ...(d.hint ? { hint: d.hint } : {}) })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button size="sm" busy={busy} onClick={() => void pick()}>
      Pick a file…
    </Button>
  )
}

function RecordPage({ s, set }: PageProps) {
  const ext =
    s.record_format === 'fmp4' ? 'mp4' : s.record_format === 'fmov' ? 'mov' : s.record_format
  const pattern = s.record_name ?? '%CCYY-%MM-%DD %hh-%mm-%ss'
  const spaces = s.record_spaces ?? true
  const name = useMemo(() => {
    const n = previewName(pattern, s)
    return `${spaces ? n : n.replace(/ /g, '_')}.${ext}`
  }, [pattern, spaces, ext, s])
  const [folder, setFolder] = useState(s.record_folder ?? '')
  const [namePattern, setNamePattern] = useState(pattern)
  // Follows the draft (Undo changes, or a value the engine saved).
  useEffect(() => setFolder(s.record_folder ?? ''), [s.record_folder])
  useEffect(() => setNamePattern(pattern), [pattern])
  const [muxer, setMuxer] = useState(s.record_muxer ?? '')
  useEffect(() => setMuxer(s.record_muxer ?? ''), [s.record_muxer])
  const tracks = s.record_tracks ?? [1]
  const needsHelper = ['mkv', 'flv', 'ts', 'fmp4', 'fmov', 'hls'].includes(s.record_format)
  return (
    <>
      <Heading>Quality</Heading>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Choice
          on={s.record_quality === 'stream'}
          title="Same as stream"
          note="Small files"
          onPick={() => set({ record_quality: 'stream' })}
        />
        <Choice
          on={s.record_quality === 'high'}
          title="High"
          note="For editing"
          onPick={() => set({ record_quality: 'high' })}
        />
        <Choice
          on={s.record_quality === 'lossless'}
          title="Lossless"
          note="Huge files"
          onPick={() => set({ record_quality: 'lossless' })}
        />
        <Choice
          on={s.record_quality === 'custom'}
          title="Your own"
          note="Any encoder"
          onPick={() => set({ record_quality: 'custom' })}
        />
      </div>
      {s.record_quality === 'custom' && (
        <div className="flex flex-col">
          <Row label="Encoder">
            <EncoderSelect
              label="Recording encoder"
              value={s.record_encoder ?? null}
              onChange={(record_encoder) => set({ record_encoder, record_encoder_settings: {} })}
            />
          </Row>
          <EncoderOptions
            id={effectiveEncoder(s.record_encoder ?? null, s.encoder)}
            base={baseOptions(s)}
            settings={s.record_encoder_settings ?? {}}
            onChange={(record_encoder_settings) => set({ record_encoder_settings })}
          />
        </div>
      )}
      <div className="flex flex-col">
        <Row
          label="File type"
          info="MP4 and MOV stay playable if the app or the Mac stops while recording. MKV, FLV and TS use OBS's own helper and can become MP4 when the recording ends."
        >
          <Select
            aria-label="File type"
            value={s.record_format}
            onChange={(e) => set({ record_format: e.target.value as EngineRecordFormat })}
          >
            {ENGINE_RECORD_FORMATS.map((f) => (
              <option key={f} value={f}>
                {FORMAT_LABEL[f]}
              </option>
            ))}
          </Select>
        </Row>
        {['mkv', 'flv', 'ts'].includes(s.record_format) && (
          <Row label="Make an MP4 when it ends" sub="The original is kept">
            <Switch
              label="Make an MP4 when it ends"
              hideLabel
              checked={s.record_remux ?? true}
              onChange={(record_remux) => set({ record_remux })}
            />
          </Row>
        )}
        <Row
          label="Muxer settings"
          info="ffmpeg's own key=value settings for the file, space apart (OBS's Custom Muxer Settings). Leave empty unless you know you need them."
        >
          <Input
            aria-label="Muxer settings"
            name="record_muxer"
            autoComplete="off"
            spellCheck={false}
            className="font-mono text-[13.5px]"
            placeholder="movflags=+faststart"
            value={muxer}
            onChange={(e) => setMuxer(e.target.value)}
            onBlur={() => {
              const v = muxer.trim()
              if (v !== (s.record_muxer ?? '')) set({ record_muxer: v })
            }}
          />
        </Row>
        <Row label="Save to" sub={s.record_folder ? undefined : 'Movies › Ferrocast'}>
          <Input
            aria-label="Recordings folder"
            name="record_folder"
            placeholder="/Users/you/Movies/Ferrocast…"
            autoComplete="off"
            spellCheck={false}
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            onBlur={() => set({ record_folder: folder.trim() ? folder.trim() : null })}
          />
        </Row>
        <Row
          label="File names"
          sub={name}
          info="%CCYY year, %MM month, %DD day, %hh %mm %ss the time, %FPS frame rate, %CRES picture size."
        >
          <Input
            aria-label="File name pattern"
            name="record_name"
            autoComplete="off"
            spellCheck={false}
            className="font-mono text-[13.5px]"
            value={namePattern}
            onChange={(e) => setNamePattern(e.target.value)}
            onBlur={() => {
              const next = namePattern.trim() || '%CCYY-%MM-%DD %hh-%mm-%ss'
              // Unchanged: no draft change (nothing to save).
              if (next !== pattern) set({ record_name: next })
              else setNamePattern(next)
            }}
          />
        </Row>
        <Row label="Spaces in names">
          <Switch
            label="Spaces in names"
            hideLabel
            checked={spaces}
            onChange={(record_spaces) => set({ record_spaces })}
          />
        </Row>
        <Row label="Replace a file of the same name" sub="Off: “(2)” is added">
          <Switch
            label="Replace a file of the same name"
            hideLabel
            checked={s.record_overwrite ?? false}
            onChange={(record_overwrite) => set({ record_overwrite })}
          />
        </Row>
        <Row label="New file every" sub="0: one file">
          <NumberBox
            label="New file every minutes"
            value={s.record_split_minutes ?? 0}
            min={0}
            max={1440}
            unit="min"
            onChange={(record_split_minutes) => set({ record_split_minutes })}
          />
        </Row>
        <Row label="Or every" sub="0: no size limit">
          <NumberBox
            label="New file every megabytes"
            value={s.record_split_mb ?? 0}
            min={0}
            max={1000000}
            unit="MB"
            onChange={(record_split_mb) => set({ record_split_mb })}
          />
        </Row>
        <Row
          label="Audio tracks"
          info="Track 1 is what the stream hears. Pick which sounds go on which track in Advanced audio."
        >
          <span className="flex gap-1" role="group" aria-label="Audio tracks in recordings">
            {[1, 2, 3, 4, 5, 6].map((t) => {
              const on = tracks.includes(t)
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={on}
                  aria-label={`Track ${t}`}
                  disabled={on && tracks.length === 1}
                  className={cx(
                    'grid size-9 touch-manipulation place-items-center rounded-[6px] border text-[13px] font-bold tabular-nums transition-colors active:scale-[0.96] disabled:opacity-60 sm:size-7',
                    on
                      ? 'border-accent/60 bg-accent/20 text-text'
                      : 'border-line bg-surface-2 text-text-3 hover:border-line-strong',
                  )}
                  onClick={() =>
                    set({
                      record_tracks: on
                        ? tracks.filter((x) => x !== t)
                        : [...tracks, t].sort((x, y) => x - y),
                    })
                  }
                >
                  {t}
                </button>
              )
            })}
          </span>
        </Row>
        <Row label="Replay buffer keeps" sub="The last seconds, saved on request">
          <NumberBox
            label="Replay buffer seconds"
            value={s.replay_seconds ?? 30}
            min={5}
            max={21600}
            unit="s"
            onChange={(replay_seconds) => set({ replay_seconds })}
          />
        </Row>
        <Row label="Replays as">
          <Select
            aria-label="Replays as"
            value={s.replay_format ?? 'mp4'}
            onChange={(e) =>
              set({ replay_format: e.target.value as NonNullable<StudioSettings['replay_format']> })
            }
          >
            <option value="mp4">MP4</option>
            <option value="mkv">MKV</option>
            <option value="mov">MOV</option>
            <option value="flv">FLV</option>
            <option value="ts">MPEG-TS</option>
          </Select>
        </Row>
        <Row label="Remux a recording" sub="An MKV, FLV or TS into MP4, without encoding again">
          <RemuxButton />
        </Row>
        {needsHelper && (
          <p className="m-0 pt-1 text-[13.5px] text-text-3">
            {FORMAT_LABEL[s.record_format]} uses OBS&apos;s own recording helper, so OBS needs to
            stay installed.
          </p>
        )}
      </div>
    </>
  )
}

/** "CmdOrCtrl+Shift+KeyL" → "⌘⇧L". */
export function pretty(keys: string): string {
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
      className="inline-flex h-8 items-center rounded-[8px] border border-arc bg-accent-soft px-2.5 text-[13.5px] font-semibold text-accent-text"
      aria-live="polite"
    >
      Press keys…
    </span>
  )
}

/** Every shortcut action, grouped as OBS's Hotkeys page is. */
export function shortcutGroups(
  scenes: { name: string }[],
  items: { scene: string; source: string }[],
  sounds: string[],
  filters: { source: string; filter: string }[],
  media: string[],
  quick: string[],
): { title: string; actions: { id: string; label: string }[] }[] {
  return [
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
        { id: 'split_record', label: 'Start a new file' },
        { id: 'chapter', label: 'Add a chapter' },
        { id: 'replay', label: 'Replay buffer on or off' },
        { id: 'save_replay', label: 'Save replay' },
        { id: 'virtualcam', label: 'Virtual camera on or off' },
        { id: 'screenshot', label: 'Screenshot of what’s on air' },
      ],
    },
    {
      title: 'Studio Mode',
      actions: [
        { id: 'studio_mode', label: 'Studio Mode on or off' },
        { id: 'transition', label: 'Transition' },
        { id: 'swap_scenes', label: 'Swap preview and on air' },
        { id: 'fade_to_black', label: 'Fade to black' },
        ...quick.map((q, i) => ({ id: `quick:${i + 1}`, label: `Quick transition: ${q}` })),
      ],
    },
    {
      title: 'Scenes',
      actions: scenes.map((x) => ({ id: `scene:${x.name}`, label: x.name })),
    },
    {
      title: 'Show and hide',
      actions: items.flatMap((x) => [
        { id: `show:${x.scene}\n${x.source}`, label: `Show ${x.source} in ${x.scene}` },
        { id: `hide:${x.scene}\n${x.source}`, label: `Hide ${x.source} in ${x.scene}` },
      ]),
    },
    {
      title: 'Sound',
      actions: sounds.flatMap((n) => [
        { id: `mute:${n}`, label: `Mute or unmute ${n}` },
        { id: `push_to_talk:${n}`, label: `Push to talk: ${n}` },
        { id: `push_to_mute:${n}`, label: `Push to mute: ${n}` },
      ]),
    },
    {
      title: 'Filters',
      actions: filters.map((f) => ({
        id: `filter:${f.source}\n${f.filter}`,
        label: `${f.filter} on ${f.source}, on or off`,
      })),
    },
    {
      title: 'Media',
      actions: media.flatMap((n) => [
        { id: `media_play_pause:${n}`, label: `Play or pause ${n}` },
        { id: `media_restart:${n}`, label: `Restart ${n}` },
        { id: `media_stop:${n}`, label: `Stop ${n}` },
        { id: `media_next:${n}`, label: `Next in ${n}` },
        { id: `media_previous:${n}`, label: `Previous in ${n}` },
      ]),
    },
    {
      title: 'Editing',
      actions: [
        { id: 'undo', label: 'Undo' },
        { id: 'redo', label: 'Redo' },
      ],
    },
  ]
}

function KeysPage({ s, set }: PageProps) {
  const { api, allScenes, scenes, audio } = useDesk()
  const [listening, setListening] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  // Every scene's sources, filters and media: what OBS lists on its Hotkeys page.
  const names = allScenes.map((x) => x.name).join('\n')
  const extra = useResource(async () => {
    const list = names ? names.split('\n') : []
    const per = await Promise.all(
      list.map(async (scene) => ({ scene, items: await api.items(scene) })),
    )
    const items = per.flatMap((p) =>
      p.items
        .flatMap((i) => [i, ...i.children])
        .map((i) => ({ scene: p.scene, source: i.name, media: !!i.media })),
    )
    const sources = [...new Set(items.map((i) => i.source))]
    const filters = (
      await Promise.all(
        sources.map(async (source) =>
          (await api.filters(source).catch(() => [])).map((f) => ({ source, filter: f.name })),
        ),
      )
    ).flat()
    return {
      items,
      filters,
      media: [...new Set(items.filter((i) => i.media).map((i) => i.source))],
    }
  }, [api, names])
  const groups = shortcutGroups(
    allScenes,
    extra.data?.items ?? [],
    (audio.data ?? []).map((a) => a.name),
    extra.data?.filters ?? [],
    extra.data?.media ?? [],
    (scenes.data?.quick ?? []).map(
      (q) => `${TRANSITIONS[q.kind] ?? q.kind}${q.ms ? ` ${q.ms / 1000}s` : ''}`,
    ),
  )
  const q = query.trim().toLowerCase()
  const labelOf = (id: string) =>
    groups.flatMap((g) => g.actions).find((a) => a.id === id)?.label ?? id
  const setKey = (id: string, keys: string | null) => {
    const next = { ...s.hotkeys }
    if (keys) {
      // One action per keys: a key taken from another action says so.
      for (const [k, v] of Object.entries(next))
        if (v === keys && k !== id) {
          delete next[k]
          toast({ tone: 'warn', message: `${pretty(keys)} moved from “${labelOf(k)}”.` })
        }
      next[id] = keys
    } else delete next[id]
    set({ hotkeys: next })
    setListening(null)
  }
  return (
    <>
      <Heading info="They work while a game has the keyboard. Push to talk mutes the sound until held; push to mute is the other way round. On a Mac keyboard, hold fn with F1 to F12.">
        How they work
      </Heading>
      <Input
        type="search"
        aria-label="Search shortcuts"
        name="shortcut-search"
        autoComplete="off"
        data-keep-placeholder
        placeholder="Search shortcuts…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {groups
        .map((g) => ({
          ...g,
          actions: g.actions.filter(
            (a) =>
              !q ||
              a.label.toLowerCase().includes(q) ||
              g.title.toLowerCase().includes(q) ||
              pretty(s.hotkeys[a.id] ?? '')
                .toLowerCase()
                .includes(q),
          ),
        }))
        .filter((g) => g.actions.length > 0)
        .map((g) => (
          <section key={g.title} aria-label={g.title} className="flex flex-col">
            <h4 className="m-0 mb-1 text-[13.5px] font-bold text-text-3">{g.title}</h4>
            {g.actions.map((a) => {
              const keys = s.hotkeys[a.id]
              return (
                <div
                  key={a.id}
                  className="flex min-h-11 items-center gap-2 border-t border-line text-[14.5px]"
                >
                  <span className="min-w-0 flex-1 truncate" title={a.label}>
                    {a.label}
                  </span>
                  {listening === a.id ? (
                    <KeyCapture
                      onKeys={(k) => setKey(a.id, k)}
                      onCancel={() => setListening(null)}
                    />
                  ) : keys ? (
                    <kbd className="inline-flex h-7 items-center rounded-[8px] border border-line-strong bg-inset px-2 font-mono text-[13.5px] font-semibold shadow-[0_1px_0_var(--fc-line-strong)]">
                      {pretty(keys)}
                    </kbd>
                  ) : (
                    <span className="text-[14px] text-text-3">None</span>
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
      {q && groups.every((g) => g.actions.every((a) => !a.label.toLowerCase().includes(q))) && (
        <p className="m-0 text-[14px] text-text-3">No shortcut matches “{query}”.</p>
      )}
    </>
  )
}

/** OBS's General settings that apply here: snapping in the preview, and asking first. */
function GeneralPage({ s, set }: PageProps) {
  const snapping = s.snapping ?? true
  const toggle = (label: string, checked: boolean, on: (v: boolean) => void, off = false) => (
    <Row label={label}>
      <Switch label={label} hideLabel checked={checked} disabled={off} onChange={on} />
    </Row>
  )
  return (
    <>
      <Heading info="Moving a source in the preview pulls it into line when it comes near. Hold Alt (Option) while moving to place it freely.">
        Snapping
      </Heading>
      <div className="flex flex-col">
        {toggle('Snap sources into line', snapping, (v) => set({ snapping: v }))}
        <Row label="How near">
          <NumberBox
            label="How near, in screen pixels"
            value={s.snap_px ?? 10}
            min={1}
            max={50}
            unit="px"
            disabled={!snapping}
            onChange={(snap_px) => set({ snap_px })}
          />
        </Row>
        {toggle(
          'To the edges of the screen',
          s.snap_screen ?? true,
          (v) => set({ snap_screen: v }),
          !snapping,
        )}
        {toggle('To other sources', !!s.snap_sources, (v) => set({ snap_sources: v }), !snapping)}
        {toggle(
          'To the middle of the screen',
          !!s.snap_center,
          (v) => set({ snap_center: v }),
          !snapping,
        )}
      </div>
      <Heading info="What starts when you go live. Ending the stream stops it too, unless kept going.">
        With the stream
      </Heading>
      <div className="flex flex-col">
        {toggle('Record while live', !!s.record_when_streaming, (v) =>
          set({ record_when_streaming: v }),
        )}
        {toggle(
          'Keep recording after the stream ends',
          !!s.keep_recording,
          (v) => set({ keep_recording: v }),
          !s.record_when_streaming,
        )}
        {toggle('Replay buffer while live', !!s.replay_when_streaming, (v) =>
          set({ replay_when_streaming: v }),
        )}
        {toggle(
          'Keep the buffer after the stream ends',
          !!s.keep_replay,
          (v) => set({ keep_replay: v }),
          !s.replay_when_streaming,
        )}
      </div>
      <Heading info="An “are you sure?” first, so a stray click doesn’t start or end anything.">
        Ask first
      </Heading>
      <div className="flex flex-col">
        {toggle('Before going live', !!s.confirm_go_live, (v) => set({ confirm_go_live: v }))}
        {toggle('Before ending the stream', s.confirm_end_stream ?? true, (v) =>
          set({ confirm_end_stream: v }),
        )}
        {toggle('Before stopping a recording', !!s.confirm_stop_record, (v) =>
          set({ confirm_stop_record: v }),
        )}
      </div>
    </>
  )
}

function AdvancedPage({ s, set }: PageProps) {
  const [logOpen, setLogOpen] = useState(false)
  return (
    <>
      <Heading info="What the app and the Studio's engine wrote down. Copy it into a bug report: stream keys and tokens are taken out first.">
        Log
      </Heading>
      <div className="flex flex-col">
        <Row label="See what happened">
          <Button size="sm" onClick={() => setLogOpen(true)}>
            Open the log
          </Button>
        </Row>
      </div>
      <LogDialog open={logOpen} onClose={() => setLogOpen(false)} />
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
