// Pro: the tip page on the streamer's own subdomain (API.md §9.2, "Your own address").
// One field, then the two DNS records to add with copy buttons (the CNAME, and the TXT record
// that proves the address is yours), then the status (Pending → Verifying certificate → Live)
// with "Check again". While pending or verifying it asks again every 15 s, but only while the
// tab is open and the panel is on screen. The relay talks to Cloudflare; this only shows what
// it says, in plain words.

import { useEffect, useRef, useState } from 'react'
import { ArrowSquareOut, Check, CopySimple, Warning } from '@phosphor-icons/react'
import {
  ApiError,
  TIP_DOMAIN_LIMITS,
  describeError,
  relativeTime,
  tipDomainApi,
  tipDomainClaimProof,
  tipDomainProblem,
  tipDomainStep,
  type TipDomain,
  type TipDomainClaimProof,
  type TipDomainStatus,
} from '@ferrocast/api'
import { Badge, Button, Dialog, Field, Input, copyText, cx, toast, useFlash } from '@ferrocast/ui'
import { useClient, useNow } from '../../lib/hooks'
import { externalLink } from '../../lib/external'

type Problem = { message: string; hint?: string | null }

const STEPS: { key: TipDomainStatus; label: string }[] = [
  { key: 'pending', label: 'DNS records' },
  { key: 'verifying', label: 'Certificate' },
  { key: 'live', label: 'Live' },
]

const order = (s: TipDomainStatus) => (s === 'live' ? 2 : s === 'verifying' ? 1 : 0)

export function OwnAddress({
  domain,
  hasPage,
  onChange,
}: {
  domain: TipDomain | null
  /** A tip page exists (the address shows it). */
  hasPage: boolean
  onChange: (d: TipDomain | null) => void
}) {
  const client = useClient()
  const [typed, setTyped] = useState('')
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState<'add' | 'check' | 'rm' | null>(null)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [confirm, setConfirm] = useState(false)
  /** Cloudflare already has the typed address: the TXT record that would prove it's yours. */
  const [claim, setClaim] = useState<TipDomainClaimProof | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const waiting = domain?.status === 'pending' || domain?.status === 'verifying'

  // Ask again every 15 s while it's on its way, only with the tab open and the panel on screen.
  useEffect(() => {
    if (!waiting) return
    let alive = true
    let onScreen = true
    const io =
      typeof IntersectionObserver === 'function' && root.current
        ? new IntersectionObserver(([e]) => {
            onScreen = e?.isIntersecting ?? true
          })
        : null
    if (io && root.current) io.observe(root.current)
    const id = window.setInterval(() => {
      if (document.visibilityState !== 'visible' || !onScreen) return
      tipDomainApi(client)
        .get()
        .then(
          (d) => {
            if (alive) onChange(d)
          },
          (e: unknown) => {
            // Removed meanwhile (expired, or taken over): back to the empty form. Anything
            // else waits for the next round or "Check again".
            if (alive && e instanceof ApiError && e.status === 404) onChange(null)
          },
        )
    }, TIP_DOMAIN_LIMITS.pollSeconds * 1000)
    return () => {
      alive = false
      window.clearInterval(id)
      io?.disconnect()
    }
  }, [waiting, client, onChange])

  const run = async (what: 'add' | 'check' | 'rm', fn: () => Promise<void>) => {
    setBusy(what)
    setProblem(null)
    if (what === 'add') setClaim(null)
    try {
      await fn()
    } catch (e) {
      const p = describeError(e)
      setProblem({ message: p.message, hint: p.hint })
      if (what === 'add') setClaim(tipDomainClaimProof(e))
      if (what === 'check' && e instanceof ApiError && e.status === 404) onChange(null)
    } finally {
      setBusy(null)
    }
  }

  if (!hasPage)
    return (
      <p className="text-[15px] text-text-2">Create your tip page first. Your address shows it.</p>
    )

  if (!domain) {
    const local = tipDomainProblem(typed)
    const add = () => {
      setTried(true)
      if (local) return
      void run('add', async () => {
        const d = await tipDomainApi(client).save(typed)
        onChange(d)
        setTyped('')
        setTried(false)
        toast({ tone: 'ok', message: 'Address added. Now add the two DNS records.' })
      })
    }
    return (
      <form
        noValidate
        aria-label="Your own address"
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <p className="text-[15px] leading-snug text-text-2">
          Show your tip page on a subdomain you own, like{' '}
          <span translate="no" className="font-mono text-text">
            tips.yourchannel.com
          </span>
          .
        </p>
        <Field
          label="Your address"
          error={tried ? local : null}
          hint="A subdomain, not your main domain."
        >
          {(p) => (
            <Input
              {...p}
              name="tip_domain"
              value={typed}
              inputMode="url"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="tips.yourchannel.com…"
              className="font-mono"
              onChange={(e) => {
                setTyped(e.target.value)
                setClaim(null)
              }}
            />
          )}
        </Field>
        {problem && <Note problem={problem} />}
        {claim && <ClaimProof proof={claim} />}
        <div className="flex justify-end">
          <Button type="submit" variant="primary" busy={busy === 'add'}>
            {claim ? 'Try again' : 'Add address'}
          </Button>
        </div>
      </form>
    )
  }

  const step = tipDomainStep(domain)
  const live = domain.status === 'live'
  const stopped = domain.status === 'failed' || domain.status === 'proof_missing'
  const dns = domain.dns[0]
  const proof = domain.proof
  const shown = domain.hostname_unicode || domain.hostname
  return (
    <div ref={root} className="flex flex-col gap-5" data-testid="own-address">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <p translate="no" className="min-w-0 font-mono text-[18px] font-bold break-all text-text">
            {shown}
          </p>
          <Badge tone={live ? 'ok' : stopped ? 'danger' : 'warn'}>{step.label}</Badge>
        </div>
        {shown !== domain.hostname && (
          <p className="text-[13px] leading-snug text-text-3">
            In DNS it’s written{' '}
            <span translate="no" className="font-mono break-all">
              {domain.hostname}
            </span>
          </p>
        )}
        {!stopped && <Stepper status={domain.status} />}
        <p className="text-[15px] leading-snug text-text-2" role="status">
          {step.line}
        </p>
        {domain.delete_at && (
          <p className="text-[14px] leading-snug text-warn">
            Pro ended. This address stops on {new Date(domain.delete_at).toLocaleDateString()}.
          </p>
        )}
        {!live && domain.expires_at && !domain.delete_at && (
          <p className="text-[13.5px] leading-snug text-text-2">
            If it isn’t live by {new Date(domain.expires_at).toLocaleDateString()}, it’s removed and
            the address is free again.
          </p>
        )}
      </div>

      {live && <Live domain={domain} />}

      {!live && dns && (
        <div className="flex flex-col gap-3">
          <p className="text-[15px] font-semibold text-text">
            Add both records where you manage your domain
          </p>
          <section aria-label="Record 1 of 2: CNAME" className="flex flex-col gap-2">
            <p className="text-[13.5px] font-semibold text-text-2">1. Point the address here</p>
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.7fr)]">
              <Cell label="Type" value={dns.type} />
              <Cell label="Name" value={dns.host || dns.name} copy="Name" />
              <Cell label="Target" value={dns.target} copy="Target" />
            </dl>
            <p className="text-[13.5px] leading-snug text-text-2">
              Some providers want the full name,{' '}
              <span translate="no" className="font-mono break-all">
                {dns.name}
              </span>
              . On Cloudflare DNS, set it to DNS only.
            </p>
          </section>
          <ProofRecord proof={proof} />
          {domain.verification.length > 0 && (
            <details className="group rounded-[12px] border border-line bg-surface-2 px-3.5 py-2.5">
              <summary className="cursor-pointer text-[14px] font-semibold text-text marker:text-text-3">
                Optional: Cloudflare’s TXT record for a faster check
              </summary>
              <dl className="mt-3 flex flex-col gap-2">
                {domain.verification.map((r, i) => (
                  <div
                    key={`${i}-${r.name}-${r.value}`}
                    className="grid grid-cols-1 gap-2 sm:grid-cols-2"
                  >
                    <Cell label="TXT name" value={r.name} copy="Cloudflare TXT name" />
                    <Cell label="TXT value" value={r.value} copy="Cloudflare TXT value" />
                  </div>
                ))}
              </dl>
            </details>
          )}
          {domain.errors.length > 0 && (
            <div className="text-[13.5px] leading-snug text-text-2">
              <p className="font-semibold text-text">Still missing</p>
              <ul className="mt-1 list-disc pl-5">
                {domain.errors.map((e, i) => (
                  <li key={`${i}-${e}`} className="break-words">
                    {e}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {problem && <Note problem={problem} />}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <Button variant="danger-ghost" size="sm" onClick={() => setConfirm(true)}>
          Remove address
        </Button>
        <div className="flex items-center gap-3">
          <Checked at={domain.checked_at} />
          <Button
            size="sm"
            busy={busy === 'check'}
            onClick={() =>
              void run('check', async () => {
                onChange(await tipDomainApi(client).get())
              })
            }
          >
            Check again
          </Button>
        </div>
      </div>

      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        size="sm"
        title="Remove your own address?"
        description={`${domain.hostname} stops showing your tip page. Your usual tip link keeps working.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              busy={busy === 'rm'}
              onClick={() =>
                void run('rm', async () => {
                  await tipDomainApi(client).remove()
                  setConfirm(false)
                  onChange(null)
                  toast({ tone: 'ok', message: 'Address removed.' })
                }).then(() => setConfirm(false))
              }
            >
              Remove
            </Button>
          </>
        }
      />
    </div>
  )
}

function Stepper({ status }: { status: TipDomainStatus }) {
  const at = order(status)
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label="Progress">
      {STEPS.map((s, i) => {
        const done = i < at || status === 'live'
        const now = i === at && status !== 'live'
        return (
          <li
            key={s.key}
            aria-current={now ? 'step' : undefined}
            className="flex min-w-0 flex-col gap-1.5"
          >
            <span
              className={cx(
                'h-1.5 rounded-full',
                done ? 'bg-ok' : now ? 'bg-accent' : 'bg-surface-3',
              )}
            />
            <span
              className={cx(
                'truncate text-[13px] font-semibold',
                done || now ? 'text-text' : 'text-text-3',
              )}
            >
              {s.label}
              <span className="sr-only">
                {done ? ', done' : now ? ', current step' : ', not yet'}
              </span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function Checked({ at }: { at: number }) {
  const now = useNow(15_000)
  if (!at) return null
  const ago = relativeTime(at, now)
  return (
    <span className="text-[13px] whitespace-nowrap text-text-3">
      {ago === 'now' ? 'Checked just now' : `Checked ${ago} ago`}
    </span>
  )
}

function Live({ domain }: { domain: TipDomain }) {
  return (
    <div className="rounded-[12px] border border-accent-line bg-accent-soft p-3.5">
      <p className="flex items-center gap-2 text-[14px] font-semibold text-text">
        <Check size={14} weight="bold" className="text-ok" aria-hidden="true" />
        Your tip page is on your own address
      </p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
        <code translate="no" className="min-w-0 flex-1 font-mono text-[14px] break-all text-text-2">
          {domain.page_url}
        </code>
        <div className="flex gap-2">
          <CopyButton text={domain.page_url} what="Link" />
          <a
            {...externalLink(domain.page_url)}
            className="fc-press inline-flex h-8 shrink-0 items-center gap-1.5 rounded-control border border-line-strong bg-surface-3 px-3 text-[13.5px] font-semibold whitespace-nowrap text-text hover:border-text-3 focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
          >
            Open <ArrowSquareOut size={14} aria-hidden="true" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </div>
      </div>
      <p className="mt-2 text-[13.5px] text-text-2">
        The goal page is at{' '}
        <span translate="no" className="font-mono break-all">
          {domain.goal_url}
        </span>
        .
      </p>
      <p className="mt-2 text-[13.5px] text-text-2">
        Keep the TXT record{' '}
        <span translate="no" className="font-mono break-all">
          {domain.proof.name}
        </span>{' '}
        in place. Without it the address stops after a few hours.
      </p>
    </div>
  )
}

function ProofRecord({ proof }: { proof: TipDomain['proof'] }) {
  return (
    <section aria-label="Record 2 of 2: TXT, required" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="text-[13.5px] font-semibold text-text-2">2. Prove it’s yours</p>
        {proof.found ? <Badge tone="ok">Found</Badge> : <Badge tone="warn">Required</Badge>}
      </div>
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.7fr)]">
        <Cell label="Type" value={proof.type} />
        <Cell label="Name" value={proof.host} copy="TXT name" />
        <Cell label="Value" value={proof.value} copy="TXT value" />
      </dl>
      <p className="text-[13.5px] leading-snug text-text-2">
        Full name{' '}
        <span translate="no" className="font-mono break-all">
          {proof.name}
        </span>
        . Only your Ferrocast makes this value, so nobody else can claim your address. Leave it in
        place after it works.
      </p>
    </section>
  )
}

function ClaimProof({ proof }: { proof: TipDomainClaimProof }) {
  return (
    <section aria-label="TXT record to prove it’s yours" className="flex flex-col gap-2">
      <p className="text-[14px] font-semibold text-text">Prove it’s yours with this TXT record</p>
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.7fr)]">
        <Cell label="Type" value={proof.type} />
        <Cell label="Name" value={proof.host} copy="TXT name" />
        <Cell label="Value" value={proof.value} copy="TXT value" />
      </dl>
      <p className="text-[13.5px] leading-snug text-text-2">
        Full name{' '}
        <span translate="no" className="font-mono break-all">
          {proof.name}
        </span>
        . Once it’s added, wait a few minutes and press Try again.
      </p>
    </section>
  )
}

function Cell({ label, value, copy }: { label: string; value: string; copy?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-[12px] border border-line bg-surface-2 px-3 py-2.5">
      <dt className="text-[12.5px] font-semibold text-text-3">{label}</dt>
      <dd className="flex min-w-0 items-center justify-between gap-2">
        <code
          translate="no"
          className="min-w-0 font-mono text-[15px] font-semibold break-all text-text"
        >
          {value}
        </code>
        {copy && <CopyButton text={value} what={copy} />}
      </dd>
    </div>
  )
}

/** "Name" → "name", but "TXT name" stays as it is. */
const lowerFirst = (w: string) =>
  /^[A-Z][a-z]/.test(w) ? w.charAt(0).toLowerCase() + w.slice(1) : w

function CopyButton({ text, what }: { text: string; what: string }) {
  const [copied, flash] = useFlash()
  return (
    <Button
      size="sm"
      aria-label={copied ? `${what} copied` : `Copy ${lowerFirst(what)}`}
      icon={copied ? <Check size={15} weight="bold" /> : <CopySimple size={15} />}
      onClick={() =>
        void copyText(text).then((ok) =>
          ok
            ? flash()
            : toast({
                tone: 'error',
                message: `Couldn’t copy the ${lowerFirst(what)}.`,
                hint: 'Select it and copy it by hand.',
              }),
        )
      }
    >
      {copied ? 'Copied' : 'Copy'}
    </Button>
  )
}

function Note({ problem }: { problem: Problem }) {
  return (
    <div
      role="alert"
      className="flex gap-2.5 rounded-control border border-danger/30 bg-danger-soft px-3 py-2.5"
    >
      <Warning size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
      <div className="min-w-0 text-[14px] leading-snug">
        <p className="font-semibold text-text">{problem.message}</p>
        {problem.hint && <p className="mt-0.5 text-text-2">{problem.hint}</p>}
      </div>
    </div>
  )
}
