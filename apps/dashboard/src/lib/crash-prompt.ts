// Rules for the "Ferrocast closed unexpectedly" prompt (opt-in crash reports, 3.8.1).
// The prompt shows once for one waiting report, only on the PC's own window, only while the
// setting is "ask".

import type { CrashReportsSetting, PendingReport, SendReportResult } from '@ferrocast/api'
import type { ToastTone } from '@ferrocast/ui'
import type { Connection } from './boot'

const SEEN_KEY = 'fc-crash-prompt-seen'

/** Sent on `window` after the prompt saved "Always", so an open Settings page reloads and
 * doesn't write the old choice back on its next save. */
export const CRASH_REPORTS_EVENT = 'fc-crash-reports-change'

/** Names one waiting report: the same report never asks twice, a new crash asks again. */
export function reportId(r: Pick<PendingReport, 'kind' | 'created_ms'>): string {
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
): report is PendingReport {
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
