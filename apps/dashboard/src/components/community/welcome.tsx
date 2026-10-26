import { useState } from 'react'
import { fieldError, type WelcomeConfig } from '@ferrocast/api'
import { Button, Field, Input, Skeleton, Switch, Textarea, toast } from '@ferrocast/ui'
import { LoadError, Panel } from '../Panel'
import { useClient, useResource } from '../../lib/hooks'

function WelcomeForm({
  cfg,
  onSaved,
}: {
  cfg: WelcomeConfig
  onSaved: (c: WelcomeConfig) => void
}) {
  const client = useClient()
  const [draft, setDraft] = useState(cfg)
  const [err, setErr] = useState<{ field: string | null; message: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const dirty = draft.template !== cfg.template || draft.returning_days !== cfg.returning_days
  const save = async (patch: Partial<WelcomeConfig>, key: string) => {
    setBusy(key)
    setErr(null)
    try {
      const saved = await client.saveWelcome(patch)
      onSaved(saved)
      setDraft((d) => ({ ...d, ...patch, ...saved }))
      if (key === 'form') toast({ tone: 'ok', message: 'Saved.' })
    } catch (e) {
      setErr(fieldError(e))
    } finally {
      setBusy(null)
    }
  }
  return (
    <form
      className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-x-8"
      onSubmit={(e) => {
        e.preventDefault()
        void save({ template: draft.template, returning_days: draft.returning_days }, 'form')
      }}
    >
      <div className="flex flex-col gap-5">
        <Switch
          label="Welcome first-time chatters in chat"
          description="At most once every 10 seconds, never during panic mode."
          checked={cfg.enabled}
          disabled={busy === 'enabled'}
          onChange={(enabled) => void save({ enabled }, 'enabled')}
        />
        <Field
          label="Welcome message"
          hint="Use {user} and {platform}."
          error={err?.field === 'template' ? err.message : null}
        >
          {(p) => (
            <Textarea
              {...p}
              rows={2}
              maxLength={300}
              value={draft.template}
              onChange={(e) => setDraft({ ...draft, template: e.target.value })}
            />
          )}
        </Field>
      </div>
      <div className="flex flex-col gap-5">
        <Switch
          label="Mark people who come back"
          description="Their message gets a “Back after N days” badge in chat."
          checked={cfg.returning_badge}
          disabled={busy === 'returning'}
          onChange={(returning_badge) => void save({ returning_badge }, 'returning')}
        />
        <Field
          label="Counts as back after"
          hint="7 to 365 days without chatting."
          error={err?.field === 'returning_days' ? err.message : null}
        >
          {(p) => (
            <div className="flex items-center gap-2">
              <Input
                {...p}
                inputMode="numeric"
                className="w-24 font-mono tabular-nums"
                value={String(draft.returning_days)}
                maxLength={3}
                disabled={!cfg.returning_badge}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '')
                  setDraft({ ...draft, returning_days: v === '' ? 0 : Number(v) })
                }}
              />
              <span className="text-sm text-text-2">days</span>
            </div>
          )}
        </Field>
      </div>
      {err && err.field !== 'template' && err.field !== 'returning_days' && (
        <p role="alert" className="text-[14.5px] font-medium text-danger lg:col-span-2">
          {err.message}
        </p>
      )}
      <div className="flex justify-end lg:col-span-2">
        <Button type="submit" variant="primary" busy={busy === 'form'} disabled={!dirty}>
          Save
        </Button>
      </div>
    </form>
  )
}

/** First-time chatters: they're always marked in chat; the welcome is optional. */
export function WelcomePanel() {
  const cfg = useResource((c) => c.welcome())
  return (
    <Panel title="New faces" description="First-ever messages are highlighted in chat.">
      {cfg.error ? (
        <LoadError error={cfg.error} onRetry={cfg.reload} />
      ) : !cfg.data ? (
        <Skeleton className="h-64" />
      ) : (
        <WelcomeForm cfg={cfg.data} onSaved={(c) => cfg.set(c)} />
      )}
    </Panel>
  )
}
