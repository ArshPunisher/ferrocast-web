import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  ArrowSquareOut,
  CaretDown,
  Check,
  CopySimple,
  EyeSlash,
  Lock,
  ShieldCheck,
  Warning,
} from '@phosphor-icons/react'
import {
  ApiError,
  TIP_LIMITS,
  formatMoney,
  proApi,
  proPanelState,
  tipBrandApi,
  tipDomainApi,
  tipPalette,
  TIP_PAGE_ID_PROVIDERS,
  TIP_PROVIDER_KEYS,
  TIP_PROVIDER_NAMES,
  checkedTipPage,
  describeError,
  normaliseTipHandle,
  tipDisplayNameProblem,
  tipHandleProblem,
  tipLinkProblem,
  tipMessageProblem,
  tipPageIdProblem,
  tipSecretProblem,
  tipTextLength,
  type TipProviderInput,
  type TipProviderKey,
  type TipSettings,
  type TipSettingsInput,
  type TipBrand,
  type TipColours,
  type TipGoal,
  type TipDomain,
} from '@ferrocast/api'
import {
  Badge,
  BrandIcon,
  Button,
  Dialog,
  Field,
  Input,
  Skeleton,
  Switch,
  Textarea,
  copyText,
  cx,
  toast,
  useFlash,
} from '@ferrocast/ui'
import { LoadError, PageHeader, Panel } from '../components/Panel'
import { ProPanelView } from '../components/pro/ProPanel'
import { Branding, savedColours } from '../components/tips/Branding'
import { GoalPage, goalPct } from '../components/tips/GoalPage'
import { OwnAddress } from '../components/tips/OwnAddress'
import { TipPreview } from '../components/tips/TipPreview'
import { useClient, useResource } from '../lib/hooks'
import { useUnsavedWarning } from '../lib/unsaved'
import { isCloud } from '../lib/boot'
import { useLive } from '../lib/store'
import { externalLink } from '../lib/external'

// How tips work: the streamer makes their own payment page with each provider, pastes its
// link here, points the provider's webhook at the address Ferrocast shows, and pastes that
// webhook's secret back. The relay then lists the provider buttons on a public tip page and
// checks every payment notice. Ferrocast never touches the money.

interface Guide {
  blurb: string
  /** What the viewer's button says on the tip page (mirrors the relay's page). */
  button: string
  pageLabel: string
  pageHint: string
  pagePlaceholder: string
  createUrl: string
  createLabel: string
  webhookHow: string
  events: readonly string[]
  webhookUrl: string
  webhookLabel: string
  secretLabel: string
  secretHint: string
  secretPlaceholder: string
  testHint: string
}

const GUIDES: Record<TipProviderKey, Guide> = {
  razorpay: {
    blurb: 'UPI, cards and netbanking for viewers in India.',
    button: 'Tip with UPI or card',
    pageLabel: 'Your Razorpay page link',
    pageHint: 'A page where viewers pick the amount, on razorpay.me, pages.razorpay.com or rzp.io.',
    pagePlaceholder: 'https://razorpay.me/@yourname',
    createUrl: 'https://dashboard.razorpay.com/app/paymentlinks',
    createLabel: 'Open Payment Links',
    webhookHow:
      'In Razorpay: Account & Settings → Webhooks → Add new webhook. Paste this address, set a secret, and tick:',
    events: [
      'payment.captured',
      'payment_link.paid',
      'refund.processed',
      'payment.dispute.created',
    ],
    webhookUrl: 'https://dashboard.razorpay.com/app/webhooks',
    webhookLabel: 'Open Razorpay webhooks',
    secretLabel: 'Webhook secret',
    secretHint: 'The one you set in Razorpay. At least 8 characters.',
    secretPlaceholder: 'The secret you chose in Razorpay',
    testHint: 'For trying Razorpay test mode. Test payments alert like real tips.',
  },
  kofi: {
    blurb: 'Your Ko-fi page. Ko-fi takes no cut of tips.',
    button: 'Tip on Ko-fi',
    pageLabel: 'Your Ko-fi page link',
    pageHint: 'Like ko-fi.com/yourname.',
    pagePlaceholder: 'https://ko-fi.com/yourname',
    createUrl: 'https://ko-fi.com/manage',
    createLabel: 'Open Ko-fi',
    webhookHow: 'In Ko-fi: Settings → More → API → Webhooks. Paste this address and press Update.',
    events: [],
    webhookUrl: 'https://ko-fi.com/manage/webhooks',
    webhookLabel: 'Open Ko-fi webhooks',
    secretLabel: 'Verification token',
    secretHint: 'On the same Ko-fi page, under Advanced.',
    secretPlaceholder: 'Ko-fi verification token',
    testHint: 'For Ko-fi’s “Send test”. Tests alert like real tips.',
  },
  stripe: {
    blurb: 'Cards and wallets worldwide, paid out to your bank.',
    button: 'Tip with card',
    pageLabel: 'Your Stripe Payment Link',
    pageHint: 'A buy.stripe.com link set to “Customers choose what to pay”.',
    pagePlaceholder: 'https://buy.stripe.com/…',
    createUrl: 'https://dashboard.stripe.com/payment-links',
    createLabel: 'Open Payment Links',
    webhookHow: 'In Stripe: Developers → Webhooks → Add endpoint. Paste this address and pick:',
    events: [
      'checkout.session.completed',
      'checkout.session.async_payment_succeeded',
      'charge.refunded',
      'charge.dispute.created',
    ],
    webhookUrl: 'https://dashboard.stripe.com/webhooks',
    webhookLabel: 'Open Stripe webhooks',
    secretLabel: 'Signing secret',
    secretHint: 'Starts with whsec_. Never paste an API key (sk_…).',
    secretPlaceholder: 'whsec_…',
    testHint: 'For trying Stripe test cards. Test payments alert like real tips.',
  },
}

const EASE = [0.22, 1, 0.36, 1] as const
/** Where tip pages live before the relay has said so (the first save). */
const TIP_HOST = 'tip.clearcraftlabs.com'

type PageDraft = { handle: string; display_name: string; message: string }
type Problem = { message: string; hint: string | null }
type PageField = keyof PageDraft
type ProviderField = 'page_url' | 'secret' | 'page_id'

interface ProviderDraft {
  page_url: string
  page_id: string
  test_mode: boolean
  secret: string
  /** Showing the secret field although one is saved. */
  replacing: boolean
}

const pageDraftOf = (t: TipSettings): PageDraft => ({
  handle: t.handle,
  display_name: t.display_name,
  message: t.message,
})

function providerDraftOf(t: TipSettings, key: TipProviderKey): ProviderDraft {
  const p = t[key]
  return {
    page_url: p?.page_url ?? '',
    page_id: p?.page_id ?? '',
    test_mode: p?.test_mode ?? false,
    secret: '',
    replacing: false,
  }
}

/** The saved providers as a save body (blank secrets keep the stored ones). */
function savedProvider(t: TipSettings, key: TipProviderKey): TipProviderInput | null {
  const p = t[key]
  return p ? { page_url: p.page_url, page_id: p.page_id, test_mode: p.test_mode, secret: '' } : null
}

function body(
  t: TipSettings,
  page: PageDraft,
  change?: { key: TipProviderKey; value: TipProviderInput | null },
): TipSettingsInput {
  const out: TipSettingsInput = {
    handle: page.handle,
    display_name: page.display_name,
    message: page.message,
    razorpay: savedProvider(t, 'razorpay'),
    kofi: savedProvider(t, 'kofi'),
    stripe: savedProvider(t, 'stripe'),
  }
  if (change) out[change.key] = change.value
  return out
}

function pageProblems(d: PageDraft): Partial<Record<PageField, string>> {
  const out: Partial<Record<PageField, string>> = {}
  const h = tipHandleProblem(d.handle)
  if (h) out.handle = h
  const n = tipDisplayNameProblem(d.display_name)
  if (n) out.display_name = n
  const m = tipMessageProblem(d.message)
  if (m) out.message = m
  return out
}

function providerProblems(
  key: TipProviderKey,
  d: ProviderDraft,
  hasSecret: boolean,
): Partial<Record<ProviderField, string>> {
  const out: Partial<Record<ProviderField, string>> = {}
  const l = tipLinkProblem(key, d.page_url)
  if (l) out.page_url = l
  const s = tipSecretProblem(key, d.replacing || !hasSecret ? d.secret : '', hasSecret)
  if (s) out.secret = s
  const i = tipPageIdProblem(key, d.page_id)
  if (i) out.page_id = i
  return out
}

/** Which field a server message is about, so it shows next to that field. */
function pageFieldOf(message: string): PageField | null {
  if (/tip page name/i.test(message)) return 'handle'
  if (/display name/i.test(message)) return 'display_name'
  if (/tip page message/i.test(message)) return 'message'
  return null
}
function providerFieldOf(message: string): ProviderField | null {
  if (/link id|plink_/i.test(message)) return 'page_id'
  if (/secret|api key|whsec_|token/i.test(message)) return 'secret'
  if (/link must be/i.test(message)) return 'page_url'
  return null
}

const joined = (p: Problem) => (p.hint ? `${p.message} ${p.hint}` : p.message)

export function Tips() {
  const client = useClient()
  const res = useResource((c) => c.tips())
  const reduce = useReducedMotion()
  const saved = res.data
  const [page, setPage] = useState<PageDraft | null>(null)
  const [pageTried, setPageTried] = useState(false)
  const [pageError, setPageError] = useState<Problem | null>(null)
  const [savingPage, setSavingPage] = useState(false)
  const [open, setOpen] = useState<TipProviderKey | null>(null)
  const [takingDown, setTakingDown] = useState(false)
  const [busyDown, setBusyDown] = useState(false)
  const handleRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const messageRef = useRef<HTMLTextAreaElement>(null)
  // Cloud mode (no PC): the page and its providers only. Pro's extras stay with a PC's Pro.
  const cloud = isCloud(useLive((s) => s.conn))
  // Pro: branding and the goal page (shown only when the relay has them and Pro is open).
  const pro = useResource((c) => (cloud ? Promise.resolve(null) : proApi(c).status()))
  const proOpen = proPanelState(pro.error ? null : pro.data, 'tip_brand') === 'open'
  const [brand, setBrand] = useState<TipBrand | null>(null)
  const [draft, setDraft] = useState<TipColours | null>(null)
  const [goal, setGoal] = useState<TipGoal | null>(null)
  const [goalLoaded, setGoalLoaded] = useState(false)
  const [brandError, setBrandError] = useState<unknown>(null)
  const [goalError, setGoalError] = useState<unknown>(null)
  const [brandTry, setBrandTry] = useState(0)
  useEffect(() => {
    if (!proOpen) return
    let alive = true
    const api = tipBrandApi(client)
    setBrandError(null)
    setGoalError(null)
    setGoalLoaded(false)
    api.brand().then(
      (b) => alive && setBrand(b),
      (e: unknown) => {
        if (!alive) return
        setBrand(null)
        setBrandError(e)
      },
    )
    api.goal().then(
      (g) => {
        if (alive) {
          setGoal(g)
          setGoalLoaded(true)
        }
      },
      (e: unknown) => {
        if (!alive) return
        // No goal yet is a 404. Anything else is an error, not an empty form: saving an
        // empty form could replace a goal that never loaded.
        if (e instanceof ApiError && e.status === 404) {
          setGoal(null)
          setGoalLoaded(true)
        } else setGoalError(e)
      },
    )
    return () => {
      alive = false
    }
  }, [proOpen, client, brandTry])

  // Pro: the tip page on the streamer's own address (its own feature switch on the relay).
  const domainOpen = proPanelState(pro.error ? null : pro.data, 'tip_domain') === 'open'
  const [domain, setDomain] = useState<TipDomain | null>(null)
  const [domainLoaded, setDomainLoaded] = useState(false)
  const [domainError, setDomainError] = useState<unknown>(null)
  const [domainTry, setDomainTry] = useState(0)
  useEffect(() => {
    if (!domainOpen) return
    let alive = true
    setDomainError(null)
    setDomainLoaded(false)
    tipDomainApi(client)
      .get()
      .then(
        (d) => {
          if (!alive) return
          setDomain(d)
          setDomainLoaded(true)
        },
        (e: unknown) => {
          if (!alive) return
          // None yet is a 404; anything else shows with Try again.
          if (e instanceof ApiError && e.status === 404) {
            setDomain(null)
            setDomainLoaded(true)
          } else setDomainError(e)
        },
      )
    return () => {
      alive = false
    }
  }, [domainOpen, client, domainTry])

  useEffect(() => {
    // Set the draft once; `savePage` refreshes it after a save. Provider saves and taking the
    // page down keep what was typed (so making the page again is one click).
    if (saved && !page) setPage(pageDraftOf(saved))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved])

  useUnsavedWarning(
    !!saved?.page_url &&
      !!page &&
      (normaliseTipHandle(page.handle) !== saved.handle ||
        page.display_name !== saved.display_name ||
        page.message !== saved.message),
  )

  if (res.error)
    return (
      <div>
        <PageHeader title="Tips" />
        <LoadError error={res.error} onRetry={res.reload} />
      </div>
    )
  if (!saved || !page)
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-40" />
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    )

  const live = saved.page_url !== null
  const problems = pageProblems(page)
  const serverField = pageError ? pageFieldOf(pageError.message) : null
  const fieldError = (f: PageField) =>
    (pageTried ? problems[f] : undefined) ??
    (pageError && serverField === f ? joined(pageError) : null)
  const dirty =
    !live ||
    normaliseTipHandle(page.handle) !== saved.handle ||
    page.display_name !== saved.display_name ||
    page.message !== saved.message
  const handle = normaliseTipHandle(page.handle)
  // The link minus its name: the relay says where pages live once there is one.
  const linkBase = (saved.page_url ?? `https://${TIP_HOST}/`).replace(/[^/]*$/, '')

  const edit = (patch: Partial<PageDraft>) => {
    setPage({ ...page, ...patch })
    setPageError(null)
  }

  const savePage = async () => {
    setPageTried(true)
    setPageError(null)
    const first = (['handle', 'display_name', 'message'] as const).find((f) => problems[f])
    if (first) {
      ;({ handle: handleRef, display_name: nameRef, message: messageRef })[first].current?.focus()
      return
    }
    setSavingPage(true)
    try {
      const r = await client.saveTips(body(saved, page))
      res.set(r)
      setPage(pageDraftOf(r))
      setPageTried(false)
      toast({
        tone: 'ok',
        message: live ? 'Tip page saved.' : 'Your tip page is up. Now add a way to pay.',
      })
      if (!live) setOpen(TIP_PROVIDER_KEYS.find((k) => !r[k]) ?? null)
    } catch (e) {
      const d = describeError(e)
      setPageError(d)
      const f = pageFieldOf(d.message)
      if (f) ({ handle: handleRef, display_name: nameRef, message: messageRef })[f].current?.focus()
    } finally {
      setSavingPage(false)
    }
  }

  const takeDown = async () => {
    setBusyDown(true)
    try {
      await client.deleteTips()
      setTakingDown(false)
      setOpen(null)
      res.set({
        ...saved,
        page_url: null,
        webhooks: null,
        razorpay: null,
        kofi: null,
        stripe: null,
      })
      toast({
        tone: 'ok',
        message: 'Your tip page is down.',
        hint: `The name ${saved.handle} stays yours for ${TIP_LIMITS.holdDays} days if you want it back.`,
      })
    } catch (e) {
      const d = describeError(e)
      toast({ tone: 'error', message: d.message, hint: d.hint })
    } finally {
      setBusyDown(false)
    }
  }

  const enter = reduce ? { opacity: 0 } : { opacity: 0, y: 6 }

  return (
    <div>
      <PageHeader
        title="Tips"
        description="Tips go straight to you via Razorpay, Ko-fi or Stripe. No cut."
      />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel
            id="tip-page"
            title={live ? 'Your tip page' : 'Create your tip page'}
            description={live ? undefined : 'Pick a name. Add ways to pay next.'}
          >
            <AnimatePresence initial={false}>
              {live && saved.page_url && (
                <motion.div
                  key="link"
                  initial={enter}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.28, ease: EASE }}
                  className="mb-5"
                >
                  <PageLink url={saved.page_url} />
                </motion.div>
              )}
            </AnimatePresence>
            <form
              noValidate
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault()
                void savePage()
              }}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  label="Page name"
                  error={fieldError('handle')}
                  hint={
                    <>
                      3 to 30 of a-z, 0-9, - and _. Your link:{' '}
                      <span className="font-mono text-text-2">
                        {linkBase.replace(/^https?:\/\//, '')}
                        {handle || 'yourname'}
                      </span>
                    </>
                  }
                >
                  {(p) => (
                    <Input
                      {...p}
                      ref={handleRef}
                      name="handle"
                      value={page.handle}
                      maxLength={40}
                      autoCapitalize="none"
                      spellCheck={false}
                      placeholder="yourname"
                      onChange={(e) => edit({ handle: e.target.value })}
                    />
                  )}
                </Field>
                <Field
                  label="Name viewers see"
                  error={fieldError('display_name')}
                  hint={`Shown on your page and alerts. ${tipTextLength(page.display_name)}/${TIP_LIMITS.displayNameMax}`}
                >
                  {(p) => (
                    <Input
                      {...p}
                      ref={nameRef}
                      name="display_name"
                      value={page.display_name}
                      placeholder="Your stream name…"
                      onChange={(e) => edit({ display_name: e.target.value })}
                    />
                  )}
                </Field>
              </div>
              <Field
                label="Message on your page"
                optional
                error={fieldError('message')}
                hintVisible
                hint={`${tipTextLength(page.message)}/${TIP_LIMITS.messageMax}`}
              >
                {(p) => (
                  <Textarea
                    {...p}
                    ref={messageRef}
                    name="message"
                    rows={2}
                    value={page.message}
                    placeholder="Thanks for hanging out!"
                    onChange={(e) => edit({ message: e.target.value })}
                  />
                )}
              </Field>
              {pageError && !serverField && <ErrorNote problem={pageError} />}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[13.5px] text-text-2">
                  {live && handle !== saved.handle && !problems.handle
                    ? `New link: ${linkBase}${handle}`
                    : live
                      ? `New name, new link. Up to ${TIP_LIMITS.handleChangesPerDay} changes a day.`
                      : `You can change it later (${TIP_LIMITS.handleChangesPerDay} times a day).`}
                </p>
                <Button type="submit" variant="primary" busy={savingPage} disabled={!dirty}>
                  {live ? 'Save changes' : 'Create tip page'}
                </Button>
              </div>
            </form>
            {live && (
              <div className="mt-5 border-t border-line pt-3">
                <Button variant="danger-ghost" size="sm" onClick={() => setTakingDown(true)}>
                  Take the tip page down
                </Button>
              </div>
            )}
          </Panel>

          <Panel
            id="tip-providers"
            title="Ways to pay"
            description={
              live ? 'Add one or more. Three short steps each.' : 'Create your tip page first.'
            }
          >
            <ul className="flex flex-col gap-3">
              {TIP_PROVIDER_KEYS.map((key) => (
                <ProviderRow
                  key={key}
                  k={key}
                  saved={saved}
                  live={live}
                  open={open === key}
                  onToggle={() => setOpen(open === key ? null : key)}
                  onSaved={(r) => {
                    res.set(r)
                    setOpen(null)
                  }}
                />
              ))}
            </ul>
          </Panel>

          {!cloud && (
            <>
              <ProPanelView
                pro={pro.error ? null : pro.data}
                feature="tip_brand"
                id="tip-brand"
                title="Branding"
              >
                {brand ? (
                  <Branding
                    brand={brand}
                    draft={draft}
                    onDraft={setDraft}
                    onSaved={(b) => setBrand(b)}
                  />
                ) : brandError ? (
                  <LoadError error={brandError} onRetry={() => setBrandTry((n) => n + 1)} />
                ) : (
                  <Skeleton className="h-48" />
                )}
              </ProPanelView>

              <ProPanelView
                pro={pro.error ? null : pro.data}
                feature="tip_brand"
                id="tip-goal"
                title="Goal page"
              >
                {goalLoaded ? (
                  <GoalPage goal={goal} hasPage={live} defaultCurrency="INR" onSaved={setGoal} />
                ) : goalError ? (
                  <LoadError error={goalError} onRetry={() => setBrandTry((n) => n + 1)} />
                ) : (
                  <Skeleton className="h-40" />
                )}
              </ProPanelView>

              <ProPanelView
                pro={pro.error ? null : pro.data}
                feature="tip_domain"
                id="tip-domain"
                title="Your own address"
              >
                {domainLoaded ? (
                  <OwnAddress domain={domain} hasPage={live} onChange={setDomain} />
                ) : domainError ? (
                  <LoadError error={domainError} onRetry={() => setDomainTry((n) => n + 1)} />
                ) : (
                  <Skeleton className="h-40" />
                )}
              </ProPanelView>
            </>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Preview
            saved={saved}
            page={page}
            brand={proOpen ? brand : null}
            colours={proOpen ? (draft ?? savedColours(brand)) : null}
            goal={proOpen ? goal : null}
          />
          <Safety />
        </div>
      </div>

      <Dialog
        open={takingDown}
        onClose={() => setTakingDown(false)}
        size="sm"
        title="Take your tip page down?"
        description={`The link stops working. ${saved.handle} stays yours for ${TIP_LIMITS.holdDays} days. Your provider pages aren’t touched.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setTakingDown(false)}>
              Cancel
            </Button>
            <Button variant="danger" busy={busyDown} onClick={() => void takeDown()}>
              Take it down
            </Button>
          </>
        }
      />
    </div>
  )
}

function ErrorNote({ problem }: { problem: Problem }) {
  return (
    <div
      role="alert"
      className="flex gap-2.5 rounded-control border border-danger/30 bg-danger-soft px-3 py-2.5"
    >
      <Warning size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
      <div className="min-w-0 text-[13.5px] leading-snug">
        <p className="font-semibold text-text">{problem.message}</p>
        {problem.hint && <p className="mt-0.5 text-text-2">{problem.hint}</p>}
      </div>
    </div>
  )
}

function CopyButton({ text, label, what }: { text: string; label: string; what: string }) {
  const [copied, flash] = useFlash()
  return (
    <Button
      size="sm"
      aria-label={copied ? `${what} copied` : label}
      icon={copied ? <Check size={15} weight="bold" /> : <CopySimple size={15} />}
      onClick={() =>
        void copyText(text).then((ok) =>
          ok
            ? flash()
            : toast({
                tone: 'error',
                message: `Couldn’t copy the ${what.toLowerCase()}.`,
                hint: 'Select it and copy it by hand.',
              }),
        )
      }
    >
      {copied ? 'Copied' : 'Copy'}
    </Button>
  )
}

const linkButton =
  'fc-press inline-flex h-8 shrink-0 items-center gap-1.5 rounded-control border border-line-strong bg-surface-3 px-3 text-[13px] font-semibold whitespace-nowrap text-text transition-[border-color,transform] duration-150 hover:border-text-3 focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none'

function PageLink({ url }: { url: string }) {
  return (
    <div className="rounded-[12px] border border-accent-line bg-accent-soft p-3.5">
      <p className="flex items-center gap-2 text-[13.5px] font-semibold text-text">
        <Check size={14} weight="bold" className="text-ok" aria-hidden="true" />
        Your tip page is up
      </p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
        <code
          translate="no"
          className="min-w-0 flex-1 font-mono text-[13.5px] break-all text-text-2 sm:truncate"
          title={url}
        >
          {url}
        </code>
        <div className="flex gap-2">
          <CopyButton text={url} label="Copy tip page link" what="Link" />
          <a {...externalLink(url)} className={linkButton}>
            Open <ArrowSquareOut size={14} aria-hidden="true" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </div>
      </div>
      <p className="mt-2 text-[13.5px] text-text-2">Put it in your panels and a !tip command.</p>
    </div>
  )
}

function ProviderRow({
  k,
  saved,
  live,
  open,
  onToggle,
  onSaved,
}: {
  k: TipProviderKey
  saved: TipSettings
  live: boolean
  open: boolean
  onToggle: () => void
  onSaved: (t: TipSettings) => void
}) {
  const g = GUIDES[k]
  const name = TIP_PROVIDER_NAMES[k]
  const state = saved[k]
  const reduce = useReducedMotion()
  const bodyId = useId()
  const rowRef = useRef<HTMLLIElement>(null)
  const on = state !== null
  useEffect(() => {
    // Bring a newly opened setup into view when it opens low on the screen.
    const el = rowRef.current
    if (!open || !el || el.getBoundingClientRect().top < window.innerHeight * 0.6) return
    el.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' })
  }, [open, reduce])
  const head = (
    <>
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-surface-3 text-text">
        <BrandIcon name={k} size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-text">
          {name}
          {on && (
            <Badge tone="ok">
              <Check size={11} weight="bold" aria-hidden="true" /> On
            </Badge>
          )}
          {state?.test_mode && <Badge tone="warn">Test mode</Badge>}
        </span>
        <span className="mt-0.5 block text-[13.5px] text-text-2">{g.blurb}</span>
      </span>
    </>
  )
  return (
    <li
      ref={rowRef}
      className={cx(
        'scroll-mt-20 rounded-[12px] border transition-colors duration-200',
        open ? 'border-line-strong bg-surface-2' : on ? 'border-ok/30' : 'border-line',
        !live && 'opacity-60',
      )}
    >
      {live ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={onToggle}
          className="fc-press flex w-full items-center gap-3 rounded-[12px] p-3.5 text-left focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
        >
          {head}
          <span className="inline-flex shrink-0 items-center gap-1 text-[13.5px] font-semibold text-accent-text">
            <span className="hidden sm:inline">{open ? 'Close' : on ? 'Edit' : 'Set up'}</span>
            <span className="sr-only sm:hidden">{open ? 'Close' : on ? 'Edit' : 'Set up'}</span>
            <CaretDown
              size={16}
              aria-hidden="true"
              className={cx(
                'transition-transform duration-200 ease-[var(--fc-ease-out)]',
                open && 'rotate-180',
              )}
            />
          </span>
        </button>
      ) : (
        <div className="flex items-center gap-3 p-3.5">{head}</div>
      )}
      <AnimatePresence initial={false}>
        {open && saved.webhooks && (
          <motion.div
            key="body"
            id={bodyId}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={{ duration: 0.24, ease: EASE }}
          >
            <ProviderSetup k={k} saved={saved} webhook={saved.webhooks[k]} onSaved={onSaved} />
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  )
}

function Step({
  n,
  done,
  title,
  children,
  last,
}: {
  n: number
  done: boolean
  title: string
  children: ReactNode
  last?: boolean
}) {
  return (
    <li className="relative flex gap-3">
      {!last && (
        <span aria-hidden="true" className="absolute top-8 bottom-0 left-[13px] w-px bg-line" />
      )}
      <span
        aria-hidden="true"
        className={cx(
          'relative z-[1] inline-flex size-7 shrink-0 items-center justify-center rounded-full border text-[12.5px] font-bold transition-colors duration-200',
          done ? 'border-ok/50 bg-ok-soft text-ok' : 'border-line-strong bg-surface-1 text-text-2',
        )}
      >
        {done ? <Check size={13} weight="bold" /> : n}
      </span>
      <div className={cx('min-w-0 flex-1', !last && 'pb-5')}>
        <h3 className="pt-0.5 text-sm font-semibold text-text">
          {title}
          {done && <span className="sr-only"> (done)</span>}
        </h3>
        <div className="mt-2">{children}</div>
      </div>
    </li>
  )
}

function ProviderSetup({
  k,
  saved,
  webhook,
  onSaved,
}: {
  k: TipProviderKey
  saved: TipSettings
  webhook: string
  onSaved: (t: TipSettings) => void
}) {
  const client = useClient()
  const g = GUIDES[k]
  const name = TIP_PROVIDER_NAMES[k]
  const state = saved[k]
  const hasSecret = state?.has_secret ?? false
  const [d, setD] = useState<ProviderDraft>(() => providerDraftOf(saved, k))
  const [tried, setTried] = useState(false)
  const [error, setError] = useState<Problem | null>(null)
  const [busy, setBusy] = useState<'save' | 'off' | null>(null)
  const [confirmOff, setConfirmOff] = useState(false)
  const urlRef = useRef<HTMLInputElement>(null)
  const secretRef = useRef<HTMLInputElement>(null)
  const idRef = useRef<HTMLInputElement>(null)
  const advancedRef = useRef<HTMLDetailsElement>(null)
  const refs = { page_url: urlRef, secret: secretRef, page_id: idRef }

  const problems = providerProblems(k, d, hasSecret)
  const serverField = error ? providerFieldOf(error.message) : null
  const fieldError = (f: ProviderField) =>
    (tried ? problems[f] : undefined) ?? (error && serverField === f ? joined(error) : null)
  const showSecretInput = !hasSecret || d.replacing
  const linkOk = checkedTipPage(k, d.page_url) !== null
  const secretOk = showSecretInput ? d.secret.trim() !== '' && !problems.secret : hasSecret
  const supportsId = TIP_PAGE_ID_PROVIDERS.includes(k)
  const dirty =
    !state ||
    d.page_url.trim() !== state.page_url ||
    d.page_id.trim() !== (state.page_id ?? '') ||
    d.test_mode !== state.test_mode ||
    (d.replacing && d.secret.trim() !== '')

  useUnsavedWarning(
    d.page_url.trim() !== (state?.page_url ?? '') ||
      d.page_id.trim() !== (state?.page_id ?? '') ||
      d.test_mode !== (state?.test_mode ?? false) ||
      d.secret.trim() !== '',
  )

  const set = (patch: Partial<ProviderDraft>) => {
    setD({ ...d, ...patch })
    setError(null)
  }
  const focus = (f: ProviderField) => {
    if (f === 'page_id' && advancedRef.current) advancedRef.current.open = true
    requestAnimationFrame(() => refs[f].current?.focus())
  }

  const save = async () => {
    setTried(true)
    setError(null)
    const first = (['page_url', 'secret', 'page_id'] as const).find((f) => problems[f])
    if (first) return focus(first)
    setBusy('save')
    try {
      const value: TipProviderInput = {
        page_url: d.page_url.trim(),
        page_id: supportsId && d.page_id.trim() ? d.page_id.trim() : null,
        test_mode: d.test_mode,
        secret: showSecretInput ? d.secret.trim() : '',
      }
      const r = await client.saveTips(body(saved, pageDraftOf(saved), { key: k, value }))
      toast({
        tone: 'ok',
        message: state ? `${name} saved.` : `${name} is on. Its button is on your tip page.`,
        hint: d.test_mode ? 'Test payments will alert like real tips.' : null,
      })
      onSaved(r)
    } catch (e) {
      const p = describeError(e)
      setError(p)
      const f = providerFieldOf(p.message)
      if (f) focus(f)
    } finally {
      setBusy(null)
    }
  }

  const turnOff = async () => {
    setBusy('off')
    try {
      const r = await client.saveTips(body(saved, pageDraftOf(saved), { key: k, value: null }))
      setConfirmOff(false)
      toast({
        tone: 'ok',
        message: `${name} is off.`,
        hint: `You can also delete the webhook in ${name} now.`,
      })
      onSaved(r)
    } catch (e) {
      const p = describeError(e)
      setConfirmOff(false)
      setError(p)
    } finally {
      setBusy(null)
    }
  }

  return (
    <form
      noValidate
      aria-label={`${name} setup`}
      className="border-t border-line px-3.5 pt-4 pb-3.5"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <ol className="flex flex-col">
        <Step n={1} done={linkOk} title="Paste your page link">
          <Field label={g.pageLabel} hint={g.pageHint} error={fieldError('page_url')}>
            {(p) => (
              <Input
                {...p}
                ref={urlRef}
                name="page_url"
                type="url"
                inputMode="url"
                autoCapitalize="none"
                spellCheck={false}
                placeholder={g.pagePlaceholder}
                value={d.page_url}
                onChange={(e) => set({ page_url: e.target.value })}
              />
            )}
          </Field>
          <a
            {...externalLink(g.createUrl)}
            className="mt-2 inline-flex items-center gap-1 text-[13.5px] font-semibold text-accent-text hover:underline"
          >
            No page yet? {g.createLabel} <ArrowSquareOut size={13} aria-hidden="true" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </Step>
        <Step n={2} done={secretOk && hasSecret} title={`Add this webhook in ${name}`}>
          <p className="text-[13.5px] leading-relaxed text-text-2">{g.webhookHow}</p>
          {g.events.length > 0 && (
            <ul aria-label="Events to tick" className="mt-2 flex flex-wrap gap-1.5">
              {g.events.map((e) => (
                <li
                  key={e}
                  translate="no"
                  className="rounded-full border border-line bg-inset px-2 py-0.5 font-mono text-[12.5px] text-text-2"
                >
                  {e}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-col gap-2.5 rounded-control border border-line-strong bg-inset p-3">
            <code
              translate="no"
              className="font-mono text-[13.5px] leading-relaxed break-all text-text"
            >
              {webhook}
            </code>
            <div className="flex flex-wrap gap-2">
              <CopyButton text={webhook} label={`Copy ${name} webhook address`} what="Address" />
              <a {...externalLink(g.webhookUrl)} className={linkButton}>
                {g.webhookLabel} <ArrowSquareOut size={14} aria-hidden="true" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </div>
          </div>
        </Step>
        <Step n={3} done={secretOk} title={`Paste the ${g.secretLabel.toLowerCase()}`} last>
          {showSecretInput ? (
            <Field label={g.secretLabel} hint={g.secretHint} error={fieldError('secret')}>
              {(p) => (
                <div className="flex gap-2">
                  <Input
                    {...p}
                    ref={secretRef}
                    name="secret"
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={g.secretPlaceholder}
                    value={d.secret}
                    onChange={(e) => set({ secret: e.target.value })}
                  />
                  {hasSecret && (
                    <Button variant="ghost" onClick={() => set({ replacing: false, secret: '' })}>
                      Keep saved
                    </Button>
                  )}
                </div>
              )}
            </Field>
          ) : (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-3 rounded-control border border-line bg-inset py-1.5 pr-1.5 pl-3">
                <span className="inline-flex items-center gap-2 text-[13.5px] font-semibold text-text">
                  <Lock size={14} aria-hidden="true" className="text-ok" />
                  {g.secretLabel} saved
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    set({ replacing: true })
                    requestAnimationFrame(() => secretRef.current?.focus())
                  }}
                >
                  Replace
                </Button>
              </div>
              {fieldError('secret') && (
                <p role="alert" className="text-[13px] font-medium text-danger">
                  {fieldError('secret')}
                </p>
              )}
            </div>
          )}
        </Step>
      </ol>

      <details ref={advancedRef} className="group mt-4 rounded-control border border-line">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-control px-3 py-2.5 text-[13.5px] font-semibold text-text-2 hover:text-text focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none [&::-webkit-details-marker]:hidden">
          More options
          <CaretDown
            size={14}
            aria-hidden="true"
            className="transition-transform duration-200 group-open:rotate-180"
          />
        </summary>
        <div className="flex flex-col gap-4 border-t border-line px-3 pt-3 pb-3.5">
          {supportsId && (
            <Field
              label="Only payments from this link"
              optional
              error={fieldError('page_id')}
              hint={`Starts with plink_. Only payments through this ${name} link alert, not merch.`}
            >
              {(p) => (
                <Input
                  {...p}
                  ref={idRef}
                  name="page_id"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="plink_…"
                  value={d.page_id}
                  onChange={(e) => set({ page_id: e.target.value })}
                />
              )}
            </Field>
          )}
          <Switch
            checked={d.test_mode}
            onChange={(test_mode) => set({ test_mode })}
            label="Accept test payments"
            description={g.testHint}
          />
        </div>
      </details>

      {error && !serverField && (
        <div className="mt-4">
          <ErrorNote problem={error} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        {state ? (
          <Button variant="danger-ghost" size="sm" onClick={() => setConfirmOff(true)}>
            Turn off {name}
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" variant="primary" busy={busy === 'save'} disabled={!dirty}>
          {state ? 'Save changes' : `Turn on ${name}`}
        </Button>
      </div>

      <Dialog
        open={confirmOff}
        onClose={() => setConfirmOff(false)}
        size="sm"
        title={`Turn off ${name} tips?`}
        description={`The ${name} button leaves your page and its secret is deleted. Your ${name} page isn’t touched.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOff(false)}>
              Cancel
            </Button>
            <Button variant="danger" busy={busy === 'off'} onClick={() => void turnOff()}>
              Turn off
            </Button>
          </>
        }
      />
    </form>
  )
}

/** The relay's public page, updating as the streamer types (and with Pro, their branding). */
function Preview({
  saved,
  page,
  brand,
  colours,
  goal,
}: {
  saved: TipSettings
  page: PageDraft
  brand: TipBrand | null
  colours: TipColours | null
  goal: TipGoal | null
}) {
  const buttons = TIP_PROVIDER_KEYS.filter((k) => saved[k]).map((k) => ({
    label: GUIDES[k].button,
    hint: TIP_PROVIDER_NAMES[k],
  }))
  return (
    <Panel title="What viewers see" as="div">
      <figure className="m-0">
        <TipPreview
          name={page.display_name.trim() || 'Your name'}
          message={page.message.trim()}
          buttons={buttons}
          palette={tipPalette(colours)}
          avatarUrl={brand?.avatar_url ?? null}
          bannerUrl={brand?.banner_url ?? null}
          goal={
            goal
              ? {
                  title: goal.title,
                  raised: formatMoney({ minor: goal.raised, currency: goal.currency }),
                  target: formatMoney({ minor: goal.target, currency: goal.currency }),
                  pct: goalPct(goal),
                }
              : null
          }
        />
        <figcaption className="mt-2 text-[13.5px] text-text-2">
          {brand
            ? 'Your public page, in your colours.'
            : 'Your public page. No ads, trackers or branding.'}
        </figcaption>
      </figure>
    </Panel>
  )
}

function Safety() {
  const items = [
    [
      EyeSlash,
      'Your legal name stays off the page',
      'A provider’s checkout may show its account name.',
    ],
    [Lock, 'No card or bank details', 'Ferrocast never sees them and holds no money.'],
    [
      ShieldCheck,
      'Every payment is verified',
      'Only name, amount and message are kept. Only refunds and disputes undo a tip.',
    ],
  ] as const
  return (
    <Panel title="Why it’s safe" as="div">
      <ul className="flex flex-col gap-3">
        {items.map(([Icon, title, text]) => (
          <li key={title} className="flex gap-3">
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-text">
              <Icon size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text">{title}</p>
              <p className="mt-0.5 text-[13.5px] leading-snug text-text-2">{text}</p>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
