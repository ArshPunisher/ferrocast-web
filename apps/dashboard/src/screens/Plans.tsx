// Ferrocast Pro's plans inside the app (design board 2026-10-21-accounts, option B): what
// Pro adds on the left, a sticky "Choose a plan" panel on the right. Paying happens in the
// browser; signed out, Continue signs in first so Pro belongs to the account.

import { useEffect, useRef, useState } from 'react'
import { ArrowSquareOut, Browser, CheckCircle } from '@phosphor-icons/react'
import {
  accountIsPro,
  describeError,
  proApi,
  rupeesFromPaise,
  type ProPlan,
  type ProView,
} from '@ferrocast/api'
import { Button, LogoMark, Skeleton, toast } from '@ferrocast/ui'
import { useClient } from '../lib/hooks'
import { publishPro, useProStatus } from '../lib/pro-status'
import { useAccount, webApi } from '../lib/account-status'
import { openExternal } from '../lib/external'
import { href } from '../lib/router'
import { FEATURES, canBuyPro, offer, planCopy, type Discount } from '../components/pro'
import { CodeInline } from '../components/account/CodeInline'
import { startSignIn } from '../components/account/parts'

type Prices = NonNullable<ProView['prices']>

const POLL_MS = 6_000

export function Plans() {
  const account = useAccount()
  const proView = useProStatus()
  const web = webApi()
  const [webPrices, setWebPrices] = useState<Prices | null>(null)
  const [webErr, setWebErr] = useState(false)
  useEffect(() => {
    if (!web) return
    web
      .prices()
      .then(setWebPrices)
      .catch(() => setWebErr(true))
  }, [web])

  const pro = (!!proView?.active && !web) || accountIsPro(account)
  return (
    <div className="mx-auto grid max-w-[1100px] items-start gap-7 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-[22px]">
        <div className="fc-seam-card grid grid-cols-[auto_1fr] items-center gap-4 rounded-[16px] border border-line p-[22px]">
          <LogoMark size={56} />
          <div>
            <h1 className="font-display text-[30px] leading-[1.05] font-extrabold tracking-[-0.03em] text-text">
              Ferrocast Pro
            </h1>
            <p className="mt-1.5 text-[14.5px] text-pretty text-text-2">
              Pro pays for the parts that run on our servers. Everything free stays free, for good.
            </p>
          </div>
        </div>
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {FEATURES.map(({ icon: I, title, text }) => (
            <li
              key={title}
              className="grid grid-cols-[auto_1fr] content-start gap-x-3 gap-y-0.5 rounded-[12px] border border-line bg-surface-1 p-3.5"
            >
              <I size={20} className="row-span-2 mt-px text-accent-text" aria-hidden />
              <b className="text-[14px] font-semibold text-text">{title}</b>
              <span className="text-[13px] text-text-2">{text}</span>
            </li>
          ))}
        </ul>
      </div>
      <aside
        aria-labelledby="plans-choose"
        className="flex flex-col gap-3 rounded-[14px] border border-line bg-surface-1 p-[18px] lg:sticky lg:top-[calc(var(--fc-top,56px)+16px)]"
      >
        {pro ? (
          <HavePro />
        ) : web ? (
          webPrices ? (
            <Choose prices={webPrices} was={{}} note={null} code={null} web />
          ) : webErr ? (
            <p role="alert" className="text-[14px] text-text-2">
              Prices didn’t load. Reload the page in a moment.
            </p>
          ) : (
            <Skeleton className="h-72" />
          )
        ) : proView ? (
          <AppChoose p={proView} />
        ) : (
          <Skeleton className="h-72" />
        )}
      </aside>
    </div>
  )
}

function HavePro() {
  return (
    <div className="flex flex-col gap-3">
      <p id="plans-choose" className="flex items-center gap-2 text-[15px] font-semibold text-text">
        <CheckCircle size={20} weight="fill" className="text-ok" aria-hidden />
        You have Pro
      </p>
      <p className="text-[13.5px] text-text-2">
        Your plan, renewal and receipts are on your Account page.
      </p>
      <a
        href={href({ name: 'account' })}
        className="fc-press inline-flex h-10 items-center justify-center rounded-control border border-line-strong bg-surface-3 px-4 text-sm font-semibold text-text focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
      >
        Open Account
      </a>
    </div>
  )
}

function AppChoose({ p }: { p: ProView }) {
  const [discount, setDiscount] = useState<Discount | null>(null)
  const buy = canBuyPro(p)
  if (!buy)
    return (
      <div className="flex flex-col gap-3">
        <p id="plans-choose" className="text-[15px] font-semibold text-text">
          Choose a plan
        </p>
        <p className="text-[13.5px] text-text-2">
          {p.launch_note || 'Pro isn’t on sale right now. Everything free keeps working.'}
        </p>
        <hr className="my-1 border-line" />
        <CodeInline canBuy={false} />
      </div>
    )
  return (
    <Choose {...offer(p, discount)}>
      <hr className="my-1 border-line" />
      <CodeInline onDiscount={setDiscount} />
    </Choose>
  )
}

function Choose({
  prices,
  was,
  note,
  code,
  web = false,
  children,
}: ReturnType<typeof offer> & { web?: boolean; children?: React.ReactNode }) {
  const client = useClient()
  const account = useAccount()
  const [plan, setPlan] = useState<ProPlan>('yearly')
  const [busy, setBusy] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [afterSignIn, setAfterSignIn] = useState(false)
  const signedIn = account?.state === 'signed_in'

  const pay = async () => {
    setBusy(true)
    try {
      const w = webApi()
      const r = w
        ? await w.checkout(plan, code ?? undefined)
        : await proApi(client).checkout(plan, account?.account?.email ?? '', code ?? undefined)
      openExternal(r.checkout_url)
      setWaiting(true)
    } catch (e) {
      const d = describeError(e)
      toast({ tone: 'error', message: d.message, hint: d.hint })
    } finally {
      setBusy(false)
    }
  }

  // Signed out: sign in first, then checkout opens by itself once the account is back.
  const go = () => {
    if (signedIn || web) {
      void pay()
      return
    }
    setAfterSignIn(true)
    void startSignIn()
  }
  const payRef = useRef(pay)
  payRef.current = pay
  useEffect(() => {
    if (afterSignIn && signedIn) {
      setAfterSignIn(false)
      void payRef.current()
    }
    if (afterSignIn && account?.state === 'signed_out') setAfterSignIn(false)
  }, [afterSignIn, signedIn, account?.state])

  // Waiting for the payment (app): ask now and then, and when the window comes back.
  useEffect(() => {
    if (!waiting || web) return
    const pro = proApi(client)
    const ask = () =>
      void pro
        .refresh()
        .then((v) => {
          if (v.active) {
            publishPro(v)
            setWaiting(false)
          }
        })
        .catch(() => undefined)
    const t = setInterval(ask, POLL_MS)
    window.addEventListener('focus', ask)
    return () => {
      clearInterval(t)
      window.removeEventListener('focus', ask)
    }
  }, [waiting, web, client])

  return (
    <>
      <p id="plans-choose" className="text-[15px] font-semibold text-text">
        Choose a plan
      </p>
      <div role="radiogroup" aria-labelledby="plans-choose" className="flex flex-col gap-3">
        {(['monthly', 'yearly'] as const).map((k) => {
          const c = planCopy(prices, k)
          const on = plan === k
          return (
            <label
              key={k}
              className={`relative grid cursor-pointer gap-0.5 rounded-[14px] border bg-surface-1 p-4 ${
                on
                  ? 'border-accent-line shadow-[0_0_0_3px_var(--fc-accent-soft)]'
                  : 'border-line-strong'
              } has-[:focus-visible]:shadow-[var(--fc-focus)]`}
            >
              <input
                type="radio"
                name="plan"
                value={k}
                checked={on}
                onChange={() => setPlan(k)}
                className="sr-only"
              />
              <span className="flex items-center justify-between gap-2 text-[13.5px] font-semibold text-text-2">
                <span className="flex items-center gap-2">
                  {c.name}
                  {c.save && (
                    <span className="rounded-full bg-ok-soft px-[7px] py-1 font-mono text-[11px] leading-none font-semibold text-ok">
                      {c.save}
                    </span>
                  )}
                </span>
                <span
                  aria-hidden="true"
                  className={`grid size-5 place-items-center rounded-full border-[1.5px] ${
                    on ? 'border-arc bg-arc' : 'border-line-strong'
                  }`}
                >
                  {on && <span className="size-[7px] rounded-full bg-bg" />}
                </span>
              </span>
              <span className="font-display text-[30px] leading-[1.1] font-bold tracking-[-0.02em] text-text">
                {was[k] !== undefined && (
                  <s className="mr-2 text-[18px] font-semibold text-text-3">
                    {rupeesFromPaise(was[k])}
                  </s>
                )}
                {c.price}
                <small className="ml-1 font-sans text-[14px] font-medium tracking-normal text-text-3">
                  {c.per}
                </small>
              </span>
              <span className="text-[13px] text-text-3">{c.sub}</span>
            </label>
          )
        })}
      </div>
      {note && <p className="text-[13px] text-ok">{note}</p>}
      <Button
        variant="primary"
        size="lg"
        busy={busy || afterSignIn}
        onClick={go}
        data-testid="plans-continue"
      >
        Continue in browser
        <ArrowSquareOut size={16} aria-hidden />
      </Button>
      {waiting ? (
        <p role="status" className="text-[13px] text-text-2">
          Finish paying in your browser. Pro turns on here by itself once it’s done.
        </p>
      ) : (
        <p className="flex items-start gap-2 text-[13px] text-text-3">
          <Browser size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            Payment opens in your browser. Pro turns on here by itself once it’s done.
            {!signedIn && !web && ' You’ll sign in first, so Pro stays with your account.'}
          </span>
        </p>
      )}
      {children}
    </>
  )
}
