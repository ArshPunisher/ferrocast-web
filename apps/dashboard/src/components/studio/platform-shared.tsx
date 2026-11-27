import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import {
  ArrowsClockwise,
  Broadcast,
  CheckCircle,
  Info,
  MinusCircle,
  Pause,
  Warning,
  WarningCircle,
} from '@phosphor-icons/react'
import {
  describeError,
  directKind,
  goliveApi,
  mbps,
  onCanvas,
  PASTE_BRANDS,
  studioEngineApi,
  urlAfterBrand,
  viaOf,
  withVia,
  type Canvas,
  type DestinationView,
  type DirectKind,
  type GoLiveQualityOptionsResponse,
  type GoLiveView,
  type Network,
  type PasteBrand,
  type Reach,
  type Service,
} from '@ferrocast/api'
import { Button, Field, InfoTip, Input, PlatformMark, cx } from '@ferrocast/ui'
import { useAction, useClient } from '../../lib/hooks'
import { useLive } from '../../lib/store'
import { useUsesObs } from '../../lib/picture'
import {
  describeDestinationRate,
  describeStreamCapFromView,
  describeUploadNeed,
} from './bitrate-summary'
import { useSaveOrder } from './save-order'

export function useGoLiveApi() {
  const client = useClient()
  return useMemo(() => goliveApi(client), [client])
}

export function Logo({ kind, size = 30 }: { kind: Service; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center bg-surface-3"
      style={{
        width: size,
        height: size,
        borderRadius: size <= 22 ? 5 : 8,
        ...(kind !== 'custom' && {
          background: `color-mix(in srgb, var(--fc-${kind}) 14%, var(--fc-surface-1))`,
        }),
      }}
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

export function liveStatus(d: DestinationView, streaming: boolean, plan: number): string {
  if (streaming && d.standby_for) return 'Standby'
  if (!d.enabled && !(streaming && d.backup_for)) return streaming ? 'Off' : ''
  if (!streaming) return d.health?.state === 'failed' ? 'Failed' : mbps(d.health?.kbps || plan)
  switch (d.health?.state) {
    case undefined:
    case 'waiting':
      return 'Starting'
    case 'connecting':
      return 'Connecting'
    case 'reconnecting':
      return 'Reconnecting'
    case 'failed':
      return 'Failed'
    case 'paused':
      return 'Paused'
    case 'stopped':
      return 'Stopped'
    default:
      return d.health?.kbps ? mbps(d.health.kbps) : 'Live'
  }
}

export function platformTileTone(
  d: DestinationView,
  streaming: boolean,
): {
  tileCls: string
  icon: typeof CheckCircle
  word: string
  badgeCls: string
} {
  if (d.blocked) {
    return {
      tileCls: 'border-danger/40 bg-danger-soft/45',
      icon: WarningCircle,
      word: 'Action needed',
      badgeCls: 'border border-danger/40 bg-surface-1 text-danger',
    }
  }
  if (streaming && d.standby_for) {
    return {
      tileCls: 'border-line bg-surface-2/70',
      icon: MinusCircle,
      word: 'Standby',
      badgeCls: 'border border-line bg-surface-1 text-text-2',
    }
  }
  if (!d.enabled && !(streaming && d.backup_for)) {
    return {
      tileCls: 'border-line bg-surface-2/70',
      icon: MinusCircle,
      word: 'Off',
      badgeCls: 'border border-line bg-surface-1 text-text-2',
    }
  }
  if (d.health?.state === 'failed') {
    return {
      tileCls: 'border-danger/40 bg-danger-soft/45',
      icon: WarningCircle,
      word: 'Failed',
      badgeCls: 'border border-danger/40 bg-surface-1 text-danger',
    }
  }
  if (d.health?.state === 'reconnecting') {
    return {
      tileCls: 'border-warn/40 bg-warn-soft/35',
      icon: ArrowsClockwise,
      word: 'Reconnecting',
      badgeCls: 'border border-warn/45 bg-surface-1 text-warn',
    }
  }
  if (d.health?.state === 'paused') {
    return {
      tileCls: 'border-warn/40 bg-warn-soft/35',
      icon: Pause,
      word: 'Paused',
      badgeCls: 'border border-warn/45 bg-surface-1 text-warn',
    }
  }
  if (streaming && d.health?.state === 'live') {
    return {
      tileCls: 'border-line bg-surface-1',
      icon: CheckCircle,
      word: 'Live',
      badgeCls: 'border border-ok/35 bg-surface-1 text-ok',
    }
  }
  if (streaming) {
    const word =
      d.health?.state === 'connecting'
        ? 'Connecting'
        : d.health?.state === 'stopped'
          ? 'Stopped'
          : 'Starting'
    return {
      tileCls: 'border-line bg-surface-1',
      icon: d.health?.state === 'stopped' ? MinusCircle : ArrowsClockwise,
      word,
      badgeCls: 'border border-line bg-surface-1 text-text-2',
    }
  }
  return {
    tileCls: 'border-line bg-surface-1',
    icon: CheckCircle,
    word: 'Ready',
    badgeCls: 'border border-ok/35 bg-surface-1 text-ok',
  }
}

export function reachFailed(e: unknown): Reach {
  return { ok: false, message: describeError(e).message }
}

export function ReachLine({ r, className }: { r: Reach; className?: string }) {
  const Icon = r.ok ? CheckCircle : WarningCircle
  return (
    <p
      role="status"
      className={cx(
        'm-0 flex items-start gap-1.5 text-[13.5px] leading-snug',
        r.ok ? 'text-text-2' : 'text-danger',
        className,
      )}
    >
      <Icon
        size={15}
        weight="fill"
        className={cx('mt-[2px] shrink-0', r.ok ? 'text-ok' : 'text-danger')}
        aria-hidden
      />
      <span>{r.message}</span>
    </p>
  )
}

export function GoLiveNote({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  const Icon = warn ? Warning : Info
  return (
    <p
      className={cx(
        'm-0 flex items-start gap-2.5 rounded-control border px-3 py-2.5 text-[14px] text-text-2',
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

export const DIRECT_NAMES: Record<DirectKind, string> = {
  srt: 'SRT',
  rist: 'RIST',
  whip: 'WebRTC',
}

const KEY_LABEL: Record<DirectKind, string> = {
  srt: 'Stream ID (optional)',
  rist: 'Passphrase or login password (optional)',
  whip: 'Bearer token (optional)',
}

function qualityOptionsSig(view: GoLiveView | null): string {
  if (!view) return ''
  const budgetSig = view.encode_budget
    ? `${view.encode_budget.status}:${view.encode_budget.used_sessions ?? 0}:${view.encode_budget.max_sessions ?? 0}:${view.encode_budget.limit_mpx_s}`
    : 'none'
  const destSig = view.destinations
    .map(
      (d) =>
        `${d.id}:${d.enabled ? 1 : 0}:${d.canvas}:${d.quality?.mode ?? 'same'}:${
          d.quality?.mode === 'custom'
            ? `${d.quality.width}x${d.quality.height}@${d.quality.fps}:${d.quality.kbps}`
            : ''
        }:${d.resolved_quality?.kbps ?? 0}:${d.capped?.summary ?? ''}`,
    )
    .join('|')
  return `${budgetSig}||${destSig}`
}

export function useQualityOptions(
  view: GoLiveView | null,
  enabled: boolean,
  usesObs: boolean,
  _onViewChanged?: () => void,
) {
  const client = useLive((s) => s.conn?.client)
  const [data, setData] = useState<GoLiveQualityOptionsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const reqIdRef = useRef(0)

  const sig = qualityOptionsSig(view)

  const reload = useCallback(async () => {
    if (!enabled || usesObs || !client || !view) return
    const id = ++reqIdRef.current
    setLoading(true)
    setError(null)
    try {
      const next = await goliveApi(client).qualityOptions()
      if (reqIdRef.current === id) {
        setData(next)
      }
    } catch (e) {
      if (reqIdRef.current === id) {
        setError(e instanceof Error ? e : new Error(String(e)))
      }
    } finally {
      if (reqIdRef.current === id) {
        setLoading(false)
      }
    }
  }, [client, enabled, usesObs, view])

  useEffect(() => {
    if (!enabled || usesObs || !client || !view) return
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, enabled, usesObs, sig])

  useEffect(() => {
    if (usesObs) {
      reqIdRef.current++
      setData(null)
      setLoading(false)
    }
  }, [usesObs])

  return { data, loading, error: error?.message ?? null, reload }
}

export function useAddDestinationState({
  canvas = 'main',
  onAdded,
  onClose,
}: {
  canvas?: Canvas
  onAdded: (createdId?: string) => void
  onClose: () => void
}) {
  const api = useGoLiveApi()
  const { run, busy } = useAction()
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [key, setKey] = useState('')
  const [show, setShow] = useState(false)
  const [brand, setBrand] = useState<PasteBrand | null>(null)
  const [err, setErr] = useState<{ field: string; message: string } | null>(null)
  const [reach, setReachNow] = useState<Reach | null>(null)
  const tries = useRef(0)
  const setReach = (r: Reach | null) => {
    tries.current += 1
    setReachNow(r)
  }

  const pickBrand = (b: PasteBrand | null) => {
    const info = PASTE_BRANDS.find((x) => x.id === b)
    setBrand(b)
    if (info && (!name.trim() || PASTE_BRANDS.some((x) => x.label === name))) setName(info.label)
    const nextUrl = urlAfterBrand(url, brand, b)
    if (nextUrl !== url) {
      setUrl(nextUrl)
      setReach(null)
    }
    setErr((e) => (e?.field === 'brand' ? null : e))
  }

  const direct = directKind(url)
  const [networks, setNetworks] = useState<Network[] | null>(null)
  const srtla = /^srtla:\/\//i.test(url.trim())
  const rist = (direct === 'rist' || srtla) && canvas === 'main'
  useEffect(() => {
    if (!rist || networks) return
    api
      .networks()
      .then(setNetworks)
      .catch(() => setNetworks([]))
  }, [rist, networks, api])

  const via = viaOf(url)
  const toggleVia = (netName: string) => {
    setUrl(
      withVia(url, via.includes(netName) ? via.filter((v) => v !== netName) : [...via, netName]),
    )
    setReach(null)
  }

  const tryIt = () => {
    setReach(null)
    const mine = tries.current
    void run('test', () => api.testAddress(url, key).catch(reachFailed), { quiet: true }).then(
      (r) => {
        if (r && tries.current === mine) setReachNow(r)
      },
    )
  }

  const canAdd =
    !!name.trim() &&
    !!url.trim() &&
    (!!direct || !!key.trim()) &&
    !(!!direct && canvas === 'vertical')

  const reset = () => {
    setName('')
    setUrl('')
    setKey('')
    setShow(false)
    setBrand(null)
    setErr(null)
    setReach(null)
  }

  const submit = () => {
    if (!canAdd) return
    setErr(null)
    void run(
      'add',
      () =>
        api.addCustom(name, url, key, canvas, brand ?? undefined).catch((e: unknown) => {
          const m = describeError(e).message
          const field = /^(name|url|key|brand):/.exec(m)?.[1] ?? 'form'
          setErr({ field, message: m.replace(/^(name|url|key|brand):\s*/, '') })
          throw e
        }),
      {
        quiet: true,
        once: true,
        success: (d) => `${d.name ?? 'Server'} added. It gets the stream next time you go live.`,
      },
    ).then((d) => {
      if (!d) return
      const createdId = (d as { id?: string }).id
      reset()
      onAdded(createdId)
      onClose()
    })
  }

  const submitLabel = brand
    ? `Add ${PASTE_BRANDS.find((x) => x.id === brand)?.label ?? ''}`
    : 'Add server'

  return {
    name,
    setName,
    url,
    setUrl,
    key,
    setKey,
    show,
    setShow,
    brand,
    pickBrand,
    err,
    reach,
    setReach,
    direct,
    networks,
    srtla,
    rist,
    via,
    toggleVia,
    tryIt,
    canAdd,
    submit,
    busy,
    submitLabel,
    reset,
  }
}

export function AddDestinationFormBody({
  state,
  canvas = 'main',
  formId,
}: {
  state: ReturnType<typeof useAddDestinationState>
  canvas?: Canvas
  formId?: string
}) {
  const {
    name,
    setName,
    url,
    setUrl,
    key,
    setKey,
    show,
    setShow,
    brand,
    pickBrand,
    err,
    reach,
    setReach,
    direct,
    networks,
    srtla,
    rist,
    via,
    toggleVia,
    submit,
  } = state

  return (
    <form
      id={formId}
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <div className="flex flex-col gap-2">
        <span className="text-[14px] font-semibold text-text">Platform</span>
        <div role="group" aria-label="Platform" className="flex flex-wrap gap-2">
          {[{ id: null, label: 'Other server' }, ...PASTE_BRANDS].map((b) => (
            <button
              key={b.id ?? 'other'}
              type="button"
              aria-pressed={brand === b.id}
              onClick={() => pickBrand(b.id)}
              className={cx(
                'fc-press inline-flex h-11 min-w-11 items-center justify-center rounded-full border px-3 text-[13.5px] font-semibold sm:h-9 sm:min-w-0',
                'focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none',
                brand === b.id
                  ? 'border-accent-line bg-accent-soft text-text'
                  : 'border-line-strong bg-surface-3 text-text-2 hover:text-text',
              )}
            >
              {b.label}
            </button>
          ))}
        </div>
        {err?.field === 'brand' && (
          <p role="alert" className="text-[13.5px] font-medium text-danger">
            {err.message}
          </p>
        )}
        {brand && (
          <p className="text-[14px] text-text-2">
            {PASTE_BRANDS.find((x) => x.id === brand)?.where}{' '}
            {brand === 'facebook' ? '' : 'Ferrocast can’t make this key for you.'}
          </p>
        )}
      </div>
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
        hint="rtmp://, rtmps://, srt://, srtla:// (every connection at once), rist:// or a WebRTC (WHIP) https:// address. The place you stream to gives you this."
        error={
          err?.field === 'url'
            ? err.message
            : direct && canvas === 'vertical'
              ? `${DIRECT_NAMES[direct]} sends the main picture only. Add it under the main stream.`
              : null
        }
      >
        {(a) => (
          <Input
            {...a}
            name="url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value)
              setReach(null)
            }}
            placeholder="rtmps://live.example.com/app"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            className="font-mono text-[14px]"
          />
        )}
      </Field>
      <Field
        label={direct ? KEY_LABEL[direct] : 'Stream key'}
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
              onChange={(e) => {
                setKey(e.target.value)
                setReach(null)
              }}
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 font-mono text-[14px]"
            />
            <Button size="md" onClick={() => setShow((s) => !s)} aria-pressed={show}>
              {show ? 'Hide' : 'Show'}
            </Button>
          </div>
        )}
      </Field>
      {rist && networks && networks.length > 1 && (
        <div className="flex flex-col gap-2">
          <span className="flex items-center gap-1 text-[14px] font-semibold text-text">
            Send over
            <InfoTip>
              {srtla
                ? 'The stream is shared out over the ones picked (none: all of them), more on the stronger ones, so one dropping doesn’t stop it.'
                : 'Pick two, like Wi-Fi and a phone’s hotspot: every packet goes over both, so one dropping doesn’t stop the stream.'}
            </InfoTip>
          </span>
          <div role="group" aria-label="Send over" className="flex flex-wrap gap-2">
            {networks.map((n) => {
              const on = via.includes(n.name)
              return (
                <button
                  key={n.name}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleVia(n.name)}
                  className={cx(
                    'fc-press inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13.5px] font-semibold',
                    'focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none',
                    on
                      ? 'border-accent-line bg-accent-soft text-text'
                      : 'border-line bg-surface-2 text-text-2 hover:text-text',
                  )}
                >
                  {on && (
                    <CheckCircle size={15} weight="fill" className="text-accent-text" aria-hidden />
                  )}
                  {n.name}
                  <span className="font-mono text-[12.5px] font-normal text-text-3">{n.ip}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
      {err?.field === 'form' && (
        <p role="alert" className="m-0 text-[14px] text-danger">
          {err.message}
        </p>
      )}
      {reach && <ReachLine r={reach} />}
      <GoLiveNote>
        <b>Video only.</b> Chat, alerts and the title don’t reach this one; Ferrocast just sends the
        stream there.
        {direct && canvas === 'main' && (
          <>
            {' '}
            {DIRECT_NAMES[direct]} goes straight from the Ferrocast Studio, so it sends when you go
            live with the Ferrocast picture.
          </>
        )}
      </GoLiveNote>
    </form>
  )
}

export function usePlatformsListController({
  view,
  onSaved,
  onProtect,
  canvas,
  videoKbps,
  audioKbps,
  usesObs: usesObsProp,
}: {
  view: GoLiveView
  onSaved: () => void
  onProtect?: ((on: boolean) => void) | undefined
  canvas: Canvas | 'all'
  videoKbps?: number | undefined
  audioKbps?: number | undefined
  usesObs?: boolean | undefined
}) {
  const api = useGoLiveApi()
  const { run, busy } = useAction()
  const detectedObs = useUsesObs()
  const usesObs = usesObsProp ?? detectedObs

  const mine = useMemo(() => {
    if (canvas === 'all') {
      return [...onCanvas(view.destinations, 'main'), ...onCanvas(view.destinations, 'vertical')]
    }
    return onCanvas(view.destinations, canvas)
  }, [view.destinations, canvas])

  const others = useMemo(
    () => (canvas === 'all' ? [] : view.destinations.filter((d) => !mine.includes(d))),
    [canvas, view.destinations, mine],
  )

  const [rows, setRows] = useState(mine)
  const dragged = useRef<number | null>(null)
  const key = mine.map((d) => `${d.id}:${d.enabled}`).join(',')
  const [seen, setSeen] = useState(key)
  if (seen !== key) {
    setSeen(key)
    setRows(mine)
  }
  const merged = useMemo(() => rows.map((r) => mine.find((d) => d.id === r.id) ?? r), [rows, mine])

  const saver = useSaveOrder(api, onSaved)
  const save = (next: DestinationView[], label: string) => {
    setRows(next)
    const all = (
      canvas === 'all' ? next : canvas === 'main' ? [...next, ...others] : [...others, ...next]
    ).map((d) => ({
      id: d.id,
      enabled: d.enabled,
    }))
    void run('order', () => saver.request(all), { success: label }).then((r) => {
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

  const [tests, setTests] = useState<Record<string, Reach>>({})
  const test = (d: DestinationView) =>
    void run(`test:${d.id}`, () => api.testDestination(d.id).catch(reachFailed), {
      quiet: true,
    }).then((r) => r && setTests((t) => ({ ...t, [d.id]: r })))

  const remove = (d: DestinationView, afterRemove?: () => void) =>
    void run(`rm:${d.id}`, () => api.removeCustom(d.id).then(() => true), {
      success: `${d.name} removed.`,
    }).then((r) => {
      afterRemove?.()
      if (r) onSaved()
    })

  const protect = (on: boolean) =>
    void run('protect', () => api.setProtect(on), {
      success: on ? 'Upload protection is on.' : 'Upload protection is off.',
    }).then((r) => r && onProtect?.(r.protect))

  const autoQuality = (on: boolean) =>
    void run('auto-quality', () => api.setAutoQuality(on), {
      success: on ? 'Auto quality is on.' : 'Auto quality is off.',
    }).then((r) => r && onSaved())

  const verticalOnly = canvas === 'vertical'
  const streaming = verticalOnly ? view.vertical_live : view.live
  const ignoreServiceLimits = Boolean(view.advanced?.ignore_service_limits)

  const conn = useLive((s) => s.conn)
  const resyncs = useLive((s) => s.resyncs)
  const [fetchedSettings, setFetchedSettings] = useState<{
    conn: typeof conn
    video_kbps: number | null
    audio_kbps: number | null
  } | null>(null)

  useEffect(() => {
    if (usesObs || videoKbps !== undefined || !conn) return
    let alive = true
    const load = () => {
      void studioEngineApi(conn.client)
        .studioSettings()
        .then((s) => {
          if (!alive) return
          setFetchedSettings({
            conn,
            video_kbps: typeof s?.video_kbps === 'number' ? s.video_kbps : null,
            audio_kbps: typeof s?.audio_kbps === 'number' ? s.audio_kbps : null,
          })
        })
        .catch(() => undefined)
    }
    load()
    const onFocus = () => {
      if (!document.hidden) load()
    }
    window.addEventListener('focus', onFocus)
    return () => {
      alive = false
      window.removeEventListener('focus', onFocus)
    }
  }, [usesObs, videoKbps, conn, view, resyncs])

  const currentFetched = fetchedSettings && fetchedSettings.conn === conn ? fetchedSettings : null
  const chosenVideoKbps = videoKbps ?? currentFetched?.video_kbps ?? null
  const chosenAudioKbps = audioKbps ?? currentFetched?.audio_kbps ?? 160

  const capSummary = useMemo(
    () =>
      describeStreamCapFromView(merged, chosenVideoKbps, {
        ignoreServiceLimits,
        live: streaming,
        encodeBudget: view.encode_budget,
      }),
    [merged, chosenVideoKbps, ignoreServiceLimits, streaming, view.encode_budget],
  )
  const fallbackMainKbps =
    capSummary.capped && capSummary.effectiveVideoKbps
      ? capSummary.effectiveVideoKbps + chosenAudioKbps
      : chosenVideoKbps
        ? chosenVideoKbps + chosenAudioKbps
        : 6000 + chosenAudioKbps
  const verticalPlanKbps = view.vertical_stats.kbps || 4500 + chosenAudioKbps
  const plan = verticalOnly ? verticalPlanKbps : view.stats.kbps || fallbackMainKbps

  const rateOpts = useMemo(
    () => ({
      streamKbps: plan,
      verticalKbps: verticalPlanKbps,
      videoKbps: chosenVideoKbps,
      audioKbps: chosenAudioKbps,
      ignoreServiceLimits,
      live: streaming,
    }),
    [plan, verticalPlanKbps, chosenVideoKbps, chosenAudioKbps, ignoreServiceLimits, streaming],
  )

  const activeTicked = useMemo(
    () =>
      merged.filter((d) => {
        const destLive = d.canvas === 'vertical' ? view.vertical_live : view.live
        return (
          !d.blocked &&
          !d.standby_for &&
          (d.enabled || (destLive && !!d.backup_for && d.health?.state === 'live'))
        )
      }),
    [merged, view.live, view.vertical_live],
  )

  const uploadSummary = useMemo(
    () =>
      describeUploadNeed(
        activeTicked.map((d) => ({
          ...d,
          kbps: describeDestinationRate(d, capSummary, rateOpts).kbps,
        })),
        {
          planKbps: plan,
          vertical: verticalOnly,
          limiterName: capSummary.capped ? capSummary.limiter?.name : null,
          limiterKbps: capSummary.capped ? capSummary.effectiveVideoKbps : null,
          audioKbps: chosenAudioKbps,
        },
      ),
    [activeTicked, capSummary, rateOpts, plan, verticalOnly, chosenAudioKbps],
  )

  const destinationsById = useMemo(
    () =>
      Object.fromEntries(
        view.destinations.map((dest) => [dest.id, { name: dest.name, kind: dest.kind }]),
      ),
    [view.destinations],
  )

  return {
    api,
    run,
    busy,
    usesObs,
    merged,
    dragged,
    saver,
    move,
    onGripKey,
    toggle,
    tests,
    test,
    remove,
    protect,
    autoQuality,
    ignoreServiceLimits,
    capSummary,
    plan,
    rateOpts,
    uploadSummary,
    destinationsById,
    streaming,
    verticalOnly,
  }
}
