// The ready check after Start (owner, 30 Oct): only what matters for the Studio, problems only,
// plus a silent mic, and what came back after Ferrocast closed unexpectedly.

import type { EngineCaptureProblem, EngineRecovered, PreflightCheck } from '@ferrocast/api'
import { captureWords } from './doctor'

/** Pre-flight checks that are about the Studio itself (not platforms, Discord or stream info). */
const STUDIO_IDS = /^(obs|scenes|starting_scene|live_scene|ending_scene|disk|replay|mic:.+|cam:.+)$/

/** Below this peak the whole time, a mic is silent (dBFS). */
export const SILENT_DB = -60

/** The problems to show: the Studio's failing or warning checks. */
export function studioProblems(checks: PreflightCheck[]): PreflightCheck[] {
  return checks.filter((c) => STUDIO_IDS.test(c.id) && (c.status === 'fail' || c.status === 'warn'))
}

/** Mics that heard nothing in every sample (peaks in dBFS, both channels). A mic already
 * flagged (muted) isn't flagged twice; one never sampled isn't called silent. */
export function silentMics(
  samples: Record<string, number[]>,
  already: PreflightCheck[] = [],
): PreflightCheck[] {
  return Object.entries(samples)
    .filter(([, peaks]) => peaks.length > 0 && Math.max(...peaks) < SILENT_DB)
    .filter(([name]) => !already.some((c) => c.id === `mic:${name}`))
    .map(([name]) => ({
      id: `silent:${name}`,
      label: name,
      status: 'warn' as const,
      detail: 'No sound for 3 seconds. Check it’s plugged in and picked in its settings.',
      fix: null,
    }))
}

/** Captures that show nothing, as checks (screen permission gets System Settings' fix). */
export function captureChecks(list: EngineCaptureProblem[] | undefined): PreflightCheck[] {
  return (list ?? []).map((p) => ({
    id: `capture:${p.source}`,
    label: p.source,
    status: 'warn' as const,
    detail: captureWords(p),
    fix: null,
  }))
}

/** The line after a crash: what came back, what didn't, and the stream left to the streamer. */
export function recoveredWords(r: EngineRecovered): string[] {
  const lines = ['Ferrocast closed unexpectedly last time. Your scenes are back.']
  if (r.again.length) lines.push(`Back on: ${r.again.join(' and ')}.`)
  lines.push(...r.failed)
  if (r.live) lines.push('You were live: press Go live to stream again.')
  return lines
}
