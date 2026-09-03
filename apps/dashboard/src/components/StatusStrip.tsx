import { formatCount, plural, type ConnectorName, type ConnectorState } from '@ferrocast/api'
import { BrandIcon, PlatformMark, cx } from '@ferrocast/ui'
import { useLive } from '../lib/store'
import { href } from '../lib/router'

const ORDER = ['twitch', 'youtube', 'kick', 'obs'] as const
const NAMES: Record<ConnectorName, string> = {
  twitch: 'Twitch',
  youtube: 'YouTube',
  kick: 'Kick',
  obs: 'OBS',
  relay: 'Relay',
}

export function stateCopy(c: ConnectorState): {
  label: string
  tone: 'ok' | 'warn' | 'danger' | 'off'
} {
  switch (c.state) {
    case 'connected':
      return { label: 'Connected', tone: 'ok' }
    case 'reconnecting':
      // Never connected yet (no account, nothing heard): it's the first connect.
      return c.account === null && c.last_event_at === null
        ? { label: 'Connecting', tone: 'warn' }
        : { label: 'Reconnecting', tone: 'warn' }
    case 'disconnected':
      return { label: 'Disconnected', tone: 'danger' }
    case 'sign_in_needed':
      return { label: 'Sign in again', tone: 'danger' }
    case 'scopes_missing':
      return { label: 'Needs permission', tone: 'warn' }
    case 'off':
      return { label: 'Not connected', tone: 'off' }
  }
}

const DOT: Record<string, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  danger: 'bg-danger',
  off: 'bg-text-3/50',
}

/** One pill per connection. Clicking a pill that needs attention opens Settings → Accounts. */
export function StatusStrip({ compact = false }: { compact?: boolean }) {
  const connectors = useLive((s) => s.connectors)
  const socket = useLive((s) => s.socket)
  const viewers = useLive((s) => s.viewers)
  if (!connectors) return null
  return (
    <ul
      aria-label="Connections"
      className={cx('flex min-w-0 items-center', compact ? 'gap-1.5' : 'gap-1.5 overflow-x-auto')}
    >
      {ORDER.map((name) => {
        const c = connectors[name]
        const { label, tone } = stateCopy(c)
        const attention = tone === 'danger' || tone === 'warn' || tone === 'off'
        const late = name === 'kick' && c.state === 'connected'
        const v = name === 'obs' || c.state !== 'connected' ? undefined : viewers[name]
        const watching = v !== undefined ? `, ${plural(v, 'viewer', 'viewers')}` : ''
        const title = `${NAMES[name]}: ${label}${c.account ? ` as ${c.account.name}` : ''}${watching}${c.detail ? `. ${c.detail}` : ''}`
        return (
          <li key={name} className="shrink-0">
            <a
              href={href({ name: 'settings', section: name === 'obs' ? 'obs' : 'accounts' })}
              title={title}
              className={cx(
                'fc-press flex h-8 items-center gap-2 rounded-full border px-2.5 text-[12.5px] font-medium transition-colors',
                attention
                  ? 'border-line-strong bg-surface-2 text-text-2 hover:text-text'
                  : 'border-line bg-surface-1 text-text-2 hover:border-line-strong',
                compact && 'px-2',
              )}
            >
              <span className="sr-only">{title}</span>
              {name === 'obs' ? (
                <BrandIcon name="obs" size={13} className="text-text-2" />
              ) : (
                <PlatformMark platform={name} size={13} />
              )}
              {!compact && (
                <span aria-hidden="true" className="text-text">
                  {NAMES[name]}
                </span>
              )}
              <span aria-hidden="true" className={cx('size-1.5 rounded-full', DOT[tone])} />
              {!compact && (tone !== 'ok' || name === 'obs') && (
                <span className={tone === 'ok' ? 'text-text-2' : 'text-text-3'}>{label}</span>
              )}
              {!compact && late && (
                <span className="text-text-3" title={c.detail ?? undefined}>
                  may lag
                </span>
              )}
              {!compact && v !== undefined && (
                <span aria-hidden="true" className="text-text-3">
                  <span className="font-mono tabular-nums">{formatCount(v)}</span>{' '}
                  {v === 1 ? 'viewer' : 'viewers'}
                </span>
              )}
            </a>
          </li>
        )
      })}
      {socket !== 'open' && (
        <li className="shrink-0" role="status">
          <span className="flex h-8 items-center gap-2 rounded-full border border-warn/40 bg-warn-soft px-2.5 text-[12.5px] font-medium text-warn">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-warn" />
            {socket === 'retrying' ? 'Reconnecting to Ferrocast…' : 'Connecting…'}
          </span>
        </li>
      )}
    </ul>
  )
}
