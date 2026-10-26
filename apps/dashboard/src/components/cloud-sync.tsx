// Settings › Cloud mode on the PC (API.md "Cloud sync", ferrocast docs/CLOUD.md §1.1): keep
// overlays, alerts and designs in sync with the account's cloud mode, and show the cloud
// overlays' URLs so OBS keeps working with this PC off. Both off by default.

import { useState } from 'react'
import { ArrowsClockwise, CloudArrowUp } from '@phosphor-icons/react'
import { cloudSyncApi, describeError, relativeTime, type CloudSyncView } from '@ferrocast/api'
import { Button, Skeleton, Switch, toast } from '@ferrocast/ui'
import { LoadError, Panel } from './Panel'
import { useClient, useResource } from '../lib/hooks'
import { href } from '../lib/router'

export function CloudSyncSettings() {
  const client = useClient()
  const view = useResource((c) => cloudSyncApi(c).get())
  const [busy, setBusy] = useState<string | null>(null)
  const run = async (key: string, fn: () => Promise<CloudSyncView>, ok?: string) => {
    setBusy(key)
    try {
      view.set(await fn())
      if (ok) toast({ tone: 'ok', message: ok })
    } catch (e) {
      const d = describeError(e)
      toast({ tone: 'error', message: d.message, hint: d.hint })
    } finally {
      setBusy(null)
    }
  }
  const api = cloudSyncApi(client)
  const v = view.data
  return (
    <div id="settings-cloud" className="scroll-mt-20">
      <Panel
        id="s-cloud"
        title="Cloud mode"
        description="Optional and free with a Ferrocast account. This PC works the same without it."
      >
        {view.error ? (
          <LoadError error={view.error} onRetry={view.reload} />
        ) : !v ? (
          <Skeleton className="h-28" />
        ) : (
          <div className="flex flex-col gap-4">
            {!v.signed_in && (
              <p className="flex items-start gap-2 rounded-control bg-surface-2 px-3 py-2.5 text-[14.5px] text-text-2">
                <CloudArrowUp
                  size={17}
                  className="mt-0.5 shrink-0 text-accent-text"
                  aria-hidden="true"
                />
                <span>
                  Sign in to your Ferrocast account at the bottom of the sidebar to use cloud mode
                  from this PC.{' '}
                  <a
                    className="font-semibold text-accent-text underline-offset-2 hover:underline"
                    href={href({ name: 'account' })}
                  >
                    Account
                  </a>
                </span>
              </p>
            )}
            <Switch
              checked={v.sync}
              disabled={busy !== null || (!v.signed_in && !v.sync)}
              label="Sync with cloud mode"
              description="Overlays, alert rules, your designs and the alert design in use stay the same here and on the web. When both change one, the web’s wins and this PC keeps a copy."
              onChange={(on) =>
                void run(
                  'sync',
                  () => api.set({ sync: on }),
                  on ? 'Synced with cloud mode.' : undefined,
                )
              }
            />
            <Switch
              checked={v.use_cloud_overlays}
              disabled={busy !== null || !v.sync}
              label="Use cloud overlays"
              description="Overlay URLs point to Ferrocast’s servers, so OBS keeps showing alerts with this PC off. Copy them into OBS again after turning this on."
              onChange={(on) => void run('use', () => api.set({ use_cloud_overlays: on }))}
            />
            {v.sync && (
              <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
                <p className="min-w-0 flex-1 text-[14px] text-text-3" aria-live="polite">
                  {v.last_sync_at
                    ? `Last synced ${relativeTime(v.last_sync_at)}. ${v.synced} item${v.synced === 1 ? '' : 's'} in sync.`
                    : 'Not synced yet.'}
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<ArrowsClockwise size={15} />}
                  busy={busy === 'now' || v.running}
                  onClick={() => void run('now', () => api.syncNow())}
                >
                  Sync now
                </Button>
              </div>
            )}
            {v.error && (
              <div
                role="alert"
                className="rounded-control border border-danger/30 bg-danger-soft px-3 py-2.5"
              >
                <p className="text-[14.5px] font-semibold text-text">{v.error.message}</p>
                <p className="text-[14px] text-text-2">{v.error.hint}</p>
              </div>
            )}
            {v.notes.length > 0 && (
              <div>
                <p className="text-[14px] font-semibold text-text">Replaced by the web</p>
                <ul className="mt-1 flex flex-col gap-1 text-[14px] text-text-2">
                  {v.notes.slice(0, 5).map((n, i) => (
                    <li key={`${i}-${n}`}>{n}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Panel>
    </div>
  )
}
