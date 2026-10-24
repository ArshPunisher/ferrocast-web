// The Ferrocast account, in the app and on the web dashboard (design board
// 2026-10-21-accounts: option C's page in one column, without its section menu). A header
// plate (metal for Pro), Plan and billing, receipts, devices with sign-out, a code, sign out.

import { useCallback, useEffect, useState } from 'react'
import {
  Browser,
  CreditCard,
  Desktop,
  DeviceMobile,
  EnvelopeSimple,
  GoogleLogo,
  Receipt,
  SignIn,
  SignOut,
  Sparkle,
  SpinnerGap,
  ArrowSquareOut,
} from '@phosphor-icons/react'
import {
  accountIsPro,
  accountName,
  describeError,
  proApi,
  relativeTime,
  type AccountSession,
  type AccountView,
} from '@ferrocast/api'
import { Button, Dialog, LogoMark, Skeleton, toast } from '@ferrocast/ui'
import { useAction, useClient } from '../lib/hooks'
import { accountApi, reloadAccount, useAccount, webApi } from '../lib/account-status'
import { isTestGrant, publishPro, useProStatus } from '../lib/pro-status'
import { href } from '../lib/router'
import { openExternal } from '../lib/external'
import { day } from '../components/pro'
import { CodeInline } from '../components/account/CodeInline'
import { YoutubeCloud } from '../components/account/youtube-cloud'
import {
  AccountAvatar,
  ProChrome,
  cancelSignIn,
  signOut,
  startSignIn,
} from '../components/account/parts'

export function Account() {
  const account = useAccount()
  if (!account) return <Skeleton className="mx-auto h-40 max-w-[760px]" />
  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-[26px]" data-testid="account-page">
      {account.state === 'signed_in' ? <SignedIn view={account} /> : <NotSignedIn view={account} />}
    </div>
  )
}

function NotSignedIn({ view }: { view: AccountView }) {
  const [busy, setBusy] = useState(false)
  if (view.state === 'pending')
    return (
      <section
        role="status"
        className="flex flex-col items-start gap-3 rounded-[16px] border border-line bg-surface-1 p-5"
      >
        <SpinnerGap size={24} className="text-accent-text motion-safe:animate-spin" aria-hidden />
        <h1 className="font-display text-[24px] leading-tight font-bold tracking-[-0.02em] text-text">
          Finish signing in in your browser
        </h1>
        <p className="text-[14.5px] text-text-2">This page updates by itself once you’re done.</p>
        <Button variant="ghost" onClick={() => void cancelSignIn()}>
          Cancel
        </Button>
      </section>
    )
  return (
    <section className="flex flex-col items-start gap-3 rounded-[16px] border border-line bg-surface-1 p-5">
      <LogoMark size={40} />
      <h1 className="font-display text-[24px] leading-tight font-bold tracking-[-0.02em] text-text">
        {view.state === 'disabled' ? 'This account is turned off' : 'Your Ferrocast account'}
      </h1>
      <p className="max-w-[58ch] text-[14.5px] text-text-2">
        {view.state === 'disabled'
          ? (view.error?.hint ?? 'Write to support@clearcraftlabs.com and we’ll sort it out.')
          : 'Optional. Keeps Pro on every PC and opens your dashboard on the web.'}
      </p>
      {view.error && view.state !== 'disabled' && (
        <p role="alert" className="text-[13.5px] text-danger">
          {view.error.message} {view.error.hint}
        </p>
      )}
      {view.state !== 'disabled' && (
        <Button
          variant="primary"
          busy={busy}
          icon={<SignIn size={17} aria-hidden />}
          onClick={() => {
            setBusy(true)
            void startSignIn().finally(() => setBusy(false))
          }}
        >
          Sign in
        </Button>
      )}
    </section>
  )
}

function SignedIn({ view }: { view: AccountView }) {
  const proView = useProStatus()
  const web = !!webApi()
  // The account's Pro; in the app this PC's own Pro counts too (bought before signing in).
  const pro = accountIsPro(view) || (!web && !!proView?.active)
  const plan = view.pro?.active ? view.pro : null
  const planName =
    plan?.plan === 'yearly'
      ? 'Yearly'
      : plan?.plan === 'monthly'
        ? 'Monthly'
        : proView?.plan === 'yearly'
          ? 'Yearly'
          : proView?.plan === 'monthly'
            ? 'Monthly'
            : 'Pro'
  const ends =
    plan?.current_end ?? plan?.access_until ?? proView?.current_end ?? proView?.access_until ?? null
  const renews = plan
    ? plan.renews && !plan.cancel_at_period_end
    : !!proView && !proView.cancel_at_period_end
  const when = ends ? `${renews ? 'renews' : 'ends'} ${day(ends)}` : ''
  const name = accountName(view.account)
  return (
    <>
      <header
        className={`relative grid grid-cols-[auto_1fr] items-center gap-4 overflow-hidden rounded-[16px] border p-5 sm:grid-cols-[auto_1fr_auto] ${
          pro ? 'fc-plate shadow-[0_12px_32px_-12px_rgb(2_4_10/0.6)]' : 'border-line bg-surface-1'
        }`}
        data-pro={pro || undefined}
      >
        {pro && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-6 -bottom-10 opacity-[0.08]"
          >
            <LogoMark size={170} className="text-[var(--fc-plate-text)]!" />
          </span>
        )}
        <AccountAvatar
          view={view}
          pro={pro}
          size={pro ? 68 : 64}
          gap={pro ? 'var(--fc-plate-gap)' : undefined}
        />
        <div className="relative min-w-0">
          <h1 className="truncate font-display text-[24px] leading-tight font-bold tracking-[-0.02em]">
            {name}
          </h1>
          <p
            className={`mt-1 truncate text-[13.5px] ${pro ? 'text-[var(--fc-plate-text-2)]' : 'text-text-2'}`}
          >
            {view.account?.email}
          </p>
        </div>
        <div className="relative col-span-2 flex flex-col items-start gap-1.5 sm:col-span-1 sm:items-end sm:text-right">
          {pro ? (
            <>
              <ProChrome />
              <small className="text-[12.5px] text-[var(--fc-plate-text-2)]">
                {planName}
                {when && `, ${when}`}
              </small>
            </>
          ) : (
            <>
              <small className="text-[12.5px] text-text-2">Free plan</small>
              <a
                href={href({ name: 'plans' })}
                className="fc-press inline-flex h-8 items-center gap-1.5 rounded-control border border-line-strong bg-surface-3 px-3 text-[13.5px] font-semibold text-text focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
              >
                <Sparkle size={15} aria-hidden />
                See Pro plans
              </a>
            </>
          )}
        </div>
      </header>

      {pro && (
        <Billing planName={planName} ends={ends} renews={renews} pcs={view.pcs ?? null} web={web} />
      )}

      <Devices />

      <YoutubeCloud />

      {!web && (
        <section aria-label="Redeem a code" className="max-w-[520px]">
          <CodeInline />
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        <span className="inline-flex items-center gap-1.5 text-[12.5px] text-text-3">
          {view.account?.providers?.includes('google') ? (
            <>
              <GoogleLogo size={14} aria-hidden /> Signed in with Google
            </>
          ) : (
            <>
              <EnvelopeSimple size={14} aria-hidden /> Signed in with an email link
            </>
          )}
        </span>
        <Button
          variant="danger-ghost"
          icon={<SignOut size={17} aria-hidden />}
          onClick={() => void signOut()}
        >
          Sign out of this device
        </Button>
      </div>
    </>
  )
}

function Billing({
  planName,
  ends,
  renews,
  pcs,
  web,
}: {
  planName: string
  ends: number | null
  renews: boolean
  pcs: number | null
  web: boolean
}) {
  const client = useClient()
  const proView = useProStatus()
  const { run, busy } = useAction()
  const [confirm, setConfirm] = useState(false)
  // Billing is managed from the app (the relay's page for this install's subscription).
  const manageable = !web && !!proView?.subscription_id && !isTestGrant(proView)
  const manage = () =>
    void run('manage', () => proApi(client).manage()).then((r) => {
      if (r) openExternal(r.url)
    })
  return (
    <section aria-labelledby="acct-billing" className="flex flex-col gap-3">
      <h2 id="acct-billing" className="text-[15px] font-bold text-text">
        Plan and billing
      </h2>
      <div className="flex flex-col gap-3.5 rounded-[14px] border border-line bg-surface-1 p-4">
        <dl className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-3.5">
          <div>
            <dt className="text-[12.5px] text-text-3">Plan</dt>
            <dd className="text-[14.5px] font-semibold text-text">
              {planName === 'Pro' ? 'Pro' : `Pro, ${planName.toLowerCase()}`}
            </dd>
          </div>
          <div>
            <dt className="text-[12.5px] text-text-3">{renews ? 'Renews' : 'Ends'}</dt>
            <dd className="text-[14.5px] font-semibold text-text">
              {ends ? day(ends) : 'Not set'}
            </dd>
          </div>
          {pcs !== null && (
            <div>
              <dt className="text-[12.5px] text-text-3">PCs signed in</dt>
              <dd className="text-[14.5px] font-semibold text-text">{pcs}</dd>
            </div>
          )}
        </dl>
        {manageable ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              busy={busy === 'manage'}
              icon={<CreditCard size={16} aria-hidden />}
              onClick={manage}
            >
              Manage billing
              <ArrowSquareOut size={15} aria-hidden />
            </Button>
            {renews && (
              <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>
                Cancel renewal
              </Button>
            )}
          </div>
        ) : (
          <p className="text-[13px] text-text-3">
            {web
              ? 'Manage billing from the Ferrocast app on your PC.'
              : 'Billing is managed on the PC that bought Pro.'}
          </p>
        )}
      </div>
      {manageable && (
        <div className="flex items-center gap-3 rounded-[14px] border border-line bg-surface-1 px-3.5 py-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface-2 text-text-2">
            <Receipt size={18} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <b className="block text-[14px] font-semibold text-text">Receipts</b>
            <small className="block text-[12.5px] text-text-3">
              Razorpay emails each one. All of them are on the billing page.
            </small>
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={manage}
            aria-label="Open receipts on the billing page"
          >
            <ArrowSquareOut size={16} aria-hidden />
          </Button>
        </div>
      )}
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Stop renewing Pro?"
        description={
          ends ? `Pro stays on until ${day(ends)}, then this account goes back to free.` : undefined
        }
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Keep renewing
            </Button>
            <Button
              variant="danger"
              busy={busy === 'cancel'}
              onClick={() =>
                void run('cancel', () => proApi(client).cancel(), {
                  success: 'Renewal stopped. Pro stays on until the end of this period.',
                }).then((v) => {
                  if (v) publishPro(v)
                  setConfirm(false)
                  void reloadAccount()
                })
              }
            >
              Stop renewing
            </Button>
          </>
        }
      />
    </section>
  )
}

function deviceIcon(s: AccountSession) {
  if (s.kind === 'app') return Desktop
  return /iphone|android|ipad|mobile/i.test(s.label) ? DeviceMobile : Browser
}

function Devices() {
  const [list, setList] = useState<AccountSession[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const load = useCallback(() => {
    const a = accountApi()
    if (!a) return
    a.sessions()
      .then((s) => {
        setList(s)
        setErr(null)
      })
      .catch((e: unknown) => {
        const d = describeError(e)
        setErr(d.hint ? `${d.message} ${d.hint}` : d.message)
      })
  }, [])
  useEffect(load, [load])

  const revoke = async (ids: string[], all = false) => {
    const a = accountApi()
    if (!a) return
    setBusy(all ? 'all' : (ids[0] ?? null))
    let failed = 0
    for (const id of ids) {
      try {
        await a.revoke(id)
      } catch {
        failed++
      }
    }
    setBusy(null)
    setConfirm(false)
    if (failed)
      toast({
        tone: 'error',
        message: 'Some devices didn’t sign out.',
        hint: 'Try again in a moment.',
      })
    else
      toast({
        tone: 'ok',
        message: all ? 'Signed out everywhere else.' : 'That device is signed out.',
      })
    load()
  }
  const others = (list ?? []).filter((s) => !s.current)

  return (
    <section aria-labelledby="acct-devices" className="flex flex-col gap-3">
      <h2 id="acct-devices" className="text-[15px] font-bold text-text">
        Devices
      </h2>
      {err ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-[14px] border border-danger/30 bg-danger-soft p-4 text-[13.5px] text-text"
        >
          {err}
          <Button size="sm" onClick={load}>
            Try again
          </Button>
        </div>
      ) : !list ? (
        <Skeleton className="h-40" />
      ) : (
        <ul className="divide-y divide-line rounded-[14px] border border-line bg-surface-1">
          {list.map((s) => {
            const Icon = deviceIcon(s)
            return (
              <li key={s.id} className="flex items-center gap-3 px-3.5 py-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface-2 text-text-2">
                  <Icon size={18} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[14px] font-semibold text-text">
                    {s.label || (s.kind === 'app' ? 'Ferrocast app' : 'Web browser')}
                  </b>
                  <small className="block text-[12.5px] text-text-3">
                    {s.kind === 'app' ? 'Ferrocast app' : 'Web dashboard'}
                    {!s.current && `, last used ${usedAgo(s.last_used_at)}`}
                  </small>
                </span>
                {s.current ? (
                  <span className="shrink-0 rounded-full bg-ok-soft px-[7px] py-1 font-mono text-[11px] leading-none font-semibold whitespace-nowrap text-ok">
                    This device
                  </span>
                ) : (
                  <Button
                    size="sm"
                    busy={busy === s.id}
                    onClick={() => void revoke([s.id])}
                    aria-label={`Sign out ${s.label || 'this device'}`}
                  >
                    Sign out
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {others.length > 0 && (
        <Button
          size="sm"
          variant="ghost"
          className="self-start"
          icon={<SignOut size={16} aria-hidden />}
          onClick={() => setConfirm(true)}
        >
          Sign out everywhere else
        </Button>
      )}
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Sign out everywhere else?"
        description={`${others.length} other ${others.length === 1 ? 'device signs' : 'devices sign'} out now. A PC signed out this way loses this account’s Pro until it signs in again.`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Keep them
            </Button>
            <Button
              variant="danger"
              busy={busy === 'all'}
              onClick={() =>
                void revoke(
                  others.map((s) => s.id),
                  true,
                )
              }
            >
              Sign them out
            </Button>
          </>
        }
      />
    </section>
  )
}

/** "3 hours ago", "yesterday", "just now". */
export function usedAgo(at: number, now = Date.now()): string {
  const r = relativeTime(at, now)
  if (r === 'now' || r.endsWith('s')) return 'just now'
  const n = parseInt(r, 10)
  const unit = r.slice(-1)
  if (unit === 'm') return `${n} ${n === 1 ? 'minute' : 'minutes'} ago`
  if (unit === 'h') return `${n} ${n === 1 ? 'hour' : 'hours'} ago`
  if (n === 1) return 'yesterday'
  return n < 30 ? `${n} days ago` : day(at)
}
