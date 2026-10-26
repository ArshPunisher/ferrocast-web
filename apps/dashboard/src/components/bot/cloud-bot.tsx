// Bot › "Keep the bot on when this PC is off" (Pro, API.md §9.7). Ferrocast's servers answer
// the streamer's commands, counters, timers and auto-replies on Twitch, Kick and YouTube (a
// beta with a daily budget of YouTube's quota units, M12) while the PC is off; the PC answers
// while it's on. Hidden without the feature; one calm line on sale
// without Pro. On a phone through Ferrocast's servers an owner may look and switch it, never
// connect or disconnect (those open sign-ins on the PC).

import { useEffect, useRef, useState } from 'react'
import {
  ArrowSquareOut,
  ArrowsClockwise,
  CloudCheck,
  Desktop,
  Moon,
  ShieldCheck,
  Trash,
  WarningCircle,
} from '@phosphor-icons/react'
import {
  CLOUD_BOT_LABEL,
  CLOUD_BOT_PLATFORMS,
  cloudAvailable,
  cloudBotApi,
  cloudBotCanEnable,
  cloudChannel,
  describeCloudBotError,
  dropLine,
  dutyLine,
  issueMessage,
  lastReplyLine,
  quotaLine,
  quotaUsedUpLine,
  syncLine,
  type CloudBotChannel,
  type CloudBotConnect,
  type CloudBotPlatform,
  type CloudBotView,
} from '@ferrocast/api'
import { Badge, Button, Dialog, PlatformMark, Skeleton, Switch, cx, toast } from '@ferrocast/ui'
import { Panel } from '../Panel'
import { ProChip } from '../pro/ProChip'
import { ProPanel } from '../pro/ProPanel'
import { useAction, useClient, useResource } from '../../lib/hooks'
import { useLive } from '../../lib/store'
import { externalLink } from '../../lib/external'

const TITLE = 'Keep the bot on when this PC is off'
/** Who answers can change any minute (the PC goes quiet): look again this often while seen. */
const POLL_MS = 30_000

/** The panel on the Bot page. */
export function CloudBotPanel({ className }: { className?: string }) {
  const remote = useLive((s) => s.remote)
  if (remote) return remote.role === 'owner' ? <PhoneCloudBot className={className} /> : null
  return (
    <ProPanel
      feature="cloud_bot"
      id="cloud-bot"
      title={TITLE}
      {...(className ? { className } : {})}
    >
      <CloudBotBody phone={false} />
    </ProPanel>
  )
}

/** A phone can't read `/pro` (Pro and billing stay on the PC): it asks the bot itself and
 * shows the panel only when that works. */
function PhoneCloudBot({ className }: { className?: string | undefined }) {
  const res = useResource((c) => cloudBotApi(c).get())
  if (res.error || !res.data || res.data.pro_available === false) return null
  return (
    <Panel id="cloud-bot" title={TITLE} actions={<ProChip />} {...(className ? { className } : {})}>
      <Loaded view={res.data} phone set={(n) => res.set(n)} reload={res.reload} />
    </Panel>
  )
}

function fail(e: unknown): string {
  const d = describeCloudBotError(e)
  return d.hint ? `${d.message} ${d.hint}` : d.message
}

function CloudBotBody({ phone }: { phone: boolean }) {
  const res = useResource((c) => cloudBotApi(c).get())
  if (res.error) return <CloudLoadError error={res.error} onRetry={res.reload} />
  const v = res.data
  if (!v) return <Skeleton className="h-56" />
  return <Loaded view={v} phone={phone} set={(n) => res.set(n)} reload={res.reload} />
}

/** Like the shared LoadError, with the cloud bot's own fallback hints. */
function CloudLoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const d = describeCloudBotError(error)
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-2 rounded-panel border border-danger/30 bg-danger-soft p-4"
    >
      <p className="text-[16px] font-semibold text-text">{d.message}</p>
      <p className="text-[15px] text-text-2">{d.hint ?? 'Try again in a moment.'}</p>
      <Button size="sm" icon={<ArrowsClockwise size={16} />} onClick={onRetry} className="mt-1">
        Try again
      </Button>
    </div>
  )
}

const TONE_ICON = {
  off: <Moon size={26} weight="duotone" aria-hidden />,
  standby: <Desktop size={26} weight="duotone" aria-hidden />,
  duty: <CloudCheck size={26} weight="duotone" aria-hidden />,
}

function Loaded({
  view: v,
  phone,
  set,
  reload,
}: {
  view: CloudBotView
  phone: boolean
  set: (v: CloudBotView) => void
  reload: () => void
}) {
  const api = cloudBotApi(useClient())
  const { run, busy } = useAction()
  const duty = dutyLine(v, { phone })
  // Keep the duty line current while the panel is on screen; a failed look keeps the last one.
  const latest = useRef({ api, set })
  latest.current = { api, set }
  useEffect(() => {
    let alive = true
    const look = () => {
      if (document.visibilityState !== 'visible') return
      latest.current.api
        .get()
        .then((n) => {
          if (alive) latest.current.set(n)
        })
        .catch(() => {})
    }
    const t = window.setInterval(look, POLL_MS)
    document.addEventListener('visibilitychange', look)
    return () => {
      alive = false
      window.clearInterval(t)
      document.removeEventListener('visibilitychange', look)
    }
  }, [])
  const canEnable = cloudBotCanEnable(v)
  const [toggleErr, setToggleErr] = useState<string | null>(null)
  const flip = async (on: boolean) => {
    setToggleErr(null)
    try {
      set(await api.setEnabled(on))
    } catch (e) {
      setToggleErr(fail(e))
    }
  }
  // One Molten button per view (DESIGN.md): the first platform with a step to take.
  const nextStep = CLOUD_BOT_PLATFORMS.find((p) => {
    const c = cloudChannel(v, p)
    return c ? c.state === 'needs_channel' : cloudAvailable(v, p)
  })
  // A relay from before YouTube (M12) doesn't name it: no row at all there.
  const platforms = CLOUD_BOT_PLATFORMS.filter(
    (p) => p !== 'youtube' || v.available.youtube !== undefined || !!cloudChannel(v, p),
  )
  const last = v.channels.reduce<number | null>(
    (m, c) => (c.last_reply_at && (!m || c.last_reply_at > m) ? c.last_reply_at : m),
    null,
  )
  return (
    <div className="flex flex-col gap-6">
      <div
        className={cx(
          'flex flex-col gap-4 rounded-panel border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5',
          duty.tone === 'duty' ? 'border-accent-line bg-accent-soft' : 'border-line bg-surface-2',
        )}
        data-testid="cloud-bot-duty"
      >
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cx(
              'grid size-12 shrink-0 place-items-center rounded-control',
              duty.tone === 'off' ? 'bg-surface-3 text-text-3' : 'bg-surface-1 text-accent-text',
            )}
          >
            {TONE_ICON[duty.tone]}
          </span>
          <div className="min-w-0">
            <p
              className="font-display text-[22px] leading-tight font-bold tracking-tight text-text"
              data-testid="cloud-bot-status"
              aria-live="polite"
            >
              {duty.title}
            </p>
            <p className="mt-1 text-[15.5px] leading-snug text-text-2">{duty.detail}</p>
            {v.enabled && (
              <p className="mt-1 text-[14.5px] text-text-3" data-testid="cloud-bot-last-reply">
                {lastReplyLine(last)}
              </p>
            )}
          </div>
        </div>
        <div className="shrink-0 sm:w-56">
          <Switch
            label="Cloud bot"
            description={
              canEnable || v.enabled ? syncLine(v.sync) : 'Connect a channel below first.'
            }
            checked={v.enabled}
            disabled={busy === 'enabled' || (!v.enabled && !canEnable)}
            onChange={(on) => void run('enabled', () => flip(on), { quiet: true })}
          />
        </div>
      </div>

      {toggleErr && (
        <p role="alert" className="text-[15px] font-semibold text-danger">
          {toggleErr}
        </p>
      )}
      {v.sync.state === 'error' && v.sync.error && (
        <Notice tone="warn" message={v.sync.error.message} hint={v.sync.error.hint} />
      )}

      <ul className="flex flex-col divide-y divide-line" data-testid="cloud-bot-platforms">
        {platforms.map((p) => (
          <PlatformRow
            key={p}
            platform={p}
            lead={p === nextStep}
            channel={cloudChannel(v, p)}
            available={cloudAvailable(v, p)}
            phone={phone}
            reload={reload}
            onGone={(n) => set(n)}
          />
        ))}
      </ul>

      <p className="text-[14px] leading-relaxed text-text-3">
        Your commands, counters, timers and auto-replies, up to {v.limits.messages_per_minute}{' '}
        messages a minute per channel. Chat is never stored.
        {v.pc_code && (
          <>
            {' '}
            {phone ? 'Your PC’s code' : 'This PC’s code'} is{' '}
            <span
              className="font-mono font-semibold text-text-2"
              translate="no"
              data-testid="cloud-bot-pc-code"
            >
              {v.pc_code}
            </span>
            . Sign-in pages show the same code.
          </>
        )}
      </p>
    </div>
  )
}

function Notice({
  tone,
  message,
  hint,
}: {
  tone: 'warn' | 'danger'
  message: string
  hint?: string | null
}) {
  return (
    <p
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cx(
        'flex items-start gap-2 rounded-control px-3 py-2.5 text-[15px]',
        tone === 'warn' ? 'bg-warn-soft text-warn' : 'bg-danger-soft text-danger',
      )}
    >
      <WarningCircle size={18} className="mt-0.5 shrink-0" aria-hidden />
      <span>
        <span className="font-semibold">{message}</span>
        {hint ? <span className="text-text-2"> {hint}</span> : null}
      </span>
    </p>
  )
}

/**
 * "Let the cloud bot moderate when this PC is off" (M10): signs the bot account in again with
 * the moderator scopes, so a phone's bans, timeouts and deletes work while the PC is off.
 */
function ModerationOptIn({
  channel: c,
  phone,
  busy,
  showButton,
  onTurnOn,
}: {
  channel: CloudBotChannel
  phone: boolean
  busy: boolean
  showButton: boolean
  onTurnOn: () => void
}) {
  const bot = c.bot?.login ?? 'the bot account'
  const own = c.bot && c.channel && c.bot.id === c.channel.id
  const youtube = c.platform === 'youtube'
  return (
    <div
      className="flex flex-col gap-3 rounded-control border border-line bg-surface-2 p-3 sm:flex-row sm:items-center sm:justify-between"
      data-testid={`cloud-bot-${c.platform}-moderation`}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <ShieldCheck size={20} weight="bold" className="mt-0.5 shrink-0 text-text-3" aria-hidden />
        <div className="min-w-0">
          <p className="text-[15.5px] font-semibold text-text">
            Let the cloud bot moderate when this PC is off
          </p>
          <p className="text-[14.5px] text-text-2" translate="no">
            {youtube
              ? c.moderation
                ? 'On. Deletes from a phone any time, bans and timeouts while you’re live. Each uses 50 units.'
                : 'Deletes from a phone while this PC is off, bans while you’re live. Each uses 50 units.'
              : c.moderation
                ? `On. Bans, timeouts and deletes from a phone go out as ${bot}.`
                : own
                  ? 'Bans, timeouts and deletes from a phone while this PC is off.'
                  : `Bans, timeouts and deletes from a phone while this PC is off. ${bot} must be a moderator in your channel.`}
          </p>
        </div>
      </div>
      {c.moderation ? (
        <Badge tone="ok">On</Badge>
      ) : phone ? (
        <span className="text-[14px] text-text-3">Turn it on at the PC</span>
      ) : (
        showButton && (
          <Button size="sm" busy={busy} onClick={onTurnOn} className="shrink-0">
            Turn on
          </Button>
        )
      )}
    </div>
  )
}

function who(c: CloudBotChannel): string {
  if (!c.bot) return 'Connected'
  if (!c.channel) return `${c.bot.login} is signed in`
  if (c.bot.id === c.channel.id) return `Speaks as ${c.bot.login}`
  return `${c.bot.login} in ${c.channel.login}’s chat`
}

function PlatformRow({
  platform,
  lead,
  channel: c,
  available,
  phone,
  reload,
  onGone,
}: {
  platform: CloudBotPlatform
  /** This row's step is the next one: the view's primary button. */
  lead: boolean
  channel: CloudBotChannel | null
  available: boolean
  phone: boolean
  reload: () => void
  onGone: (v: CloudBotView) => void
}) {
  const api = cloudBotApi(useClient())
  const { run, busy } = useAction()
  const label = CLOUD_BOT_LABEL[platform]
  const [link, setLink] = useState<CloudBotConnect | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [leaveErr, setLeaveErr] = useState<string | null>(null)

  // The sign-in link stops working after 10 minutes; back from its tab, look again.
  useEffect(() => {
    if (!link) return
    const t = window.setTimeout(() => setLink(null), Math.max(0, link.expires_at - Date.now()))
    const onFocus = () => reload()
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('focus', onFocus)
    }
  }, [link, reload])
  // A step finished: the old link is spent.
  const step = c?.state ?? 'none'
  // A used moderation link goes too once moderation turns on (the step stays 'ready').
  const modOn = c?.moderation === true
  useEffect(() => setLink(null), [step, modOn])

  const connect = async (account: 'bot' | 'channel', moderation = false) => {
    setErr(null)
    try {
      const r = await api.connect(platform, {
        ...(platform === 'twitch' ? { account } : {}),
        ...(moderation ? { moderation: true } : {}),
      })
      setLink(r)
    } catch (e) {
      setErr(fail(e))
    }
  }
  const retry = async () => {
    setErr(null)
    try {
      onGone(await api.retry(platform))
    } catch (e) {
      setErr(fail(e))
    }
  }
  // YouTube: look for a live stream on the relay's next pass (Try again's route).
  const checkNow = async () => {
    setErr(null)
    try {
      onGone(await api.retry(platform))
      toast({ tone: 'ok', message: 'Looking for your YouTube stream now.' })
    } catch (e) {
      setErr(fail(e))
    }
  }
  const leave = async () => {
    setLeaveErr(null)
    try {
      await api.disconnect(platform)
    } catch (e) {
      setLeaveErr(fail(e))
      return
    }
    setLeaving(false)
    toast({ tone: 'ok', message: `${label} disconnected.` })
    try {
      onGone(await api.get())
    } catch {
      reload()
    }
  }

  const state = !c ? null : c.state
  const badge =
    state === 'ready' ? (
      <Badge tone="ok">Ready</Badge>
    ) : state === 'needs_channel' ? (
      <Badge tone="warn">One step left</Badge>
    ) : state === 'error' ? (
      <Badge tone="danger">Stopped</Badge>
    ) : null

  return (
    <li
      className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0"
      data-testid={`cloud-bot-${platform}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-control bg-surface-3">
            <PlatformMark platform={platform} size={22} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-display text-[18px] font-bold tracking-tight text-text">{label}</p>
              {platform === 'youtube' && <Badge tone="neutral">Beta</Badge>}
              {badge}
            </div>
            <p className="truncate text-[15px] text-text-2" translate="no">
              {c ? who(c) : available ? 'Not connected' : 'Not set up on Ferrocast’s servers yet'}
            </p>
            {c?.state === 'ready' && (
              <p className="text-[14px] text-text-3">{lastReplyLine(c.last_reply_at)}</p>
            )}
            {c?.quota && (
              <p
                className="text-[14px] text-text-3 tabular-nums"
                data-testid={`cloud-bot-${platform}-quota`}
              >
                {quotaLine(c.quota)}
              </p>
            )}
          </div>
        </div>
        {!phone && !link && (
          <div className="flex flex-wrap gap-2">
            {!c && available && (
              <Button
                variant={lead ? 'primary' : 'secondary'}
                busy={busy === 'connect'}
                onClick={() => void run('connect', () => connect('bot'), { quiet: true })}
              >
                {platform === 'twitch' ? 'Connect bot account' : `Connect ${label}`}
              </Button>
            )}
            {c?.state === 'needs_channel' && (
              <Button
                variant={lead ? 'primary' : 'secondary'}
                busy={busy === 'connect'}
                onClick={() => void run('connect', () => connect('channel'), { quiet: true })}
              >
                Allow it in your channel
              </Button>
            )}
            {c && (
              <Button
                variant="danger-ghost"
                icon={<Trash size={16} />}
                onClick={() => setLeaving(true)}
              >
                Disconnect
              </Button>
            )}
          </div>
        )}
      </div>

      {c?.state === 'ready' && (
        <ModerationOptIn
          channel={c}
          phone={phone}
          busy={busy === 'moderation'}
          showButton={!link}
          onTurnOn={() => void run('moderation', () => connect('bot', true), { quiet: true })}
        />
      )}
      {c?.state === 'needs_channel' && !phone && (
        <p className="text-[15px] text-text-2">
          Now sign in with your channel account on Twitch so {c.bot?.login ?? 'the bot'} may speak
          there. The same account twice is fine.
        </p>
      )}
      {c?.error && (
        <div className="flex flex-col items-start gap-2">
          <Notice
            tone={c.error.retry ? 'warn' : 'danger'}
            message={issueMessage(c.error)}
            hint={c.error.hint}
          />
          {c.error.retry && c.error.code !== 'youtube_quota' && !phone && (
            <Button
              size="sm"
              icon={<ArrowsClockwise size={16} />}
              busy={busy === 'retry'}
              onClick={() => void run('retry', retry, { quiet: true })}
            >
              Try again
            </Button>
          )}
        </div>
      )}
      {platform === 'youtube' &&
        c?.state === 'ready' &&
        !c.error &&
        c.duty === 'cloud' &&
        !c.live &&
        !phone &&
        !link && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Button
              size="sm"
              icon={<ArrowsClockwise size={16} />}
              busy={busy === 'check'}
              onClick={() => void run('check', checkNow, { quiet: true })}
            >
              Check now
            </Button>
            <span className="text-[14px] text-text-3">
              While you’re offline, Ferrocast looks less often. Going live on Twitch or Kick wakes
              it.
            </span>
          </div>
        )}
      {c?.quota?.exhausted && c.error?.code !== 'youtube_quota' && (
        <Notice
          tone="warn"
          message={quotaUsedUpLine(c.quota.reset_at)}
          hint="The bot on your PC isn’t affected."
        />
      )}
      {platform === 'youtube' && !c && available && !phone && (
        <p className="text-[14.5px] text-text-3">
          Sign in with the Google account of the channel this PC is connected to. YouTube gives the
          cloud bot a daily budget, so it may pause until midnight Pacific time.
        </p>
      )}
      {c && dropLine(c) && (
        <p className="text-[14.5px] text-text-3" data-testid={`cloud-bot-${platform}-drop`}>
          {dropLine(c)}
        </p>
      )}
      {err && (
        <p role="alert" className="text-[15px] font-semibold text-danger">
          {err}
        </p>
      )}
      {link && !phone && (
        <div
          className="flex flex-wrap items-center gap-2"
          data-testid={`cloud-bot-${platform}-link`}
        >
          {/* Opened by the streamer's own click: a tab opened after a request is blocked. */}
          <a
            {...externalLink(link.auth_url)}
            className="fc-press inline-flex h-10 items-center gap-2 rounded-control bg-btn-primary px-4 text-[15px] font-semibold text-on-btn-primary hover:bg-btn-primary-hover"
          >
            Open {label} <ArrowSquareOut size={16} aria-hidden />
          </a>
          <Button icon={<ArrowsClockwise size={16} />} onClick={reload}>
            Check again
          </Button>
          <span className="text-[14px] text-text-3">The link works for 10 minutes.</span>
        </div>
      )}

      <Dialog
        open={leaving}
        onClose={() => {
          setLeaving(false)
          setLeaveErr(null)
        }}
        size="sm"
        title={`Disconnect ${label}?`}
        description={`Ferrocast signs out of ${label} and stops answering there while your PC is off. This PC’s bot keeps working.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setLeaving(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              busy={busy === 'leave'}
              onClick={() => void run('leave', leave, { quiet: true })}
            >
              Disconnect
            </Button>
          </>
        }
      >
        {leaveErr && (
          <p role="alert" className="text-[15px] font-semibold text-danger">
            {leaveErr}
          </p>
        )}
      </Dialog>
    </li>
  )
}
