import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { CaretDown, Lightning, Pause, Play, SkipForward, Trash, X } from '@phosphor-icons/react'
import {
  KIND_LABEL,
  PLATFORM_LABEL,
  TESTABLE,
  platformsFor,
  type Platform,
  type RenderedAlert,
  type TtsPending,
} from '@ferrocast/api'
import { Button, Dialog, EmptyState, IconButton, PlatformMark, cx } from '@ferrocast/ui'
import { useAction, useClient } from '../lib/hooks'
import { useLive } from '../lib/store'
import { Menu } from './Menu'

/** "Test alert" with every kind, two clicks from anywhere it appears. */
export function TestAlertMenu({
  size = 'md',
  variant = 'secondary',
}: {
  size?: 'sm' | 'md'
  variant?: 'secondary' | 'primary'
}) {
  const client = useClient()
  const { run } = useAction()
  return (
    <Menu
      label="Test an alert"
      trigger={(p) => (
        <Button {...p} size={size} variant={variant} icon={<Lightning size={16} weight="fill" />}>
          Test alert
          <CaretDown size={13} className="-mr-1 opacity-70" />
        </Button>
      )}
      items={TESTABLE.map((k) => {
        const ps = platformsFor(k)
        return {
          key: k,
          label: KIND_LABEL[k] ?? k,
          hint: (
            <span className="flex items-center gap-1">
              {(k === 'tip' ? (['tips'] as Platform[]) : ps).map((p) => (
                <PlatformMark key={p} platform={p} size={12} />
              ))}
            </span>
          ),
          onSelect: () =>
            void run('test', () => client.test(k), {
              success: `Test ${(KIND_LABEL[k] ?? k).toLowerCase()} sent. It plays on your overlays.`,
            }),
        }
      })}
    />
  )
}

function Progress({ alert, startedAt }: { alert: RenderedAlert; startedAt: number }) {
  const reduce = useReducedMotion()
  const elapsed = Math.min(Math.max(Date.now() - startedAt, 0), alert.duration_ms)
  const left = alert.duration_ms - elapsed
  const [go, setGo] = useState(false)
  useEffect(() => {
    const r = requestAnimationFrame(() => setGo(true))
    return () => cancelAnimationFrame(r)
  }, [])
  return (
    <div className="h-1 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
      <div
        className="h-full origin-left rounded-full bg-accent"
        style={{
          transform: `scaleX(${go || reduce ? 1 : elapsed / alert.duration_ms})`,
          transition: reduce ? 'none' : `transform ${go ? left : 0}ms linear`,
        }}
      />
    </div>
  )
}

export function QueuePanel({ className }: { className?: string }) {
  const client = useClient()
  const queue = useLive((s) => s.queue)
  const setQueue = useLive((s) => s.setQueue)
  const { run, busy } = useAction()
  const reduce = useReducedMotion()
  const act = (key: string, fn: () => Promise<import('@ferrocast/api').Queue>, success?: string) =>
    void run(
      key,
      async () => {
        const q = await fn()
        setQueue(q)
        return q
      },
      success ? { success } : {},
    )
  const [confirmClear, setConfirmClear] = useState(false)
  const paused = queue?.paused ?? false
  const playing = queue?.playing ?? null
  const waiting = queue?.waiting ?? []
  return (
    <section
      aria-labelledby="queue-title"
      className={cx(
        'flex flex-col rounded-panel border border-line bg-surface-1 shadow-1',
        className,
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3 sm:px-5">
        <h2 id="queue-title" className="font-display text-[15px] font-semibold tracking-tight">
          Alert queue
          {waiting.length > 0 && (
            <span className="ml-2 font-mono text-[12px] font-medium text-text-3 tabular-nums">
              {waiting.length} waiting
            </span>
          )}
        </h2>
        <div className="flex items-center gap-1">
          {paused ? (
            <Button
              size="sm"
              variant="primary"
              icon={<Play size={14} weight="fill" />}
              busy={busy === 'resume'}
              onClick={() => act('resume', client.queueResume, 'Alerts resumed.')}
            >
              Resume
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              icon={<Pause size={14} weight="fill" />}
              busy={busy === 'pause'}
              onClick={() =>
                act('pause', client.queuePause, 'Alerts paused. New ones wait in line.')
              }
            >
              Pause
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            icon={<SkipForward size={14} weight="fill" />}
            disabled={!playing}
            busy={busy === 'skip'}
            onClick={() => act('skip', client.queueSkip)}
          >
            Skip
          </Button>
          <IconButton
            size="sm"
            label="Clear waiting alerts"
            disabled={waiting.length === 0}
            onClick={() => setConfirmClear(true)}
          >
            <Trash size={15} />
          </IconButton>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-3 px-4 pt-3 pb-4 sm:px-5">
        {paused && (
          <p
            role="status"
            className="rounded-control border border-warn/30 bg-warn-soft px-3 py-2 text-[13px] text-warn"
          >
            Paused. Alerts keep arriving and wait here until you resume.
          </p>
        )}
        <AnimatePresence mode="popLayout" initial={false}>
          {playing ? (
            <motion.div
              key={playing.alert.alert_id}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6, transition: { duration: 0.15 } }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-[12px] border border-accent-line bg-accent-soft p-3.5"
              aria-live="polite"
            >
              <div className="flex items-center gap-2 text-[12px] font-semibold text-accent-text">
                <span>Playing now</span>
                <PlatformMark platform={playing.alert.platform} size={12} />
                {playing.alert.test && <span className="text-text-3">test</span>}
              </div>
              <p className="mt-1.5 line-clamp-2 font-display text-[17px] font-semibold tracking-tight break-words text-text">
                {playing.alert.title}
              </p>
              {playing.alert.body && (
                <p className="mt-0.5 line-clamp-2 text-[13px] break-words text-text-2">
                  {playing.alert.body}
                </p>
              )}
              <div className="mt-3">
                <Progress
                  key={playing.alert.alert_id}
                  alert={playing.alert}
                  startedAt={playing.started_at}
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <EmptyState compact title="Nothing playing">
                Alerts show up here while they play on your overlays.
              </EmptyState>
            </motion.div>
          )}
        </AnimatePresence>
        {waiting.length > 0 && (
          <ol aria-label="Waiting alerts" className="flex flex-col gap-1">
            <AnimatePresence initial={false}>
              {waiting.slice(0, 6).map((w) => (
                <motion.li
                  key={w.alert.alert_id}
                  layout={!reduce}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, transition: { duration: 0.12 } }}
                  className="group flex items-center gap-2.5 rounded-control px-2 py-1.5 hover:bg-surface-2"
                >
                  <PlatformMark platform={w.alert.platform} size={13} />
                  <span className="min-w-0 flex-1 truncate text-[13.5px] text-text-2">
                    {w.alert.title}
                  </span>
                  {w.priority > 0 && (
                    <span className="text-[11px] font-semibold text-tips">priority</span>
                  )}
                  <IconButton
                    size="sm"
                    label={`Remove “${w.alert.title}” from the queue`}
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={() =>
                      act(`rm-${w.alert.alert_id}`, () => client.queueRemove(w.alert.alert_id))
                    }
                  >
                    <X size={14} />
                  </IconButton>
                </motion.li>
              ))}
            </AnimatePresence>
            {waiting.length > 6 && (
              <li className="px-2 text-[12.5px] text-text-3">and {waiting.length - 6} more</li>
            )}
          </ol>
        )}
      </div>
      <Dialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        size="sm"
        title={`Clear ${waiting.length} waiting ${waiting.length === 1 ? 'alert' : 'alerts'}?`}
        description="They won’t play. The events stay in your feed, so you can replay any of them later."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmClear(false)}>
              Keep them
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmClear(false)
                act('clear', client.queueClear, 'Waiting alerts cleared.')
              }}
            >
              Clear
            </Button>
          </>
        }
      />
    </section>
  )
}

export function TtsApprovals() {
  const client = useClient()
  const tts = useLive((s) => s.tts)
  const setTts = useLive((s) => s.setTts)
  const { run } = useAction()
  const reduce = useReducedMotion()
  if (tts.length === 0) return null
  const decide = (t: TtsPending, ok: boolean) => {
    setTts(useLive.getState().tts.filter((x) => x.id !== t.id))
    void run(t.id, () => (ok ? client.ttsApprove(t.id) : client.ttsReject(t.id)))
  }
  return (
    <section
      aria-labelledby="tts-title"
      className="rounded-panel border border-warn/30 bg-surface-1 shadow-1"
    >
      <header className="flex items-center justify-between px-4 pt-3 sm:px-5">
        <h2 id="tts-title" className="font-display text-[15px] font-semibold tracking-tight">
          Read aloud?{' '}
          <span className="ml-1 font-mono text-[12px] font-medium text-text-3">{tts.length}</span>
        </h2>
        <p className="text-[12.5px] text-text-3">Nothing is read until you approve it.</p>
      </header>
      <ul className="flex flex-col gap-2 px-4 pt-3 pb-4 sm:px-5">
        <AnimatePresence initial={false}>
          {tts.map((t) => (
            <motion.li
              key={t.id}
              layout={!reduce}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              className="flex flex-col gap-2 rounded-[12px] border border-line bg-surface-2 p-3 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] text-text-3">
                  <span className="font-semibold text-text-2">{t.name}</span>
                  {t.amount && <> · {t.amount}</>} · {PLATFORM_LABEL[t.platform]}
                </p>
                <p dir="auto" className="mt-0.5 text-sm break-words text-text">
                  {t.text}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="ghost" onClick={() => decide(t, false)}>
                  Skip
                </Button>
                <Button size="sm" variant="primary" onClick={() => decide(t, true)}>
                  Read it
                </Button>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </section>
  )
}
