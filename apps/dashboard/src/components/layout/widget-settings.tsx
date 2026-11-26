// Widget settings and helpers shared by the overlay editor and the scene designer.

import { useState, type ComponentProps } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Bell,
  ChartBar,
  FilmStrip,
  Gift,
  ChatsCircle,
  ListBullets,
  Plus,
  PushPin,
  Sparkle,
  Tag,
  Target,
  Trash,
  UsersThree,
} from '@phosphor-icons/react'
import {
  DEFAULT_THEME,
  LABEL_SOURCES,
  PLATFORM_LABEL,
  type ChatPlatform,
  type CreditsSection,
  type EmotePhysics,
  type Goal,
  type LabelConfig,
  type LabelSource,
  type Platform,
  type Theme,
  type Widget,
  type WidgetKind,
} from '@ferrocast/api'
import { DESIGN_FONTS } from '@ferrocast/overlays'
import { Button, Field, IconButton, Input, PlatformMark, Select, Switch, cx } from '@ferrocast/ui'
import { useAction, useClient } from '../../lib/hooks'

export const GRID = 8

export const KINDS: { kind: WidgetKind; label: string; icon: typeof Bell }[] = [
  { kind: 'alerts', label: 'Alerts', icon: Bell },
  { kind: 'chat', label: 'Chat', icon: ChatsCircle },
  { kind: 'events', label: 'Event list', icon: ListBullets },
  { kind: 'goal', label: 'Goal', icon: Target },
  { kind: 'label', label: 'Label', icon: Tag },
  { kind: 'viewers', label: 'Viewers', icon: UsersThree },
  { kind: 'poll', label: 'Poll', icon: ChartBar },
  { kind: 'giveaway', label: 'Giveaway', icon: Gift },
  { kind: 'end_credits', label: 'End credits', icon: FilmStrip },
  { kind: 'emote_wall', label: 'Emote wall', icon: Sparkle },
  { kind: 'chat_highlight', label: 'Chat highlight', icon: PushPin },
]
export const kindInfo = (k: WidgetKind) => KINDS.find((x) => x.kind === k) ?? KINDS[0]!

const CREDITS_SECTION_LABEL: Record<CreditsSection, string> = {
  followers: 'Followers',
  subs: 'Subscribers',
  gifters: 'Gifters',
  tippers: 'Bits & tips',
  raiders: 'Raiders',
  mods: 'Moderators',
}

const ALL_CREDITS_SECTIONS: CreditsSection[] = [
  'followers',
  'subs',
  'gifters',
  'tippers',
  'raiders',
  'mods',
]

const HIGHLIGHT_DURATIONS = [
  { value: '', label: 'Until dismissed' },
  { value: '10', label: '10 seconds' },
  { value: '20', label: '20 seconds' },
  { value: '30', label: '30 seconds' },
  { value: '60', label: '60 seconds' },
  { value: '120', label: '2 minutes' },
]

const LABEL_GROUPS = ['Latest', 'This stream', 'This month', 'All time', 'Hype train'] as const

const DEFAULT_TEMPLATE_FOR_SOURCE: Partial<Record<LabelSource, string>> = {
  latest_follower: 'Latest follower: {value}',
  latest_sub: 'Latest sub: {value}',
  latest_gifter: 'Latest gifter: {value}',
  latest_tip: 'Latest tip: {value}',
  latest_bits: 'Latest bits: {value}',
  latest_raid: 'Latest raid: {value}',
  session_follows: 'Stream follows: {value}',
  session_subs: 'Stream subs: {value}',
  session_bits: 'Stream bits: {value}',
  session_tips: 'Stream tips: {value}',
  session_raids: 'Stream raids: {value}',
  top_tip_session: 'Top tip: {value}',
  top_supporter_session: 'Top supporter: {value}',
  monthly_follows: 'Month follows: {value}',
  monthly_subs: 'Month subs: {value}',
  monthly_bits: 'Month bits: {value}',
  monthly_tips: 'Month tips: {value}',
  monthly_raids: 'Month raids: {value}',
  top_tip_monthly: 'Top tip (month): {value}',
  top_supporter_monthly: 'Top supporter (month): {value}',
  alltime_follows: 'All-time follows: {value}',
  alltime_subs: 'All-time subs: {value}',
  alltime_bits: 'All-time bits: {value}',
  alltime_tips: 'All-time tips: {value}',
  alltime_raids: 'All-time raids: {value}',
  top_tip_alltime: 'Top tip (all time): {value}',
  top_supporter_alltime: 'Top supporter (all time): {value}',
  hype_train: 'Hype train · {value}',
}

const TIMEZONE_OPTIONS: { label: string; value: string; fallbackOffsetMin: number }[] = [
  { label: 'UTC', value: 'UTC', fallbackOffsetMin: 0 },
  { label: 'India (IST)', value: 'Asia/Kolkata', fallbackOffsetMin: 330 },
  { label: 'UK / London (GMT/BST)', value: 'Europe/London', fallbackOffsetMin: 0 },
  { label: 'Central Europe (CET/CEST)', value: 'Europe/Berlin', fallbackOffsetMin: 60 },
  { label: 'US Eastern (ET)', value: 'America/New_York', fallbackOffsetMin: -300 },
  { label: 'US Central (CT)', value: 'America/Chicago', fallbackOffsetMin: -360 },
  { label: 'US Pacific (PT)', value: 'America/Los_Angeles', fallbackOffsetMin: -480 },
  { label: 'Japan / Tokyo (JST)', value: 'Asia/Tokyo', fallbackOffsetMin: 540 },
  { label: 'Australia / Sydney (AET)', value: 'Australia/Sydney', fallbackOffsetMin: 600 },
]

function resolveTimezoneValue(config: LabelConfig): string {
  if (config.timezone && TIMEZONE_OPTIONS.some((tz) => tz.value === config.timezone)) {
    return config.timezone
  }
  if (typeof config.timezone_offset_min === 'number') {
    const match = TIMEZONE_OPTIONS.find((tz) => tz.fallbackOffsetMin === config.timezone_offset_min)
    if (match) return match.value
  }
  return 'UTC'
}

let idSeq = 0

/** Generates a collision-free widget or layer ID across rapid additions. */
export function nextWidgetId(prefix: 'l' | 'w', existing: readonly { id: string }[] = []): string {
  const taken = new Set(existing.map((w) => w.id))
  const stamp = Date.now().toString(36)
  let candidate: string
  do {
    idSeq += 1
    candidate = `${prefix}-${stamp}-${idSeq.toString(36)}`
  } while (taken.has(candidate))
  return candidate
}

export function newWidget(
  kind: WidgetKind,
  o: { width: number; height: number },
  goals: Goal[],
  existing: readonly { id: string }[] = [],
): Widget {
  const id = nextWidgetId('w', existing)
  const center = (w: number, h: number) => ({
    x: Math.round((o.width - w) / 2 / GRID) * GRID,
    y: Math.round((o.height - h) / 2 / GRID) * GRID,
    w,
    h,
  })
  switch (kind) {
    case 'alerts':
      return { id, kind, ...center(800, 360), config: { theme: DEFAULT_THEME, rule_ids: null } }
    case 'chat':
      return {
        id,
        kind,
        ...center(480, 520),
        config: {
          platforms: ['twitch', 'youtube', 'kick'],
          max_messages: 30,
          fade_after_s: null,
          show_badges: true,
          show_platform: true,
          hide_commands: true,
          hide_bots: true,
          font_size: 22,
          theme: DEFAULT_THEME,
        },
      }
    case 'events':
      return {
        id,
        kind,
        ...center(320, 400),
        config: {
          kinds: ['follow', 'subscription', 'gift_batch', 'tip', 'raid'],
          max_items: 6,
          theme: DEFAULT_THEME,
        },
      }
    case 'goal':
      return {
        id,
        kind,
        ...center(440, 112),
        config: { goal_id: goals[0]?.id ?? '', theme: DEFAULT_THEME },
      }
    case 'label':
      return {
        id,
        kind,
        ...center(420, 64),
        config: {
          source: 'latest_follower',
          template: 'Latest follower: {value}',
          theme: DEFAULT_THEME,
        },
      }
    case 'viewers':
      return {
        id,
        kind,
        ...center(260, 64),
        config: { platforms: ['twitch', 'youtube', 'kick'], theme: DEFAULT_THEME },
      }
    case 'poll':
      return { id, kind, ...center(560, 320), config: { theme: DEFAULT_THEME } }
    case 'giveaway':
      return { id, kind, ...center(560, 200), config: { theme: DEFAULT_THEME } }
    case 'end_credits':
      return {
        id,
        kind,
        ...center(800, 720),
        config: {
          theme: DEFAULT_THEME,
          title: 'Thanks for watching',
          sections: ['followers', 'subs', 'gifters', 'tippers', 'raiders', 'mods'],
          speed: 60,
          font: 'system',
          text_color: null,
          accent_color: null,
          background: null,
          loop: true,
        },
      }
    case 'emote_wall':
      return {
        id,
        kind,
        x: 0,
        y: 0,
        w: o.width,
        h: o.height,
        config: {
          theme: DEFAULT_THEME,
          platforms: [],
          max_emotes: 40,
          size: 56,
          lifetime_s: 6,
          physics: 'bounce',
        },
      }
    case 'chat_highlight':
      return {
        id,
        kind,
        ...center(620, 220),
        config: {
          theme: DEFAULT_THEME,
          duration_s: null,
          font_size: 24,
          show_badges: true,
          show_platform: true,
        },
      }
    case 'layer':
      return {
        id,
        kind,
        ...center(640, 120),
        config: { type: 'text', text: 'Your text', size: 64, weight: 800 },
      }
  }
}

export const snap = (n: number) => Math.round(n / GRID) * GRID

export function clampWidget(w: Widget, o: { width: number; height: number }): Widget {
  const ww = Math.min(Math.max(w.w, 40), o.width)
  const hh = Math.min(Math.max(w.h, 32), o.height)
  return {
    ...w,
    w: ww,
    h: hh,
    x: Math.min(Math.max(w.x, 0), o.width - ww),
    y: Math.min(Math.max(w.y, 0), o.height - hh),
  }
}

function PlatformChecks({
  value,
  onChange,
}: {
  value: Platform[]
  onChange: (v: Platform[]) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {(['twitch', 'youtube', 'kick'] as ChatPlatform[]).map((p) => {
        const on = value.length === 0 || value.includes(p)
        return (
          <button
            key={p}
            type="button"
            aria-pressed={on}
            onClick={() => {
              const all: Platform[] = value.length === 0 ? ['twitch', 'youtube', 'kick'] : value
              const next = on ? all.filter((x) => x !== p) : [...all, p]
              onChange(next.length ? next : [p])
            }}
            className={cx(
              'fc-press inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[14px] font-medium',
              on ? 'border-accent-line bg-accent-soft text-text' : 'border-line text-text-3',
            )}
          >
            <PlatformMark platform={p} size={12} />
            {PLATFORM_LABEL[p]}
          </button>
        )
      })}
    </div>
  )
}

function NewGoal({ onCreated }: { onCreated: (g: Goal) => void }) {
  const client = useClient()
  const { run, busy } = useAction()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<Goal['kind']>('subs')
  const [target, setTarget] = useState(50)
  if (!open)
    return (
      <Button
        size="sm"
        variant="ghost"
        icon={<Plus size={14} />}
        onClick={() => setOpen(true)}
        className="self-start"
      >
        New goal
      </Button>
    )
  return (
    <form
      className="flex flex-col gap-3 rounded-[12px] border border-line bg-surface-2 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        void run(
          'goal',
          () =>
            client.createGoal({
              title: title.trim() || 'New goal',
              kind,
              target,
              currency: kind === 'tips' ? 'INR' : null,
              starts_at: Date.now(),
              ends_at: null,
            }),
          { success: 'Goal created.' },
        ).then((g) => {
          if (g) {
            onCreated(g)
            setOpen(false)
          }
        })
      }}
    >
      <Field label="Title">
        {(p) => (
          <Input
            {...p}
            autoFocus
            data-autofocus
            value={title}
            maxLength={60}
            placeholder="New mic…"
            onChange={(e) => setTitle(e.target.value)}
          />
        )}
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Counts">
          {(p) => (
            <Select {...p} value={kind} onChange={(e) => setKind(e.target.value as Goal['kind'])}>
              <option value="follows">Follows</option>
              <option value="subs">Subs</option>
              <option value="tips">Tips (₹)</option>
              <option value="bits">Bits</option>
              <option value="custom">By hand</option>
            </Select>
          )}
        </Field>
        <Field label="Target">
          {(p) => (
            <Input
              {...p}
              type="number"
              min={1}
              value={target}
              onChange={(e) => setTarget(Math.max(1, Number(e.target.value) || 1))}
            />
          )}
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" type="submit" busy={busy === 'goal'}>
          Create goal
        </Button>
      </div>
    </form>
  )
}

export function WidgetSettings({
  w,
  themes,
  goals,
  onChange,
  onRemove,
  onGoalCreated,
}: {
  w: Widget
  themes: Theme[]
  goals: Goal[]
  onChange: (w: Widget) => void
  onRemove: () => void
  onGoalCreated: (g: Goal) => void
}) {
  const num = (k: 'x' | 'y' | 'w' | 'h') => (
    <Field label={k.toUpperCase()}>
      {(p) => (
        <Input
          {...p}
          type="number"
          inputMode="numeric"
          value={w[k]}
          onChange={(e) => onChange({ ...w, [k]: Math.round(Number(e.target.value) || 0) })}
          className="font-mono"
        />
      )}
    </Field>
  )
  const theme =
    w.kind === 'layer' ? null : (
      <Field label="Look">
        {(p) => (
          <Select
            {...p}
            value={'theme' in w.config ? w.config.theme : DEFAULT_THEME}
            onChange={(e) =>
              onChange({ ...w, config: { ...w.config, theme: e.target.value } } as Widget)
            }
          >
            {themes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
    )
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-[18px] font-extrabold">{kindInfo(w.kind).label}</h3>
        <IconButton size="sm" variant="danger-ghost" label="Remove widget" onClick={onRemove}>
          <Trash size={16} />
        </IconButton>
      </div>
      {theme}
      {w.kind === 'chat' && (
        <>
          <PlatformChecks
            value={w.config.platforms}
            onChange={(platforms) => onChange({ ...w, config: { ...w.config, platforms } })}
          />
          <Field label={`Text size ${w.config.font_size}px`}>
            {(p) => (
              <input
                {...p}
                type="range"
                min={14}
                max={40}
                value={w.config.font_size}
                onChange={(e) =>
                  onChange({ ...w, config: { ...w.config, font_size: Number(e.target.value) } })
                }
                className="h-8 w-full"
              />
            )}
          </Field>
          <Field
            label="Hide messages after"
            hint="Leave on “Never” to keep the last messages on screen."
          >
            {(p) => (
              <Select
                {...p}
                value={w.config.fade_after_s ?? ''}
                onChange={(e) =>
                  onChange({
                    ...w,
                    config: {
                      ...w.config,
                      fade_after_s: e.target.value ? Number(e.target.value) : null,
                    },
                  })
                }
              >
                <option value="">Never</option>
                {[15, 30, 60, 120].map((s) => (
                  <option key={s} value={s}>
                    {s} seconds
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Switch
            checked={w.config.show_platform}
            onChange={(v) => onChange({ ...w, config: { ...w.config, show_platform: v } })}
            label="Show platform icons"
          />
          <Switch
            checked={w.config.show_badges}
            onChange={(v) => onChange({ ...w, config: { ...w.config, show_badges: v } })}
            label="Show badges"
          />
          <Switch
            checked={w.config.hide_commands}
            onChange={(v) => onChange({ ...w, config: { ...w.config, hide_commands: v } })}
            label="Hide !commands"
          />
          <Switch
            checked={w.config.hide_bots}
            onChange={(v) => onChange({ ...w, config: { ...w.config, hide_bots: v } })}
            label="Hide bots"
          />
        </>
      )}
      {w.kind === 'viewers' && (
        <PlatformChecks
          value={w.config.platforms}
          onChange={(platforms) => onChange({ ...w, config: { ...w.config, platforms } })}
        />
      )}
      {w.kind === 'events' && (
        <Field label={`Show the last ${w.config.max_items}`}>
          {(p) => (
            <input
              {...p}
              type="range"
              min={1}
              max={15}
              value={w.config.max_items}
              onChange={(e) =>
                onChange({ ...w, config: { ...w.config, max_items: Number(e.target.value) } })
              }
              className="h-8 w-full"
            />
          )}
        </Field>
      )}
      {w.kind === 'goal' && (
        <>
          {goals.length > 0 && (
            <Field label="Goal">
              {(p) => (
                <Select
                  {...p}
                  value={w.config.goal_id}
                  onChange={(e) =>
                    onChange({ ...w, config: { ...w.config, goal_id: e.target.value } })
                  }
                >
                  {goals.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          <NewGoal
            onCreated={(g) => {
              onGoalCreated(g)
              onChange({ ...w, config: { ...w.config, goal_id: g.id } })
            }}
          />
        </>
      )}
      {w.kind === 'label' && (
        <LabelSettings
          config={w.config}
          onChange={(nextCfg) => onChange({ ...w, config: nextCfg })}
        />
      )}
      {w.kind === 'end_credits' && (
        <EndCreditsFields w={w} onChange={(config) => onChange({ ...w, config })} />
      )}
      {w.kind === 'emote_wall' && (
        <>
          <Field label="Physics">
            {(p) => (
              <Select
                {...p}
                value={w.config.physics}
                onChange={(e) =>
                  onChange({
                    ...w,
                    config: { ...w.config, physics: e.target.value as EmotePhysics },
                  })
                }
              >
                <option value="bounce">Bounce around screen</option>
                <option value="rain">Rain from top</option>
                <option value="fountain">Fountain from bottom</option>
              </Select>
            )}
          </Field>
          <PlatformChecks
            value={w.config.platforms}
            onChange={(platforms) => onChange({ ...w, config: { ...w.config, platforms } })}
          />
          <Field label={`Max emotes on screen (${w.config.max_emotes})`}>
            {(p) => (
              <input
                {...p}
                type="range"
                min={5}
                max={120}
                step={5}
                value={w.config.max_emotes}
                onChange={(e) =>
                  onChange({
                    ...w,
                    config: { ...w.config, max_emotes: Number(e.target.value) },
                  })
                }
                className="h-8 w-full"
              />
            )}
          </Field>
          <Field label={`Emote size (${w.config.size} px)`}>
            {(p) => (
              <input
                {...p}
                type="range"
                min={24}
                max={128}
                step={4}
                value={w.config.size}
                onChange={(e) =>
                  onChange({ ...w, config: { ...w.config, size: Number(e.target.value) } })
                }
                className="h-8 w-full"
              />
            )}
          </Field>
          <Field label={`On screen for ${w.config.lifetime_s} s`}>
            {(p) => (
              <input
                {...p}
                type="range"
                min={1}
                max={20}
                step={1}
                value={w.config.lifetime_s}
                onChange={(e) =>
                  onChange({ ...w, config: { ...w.config, lifetime_s: Number(e.target.value) } })
                }
                className="h-8 w-full"
              />
            )}
          </Field>
        </>
      )}
      {w.kind === 'chat_highlight' && (
        <>
          <Field
            label="Auto-hide after"
            hint="Pin a message from Chat with “Show on stream”. Clear it there or set a timer."
          >
            {(p) => (
              <Select
                {...p}
                value={w.config.duration_s === null ? '' : String(w.config.duration_s)}
                onChange={(e) =>
                  onChange({
                    ...w,
                    config: {
                      ...w.config,
                      duration_s: e.target.value ? Number(e.target.value) : null,
                    },
                  })
                }
              >
                {HIGHLIGHT_DURATIONS.map((opt) => (
                  <option key={opt.label} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={`Text size (${w.config.font_size} px)`}>
            {(p) => (
              <input
                {...p}
                type="range"
                min={14}
                max={48}
                step={2}
                value={w.config.font_size}
                onChange={(e) =>
                  onChange({ ...w, config: { ...w.config, font_size: Number(e.target.value) } })
                }
                className="h-8 w-full"
              />
            )}
          </Field>
          <Switch
            checked={w.config.show_platform}
            onChange={(v) => onChange({ ...w, config: { ...w.config, show_platform: v } })}
            label="Show platform icon"
          />
          <Switch
            checked={w.config.show_badges}
            onChange={(v) => onChange({ ...w, config: { ...w.config, show_badges: v } })}
            label="Show viewer badges"
          />
        </>
      )}
      <details className="rounded-[12px] border border-line">
        <summary className="cursor-pointer list-none px-3 py-2.5 text-[14.5px] font-semibold text-text-2 hover:text-text">
          Exact position
        </summary>
        <div className="grid grid-cols-4 gap-2 px-3 pb-3">
          {num('x')}
          {num('y')}
          {num('w')}
          {num('h')}
        </div>
      </details>
    </div>
  )
}

function BoundedNumberInput({
  value,
  min,
  max,
  onCommit,
  ...rest
}: {
  value: number
  min: number
  max: number
  onCommit: (next: number) => void
} & Omit<ComponentProps<typeof Input>, 'type' | 'value' | 'onChange' | 'min' | 'max'>) {
  const [draft, setDraft] = useState<string | null>(null)

  return (
    <Input
      {...rest}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={draft ?? String(value)}
      onFocus={(e) => {
        setDraft(String(value))
        rest.onFocus?.(e)
      }}
      onChange={(e) => {
        const raw = e.target.value
        setDraft(raw)
        if (raw.trim() === '') return
        const parsed = Number(raw)
        if (!Number.isFinite(parsed)) return
        const rounded = Math.round(parsed)
        if (rounded >= min && rounded <= max && rounded !== value) {
          onCommit(rounded)
        }
      }}
      onBlur={(e) => {
        const raw = (draft ?? String(value)).trim()
        const parsed = raw === '' ? Number.NaN : Number(raw)
        const base = Number.isFinite(parsed) ? Math.round(parsed) : value
        const next = Math.max(min, Math.min(max, base))
        setDraft(null)
        if (next !== value) onCommit(next)
        rest.onBlur?.(e)
      }}
    />
  )
}

function LabelSettings({
  config,
  onChange,
}: {
  config: LabelConfig
  onChange: (next: LabelConfig) => void
}) {
  const isTrain = config.source === 'hype_train'
  const isMonthly = config.source.startsWith('monthly_') || config.source.endsWith('_monthly')

  const onSourceChange = (nextSource: LabelSource) => {
    const prevDef = DEFAULT_TEMPLATE_FOR_SOURCE[config.source]
    const nextDef = DEFAULT_TEMPLATE_FOR_SOURCE[nextSource]
    const isDefaultTpl =
      !config.template ||
      config.template === '{value}' ||
      config.template === prevDef ||
      config.template === 'Latest follower: {name}'
    const template = isDefaultTpl ? (nextDef ?? '{value}') : config.template
    onChange({
      ...config,
      source: nextSource,
      template,
    })
  }

  return (
    <>
      <Field label="Shows">
        {(p) => (
          <Select
            {...p}
            value={config.source}
            onChange={(e) => onSourceChange(e.target.value as LabelSource)}
          >
            {LABEL_GROUPS.map((grp) => (
              <optgroup key={grp} label={grp}>
                {LABEL_SOURCES.filter((s) => s.group === grp).map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        )}
      </Field>
      <Field
        label="Text"
        hint={
          isTrain
            ? 'Variables: {value}, {level}, {count}, {timer}, {contributors}, {latest}.'
            : '{value} is replaced with the live figure.'
        }
      >
        {(p) => (
          <Input
            {...p}
            value={config.template}
            maxLength={240}
            onChange={(e) => onChange({ ...config, template: e.target.value })}
          />
        )}
      </Field>
      {isMonthly && (
        <Field label="Month boundary timezone">
          {(p) => (
            <Select
              {...p}
              value={resolveTimezoneValue(config)}
              onChange={(e) => {
                const tz = TIMEZONE_OPTIONS.find((opt) => opt.value === e.target.value)
                if (!tz) return
                onChange({
                  ...config,
                  timezone: tz.value,
                  timezone_offset_min: tz.fallbackOffsetMin,
                })
              }}
            >
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      {isTrain && (
        <div className="grid grid-cols-2 gap-2.5 rounded-[12px] border border-line bg-inset p-3">
          <Field label="Window (s)">
            {(p) => (
              <BoundedNumberInput
                {...p}
                min={10}
                max={3600}
                value={config.train_window_s ?? 120}
                onCommit={(v) => {
                  const maxS = Math.max(v, config.train_max_s ?? 300)
                  onChange({ ...config, train_window_s: v, train_max_s: maxS })
                }}
              />
            )}
          </Field>
          <Field label="Grow per event (s)">
            {(p) => (
              <BoundedNumberInput
                {...p}
                min={1}
                max={600}
                value={config.train_step_s ?? 15}
                onCommit={(v) => onChange({ ...config, train_step_s: v })}
              />
            )}
          </Field>
          <Field label="Max timer (s)">
            {(p) => (
              <BoundedNumberInput
                {...p}
                min={config.train_window_s ?? 10}
                max={7200}
                value={config.train_max_s ?? 300}
                onCommit={(v) => onChange({ ...config, train_max_s: v })}
              />
            )}
          </Field>
          <Field label="Events to start">
            {(p) => (
              <BoundedNumberInput
                {...p}
                min={1}
                max={50}
                value={config.train_threshold ?? 3}
                onCommit={(v) => onChange({ ...config, train_threshold: v })}
              />
            )}
          </Field>
        </div>
      )}
    </>
  )
}

function OptionalColorField({
  label,
  value,
  fallbackHex,
  onChange,
}: {
  label: string
  value: string | null
  fallbackHex: string
  onChange: (next: string | null) => void
}) {
  return (
    <Field label={label}>
      {(p) => (
        <div className="flex flex-wrap items-center gap-2">
          <input
            aria-label={`${label} colour picker`}
            type="color"
            // A picker only takes #rrggbb; a valid #fff or #rrggbbaa stays in the text box.
            value={value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallbackHex}
            onChange={(e) => onChange(e.target.value)}
            className="h-9 w-11 shrink-0 cursor-pointer rounded-control border border-line bg-surface-2 p-1"
          />
          <Input
            {...p}
            value={value ?? ''}
            placeholder="Theme default"
            maxLength={16}
            onChange={(e) => {
              const raw = e.target.value.trim()
              onChange(raw === '' ? null : raw)
            }}
            className="font-mono"
          />
          {value !== null && (
            <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
              Reset
            </Button>
          )}
        </div>
      )}
    </Field>
  )
}

function EndCreditsFields({
  w,
  onChange,
}: {
  w: Extract<Widget, { kind: 'end_credits' }>
  onChange: (cfg: Extract<Widget, { kind: 'end_credits' }>['config']) => void
}) {
  const cfg = w.config
  const active = cfg.sections.length ? cfg.sections : ALL_CREDITS_SECTIONS
  const ordered: CreditsSection[] = [
    ...active,
    ...ALL_CREDITS_SECTIONS.filter((s) => !active.includes(s)),
  ]
  const toggleSection = (sec: CreditsSection) => {
    if (active.includes(sec)) {
      if (active.length <= 1) return
      onChange({ ...cfg, sections: active.filter((s) => s !== sec) })
    } else {
      onChange({ ...cfg, sections: [...active, sec] })
    }
  }
  const moveSection = (sec: CreditsSection, delta: -1 | 1) => {
    const idx = active.indexOf(sec)
    const nextIdx = idx + delta
    if (idx < 0 || nextIdx < 0 || nextIdx >= active.length) return
    const copy = [...active]
    const [picked] = copy.splice(idx, 1)
    if (!picked) return
    copy.splice(nextIdx, 0, picked)
    onChange({ ...cfg, sections: copy })
  }

  return (
    <>
      <Field label="Heading">
        {(p) => (
          <Input
            {...p}
            value={cfg.title ?? 'Thanks for watching'}
            maxLength={80}
            onChange={(e) => onChange({ ...cfg, title: e.target.value })}
          />
        )}
      </Field>
      <Field label="Sections" hint="Choose at least one group and order how they roll.">
        {() => (
          <ul className="flex flex-col gap-1.5">
            {ordered.map((sec) => {
              const checked = active.includes(sec)
              const activeIdx = active.indexOf(sec)
              const lastOne = checked && active.length === 1
              return (
                <li
                  key={sec}
                  className="flex items-center justify-between gap-2 rounded-control border border-line bg-surface-2 px-2.5 py-1.5"
                >
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-[14px] font-medium">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={lastOne}
                      onChange={() => toggleSection(sec)}
                      className="size-4 accent-[var(--fc-accent)]"
                    />
                    <span className="truncate">{CREDITS_SECTION_LABEL[sec]}</span>
                  </label>
                  {checked && (
                    <div className="flex items-center gap-0.5">
                      <IconButton
                        size="sm"
                        label={`Move ${CREDITS_SECTION_LABEL[sec]} up`}
                        disabled={activeIdx <= 0}
                        onClick={() => moveSection(sec, -1)}
                      >
                        <ArrowUp size={14} />
                      </IconButton>
                      <IconButton
                        size="sm"
                        label={`Move ${CREDITS_SECTION_LABEL[sec]} down`}
                        disabled={activeIdx >= active.length - 1}
                        onClick={() => moveSection(sec, 1)}
                      >
                        <ArrowDown size={14} />
                      </IconButton>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Field>
      <Field label={`Scroll speed (${cfg.speed} px/s)`}>
        {(p) => (
          <input
            {...p}
            type="range"
            min={20}
            max={300}
            step={10}
            value={cfg.speed}
            onChange={(e) => onChange({ ...cfg, speed: Number(e.target.value) })}
            className="h-8 w-full"
          />
        )}
      </Field>
      <Field label="Font">
        {(p) => (
          <Select
            {...p}
            value={cfg.font ?? 'system'}
            onChange={(e) => onChange({ ...cfg, font: e.target.value })}
          >
            <option value="system">System UI</option>
            {DESIGN_FONTS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <OptionalColorField
        label="Text colour"
        value={cfg.text_color ?? null}
        fallbackHex="#eef0f5"
        onChange={(text_color) => onChange({ ...cfg, text_color })}
      />
      <OptionalColorField
        label="Accent colour"
        value={cfg.accent_color ?? null}
        fallbackHex="#ff7a59"
        onChange={(accent_color) => onChange({ ...cfg, accent_color })}
      />
      <OptionalColorField
        label="Background colour"
        value={cfg.background ?? null}
        fallbackHex="#12141a"
        onChange={(background) => onChange({ ...cfg, background })}
      />
      <Switch
        checked={cfg.loop !== false}
        onChange={(loop) => onChange({ ...cfg, loop })}
        label="Loop continuously"
      />
    </>
  )
}
