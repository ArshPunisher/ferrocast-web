// Go live everywhere (2.0): Studio's first tab. Owner's picks from the 22 Oct board: the
// platforms as one list in pause order (2A), setup in three steps that shrink to one line (3A),
// the upload check as a table (4B), a health line per platform while live (5A), and a dialog
// for a server of your own (7). API.md §4 "Go live everywhere".

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import {
  ArrowCounterClockwise,
  ArrowsClockwise,
  Broadcast,
  CheckCircle,
  Copy,
  DotsSixVertical,
  Gauge,
  Info,
  LockSimple,
  Pause,
  Plus,
  Plug,
  Trash,
  Warning,
} from '@phosphor-icons/react'
import {
  aitumClashes,
  andList,
  describeError,
  goliveApi,
  goingTo,
  healthText,
  mbps,
  onCanvas,
  type Canvas,
  type DestinationView,
  type GoLiveView,
  type Service,
  type UploadCheck,
} from '@ferrocast/api'
import {
  Badge,
  Button,
  Dialog,
  Field,
  IconButton,
  Input,
  PlatformMark,
  Skeleton,
  Switch,
  cx,
  toast,
} from '@ferrocast/ui'
import { LoadError, Panel } from '../Panel'
import { useAction, useClient, useNow, useResource } from '../../lib/hooks'
import { useLive } from '../../lib/store'
import { href } from '../../lib/router'
import { useObsHealth } from './obs'

export function useGoLive() {
  const client = useClient()
  return useMemo(() => goliveApi(client), [client])
}

const NAMES: Record<Exclude<Service, 'custom'>, string> = {
  twitch: 'Twitch',
  youtube: 'YouTube',
  kick: 'Kick',
}

export function Logo({ kind, size = 30 }: { kind: Service; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-[8px] bg-surface-3"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {kind === 'custom' ? (
        <Broadcast size={Math.round(size * 0.55)} className="text-text-2" />
      ) : (
        <PlatformMark platform={kind} size={Math.round(size * 0.55)} />
      )}
    </span>
  )
}

/** The view with newer readings on top: the live frame's destinations and numbers, and
 *  whether OBS is streaming from the OBS health reading (OBS starts and stops on its own). */
export function useMerged(view: GoLiveView | null): GoLiveView | null {
  const frame = useLive((s) => s.studio.golive)
  const health = useObsHealth()
  if (!view) return null
  const obs = health ? { ...view.obs, streaming: health.streaming } : view.obs
  if (!frame) return { ...view, obs }
  return {
    ...view,
    obs,
    live: frame.live,
    stats: frame.stats,
    vertical_live: frame.vertical_live ?? view.vertical_live,
    vertical_stats: frame.vertical_stats ?? view.vertical_stats,
    destinations: frame.destinations,
    cut: {
      ...view.cut,
      state: frame.cut_state === undefined ? view.cut.state : frame.cut_state,
      ffmpeg: frame.ffmpeg ?? view.cut.ffmpeg,
    },
  }
}

export function GoLiveTab() {
  const api = useGoLive()
  const res = useResource(() => api.view(), [api])
  const view = useMerged(res.data)
  const live = !!view?.live
  const reload = res.reload
  // While live, OBS's side (Aitum Multistream's outputs) is read again every 15 s.
  useEffect(() => {
    if (!live) return
    const t = setInterval(reload, 15_000)
    return () => clearInterval(t)
  }, [live, reload])
  if (res.error && !view) return <LoadError error={res.error} onRetry={res.reload} />
  if (!view)
    return (
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Skeleton className="h-80" />
        <Skeleton className="h-64" />
      </div>
    )
  const set = (patch: Partial<GoLiveView>) => res.set((v) => ({ ...(v ?? view), ...patch }))
  const clashes = aitumClashes(view.obs.aitum, onCanvas(view.destinations, 'main'))
  return (
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-5">
        {view.live && <LiveCard view={view} onSaved={res.reload} />}
        <Platforms view={view} onSaved={res.reload} onProtect={(protect) => set({ protect })} />
      </div>
      <div className="flex min-w-0 flex-col gap-5">
        {!view.live && !view.aitum_ok && clashes.length > 0 && (
          <AitumNote names={clashes.map((c) => c.name)} onOk={() => set({ aitum_ok: true })} />
        )}
        <Setup view={view} onObs={(obs) => set({ obs })} onUpload={(upload) => set({ upload })} />
        {view.upload && <Upload view={view} onUpload={(upload) => set({ upload })} />}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- 5A: while live

export function LiveCard({
  view,
  onSaved,
  canvas = 'main',
}: {
  view: GoLiveView
  onSaved: () => void
  canvas?: Canvas
}) {
  const now = useNow(1000)
  const api = useGoLive()
  const { run, busy } = useAction()
  const on = onCanvas(view.destinations, canvas).filter((d) => d.enabled)
  const live = on.filter((d) => d.health?.state === 'live')
  const paused = on.filter((d) => d.health?.state === 'paused').length
  const out = live.reduce((a, d) => a + (d.health?.kbps ?? 0), 0)
  const since = Math.min(...on.map((d) => d.health?.since_ms ?? Infinity))
  const stopTrying = (id: string) =>
    void run(`stop:${id}`, () =>
      api.saveOrder(
        view.destinations.map((d) => ({ id: d.id, enabled: d.enabled && d.id !== id })),
      ),
    ).then((r) => r && onSaved())
  const resume = (d: DestinationView) =>
    void run(`resume:${d.id}`, () => api.resume(d.id).then(() => true), {
      success: `${d.name} is coming back.`,
    }).then((r) => r && onSaved())
  return (
    <Panel id={canvas === 'main' ? 'golive-live' : 'vertical-live'}>
      <div className="flex flex-col gap-3">
        <h2 className="sr-only">
          {canvas === 'main' ? 'Live on your platforms' : 'Vertical stream live'}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex h-7 items-center gap-2 rounded-full bg-[#c42339] px-3 font-mono text-[12px] font-extrabold tracking-[0.06em] text-white">
            <span className="size-[7px] rounded-full bg-white" aria-hidden />
            LIVE
          </span>
          {Number.isFinite(since) && (
            <b className="font-display text-[17px] tabular-nums">{elapsed(now - since)}</b>
          )}
          <span className="text-[13px] text-text-3">
            {live.length} of {on.length} live{paused > 0 ? ` · ${paused} paused` : ''} · {mbps(out)}{' '}
            going out
          </span>
        </div>
        <ul
          className="overflow-hidden rounded-[12px] border border-line"
          aria-label="Health per platform"
        >
          {on.map((d) => {
            const h = healthText(d.health, d.blocked)
            return (
              <li
                key={d.id}
                className={cx(
                  'grid grid-cols-[30px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 border-b border-line px-3.5 py-3 last:border-b-0 sm:grid-cols-[30px_minmax(0,1fr)_auto]',
                  h.tone === 'warn' ? 'bg-warn-soft' : 'bg-surface-1',
                )}
              >
                <Logo kind={d.kind} />
                <div className="min-w-0">
                  <span
                    className={cx(
                      'flex items-center gap-1.5 text-[13.5px] font-bold',
                      h.tone === 'ok' && 'text-ok',
                      h.tone === 'warn' && 'text-warn',
                      h.tone === 'bad' && 'text-danger',
                      (h.tone === 'off' || h.tone === 'paused') && 'text-text-3',
                    )}
                  >
                    {h.tone === 'warn' ? (
                      <ArrowsClockwise size={14} aria-hidden />
                    ) : h.tone === 'paused' ? (
                      <Pause size={14} weight="fill" aria-hidden />
                    ) : (
                      <span className="size-[7px] rounded-full bg-current" aria-hidden />
                    )}
                    <span>
                      {d.name}: {h.label}
                    </span>
                  </span>
                  {h.detail && <p className="m-0 text-[12.5px] text-text-3">{h.detail}</p>}
                  {d.health?.state === 'paused' && d.health.until_ms > now && (
                    <p className="m-0 text-[12.5px] text-text-3 tabular-nums">
                      Back in {waitText(d.health.until_ms - now)} at the earliest.
                    </p>
                  )}
                </div>
                {h.tone === 'paused' ? (
                  <Button
                    size="sm"
                    className="col-start-2 justify-self-start sm:col-start-auto"
                    busy={busy === `resume:${d.id}`}
                    onClick={() => resume(d)}
                  >
                    Resume now
                  </Button>
                ) : h.tone === 'warn' || h.tone === 'bad' ? (
                  <Button
                    size="sm"
                    className="col-start-2 justify-self-start sm:col-start-auto"
                    busy={busy === `stop:${d.id}`}
                    onClick={() => stopTrying(d.id)}
                  >
                    Stop trying
                  </Button>
                ) : (
                  <span className="hidden sm:block" />
                )}
              </li>
            )
          })}
        </ul>
        {(canvas === 'main' ? aitumClashes(view.obs.aitum, on, true) : []).map((c) => {
          const d = view.destinations.find((x) => x.id === c.id)
          if (d?.health?.state !== 'live') return null
          return (
            <div
              key={c.id}
              role="status"
              className="grid grid-cols-[16px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 rounded-[10px] border border-warn/30 bg-warn-soft px-3 py-2.5 text-[13px] text-text-2 sm:grid-cols-[16px_minmax(0,1fr)_auto]"
            >
              <Warning size={16} weight="fill" className="shrink-0 text-warn" aria-hidden />
              <span className="min-w-0">
                <b className="text-text">{c.name} is getting your stream twice</b> (from Ferrocast
                and from Aitum Multistream). Stop one to free about {mbps(d.health.kbps)} of upload.
              </span>
              <Button
                size="sm"
                className="col-start-2 justify-self-start sm:col-start-auto"
                busy={busy === `stop:${c.id}`}
                onClick={() => stopTrying(c.id)}
              >
                Stop Ferrocast’s copy
              </Button>
            </div>
          )
        })}
        <p className="m-0 text-[12.5px] text-text-3">
          Adding or removing a platform below doesn’t end the stream.
        </p>
      </div>
    </Panel>
  )
}

/** `45 s`, then whole minutes rounded up: `2 min`. */
function waitText(ms: number): string {
  const s = Math.max(1, Math.ceil(ms / 1000))
  return s < 60 ? `${s} s` : `${Math.ceil(s / 60)} min`
}

function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const p = (n: number) => String(n).padStart(2, '0')
  return `${Math.floor(s / 3600)}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`
}

// ---------------------------------------------------------------- 2A: the platforms

export function Platforms({
  view,
  onSaved,
  onProtect,
  canvas = 'main',
}: {
  view: GoLiveView
  onSaved: () => void
  onProtect?: (on: boolean) => void
  canvas?: Canvas
}) {
  const api = useGoLive()
  const { run, busy } = useAction()
  const mine = onCanvas(view.destinations, canvas)
  const others = view.destinations.filter((d) => !mine.includes(d))
  const [rows, setRows] = useState(mine)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<DestinationView | null>(null)
  const dragged = useRef<number | null>(null)
  // A fresh view (a frame, a save) wins over local edits once it arrives.
  const key = mine.map((d) => `${d.id}:${d.enabled}`).join(',')
  const [seen, setSeen] = useState(key)
  if (seen !== key) {
    setSeen(key)
    setRows(mine)
  }
  const merged = rows.map((r) => mine.find((d) => d.id === r.id) ?? r)

  // The other picture's destinations go along unchanged (the engine wants every one).
  const save = (next: DestinationView[], label: string) => {
    setRows(next)
    const all = canvas === 'main' ? [...next, ...others] : [...others, ...next]
    void run('order', () => api.saveOrder(all.map((d) => ({ id: d.id, enabled: d.enabled }))), {
      success: label,
    }).then((r) => {
      if (r) onSaved()
      else setRows(mine)
    })
  }
  const move = (from: number, to: number) => {
    if (to < 0 || to >= rows.length || from === to) return
    const next = [...rows]
    const [x] = next.splice(from, 1)
    if (x) next.splice(to, 0, x)
    save(next, '')
  }
  const onGripKey = (i: number) => (e: KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      move(i, i - 1)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      move(i, i + 1)
    }
  }
  const toggle = (id: string, enabled: boolean) =>
    save(
      rows.map((d) => (d.id === id ? { ...d, enabled } : d)),
      '',
    )
  const remove = (d: DestinationView) =>
    void run(`rm:${d.id}`, () => api.removeCustom(d.id).then(() => true), {
      success: `${d.name} removed.`,
    }).then((r) => {
      setRemoving(null)
      if (r) onSaved()
    })
  const protect = (on: boolean) =>
    void run('protect', () => api.setProtect(on), {
      success: on ? 'Upload protection is on.' : 'Upload protection is off.',
    }).then((r) => r && onProtect?.(r.protect))

  const ticked = merged.filter((d) => d.enabled)
  const vertical = canvas === 'vertical'
  // Before anything streamed: what the engine plans (1080p60, or 1080x1920 for vertical).
  const plan = vertical ? view.vertical_stats.kbps || 4660 : view.stats.kbps || 6160
  const need = ticked.reduce((a, d) => a + (d.health?.kbps || plan), 0)
  const twitchShared = !vertical && ticked.some((d) => d.kind === 'twitch') && ticked.length > 1
  return (
    <Panel
      id="golive-platforms"
      title={vertical ? 'Where it goes' : 'Your platforms'}
      description={
        vertical
          ? 'YouTube Shorts live, or a server of your own. Twitch and Kick take one live per channel.'
          : 'Drag to set what pauses first if your upload struggles: the bottom one.'
      }
      actions={
        <Button size="sm" icon={<Plus size={15} />} onClick={() => setAdding(true)}>
          Add a destination
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <ul
          className="overflow-hidden rounded-[12px] border border-line"
          aria-label="Platforms, top first"
        >
          {merged.map((d, i) => (
            <li
              key={d.id}
              draggable
              onDragStart={() => (dragged.current = i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragged.current !== null) move(dragged.current, i)
                dragged.current = null
              }}
              className={cx(
                'grid grid-cols-[22px_30px_minmax(0,1fr)_auto] items-center gap-3 border-b border-line px-3 py-3 last:border-b-0',
                d.enabled ? 'bg-surface-1' : 'bg-surface-2',
              )}
            >
              <button
                type="button"
                className="grid cursor-grab place-items-center rounded-[6px] text-text-3 hover:text-text focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
                aria-label={`Move ${d.name}: arrow up or down`}
                onKeyDown={onGripKey(i)}
              >
                <DotsSixVertical size={16} aria-hidden />
              </button>
              <Logo kind={d.kind} />
              <RowText d={d} />
              <div className="flex items-center gap-3">
                <span className="hidden text-right font-mono text-[12px] leading-tight text-text-2 sm:block">
                  {!d.enabled
                    ? ''
                    : d.health?.state === 'paused'
                      ? 'Paused'
                      : mbps(d.health?.kbps || plan)}
                </span>
                {d.kind === 'custom' && (
                  <IconButton
                    label={`Remove ${d.name}`}
                    size="sm"
                    disabled={busy === `rm:${d.id}`}
                    onClick={() => setRemoving(d)}
                  >
                    <Trash size={15} />
                  </IconButton>
                )}
                <Switch
                  label={`Stream to ${d.name}`}
                  hideLabel
                  checked={d.enabled}
                  disabled={busy === 'order'}
                  onChange={(on) => toggle(d.id, on)}
                />
              </div>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px]">
          <b className="font-semibold">{goingTo(merged)}.</b>
          {ticked.length > 0 && <span className="text-text-3">Needs {mbps(need)} upload.</span>}
        </div>
        {vertical ? (
          <p className="m-0 text-[13px] text-text-3">
            Upload protection counts the vertical stream too: it pauses before the platforms on the
            Go live tab.
          </p>
        ) : (
          <div className="border-t border-line pt-3">
            <Switch
              label="Upload protection"
              description="If your upload can’t carry every platform, the bottom one pauses for a while so the ones above stay smooth."
              checked={view.protect}
              disabled={busy === 'protect'}
              onChange={protect}
            />
          </div>
        )}
        {twitchShared && (
          <Note>
            <b>Twitch asks that every platform gets the same quality</b> as Twitch, or lower.
            Ferrocast sends the same stream to all, so you’re fine.
          </Note>
        )}
      </div>
      <AddDestination
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={onSaved}
        canvas={canvas}
      />
      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.name ?? 'this server'}?`}
        description="It stops getting your stream, and its stream key is deleted from this computer. You can add it again later with its key."
        size="sm"
        footer={
          <>
            <Button onClick={() => setRemoving(null)}>Keep it</Button>
            <Button
              variant="danger"
              busy={removing !== null && busy === `rm:${removing.id}`}
              onClick={() => removing && remove(removing)}
            >
              Remove
            </Button>
          </>
        }
      />
    </Panel>
  )
}

function RowText({ d }: { d: DestinationView }) {
  const platform = d.kind !== 'custom' ? NAMES[d.kind] : null
  return (
    <div className="min-w-0">
      <b className={cx('block truncate text-[14px]', !d.enabled && 'text-text-2')}>{d.name}</b>
      <span className="block truncate text-[12.5px] text-text-3">
        {d.kind === 'custom' ? (
          <>{d.account ?? 'Your own server'} · video only</>
        ) : d.connected ? (
          <span className="inline-flex items-center gap-1">
            {d.account ?? platform} ·{' '}
            {d.canvas === 'vertical' ? 'Ferrocast makes its stream' : `key from ${platform}`}
            <LockSimple size={12} aria-label="kept safe" />
          </span>
        ) : (
          <>
            Not connected.{' '}
            <a
              className="font-semibold text-accent-text hover:underline"
              href={href({ name: 'settings', section: 'accounts' })}
            >
              Connect {platform}
            </a>
          </>
        )}
      </span>
      {d.enabled && d.kind === 'kick' && (
        <span className="block text-[12.5px] text-warn">
          Kick Partners: turn on multistreaming in Kick first.
        </span>
      )}
      {d.blocked && <span className="block text-[12.5px] text-danger">{d.blocked}</span>}
      {d.rules.map((r) => (
        <span key={r} className="block text-[12.5px] text-warn">
          {r}
        </span>
      ))}
    </div>
  )
}

function Note({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  const Icon = warn ? Warning : Info
  return (
    <p
      className={cx(
        'm-0 flex items-start gap-2.5 rounded-[10px] border px-3 py-2.5 text-[13px] text-text-2',
        warn ? 'border-transparent bg-warn-soft' : 'border-line bg-surface-2',
      )}
    >
      <Icon
        size={16}
        weight={warn ? 'fill' : 'regular'}
        className={cx('mt-px shrink-0', warn ? 'text-warn' : 'text-accent-text')}
        aria-hidden
      />
      <span>{children}</span>
    </p>
  )
}

// ---------------------------------------------------------------- 7: a server of your own

function AddDestination({
  open,
  onClose,
  onAdded,
  canvas = 'main',
}: {
  open: boolean
  onClose: () => void
  onAdded: () => void
  canvas?: Canvas
}) {
  const api = useGoLive()
  const { run, busy } = useAction()
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [key, setKey] = useState('')
  const [show, setShow] = useState(false)
  const [err, setErr] = useState<{ field: string; message: string } | null>(null)
  const submit = () => {
    setErr(null)
    void run(
      'add',
      () =>
        api.addCustom(name, url, key, canvas).catch((e: unknown) => {
          const m = describeError(e).message
          const field = /^(name|url|key):/.exec(m)?.[1] ?? 'form'
          setErr({ field, message: m.replace(/^(name|url|key):\s*/, '') })
          throw e
        }),
      {
        quiet: true,
        success: (d) => `${d.name ?? 'Server'} added. It gets the stream next time you go live.`,
      },
    ).then((d) => {
      if (!d) return
      setName('')
      setUrl('')
      setKey('')
      onAdded()
      onClose()
    })
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add a destination"
      sheetOnMobile
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            busy={busy === 'add'}
            disabled={!name.trim() || !url.trim() || !key.trim()}
            onClick={submit}
          >
            Add server
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Field label="Name" error={err?.field === 'name' ? err.message : null}>
          {(a) => (
            <Input
              {...a}
              name="name"
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              placeholder="Backup PC"
              autoComplete="off"
            />
          )}
        </Field>
        <Field
          label="Server"
          hint="Starts with rtmp:// or rtmps://. The place you stream to gives you this."
          error={err?.field === 'url' ? err.message : null}
        >
          {(a) => (
            <Input
              {...a}
              name="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="rtmps://live.example.com/app"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              className="font-mono text-[13px]"
            />
          )}
        </Field>
        <Field
          label="Stream key"
          hint="Kept in your computer’s keychain, never sent to Ferrocast’s servers."
          error={err?.field === 'key' ? err.message : null}
        >
          {(a) => (
            <div className="flex gap-2">
              <Input
                {...a}
                name="stream-key"
                value={key}
                type={show ? 'text' : 'password'}
                onChange={(e) => setKey(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="min-w-0 flex-1 font-mono text-[13px]"
              />
              <Button size="md" onClick={() => setShow((s) => !s)} aria-pressed={show}>
                {show ? 'Hide' : 'Show'}
              </Button>
            </div>
          )}
        </Field>
        {err?.field === 'form' && (
          <p role="alert" className="m-0 text-[13px] text-danger">
            {err.message}
          </p>
        )}
        <Note>
          <b>Video only.</b> Chat, alerts and the title don’t reach this one; Ferrocast just sends
          the stream there.
        </Note>
      </form>
    </Dialog>
  )
}

// ---------------------------------------------------------------- 3A: set up once

/**
 * Aitum Multistream also streams to platforms ticked here: each would get the stream twice.
 * Board item 7 (24 Oct): say so once, show where in OBS, or "I use it on purpose".
 */
function AitumNote({ names, onOk }: { names: string[]; onOk: () => void }) {
  const api = useGoLive()
  const { run, busy } = useAction()
  const [how, setHow] = useState(false)
  const list = andList(names)
  const ok = () =>
    void run('aitum', () => api.setAitumOk(true), {
      success: 'Got it. Ferrocast warns you only if a platform gets the stream twice while live.',
    }).then((r) => r && onOk())
  return (
    <section
      aria-label="Aitum Multistream"
      className="flex flex-col gap-3 rounded-[14px] border border-warn/30 bg-warn-soft p-4 text-[13.5px] text-text-2"
    >
      <p className="m-0 flex gap-2.5">
        <Warning size={18} weight="fill" className="mt-0.5 shrink-0 text-warn" aria-hidden />
        <span>
          <b className="text-text">Aitum Multistream is also set up to send to {list}.</b> With
          Ferrocast sending too, {names.length === 1 ? 'it would' : 'they’d each'} get your stream
          twice. Turn off {names.length === 1 ? 'that output' : 'those outputs'} in OBS, or untick{' '}
          {names.length === 1 ? 'it' : 'them'} here.
        </span>
      </p>
      {how && (
        <p className="m-0 pl-7">
          In OBS, open the Aitum Multistream dock (Docks menu, Aitum Multistream). Each output has
          its own stream button; switch off {names.length === 1 ? 'the one' : 'the ones'} for {list}
          , or remove {names.length === 1 ? 'it' : 'them'}.
        </p>
      )}
      <div className="flex flex-wrap gap-2 pl-7">
        <Button size="sm" aria-expanded={how} onClick={() => setHow(!how)}>
          {how ? 'Hide the steps' : 'Show me where in OBS'}
        </Button>
        <Button size="sm" variant="ghost" busy={busy === 'aitum'} onClick={ok}>
          I use it on purpose
        </Button>
      </div>
    </section>
  )
}

function Setup({
  view,
  onObs,
  onUpload,
}: {
  view: GoLiveView
  onObs: (o: GoLiveView['obs']) => void
  onUpload: (u: UploadCheck) => void
}) {
  const api = useGoLive()
  const { run, busy } = useAction()
  const { obs, upload } = view
  const point = () =>
    void run('point', () => api.pointObs(), { success: 'OBS now streams to Ferrocast.' }).then(
      (o) => o && onObs(o),
    )
  const restore = () =>
    void run('restore', () => api.restoreObs(), {
      success: (o) =>
        o.points_here ? null : `OBS streams to ${obs.before ?? 'its old setting'} again.`,
    }).then((o) => o && onObs(o))
  const test = () => void run('test', () => api.uploadCheck()).then((u) => u && onUpload(u))

  if (obs.points_here && upload)
    return (
      <Panel title="OBS" id="golive-setup">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[10px] border border-line bg-surface-2 px-3 py-2.5">
          <CheckCircle size={18} weight="fill" className="text-ok" aria-hidden />
          <span className="text-[13.5px] font-semibold">OBS sends to Ferrocast</span>
          <code className="min-w-0 truncate text-[12px] text-text-3">{view.ingest}</code>
          {obs.before && (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              icon={<ArrowCounterClockwise size={15} />}
              busy={busy === 'restore'}
              onClick={restore}
            >
              Put OBS back to {obs.before}
            </Button>
          )}
        </div>
        <ByHand />
      </Panel>
    )
  return (
    <Panel title="Set up once" id="golive-setup">
      <ol className="m-0 flex list-none flex-col p-0">
        <Step n={1} done={obs.connected} title={obs.connected ? 'OBS is connected' : 'Connect OBS'}>
          {obs.connected ? null : (
            <>
              <p>
                Open OBS on this computer. Ferrocast finds it by itself, or check Settings, OBS.
              </p>
              <a
                className="text-[13.5px] font-semibold text-accent-text hover:underline"
                href={href({ name: 'settings', section: 'obs' })}
              >
                OBS settings
              </a>
            </>
          )}
        </Step>
        <Step n={2} done={obs.points_here} title="Send OBS’s stream to Ferrocast">
          {obs.points_here ? null : (
            <>
              <p>
                OBS will stream to Ferrocast on this PC instead of straight to your platform. Your
                OBS scenes and quality stay the same.
              </p>
              {obs.streaming && (
                <p className="text-warn">
                  Stop the stream in OBS first; this changes between streams.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="primary"
                  icon={<Plug size={16} />}
                  busy={busy === 'point'}
                  disabled={!obs.connected || obs.streaming}
                  onClick={point}
                >
                  Point OBS at Ferrocast
                </Button>
                <span className="text-[12.5px] text-text-3">You can put it back any time.</span>
              </div>
            </>
          )}
        </Step>
        <Step n={3} done={!!upload} title="Test your upload">
          {upload ? null : (
            <>
              <p>Sends a few seconds of test data to Twitch’s test server. Nobody sees it.</p>
              <Button
                className="self-start"
                icon={<Gauge size={16} />}
                busy={busy === 'test'}
                onClick={test}
              >
                Test upload
              </Button>
            </>
          )}
        </Step>
      </ol>
      <ByHand />
    </Panel>
  )
}

function Step({
  n,
  done,
  title,
  children,
}: {
  n: number
  done: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <li className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 border-t border-line py-3 first:border-t-0 first:pt-0.5">
      <span
        className={cx(
          'grid size-[26px] place-items-center rounded-full border font-mono text-[12.5px] font-bold',
          done ? 'border-ok bg-ok text-white' : 'border-line-strong text-text-2',
        )}
        aria-hidden
      >
        {done ? <CheckCircle size={16} weight="bold" /> : n}
      </span>
      <div className="flex min-w-0 flex-col gap-2 text-[13px] text-text-2 [&_p]:m-0">
        <b className="text-[14px] text-text">
          {title}
          <span className="sr-only">{done ? ' (done)' : ''}</span>
        </b>
        {children}
      </div>
    </li>
  )
}

/** OBS's Settings, Stream by hand: the server and key, for OBS on another way or a check. */
export function ByHand({ vertical = false }: { vertical?: boolean }) {
  const api = useGoLive()
  const [ingest, setIngest] = useState<{
    server: string
    key: string
    vertical_key: string
  } | null>(null)
  const { run, busy } = useAction()
  const copy = (text: string, what: string) =>
    void navigator.clipboard.writeText(text).then(
      () => toast({ tone: 'ok', message: `${what} copied.` }),
      () =>
        toast({
          tone: 'error',
          message: `Couldn’t copy the ${what.toLowerCase()}.`,
          hint: 'Select it and copy it by hand.',
        }),
    )
  return (
    <details
      className="mt-3 text-[13px] text-text-2"
      onToggle={(e) => {
        if ((e.target as HTMLDetailsElement).open && !ingest)
          void run('ingest', () => api.ingest()).then((i) => i && setIngest(i))
      }}
    >
      <summary className="cursor-pointer font-semibold text-text-2 hover:text-text">
        {vertical ? 'Set it up by hand' : 'Set OBS up by hand'}
      </summary>
      <div className="mt-2 flex flex-col gap-2">
        <p className="m-0">
          {vertical
            ? 'Anything that sends a vertical stream can use these two (in Aitum Vertical: its settings, a stream output).'
            : 'In OBS open Settings, Stream, pick Custom, and paste these two.'}
        </p>
        {busy === 'ingest' && <Skeleton className="h-16" />}
        {ingest && (
          <>
            <CopyRow
              label="Server"
              value={ingest.server}
              onCopy={() => copy(ingest.server, 'Server')}
            />
            <CopyRow
              label="Stream key"
              value={'•'.repeat(16)}
              onCopy={() => copy(vertical ? ingest.vertical_key : ingest.key, 'Stream key')}
            />
          </>
        )}
      </div>
    </details>
  )
}

function CopyRow({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-[8px] border border-line bg-surface-2 px-2.5 py-1.5">
      <span className="w-20 shrink-0 text-[12px] text-text-3">{label}</span>
      <code className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-text">{value}</code>
      <IconButton label={`Copy ${label.toLowerCase()}`} size="sm" onClick={onCopy}>
        <Copy size={15} />
      </IconButton>
    </div>
  )
}

// ---------------------------------------------------------------- 4B: the upload table

function Upload({ view, onUpload }: { view: GoLiveView; onUpload: (u: UploadCheck) => void }) {
  const api = useGoLive()
  const { run, busy } = useAction()
  const u = view.upload
  const test = () => void run('test', () => api.uploadCheck()).then((r) => r && onUpload(r))
  return (
    <Panel
      title="Your upload"
      id="golive-upload"
      actions={
        u && (
          <Button size="sm" icon={<Gauge size={15} />} busy={busy === 'test'} onClick={test}>
            Check again
          </Button>
        )
      }
    >
      {!u ? (
        <div className="flex flex-col items-start gap-3">
          <p className="m-0 text-[13.5px] text-text-2">
            Every platform is a full copy of your stream on your own internet. Test once before you
            go live: Ferrocast checks your speed and how far each platform’s server is, and says
            what fits.
          </p>
          <Button icon={<Gauge size={16} />} busy={busy === 'test'} onClick={test}>
            Test upload
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3" aria-live="polite">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13.5px]">
              <thead>
                <tr className="text-left font-mono text-[11px] text-text-3 [&>th]:border-b [&>th]:border-line [&>th]:px-2.5 [&>th]:py-2 [&>th]:font-semibold">
                  <th scope="col">Platform</th>
                  <th scope="col">Server</th>
                  <th scope="col">Delay</th>
                  <th scope="col">Needs</th>
                </tr>
              </thead>
              <tbody>
                {u.rows.map((r) => (
                  <tr
                    key={r.id}
                    className="[&>td]:border-b [&>td]:border-line [&>td]:px-2.5 [&>td]:py-2 [&>td]:whitespace-nowrap last:[&>td]:border-b-0"
                  >
                    <td className="font-semibold">{r.name}</td>
                    {r.problem ? (
                      <td colSpan={3} className="!whitespace-normal text-danger">
                        {r.problem}
                      </td>
                    ) : (
                      <>
                        <td className="max-w-[180px] truncate font-mono text-[12px] text-text-2">
                          {r.server}
                        </td>
                        <td
                          className={cx(
                            'tabular-nums',
                            (r.delay_ms ?? 0) > 100 ? 'font-semibold text-warn' : 'text-text-2',
                          )}
                        >
                          {r.delay_ms === null ? '–' : `${r.delay_ms} ms`}
                        </td>
                        <td className="tabular-nums text-text-2">{mbps(r.need_kbps)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="m-0 text-[12.5px] text-text-3">
            Speed {mbps(u.verdict.upload_kbps)},{' '}
            {u.measured_by === 'twitch'
              ? 'measured through Twitch’s test mode'
              : 'measured with Cloudflare’s speed test'}
            . 20% is kept free for your game and chat.
          </p>
          <p
            className={cx(
              'm-0 font-display text-[15px] font-bold leading-snug',
              u.verdict.fits ? 'text-text' : 'text-warn',
            )}
          >
            {u.verdict.message}
          </p>
        </div>
      )}
    </Panel>
  )
}

/** Show tab's one line: where the stream goes, linking to Go live. */
export function GoingToLine() {
  const api = useGoLive()
  const res = useResource(() => api.view(), [api])
  const view = useMerged(res.data)
  if (!view) return null
  const main = onCanvas(view.destinations, 'main')
  const n = main.filter((d) => d.enabled).length
  return (
    <a
      href={href({ name: 'studio', section: 'golive' })}
      className="inline-flex items-center gap-2 self-start rounded-full border border-line bg-surface-1 px-3 py-1.5 text-[13px] font-semibold text-text hover:border-text-3"
    >
      <Broadcast size={15} aria-hidden />
      {n === 0
        ? 'Go live everywhere: pick your platforms'
        : `${goingTo(main)} with Go live everywhere`}
      {view.live && <Badge tone="ok">Live</Badge>}
    </a>
  )
}
