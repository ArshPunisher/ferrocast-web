// Opt-in crash reports in the demo (`/api/v1/diagnostics/pending-report`, PC only). By default
// nothing is waiting; a test (or `?crash=crash|error|unclean_exit|hang`) leaves one. Send
// answers `{ sent: true }`, or keeps it on this PC with a reason the real relay gives
// (`relay_too_old`, `rate_limited`, `too_large`, `rejected`, `relay_unavailable`) when asked to;
// a send clears it only when it was sent. Like the engine, the report can show up a few seconds
// after start (`appearsAfterMs`), a send naming another `created_ms` is a 409 `conflict`, and
// a send with nothing waiting is a 404 `no_pending_report`.

import type { CrashReportKind, PendingReport, SendReportResult } from '../../crash-reports'
import { HttpError } from '../http-error'
import { NOT_MINE, clone, requireObj, type DemoFeature, type Routed } from './host'

export interface DemoCrashReportState {
  /** Leave a report waiting of this kind; `null` clears it. */
  pending?: CrashReportKind | null
  /** When it was made (default: a fixed time, so a reload is the same report). */
  createdMs?: number
  /** The text that would be sent (default: a short redacted sample). */
  previewText?: string
  /** What Send does: `ok` (default), or stays on this PC (`old`, `limited`, `other`), or errors. */
  send?: 'ok' | 'old' | 'limited' | 'other' | 'fail'
  /** The report is only there this long after it is set (the engine builds it a few seconds
   * after start); until then the engine answers `pending: false`. Default 0: at once. */
  appearsAfterMs?: number
}

const SAMPLE = `== SUMMARY ==
Ferrocast 3.8.1 on macOS 15.2 (aarch64)
Likely cause: the encoder stopped answering.

== PANIC ==
thread 'encoder' panicked at crates/engine/src/encode.rs:212:9
called \`Option::unwrap()\` on a \`None\` value

== LOG (last 200 lines, redacted) ==
12:01:07 INFO  stream started key=[REDACTED]
12:01:09 WARN  encoder lagging
12:01:11 ERROR encoder gone, path=/Users/[REDACTED_USER]/Library/Logs/ferrocast.log`

const FIXED_CREATED_MS = 1_700_000_000_000

export class DemoCrashReports implements DemoFeature {
  private kind: CrashReportKind | null = null
  private created = 0
  private text = SAMPLE
  private sendMode: NonNullable<DemoCrashReportState['send']> = 'ok'
  private visibleAt = 0
  /** How many times Send ran (tests). */
  sends = 0
  /** How many times the dashboard asked whether a report waits (tests). */
  looks = 0
  /** The `created_ms` of the last Send, or `null` when it named none (tests). */
  lastSendCreatedMs: number | null = null

  /** Whether a report is still waiting (tests). */
  get waiting(): boolean {
    return this.kind !== null
  }

  setState(s: DemoCrashReportState): void {
    if (s.pending !== undefined) {
      this.kind = s.pending
      this.created = s.createdMs ?? FIXED_CREATED_MS
      this.visibleAt = Date.now() + (s.appearsAfterMs ?? 0)
    }
    if (s.createdMs !== undefined) this.created = s.createdMs
    if (s.previewText !== undefined) this.text = s.previewText
    if (s.send !== undefined) this.sendMode = s.send
  }

  private view(): PendingReport {
    this.looks += 1
    return this.kind && Date.now() >= this.visibleAt
      ? clone({
          pending: true,
          kind: this.kind,
          created_ms: this.created,
          preview_text: this.text,
        })
      : { pending: false, kind: null, created_ms: null, preview_text: null }
  }

  private send(body: unknown): SendReportResult {
    if (!this.kind) throw new HttpError(404, 'no_pending_report', 'No crash report is waiting.')
    const named = body === undefined || body === null ? undefined : requireObj(body).created_ms
    if (named !== undefined && named !== null && typeof named !== 'number')
      throw new HttpError(400, 'invalid', 'created_ms: use a number.')
    if (typeof named === 'number' && named !== this.created)
      throw new HttpError(
        409,
        'conflict',
        'A different crash report is waiting now. Look at it again before sending.',
      )
    this.sends += 1
    this.lastSendCreatedMs = typeof named === 'number' ? named : null
    switch (this.sendMode) {
      case 'old':
        return { sent: false, reason: 'relay_too_old' }
      case 'limited':
        return { sent: false, reason: 'rate_limited' }
      case 'other':
        return { sent: false, reason: 'relay_unavailable' }
      case 'fail':
        throw new HttpError(
          502,
          'relay_unreachable',
          'Ferrocast couldn’t reach its server.',
          'The report stays on this PC. Try again later.',
        )
      default:
        this.kind = null
        return { sent: true }
    }
  }

  route(method: string, seg: string[], body?: unknown): Routed {
    if (seg[0] !== 'diagnostics' || seg[1] !== 'pending-report') return NOT_MINE
    if (seg.length === 2) {
      if (method === 'GET') return this.view()
      if (method === 'DELETE') {
        this.kind = null
        return undefined
      }
    }
    if (seg.length === 3 && seg[2] === 'send' && method === 'POST') return this.send(body)
    return NOT_MINE
  }
}
