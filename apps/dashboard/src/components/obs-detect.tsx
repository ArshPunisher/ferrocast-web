import { MagicWand } from '@phosphor-icons/react'
import type { ObsState } from '@ferrocast/api'
import { Button } from '@ferrocast/ui'
import { useAction, useClient, useResource } from '../lib/hooks'

/**
 * Reads OBS's own WebSocket settings on this computer and offers them in one click, so
 * nobody has to copy the port and password out of OBS. Shows nothing when OBS is already
 * connected or nothing was found worth offering.
 */
export function ObsAutoDetect({
  connected,
  onUsed,
}: {
  connected: boolean
  onUsed: (o: ObsState) => void
}) {
  const client = useClient()
  const found = useResource((c) => c.obsDetect())
  const { run, busy } = useAction()
  const d = found.data
  if (connected || !d) return null
  if (!d.found) return null
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-panel border border-accent-line bg-accent-soft p-4 sm:flex-row sm:items-center">
      <MagicWand size={22} className="shrink-0 text-accent-text" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text">Found OBS on this computer</p>
        <p className="mt-0.5 text-[13px] text-text-2">
          {d.server_enabled
            ? `Port ${d.port}${d.has_password ? ', password included' : ', no password needed'}. Ferrocast can use these for you.`
            : d.reason}
        </p>
      </div>
      {d.server_enabled && (
        <Button
          variant="primary"
          busy={busy === 'use'}
          onClick={() =>
            void run('use', () => client.obsUseDetected()).then((o) => {
              if (!o) return
              onUsed(o)
              found.reload()
            })
          }
        >
          Use these
        </Button>
      )}
    </div>
  )
}
