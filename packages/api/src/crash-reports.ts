// Opt-in crash reports (3.8.1). After a crash, an unclean exit, a hang or a serious error,
// the engine keeps ONE redacted report waiting on this PC and the dashboard asks once whether
// to send it. Engine routes (PC only, a phone never gets them): `GET /diagnostics/pending-report`,
// `POST /diagnostics/pending-report/send`, `DELETE /diagnostics/pending-report`.

import type { FerroClient } from './client'
import type { CrashReportsSetting } from './types'

export type CrashReportKind = 'crash' | 'error' | 'unclean_exit' | 'hang'

/** A report is waiting on this PC. */
export interface WaitingReport {
  pending: true
  kind: CrashReportKind
  /** When the report was made (ms since 1970). Together with `kind` it names the report, and
   * the send must name it back so a newer one is never sent by mistake. */
  created_ms: number
  /** The exact text that would be sent, already redacted. Plain text: never render it as HTML. */
  preview_text: string
}

/** Nothing is waiting: the engine answers 200 with nulls (not a 404). */
export interface NoReport {
  pending: false
  kind: null
  created_ms: null
  preview_text: null
}

/** `GET /api/v1/diagnostics/pending-report`. The engine builds the report a few seconds after
 * it starts, so an early answer can be `pending: false`: ask again for a short while. */
export type PendingReport = WaitingReport | NoReport

/** Why a send stayed on this PC (the report is never lost): `relay_too_old` (silent),
 * `rate_limited`, `too_large`, `rejected`, `relay_unavailable`. */
export type SendReportReason =
  'relay_too_old' | 'rate_limited' | 'too_large' | 'rejected' | 'relay_unavailable'

/** `POST /api/v1/diagnostics/pending-report/send` `{ created_ms }`. 404 `no_pending_report` when
 * nothing waits, 409 `conflict` when a different report waits now (nothing was sent). */
export interface SendReportResult {
  sent: boolean
  reason?: SendReportReason | (string & {})
}

export function crashReportsApi(c: FerroClient) {
  return {
    pending: () => c.request<PendingReport>('GET', '/api/v1/diagnostics/pending-report'),
    /** `createdMs`: the `created_ms` of the report the person was shown. */
    send: (createdMs?: number) =>
      c.request<SendReportResult>(
        'POST',
        '/api/v1/diagnostics/pending-report/send',
        createdMs === undefined ? {} : { created_ms: createdMs },
      ),
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
