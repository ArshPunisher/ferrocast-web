import { useState } from 'react'
import { GearSix, HandWaving } from '@phosphor-icons/react'
import { fieldError, type WelcomeConfig } from '@ferrocast/api'
import { Button, Field, Input, Sheet, Skeleton, Switch, Textarea, toast } from '@ferrocast/ui'
import { LoadError, Panel } from '../Panel'
import { useClient, useResource } from '../../lib/hooks'

/** `toggles`: the two switches (on the card, saved at once); `details`: the message and the
 * days (in the side panel, with Save). */
function WelcomeForm({
  cfg,
  onSaved,
  part,
}: {
  cfg: WelcomeConfig
  onSaved: (c: WelcomeConfig) => void
  part: 'toggles' | 'details'
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
  if (part === 'toggles')
    return (
      <div className="flex flex-col gap-4">
        <Switch
          label="Welcome first-time chatters in chat"
          description="At most once every 10 seconds, never during panic mode."
          checked={cfg.enabled}
          disabled={busy === 'enabled'}
          onChange={(enabled) => void save({ enabled }, 'enabled')}
        />
        <Switch
          label={`Mark people who come back after ${cfg.returning_days} days`}
          description="Their message gets a “Back after N days” badge in chat."
          checked={cfg.returning_badge}
          disabled={busy === 'returning'}
          onChange={(returning_badge) => void save({ returning_badge }, 'returning')}
        />
        {err && (
          <p role="alert" className="text-[14.5px] font-medium text-danger">
            {err.message}
          </p>
        )}
      </div>
    )
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        void save({ template: draft.template, returning_days: draft.returning_days }, 'form')
      }}
    >
      <div className="flex flex-col gap-5">
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
        <p role="alert" className="text-[14.5px] font-medium text-danger">
          {err.message}
        </p>
      )}
      <div className="flex justify-end">
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
  const [editing, setEditing] = useState(false)
  return (
    <Panel
      id="community-welcome"
      title="New faces"
      icon={<HandWaving weight="fill" />}
      tone="var(--fc-arc)"
      className="h-full scroll-mt-20"
      description="First-ever messages are highlighted in chat."
      actions={
        cfg.data ? (
          <Button
            size="sm"
            variant="ghost"
            icon={<GearSix size={15} />}
            onClick={() => setEditing(true)}
          >
            Edit
          </Button>
        ) : null
      }
    >
      {cfg.error ? (
        <LoadError error={cfg.error} onRetry={cfg.reload} />
      ) : !cfg.data ? (
        <Skeleton className="h-28" />
      ) : (
        <>
          <WelcomeForm cfg={cfg.data} onSaved={(c) => cfg.set(c)} part="toggles" />
          <Sheet open={editing} onClose={() => setEditing(false)} title="New faces">
            <WelcomeForm
              key={editing ? 'open' : 'shut'}
              cfg={cfg.data}
              onSaved={(c) => cfg.set(c)}
              part="details"
            />
          </Sheet>
        </>
      )}
    </Panel>
  )
}
