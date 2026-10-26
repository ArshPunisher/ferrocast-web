import { useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  ArrowCircleUp,
  ArrowClockwise,
  ArrowSquareOut,
  CheckCircle,
  DownloadSimple,
  WarningCircle,
} from '@phosphor-icons/react'
import { Button, Dialog, cx } from '@ferrocast/ui'
import type { UpdateInfo, UpdateProblem } from '@ferrocast/api'
import { useAction, useClient, useNow } from '../lib/hooks'
import { useLive } from '../lib/store'
import { externalLink } from '../lib/external'
import {
  DOWNLOAD_PAGE,
  refreshUpdate,
  formatBytes,
  parseNotes,
  publishedLine,
  summarize,
  type UpdateSummary,
} from '../lib/update'

/** Settings › Updates asks the shell's dialog to open (one dialog for the whole app). */
const OPEN_EVENT = 'fc-update-open'
export function openUpdateDialog() {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

const EASE_OUT = [0.22, 1, 0.36, 1] as const

function navLine(s: UpdateSummary): { title: string; detail: string } {
  const v = s.version ?? ''
  switch (s.phase) {
    case 'downloading':
      return {
        title: s.percent === null ? 'Downloading' : `Downloading ${s.percent}%`,
        detail: `Version ${v}`,
      }
    case 'installing':
      return { title: 'Installing', detail: `Version ${v}` }
    case 'ready':
      return { title: 'Restart to finish', detail: `Version ${v}` }
    case 'failed':
      return { title: 'Update didn’t install', detail: 'See why and try again' }
    default:
      return { title: 'Update available', detail: `Version ${v}` }
  }
}

/** A thin bar that fills with the download (transform only). */
function Progress({ percent, className }: { percent: number | null; className?: string }) {
  const reduce = useReducedMotion()
  return (
    <span
      aria-hidden="true"
      className={cx('block h-1.5 overflow-hidden rounded-full bg-surface-3', className)}
    >
      <span
        className="block h-full w-full origin-left rounded-full bg-accent"
        style={{
          transform: `scaleX(${percent === null ? 0.3 : Math.max(0.02, percent / 100)})`,
          transition: reduce ? undefined : 'transform 200ms linear',
        }}
      />
    </span>
  )
}

/**
 * Bottom of the sidebar (and the phone's More sheet): shows only when there's something to
 * do, so it never nags on an up-to-date app. Opens the update dialog.
 */
export function UpdateNavItem({ onOpen, roomy = false }: { onOpen?: () => void; roomy?: boolean }) {
  const update = useLive((s) => s.update)
  const s = summarize(update)
  const reduce = useReducedMotion()
  const { title, detail } = navLine(s)
  const Icon =
    s.phase === 'failed' ? WarningCircle : s.phase === 'ready' ? ArrowClockwise : ArrowCircleUp
  return (
    <AnimatePresence initial={false}>
      {s.show && (
        <motion.button
          key="update"
          type="button"
          data-testid="update-nav"
          onClick={() => {
            onOpen?.()
            openUpdateDialog()
          }}
          initial={reduce ? { opacity: 0 } : { opacity: 0, transform: 'translateY(6px)' }}
          animate={{ opacity: 1, transform: 'translateY(0px)' }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, transform: 'translateY(6px)' }}
          transition={{ duration: 0.24, ease: EASE_OUT }}
          className={cx(
            'fc-press flex w-full flex-col gap-2 rounded-control border px-2.5 py-2 text-left',
            'focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none',
            s.phase === 'failed'
              ? 'border-warn/40 bg-warn-soft hover:border-warn/60'
              : 'border-accent-line bg-accent-soft hover:border-accent-text',
            roomy && 'px-3 py-2.5',
          )}
        >
          <span className="flex items-center gap-2.5">
            <Icon
              size={roomy ? 19 : 17}
              weight="bold"
              aria-hidden
              className={cx('shrink-0', s.phase === 'failed' ? 'text-warn' : 'text-accent-text')}
            />
            <span className="min-w-0">
              <b className="block truncate text-[14.5px] leading-tight font-semibold text-text">
                {title}
              </b>
              <small className="block truncate font-mono text-[13px] text-text-2 tabular-nums">
                {detail}
              </small>
            </span>
          </span>
          {(s.phase === 'downloading' || s.phase === 'installing') && (
            <Progress percent={s.phase === 'installing' ? 100 : s.percent} />
          )}
        </motion.button>
      )}
    </AnimatePresence>
  )
}

function Problem({ problem }: { problem: UpdateProblem }) {
  return (
    <div
      role="alert"
      className="flex gap-2.5 rounded-[12px] border border-danger/30 bg-danger-soft p-3 text-sm"
    >
      <WarningCircle size={18} weight="bold" aria-hidden className="mt-0.5 shrink-0 text-danger" />
      <div className="min-w-0">
        <p className="font-semibold text-text">{problem.message}</p>
        <p className="mt-0.5 text-text-2">{problem.hint}</p>
      </div>
    </div>
  )
}

function Notes({ u }: { u: UpdateInfo }) {
  const blocks = parseNotes(u.notes)
  return (
    <section aria-labelledby="update-notes" className="flex flex-col gap-2">
      <h3 id="update-notes" className="text-[14.5px] font-semibold text-text">
        What’s new
      </h3>
      {blocks.length === 0 ? (
        <p className="text-sm text-text-2">This release has no notes here.</p>
      ) : (
        <div className="flex max-h-[38dvh] flex-col gap-2 overflow-y-auto rounded-[12px] border border-line bg-surface-2 p-3.5 text-sm leading-relaxed [overflow-wrap:anywhere] text-text-2">
          {blocks.map((b, i) =>
            b.kind === 'list' ? (
              <ul key={i} className="flex list-disc flex-col gap-1.5 pl-5 marker:text-text-3">
                {b.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            ) : (
              <p key={i}>{b.text}</p>
            ),
          )}
        </div>
      )}
      {u.notes_url && (
        <a
          {...externalLink(u.notes_url)}
          className="inline-flex w-fit items-center gap-1.5 text-[14.5px] font-semibold text-accent-text hover:underline"
        >
          Release page on GitHub
          <ArrowSquareOut size={14} aria-hidden />
        </a>
      )}
    </section>
  )
}

/** The download, installing and restart states, in one place under the notes. */
function InstallState({ u, s }: { u: UpdateInfo; s: UpdateSummary }) {
  const i = u.install
  if (s.phase === 'downloading' && i) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="font-semibold text-text" aria-live="polite">
            Downloading
          </span>
          <span className="font-mono text-[14px] text-text-2 tabular-nums">
            {i.total
              ? `${formatBytes(i.downloaded)} of ${formatBytes(i.total)} · ${s.percent ?? 0}%`
              : formatBytes(i.downloaded)}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="Download"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={s.percent ?? undefined}
        >
          <Progress percent={s.percent} />
        </div>
        <p className="text-[14.5px] text-text-3">
          Ferrocast keeps running while it downloads. Nothing changes until you restart.
        </p>
      </div>
    )
  }
  if (s.phase === 'installing') {
    return (
      <div className="flex flex-col gap-2" aria-live="polite">
        <span className="text-sm font-semibold text-text">
          Checking the signature and installing
        </span>
        <Progress percent={100} />
      </div>
    )
  }
  if (s.phase === 'ready') {
    return (
      <div
        className="flex gap-2.5 rounded-[12px] border border-ok/30 bg-ok-soft p-3 text-sm"
        aria-live="polite"
      >
        <CheckCircle size={18} weight="bold" aria-hidden className="mt-0.5 shrink-0 text-ok" />
        <div>
          <p className="font-semibold text-text">Version {s.version} is ready.</p>
          <p className="mt-0.5 text-text-2">
            Restart Ferrocast to finish (on Windows the installer runs first). It takes a few
            seconds, and overlays in OBS reconnect by themselves.
          </p>
        </div>
      </div>
    )
  }
  return s.installError ? <Problem problem={s.installError} /> : null
}

/** One update dialog for the app: notes, Update now, progress, Restart to finish. */
export function UpdateDialogHost() {
  const [open, setOpen] = useState(false)
  const update = useLive((s) => s.update)
  const client = useClient()
  const { run, busy } = useAction()
  const now = useNow(60_000)
  useEffect(() => {
    const on = () => {
      setOpen(true)
      // Fresh "live" state when someone looks (it can change without an update frame).
      void refreshUpdate(client)
    }
    window.addEventListener(OPEN_EVENT, on)
    return () => window.removeEventListener(OPEN_EVENT, on)
  }, [client])
  if (!update) return null
  const s = summarize(update)
  const u = update
  // A phone through the relay can read it but never install or restart the PC's app.
  const mayInstall = client.may('POST', '/api/v1/updates/install')
  const published = publishedLine(u.published_at, now)
  const title = s.version ? `Ferrocast ${s.version}` : 'Updates'

  const install = () =>
    void run('install', () => client.installUpdate(), {
      // An engine before 1.1 shows no progress and restarts by itself: say so.
      success: (r) =>
        u.install === undefined
          ? `Installing ${r.installing}. Ferrocast restarts by itself in a moment.`
          : null,
    })
  const restart = () =>
    void run('restart', () => client.restartForUpdate(), {
      success: (r) => `Restarting into ${r.restarting}.`,
    })

  let footer: ReactNode
  if (!mayInstall) {
    footer = <p className="mr-auto text-[14.5px] text-text-2">Update from the streaming PC.</p>
  } else if (!s.canInstall) {
    footer = (
      <>
        <p className="mr-auto text-[14.5px] text-text-2">This copy can’t update itself.</p>
        <a
          {...externalLink(DOWNLOAD_PAGE)}
          className="fc-press inline-flex h-10 items-center gap-2 rounded-control bg-btn-primary px-4 text-sm font-semibold text-on-btn-primary hover:bg-btn-primary-hover focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
        >
          <DownloadSimple size={17} aria-hidden />
          Download
        </a>
      </>
    )
  } else if (s.phase === 'ready') {
    footer = (
      <>
        {s.blocked && (
          <p className="mr-auto text-[14.5px] font-medium text-warn">
            You’re live. Restart after your stream.
          </p>
        )}
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Later
        </Button>
        <Button
          variant="primary"
          icon={<ArrowClockwise size={17} />}
          disabled={s.blocked}
          busy={busy === 'restart'}
          onClick={restart}
        >
          Restart to finish
        </Button>
      </>
    )
  } else if (s.phase === 'downloading' || s.phase === 'installing') {
    footer = (
      <Button variant="secondary" onClick={() => setOpen(false)}>
        Hide
      </Button>
    )
  } else if (u.latest && u.latest !== u.current) {
    footer = (
      <>
        {s.blocked && (
          <p className="mr-auto text-[14.5px] font-medium text-warn">
            You’re live, so it waits until your stream ends.
          </p>
        )}
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Later
        </Button>
        <Button
          variant="primary"
          icon={<DownloadSimple size={17} />}
          disabled={s.blocked}
          busy={busy === 'install'}
          onClick={install}
        >
          {s.phase === 'failed' ? 'Try again' : 'Update now'}
        </Button>
      </>
    )
  } else {
    footer = (
      <Button variant="secondary" onClick={() => setOpen(false)}>
        Close
      </Button>
    )
  }

  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      title={title}
      description={
        <span className="font-mono text-[14px] tabular-nums">
          You have {u.current}
          {published ? ` · ${published}` : ''}
        </span>
      }
      footer={footer}
    >
      <div className="flex flex-col gap-4" data-testid="update-dialog">
        {s.version && s.version !== u.current ? (
          <Notes u={u} />
        ) : (
          <p className="text-sm text-text-2">You’re on the newest version.</p>
        )}
        <InstallState u={u} s={s} />
      </div>
    </Dialog>
  )
}
