// `#/history` › Weekly email (Pro, API.md §9.8). A short stream report once a week, sent by
// Ferrocast's servers from the stored history. Double opt-in: Save sends a confirm email,
// the card waits on "Check your inbox" (looking again quietly) until the link's button is
// pressed. A confirmed address keeps getting the report while a new one waits. The relay keeps
// the addresses sealed; this card only ever shows hints (or "your address" when the relay
// couldn't read one). The day and time are shown in the viewer's own time zone. Hidden unless
// this relay has the feature (the history screen's ProPanel decides Pro); a paired phone
// never gets here (it can't read Pro's status).

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CheckCircle, EnvelopeSimple, WarningCircle } from '@phosphor-icons/react'
import {
  describeError,
  looksLikeEmail,
  reportSchedule,
  weeklyEmailApi,
  type WeeklyEmailView,
} from '@ferrocast/api'
import { Button, Field, Input, Skeleton, toast } from '@ferrocast/ui'
import { LoadError } from '../Panel'
import { useClient, useResource } from '../../lib/hooks'

type Problem = { message: string; hint: string | null }

function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function shortTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function Heading({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-1 shrink-0 text-accent-text" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="font-display text-xl font-bold tracking-[-0.02em] text-text sm:text-2xl">
          {title}
        </p>
        {children ? (
          <div className="mt-1 text-[15px] leading-relaxed text-text-2">{children}</div>
        ) : null}
      </div>
    </div>
  )
}

/** An address hint, or "your address" when the relay couldn't read it. */
function Hint({ hint }: { hint: string | null }) {
  if (!hint) return <>your address</>
  return <span className="font-semibold text-text break-all">{hint}</span>
}

/** Why it's paused, in words. */
function pausedText(v: WeeklyEmailView): { line: React.ReactNode; next: string } {
  if (v.paused_reason === 'unreadable')
    return {
      line: <>Ferrocast couldn’t read the saved address, so nothing is being sent.</>,
      next: 'Save your address again to start the emails.',
    }
  if (v.paused_reason === 'rejected')
    return {
      line: (
        <>
          The mail server for <Hint hint={v.address_hint} /> refused our email.
        </>
      ),
      next: 'Check the address, or use another one.',
    }
  return {
    line: (
      <>
        Emails to <Hint hint={v.address_hint} /> are paused.
      </>
    ),
    next: 'Use another address to start them again.',
  }
}

/** The address form: Save (or Send again) sends a confirm email. */
function AddressForm({
  busy,
  problem,
  onSave,
  onCancel,
  label,
}: {
  busy: boolean
  problem: Problem | null
  onSave: (address: string) => void
  onCancel?: () => void
  label: string
}) {
  const [value, setValue] = useState('')
  const [typo, setTypo] = useState<string | null>(null)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!looksLikeEmail(value)) {
      setTypo('That email address doesn’t look right. Check it for typos.')
      return
    }
    setTypo(null)
    onSave(value.trim())
  }
  const error = typo ?? (problem ? [problem.message, problem.hint].filter(Boolean).join(' ') : null)
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3 sm:max-w-[520px]">
      <Field label="Email address" error={error}>
        {(p) => (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              {...p}
              type="email"
              name="email"
              inputMode="email"
              autoComplete="email"
              spellCheck={false}
              placeholder="you@example.com…"
              value={value}
              onChange={(e) => {
                setValue(e.target.value)
                if (typo) setTypo(null)
              }}
              className="min-w-0 flex-1 sm:h-11"
            />
            <Button type="submit" variant="primary" size="lg" busy={busy} className="sm:h-11">
              {label}
            </Button>
          </div>
        )}
      </Field>
      {onCancel ? (
        <div>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Keep the current address
          </Button>
        </div>
      ) : null}
    </form>
  )
}

export function WeeklyEmail() {
  const client = useClient()
  const res = useResource((c) => weeklyEmailApi(c).get())
  const [busy, setBusy] = useState<'save' | 'resend' | 'stop' | null>(null)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [editing, setEditing] = useState(false)
  // The address typed this session, so Resend needs no retyping (the relay only gives a hint).
  const typed = useRef<string | null>(null)
  const v = res.data
  const now = Date.now()
  const when = v ? reportSchedule(v, now) : null
  const linkExpired = !!v?.expires_at && v.expires_at <= now

  // While a confirm is pending, look again quietly so the card turns on by itself.
  // Also while a new address waits next to a confirmed one.
  const pending = v?.status === 'pending' || !!v?.pending_hint
  const setView = res.set
  useEffect(() => {
    if (!pending) return
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      weeklyEmailApi(client)
        .get()
        .then((next) => {
          if (next.status !== 'pending' && !next.pending_hint) setView(next)
        })
        .catch(() => {})
    }, 10_000)
    return () => clearInterval(t)
  }, [pending, client, setView])

  const save = async (address: string, kind: 'save' | 'resend') => {
    setBusy(kind)
    setProblem(null)
    try {
      const next = await weeklyEmailApi(client).save(address)
      typed.current = address
      res.set(next)
      setEditing(false)
      if (kind === 'resend') toast({ tone: 'ok', message: 'Sent again. Check your inbox.' })
    } catch (e) {
      setProblem(describeError(e))
    } finally {
      setBusy(null)
    }
  }

  const stop = async () => {
    setBusy('stop')
    setProblem(null)
    try {
      await weeklyEmailApi(client).stop()
      typed.current = null
      res.set((prev) => ({
        ...(prev as WeeklyEmailView),
        status: 'none',
        address_hint: null,
        pending_hint: null,
        expires_at: null,
        next_at: null,
        paused_reason: null,
      }))
      toast({ tone: 'ok', message: 'Weekly emails stopped. The address is deleted.' })
    } catch (e) {
      setProblem(describeError(e))
    } finally {
      setBusy(null)
    }
  }

  let body: React.ReactNode
  if (res.error && !v) {
    body = <LoadError error={res.error} onRetry={res.reload} />
  } else if (!v) {
    body = <Skeleton className="h-28" />
  } else if (v.status === 'none' || editing) {
    body = (
      <div className="flex flex-col gap-4">
        <Heading icon={<EnvelopeSimple size={24} weight="bold" />} title="Your week, in your inbox">
          <p>
            A short stream report every {when?.weekday ?? v.day}
            {when ? ` around ${when.time}` : ''}.
          </p>
        </Heading>
        <AddressForm
          busy={busy === 'save'}
          problem={problem}
          label={v.status === 'none' ? 'Save' : 'Send link'}
          onSave={(a) => void save(a, 'save')}
          {...(editing
            ? {
                onCancel: () => {
                  setEditing(false)
                  setProblem(null)
                },
              }
            : {})}
        />
      </div>
    )
  } else if (v.status === 'pending') {
    body = (
      <div className="flex flex-col gap-4" data-testid="weekly-email-pending">
        <Heading icon={<EnvelopeSimple size={24} weight="bold" />} title="Check your inbox">
          <p>
            We sent a link to <Hint hint={v.address_hint} />. Open it and press Confirm.
          </p>
          {v.expires_at ? (
            <p className="text-[13.5px] text-text-3">
              {linkExpired
                ? 'That link has expired. Send it again for a new one.'
                : `Works until ${shortDate(v.expires_at)}, ${shortTime(v.expires_at)}. Not there? Look in spam.`}
            </p>
          ) : null}
        </Heading>
        <InlineProblem problem={problem} />
        <div className="flex flex-wrap gap-2">
          {typed.current ? (
            <Button
              busy={busy === 'resend'}
              onClick={() => typed.current && void save(typed.current, 'resend')}
            >
              Resend
            </Button>
          ) : null}
          <Button
            variant="ghost"
            onClick={() => {
              setEditing(true)
              setProblem(null)
            }}
          >
            {typed.current ? 'Change address' : 'Send again'}
          </Button>
        </div>
      </div>
    )
  } else if (v.status === 'paused') {
    body = (
      <div className="flex flex-col gap-4" data-testid="weekly-email-paused">
        <Heading
          icon={<WarningCircle size={24} weight="bold" className="text-warn" />}
          title="Emails paused"
        >
          <p>{pausedText(v).line}</p>
          <p className="text-[13.5px] text-text-3">{pausedText(v).next}</p>
        </Heading>
        <InlineProblem problem={problem} />
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => setEditing(true)}>
            {v.paused_reason === 'unreadable' ? 'Save your address again' : 'Use another address'}
          </Button>
          <Button variant="danger-ghost" busy={busy === 'stop'} onClick={() => void stop()}>
            Stop emails
          </Button>
        </div>
      </div>
    )
  } else {
    body = (
      <div className="flex flex-col gap-4" data-testid="weekly-email-on">
        <Heading icon={<CheckCircle size={24} weight="bold" />} title="Weekly email is on">
          <p>
            Every {when?.weekday ?? v.day} to <Hint hint={v.address_hint} />.
          </p>
          {v.next_at ? (
            <p className="text-[13.5px] text-text-3">
              {v.next_at <= now
                ? 'This week’s is on its way.'
                : `Next one ${shortDate(v.next_at)}, ${shortTime(v.next_at)}.`}{' '}
              Weeks without a stream are skipped.
            </p>
          ) : null}
        </Heading>
        {v.pending_hint ? (
          <div
            className="rounded-panel border border-line p-3 text-[14px] leading-relaxed text-text-2 sm:max-w-[520px]"
            data-testid="weekly-email-waiting"
          >
            <p>
              Waiting for <Hint hint={v.pending_hint} /> to be confirmed.{' '}
              {linkExpired
                ? 'Its link has expired.'
                : 'Open the link we sent there and press Confirm.'}
            </p>
            <p className="text-[13px] text-text-3">
              Until then, reports keep going to <Hint hint={v.address_hint} />.
            </p>
            {typed.current ? (
              <Button
                size="sm"
                className="mt-2"
                busy={busy === 'resend'}
                onClick={() => typed.current && void save(typed.current, 'resend')}
              >
                Resend
              </Button>
            ) : null}
          </div>
        ) : null}
        <InlineProblem problem={problem} />
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              setEditing(true)
              setProblem(null)
            }}
          >
            Change address
          </Button>
          <Button variant="danger-ghost" busy={busy === 'stop'} onClick={() => void stop()}>
            Stop emails
          </Button>
        </div>
      </div>
    )
  }

  return (
    <section
      className="flex min-w-0 flex-col gap-4 border-t border-line pt-5"
      aria-label="Weekly email"
      id="weekly-email"
    >
      <h3 className="font-display text-[15px] font-bold tracking-tight text-text">Weekly email</h3>
      {body}
    </section>
  )
}

function InlineProblem({ problem }: { problem: Problem | null }) {
  if (!problem) return null
  return (
    <div
      role="alert"
      className="rounded-panel border border-danger/30 bg-danger-soft p-3 sm:max-w-[520px]"
    >
      <p className="text-sm font-semibold text-text">{problem.message}</p>
      {problem.hint ? <p className="mt-0.5 text-[13px] text-text-2">{problem.hint}</p> : null}
    </div>
  )
}
