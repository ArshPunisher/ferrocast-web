// The bot in cloud mode (ferrocast docs/CLOUD.md §6): one switch. It speaks as your own
// channel account in the channels connected on the Cloud page, with the commands and timers
// on this page; Ferrocast's servers run it, so no PC needs to be on.

import { useState } from 'react'
import { Robot } from '@phosphor-icons/react'
import { cloudBotApi, describeError, type CloudBotView } from '@ferrocast/api'
import { Badge, Skeleton, Switch, toast } from '@ferrocast/ui'
import { LoadError, Panel } from '../Panel'
import { useClient, useResource } from '../../lib/hooks'
import { href } from '../../lib/router'

export function CloudModeBotPanel({ className }: { className?: string }) {
  const client = useClient()
  const view = useResource((c) => cloudBotApi(c).get())
  const [busy, setBusy] = useState(false)
  const toggle = async (on: boolean) => {
    setBusy(true)
    try {
      view.set(await cloudBotApi(client).setEnabled(on))
      toast({ tone: 'ok', message: on ? 'The bot is on in the cloud.' : 'The bot is off.' })
    } catch (e) {
      const d = describeError(e)
      toast({ tone: 'error', message: d.message, hint: d.hint })
    } finally {
      setBusy(false)
    }
  }
  const v: CloudBotView | null = view.data
  // YouTube (Pro) is bound to the account's subscription; its bot follows this page only
  // when no PC is linked (CLOUD.md §11).
  const yt = v?.youtube
  const ready = [
    ...(v?.channels.filter((c) => c.state === 'ready') ?? []).map((c) => ({
      key: c.platform,
      name: c.channel?.login ?? c.platform,
    })),
    ...(yt?.channel && yt.follows_this_page ? [{ key: 'youtube', name: yt.channel.title }] : []),
  ]
  return (
    <Panel
      {...(className ? { className } : {})}
      title="Run the bot in the cloud"
      description="It answers commands and posts timers as your own channel account, with your PC off."
    >
      {view.error ? (
        <LoadError error={view.error} onRetry={view.reload} />
      ) : !v ? (
        <Skeleton className="h-16" />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Robot
              size={22}
              weight="duotone"
              className="shrink-0 text-accent-text"
              aria-hidden="true"
            />
            <p className="min-w-0 flex-1 text-[14px] text-text-2">
              {ready.length === 0 ? (
                <>
                  Connect a channel on the{' '}
                  <a
                    className="font-semibold text-accent-text underline-offset-2 hover:underline"
                    href={href({ name: 'cloud' })}
                  >
                    Cloud page
                  </a>{' '}
                  first.
                </>
              ) : (
                <>
                  In{' '}
                  {ready.map((c, i) => (
                    <span key={c.key}>
                      {i > 0 ? ' and ' : ''}
                      <span className="font-semibold text-text">{c.name}</span>
                    </span>
                  ))}
                  ’s chat.
                </>
              )}
            </p>
            {v.enabled && <Badge tone="ok">On</Badge>}
            <Switch
              checked={v.enabled}
              disabled={busy || (ready.length === 0 && !v.enabled)}
              label="Bot on"
              hideLabel
              onChange={(on) => void toggle(on)}
            />
          </div>
          {yt?.channel && !yt.follows_this_page && (
            <p className="text-[13px] text-text-2" data-testid="cloud-bot-youtube-pc">
              On YouTube the bot uses the commands from the Ferrocast app on your PC. Change them
              there.
            </p>
          )}
          <p className="text-[12.5px] text-text-3">
            If the Ferrocast app on your PC is signed in to this account with its bot on, the cloud
            waits, so the two never answer twice.
          </p>
        </div>
      )}
    </Panel>
  )
}
