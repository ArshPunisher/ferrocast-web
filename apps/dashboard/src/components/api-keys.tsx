import { useState } from 'react'
import { CheckCircle, Copy, Key, Plus, ShieldWarning, Trash } from '@phosphor-icons/react'
import {
  API_KEY_LIMITS,
  API_KEY_SCOPES,
  describeError,
  relativeTime,
  type ApiKeyCreated,
  type ApiKeyScope,
  type ApiKeySummary,
  type ApiKeysView,
} from '@ferrocast/api'
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  Field,
  Input,
  Select,
  Skeleton,
  copyText,
  toast,
} from '@ferrocast/ui'
import { LoadError } from './Panel'
import { Group } from './settings-kit'
import { done, useAction, useClient, useNow, useResource } from '../lib/hooks'

type ExpiryOption = 'never' | '7d' | '30d' | '90d' | '1y'

const EXPIRY_MS: Record<Exclude<ExpiryOption, 'never'>, number> = {
  '7d': 7 * 86_400_000,
  '30d': 30 * 86_400_000,
  '90d': 90 * 86_400_000,
  '1y': 365 * 86_400_000,
}

const SCOPE_LABEL: Record<ApiKeyScope, string> = Object.fromEntries(
  API_KEY_SCOPES.map((s) => [s.id, s.label]),
) as Record<ApiKeyScope, string>

function keyStatus(
  k: ApiKeySummary,
  now: number,
): { label: string; tone: 'ok' | 'warn' | 'neutral' } {
  if (k.revoked_at !== null) return { label: 'Revoked', tone: 'neutral' }
  if (k.expires_at !== null && k.expires_at <= now) return { label: 'Expired', tone: 'warn' }
  return { label: 'Active', tone: 'ok' }
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function ApiKeysSection() {
  const client = useClient()
  const res = useResource<ApiKeysView>((c) => c.apiKeys())
  const now = useNow(30_000)
  const { run, busy } = useAction()
  const [creating, setCreating] = useState(false)
  const [revoking, setRevoking] = useState<ApiKeySummary | null>(null)
  const [auditShown, setAuditShown] = useState(5)

  const v = res.data
  // Revoked and expired keys don't count toward the limit (the engine doesn't count them).
  const activeCount =
    v?.keys.filter((k) => k.revoked_at === null && (k.expires_at === null || k.expires_at > now))
      .length ?? 0

  const handleRevoke = async () => {
    if (!revoking) return
    const target = revoking
    const ok = await run(`revoke-${target.id}`, () => done(client.revokeApiKey(target.id)), {
      once: true,
      success: `${target.name} revoked.`,
    })
    if (!ok) return
    setRevoking(null)
    res.reload()
  }

  return (
    <div id="api-keys" className="scroll-mt-20">
      <Group
        title="Local API keys"
        note="Scoped keys for local scripts, Stream Decks, and automations talking to this PC. Keys never reach accounts, secrets, diagnostics exports, plugins, or other keys."
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-[14px] text-text-3">
              <span>
                {activeCount} of {API_KEY_LIMITS.maxActiveKeys} active keys
              </span>
              <span aria-hidden="true">·</span>
              <span>{API_KEY_LIMITS.rateLimitPerMin} req/min limit</span>
            </div>
            <Button
              variant="primary"
              size="md"
              icon={<Plus size={18} weight="bold" />}
              onClick={() => setCreating(true)}
              disabled={!v || activeCount >= API_KEY_LIMITS.maxActiveKeys}
              className="w-full sm:w-auto"
            >
              Create API key
            </Button>
          </div>

          {res.error && !v ? (
            <LoadError error={res.error} onRetry={res.reload} />
          ) : !v ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
          ) : v.keys.length === 0 ? (
            <EmptyState compact title="No API keys yet">
              Create a key with only the scopes your local script needs.
            </EmptyState>
          ) : (
            <ul className="flex flex-col gap-2.5" aria-label="Local API keys">
              {v.keys.map((k) => {
                const status = keyStatus(k, now)
                return (
                  <li
                    key={k.id}
                    className="flex flex-col gap-2.5 rounded-control border border-line bg-surface-2 px-3.5 py-3 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Key size={18} className="shrink-0 text-text-3" aria-hidden="true" />
                        <span className="truncate text-[16px] font-semibold text-text">
                          {k.name}
                        </span>
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </div>
                      <p className="mt-1 font-mono text-[13px] text-text-2 break-all">{k.prefix}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {k.scopes.map((s) => (
                          <Badge key={s} tone="neutral">
                            {SCOPE_LABEL[s] ?? s}
                          </Badge>
                        ))}
                      </div>
                      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[13.5px] text-text-3">
                        <span>Created {formatDate(k.created_at)}</span>
                        <span>
                          {k.expires_at === null
                            ? 'Never expires'
                            : k.expires_at <= now
                              ? `Expired ${formatDate(k.expires_at)}`
                              : `Expires ${formatDate(k.expires_at)}`}
                        </span>
                        <span>
                          {k.last_used_at === null
                            ? 'Never used'
                            : now - k.last_used_at < 60_000
                              ? 'Used just now'
                              : `Used ${relativeTime(k.last_used_at, now)} ago`}
                        </span>
                      </p>
                    </div>
                    {k.revoked_at === null && (
                      <div className="flex shrink-0 items-center sm:pt-0.5">
                        <Button
                          variant="danger-ghost"
                          size="sm"
                          icon={<Trash size={16} />}
                          onClick={() => setRevoking(k)}
                          disabled={busy === `revoke-${k.id}`}
                          aria-label={`Revoke ${k.name}`}
                          className="w-full sm:w-auto"
                        >
                          Revoke
                        </Button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {v && v.audit.length > 0 && (
            <div className="border-t border-line pt-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h4 className="font-display text-[15px] font-bold text-text">
                  Recent API key activity
                </h4>
                {v.audit.length > 5 && (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() =>
                      setAuditShown((n) =>
                        n >= v.audit.length ? 5 : Math.min(n + 20, v.audit.length),
                      )
                    }
                  >
                    {auditShown >= v.audit.length
                      ? 'Show less'
                      : `Show more (${auditShown} of ${v.audit.length})`}
                  </Button>
                )}
              </div>
              <ul className="flex flex-col gap-1.5" aria-label="Recent API key activity">
                {v.audit.slice(0, auditShown).map((entry) => (
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-[8px] border border-line/70 bg-surface-1 px-3 py-2 text-[14px]"
                  >
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <Badge tone={entry.status >= 400 ? 'warn' : 'ok'}>{entry.status}</Badge>
                      <span className="font-mono text-[13px] font-semibold text-text">
                        {entry.method} {entry.path}
                      </span>
                    </div>
                    <span className="text-[13.5px] text-text-3">
                      {entry.key_name} ·{' '}
                      {now - entry.at < 60_000 ? 'just now' : `${relativeTime(entry.at, now)} ago`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Group>

      {creating && (
        <CreateApiKeyDialog
          onClose={() => setCreating(false)}
          onCreated={() => {
            res.reload()
          }}
        />
      )}

      <Dialog
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        size="sm"
        title={revoking ? `Revoke ${revoking.name}?` : 'Revoke key?'}
        description="Any script or Stream Deck action using this key will fail immediately with 401 Unauthorized. This cannot be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRevoking(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              busy={revoking ? busy === `revoke-${revoking.id}` : false}
              onClick={() => void handleRevoke()}
            >
              Revoke key
            </Button>
          </>
        }
      />
    </div>
  )
}

function CreateApiKeyDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const client = useClient()
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<Set<ApiKeyScope>>(() => new Set(['read_only']))
  const [expiry, setExpiry] = useState<ExpiryOption>('never')
  const [nameErr, setNameErr] = useState<string | null>(null)
  const [scopeErr, setScopeErr] = useState<string | null>(null)
  const [apiErr, setApiErr] = useState<{ message: string; hint: string | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<ApiKeyCreated | null>(null)
  // The secret is shown once: closing it by a click outside or Escape asks first, unless it was
  // copied (the Done button always closes).
  const [copied, setCopied] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)

  const toggleScope = (scope: ApiKeyScope) => {
    setScopeErr(null)
    setScopes((prev) => {
      const next = new Set(prev)
      if (next.has(scope)) next.delete(scope)
      else next.add(scope)
      return next
    })
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    let hasLocalErr = false
    if (!trimmed) {
      setNameErr('Give this key a clear name (for example, Stream Deck).')
      hasLocalErr = true
    } else if (Array.from(trimmed).length > API_KEY_LIMITS.maxNameLen) {
      setNameErr('Key name must be 60 characters or fewer.')
      hasLocalErr = true
    } else {
      setNameErr(null)
    }
    if (scopes.size === 0) {
      setScopeErr('Select at least one permission scope.')
      hasLocalErr = true
    } else {
      setScopeErr(null)
    }
    if (hasLocalErr) return

    setBusy(true)
    setApiErr(null)
    const expires_at = expiry === 'never' ? null : Date.now() + EXPIRY_MS[expiry]
    try {
      const result = await client.createApiKey({
        name: trimmed,
        scopes: Array.from(scopes),
        expires_at,
      })
      setCreated(result)
      onCreated()
    } catch (err) {
      setApiErr(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      onClose={created && !copied ? () => setConfirmClose(true) : onClose}
      size="md"
      title={created ? 'Save your new API key' : 'Create local API key'}
      description={
        created
          ? 'Copy this key now. Ferrocast only stores a SHA-256 hash and cannot show this secret again.'
          : 'Grant only the scopes your local integration needs.'
      }
      footer={
        created ? (
          confirmClose ? (
            <>
              <Button variant="secondary" onClick={() => setConfirmClose(false)}>
                Keep it open
              </Button>
              <Button variant="danger" onClick={onClose}>
                Close without copying
              </Button>
            </>
          ) : (
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          )
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form="create-api-key-form" variant="primary" busy={busy}>
              Create key
            </Button>
          </>
        )
      }
    >
      {created ? (
        <div className="flex flex-col gap-4" data-testid="api-key-once">
          <div className="flex items-start gap-2.5 rounded-control border border-accent-line bg-accent-soft px-3.5 py-3 text-[14.5px] text-text">
            <ShieldWarning
              size={20}
              weight="fill"
              className="mt-0.5 shrink-0 text-accent-text"
              aria-hidden="true"
            />
            <div>
              <p className="font-semibold">This secret is shown once.</p>
              {confirmClose && (
                <p role="alert" className="mt-0.5 font-semibold text-danger">
                  You haven’t copied it. Close now and it is gone for good.
                </p>
              )}
              <p className="mt-0.5 text-text-2">
                Pass it as <code className="font-mono">Authorization: Bearer ...</code> against{' '}
                <code className="font-mono">127.0.0.1</code>.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              readOnly
              value={created.token}
              aria-label="Generated API key secret"
              data-autofocus
              className="min-w-0 flex-1 font-mono text-[13.5px]"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              variant="secondary"
              icon={<Copy size={16} />}
              className="w-full sm:w-auto"
              onClick={() =>
                void copyText(created.token).then((ok) => {
                  if (ok) setCopied(true)
                  toast(
                    ok
                      ? { tone: 'ok', message: 'API key copied.' }
                      : {
                          tone: 'error',
                          message: 'Couldn’t copy. Select the key text and copy it.',
                        },
                  )
                })
              }
            >
              Copy key
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[14px] text-text-2">
            <CheckCircle size={16} weight="fill" className="text-ok" aria-hidden="true" />
            <span>{created.key.name}</span>
            <span aria-hidden="true">·</span>
            <span>{created.key.scopes.map((s) => SCOPE_LABEL[s] ?? s).join(', ')}</span>
          </div>
        </div>
      ) : (
        <form
          id="create-api-key-form"
          className="flex flex-col gap-4"
          onSubmit={(e) => void submit(e)}
        >
          <Field
            label="Key name"
            hint="Identify which script or controller uses this key."
            error={nameErr}
          >
            {(p) => (
              <Input
                {...p}
                data-autofocus
                placeholder="Stream Deck XL"
                maxLength={API_KEY_LIMITS.maxNameLen}
                value={name}
                onChange={(e) => {
                  setNameErr(null)
                  setName(e.target.value)
                }}
              />
            )}
          </Field>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-[14.5px] font-semibold text-text">Scopes</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {API_KEY_SCOPES.map((s) => {
                const checked = scopes.has(s.id)
                return (
                  <label
                    key={s.id}
                    className="flex cursor-pointer items-start gap-2.5 rounded-control border border-line bg-surface-2 px-3 py-2.5 text-left transition-colors hover:border-line-strong has-[:checked]:border-accent-line has-[:checked]:bg-accent-soft/45"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleScope(s.id)}
                      className="mt-1 size-4 shrink-0 accent-[var(--fc-accent)]"
                    />
                    <span className="min-w-0">
                      <span className="block text-[14.5px] font-semibold text-text">{s.label}</span>
                      <span className="mt-0.5 block text-[13px] leading-snug text-text-3">
                        {s.summary}
                      </span>
                    </span>
                  </label>
                )
              })}
            </div>
            {scopeErr && (
              <p role="alert" className="text-[14px] font-semibold text-danger">
                {scopeErr}
              </p>
            )}
          </fieldset>

          <Field label="Expiration" hint="Optional automatic expiration.">
            {(p) => (
              <Select
                {...p}
                value={expiry}
                onChange={(e) => setExpiry(e.target.value as ExpiryOption)}
              >
                <option value="never">No expiration</option>
                <option value="7d">7 days</option>
                <option value="30d">30 days</option>
                <option value="90d">90 days</option>
                <option value="1y">1 year</option>
              </Select>
            )}
          </Field>

          {apiErr && (
            <div
              role="alert"
              className="rounded-control border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm"
            >
              <p className="font-semibold text-text">{apiErr.message}</p>
              {apiErr.hint && <p className="mt-0.5 text-text-2">{apiErr.hint}</p>}
            </div>
          )}
        </form>
      )}
    </Dialog>
  )
}
