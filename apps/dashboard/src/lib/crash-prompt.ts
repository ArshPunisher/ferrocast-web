// Rules for the "Ferrocast closed unexpectedly" prompt (opt-in crash reports, 3.8.1).
// The prompt shows once for one waiting report, only on the PC's own window, only while the
// setting is "ask".

import { ApiError } from '@ferrocast/api'
import type {
  CrashReportsSetting,
  PendingReport,
  SendReportResult,
  WaitingReport,
} from '@ferrocast/api'
import type { ToastTone } from '@ferrocast/ui'
import type { Connection } from './boot'

const SEEN_KEY = 'fc-crash-prompt-seen'

/**
 * The engine builds the report in the background a few seconds after it starts, so one look at
 * start-up can find nothing. The prompt looks again every `CRASH_POLL_MS`, at most
 * `CRASH_POLL_RETRIES` more times (30 s in all), and only while the window is visible (a
 * hidden window pauses, it doesn't use up the time). It stops at the first report it finds.
 */
export const CRASH_POLL_MS = 2000
export const CRASH_POLL_RETRIES = 15

/** An engine without the routes (404), or one that won't let this window use them (403): no
 * prompt, and no point looking again. */
export function reportsUnavailable(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 404 || e.status === 403)
}

/** A send that found a different report waiting than the one shown (409 `conflict`): nothing
 * was sent, so ask about the one that is there now. */
export function sendConflict(e: unknown): boolean {
  return e instanceof ApiError && e.status === 409
}

/** A send when nothing waits any more (404 `no_pending_report`: another path sent or removed it). */
export function nothingToSend(e: unknown): boolean {
  return e instanceof ApiError && e.status === 404
}

/** Sent on `window` after the prompt saved "Always", so an open Settings page reloads and
 * doesn't write the old choice back on its next save. */
export const CRASH_REPORTS_EVENT = 'fc-crash-reports-change'

/** Names one waiting report: the same report never asks twice, a new crash asks again. */
export function reportId(r: Pick<WaitingReport, 'kind' | 'created_ms'>): string {
  return `${r.kind}:${r.created_ms}`
}

export function wasShown(id: string): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === id
  } catch {
    return false
  }
}

export function markShown(id: string): void {
  try {
    localStorage.setItem(SEEN_KEY, id)
  } catch {
    // private mode: the engine's own copy is still only sent on a yes
  }
}

/**
 * Only the PC's own window is asked: the desktop app (and the demo, which is its stand-in).
 * A browser linked from another device, a phone through the servers and cloud mode never are:
 * the report is about the app on the PC.
 */
export function crashPromptAllowed(conn: Connection | null | undefined): boolean {
  if (!conn || conn.remote || conn.cloud) return false
  return conn.mode === 'desktop' || conn.mode === 'demo'
}

/** The setting when the engine has none (an older one): the default, ask. */
export function effectiveSetting(v: CrashReportsSetting | undefined): CrashReportsSetting {
  return v === 'always' || v === 'never' ? v : 'ask'
}

/** Whether to ask now. */
export function shouldAsk(
  report: PendingReport | null,
  setting: CrashReportsSetting | undefined,
  alreadyShown: (id: string) => boolean = wasShown,
): report is WaitingReport {
  if (!report || report.pending !== true) return false
  if (effectiveSetting(setting) !== 'ask') return false
  return !alreadyShown(reportId(report))
}

export interface SendNotice {
  tone: ToastTone
  message: string
  hint?: string
}

/** What to tell the streamer after Send: thanks, or that it stayed on this PC (quietly). */
export function sendNotice(r: SendReportResult): SendNotice {
  if (r.sent) return { tone: 'ok', message: 'Report sent. Thank you.' }
  return {
    tone: 'info',
    message: 'The report stays on this PC.',
    hint: 'You can still save a support report in Settings, Advanced.',
  }
}

/**
 * Whether another dialog is open right now. Every dialog here is a native `<dialog>` (Dialog,
 * Confirm, Sheet, the Pro unlock), so one at a time means the prompt waits its turn.
 */
export function otherDialogOpen(): boolean {
  return document.querySelector('dialog[open]') !== null
}
