// Opt-in crash reports (3.8.1). After a crash, an unclean exit, a hang or a serious error,
// the engine keeps ONE redacted report waiting on this PC and the dashboard asks once whether
// to send it. Engine routes (PC only, a phone never gets them): `GET /diagnostics/pending-report`,
// `POST /diagnostics/pending-report/send`, `DELETE /diagnostics/pending-report`.

import type { FerroClient } from './client'
import type { CrashReportsSetting } from './types'

export type CrashReportKind = 'crash' | 'error' | 'unclean_exit' | 'hang'

/** `GET /api/v1/diagnostics/pending-report`. The other fields are only there when `pending`. */
export interface PendingReport {
  pending: boolean
  kind: CrashReportKind
  /** When the report was made (ms since 1970). Together with `kind` it names the report. */
  created_ms: number
  /** The exact text that would be sent, already redacted. Plain text: never render it as HTML. */
  preview_text: string
}

/** `POST /api/v1/diagnostics/pending-report/send`. */
export interface SendReportResult {
  sent: boolean
  /** Why it stayed on this PC: `relay_too_old`, `rate_limited`, or another short code. */
  reason?: 'relay_too_old' | 'rate_limited' | (string & {})
}

export function crashReportsApi(c: FerroClient) {
  return {
    pending: () => c.request<PendingReport>('GET', '/api/v1/diagnostics/pending-report'),
    send: () => c.request<SendReportResult>('POST', '/api/v1/diagnostics/pending-report/send'),
    discard: () => c.request<void>('DELETE', '/api/v1/diagnostics/pending-report'),
  }
}

/** Whether the setting is a value this build knows (an engine of the future may add one). */
export function isCrashReportsSetting(v: unknown): v is CrashReportsSetting {
  return v === 'ask' || v === 'always' || v === 'never'
}

/** The dialog's title for what happened. */
export function crashReportTitle(kind: CrashReportKind | string): string {
  switch (kind) {
    case 'crash':
    case 'unclean_exit':
      return 'Ferrocast closed unexpectedly'
    case 'hang':
      return 'Ferrocast stopped responding'
    case 'error':
      return 'Ferrocast hit a serious problem'
    default:
      return 'Ferrocast had a problem'
  }
}
