// Widget settings and helpers shared by the overlay editor and the scene designer.

import { useState } from 'react'
import {
  Bell,
  ChartBar,
  Gift,
  ChatsCircle,
  ListBullets,
  Plus,
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
  type Goal,
  type LabelConfig,
  type LabelSource,
  type Platform,
  type Theme,
  type Widget,
  type WidgetKind,
} from '@ferrocast/api'
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
]
export const kindInfo = (k: WidgetKind) => KINDS.find((x) => x.kind === k) ?? KINDS[0]!

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

export function newWidget(
  kind: WidgetKind,
  o: { width: number; height: number },
  goals: Goal[],
): Widget {
  const id = `w-${Date.now().toString(36)}`
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
              <Input
                {...p}
                type="number"
                min={10}
                max={3600}
                value={config.train_window_s ?? 120}
                onChange={(e) => {
                  const v = Math.max(10, Math.min(3600, Math.round(Number(e.target.value) || 120)))
                  const maxS = Math.max(v, config.train_max_s ?? 300)
                  onChange({ ...config, train_window_s: v, train_max_s: maxS })
                }}
              />
            )}
          </Field>
          <Field label="Grow per event (s)">
            {(p) => (
              <Input
                {...p}
                type="number"
                min={1}
                max={600}
                value={config.train_step_s ?? 15}
                onChange={(e) => {
                  const v = Math.max(1, Math.min(600, Math.round(Number(e.target.value) || 15)))
                  onChange({ ...config, train_step_s: v })
                }}
              />
            )}
          </Field>
          <Field label="Max timer (s)">
            {(p) => (
              <Input
                {...p}
                type="number"
                min={config.train_window_s ?? 10}
                max={7200}
                value={config.train_max_s ?? 300}
                onChange={(e) => {
                  const win = config.train_window_s ?? 120
                  const v = Math.max(win, Math.min(7200, Math.round(Number(e.target.value) || 300)))
                  onChange({ ...config, train_max_s: v })
                }}
              />
            )}
          </Field>
          <Field label="Events to start">
            {(p) => (
              <Input
                {...p}
                type="number"
                min={1}
                max={50}
                value={config.train_threshold ?? 3}
                onChange={(e) => {
                  const v = Math.max(1, Math.min(50, Math.round(Number(e.target.value) || 3)))
                  onChange({ ...config, train_threshold: v })
                }}
              />
            )}
          </Field>
        </div>
      )}
    </>
  )
}
