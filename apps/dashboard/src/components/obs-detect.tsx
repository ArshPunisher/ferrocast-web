import { MagicWand } from '@phosphor-icons/react'
import type { ObsState } from '@ferrocast/api'
import { Button } from '@ferrocast/ui'
import { useAction, useClient, useResource } from '../lib/hooks'

/**
 * Reads OBS's own WebSocket settings on this computer. The engine already follows them
 * by itself until the streamer types different details; then this offers them back in
 * one click ("Use these"). Shows nothing while OBS is connected, when OBS's WebSocket
 * server is off (the status line above says how to switch it on), or when Ferrocast
 * already uses these details.
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
  if (connected || !d || !d.found) return null
  // Older engines don't say; treat that as "not in use" so the offer still shows.
  if (!d.server_enabled || d.in_use === true) return null
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-panel border border-accent-line bg-accent-soft p-4 sm:flex-row sm:items-center">
      <MagicWand size={22} className="shrink-0 text-accent-text" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text">Found OBS on this computer</p>
        <p className="mt-0.5 text-[13px] text-text-2">
          Port {d.port}, {d.has_password ? 'password included' : 'no password needed'}. These differ
          from the details below; Ferrocast can use OBS’s instead.
        </p>
      </div>
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
    </div>
  )
}
