// Cloud mode's own page (`#/cloud`, ferrocast docs/CLOUD.md): turn it on, connect Twitch and
// Kick on the web, the next steps to a working overlay, what the free limits are and what
// stays in the app.

import { useEffect, useState } from 'react'
import {
  ArrowRight,
  Check,
  CloudArrowUp,
  Desktop,
  Moon,
  PlugsConnected,
} from '@phosphor-icons/react'
import {
  cloudApi,
  cloudBytes,
  cloudChannelLine,
  cloudYoutubeState,
  describeError,
  type CloudChannel,
  type CloudPlatform,
  type CloudSummary,
} from '@ferrocast/api'
import { Badge, Button, Dialog, PlatformMark, ProBadge, Skeleton, cx, toast } from '@ferrocast/ui'
import { LoadError, PageHeader, Panel } from '../components/Panel'
import { useClient, useResource } from '../lib/hooks'
import { chooseWeb } from '../lib/boot'
import { href } from '../lib/router'

const LABEL: Record<CloudPlatform, string> = { twitch: 'Twitch', kick: 'Kick', youtube: 'YouTube' }

const STAYS_IN_APP = [
  'OBS control and Add to OBS',
  'Loyalty points, quotes and new faces',
  'Chat filters, panic mode and sending chat',
  'Studio, the recap and importers',
  'Local and Ferrocast voices for TTS',
]

export function Cloud({ connected }: { connected?: string | undefined }) {
  const client = useClient()
  const summary = useResource((c) => cloudApi(c).summary())
  const [busy, setBusy] = useState<string | null>(null)
  const [leaving, setLeaving] = useState<CloudChannel | null>(null)

  // Back from Twitch or Kick: say so once and tidy the address.
  useEffect(() => {
    if (connected !== 'twitch' && connected !== 'kick' && connected !== 'youtube') return
    toast({ key: `cloud:${connected}`, tone: 'ok', message: `${LABEL[connected]} is connected.` })
    history.replaceState(null, '', `${location.pathname}${location.search}#/cloud`)
    summary.reload()
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected])

  const fail = (e: unknown) => {
    const d = describeError(e)
    toast({ tone: 'error', message: d.message, hint: d.hint })
  }

  const enable = async () => {
    setBusy('enable')
    try {
      summary.set(await cloudApi(client).enable())
      toast({ tone: 'ok', message: 'Cloud mode is on.', hint: 'Connect Twitch or Kick next.' })
    } catch (e) {
      fail(e)
    } finally {
      setBusy(null)
    }
  }

  const connect = async (p: CloudPlatform) => {
    setBusy(p)
    try {
      const flow = await client.connect(p)
      if (flow.flow === 'browser') {
        // The platform's page, then back here (the relay sends the browser to /app/#/cloud).
        if (flow.url.startsWith('#')) {
          location.hash = flow.url
        } else {
          location.assign(flow.url)
          return
        }
      }
    } catch (e) {
      fail(e)
    } finally {
      setBusy(null)
    }
  }

  const disconnect = async (ch: CloudChannel) => {
    setBusy(`off:${ch.platform}`)
    try {
      await client.disconnect(ch.platform)
      setLeaving(null)
      summary.reload()
      toast({ tone: 'ok', message: `${LABEL[ch.platform]} is disconnected from cloud mode.` })
    } catch (e) {
      fail(e)
    } finally {
      setBusy(null)
    }
  }

  const usePc = () => {
    chooseWeb('pc')
    location.replace(`${location.pathname}${location.search}#/home`)
    location.reload()
  }

  return (
    <div>
      <PageHeader
        title="Cloud mode"
        description="Alerts, overlays, chat, tips, goals and the bot run on Ferrocast’s servers. No PC needed, and it’s free."
        actions={
          <Button variant="ghost" icon={<Desktop size={17} />} onClick={usePc}>
            Use my PC instead
          </Button>
        }
      />
      {summary.error ? (
        <LoadError error={summary.error} onRetry={summary.reload} />
      ) : !summary.data ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      ) : !summary.data.enabled ? (
        <TurnOn busy={busy === 'enable'} onEnable={() => void enable()} />
      ) : (
        <On
          s={summary.data}
          busy={busy}
          onConnect={(p) => void connect(p)}
          onDisconnect={setLeaving}
        />
      )}
      <Dialog
        open={leaving !== null}
        onClose={() => setLeaving(null)}
        size="sm"
        title={leaving ? `Disconnect ${LABEL[leaving.platform]}?` : ''}
        description="Its alerts and chat stop reaching your cloud overlays, and the bot stops answering there. Your overlays, rules and designs stay."
        footer={
          <>
            <Button variant="ghost" onClick={() => setLeaving(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              busy={leaving ? busy === `off:${leaving.platform}` : false}
              onClick={() => leaving && void disconnect(leaving)}
            >
              Disconnect
            </Button>
          </>
        }
      >
        {null}
      </Dialog>
    </div>
  )
}

function TurnOn({ busy, onEnable }: { busy: boolean; onEnable: () => void }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <Panel>
        <div className="flex flex-col items-start gap-4 py-2">
          <CloudArrowUp
            size={40}
            weight="duotone"
            className="text-accent-text"
            aria-hidden="true"
          />
          <h2 className="font-display text-xl font-bold tracking-[-0.02em] text-text sm:text-2xl">
            Run Ferrocast without your PC
          </h2>
          <p className="max-w-[60ch] text-[15px] leading-relaxed text-text-2">
            Your overlays come from Ferrocast’s servers, so they work in OBS on any computer, and
            your alerts keep playing with the app closed. You get a Starter overlay and the usual
            alert rules to begin with.
          </p>
          <Button variant="primary" size="lg" busy={busy} onClick={onEnable}>
            Turn on cloud mode
          </Button>
        </div>
      </Panel>
      <StaysInApp />
    </div>
  )
}

function On({
  s,
  busy,
  onConnect,
  onDisconnect,
}: {
  s: CloudSummary
  busy: string | null
  onConnect: (p: CloudPlatform) => void
  onDisconnect: (ch: CloudChannel) => void
}) {
  const ch = (p: CloudPlatform) => s.channels.find((c) => c.platform === p)
  const anyConnected = s.channels.some((c) => !c.error)
  return (
    <div className="flex flex-col gap-5">
      {s.sleeping && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-panel border border-warn/30 bg-warn-soft p-4"
        >
          <Moon
            size={20}
            weight="duotone"
            className="mt-0.5 shrink-0 text-warn"
            aria-hidden="true"
          />
          <div className="text-[14.5px] leading-snug">
            <p className="font-semibold text-text">Cloud mode was asleep.</p>
            <p className="text-text-2">
              It wasn’t used for {s.limits.sleep_after_days} days. Opening the dashboard wakes it,
              and alerts start again within a minute.
            </p>
          </div>
        </div>
      )}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <Panel title="Channels" description="Where alerts and chat come from.">
            <ul className="-mx-1 flex flex-col">
              {(['twitch', 'kick', 'youtube'] as const).map((p) => (
                <ChannelRow
                  key={p}
                  platform={p}
                  channel={ch(p)}
                  available={p === 'youtube' ? cloudYoutubeState(s) === 'ready' : s.features[p]}
                  youtube={p === 'youtube' ? cloudYoutubeState(s) : undefined}
                  busy={busy}
                  onConnect={() => onConnect(p)}
                  onDisconnect={(c) => onDisconnect(c)}
                />
              ))}
            </ul>
          </Panel>
          <Panel title="Get it on stream">
            <ol className="flex flex-col gap-3">
              <Step done={anyConnected} n={1} title="Connect your channel">
                Alerts follow your channel from the moment it’s connected.
              </Step>
              <Step
                n={2}
                title="Pick how alerts look"
                to={href({ name: 'designs', tab: 'alerts' })}
              >
                Choose an alert design, then send a test.
              </Step>
              <Step n={3} title="Add an overlay to OBS" to={href({ name: 'overlays' })}>
                Copy its URL into a Browser source in OBS. It’s yours alone, so keep it private.
              </Step>
            </ol>
          </Panel>
        </div>
        <div className="flex flex-col gap-5">
          {s.usage && <Usage s={s} />}
          <StaysInApp />
        </div>
      </div>
    </div>
  )
}

function ChannelRow({
  platform,
  channel,
  available,
  youtube,
  busy,
  onConnect,
  onDisconnect,
}: {
  platform: CloudPlatform
  channel: CloudChannel | undefined
  available: boolean
  /** YouTube only: set up on the servers, Pro needed, or ready to connect. */
  youtube?: 'unavailable' | 'pro_needed' | 'ready' | undefined
  busy: string | null
  onConnect: () => void
  onDisconnect: (c: CloudChannel) => void
}) {
  const pro = platform === 'youtube'
  const line =
    youtube === 'unavailable' && !channel
      ? 'YouTube from the cloud isn’t set up on Ferrocast’s servers yet. It keeps working in the app on your PC.'
      : youtube === 'pro_needed' && !channel
        ? 'YouTube in cloud mode is part of Pro. It keeps working in the app on your PC.'
        : !available && !channel
          ? `${LABEL[platform]} isn’t set up on Ferrocast’s servers yet.`
          : cloudChannelLine(channel, platform)
  return (
    <li
      className="flex flex-col gap-3 rounded-control px-1 py-3 sm:flex-row sm:items-center"
      data-testid={`cloud-channel-${platform}`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-control bg-surface-2">
          <PlatformMark platform={platform} size={18} />
        </span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-text">
            {LABEL[platform]}
            {pro && <ProBadge />}
            {channel && !channel.error && <Badge tone="ok">Connected</Badge>}
            {channel?.error && <Badge tone="warn">Needs you</Badge>}
          </p>
          <p className="mt-0.5 text-[13.5px] break-words text-text-2">{line}</p>
          {channel?.error?.hint && (
            <p className="mt-0.5 text-[13px] text-text-3">{channel.error.hint}</p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 gap-2 pl-12 sm:pl-0">
        {youtube === 'pro_needed' && !channel ? (
          <a
            href={href({ name: 'plans' })}
            className="fc-press inline-flex h-8 items-center gap-1 rounded-control px-2 text-[13px] font-semibold text-accent-text hover:bg-surface-2 focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
          >
            See Pro
            <ArrowRight size={14} weight="bold" aria-hidden="true" />
          </a>
        ) : channel ? (
          <>
            {channel.error && available && (
              <Button size="sm" variant="primary" busy={busy === platform} onClick={onConnect}>
                Connect again
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => onDisconnect(channel)}>
              Disconnect
            </Button>
          </>
        ) : available ? (
          <Button
            size="sm"
            variant="secondary"
            icon={<PlugsConnected size={15} />}
            busy={busy === platform}
            onClick={onConnect}
          >
            Connect
          </Button>
        ) : null}
      </div>
    </li>
  )
}

function Step({
  n,
  title,
  done = false,
  to,
  children,
}: {
  n: number
  title: string
  done?: boolean
  to?: string
  children: React.ReactNode
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className={cx(
          'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-[12px] font-semibold',
          done ? 'bg-accent-soft text-accent-text' : 'bg-surface-2 text-text-3',
        )}
      >
        {done ? <Check size={13} weight="bold" /> : n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text">
          {title}
          {done && <span className="sr-only"> (done)</span>}
        </p>
        <p className="mt-0.5 text-[13.5px] text-text-2">{children}</p>
      </div>
      {to && (
        <a
          href={to}
          aria-label={`Open: ${title}`}
          className="fc-press inline-flex h-8 shrink-0 items-center gap-1 rounded-control px-2 text-[13px] font-semibold text-accent-text hover:bg-surface-2 focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
        >
          Open
          <ArrowRight size={14} weight="bold" aria-hidden="true" />
        </a>
      )}
    </li>
  )
}

function Usage({ s }: { s: CloudSummary }) {
  const u = s.usage
  if (!u) return null
  const pct = Math.min(100, Math.round((u.bytes / Math.max(u.bytes_limit, 1)) * 100))
  const counts: [string, number, number][] = [
    ['Overlays', u.overlays, s.limits.overlays],
    ['Alert rules', u.rules, s.limits.rules],
    ['Your designs', u.designs, s.limits.designs],
  ]
  return (
    <Panel title="Free limits">
      <div className="flex flex-col gap-4">
        <div>
          <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
            <span className="font-semibold text-text">Media</span>
            <span className="font-mono text-text-2 tabular-nums">
              {cloudBytes(u.bytes)} of {cloudBytes(u.bytes_limit)}
            </span>
          </div>
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3"
            role="meter"
            aria-label="Media used"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
          >
            <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1.5 text-[12.5px] text-text-3">
            Up to {cloudBytes(s.limits.file_bytes)} a file: pictures, sounds and short videos.
          </p>
        </div>
        <dl className="grid grid-cols-3 gap-3">
          {counts.map(([label, n, max]) => (
            <div key={label} className="rounded-control bg-surface-2 px-3 py-2">
              <dt className="text-[12px] text-text-3">{label}</dt>
              <dd className="font-mono text-[15px] font-semibold text-text tabular-nums">
                {n}
                <span className="text-[12px] font-normal text-text-3"> / {max}</span>
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-[12.5px] leading-relaxed text-text-3">
          Unused for {s.limits.sleep_after_days} days, cloud mode sleeps until you sign in again.
          Overlays open in OBS count as use.
        </p>
      </div>
    </Panel>
  )
}

function StaysInApp() {
  return (
    <Panel title="Stays in the app">
      <ul className="flex flex-col gap-1.5 text-[13.5px] text-text-2">
        {STAYS_IN_APP.map((t) => (
          <li key={t} className="flex gap-2">
            <Desktop size={15} className="mt-0.5 shrink-0 text-text-3" aria-hidden="true" />
            {t}
          </li>
        ))}
      </ul>
    </Panel>
  )
}
