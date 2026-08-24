import { useState } from 'react'
import { PaperPlaneTilt, Trash } from '@phosphor-icons/react'
import { ApiError, describeError, type DiscordSettings } from '@ferrocast/api'
import {
  Badge,
  Button,
  Dialog,
  Field,
  Input,
  Skeleton,
  Switch,
  Textarea,
  toast,
} from '@ferrocast/ui'
import { LoadError } from './Panel'
import { useAction, useClient, useResource } from '../lib/hooks'

function fieldError(e: unknown): { field: string | null; message: string } {
  const d = describeError(e)
  if (e instanceof ApiError && e.status === 400) {
    const m = /^(\w+): (.*)$/.exec(d.message)
    if (m) return { field: m[1] ?? null, message: m[2] ?? d.message }
  }
  return { field: null, message: d.hint ? `${d.message} ${d.hint}` : d.message }
}

function DiscordForm({
  cfg,
  onSaved,
}: {
  cfg: DiscordSettings
  onSaved: (d: DiscordSettings) => void
}) {
  const client = useClient()
  const { run, busy } = useAction()
  const [url, setUrl] = useState('')
  const [template, setTemplate] = useState(cfg.template)
  const [err, setErr] = useState<{ field: string | null; message: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const save = async () => {
    setSaving(true)
    setErr(null)
    try {
      const next = await client.saveDiscord({
        ...(url.trim() ? { webhook_url: url.trim() } : {}),
        template,
      })
      onSaved(next)
      setUrl('')
      toast({ tone: 'ok', message: 'Discord settings saved.' })
    } catch (e) {
      setErr(fieldError(e))
    } finally {
      setSaving(false)
    }
  }
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <Field
        label={cfg.has_webhook ? 'Replace the webhook' : 'Webhook URL'}
        optional={cfg.has_webhook}
        hint={
          cfg.has_webhook ? (
            <span className="inline-flex items-center gap-2">
              <Badge tone="ok">Saved</Badge>
              {cfg.webhook_hint}
            </span>
          ) : (
            'In Discord: Server Settings, Integrations, Webhooks, New Webhook, Copy Webhook URL.'
          )
        }
        error={err?.field === 'webhook_url' ? err.message : null}
      >
        {(p) => (
          <Input
            {...p}
            type="password"
            spellCheck={false}
            value={url}
            placeholder="https://discord.com/api/webhooks/…"
            maxLength={300}
            onChange={(e) => setUrl(e.target.value)}
          />
        )}
      </Field>
      <Field
        label="Message"
        hint="Use {name}, {platform}, {title} and {url}."
        error={err?.field === 'template' ? err.message : null}
      >
        {(p) => (
          <Textarea
            {...p}
            rows={3}
            maxLength={1500}
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
          />
        )}
      </Field>
      <Switch
        label="Post when I go live"
        description="Once per platform, not again for 30 minutes if a stream drops and comes back."
        checked={cfg.enabled}
        disabled={busy === 'enabled'}
        onChange={(enabled) =>
          void run('enabled', () => client.saveDiscord({ enabled })).then((d) => d && onSaved(d))
        }
      />
      <Switch
        label="Ping @everyone"
        description="Off: the message shows in the channel without notifying anyone."
        checked={cfg.mention_everyone}
        disabled={busy === 'everyone'}
        onChange={(mention_everyone) =>
          void run('everyone', () => client.saveDiscord({ mention_everyone })).then(
            (d) => d && onSaved(d),
          )
        }
      />
      {err && err.field !== 'webhook_url' && err.field !== 'template' && (
        <p role="alert" className="text-[13px] text-danger">
          {err.message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          variant="primary"
          busy={saving}
          disabled={!url.trim() && template === cfg.template}
        >
          Save
        </Button>
        <Button
          icon={<PaperPlaneTilt size={15} />}
          disabled={!cfg.has_webhook}
          busy={busy === 'test'}
          onClick={() =>
            void run('test', () => client.testDiscord().then(() => true), {
              success: 'Test sent. Check your Discord channel.',
            })
          }
        >
          Send test
        </Button>
        {cfg.has_webhook && (
          <Button
            variant="danger-ghost"
            icon={<Trash size={15} />}
            onClick={() => setConfirmRemove(true)}
          >
            Remove webhook
          </Button>
        )}
      </div>
      <Dialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        size="sm"
        title="Remove the Discord webhook?"
        description="Go-live posts stop. To start them again you'll need to copy the webhook URL from Discord again."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmRemove(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              busy={busy === 'remove'}
              onClick={() =>
                void run('remove', () => client.saveDiscord({ webhook_url: null }), {
                  success: 'Webhook removed.',
                }).then((d) => {
                  setConfirmRemove(false)
                  if (d) onSaved(d)
                })
              }
            >
              Remove webhook
            </Button>
          </>
        }
      />
    </form>
  )
}

/** Discord go-live posts. The webhook is kept in the engine’s secret store and never shown again. */
export function DiscordSettingsForm() {
  const d = useResource((c) => c.discord())
  if (d.error) return <LoadError error={d.error} onRetry={d.reload} />
  if (!d.data) return <Skeleton className="h-64" />
  return <DiscordForm cfg={d.data} onSaved={(v) => d.set(v)} />
}
