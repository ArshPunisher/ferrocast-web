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
  PLATFORM_LABEL,
  type ChatPlatform,
  type Goal,
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

const LABEL_SOURCES: { value: LabelSource; label: string }[] = [
  { value: 'latest_follower', label: 'Latest follower' },
  { value: 'latest_sub', label: 'Latest subscriber' },
  { value: 'latest_tip', label: 'Latest tip' },
  { value: 'top_tip_session', label: 'Top tip this stream' },
  { value: 'session_follows', label: 'Follows this stream' },
  { value: 'session_subs', label: 'Subs this stream' },
]

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
          template: 'Latest follower: {name}',
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
              'fc-press inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium',
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
        <h3 className="font-display text-[15px] font-semibold">{kindInfo(w.kind).label}</h3>
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
        <>
          <Field label="Shows">
            {(p) => (
              <Select
                {...p}
                value={w.config.source}
                onChange={(e) =>
                  onChange({ ...w, config: { ...w.config, source: e.target.value as LabelSource } })
                }
              >
                {LABEL_SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Text" hint="{name} is replaced with the value.">
            {(p) => (
              <Input
                {...p}
                value={w.config.template}
                maxLength={120}
                onChange={(e) =>
                  onChange({ ...w, config: { ...w.config, template: e.target.value } })
                }
              />
            )}
          </Field>
        </>
      )}
      <details className="rounded-[12px] border border-line">
        <summary className="cursor-pointer list-none px-3 py-2.5 text-[13px] font-semibold text-text-2 hover:text-text">
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
