import { useEffect, useState } from 'react'
import { ArrowSquareOut, Check, CopySimple } from '@phosphor-icons/react'
import {
  ApiError,
  PLATFORM_LABEL,
  describeError,
  type ChatPlatform,
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

const BLURB: Record<ChatPlatform, string> = {
  twitch: 'Chat, follows, subs, Bits, raids and channel points.',
  youtube: 'Chat, Super Chats and memberships while you’re live.',
  kick: 'Chat, follows, subs and KICKs, through the Ferrocast relay (usually within a second).',
}

/** Connect one platform: Twitch shows a device code; YouTube and Kick finish in the browser. */
export function useConnect(): {
  connect: (p: ChatPlatform) => Promise<void>
  busy: ChatPlatform | null
  dialog: React.ReactNode
} {
  const client = useClient()
  const [busy, setBusy] = useState<ChatPlatform | null>(null)
  const [flow, setFlow] = useState<{ platform: ChatPlatform; flow: ConnectFlow } | null>(null)
  const connectors = useLive((s) => s.connectors)
  const [copied, flash] = useFlash()
  const done = flow ? connectors?.[flow.platform].state === 'connected' : false
  useEffect(() => {
    if (flow && done) {
      toast({
        key: `account:${flow.platform}`,
        tone: 'ok',
        message: `${PLATFORM_LABEL[flow.platform]} is connected.`,
      })
      const t = setTimeout(() => setFlow(null), 900)
      return () => clearTimeout(t)
    }
  }, [done, flow])
  const connect = async (p: ChatPlatform) => {
    setBusy(p)
    try {
      const f = await client.connect(p)
      setFlow({ platform: p, flow: f })
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
            ? 'Your browser opened Twitch. Enter this code there and approve Ferrocast.'
            : 'Your browser opened the sign-in page. Approve Ferrocast there and come back.'
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
              href={flow.flow.verification_url}
              target="_blank"
              rel="noopener noreferrer"
              className="fc-press inline-flex h-8 items-center gap-1.5 rounded-control border border-line-strong bg-surface-3 px-3 text-[13px] font-semibold text-text"
            >
              Open twitch.tv/activate <ArrowSquareOut size={14} />
            </a>
          </div>
        </div>
      )}
      {flow.flow.flow === 'browser' && !done && (
        <p className="pb-1 text-center text-[13px] text-text-3">
          Nothing opened?{' '}
          <a
            href={flow.flow.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-accent-text hover:underline"
          >
            Open the sign-in page
          </a>
        </p>
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
  platform: ChatPlatform
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
        'flex flex-col gap-3 rounded-[12px] border p-3.5 sm:flex-row sm:items-center',
        on ? 'border-line' : needs ? 'border-warn/40 bg-warn-soft' : 'border-line',
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
        <p className="mt-0.5 text-[13px] text-text-3">
          {c.detail && !on ? c.detail : BLURB[platform]}
        </p>
      </div>
      {on && onDisconnect ? (
        <Button size="sm" variant="ghost" onClick={onDisconnect}>
          Disconnect
        </Button>
      ) : on ? (
        <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-ok">
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
