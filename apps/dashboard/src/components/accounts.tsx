import { useEffect, useRef, useState } from 'react'
import { ArrowSquareOut, Check, CopySimple } from '@phosphor-icons/react'
import {
  ApiError,
  PLATFORM_LABEL,
  describeError,
  type AccountPlatform,
  type ConnectFlow,
} from '@ferrocast/api'
import {
  Badge,
  Button,
  Dialog,
  SparkMark,
  PlatformMark,
  copyText,
  cx,
  toast,
  useFlash,
} from '@ferrocast/ui'
import { useClient } from '../lib/hooks'
import { useLive } from '../lib/store'
import { stateCopy } from './StatusStrip'
import { browserDidntOpen, externalLink, openExternal } from '../lib/external'

const BLURB: Record<AccountPlatform, string> = {
  facebook: 'Comments on your Page’s live videos show up in chat, and you can reply.',
  twitch: 'Chat, follows, subs, Bits, raids and channel points.',
  youtube: 'Chat, Super Chats and memberships while you’re live.',
  kick: 'Chat, follows, subs and KICKs, through the Ferrocast relay.',
}

/** Connect one platform: Twitch shows a device code; YouTube, Kick and Facebook finish in the browser. */
export function useConnect(onConnected?: (platform: AccountPlatform) => void): {
  connect: (p: AccountPlatform) => Promise<void>
  busy: AccountPlatform | null
  dialog: React.ReactNode
} {
  const client = useClient()
  const [busy, setBusy] = useState<AccountPlatform | null>(null)
  const [flow, setFlow] = useState<{
    platform: AccountPlatform
    flow: ConnectFlow
    at: number
    sawPending: boolean
    prevEventAt: number
  } | null>(null)
  const connectors = useLive((s) => s.connectors)
  // The desktop app says so when the browser didn't open; only a notice since this dialog opened counts.
  const browserFailed = useLive((s) => (flow ? browserDidntOpen(s.notices, flow.at) : false))
  const [copied, flash] = useFlash()
  const [linkCopied, flashLink] = useFlash()
  const curConnector = flow ? connectors?.[flow.platform] : undefined
  const onConnectedRef = useRef(onConnected)
  onConnectedRef.current = onConnected
  // A reconnect (for example adding Twitch poll permissions) starts while state is still
  // `connected`: wait until we see it leave `connected` (or receive a newer connected update)
  // so the dialog doesn't close before the user approves.
  useEffect(() => {
    if (flow && !flow.sawPending && curConnector && curConnector.state !== 'connected') {
      setFlow((prev) => (prev ? { ...prev, sawPending: true } : prev))
    }
  }, [flow, curConnector])
  const done = flow
    ? curConnector?.state === 'connected' &&
      (flow.sawPending || (curConnector.last_event_at ?? 0) > flow.prevEventAt)
    : false
  useEffect(() => {
    if (flow && done) {
      onConnectedRef.current?.(flow.platform)
      toast({
        key: `account:${flow.platform}`,
        tone: 'ok',
        message: `${PLATFORM_LABEL[flow.platform]} is connected.`,
      })
      const t = setTimeout(() => setFlow(null), 900)
      return () => clearTimeout(t)
    }
  }, [done, flow])
  const connect = async (p: AccountPlatform) => {
    const prev = connectors?.[p]
    setBusy(p)
    try {
      const f = await client.connect(p)
      setFlow({
        platform: p,
        flow: f,
        at: Date.now(),
        sawPending: prev?.state !== 'connected',
        prevEventAt: prev?.last_event_at ?? 0,
      })
      // Nothing else opens the sign-in page: the engine only hands back its URL.
      if (f.flow === 'browser') openExternal(f.url)
    } catch (e) {
      const d = describeError(e)
      toast({
        key: `account:${p}`,
        tone: e instanceof ApiError && e.status === 409 ? 'info' : 'error',
        message: d.message,
        hint: d.hint,
      })
    } finally {
      setBusy(null)
    }
  }
  const dialog = flow && (
    <Dialog
      open
      onClose={() => setFlow(null)}
      size="sm"
      title={
        done
          ? `${PLATFORM_LABEL[flow.platform]} connected`
          : `Connect ${PLATFORM_LABEL[flow.platform]}`
      }
      description={
        done
          ? 'You can close this.'
          : flow.flow.flow === 'device_code'
            ? 'Enter this code on Twitch and approve Ferrocast.'
            : 'Approve Ferrocast in your browser, then come back.'
      }
      footer={
        <Button variant={done ? 'primary' : 'ghost'} onClick={() => setFlow(null)}>
          {done ? 'Done' : 'Cancel'}
        </Button>
      }
    >
      {flow.flow.flow === 'device_code' && !done && (
        <div className="flex flex-col items-center gap-3 py-2">
          <p
            className="font-mono text-[34px] font-semibold tracking-[0.12em] text-text"
            aria-label={`Code ${flow.flow.user_code.split('').join(' ')}`}
          >
            {flow.flow.user_code}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              size="sm"
              icon={copied ? <Check size={15} /> : <CopySimple size={15} />}
              onClick={() =>
                flow.flow.flow === 'device_code' &&
                void copyText(flow.flow.user_code).then((ok) => ok && flash())
              }
            >
              {copied ? 'Copied' : 'Copy code'}
            </Button>
            <a
              {...externalLink(flow.flow.verification_url)}
              className="fc-press inline-flex h-8 items-center gap-1.5 rounded-control border border-line-strong bg-surface-3 px-3 text-[14px] font-semibold text-text"
            >
              Open twitch.tv/activate <ArrowSquareOut size={14} />
            </a>
          </div>
        </div>
      )}
      {flow.flow.flow === 'browser' && !done && (
        <div className="flex flex-col items-center gap-2 pb-1 text-center">
          {browserFailed && (
            <p role="alert" className="text-[14.5px] font-medium text-warn">
              Your browser didn’t open. Copy the link and paste it into your browser.
            </p>
          )}
          <p className="text-[14.5px] text-text-2">
            {browserFailed ? 'Or try again: ' : 'Nothing opened? '}
            <a
              {...externalLink(flow.flow.url)}
              className="font-semibold text-accent-text hover:underline"
            >
              Open the sign-in page
            </a>
          </p>
          <Button
            size="sm"
            variant={browserFailed ? 'secondary' : 'ghost'}
            icon={linkCopied ? <Check size={15} /> : <CopySimple size={15} />}
            onClick={() =>
              flow.flow.flow === 'browser' &&
              void copyText(flow.flow.url).then((ok) => ok && flashLink())
            }
          >
            {linkCopied ? 'Link copied' : 'Copy link'}
          </Button>
        </div>
      )}
      <div role="status" className="flex items-center justify-center gap-3 py-3">
        {done ? (
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-ok">
            <Check size={18} weight="bold" /> Connected
          </span>
        ) : (
          <>
            <SparkMark size={40} />
            <span className="text-sm text-text-3">Waiting for you to approve…</span>
          </>
        )}
      </div>
    </Dialog>
  )
  return { connect, busy, dialog }
}

export function AccountRow({
  platform,
  onConnect,
  busy,
  onDisconnect,
}: {
  platform: AccountPlatform
  onConnect: () => void
  busy: boolean
  onDisconnect?: () => void
}) {
  const c = useLive((s) => s.connectors?.[platform])
  if (!c) return null
  const { label, tone } = stateCopy(c)
  const on = c.state === 'connected'
  const needs = c.state === 'sign_in_needed' || c.state === 'scopes_missing'
  return (
    <li
      className={cx(
        'flex flex-col gap-3 rounded-[12px] border bg-surface-1 p-3.5 sm:flex-row sm:items-center',
        needs ? 'border-warn/45' : 'border-line',
      )}
    >
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-surface-3">
        <PlatformMark platform={platform} size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-text">
          {PLATFORM_LABEL[platform]}
          {on ? (
            <Badge tone="ok">{c.account?.name ?? 'Connected'}</Badge>
          ) : (
            <Badge tone={tone === 'off' ? 'neutral' : tone === 'ok' ? 'ok' : tone}>{label}</Badge>
          )}
        </p>
        <p className="mt-0.5 text-[14.5px] text-text-2">
          {c.detail && !on ? c.detail : BLURB[platform]}
        </p>
      </div>
      {on && onDisconnect ? (
        <Button size="sm" variant="ghost" onClick={onDisconnect}>
          Disconnect
        </Button>
      ) : on ? (
        <span className="inline-flex items-center gap-1 text-[14.5px] font-semibold text-ok">
          <Check size={15} weight="bold" /> Done
        </span>
      ) : (
        <Button size="sm" variant="primary" busy={busy} onClick={onConnect}>
          {needs ? 'Reconnect' : 'Connect'}
        </Button>
      )}
    </li>
  )
}
