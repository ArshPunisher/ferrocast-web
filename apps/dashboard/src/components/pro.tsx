// Settings › Pro: what this install's Ferrocast Pro is, and the few things to do about it.
// The engine asks the relay; Razorpay takes payment on its own page, opened in the browser.
// Pro is marked calmly (never an upsell). Buying is three short steps (plan, where receipts
// go, a receipt to check) and then the app waits for Razorpay by itself.

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { motion, useReducedMotion } from 'motion/react'
import {
  ArrowLeft,
  ArrowSquareOut,
  CaretDown,
  ChartLineUp,
  CheckCircle,
  CloudArrowUp,
  DeviceMobile,
  DiscordLogo,
  Robot,
  Waveform,
  type Icon,
} from '@phosphor-icons/react'
import {
  ApiError,
  describeError,
  proApi,
  rupeesFromPaise,
  type ProCheckout,
  type ProPlan,
  type ProView,
} from '@ferrocast/api'
import { Badge, Button, Field, Input, Skeleton, cx, toast } from '@ferrocast/ui'
import { LoadError } from './Panel'
import { useAction, useClient, useResource } from '../lib/hooks'
import { externalLink, openExternal } from '../lib/external'
import { href } from '../lib/router'
import { isTestGrant, publishPro } from '../lib/pro-status'

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
  if (isTestGrant(p)) {
    return p.active
      ? {
          badge: 'Active',
          tone: 'ok',
          text: `Test Pro is on until ${day(p.access_until ?? p.current_end)}. There’s nothing to pay or manage.`,
        }
      : { badge: 'Ended', tone: 'neutral', text: 'Your test Pro has ended.' }
  }
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

/** Whether this status can buy Pro now (on sale, and nothing running or starting). */
export function canBuyPro(p: ProView): boolean {
  return (
    p.sales_open &&
    !!p.prices &&
    !p.active &&
    !['authenticated', 'active', 'pending'].includes(p.status)
  )
}

/** Manage opens the relay's page for a Razorpay subscription; a test grant has none. */
export function canManagePro(p: ProView): boolean {
  return !!p.subscription_id && !isTestGrant(p)
}

/** Restore is offered until a real subscription is on this install. */
function canRestore(p: ProView): boolean {
  return !p.active && (!p.subscription_id || isTestGrant(p))
}

/** Prices in words for the plan cards and the receipt (paise in, rupees out). */
export function planCopy(prices: NonNullable<ProView['prices']>, plan: ProPlan) {
  if (plan === 'monthly')
    return {
      name: 'Monthly',
      price: rupeesFromPaise(prices.monthly),
      per: 'a month',
      sub: 'Cancel any time',
      save: null as string | null,
    }
  const saved = prices.monthly * 12 - prices.yearly
  return {
    name: 'Yearly',
    price: rupeesFromPaise(prices.yearly),
    per: 'a year',
    // Whole rupees: "About ₹167 a month" (₹1,999 / 12 = ₹166.58).
    sub: `About ${rupeesFromPaise(Math.round(prices.yearly / 12 / 100) * 100)} a month`,
    save: saved > 0 ? `Save ${rupeesFromPaise(saved)}` : null,
  }
}

/** When a plan bought today renews. */
export function renewsOn(plan: ProPlan, from = new Date()): string {
  // From the 1st, so 31 Jan doesn't spill into March; then the same day, or the month's last.
  const d = new Date(from)
  const dom = d.getDate()
  d.setDate(1)
  if (plan === 'yearly') d.setFullYear(d.getFullYear() + 1)
  else d.setMonth(d.getMonth() + 1)
  d.setDate(Math.min(dom, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()))
  return day(d.getTime())
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
/** The email step's own check, before anything is sent. */
export function emailProblem(v: string): string | null {
  if (!v.trim()) return 'Add an email so we can send your receipt.'
  return EMAIL.test(v.trim())
    ? null
    : 'That email looks incomplete. Check the @ and the part after it.'
}

const FEATURES: { icon: Icon; title: string; text: string }[] = [
  { icon: Robot, title: '24/7 cloud bot', text: 'Commands and timers answer when your PC is off.' },
  {
    icon: DeviceMobile,
    title: 'Dashboard from anywhere',
    text: 'Your phone, and invites for your mods.',
  },
  {
    icon: Waveform,
    title: 'Ferrocast voices',
    text: 'Natural Hindi and English TTS, 20,000 characters a month.',
  },
  {
    icon: CloudArrowUp,
    title: 'Cloud backups',
    text: 'Locked on your PC before upload. We can’t read them.',
  },
  { icon: DiscordLogo, title: 'Discord bot', text: 'Go-live posts and roles for supporters.' },
  {
    icon: ChartLineUp,
    title: 'Stream history, weekly email, tip branding',
    text: 'And a tip goal.',
  },
]

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
  const [email, setEmail] = useState('')

  // Every fresh answer reaches the rest of the app (the sidebar, Home, the unlock).
  useEffect(() => {
    if (res.data) publishPro(res.data)
  }, [res.data])

  if (res.error) return <LoadError error={res.error} onRetry={res.reload} />
  const p = res.data
  if (!p) return <Skeleton className="h-28" />
  const buy = canBuyPro(p)

  return (
    <div className="flex flex-col gap-5" data-testid="pro-card">
      {(!buy || p.status !== 'none' || p.stale || p.warning) && (
        <StatusCard p={p} onView={res.set} email={email} />
      )}
      {buy && p.prices && (
        <Checkout prices={p.prices} email={email} setEmail={setEmail} onView={(v) => res.set(v)} />
      )}
      {canRestore(p) && <Restore onView={res.set} />}
    </div>
  )
}

/** Where Pro stands, with Check again and Manage. Pro on reads as a small finish line. */
function StatusCard({
  p,
  onView,
  email,
}: {
  p: ProView
  onView: (v: ProView) => void
  email: string
}) {
  const pro = proApi(useClient())
  const { run, busy } = useAction()
  const [manageUrl, setManageUrl] = useState<string | null>(null)
  const s = proSummary(p)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-[12px] border border-line bg-surface-2 p-3.5 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {p.active && (
            <h3 className="flex items-center gap-2 font-display text-[19px] font-bold tracking-tight text-text">
              <CheckCircle size={22} weight="fill" className="text-ok" aria-hidden />
              Pro is on
            </h3>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={s.tone}>{s.badge}</Badge>
            {p.subscription_id && (
              <span translate="no" className="truncate font-mono text-[13.5px] text-text-3">
                {p.subscription_id}
              </span>
            )}
          </div>
          <p className="text-sm text-text-2" data-testid="pro-summary">
            {s.text}
            {p.active && email.trim() && (
              <>
                {' '}
                Receipts go to <b className="font-semibold text-text">{email.trim()}</b>.
              </>
            )}
          </p>
          {p.stale && (
            <p role="status" className="text-[13.5px] font-medium text-warn">
              {p.checked_at
                ? `Couldn’t reach the relay. Last check: ${day(p.checked_at)}. Pro works offline for ${p.offline_grace_days} days.`
                : 'Couldn’t reach the relay to check Pro. Everything else works.'}
            </p>
          )}
          {!p.stale && p.warning && <p className="text-[13.5px] text-text-2">{p.warning}</p>}
          {p.active && p.features.cloud_bot && (
            <a
              href={href({ name: 'bot' })}
              className="fc-press mt-1.5 inline-flex h-8 items-center self-start rounded-control border border-line-strong bg-surface-3 px-3 text-[13.5px] font-semibold text-text hover:border-text-3"
            >
              Set up the cloud bot
            </a>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            size="sm"
            busy={busy === 'refresh'}
            onClick={() => void run('refresh', () => pro.refresh()).then((v) => v && onView(v))}
          >
            Check again
          </Button>
          {canManagePro(p) && (
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
    </div>
  )
}

const STEPS = ['Plan', 'Receipts', 'Review'] as const
/** How often the waiting screen asks again, and for how long. */
const POLL_MS = 6_000
const POLL_FOR_MS = 15 * 60_000

function Checkout({
  prices,
  email,
  setEmail,
  onView,
}: {
  prices: NonNullable<ProView['prices']>
  email: string
  setEmail: (v: string) => void
  onView: (v: ProView) => void
}) {
  const pro = proApi(useClient())
  const reduce = useReducedMotion()
  const [step, setStep] = useState(0)
  const [plan, setPlan] = useState<ProPlan>('yearly')
  const [emailErr, setEmailErr] = useState<string | null>(null)
  const [paying, setPaying] = useState(false)
  const [checkout, setCheckout] = useState<ProCheckout | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const moved = useRef(false)

  // Focus lands on each new step's heading (not on first load).
  useEffect(() => {
    if (moved.current) heading.current?.focus()
  }, [step, checkout])
  const go = (n: number) => {
    moved.current = true
    setStep(n)
  }

  const pay = async () => {
    setPaying(true)
    try {
      const r = await pro.checkout(plan, email.trim())
      setCheckout(r)
      moved.current = true
      // In the desktop app this hands the page to the browser; elsewhere a new tab (a
      // blocked pop-up still has "Open checkout again" below).
      openExternal(r.checkout_url)
    } catch (e) {
      const d = describeError(e)
      if (e instanceof ApiError && e.code === 'invalid_email') {
        setEmailErr(d.hint ? `${d.message} ${d.hint}` : d.message)
        go(1)
      }
      toast({ tone: 'error', message: d.message, hint: d.hint })
      // Already Pro (another tab, another PC): show it.
      if (e instanceof ApiError && e.code === 'already_pro')
        void pro
          .refresh()
          .then(onView)
          .catch(() => undefined)
    } finally {
      setPaying(false)
    }
  }

  const c = planCopy(prices, plan)
  const enter = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 } }
    : { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 } }
  const progress = checkout ? 3 : step + 1

  return (
    <section aria-labelledby="pro-get" className="flex max-w-[640px] flex-col">
      <div className="flex items-center justify-between gap-3">
        <h3 id="pro-get" className="font-display text-[18px] font-bold tracking-tight text-text">
          Get Pro
        </h3>
        <span className="font-mono text-[12.5px] text-text-3" aria-live="polite">
          {checkout ? 'Waiting for Razorpay' : `Step ${step + 1} of 3`}
        </span>
      </div>
      <div className="mt-3.5 grid grid-cols-3 gap-1.5" aria-hidden="true">
        {STEPS.map((s, i) => (
          <i key={s} className="relative h-[3px] overflow-hidden rounded-full bg-line">
            <span
              className="absolute inset-0 origin-left bg-accent transition-transform duration-[360ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
              style={{ transform: `scaleX(${i < progress ? 1 : 0})` }}
            />
          </i>
        ))}
      </div>
      <div
        className="mt-1.5 grid grid-cols-3 gap-1.5 font-mono text-[11.5px] text-text-3"
        aria-hidden="true"
      >
        {STEPS.map((s, i) => (
          <span key={s} className={i < progress ? 'text-text' : ''}>
            {s}
          </span>
        ))}
      </div>

      <motion.div
        key={checkout ? 'wait' : step}
        {...enter}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        className="mt-5 flex min-h-[220px] flex-col gap-4"
      >
        {checkout ? (
          <Waiting
            checkout={checkout}
            heading={heading}
            onView={onView}
            onRestart={() => {
              setCheckout(null)
              go(0)
            }}
          />
        ) : step === 0 ? (
          <>
            <div>
              <h4
                ref={heading}
                tabIndex={-1}
                className="flex flex-wrap items-center gap-2.5 font-display text-[20px] leading-tight font-bold tracking-tight text-text outline-none"
              >
                Pro adds the always-on parts <Badge>Free plan</Badge>
              </h4>
              <p className="mt-1 max-w-[52ch] text-[14.5px] text-text-2">
                Everything you use today stays free. Pro keeps your bot and dashboard running when
                your PC is off.
              </p>
            </div>
            <PlanCards prices={prices} plan={plan} setPlan={setPlan} />
            <ul className="grid grid-cols-1 gap-x-5 gap-y-2.5 border-y border-line py-4 sm:grid-cols-2">
              {FEATURES.map((f) => (
                <li key={f.title} className="grid grid-cols-[20px_1fr] items-start gap-2.5">
                  <f.icon size={18} className="mt-0.5 text-accent-text" aria-hidden />
                  <span className="text-[14.5px] text-text-2">
                    <b className="block font-semibold text-text">{f.title}</b>
                    {f.text}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex justify-end">
              <Button variant="primary" className="max-[480px]:flex-1" onClick={() => go(1)}>
                Continue
              </Button>
            </div>
          </>
        ) : step === 1 ? (
          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              const m = emailProblem(email)
              setEmailErr(m)
              if (!m) go(2)
            }}
          >
            <h4
              ref={heading}
              tabIndex={-1}
              className="font-display text-[22px] leading-tight font-bold tracking-tight text-text outline-none"
            >
              Where should receipts go?
            </h4>
            <Field
              label="Email"
              hint="We send receipts here. You also use it to move Pro to another PC."
              error={emailErr}
            >
              {(f) => (
                <Input
                  {...f}
                  type="email"
                  name="email"
                  autoComplete="email"
                  inputMode="email"
                  spellCheck={false}
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    if (emailErr) setEmailErr(emailProblem(e.target.value))
                  }}
                />
              )}
            </Field>
            <StepNav onBack={() => go(0)}>
              <Button type="submit" variant="primary" className="max-[480px]:flex-1">
                Review
              </Button>
            </StepNav>
          </form>
        ) : (
          <>
            <h4
              ref={heading}
              tabIndex={-1}
              className="font-display text-[22px] leading-tight font-bold tracking-tight text-text outline-none"
            >
              Check and pay
            </h4>
            <dl
              className="grid gap-2 rounded-[12px] border border-dashed border-line-strong px-4 py-3.5 text-[14.5px]"
              data-testid="pro-receipt"
            >
              <Row k={`Ferrocast Pro, ${plan}`} v={<span className="font-mono">{c.price}</span>} />
              <Row k="Renews" v={renewsOn(plan)} />
              <Row
                k="Receipts to"
                v={<span className="text-right [overflow-wrap:anywhere]">{email.trim()}</span>}
              />
              <div className="flex justify-between gap-3 border-t border-line pt-2 font-bold text-text">
                <dt>Today</dt>
                <dd className="font-mono">{c.price}</dd>
              </div>
            </dl>
            <p className="text-[13px] text-text-3">
              Billed in INR through Razorpay. Your price stays the same for at least 12 months.
              Cancel any time and keep Pro until the period ends.
            </p>
            <StepNav onBack={() => go(1)}>
              <Button
                variant="primary"
                size="lg"
                busy={paying}
                className="max-[480px]:flex-1"
                onClick={() => void pay()}
              >
                {paying ? 'Opening Razorpay…' : `Pay ${c.price} on Razorpay`}
                {!paying && <ArrowSquareOut size={17} aria-hidden />}
              </Button>
            </StepNav>
          </>
        )}
      </motion.div>
    </section>
  )
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-text-2">{k}</dt>
      <dd className="text-text">{v}</dd>
    </div>
  )
}

function StepNav({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5">
      <Button variant="ghost" icon={<ArrowLeft size={16} aria-hidden />} onClick={onBack}>
        Back
      </Button>
      {children}
    </div>
  )
}

/** Two plan cards as one radio group: arrow keys move, the price never hides. */
function PlanCards({
  prices,
  plan,
  setPlan,
}: {
  prices: NonNullable<ProView['prices']>
  plan: ProPlan
  setPlan: (p: ProPlan) => void
}) {
  const refs = useRef<Record<ProPlan, HTMLButtonElement | null>>({ monthly: null, yearly: null })
  const onKey = (e: KeyboardEvent) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
    e.preventDefault()
    const next: ProPlan = plan === 'yearly' ? 'monthly' : 'yearly'
    setPlan(next)
    refs.current[next]?.focus()
  }
  return (
    <div
      role="radiogroup"
      aria-label="Pro plan"
      onKeyDown={onKey}
      className="grid grid-cols-1 gap-2.5 sm:grid-cols-2"
    >
      {(['monthly', 'yearly'] as const).map((k) => {
        const c = planCopy(prices, k)
        const on = plan === k
        return (
          <button
            key={k}
            ref={(el) => {
              refs.current[k] = el
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => setPlan(k)}
            className={cx(
              'fc-press grid gap-0.5 rounded-[12px] border px-4 py-3.5 text-left',
              'transition-[border-color,background-color,box-shadow] duration-150',
              'focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none',
              on
                ? 'border-accent-text bg-accent-soft shadow-[inset_0_0_0_1px_var(--fc-accent-text)]'
                : 'border-line-strong bg-surface-2 hover:border-text-3',
            )}
          >
            <span className="flex items-center justify-between gap-2 text-[13.5px] font-semibold text-text-2">
              {c.name}
              {c.save ? (
                <Badge className="border-line-strong text-molten-text">{c.save}</Badge>
              ) : (
                <span
                  aria-hidden="true"
                  className={cx(
                    'grid size-[18px] place-items-center rounded-full border-[1.5px]',
                    on ? 'border-accent-text' : 'border-line-strong',
                  )}
                >
                  {on && <span className="size-2 rounded-full bg-accent-text" />}
                </span>
              )}
            </span>
            <span className="font-display text-[24px] leading-tight font-bold tracking-tight text-text">
              {c.price}{' '}
              <small className="font-sans text-[14px] font-medium tracking-normal text-text-3">
                {c.per}
              </small>
            </span>
            <span className="text-[13px] text-text-3">{c.sub}</span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * After Pay: Razorpay is open in the browser. Ask the relay again every few seconds (and
 * whenever this window comes back), so Pro turns on here without a click.
 */
function Waiting({
  checkout,
  heading,
  onView,
  onRestart,
}: {
  checkout: ProCheckout
  heading: RefObject<HTMLHeadingElement | null>
  onView: (v: ProView) => void
  onRestart: () => void
}) {
  const pro = proApi(useClient())
  const { run, busy } = useAction()
  const onViewRef = useRef(onView)
  onViewRef.current = onView
  const proRef = useRef(pro)
  proRef.current = pro

  useEffect(() => {
    const until = Date.now() + POLL_FOR_MS
    let alive = true
    let inFlight = false
    const ask = () => {
      if (!alive || inFlight || Date.now() > until || document.visibilityState === 'hidden') return
      inFlight = true
      proRef.current
        .refresh()
        .then((v) => {
          // Quiet: a failed look just waits for the next one. Only a change matters.
          if (alive && (v.active || ['authenticated', 'active', 'pending'].includes(v.status)))
            onViewRef.current(v)
        })
        .catch(() => undefined)
        .finally(() => {
          inFlight = false
        })
    }
    const t = setInterval(ask, POLL_MS)
    const back = () => ask()
    window.addEventListener('focus', back)
    document.addEventListener('visibilitychange', back)
    return () => {
      alive = false
      clearInterval(t)
      window.removeEventListener('focus', back)
      document.removeEventListener('visibilitychange', back)
    }
  }, [])

  return (
    <>
      <h4
        ref={heading}
        tabIndex={-1}
        className="font-display text-[22px] leading-tight font-bold tracking-tight text-text outline-none"
      >
        Finish paying in your browser
      </h4>
      <div
        role="status"
        className="flex flex-col gap-3 rounded-[12px] border border-accent-line bg-accent-soft px-4 py-3.5"
      >
        <p className="text-[14.5px] text-text-2">
          <span
            aria-hidden="true"
            className="fc-pro-pulse mr-2 inline-block size-2 rounded-full bg-arc align-middle"
          />
          Pro turns on here by itself once Razorpay says paid. You can close that tab afterwards.
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button
            size="sm"
            busy={busy === 'check'}
            onClick={() =>
              void run('check', () => pro.refresh()).then((v) => {
                if (!v) return
                if (v.active || ['authenticated', 'active', 'pending'].includes(v.status)) onView(v)
                else
                  toast({
                    tone: 'info',
                    message: 'Not paid yet.',
                    hint: 'Razorpay can take a minute after you pay.',
                  })
              })
            }
          >
            Check again
          </Button>
          <a
            {...externalLink(checkout.checkout_url)}
            className="rounded-[6px] text-[13.5px] font-semibold text-accent-text underline-offset-2 hover:underline focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
          >
            Open checkout again
          </a>
          <Button size="sm" variant="ghost" className="sm:ml-auto" onClick={onRestart}>
            Change plan or email
          </Button>
        </div>
      </div>
    </>
  )
}

function Restore({ onView }: { onView: (v: ProView) => void }) {
  const pro = proApi(useClient())
  const { run, busy } = useAction()
  const [restoreId, setRestoreId] = useState('')
  const [restoreEmail, setRestoreEmail] = useState('')
  return (
    <details className="group max-w-[640px] border-t border-line pt-4">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-text [&::-webkit-details-marker]:hidden">
        Already have Pro? Move it to this PC
        <CaretDown
          size={14}
          aria-hidden
          className="text-text-3 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <form
        className="mt-3 flex max-w-md flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void run('restore', () => pro.restore(restoreId.trim(), restoreEmail.trim()), {
            success: (v) =>
              v.active ? 'Pro is on for this PC.' : 'Found it, but it isn’t active right now.',
          }).then((v) => v && onView(v))
        }}
      >
        <p className="text-sm text-text-2">
          Pro follows your subscription, not your PC. Enter the two things from your Razorpay
          receipt.
        </p>
        <Field label="Subscription id" hint="Starts with sub_. It’s in Razorpay’s emails.">
          {(f) => (
            <Input
              {...f}
              required
              spellCheck={false}
              autoComplete="off"
              className="font-mono"
              placeholder="sub_"
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
  )
}
