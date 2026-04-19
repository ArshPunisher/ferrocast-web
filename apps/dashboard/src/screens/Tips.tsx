import { useEffect, useState } from 'react'
import { Check, EyeSlash, Lock, ShieldCheck } from '@phosphor-icons/react'
import { type TipSettings } from '@ferrocast/api'
import {
  Badge,
  BrandIcon,
  Button,
  Field,
  Input,
  Select,
  Skeleton,
  Switch,
  copyText,
  cx,
  toast,
} from '@ferrocast/ui'
import { LoadError, PageHeader, Panel } from '../components/Panel'
import { useAction, useClient, useResource } from '../lib/hooks'

const PROVIDERS = [
  {
    key: 'razorpay',
    name: 'Razorpay',
    icon: 'razorpay',
    body: 'UPI, cards and netbanking for viewers in India. Money goes to your own Razorpay account.',
  },
  {
    key: 'kofi',
    name: 'Ko-fi',
    icon: 'kofi',
    body: 'Your existing Ko-fi page. Ko-fi takes no cut of tips.',
  },
  {
    key: 'stripe',
    name: 'Stripe',
    icon: 'stripe',
    body: 'Cards worldwide, paid out by Stripe to your bank.',
  },
] as const

export function Tips() {
  const client = useClient()
  const res = useResource((c) => c.tips())
  const { run, busy } = useAction()
  const [t, setT] = useState<TipSettings | null>(null)
  useEffect(() => {
    if (res.data) setT(res.data)
  }, [res.data])
  if (res.error)
    return (
      <div>
        <PageHeader title="Tips" />
        <LoadError error={res.error} onRetry={res.reload} />
      </div>
    )
  if (!t)
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-64" />
      </div>
    )
  const dirty = JSON.stringify(t) !== JSON.stringify(res.data)
  const connected = (k: (typeof PROVIDERS)[number]['key']) => t.providers[k]?.connected ?? false
  const save = () =>
    void run('save', () => client.saveTips(t), { success: 'Tip page saved.' }).then(
      (r) => r && res.set(r),
    )
  return (
    <div>
      <PageHeader
        title="Tips"
        description="A tip page where money goes straight to you. Ferrocast never holds it and takes no cut."
        actions={
          <Button variant="primary" disabled={!dirty} busy={busy === 'save'} onClick={save}>
            Save
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <Panel title="Your tip page">
            <div className="flex flex-col gap-4">
              <Switch
                checked={t.enabled}
                onChange={(enabled) => setT({ ...t, enabled })}
                label="Tip page is on"
                description="Tips show an alert only once the payment has really arrived."
              />
              <Field
                label="Name tippers see"
                hint="Your stream name is perfect. It’s the only name on your tip page and in alerts."
                error={
                  t.display_name.trim()
                    ? null
                    : 'Tippers need a name to see. It can be your stream name.'
                }
              >
                {(p) => (
                  <Input
                    {...p}
                    value={t.display_name}
                    maxLength={40}
                    onChange={(e) => setT({ ...t, display_name: e.target.value })}
                  />
                )}
              </Field>
              {t.page_url && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-text-2">Page link</span>
                  <div className="flex gap-2">
                    <code className="flex h-10 min-w-0 flex-1 items-center truncate rounded-control border border-line bg-inset px-3 font-mono text-[13px] text-text-2">
                      {t.page_url}
                    </code>
                    <Button
                      onClick={() =>
                        void copyText(t.page_url ?? '').then((ok) =>
                          toast(
                            ok
                              ? {
                                  tone: 'ok',
                                  message: 'Link copied. Put it in your panels and !tip command.',
                                }
                              : { tone: 'error', message: 'Couldn’t copy the link.' },
                          ),
                        )
                      }
                    >
                      Copy
                    </Button>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <Field label="Currency">
                  {(p) => (
                    <Select
                      {...p}
                      value={t.currency}
                      onChange={(e) => setT({ ...t, currency: e.target.value })}
                    >
                      {['INR', 'USD', 'EUR', 'GBP', 'BRL'].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="Smallest tip" hint="Smaller amounts are refused.">
                  {(p) => (
                    <Input
                      {...p}
                      type="number"
                      min={1}
                      inputMode="numeric"
                      value={t.min_amount}
                      onChange={(e) =>
                        setT({ ...t, min_amount: Math.max(1, Number(e.target.value) || 1) })
                      }
                    />
                  )}
                </Field>
              </div>
            </div>
          </Panel>
          <Panel
            title="Payment accounts"
            description="Connect at least one. Payments go from the viewer to that account directly."
          >
            <ul className="flex flex-col gap-3">
              {PROVIDERS.map((p) => {
                const on = connected(p.key)
                return (
                  <li
                    key={p.key}
                    className={cx(
                      'flex flex-col gap-3 rounded-[12px] border p-3.5 sm:flex-row sm:items-center',
                      on ? 'border-ok/30 bg-ok-soft' : 'border-line',
                    )}
                  >
                    <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-surface-3 text-text">
                      <BrandIcon name={p.icon} size={20} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm font-semibold text-text">
                        {p.name}
                        {on && (
                          <Badge tone="ok">
                            <Check size={11} weight="bold" /> Connected
                          </Badge>
                        )}
                        {p.key === 'razorpay' && on && t.providers.razorpay?.upi && (
                          <Badge>UPI on</Badge>
                        )}
                      </p>
                      <p className="mt-0.5 text-[13px] text-text-3">{p.body}</p>
                    </div>
                    <Button
                      size="sm"
                      variant={on ? 'ghost' : 'secondary'}
                      onClick={() =>
                        toast({
                          tone: 'info',
                          message: on
                            ? `${p.name} stays connected.`
                            : `Connecting ${p.name} opens in your browser.`,
                          hint: on
                            ? 'To disconnect, remove Ferrocast from the apps in your payment account.'
                            : 'Sign in there and come back here. This build of the engine doesn’t do it yet.',
                        })
                      }
                    >
                      {on ? 'Manage' : 'Connect'}
                    </Button>
                  </li>
                )
              })}
            </ul>
          </Panel>
        </div>
        <Panel title="Why it’s safe" as="div">
          <ul className="flex flex-col gap-4">
            {[
              [
                EyeSlash,
                'Your legal name stays off the page',
                'Your tip page and alerts only show the name you choose above. The payment provider’s own checkout or receipt shows the name on that account, so use a business name there if you want it private.',
              ],
              [
                Lock,
                'We never touch the money',
                'Viewers pay your Razorpay, Ko-fi or Stripe account directly. There is no Ferrocast balance and no payout to wait for.',
              ],
              [
                ShieldCheck,
                'Alerts only for real payments',
                'An alert plays when the payment has settled, not when someone clicks pay. Refunds and chargebacks are taken back out of your goals.',
              ],
            ].map(([Icon, title, body]) => {
              const I = Icon as typeof Lock
              return (
                <li key={title as string} className="flex gap-3">
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-text">
                    <I size={18} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-text">{title as string}</p>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-text-3">
                      {body as string}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        </Panel>
      </div>
    </div>
  )
}
