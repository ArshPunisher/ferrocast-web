// The designer's controls, shared by the stage view (tabs in a floating inspector) and the
// guided view (cards). Each section edits one look; `advanced` reveals the finer controls.

import { Children, useId, useRef, useState, type ReactNode } from 'react'
import {
  ArrowsClockwise,
  ChatCircleText,
  Crown,
  Diamond,
  Gift,
  HandCoins,
  Heart,
  Image as ImageIcon,
  Lightning,
  Plus,
  RocketLaunch,
  Sparkle,
  Star,
  Trash,
  UploadSimple,
} from '@phosphor-icons/react'
import {
  EVENT_LABEL,
  FRAMES,
  FRAME_LABEL,
  KNOWN_VARS,
  LAYOUTS,
  LAYOUT_LABEL,
  checkCss,
  isColor,
  type AlertLook,
  type Condition,
  type DesignVariation,
  type EventKey,
  type Media,
  type Platform,
} from '@ferrocast/api'
import { DESIGN_FONTS, GOOGLE_FONTS, SYSTEM_FONTS } from '@ferrocast/overlays'
import { SoundPicker } from './SoundPicker'
import {
  Button,
  Field,
  IconButton,
  Input,
  Segmented,
  Select,
  Switch,
  Textarea,
  cx,
  toast,
} from '@ferrocast/ui'
import { describeError } from '@ferrocast/api'
import { useClient } from '../../lib/hooks'

export type SetLook = (patch: Partial<AlertLook>, opts?: { merge?: boolean }) => void

export const EVENT_ICON: Record<EventKey, typeof Heart> = {
  follow: Heart,
  sub: Star,
  resub: ArrowsClockwise,
  gift: Gift,
  member: Crown,
  bits: Diamond,
  kicks: Lightning,
  tip: HandCoins,
  superchat: ChatCircleText,
  raid: RocketLaunch,
  redeem: Sparkle,
}

export const BUNDLED_FONTS = ['Bricolage Grotesque', 'Hanken Grotesk', 'JetBrains Mono'] as const

/** One labelled group of controls. */
export function Group({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: ReactNode
}) {
  const id = useId()
  return (
    <div role="group" aria-labelledby={id} className="flex flex-col gap-2">
      <span id={id} className="text-[14.5px] font-medium text-text-2">
        {label}
      </span>
      {children}
      {hint && <p className="text-[14px] leading-snug text-text-3">{hint}</p>}
    </div>
  )
}

/** A number on a slider with its value shown, e.g. "Image size 150 px". */
export function Range({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
  format,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  onChange: (v: number, merge: boolean) => void
  format?: (v: number) => string
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-[14.5px] font-medium text-text-2">
          {label}
        </label>
        <span className="font-mono text-[13.5px] text-text-3 tabular-nums">
          {format ? format(value) : `${value}${unit ? ` ${unit}` : ''}`}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value), true)}
        className="h-7 w-full"
      />
    </div>
  )
}

/** A colour well with its hex beside it; bad hex never reaches the design. */
export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  const id = useId()
  const [text, setText] = useState(value)
  const [synced, setSynced] = useState(value)
  if (value !== synced) {
    // Changed from outside (undo, a style pick, the colour well): show it.
    setSynced(value)
    setText(value)
  }
  const shown = isColor(value) && value.length === 7 ? value : '#000000'
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[14.5px] font-medium text-text-2">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          value={shown}
          onChange={(e) => {
            setText(e.target.value)
            onChange(e.target.value)
          }}
          className="h-10 w-12 shrink-0 cursor-pointer rounded-control border border-line-strong bg-inset p-1"
        />
        <Input
          aria-label={`${label} hex`}
          value={text}
          maxLength={9}
          spellCheck={false}
          className="font-mono"
          onChange={(e) => {
            setText(e.target.value)
            if (isColor(e.target.value)) onChange(e.target.value)
          }}
        />
      </div>
    </div>
  )
}

/** Big pressable tiles for a small set of choices (frames, layouts). */
export function Tiles<T extends string>({
  label,
  value,
  options,
  onChange,
  columns = 3,
}: {
  label: string
  value: T
  options: { value: T; label: string; art?: ReactNode }[]
  onChange: (v: T) => void
  columns?: 2 | 3 | 4
}) {
  return (
    <Group label={label}>
      <div
        className={cx(
          'grid gap-2',
          columns === 2 ? 'grid-cols-2' : columns === 4 ? 'grid-cols-4' : 'grid-cols-3',
        )}
      >
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
            className={cx(
              'fc-press flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-[12px] border px-2 py-2 text-center text-[14px] font-medium',
              o.value === value
                ? 'fc-picked border-transparent'
                : 'border-line bg-surface-2 text-text-2 hover:border-line-strong',
            )}
          >
            {o.art}
            {o.label}
          </button>
        ))}
      </div>
    </Group>
  )
}

/** Wraps a set of chips (single choice). */
export function Chips<T extends string>({
  label,
  value,
  options,
  onChange,
  onPreview,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  onPreview?: (v: T) => void
}) {
  return (
    <Group label={label}>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
            onPointerEnter={() => onPreview?.(o.value)}
            className={cx(
              'fc-press inline-flex h-8 items-center rounded-full border px-3 text-[14px] font-medium',
              o.value === value
                ? 'fc-picked border-transparent'
                : 'border-line text-text-2 hover:border-line-strong',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </Group>
  )
}

function LayoutArt({ layout }: { layout: AlertLook['layout'] }) {
  const m = <span className="block size-3 rounded-[3px] bg-[var(--fc-accent)]" />
  const t = (
    <span className="flex flex-col gap-1">
      <span className="block h-1 w-7 rounded bg-text-3" />
      <span className="block h-1 w-5 rounded bg-text-3/60" />
    </span>
  )
  const row = (cls: string, ...k: ReactNode[]) => (
    <span aria-hidden="true" className={cx('flex items-center gap-1.5', cls)}>
      {Children.toArray(k)}
    </span>
  )
  switch (layout) {
    case 'above':
      return row('flex-col', m, t)
    case 'left':
      return row('', m, t)
    case 'right':
      return row('flex-row-reverse', m, t)
    case 'over':
      return (
        <span
          aria-hidden="true"
          className="relative flex h-5 w-9 items-end justify-center rounded-[4px] bg-[var(--fc-accent)]/60 pb-0.5"
        >
          <span className="block h-1 w-6 rounded bg-text" />
        </span>
      )
    case 'text':
      return row('', t)
    default:
      return row(
        '',
        <span key="m" className="block size-3 translate-y-1 rounded-[3px] bg-[var(--fc-accent)]" />,
        t,
      )
  }
}

/** Library media of one kind, or an upload. */
function MediaChoice({
  kind,
  value,
  media,
  onPick,
  onUploaded,
}: {
  kind: 'visual' | 'sound'
  value: string | null
  media: Media[]
  onPick: (m: Media | null) => void
  onUploaded: (m: Media) => void
}) {
  const client = useClient()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const list = media.filter((m) => (kind === 'sound' ? m.kind === 'sound' : m.kind !== 'sound'))
  const accept =
    kind === 'sound'
      ? 'audio/mpeg,audio/ogg,audio/wav,.mp3,.ogg,.wav'
      : 'image/png,image/jpeg,image/gif,image/webp,video/webm,video/mp4'
  return (
    <div className="flex flex-col gap-2">
      {list.length > 0 && (
        <Select
          aria-label={
            kind === 'sound' ? 'Sound from your library' : 'Picture or video from your library'
          }
          value={value ?? ''}
          onChange={(e) => onPick(list.find((m) => m.id === e.target.value) ?? null)}
        >
          <option value="">{kind === 'sound' ? 'A built-in sound' : 'Event art'}</option>
          {list.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
      )}
      <input
        ref={input}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          setBusy(true)
          client
            .upload(f, f.name)
            .then((m) => {
              onUploaded(m)
              onPick(m)
            })
            .catch((err: unknown) => {
              const d = describeError(err)
              toast({ tone: 'error', message: d.message, hint: d.hint })
            })
            .finally(() => setBusy(false))
        }}
      />
      <Button
        size="sm"
        variant="secondary"
        icon={<UploadSimple size={14} />}
        busy={busy}
        onClick={() => input.current?.click()}
        className="self-start"
      >
        {kind === 'sound' ? 'Upload a sound' : 'Upload picture or video'}
      </Button>
      <p className="text-[13.5px] text-text-3">
        {kind === 'sound'
          ? 'MP3, OGG or WAV, up to 5 MB.'
          : 'PNG, JPEG, GIF or WebP up to 10 MB. WebM or MP4 up to 50 MB.'}
      </p>
    </div>
  )
}

export interface SectionProps {
  look: AlertLook
  set: SetLook
  /** Gives every event in the design its pre-matched sound (Designer only). */
  onSuggestSounds?: () => void
  advanced: boolean
  ev: EventKey
  media: Media[]
  onUploaded: (m: Media) => void
}

export function LookSection({ look, set, advanced, ev, media, onUploaded }: SectionProps) {
  return (
    <div className="flex flex-col gap-4">
      {advanced && (
        <Tiles
          label="Frame"
          value={look.frame}
          columns={2}
          options={FRAMES.map((f) => ({ value: f, label: FRAME_LABEL[f] }))}
          onChange={(frame) => set({ frame })}
        />
      )}
      <Tiles
        label="Layout"
        value={look.layout}
        options={LAYOUTS.filter((l) => advanced || l !== 'custom').map((l) => ({
          value: l,
          label: LAYOUT_LABEL[l],
          art: <LayoutArt layout={l} />,
        }))}
        onChange={(layout) => set({ layout })}
      />
      <Group label="Image, GIF or video">
        <Segmented
          label="Picture"
          size="sm"
          value={look.media.kind === 'video' ? 'image' : look.media.kind}
          options={[
            { value: 'emblem', label: `${EVENT_LABEL[ev]} art` },
            { value: 'image', label: 'Your file' },
            { value: 'none', label: 'None' },
          ]}
          onChange={(k) => set({ media: { kind: k, ref: k === 'image' ? look.media.ref : null } })}
        />
        {(look.media.kind === 'image' || look.media.kind === 'video') && (
          <MediaChoice
            kind="visual"
            value={look.media.ref}
            media={media}
            onUploaded={onUploaded}
            onPick={(m) =>
              set({
                media: m
                  ? { kind: m.kind === 'video' ? 'video' : 'image', ref: m.id }
                  : { kind: 'emblem', ref: null },
              })
            }
          />
        )}
      </Group>
      {look.layout !== 'text' && look.media.kind !== 'none' && (
        <Range
          label="Image size"
          value={look.media_size}
          min={40}
          max={320}
          unit="px"
          onChange={(v, m) => set({ media_size: v }, { merge: m })}
        />
      )}
      {advanced && (
        <>
          <Switch
            checked={look.plate}
            onChange={(plate) => set({ plate })}
            label="Background plate"
          />
          {look.layout === 'custom' && (
            <div className="grid grid-cols-2 gap-3">
              {(['text_x', 'text_y', 'media_x', 'media_y'] as const).map((k) => (
                <Range
                  key={k}
                  label={
                    {
                      text_x: 'Text across',
                      text_y: 'Text up and down',
                      media_x: 'Image across',
                      media_y: 'Image up and down',
                    }[k]
                  }
                  value={look.offsets[k]}
                  min={-300}
                  max={300}
                  unit="px"
                  onChange={(v, m) => set({ offsets: { ...look.offsets, [k]: v } }, { merge: m })}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

const VARS = [
  'name',
  'amount',
  'message',
  'months_text',
  'count_text',
  'viewers_text',
  'value',
  'reward',
] as const

function TemplateField({
  label,
  value,
  onChange,
  max,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  max: number
}) {
  const ref = useRef<HTMLInputElement>(null)
  const insert = (v: string) => {
    const el = ref.current
    const at = el?.selectionStart ?? value.length
    const next = `${value.slice(0, at)}{${v}}${value.slice(el?.selectionEnd ?? at)}`
    onChange(next.slice(0, max))
    requestAnimationFrame(() => el?.focus())
  }
  return (
    <div className="flex flex-col gap-1.5">
      <Field label={label}>
        {(p) => (
          <Input
            {...p}
            ref={ref}
            value={value}
            maxLength={max}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
      </Field>
      <div
        className="flex flex-wrap gap-1"
        aria-label={`Insert into ${label.toLowerCase()}`}
        role="group"
      >
        {VARS.filter((v) => (KNOWN_VARS as readonly string[]).includes(v)).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => insert(v)}
            className="fc-press rounded-full border border-line px-2 py-0.5 font-mono text-[13.5px] text-text-3 hover:border-line-strong hover:text-text"
          >
            {`{${v}}`}
          </button>
        ))}
      </div>
    </div>
  )
}

const SWATCHES: [string, string][] = [
  ['#ffa424', 'Molten'],
  ['#33d4ff', 'Arc'],
  ['#ff4fd8', 'Pink'],
  ['#3dd193', 'Mint'],
  ['#ffd23f', 'Gold'],
  ['#ffffff', 'White'],
]

export function TextSection({ look, set, advanced }: SectionProps) {
  const font = (family: string) =>
    set({
      font: {
        ...look.font,
        family,
        source: (BUNDLED_FONTS as readonly string[]).includes(family)
          ? 'bundled'
          : family in GOOGLE_FONTS
            ? 'google'
            : 'system',
      },
    })
  return (
    <div className="flex flex-col gap-4">
      <TemplateField
        label="Headline"
        value={look.title}
        max={300}
        onChange={(title) => set({ title })}
      />
      <TemplateField
        label="Message line"
        value={look.body}
        max={500}
        onChange={(body) => set({ body })}
      />
      <Group label="Font">
        <div className="grid grid-cols-3 gap-1.5">
          {BUNDLED_FONTS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={look.font.family === f}
              onClick={() => font(f)}
              className={cx(
                'fc-press flex flex-col items-start gap-0.5 rounded-[12px] border px-3 py-2 text-left',
                look.font.family === f
                  ? 'fc-picked border-transparent'
                  : 'border-line bg-surface-2 hover:border-line-strong',
              )}
            >
              <span
                className="text-xl leading-none font-bold"
                style={{
                  fontFamily:
                    f === 'JetBrains Mono'
                      ? 'var(--fc-font-mono)'
                      : f === 'Hanken Grotesk'
                        ? 'var(--fc-font-sans)'
                        : 'var(--fc-font-display)',
                }}
              >
                Aa
              </span>
              <span className="w-full truncate text-[13.5px] text-text-3">{f}</span>
            </button>
          ))}
        </div>
        {advanced && (
          <Select
            aria-label="More fonts"
            value={
              (BUNDLED_FONTS as readonly string[]).includes(look.font.family)
                ? ''
                : look.font.family
            }
            onChange={(e) => e.target.value && font(e.target.value)}
          >
            <option value="">More fonts…</option>
            <optgroup label="Comes with Ferrocast (open licence)">
              {DESIGN_FONTS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </optgroup>
            <optgroup label="Google Fonts (if installed)">
              {Object.keys(GOOGLE_FONTS)
                .filter((f) => !DESIGN_FONTS.includes(f))
                .map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
            </optgroup>
            <optgroup label="On this computer">
              {Object.keys(SYSTEM_FONTS).map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </optgroup>
          </Select>
        )}
      </Group>
      <Segmented
        label="Size"
        size="sm"
        value={String(
          look.font.size <= 32 ? 30 : look.font.size <= 44 ? 40 : look.font.size <= 56 ? 52 : 64,
        )}
        options={[
          { value: '30', label: 'S' },
          { value: '40', label: 'M' },
          { value: '52', label: 'L' },
          { value: '64', label: 'XL' },
        ]}
        onChange={(v) => set({ font: { ...look.font, size: Number(v) } })}
      />
      <Group label="Colour for the name and amount">
        <div className="flex flex-wrap gap-2">
          {SWATCHES.map(([c, name]) => (
            <button
              key={c}
              type="button"
              aria-pressed={look.colors.highlight.toLowerCase() === c}
              aria-label={name}
              title={name}
              onClick={() => set({ colors: { ...look.colors, highlight: c } })}
              className={cx(
                'fc-press size-9 rounded-full border-2',
                look.colors.highlight.toLowerCase() === c ? 'border-accent-text' : 'border-line',
              )}
              style={{ background: c }}
            />
          ))}
        </div>
      </Group>
      {advanced && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Range
              label="Exact size"
              value={look.font.size}
              min={16}
              max={120}
              unit="px"
              onChange={(v, m) => set({ font: { ...look.font, size: v } }, { merge: m })}
            />
            <Range
              label="Weight"
              value={look.font.weight}
              min={300}
              max={900}
              step={50}
              onChange={(v, m) => set({ font: { ...look.font, weight: v } }, { merge: m })}
            />
          </div>
          <Range
            label="Letter spacing"
            value={look.font.letter_spacing}
            min={-0.1}
            max={0.3}
            step={0.005}
            format={(v) => `${v.toFixed(3)} em`}
            onChange={(v, m) => set({ font: { ...look.font, letter_spacing: v } }, { merge: m })}
          />
          <Switch
            checked={look.font.uppercase}
            onChange={(uppercase) => set({ font: { ...look.font, uppercase } })}
            label="All caps"
          />
          <Switch
            checked={look.font.italic}
            onChange={(italic) => set({ font: { ...look.font, italic } })}
            label="Italic"
          />
        </>
      )}
    </div>
  )
}

export function StyleSection({ look, set }: SectionProps) {
  const color = (k: keyof AlertLook['colors'], label: string) => (
    <ColorField
      label={label}
      value={look.colors[k]}
      onChange={(v) => set({ colors: { ...look.colors, [k]: v } }, { merge: true })}
    />
  )
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        {color('text', 'Text')}
        {color('highlight', 'Name and amount')}
        {color('plate', 'Plate')}
        {color('accent', 'Accent')}
      </div>
      <Segmented
        label="Shadow"
        size="sm"
        value={look.shadow}
        options={[
          { value: 'none', label: 'None' },
          { value: 'soft', label: 'Soft' },
          { value: 'hard', label: 'Hard' },
          { value: 'glow', label: 'Glow' },
        ]}
        onChange={(shadow) => set({ shadow })}
      />
      <div className="grid grid-cols-2 gap-3">
        <Range
          label="Outline"
          value={look.outline}
          min={0}
          max={8}
          step={0.5}
          unit="px"
          onChange={(v, m) => set({ outline: v }, { merge: m })}
        />
        {color('outline', 'Outline colour')}
      </div>
    </div>
  )
}

export function SoundSection({
  look,
  set,
  advanced,
  ev,
  media,
  onUploaded,
  onSuggestSounds,
}: SectionProps) {
  const paid = ev === 'tip' || ev === 'superchat' || ev === 'bits' || ev === 'kicks'
  return (
    <div className="flex flex-col gap-4">
      <SoundPicker
        label="Sound"
        value={look.sound.ref ? null : look.sound.builtin}
        volume={look.sound.volume}
        onChange={(builtin) => set({ sound: { ...look.sound, ref: null, builtin } })}
      />
      {onSuggestSounds && (
        <div className="flex flex-col gap-1.5 rounded-[12px] border border-dashed border-line-strong p-3">
          <Button size="sm" className="self-start" onClick={onSuggestSounds}>
            Use suggested sounds
          </Button>
          <p className="text-[14px] leading-snug text-text-3">
            Every event gets the sound picked for it: Glint for follows, Cascade for subs, Tally for
            tips, Bloom for big ones, Lift for raids. Your own sound files stay.
          </p>
        </div>
      )}
      {advanced && (
        <Group label="Or your own sound">
          <MediaChoice
            kind="sound"
            value={look.sound.ref}
            media={media}
            onUploaded={onUploaded}
            onPick={(m) => set({ sound: { ...look.sound, ref: m?.id ?? null } })}
          />
        </Group>
      )}
      <Range
        label="Volume"
        value={look.sound.volume}
        min={0}
        max={100}
        unit="%"
        onChange={(v, m) => set({ sound: { ...look.sound, volume: v } }, { merge: m })}
      />
      <Switch
        checked={look.tts.enabled}
        onChange={(enabled) => set({ tts: { ...look.tts, enabled } })}
        label="Read the message aloud"
        description="Uses your computer’s voices, after the sound. Your TTS settings (word filter, approval) still apply."
      />
      {look.tts.enabled && paid && (
        <Field label="Only for amounts of at least" hint="0 reads every message.">
          {(p) => (
            <Input
              {...p}
              type="number"
              min={0}
              inputMode="decimal"
              value={look.tts.min_amount}
              onChange={(e) =>
                set({ tts: { ...look.tts, min_amount: Math.max(0, Number(e.target.value) || 0) } })
              }
            />
          )}
        </Field>
      )}
    </div>
  )
}

type CondKind = 'amount' | 'months' | 'message' | 'tier' | 'platform'
const COND_LABEL: Record<CondKind, string> = {
  amount: 'Amount at least',
  months: 'Months at least',
  message: 'Has a message',
  tier: 'Tier at least',
  platform: 'Platform is',
}
function condKind(c: Condition | null): CondKind {
  switch (c?.type) {
    case 'months_at_least':
      return 'months'
    case 'has_message':
      return 'message'
    case 'tier_at_least':
      return 'tier'
    case 'platform_is':
      return 'platform'
    default:
      return 'amount'
  }
}
function newCondition(k: CondKind): Condition {
  switch (k) {
    case 'months':
      return { type: 'months_at_least', months: 12 }
    case 'message':
      return { type: 'has_message' }
    case 'tier':
      return { type: 'tier_at_least', tier: 2 }
    case 'platform':
      return { type: 'platform_is', platform: 'twitch' }
    default:
      return { type: 'amount_at_least', value: 1000, currency: null }
  }
}
export function conditionText(c: Condition | null): string {
  if (!c) return 'Default'
  switch (c.type) {
    case 'amount_at_least':
      return `Amount ≥ ${c.value.toLocaleString('en-IN')}`
    case 'amount_below':
      return `Amount < ${c.value.toLocaleString('en-IN')}`
    case 'months_at_least':
      return `Months ≥ ${c.months}`
    case 'has_message':
      return 'Has a message'
    case 'tier_at_least':
      return `Tier ${c.tier}+`
    case 'platform_is':
      return `On ${c.platform}`
    default:
      return 'Custom condition'
  }
}

/** Variations: a different look for some events (a bigger alert for big tips). */
export function WhenSection({
  variations,
  selected,
  onSelect,
  onAdd,
  onRemove,
  onChange,
}: {
  variations: DesignVariation[]
  selected: number
  onSelect: (i: number) => void
  onAdd: () => void
  onRemove: (i: number) => void
  onChange: (i: number, v: DesignVariation) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[14.5px] text-text-3">
        Variations play a different look for some events, like a bigger alert for big tips. The most
        specific match wins.
      </p>
      <ul className="flex flex-col gap-2">
        {variations.map((v, i) => (
          <li
            key={v.id}
            className={cx(
              'rounded-[12px] border p-3',
              i === selected ? 'border-accent-line bg-accent-soft' : 'border-line bg-surface-2',
            )}
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onSelect(i)}
                className="min-w-0 flex-1 truncate text-left text-[14.5px] font-semibold text-text"
                aria-pressed={i === selected}
              >
                {v.name}
              </button>
              <span className="shrink-0 text-[13.5px] text-text-3">
                {conditionText(v.condition)}
              </span>
              {v.condition !== null && (
                <IconButton
                  size="sm"
                  variant="danger-ghost"
                  label={`Remove ${v.name}`}
                  onClick={() => onRemove(i)}
                >
                  <Trash size={14} />
                </IconButton>
              )}
            </div>
            {i === selected && v.condition !== null && (
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Field label="Name">
                  {(p) => (
                    <Input
                      {...p}
                      value={v.name}
                      maxLength={40}
                      onChange={(e) => onChange(i, { ...v, name: e.target.value })}
                    />
                  )}
                </Field>
                <Field label="Plays when">
                  {(p) => (
                    <Select
                      {...p}
                      value={condKind(v.condition)}
                      onChange={(e) =>
                        onChange(i, { ...v, condition: newCondition(e.target.value as CondKind) })
                      }
                    >
                      {(Object.keys(COND_LABEL) as CondKind[]).map((k) => (
                        <option key={k} value={k}>
                          {COND_LABEL[k]}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                {v.condition.type === 'amount_at_least' && (
                  <Field label="Amount">
                    {(p) => (
                      <Input
                        {...p}
                        type="number"
                        min={0}
                        value={
                          v.condition && v.condition.type === 'amount_at_least'
                            ? v.condition.value
                            : 0
                        }
                        onChange={(e) =>
                          onChange(i, {
                            ...v,
                            condition: {
                              type: 'amount_at_least',
                              value: Math.max(0, Number(e.target.value) || 0),
                              currency: null,
                            },
                          })
                        }
                      />
                    )}
                  </Field>
                )}
                {v.condition.type === 'months_at_least' && (
                  <Field label="Months">
                    {(p) => (
                      <Input
                        {...p}
                        type="number"
                        min={0}
                        value={
                          v.condition && v.condition.type === 'months_at_least'
                            ? v.condition.months
                            : 0
                        }
                        onChange={(e) =>
                          onChange(i, {
                            ...v,
                            condition: {
                              type: 'months_at_least',
                              months: Math.max(0, Math.round(Number(e.target.value) || 0)),
                            },
                          })
                        }
                      />
                    )}
                  </Field>
                )}
                {v.condition.type === 'tier_at_least' && (
                  <Field label="Tier">
                    {(p) => (
                      <Select
                        {...p}
                        value={String(
                          v.condition && v.condition.type === 'tier_at_least'
                            ? v.condition.tier
                            : 1,
                        )}
                        onChange={(e) =>
                          onChange(i, {
                            ...v,
                            condition: { type: 'tier_at_least', tier: Number(e.target.value) },
                          })
                        }
                      >
                        <option value="1">Tier 1</option>
                        <option value="2">Tier 2</option>
                        <option value="3">Tier 3</option>
                      </Select>
                    )}
                  </Field>
                )}
                {v.condition.type === 'platform_is' && (
                  <Field label="Platform">
                    {(p) => (
                      <Select
                        {...p}
                        value={
                          v.condition && v.condition.type === 'platform_is'
                            ? v.condition.platform
                            : 'twitch'
                        }
                        onChange={(e) =>
                          onChange(i, {
                            ...v,
                            condition: {
                              type: 'platform_is',
                              platform: e.target.value as Platform,
                            },
                          })
                        }
                      >
                        <option value="twitch">Twitch</option>
                        <option value="youtube">YouTube</option>
                        <option value="kick">Kick</option>
                      </Select>
                    )}
                  </Field>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {variations.length < 10 && (
        <Button
          size="sm"
          variant="secondary"
          icon={<Plus size={14} />}
          onClick={onAdd}
          className="self-start"
        >
          Add a variation
        </Button>
      )}
    </div>
  )
}

export function CssSection({ look, set }: SectionProps) {
  const problem = checkCss('css', look.css)
  return (
    <div className="flex flex-col gap-3">
      <Field
        label="Custom CSS"
        error={problem ? problem.replace(/^css: /, '') : null}
        hint={
          <>
            Styles only this alert. Classes:{' '}
            <code className="font-mono">.fa .fa-media .fa-text .fa-title .fa-body .hl</code>. Files
            from the internet aren’t allowed.
          </>
        }
      >
        {(p) => (
          <Textarea
            {...p}
            rows={10}
            spellCheck={false}
            value={look.css}
            maxLength={20_000}
            className="font-mono text-[14px]"
            onChange={(e) => set({ css: e.target.value }, { merge: true })}
          />
        )}
      </Field>
    </div>
  )
}

/** The small "Event art" stand-in for the layouts' picture. */
export function MediaGlyph() {
  return <ImageIcon size={16} />
}
