// "Ferrocast closed unexpectedly": the one calm question after a crash (opt-in reports, 3.8.1).
// Shown once per waiting report, on the PC's own window, while the setting is "ask". The
// report's text is shown exactly as it would be sent, as plain text.

import { useEffect, useId, useState } from 'react'
import { crashReportTitle, crashReportsApi, describeError } from '@ferrocast/api'
import type { PendingReport, WaitingReport } from '@ferrocast/api'
import { Button, Dialog, toast } from '@ferrocast/ui'
import { useLive } from '../lib/store'
import {
  CRASH_REPORTS_EVENT,
  crashPromptAllowed,
  CRASH_POLL_MS,
  CRASH_POLL_RETRIES,
  markShown,
  nothingToSend,
  otherDialogOpen,
  reportId,
  reportsUnavailable,
  sendConflict,
  sendNotice,
  shouldAsk,
} from '../lib/crash-prompt'

/** How often a waiting prompt checks whether another dialog has closed. */
const RETRY_MS = 1500

export function CrashReportPrompt() {
  const conn = useLive((s) => s.conn)
  const allowed = crashPromptAllowed(conn)
  const client = conn?.client
  const [report, setReport] = useState<WaitingReport | null>(null)
  const [open, setOpen] = useState(false)
  const [always, setAlways] = useState(false)
  const [busy, setBusy] = useState<'send' | 'discard' | null>(null)
  // Bumped to look for a waiting report again (a send found a different one waiting).
  const [round, setRound] = useState(0)
  const textId = useId()

  // Is a report waiting, and does the setting say ask? The engine builds the report a few
  // seconds after start, so this looks again every 2 s for up to 30 s (visible time only) and
  // stops at the first report it finds, or on a "no reports here" answer. One look at a time.
  useEffect(() => {
    if (!allowed || !client) return
    let alive = true
    let finished = false
    let busy = false
    let warned = false
    let looks = 0
    let timer: number | undefined
    const api = crashReportsApi(client)

    const look = async () => {
      timer = undefined
      // A hidden window pauses; coming back (below) looks again.
      if (!alive || finished || busy || document.hidden) return
      busy = true
      looks += 1
      try {
        let pending: PendingReport | null = null
        try {
          pending = await api.pending()
        } catch (e) {
          // An engine without reports, or one that can't answer yet: no prompt, not an error.
          if (reportsUnavailable(e)) {
            finished = true
            return
          }
          if (!warned) console.warn('Crash report check failed', describeError(e).message)
          warned = true
        }
        if (!alive) return
        if (pending?.pending) {
          finished = true
          let setting
          try {
            setting = (await client.settings()).crash_reports
          } catch (e) {
            console.warn('Crash report setting could not be read', describeError(e).message)
            return
          }
          if (alive && shouldAsk(pending, setting)) setReport(pending)
          return
        }
        if (looks > CRASH_POLL_RETRIES) finished = true
      } finally {
        busy = false
        if (alive && !finished && !document.hidden) timer = window.setTimeout(look, CRASH_POLL_MS)
      }
    }
    const back = () => {
      if (!document.hidden && !finished && !busy && timer === undefined) void look()
    }
    document.addEventListener('visibilitychange', back)
    void look()
    return () => {
      alive = false
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', back)
    }
  }, [allowed, client, round])

  // Waits for any other dialog to close (never one over another), then opens, and remembers
  // at once that it was shown, so a reload doesn't ask again.
  useEffect(() => {
    if (!report || open) return
    const tryOpen = () => {
      if (otherDialogOpen()) return false
      markShown(reportId(report))
      setOpen(true)
      return true
    }
    if (tryOpen()) return
    const t = window.setInterval(() => {
      if (tryOpen()) window.clearInterval(t)
    }, RETRY_MS)
    return () => window.clearInterval(t)
  }, [report, open])

  if (!report || !client) return null

  const finish = () => {
    setOpen(false)
    setReport(null)
    setAlways(false)
    setBusy(null)
  }

  // Escape, the X and a click outside: not now. The report stays on this PC.
  const dismiss = () => {
    if (busy) return
    finish()
  }

  const send = async () => {
    setBusy('send')
    if (always) {
      try {
        // Only this one field: a save of the whole settings would be ignored for it.
        await client.saveCrashReports('always')
        window.dispatchEvent(new Event(CRASH_REPORTS_EVENT))
      } catch (e) {
        const d = describeError(e)
        toast({
          tone: 'warn',
          message: 'Couldn’t save “Always send”.',
          hint: d.hint ? `${d.message} ${d.hint}` : d.message,
        })
      }
    }
    try {
      // Names the report that was shown: the engine refuses it if another one waits now.
      const result = await crashReportsApi(client).send(report.created_ms)
      toast(sendNotice(result))
    } catch (e) {
      if (sendConflict(e)) {
        // A newer report is waiting and nothing was sent: quietly ask about that one instead.
        finish()
        setRound((n) => n + 1)
        return
      }
      // Nothing waits any more (it went out or was removed another way): nothing to say.
      if (nothingToSend(e)) {
        finish()
        return
      }
      const d = describeError(e)
      toast({
        tone: 'info',
        message: 'The report stays on this PC.',
        hint: d.hint ? `${d.message} ${d.hint}` : d.message,
      })
    }
    finish()
  }

  const discard = async () => {
    setBusy('discard')
    try {
      await crashReportsApi(client).discard()
    } catch (e) {
      const d = describeError(e)
      toast({ tone: 'warn', message: 'Couldn’t remove the report.', hint: d.message })
    }
    finish()
  }

  return (
    <Dialog
      open={open}
      onClose={dismiss}
      size="sm"
      title={crashReportTitle(report.kind)}
      description="Send a report to help fix it? Stream keys, passwords, tokens and emails are removed first."
      footer={
        <>
          <Button variant="ghost" disabled={busy !== null} onClick={() => void discard()}>
            Don’t send
          </Button>
          <Button
            variant="primary"
            busy={busy === 'send'}
            disabled={busy !== null}
            onClick={() => void send()}
          >
            Send
          </Button>
        </>
      }
    >
      <div data-testid="crash-report-prompt" className="flex flex-col gap-3 pt-1">
        <details className="rounded-control border border-line bg-inset">
          <summary className="fc-press cursor-pointer rounded-control px-3 py-2 text-[14.5px] font-semibold text-text focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none">
            See what’s sent
          </summary>
          {/* Plain text only: React escapes it, nothing in it is ever treated as HTML. */}
          <pre
            tabIndex={0}
            aria-label="The report, as plain text"
            data-testid="crash-report-text"
            className="m-0 max-h-[40dvh] overflow-auto border-t border-line px-3 py-2.5 font-mono text-[12.5px] leading-relaxed break-words whitespace-pre-wrap text-text-2 focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
          >
            {report.preview_text}
          </pre>
        </details>
        <label
          htmlFor={textId}
          className="flex cursor-pointer items-start gap-3 text-[14.5px] text-text"
        >
          <input
            id={textId}
            type="checkbox"
            className="mt-1 size-4 shrink-0 accent-[var(--fc-arc)]"
            checked={always}
            disabled={busy !== null}
            onChange={(e) => setAlways(e.target.checked)}
          />
          <span>Always send</span>
        </label>
      </div>
    </Dialog>
  )
}
