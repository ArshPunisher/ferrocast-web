import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  Bell,
  ChartBar,
  Gift,
  CaretLeft,
  ChatsCircle,
  Eye,
  EyeSlash,
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
  type Overlay,
  type OverlayState,
  type Platform,
  type Theme,
  type Widget,
  type WidgetKind,
} from '@ferrocast/api'
import {
  Button,
  Field,
  IconButton,
  Input,
  PlatformMark,
  Select,
  Skeleton,
  Switch,
  cx,
} from '@ferrocast/ui'
import { LoadError } from '../components/Panel'
import { Menu } from '../components/Menu'
import { OverlayPreview } from '../components/AlertStage'
import { ObsIcon, SecretUrl, useAddToObs } from '../components/obs'
import { TestAlertMenu } from '../components/alerts-live'
import { useAction, useClient, useResource } from '../lib/hooks'
import { href } from '../lib/router'
import { useLive } from '../lib/store'
import { useUnsavedWarning } from '../lib/unsaved'
import { SAMPLE_GIVEAWAY, SAMPLE_POLL, giveawayCard } from '../components/community/preview'

const GRID = 8

const KINDS: { kind: WidgetKind; label: string; icon: typeof Bell }[] = [
  { kind: 'alerts', label: 'Alerts', icon: Bell },
  { kind: 'chat', label: 'Chat', icon: ChatsCircle },
  { kind: 'events', label: 'Event list', icon: ListBullets },
  { kind: 'goal', label: 'Goal', icon: Target },
  { kind: 'label', label: 'Label', icon: Tag },
  { kind: 'viewers', label: 'Viewers', icon: UsersThree },
  { kind: 'poll', label: 'Poll', icon: ChartBar },
  { kind: 'giveaway', label: 'Giveaway', icon: Gift },
]
const kindInfo = (k: WidgetKind) => KINDS.find((x) => x.kind === k) ?? KINDS[0]!

const LABEL_SOURCES: { value: LabelSource; label: string }[] = [
  { value: 'latest_follower', label: 'Latest follower' },
  { value: 'latest_sub', label: 'Latest subscriber' },
  { value: 'latest_tip', label: 'Latest tip' },
  { value: 'top_tip_session', label: 'Top tip this stream' },
  { value: 'session_follows', label: 'Follows this stream' },
  { value: 'session_subs', label: 'Subs this stream' },
]

function newWidget(kind: WidgetKind, o: Overlay, goals: Goal[]): Widget {
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
  }
}

const snap = (n: number) => Math.round(n / GRID) * GRID

function clampWidget(w: Widget, o: Overlay): Widget {
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

function Canvas({
  overlay,
  selected,
  onSelect,
  onChange,
  preview,
  state,
}: {
  overlay: Overlay
  selected: string | null
  onSelect: (id: string | null) => void
  onChange: (w: Widget) => void
  preview: boolean
  state: OverlayState
}) {
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.5)
  const drag = useRef<{
    id: string
    mode: 'move' | 'resize'
    sx: number
    sy: number
    start: Widget
  } | null>(null)
  const [guides, setGuides] = useState<{ v: boolean; h: boolean }>({ v: false, h: false })
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setScale(el.clientWidth / overlay.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [overlay.width])

  const onDown = (e: React.PointerEvent, w: Widget, mode: 'move' | 'resize') => {
    if (e.button !== 0) return
    e.stopPropagation()
    onSelect(w.id)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { id: w.id, mode, sx: e.clientX, sy: e.clientY, start: w }
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = (e.clientX - d.sx) / scale
    const dy = (e.clientY - d.sy) / scale
    let next: Widget
    if (d.mode === 'move') {
      let x = snap(d.start.x + dx)
      let y = snap(d.start.y + dy)
      // Snap to the canvas centre lines, the most common alignment for alerts.
      const cx0 = (overlay.width - d.start.w) / 2
      const cy0 = (overlay.height - d.start.h) / 2
      const v = Math.abs(x - cx0) < 12
      const h = Math.abs(y - cy0) < 12
      if (v) x = Math.round(cx0)
      if (h) y = Math.round(cy0)
      setGuides({ v, h })
      next = { ...d.start, x, y }
    } else next = { ...d.start, w: snap(d.start.w + dx), h: snap(d.start.h + dy) }
    onChange(clampWidget(next, overlay))
  }
  const onUp = () => {
    drag.current = null
    setGuides({ v: false, h: false })
  }

  return (
    <div
      ref={box}
      className="relative aspect-video w-full touch-none overflow-hidden rounded-panel border border-line bg-[repeating-conic-gradient(var(--fc-surface-2)_0%_25%,var(--fc-surface-1)_0%_50%)] [background-size:24px_24px] select-none"
      onPointerDown={() => onSelect(null)}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      aria-label={`${overlay.name} layout, ${overlay.width} by ${overlay.height}`}
      role="group"
    >
      {preview && (
        <OverlayPreview
          overlay={overlay}
          state={state}
          live
          className="pointer-events-none absolute inset-0"
        />
      )}
      {guides.v && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-accent-text/70"
        />
      )}
      {guides.h && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-accent-text/70"
        />
      )}
      {overlay.widgets.map((w) => {
        const info = kindInfo(w.kind)
        const Icon = info.icon
        const sel = w.id === selected
        return (
          <div
            key={w.id}
            role="button"
            tabIndex={0}
            aria-pressed={sel}
            aria-label={`${info.label} widget at ${w.x}, ${w.y}, ${w.w} by ${w.h}. Arrow keys move it, Alt with arrows resizes.`}
            onPointerDown={(e) => onDown(e, w, 'move')}
            onFocus={() => onSelect(w.id)}
            onKeyDown={(e) => {
              const step = e.shiftKey ? GRID * 5 : GRID
              const map: Record<string, [number, number]> = {
                ArrowLeft: [-step, 0],
                ArrowRight: [step, 0],
                ArrowUp: [0, -step],
                ArrowDown: [0, step],
              }
              const m = map[e.key]
              if (!m) return
              e.preventDefault()
              onChange(
                clampWidget(
                  e.altKey
                    ? { ...w, w: w.w + m[0], h: w.h + m[1] }
                    : { ...w, x: w.x + m[0], y: w.y + m[1] },
                  overlay,
                ),
              )
            }}
            className={cx(
              'group absolute cursor-move rounded-[6px] border-2 transition-[border-color,background-color] duration-100 focus-visible:outline-none',
              sel
                ? 'border-accent-text bg-accent-soft/40'
                : preview
                  ? 'border-dashed border-line-strong/70 hover:border-text-3'
                  : 'border-line-strong bg-surface-1/70 hover:border-text-3',
            )}
            style={{ left: w.x * scale, top: w.y * scale, width: w.w * scale, height: w.h * scale }}
          >
            {(!preview || sel) && (
              <span
                className={cx(
                  'absolute top-1 left-1 inline-flex max-w-[calc(100%-8px)] items-center gap-1 truncate rounded-[5px] px-1.5 py-0.5 text-[11px] font-semibold',
                  sel ? 'bg-accent text-on-accent' : 'bg-surface-3 text-text-2',
                )}
              >
                <Icon size={12} weight="bold" />
                {info.label}
              </span>
            )}
            {sel && (
              <span
                role="presentation"
                onPointerDown={(e) => onDown(e, w, 'resize')}
                className="absolute -right-1.5 -bottom-1.5 size-4 cursor-nwse-resize rounded-[4px] border-2 border-accent-text bg-bg"
              />
            )}
          </div>
        )
      })}
    </div>
  )
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

function WidgetSettings({
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
  const theme = (
    <Field label="Look">
      {(p) => (
        <Select
          {...p}
          value={w.config.theme}
          onChange={(e) =>
            onChange({ ...w, config: { ...w.config, theme: e.target.value } } as Widget)
          }
        >
          {themes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.pro ? ' (Pro)' : ''}
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

export function OverlayEditor({ id }: { id: string }) {
  const client = useClient()
  const ov = useResource((c) => c.overlay(id), [id])
  const themes = useResource((c) => c.themes())
  const goals = useResource((c) => c.goals())
  const chat = useLive((s) => s.chat)
  const events = useLive((s) => s.events)
  const viewers = useLive((s) => s.viewers)
  const livePoll = useLive((s) => s.poll)
  const liveGiveaway = useLive((s) => s.giveaway)
  const { run, busy } = useAction()
  const { add, busy: adding, guide } = useAddToObs()
  const [draft, setDraft] = useState<Overlay | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [preview, setPreview] = useState(true)
  const reduce = useReducedMotion()
  useEffect(() => {
    if (ov.data) setDraft(ov.data)
  }, [ov.data])
  useUnsavedWarning(draft !== null && JSON.stringify(draft) !== JSON.stringify(ov.data))

  // Labels depend only on label widgets' text, not on where widgets sit, so dragging
  // doesn't rebuild the preview state.
  const labelKey = JSON.stringify(
    (draft?.widgets ?? []).flatMap((w) => (w.kind === 'label' ? [[w.id, w.config.template]] : [])),
  )
  const lastChat = chat.at(-1)?.id
  const lastEvent = events.at(-1)?.id
  const state: OverlayState = useMemo(
    () => ({
      goals: goals.data ?? [],
      labels: Object.fromEntries(
        (JSON.parse(labelKey) as [string, string][]).map(([id, t]) => [
          id,
          t.replace('{name}', 'LunaLagoon'),
        ]),
      ),
      viewers,
      events: events.slice(-25),
      chat: chat.slice(-30),
      // The real poll and giveaway when there are some, else samples to place them by.
      poll: livePoll ?? SAMPLE_POLL,
      giveaway: liveGiveaway ? giveawayCard(liveGiveaway) : SAMPLE_GIVEAWAY,
    }),
    // Keyed on the newest item: both lists are capped, so their lengths stop changing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [goals.data, labelKey, lastChat, lastEvent, livePoll, liveGiveaway],
  )

  if (ov.error) return <LoadError error={ov.error} onRetry={ov.reload} />
  if (!draft)
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="aspect-video w-full" />
      </div>
    )
  const dirty = JSON.stringify(draft) !== JSON.stringify(ov.data)
  const sel = draft.widgets.find((w) => w.id === selected) ?? null
  const update = (w: Widget) =>
    setDraft({ ...draft, widgets: draft.widgets.map((x) => (x.id === w.id ? w : x)) })
  const save = () =>
    void run('save', () => client.saveOverlay(draft), {
      success: 'Overlay saved. OBS updates by itself.',
    }).then((o) => o && ov.set(o))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={href({ name: 'overlays' })}
          className="fc-press inline-flex size-10 items-center justify-center rounded-control text-text-3 hover:bg-surface-2 hover:text-text"
          aria-label="Back to overlays"
        >
          <CaretLeft size={18} />
        </a>
        <h1 className="mr-auto min-w-0 truncate font-display text-2xl font-bold tracking-tight">
          {draft.name}
        </h1>
        <Button
          size="sm"
          variant="ghost"
          icon={preview ? <EyeSlash size={15} /> : <Eye size={15} />}
          onClick={() => setPreview((p) => !p)}
          aria-pressed={preview}
        >
          {preview ? 'Hide live view' : 'Live view'}
        </Button>
        <TestAlertMenu size="sm" />
        <Button
          size="sm"
          variant="primary"
          icon={<ObsIcon size={14} />}
          busy={adding === draft.id}
          onClick={() => void add(draft)}
        >
          Add to OBS
        </Button>
      </div>
      <SecretUrl url={draft.url} className="max-w-xl" />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-3">
          <Canvas
            overlay={draft}
            selected={selected}
            onSelect={setSelected}
            onChange={update}
            preview={preview}
            state={state}
          />
          <p className="text-[12.5px] text-text-3">
            Drag to move, drag the corner to resize. With the keyboard: Tab to a widget, arrows move
            it, Alt + arrows resizes, Shift for bigger steps.
          </p>
        </div>
        <aside
          className="flex flex-col gap-4 rounded-panel border border-line bg-surface-1 p-4 shadow-1"
          aria-label="Widget settings"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-[15px] font-semibold">Widgets</h2>
            <Menu
              label="Add a widget"
              align="end"
              trigger={(p) => (
                <Button {...p} size="sm" icon={<Plus size={14} weight="bold" />}>
                  Add
                </Button>
              )}
              items={KINDS.map((k) => ({
                key: k.kind,
                label: k.label,
                icon: <k.icon size={15} />,
                onSelect: () => {
                  const w = newWidget(k.kind, draft, goals.data ?? [])
                  setDraft({ ...draft, widgets: [...draft.widgets, w] })
                  setSelected(w.id)
                },
              }))}
            />
          </div>
          {draft.widgets.length === 0 ? (
            <p className="text-sm text-text-3">
              No widgets yet. Add alerts first: it’s what most streams need.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {draft.widgets.map((w) => {
                const Icon = kindInfo(w.kind).icon
                return (
                  <li key={w.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(w.id)}
                      aria-pressed={w.id === selected}
                      className={cx(
                        'flex w-full items-center gap-2 rounded-control px-2.5 py-2 text-left text-[13.5px] font-medium',
                        w.id === selected
                          ? 'bg-accent-soft text-text'
                          : 'text-text-2 hover:bg-surface-2',
                      )}
                    >
                      <Icon size={15} />
                      {kindInfo(w.kind).label}
                      <span className="ml-auto font-mono text-[11px] text-text-3">
                        {w.w}×{w.h}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <AnimatePresence mode="wait">
            {sel && (
              <motion.div
                key={sel.id}
                initial={reduce ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16 }}
                className="border-t border-line pt-4"
              >
                <WidgetSettings
                  w={sel}
                  themes={
                    themes.data ?? [
                      { id: DEFAULT_THEME, name: 'Molten', description: '', pro: false },
                    ]
                  }
                  goals={goals.data ?? []}
                  onGoalCreated={(g) => goals.set((prev) => [...(prev ?? []), g])}
                  onChange={(w) => update(clampWidget(w, draft))}
                  onRemove={() => {
                    setDraft({ ...draft, widgets: draft.widgets.filter((x) => x.id !== sel.id) })
                    setSelected(null)
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </aside>
      </div>
      <AnimatePresence>
        {dirty && (
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
            className="sticky bottom-[calc(76px+env(safe-area-inset-bottom))] z-10 flex items-center gap-3 rounded-panel border border-line-strong bg-surface-1 px-4 py-3 shadow-pop lg:bottom-4"
          >
            <p className="min-w-0 flex-1 text-[13px] text-text-2">
              Unsaved layout. OBS keeps the old one until you save.
            </p>
            <Button size="sm" variant="ghost" onClick={() => ov.data && setDraft(ov.data)}>
              Discard
            </Button>
            <Button size="sm" variant="primary" busy={busy === 'save'} onClick={save}>
              Save
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
      {guide}
    </div>
  )
}
