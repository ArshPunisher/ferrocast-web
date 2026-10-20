// Settings › Pro: what this install's Ferrocast Pro is, and the few things to do about it.
// The engine asks the relay; Razorpay takes payment on its own page, opened in the browser.
// Pro is marked calmly (never an upsell) and is not on sale until after version 1.

import { useState } from 'react'
import { ArrowSquareOut } from '@phosphor-icons/react'
import { proApi, rupeesFromPaise, type ProPlan, type ProView } from '@ferrocast/api'
import { Badge, Button, Field, Input, Segmented, Skeleton } from '@ferrocast/ui'
import { LoadError } from './Panel'
import { useAction, useClient, useResource } from '../lib/hooks'
import { externalLink } from '../lib/external'

function day(ms: number | null): string {
  if (!ms) return ''
  return new Date(ms).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** The status in one plain sentence, plus a badge. */
export function proSummary(p: ProView): {
  badge: string
  tone: 'ok' | 'warn' | 'neutral'
  text: string
} {
  const plan = p.plan === 'yearly' ? 'yearly' : 'monthly'
  if (p.refunded) return { badge: 'Ended', tone: 'neutral', text: 'Refunded. Pro has ended.' }
  if (p.active && p.cancel_at_period_end)
    return {
      badge: 'Active',
      tone: 'ok',
      text: `Pro (${plan}) is on until ${day(p.access_until)}. It won’t renew.`,
    }
  if (p.active && p.status === 'pending')
    return {
      badge: 'Active',
      tone: 'warn',
      text: `Razorpay is retrying your renewal. Pro stays on until ${day(p.access_until)}.`,
    }
  if (p.active)
    return {
      badge: 'Active',
      tone: 'ok',
      text: `Pro (${plan}) is active. Renews on ${day(p.current_end)}.`,
    }
  switch (p.status) {
    case 'created':
      return { badge: 'Not paid yet', tone: 'neutral', text: 'Checkout isn’t finished yet.' }
    case 'authenticated':
      return {
        badge: 'Starting',
        tone: 'neutral',
        text: 'Payment set up. Pro starts with the first charge.',
      }
    case 'halted':
      return {
        badge: 'Paused',
        tone: 'warn',
        text: 'Every renewal attempt failed, so Pro is paused. Subscribe again to get it back.',
      }
    case 'paused':
      return { badge: 'Paused', tone: 'warn', text: 'Pro is paused.' }
    case 'cancelled':
    case 'completed':
    case 'expired':
      return { badge: 'Ended', tone: 'neutral', text: 'Your Pro subscription has ended.' }
    default:
      return p.sales_open
        ? {
            badge: 'Free',
            tone: 'neutral',
            text: 'You’re on the free app. Every feature you use today stays free.',
          }
        : { badge: 'Free', tone: 'neutral', text: p.launch_note }
  }
}

function ExternalLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      {...externalLink(href)}
      className="fc-press inline-flex h-10 items-center gap-1.5 self-start rounded-control border border-line-strong bg-surface-3 px-3.5 text-[13.5px] font-semibold text-text"
    >
      {children} <ArrowSquareOut size={15} aria-hidden />
    </a>
  )
}

export function ProSettings() {
  const client = useClient()
  const pro = proApi(client)
  const res = useResource(() => pro.status())
  const { run, busy } = useAction()
  const [manageUrl, setManageUrl] = useState<string | null>(null)
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null)
  const [plan, setPlan] = useState<ProPlan>('yearly')
  const [email, setEmail] = useState('')
  const [restoreId, setRestoreId] = useState('')
  const [restoreEmail, setRestoreEmail] = useState('')

  if (res.error) return <LoadError error={res.error} onRetry={res.reload} />
  const p = res.data
  if (!p) return <Skeleton className="h-28" />
  const s = proSummary(p)
  const prices = p.prices
  const canBuy =
    p.sales_open && !p.active && !['authenticated', 'active', 'pending'].includes(p.status)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 rounded-[12px] border border-line bg-surface-2 p-3.5 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={s.tone}>{s.badge}</Badge>
            {p.subscription_id && (
              <span className="truncate font-mono text-[13.5px] text-text-3">
                {p.subscription_id}
              </span>
            )}
          </div>
          <p className="text-sm text-text-2" data-testid="pro-summary">
            {s.text}
          </p>
          {p.stale && (
            <p role="status" className="text-[13.5px] font-medium text-warn">
              {p.checked_at
                ? `Couldn’t reach the relay. Last check: ${day(p.checked_at)}. Pro works offline for ${p.offline_grace_days} days.`
                : 'Couldn’t reach the relay to check Pro. Everything else works.'}
            </p>
          )}
          {!p.stale && p.warning && <p className="text-[13.5px] text-text-2">{p.warning}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            size="sm"
            busy={busy === 'refresh'}
            onClick={() => void run('refresh', () => pro.refresh()).then((v) => v && res.set(v))}
          >
            Check again
          </Button>
          {p.subscription_id && (
            <Button
              size="sm"
              busy={busy === 'manage'}
              onClick={() =>
                void run('manage', () => pro.manage()).then((r) => r && setManageUrl(r.url))
              }
            >
              Manage
            </Button>
          )}
        </div>
      </div>

      {manageUrl && (
        <div className="flex flex-col gap-2">
          <ExternalLink href={manageUrl}>Open the manage page</ExternalLink>
          <p className="text-[13.5px] text-text-2">
            See your plan or stop renewing. The link works for 30 minutes.
          </p>
        </div>
      )}

      {canBuy && prices && (
        <form
          className="flex max-w-md flex-col gap-4 border-t border-line pt-4"
          onSubmit={(e) => {
            e.preventDefault()
            void run('checkout', () => pro.checkout(plan, email.trim())).then(
              (r) => r && setCheckoutUrl(r.checkout_url),
            )
          }}
        >
          <Segmented
            label="Pro plan"
            value={plan}
            onChange={setPlan}
            options={[
              { value: 'monthly', label: `${rupeesFromPaise(prices.monthly)} a month` },
              { value: 'yearly', label: `${rupeesFromPaise(prices.yearly)} a year` },
            ]}
          />
          <Field label="Email for receipts" hint="For receipts, and to move Pro to another PC.">
            {(f) => (
              <Input
                {...f}
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
          </Field>
          <Button type="submit" variant="primary" className="self-start" busy={busy === 'checkout'}>
            Continue to Razorpay
          </Button>
          {checkoutUrl && (
            <div className="flex flex-col gap-2">
              <ExternalLink href={checkoutUrl}>Open Razorpay checkout</ExternalLink>
              <p className="text-[13.5px] text-text-2">After paying, press Check again.</p>
            </div>
          )}
        </form>
      )}

      {!p.subscription_id && (
        <details className="group border-t border-line pt-4">
          <summary className="cursor-pointer text-sm font-semibold text-text">
            Already have Pro? Move it to this PC
          </summary>
          <form
            className="mt-3 flex max-w-md flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              void run('restore', () => pro.restore(restoreId.trim(), restoreEmail.trim()), {
                success: (v) =>
                  v.active ? 'Pro is on for this PC.' : 'Found it, but it isn’t active right now.',
              }).then((v) => v && res.set(v))
            }}
          >
            <Field label="Subscription id" hint="Starts with sub_. It’s in Razorpay’s emails.">
              {(f) => (
                <Input
                  {...f}
                  required
                  spellCheck={false}
                  className="font-mono"
                  value={restoreId}
                  onChange={(e) => setRestoreId(e.target.value)}
                />
              )}
            </Field>
            <Field label="Email you used at checkout">
              {(f) => (
                <Input
                  {...f}
                  type="email"
                  autoComplete="email"
                  required
                  value={restoreEmail}
                  onChange={(e) => setRestoreEmail(e.target.value)}
                />
              )}
            </Field>
            <Button type="submit" className="self-start" busy={busy === 'restore'}>
              Move Pro here
            </Button>
          </form>
        </details>
      )}
    </div>
  )
}
