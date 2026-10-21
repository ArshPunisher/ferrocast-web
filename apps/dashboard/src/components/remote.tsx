// Pro "Dashboard anywhere" (API.md §9.5).
// On the PC: Settings › Dashboard anywhere pairs the streamer's own phone or a mod's (a
// one-time QR code and link), lists paired devices with their role, removes them, and shows
// what phones did lately. On a phone: a strip on top says the dashboard goes through
// Ferrocast's servers and whether the PC is online, and the gate screens cover "not paired
// yet" and "PC is off".

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ArrowClockwise,
  CloudCheck,
  CloudArrowUp,
  CloudSlash,
  Copy,
  DeviceMobile,
  ChatsCircle,
  PauseCircle,
  Power,
  ShieldCheck,
  Trash,
} from '@phosphor-icons/react'
import {
  REMOTE_LIMITS,
  linkSecondsLeft,
  auditLabel,
  auditSource,
  cloudBotApi,
  cloudCanModerate,
  remoteOfflineMessage,
  describeError,
  relativeTime,
  remoteApi,
  type RemoteDevice,
  type RemoteLink,
  type RemoteRole,
  type RemoteView,
} from '@ferrocast/api'
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  Field,
  Input,
  Skeleton,
  copyText,
  cx,
  toast,
} from '@ferrocast/ui'
import { LoadError } from './Panel'
import { ProPanel } from './pro/ProPanel'
import { useAction, useClient, useNow, useResource } from '../lib/hooks'
import { isLimited, type RemoteState } from '../lib/store'
import { accountPcs, checkRemote, connectAccountPc, type RemoteProblem } from '../lib/boot'
import { qrEncode } from '../lib/qr'

// ---------------------------------------------------------------- QR code

/** A QR code as one SVG path, dark on light whatever the theme (cameras need the contrast). */
export function QrCode({
  text,
  size = 232,
  label,
}: {
  text: string
  size?: number
  label: string
}) {
  const { path, n } = useMemo(() => {
    const q = qrEncode(text)
    const quiet = 4
    let d = ''
    q.modules.forEach((row, y) =>
      row.forEach((on, x) => {
        if (on) d += `M${x + quiet} ${y + quiet}h1v1h-1z`
      }),
    )
    return { path: d, n: q.size + quiet * 2 }
  }, [text])
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${n} ${n}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className="rounded-[12px]"
      data-testid="remote-qr"
    >
      <rect width={n} height={n} fill="#f7f8fa" />
      <path d={path} fill="#0a0b0d" />
    </svg>
  )
}

// ---------------------------------------------------------------- phone side

/** The strip on top of a phone's dashboard. */
export function RemoteStrip({ remote }: { remote: RemoteState }) {
  if (isLimited(remote)) return <LimitedStrip remote={remote} />
  const on = remote.pcOnline
  const Icon = on ? CloudCheck : CloudSlash
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="remote-strip"
      data-online={on ? 'yes' : 'no'}
      className={cx(
        'flex min-h-10 items-center gap-2.5 border-b px-4 py-2 text-[14px] font-semibold sm:px-6',
        on
          ? 'border-accent-line bg-accent-soft text-text'
          : 'border-warn/30 bg-warn-soft text-warn',
      )}
    >
      <Icon size={19} weight="bold" className={on ? 'shrink-0 text-accent-text' : 'shrink-0'} />
      <span className="min-w-0 flex-1 truncate">
        Through Ferrocast’s servers · {on ? 'PC online' : 'PC offline'}
      </span>
      {remote.role === 'mod' && <Badge tone="neutral">Mod</Badge>}
    </div>
  )
}

/**
 * The PC is off and the cloud bot stands in (M10): a clear banner saying what still works.
 * An owner can pause the cloud bot from here (it's the one thing relay-side to switch).
 */
function LimitedStrip({ remote }: { remote: RemoteState }) {
  const client = useClient()
  // "Chat, bans and history still work." without the "Your PC is off." the title says.
  const stillWorks = remoteOfflineMessage(
    remote.role,
    cloudCanModerate(remote.cloudModeration),
  ).replace(/^Your PC is off\. /, '')
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { run, busy } = useAction()
  const pause = () =>
    void run(
      'pause',
      async () => {
        setError(null)
        try {
          await cloudBotApi(client).setEnabled(false)
          setAsking(false)
        } catch (e) {
          const d = describeError(e)
          setError(d.hint ? `${d.message} ${d.hint}` : d.message)
        }
      },
      { quiet: true },
    )
  return (
    <>
      <div
        data-testid="remote-strip"
        data-online="no"
        data-limited="yes"
        className="flex items-center gap-3 border-b border-warn/30 bg-warn-soft px-4 py-2.5 sm:px-6"
      >
        <CloudSlash size={22} weight="bold" className="shrink-0 text-warn" aria-hidden="true" />
        {/* Only the words are announced (not the Pause button) when the mode changes. */}
        <p role="status" aria-live="polite" className="min-w-0 flex-1 leading-tight">
          <span className="block font-display text-[16px] font-bold tracking-tight text-text">
            Your PC is off
          </span>
          <span className="block text-[13.5px] font-medium text-text-2" data-testid="limited-works">
            {stillWorks}
          </span>
        </p>
        {remote.role === 'mod' ? (
          <Badge tone="neutral">Mod</Badge>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            icon={<PauseCircle size={17} weight="bold" />}
            onClick={() => setAsking(true)}
            className="shrink-0"
          >
            {/* Icon only on a phone, so what still works fits on one line at 375 px. */}
            <span className="sr-only sm:not-sr-only">Pause bot</span>
          </Button>
        )}
      </div>
      <Dialog
        open={asking}
        onClose={() => {
          setAsking(false)
          setError(null)
        }}
        size="sm"
        title="Pause the cloud bot?"
        description={`It stops answering in your chat. ${
          cloudCanModerate(remote.cloudModeration) ? 'Chat and bans here stop' : 'Chat here stops'
        } too, until you switch it back on or your PC is on.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAsking(false)}>
              Keep it on
            </Button>
            <Button variant="danger" busy={busy === 'pause'} onClick={pause}>
              Pause
            </Button>
          </>
        }
      >
        {error && (
          <p role="alert" className="text-[14px] font-semibold text-danger">
            {error}
          </p>
        )}
      </Dialog>
    </>
  )
}

/** A screen part that needs the PC while it's off: a plain line instead of the controls. */
export function NeedsPc({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cx('flex items-center gap-2 text-[14px] font-semibold text-text-2', className)}
      data-testid="needs-pc"
    >
      <Power size={18} weight="bold" className="shrink-0 text-text-3" aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}

type GateProblem = RemoteProblem | { pairing: string } | { failed: string; hint: string | null }

const GATE_COPY: Record<RemoteProblem, { title: string; body: string }> = {
  unpaired: {
    title: 'Pair this phone',
    body: 'On your streaming PC, open Settings › Dashboard anywhere and scan the code.',
  },
  pc_offline: {
    title: 'Your streaming PC is off.',
    body: 'Turn it on and open Ferrocast. This page comes back by itself.',
  },
  cloud_paused: {
    title: 'Your streaming PC is off.',
    body: 'The cloud bot is paused. Switch it on for chat and bans here.',
  },
  pro_paused: {
    title: 'Sign in on your PC',
    body: 'Update Ferrocast on your streaming PC to 1.3 or newer and sign in there with this account. The web dashboard is free with an account. This page comes back by itself.',
  },
  signing_in: {
    title: 'Signing you in…',
    body: 'The web dashboard needs your free Ferrocast account. The sign-in page opens next.',
  },
  account_disabled: {
    title: 'This account is turned off',
    body: 'Write to support@clearcraftlabs.com and we’ll sort it out.',
  },
  choose_pc: {
    title: 'Which PC?',
    body: 'Your account is signed in on more than one PC. Pick the one to open.',
  },
  no_pcs: {
    title: 'Sign in on your PC',
    body: 'Open Ferrocast on your streaming PC and press Sign in at the bottom of the sidebar. Then try again here.',
  },
  elsewhere: {
    title: 'Open in another tab',
    body: 'This phone has the dashboard open in too many tabs. Use the newest one, or reload here.',
  },
}

/**
 * Full-screen notes for a phone that can't show the dashboard. A PC that's off is looked at
 * quietly every 10 s (`/r/v1/me`): nothing on screen moves until the answer changes, so focus
 * stays where it is and a screen reader hears the news once.
 */
export function RemoteGate({
  problem,
  onRetry,
  onCloudOn,
  onUseCloud,
  check = checkRemote,
  every = 10_000,
}: {
  problem: GateProblem
  onRetry: () => void
  /** The owner switched the cloud bot back on (`cloud_paused`): opens chat and bans. */
  onCloudOn?: () => Promise<void>
  /** The web dashboard on a relay with cloud mode: run it without the PC (CLOUD.md). */
  onUseCloud?: () => void
  /** Injected in tests. */
  check?: () => Promise<RemoteProblem | 'online' | null>
  every?: number
}) {
  const paused = problem === 'cloud_paused'
  const offline = problem === 'pc_offline' || paused
  const [switching, setSwitching] = useState(false)
  const [switchError, setSwitchError] = useState<{ message: string; hint: string | null } | null>(
    null,
  )
  const cloudOn = () => {
    if (!onCloudOn) return
    setSwitching(true)
    setSwitchError(null)
    onCloudOn()
      .catch((e: unknown) => setSwitchError(describeError(e)))
      .finally(() => setSwitching(false))
  }
  const [checking, setChecking] = useState(false)
  const latest = useRef({ onRetry, check })
  latest.current = { onRetry, check }
  const look = useRef<() => Promise<void>>(async () => {})
  look.current = async () => {
    const r = await latest.current.check()
    // Only a change starts the dashboard again; "still off" changes nothing on screen. The
    // cloud bot paused (or back from paused) is a change too: the owner gets its switch.
    if (r !== null && r !== problem) latest.current.onRetry()
  }
  useEffect(() => {
    if (!offline) return
    const t = setInterval(() => void look.current(), every)
    return () => clearInterval(t)
  }, [offline, every])
  let title: string
  let body: string | null
  let busy = false
  if (typeof problem === 'string') {
    ;({ title, body } = GATE_COPY[problem])
  } else if ('pairing' in problem) {
    title = 'Pairing this phone…'
    body = null
    busy = true
  } else {
    title = problem.failed
    body = problem.hint
  }
  const tone = offline || problem === 'pro_paused' ? 'warn' : 'accent'
  const Icon = offline ? CloudSlash : problem === 'pro_paused' ? PauseCircle : DeviceMobile
  const retry = () => {
    if (!offline) return onRetry()
    setChecking(true)
    void look.current().finally(() => setChecking(false))
  }
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-text">
      {offline && <RemoteStrip remote={{ role: 'owner', name: '', pcOnline: false }} />}
      <main className="flex flex-1 items-center px-5 py-10">
        <div
          className="mx-auto flex w-full max-w-md flex-col items-start gap-5"
          role={busy ? 'status' : offline ? undefined : 'alert'}
          data-testid="remote-gate"
          data-problem={
            typeof problem === 'string' ? problem : 'pairing' in problem ? 'pairing' : 'failed'
          }
        >
          <Icon
            size={48}
            weight="duotone"
            className={tone === 'warn' ? 'text-warn' : 'text-accent-text'}
            aria-hidden="true"
          />
          <h1 className="font-display text-[38px] leading-[1.05] font-extrabold tracking-[-0.02em] sm:text-[44px]">
            {title}
          </h1>
          {body && <p className="text-[18px] leading-snug font-semibold text-text-2">{body}</p>}
          {paused && onCloudOn && (
            <Button
              variant="primary"
              size="lg"
              icon={<ChatsCircle size={20} weight="bold" />}
              onClick={cloudOn}
              busy={switching}
              className="w-full sm:w-auto"
            >
              Switch cloud bot on
            </Button>
          )}
          {problem === 'choose_pc' && <PcChoice onDone={onRetry} />}
          {onUseCloud &&
            (problem === 'no_pcs' || problem === 'choose_pc' || problem === 'pc_offline') && (
              <div className="flex w-full flex-col items-start gap-2 rounded-panel border border-line bg-surface-1 p-4">
                <p className="text-[15px] leading-snug text-text-2">
                  No PC needed: alerts, overlays, chat and the bot can run from Ferrocast’s servers.
                  It’s free.
                </p>
                <Button
                  variant="secondary"
                  icon={<CloudArrowUp size={18} weight="bold" />}
                  onClick={onUseCloud}
                >
                  Use cloud mode
                </Button>
              </div>
            )}
          {switchError && (
            <p role="alert" className="text-[15px] font-semibold text-danger">
              {switchError.message}
              {switchError.hint ? ` ${switchError.hint}` : ''}
            </p>
          )}
          {!busy && (
            <Button
              variant={paused && onCloudOn ? 'secondary' : 'primary'}
              size="lg"
              icon={<ArrowClockwise size={20} weight="bold" />}
              onClick={retry}
              busy={checking}
              className="w-full sm:w-auto"
            >
              {offline ? 'Check now' : problem === 'elsewhere' ? 'Use it here' : 'Try again'}
            </Button>
          )}
        </div>
      </main>
    </div>
  )
}

/** The account's PCs, each with Open (the "Which PC?" screen on the web dashboard). */
function PcChoice({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const api = window.__FERROCAST__?.api ?? ''
  return (
    <div className="flex w-full flex-col gap-2">
      <ul className="divide-y divide-line rounded-[14px] border border-line bg-surface-1">
        {accountPcs.map((pc) => (
          <li key={pc.id} className="flex items-center gap-3 px-3.5 py-3">
            <span className="min-w-0 flex-1">
              <b className="block truncate text-[15px] font-semibold text-text">
                {pc.label || 'Your PC'}
              </b>
              <small className="block text-[13px] text-text-3">
                {pc.pc_online ? 'On now' : 'Off'}
              </small>
            </span>
            <Button
              size="sm"
              busy={busy === pc.id}
              onClick={() => {
                setBusy(pc.id)
                setErr(null)
                connectAccountPc(api, pc.id)
                  .then(onDone)
                  .catch((e: unknown) => {
                    const d = describeError(e)
                    setErr(d.hint ? `${d.message} ${d.hint}` : d.message)
                  })
                  .finally(() => setBusy(null))
              }}
            >
              Open
            </Button>
          </li>
        ))}
      </ul>
      {err && (
        <p role="alert" className="text-[14px] font-semibold text-danger">
          {err}
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Settings › Dashboard anywhere

/** The Settings panel (hidden without the feature; one calm line without Pro). */
export function RemoteDevices() {
  return (
    <div id="settings-remote" className="scroll-mt-20">
      <ProPanel feature="remote" id="remote" title="Dashboard anywhere">
        <RemoteBody />
      </ProPanel>
    </div>
  )
}

const ROLE_LABEL: Record<RemoteRole, string> = { owner: 'Owner', mod: 'Mod' }

function RemoteBody() {
  const client = useClient()
  const res = useResource((c) => remoteApi(c).view())
  const [linkFor, setLinkFor] = useState<RemoteRole | null>(null)
  const [removing, setRemoving] = useState<RemoteDevice | null>(null)
  const { run, busy } = useAction()
  const now = useNow(30_000)
  if (res.error && !res.data) return <LoadError error={res.error} onRetry={res.reload} />
  const v = res.data
  const owners = v?.devices.filter((d) => d.role === 'owner').length ?? 0
  const mods = v?.devices.filter((d) => d.role === 'mod').length ?? 0
  return (
    <div className="flex flex-col gap-5">
      <p className="max-w-[60ch] text-[15px] leading-relaxed font-medium text-text">
        Your dashboard on your phone, from anywhere. Your PC needs to be on.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="primary"
          size="lg"
          icon={<DeviceMobile size={20} weight="bold" />}
          onClick={() => setLinkFor('owner')}
          disabled={!v || owners >= REMOTE_LIMITS.owner}
          className="w-full sm:w-auto"
        >
          Add my phone
        </Button>
        <Button
          size="lg"
          icon={<ShieldCheck size={20} weight="bold" />}
          onClick={() => setLinkFor('mod')}
          disabled={!v || mods >= REMOTE_LIMITS.mod}
          className="w-full sm:w-auto"
        >
          Invite a mod
        </Button>
      </div>
      {!v ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : (
        <>
          <TunnelLine view={v} />
          {v.devices.length === 0 ? (
            <EmptyState compact title="No phones yet">
              Add your phone, or invite a mod to help from theirs.
            </EmptyState>
          ) : (
            <ul className="flex flex-col gap-2" aria-label="Paired devices">
              {v.devices.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center gap-3 rounded-control border border-line bg-surface-2 px-3 py-3"
                >
                  <DeviceMobile size={22} className="shrink-0 text-text-3" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-[15px] font-semibold text-text">{d.name}</span>
                      <Badge tone={d.role === 'owner' ? 'accent' : 'neutral'}>
                        {ROLE_LABEL[d.role]}
                      </Badge>
                    </p>
                    <p className="mt-0.5 text-[13px] text-text-3">
                      {now - d.last_used_at < 60_000
                        ? 'Used just now'
                        : `Used ${relativeTime(d.last_used_at, now)} ago`}
                    </p>
                  </div>
                  <Button
                    variant="danger-ghost"
                    size="sm"
                    icon={<Trash size={16} />}
                    onClick={() => setRemoving(d)}
                    aria-label={`Remove ${d.name}`}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[13px] text-text-3" data-testid="remote-counts">
            {owners} of {v.limits.owner} own devices, {mods} of {v.limits.mod} mods
          </p>
          {v.audit.length > 0 && <Activity view={v} now={now} />}
        </>
      )}
      {linkFor && (
        <LinkDialog
          role={linkFor}
          before={v?.devices.length ?? 0}
          onClose={() => {
            setLinkFor(null)
            res.reload()
          }}
        />
      )}
      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        size="sm"
        title={removing ? `Remove ${removing.name}?` : ''}
        description="It’s signed out at once. You can pair it again any time."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              busy={busy === 'remove'}
              onClick={() => {
                const d = removing
                if (!d) return
                void run('remove', () => remoteApi(client).revoke(d.id), {
                  success: `${d.name} removed.`,
                }).then(() => {
                  setRemoving(null)
                  res.reload()
                })
              }}
            >
              Remove
            </Button>
          </>
        }
      />
    </div>
  )
}

function TunnelLine({ view }: { view: RemoteView }) {
  const t = view.tunnel.state
  const text =
    t === 'connected'
      ? 'Phones can reach this PC right now.'
      : t === 'connecting'
        ? 'Connecting to Ferrocast’s servers…'
        : t === 'retrying'
          ? 'Can’t reach Ferrocast’s servers. Trying again.'
          : view.devices.length === 0
            ? 'Opens when you pair a phone.'
            : 'Not connected yet.'
  const Icon = t === 'connected' ? CloudCheck : CloudSlash
  return (
    <p
      className={cx(
        'flex items-center gap-2 text-[14px] font-semibold',
        t === 'connected' ? 'text-text' : t === 'retrying' ? 'text-warn' : 'text-text-2',
      )}
      data-testid="remote-tunnel"
    >
      <Icon
        size={18}
        weight="bold"
        className={t === 'connected' ? 'text-accent-text' : ''}
        aria-hidden="true"
      />
      {text}
    </p>
  )
}

function Activity({ view, now }: { view: RemoteView; now: number }) {
  const lines = view.audit.slice(0, 6)
  return (
    <section
      aria-labelledby="remote-activity"
      className="flex flex-col gap-2 border-t border-line pt-4"
    >
      <h3 id="remote-activity" className="font-display text-[15px] font-semibold tracking-tight">
        Recent from phones
      </h3>
      <ul className="flex flex-col gap-1.5">
        {lines.map((a, i) => (
          <li key={`${a.at}-${i}`} className="flex flex-wrap items-baseline gap-x-2 text-[14px]">
            <span className="font-medium text-text">{auditLabel(a)}</span>
            <span className="text-text-3">
              by {a.device_name},{auditSource(a) ? ` ${auditSource(a)},` : ''}{' '}
              {now - a.at < 60_000 ? 'just now' : `${relativeTime(a.at, now)} ago`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function mmss(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Makes a one-time link and shows it as a QR code and text; closes once a phone pairs. */
function LinkDialog({
  role,
  before,
  onClose,
}: {
  role: RemoteRole
  before: number
  onClose: () => void
}) {
  const client = useClient()
  const [name, setName] = useState('')
  // When the link arrived, by this device's clock: the countdown runs from here.
  const [link, setLinkState] = useState<{ v: RemoteLink; at: number } | null>(null)
  const setLink = (v: RemoteLink) => setLinkState({ v, at: Date.now() })
  const [error, setError] = useState<{ message: string; hint: string | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const now = useNow(1_000)
  const make = (n?: string) => {
    setBusy(true)
    setError(null)
    remoteApi(client)
      .link(role, n)
      .then(setLink)
      .catch((e: unknown) => setError(describeError(e)))
      .finally(() => setBusy(false))
  }
  // Your own phone: the code right away. A mod: a name first.
  const started = useRef(false)
  useEffect(() => {
    if (role === 'owner' && !started.current) {
      started.current = true
      make()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role])
  const left = link ? linkSecondsLeft(link.v, link.at, now) : 0
  const expired = link !== null && left <= 0
  // While the code is up, look for the new device and close when it arrives (not after it
  // expired: nothing can pair then).
  useEffect(() => {
    if (!link || expired) return
    let alive = true
    const t = setInterval(() => {
      void remoteApi(client)
        .view()
        .then((v) => {
          if (!alive || v.devices.length <= before) return
          const d = v.devices[0]
          toast({ tone: 'ok', message: d ? `${d.name} is paired.` : 'Paired.' })
          onClose()
        })
        .catch(() => {})
    }, 3_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [link, expired, client, before, onClose])
  const title = role === 'owner' ? 'Scan with your phone' : 'Invite a mod'
  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={title}
      description={
        role === 'owner'
          ? 'Point your phone’s camera at the code.'
          : 'Send this link to your mod. They can chat-moderate, nothing else.'
      }
      footer={
        <Button variant="ghost" onClick={onClose}>
          Done
        </Button>
      }
    >
      {role === 'mod' && !link && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            make(name.trim() || undefined)
          }}
        >
          <Field label="Mod’s name" hint="So you know whose phone it is." optional>
            {(p) => (
              <Input
                {...p}
                value={name}
                maxLength={40}
                onChange={(e) => setName(e.target.value)}
                autoComplete="off"
              />
            )}
          </Field>
          <Button type="submit" variant="primary" busy={busy} className="self-start">
            Make link
          </Button>
        </form>
      )}
      {error && (
        <div
          role="alert"
          className="mt-3 rounded-control border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm"
        >
          <p className="font-semibold text-text">{error.message}</p>
          {error.hint && <p className="mt-0.5 text-text-2">{error.hint}</p>}
        </div>
      )}
      {role === 'owner' && !link && !error && <Skeleton className="mx-auto h-[232px] w-[232px]" />}
      {link && (
        <div className="flex flex-col items-center gap-4">
          {expired ? (
            <div className="flex h-[232px] w-[232px] flex-col items-center justify-center gap-3 rounded-[12px] border border-line bg-surface-2 text-center">
              <p className="text-[15px] font-semibold">This link expired.</p>
              <Button
                variant="primary"
                onClick={() => make(link.v.role === 'mod' ? link.v.name : undefined)}
                busy={busy}
              >
                Make a new one
              </Button>
            </div>
          ) : (
            <QrCode
              text={link.v.url}
              label={`QR code for the ${role === 'owner' ? 'phone' : 'mod'} link`}
            />
          )}
          <div className="flex w-full gap-2">
            <Input
              readOnly
              value={link.v.url}
              aria-label="Pairing link"
              className="min-w-0 flex-1 font-mono text-[13px]"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              icon={<Copy size={16} />}
              onClick={() =>
                void copyText(link.v.url).then((ok) =>
                  toast(
                    ok
                      ? { tone: 'ok', message: 'Link copied.' }
                      : { tone: 'error', message: 'Couldn’t copy. Select the link and copy it.' },
                  ),
                )
              }
            >
              Copy
            </Button>
          </div>
          <p className="text-[14px] font-semibold text-text-2">
            {expired
              ? 'Links work once, for 10 minutes.'
              : `Works once, for ${mmss(left * 1000)} more.`}
          </p>
        </div>
      )}
    </Dialog>
  )
}
