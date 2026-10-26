// OBS's Help › Log Files: the app's log (OBS's engine writes into it too), newest at the
// bottom. Problems are coloured and can be shown alone; Copy gives a bug report its text with
// stream keys and tokens already taken out by the engine. Nothing is uploaded anywhere.

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowClockwise, CopySimple, FolderOpen, MagnifyingGlass } from '@phosphor-icons/react'
import { describeError } from '@ferrocast/api'
import { Button, Dialog, Input, Segmented, Skeleton, copyText, cx, toast } from '@ferrocast/ui'
import { LoadError } from '../../Panel'
import { inDesktopApp } from '../../../lib/external'
import { useResource } from '../../../lib/hooks'
import { useDesk } from './common'

export type LogLevel = 'error' | 'warn' | 'info'

/** A line's level from tracing's format ("2026-… ERROR target: …") or libobs's words. */
export function levelOf(line: string): LogLevel {
  if (/\bERROR\b|\bpanicked\b|stopped unexpectedly/.test(line)) return 'error'
  if (/\bWARN\b/.test(line)) return 'warn'
  return 'info'
}

/** The lines shown: all, or only problems; and those holding the search (any case). */
export function visibleLines(lines: string[], only: 'all' | 'problems', q: string): string[] {
  const needle = q.trim().toLowerCase()
  return lines.filter(
    (l) =>
      (only === 'all' || levelOf(l) !== 'info') && (!needle || l.toLowerCase().includes(needle)),
  )
}

const TONE: Record<LogLevel, string> = {
  error: 'bg-danger-soft text-danger',
  warn: 'bg-warn-soft text-text',
  info: 'text-text-2',
}

export function LogDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} size="lg" title="Log">
      {open && <LogBody />}
    </Dialog>
  )
}

function LogBody() {
  const { api } = useDesk()
  const log = useResource(() => api.log(1500), [api])
  const [only, setOnly] = useState<'all' | 'problems'>('all')
  const [q, setQ] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const lines = useMemo(() => visibleLines(log.data?.lines ?? [], only, q), [log.data, only, q])
  const problems = useMemo(
    () => (log.data?.lines ?? []).filter((l) => levelOf(l) !== 'info').length,
    [log.data],
  )
  // Newest at the bottom, in view.
  useEffect(() => {
    const el = box.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines])
  const copy = async () => {
    const ok = await copyText(lines.join('\n'))
    toast(
      ok
        ? { tone: 'ok', message: 'Copied. Stream keys and tokens are already taken out.' }
        : { tone: 'error', message: 'Couldn’t copy.', hint: 'Select the lines and copy them.' },
    )
  }
  const show = async () => {
    try {
      await api.showLog()
    } catch (e) {
      const d = describeError(e)
      toast({ tone: 'error', message: d.message, ...(d.hint ? { hint: d.hint } : {}) })
    }
  }
  if (log.error && !log.data) return <LoadError error={log.error} onRetry={log.reload} />
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Show"
          size="sm"
          value={only}
          onChange={setOnly}
          options={[
            { value: 'all', label: 'Everything' },
            {
              value: 'problems',
              label: (
                <span className="inline-flex items-center gap-1.5">
                  Problems
                  <span
                    className={cx(
                      'rounded-full px-1.5 font-mono text-[12px] tabular-nums',
                      problems ? 'bg-danger-soft text-danger' : 'text-text-3',
                    )}
                  >
                    {problems}
                  </span>
                </span>
              ),
            },
          ]}
        />
        <label className="relative min-w-40 flex-1">
          <MagnifyingGlass
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-3"
            aria-hidden
          />
          <Input
            aria-label="Search the log"
            placeholder="Search, e.g. error…"
            className="h-9 pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <Button size="sm" icon={<ArrowClockwise size={15} />} onClick={log.reload}>
          Refresh
        </Button>
        <Button size="sm" icon={<CopySimple size={15} />} onClick={() => void copy()}>
          Copy
        </Button>
        {inDesktopApp() && (
          <Button size="sm" icon={<FolderOpen size={15} />} onClick={() => void show()}>
            Show file
          </Button>
        )}
      </div>
      {!log.data ? (
        <Skeleton className="h-[52vh]" />
      ) : (
        <div
          ref={box}
          role="log"
          aria-label="Log lines"
          tabIndex={0}
          className="fc-scroll h-[52vh] overflow-auto rounded-control border border-line bg-inset p-2 font-mono text-[12.5px] leading-relaxed"
        >
          {lines.length === 0 ? (
            <p className="m-0 p-3 font-sans text-[14px] text-text-2">
              {q || only === 'problems' ? 'Nothing matches.' : 'The log is empty.'}
            </p>
          ) : (
            lines.map((l, i) => (
              <div
                key={i}
                className={cx('rounded-[4px] px-2 break-all whitespace-pre-wrap', TONE[levelOf(l)])}
              >
                {l}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
