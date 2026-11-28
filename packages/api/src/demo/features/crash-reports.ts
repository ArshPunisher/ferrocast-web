// Opt-in crash reports in the demo (`/api/v1/diagnostics/pending-report`, PC only). By default
// nothing is waiting; a test (or `?crash=crash|error|unclean_exit|hang`) leaves one. Send
// answers `{ sent: true }`, or keeps it on this PC with a reason the real relay gives
// (`relay_too_old`, `rate_limited`) when asked to; a send clears it only when it was sent.

import type { CrashReportKind, PendingReport, SendReportResult } from '../../crash-reports'
import { HttpError } from '../http-error'
import { NOT_MINE, clone, type DemoFeature, type Routed } from './host'

export interface DemoCrashReportState {
  /** Leave a report waiting of this kind; `null` clears it. */
  pending?: CrashReportKind | null
  /** When it was made (default: a fixed time, so a reload is the same report). */
  createdMs?: number
  /** The text that would be sent (default: a short redacted sample). */
  previewText?: string
  /** What Send does: `ok` (default), or stays on this PC (`old`, `limited`, `other`), or errors. */
  send?: 'ok' | 'old' | 'limited' | 'other' | 'fail'
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
  /** How many times Send ran (tests). */
  sends = 0

  /** Whether a report is still waiting (tests). */
  get waiting(): boolean {
    return this.kind !== null
  }

  setState(s: DemoCrashReportState): void {
    if (s.pending !== undefined) {
      this.kind = s.pending
      this.created = s.createdMs ?? FIXED_CREATED_MS
    }
    if (s.createdMs !== undefined) this.created = s.createdMs
    if (s.previewText !== undefined) this.text = s.previewText
    if (s.send !== undefined) this.sendMode = s.send
  }

  private view(): PendingReport {
    return this.kind
      ? clone({
          pending: true,
          kind: this.kind,
          created_ms: this.created,
          preview_text: this.text,
        })
      : { pending: false, kind: 'crash', created_ms: 0, preview_text: '' }
  }

  private send(): SendReportResult {
    if (!this.kind)
      throw new HttpError(404, 'no_pending_report', 'There is no report waiting to be sent.')
    this.sends += 1
    switch (this.sendMode) {
      case 'old':
        return { sent: false, reason: 'relay_too_old' }
      case 'limited':
        return { sent: false, reason: 'rate_limited' }
      case 'other':
        return { sent: false, reason: 'offline' }
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

  route(method: string, seg: string[]): Routed {
    if (seg[0] !== 'diagnostics' || seg[1] !== 'pending-report') return NOT_MINE
    if (seg.length === 2) {
      if (method === 'GET') return this.view()
      if (method === 'DELETE') {
        this.kind = null
        return undefined
      }
    }
    if (seg.length === 3 && seg[2] === 'send' && method === 'POST') return this.send()
    return NOT_MINE
  }
}
