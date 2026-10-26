// YouTube from the cloud on the web dashboard's Account page (Pro, API.md §9.7 "YouTube from
// the web"): connect the channel with no PC, switch the cloud bot, see today's YouTube
// quota (a fair share of Google's daily pot on busy days), disconnect. Shown on the web
// host only; the app connects YouTube for the cloud bot on its Bot page.

import { useEffect, useState } from 'react'
import { ArrowSquareOut, YoutubeLogo } from '@phosphor-icons/react'
import { describeError, formatCount, type YoutubeCloudView } from '@ferrocast/api'
import { Badge, Button, Skeleton, Switch, toast } from '@ferrocast/ui'
import { LoadError } from '../Panel'
import { webApi } from '../../lib/account-status'
import { href } from '../../lib/router'

function at(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function YoutubeCloud() {
  const web = webApi()
  const [v, setV] = useState<YoutubeCloudView | null>(null)
  const [err, setErr] = useState<unknown>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [sure, setSure] = useState(false)
  const load = () => {
    if (!web) return
    setErr(null)
    web.youtube().then(setV, setErr)
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [])
  useEffect(() => {
    // Back from Google: say so once, and drop the flag from the address.
    if (location.hash.includes('youtube=connected')) {
      toast({ tone: 'ok', message: 'YouTube is connected. The cloud bot can answer there now.' })
      history.replaceState(null, '', `${location.pathname}${location.search}#/account`)
    }
  }, [])
  if (!web) return null
  const act = async (key: string, fn: () => Promise<YoutubeCloudView | void>, ok?: string) => {
    setBusy(key)
    try {
      const r = await fn()
      if (r) setV(r)
      if (ok) toast({ tone: 'ok', message: ok })
    } catch (e) {
      const d = describeError(e)
      toast({ tone: 'error', message: d.message, hint: d.hint })
    } finally {
      setBusy(null)
    }
  }
  const connect = () =>
    void act('connect', async () => {
      const { url } = await web.youtubeConnect(false)
      location.assign(url)
    })
  return (
    <section
      aria-labelledby="yt-cloud-title"
      className="flex flex-col gap-3 border-t border-line pt-5"
      data-testid="youtube-cloud"
    >
      <div className="flex items-center gap-2">
        <YoutubeLogo size={18} className="text-youtube" aria-hidden />
        <h2
          id="yt-cloud-title"
          className="font-display text-[18px] font-extrabold tracking-tight text-text"
        >
          YouTube from the cloud
        </h2>
        <span className="ml-auto">
          <Badge tone="pro">Pro</Badge>
        </span>
      </div>
      {err ? (
        <LoadError error={err} onRetry={load} />
      ) : !v ? (
        <Skeleton className="h-20" />
      ) : !v.available ? (
        <p className="text-[14.5px] text-text-2">
          Not set up on Ferrocast&rsquo;s servers yet. YouTube keeps working in the app on your PC.
        </p>
      ) : !v.pro ? (
        <p className="text-[14.5px] text-text-2">
          Your YouTube chat and bot keep running with your PC off, or with no PC at all. Part of
          Pro.{' '}
          <a
            href={href({ name: 'plans' })}
            className="font-semibold text-accent-text underline-offset-2 hover:underline"
          >
            See Pro plans
          </a>
        </p>
      ) : !v.channel ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-[14.5px] text-text-2">
            Connect your channel and the cloud bot reads and answers your YouTube live chat from
            Ferrocast&rsquo;s servers, no PC needed.
          </p>
          <Button
            size="sm"
            icon={<ArrowSquareOut size={15} />}
            busy={busy === 'connect'}
            onClick={connect}
          >
            Connect YouTube
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="flex min-w-0 items-center gap-2 text-[15px] text-text">
            <b className="min-w-0 truncate font-semibold" dir="auto">
              {v.channel.title ?? 'Your channel'}
            </b>
            {v.channel.live && <Badge tone="danger">Live</Badge>}
          </p>
          {v.channel.error && (
            <div role="status" className="rounded-control bg-warn-soft px-3 py-2 text-[14.5px]">
              <p className="font-semibold text-warn">{v.channel.error.message}</p>
              {v.channel.error.hint && <p className="text-text-2">{v.channel.error.hint}</p>}
            </div>
          )}
          <Switch
            label="Cloud bot on YouTube"
            description="Your commands, timers and auto-replies, as your PC last sent them."
            checked={v.bot_on}
            disabled={busy === 'bot'}
            onChange={(on) => void act('bot', () => web.youtubeBot(on))}
          />
          {v.quota && (
            <p className="font-mono text-[13.5px] text-text-3 tabular-nums">
              {formatCount(v.quota.used)} of {formatCount(v.quota.limit)} YouTube units used today
              {v.quota.fair_share ? ', shared fairly with other streamers on a busy day' : ''}. Back
              to zero at {at(v.quota.reset_at)}.
            </p>
          )}
          {sure ? (
            <div
              role="group"
              aria-label="Disconnect YouTube"
              className="flex flex-wrap items-center gap-2"
            >
              <span className="text-[14.5px] text-text-2">
                The cloud bot stops on YouTube and Google forgets the sign-in.
              </span>
              <Button
                size="sm"
                variant="danger"
                busy={busy === 'off'}
                onClick={() =>
                  void act('off', () => web.youtubeDisconnect(), 'YouTube disconnected.').then(() =>
                    setSure(false),
                  )
                }
              >
                Disconnect
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSure(false)}>
                Keep it
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="danger-ghost"
              className="self-start"
              onClick={() => setSure(true)}
            >
              Disconnect YouTube
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
