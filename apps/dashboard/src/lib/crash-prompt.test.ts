import { afterEach, describe, expect, it } from 'vitest'
import type { NoReport, WaitingReport } from '@ferrocast/api'
import type { Connection } from './boot'
import {
  crashPromptAllowed,
  effectiveSetting,
  markShown,
  reportId,
  sendNotice,
  shouldAsk,
  wasShown,
} from './crash-prompt'

const none: NoReport = { pending: false, kind: null, created_ms: null, preview_text: null }
const waiting: WaitingReport = {
  pending: true,
  kind: 'crash',
  created_ms: 1_700_000_000_000,
  preview_text: 'text',
}

afterEach(() => localStorage.clear())

describe('shouldAsk', () => {
  it('asks for a waiting report while the setting is ask (or missing)', () => {
    expect(shouldAsk(waiting, 'ask')).toBe(true)
    expect(shouldAsk(waiting, undefined)).toBe(true)
  })
  it('never asks for always, never, or nothing waiting', () => {
    expect(shouldAsk(waiting, 'always')).toBe(false)
    expect(shouldAsk(waiting, 'never')).toBe(false)
    expect(shouldAsk(none, 'ask')).toBe(false)
    expect(shouldAsk(null, 'ask')).toBe(false)
  })
  it('asks once per report, again for a newer one', () => {
    expect(shouldAsk(waiting, 'ask')).toBe(true)
    markShown(reportId(waiting))
    expect(wasShown(reportId(waiting))).toBe(true)
    expect(shouldAsk(waiting, 'ask')).toBe(false)
    expect(shouldAsk({ ...waiting, created_ms: waiting.created_ms + 1 }, 'ask')).toBe(true)
    expect(shouldAsk({ ...waiting, kind: 'hang' }, 'ask')).toBe(true)
  })
  it('treats an unknown setting as ask', () => {
    expect(effectiveSetting('sometimes' as never)).toBe('ask')
  })
})

describe('crashPromptAllowed', () => {
  const conn = (c: Partial<Connection>) => ({ mode: 'desktop', ...c }) as Connection
  it('is for the PC’s own window only', () => {
    expect(crashPromptAllowed(conn({ mode: 'desktop' }))).toBe(true)
    expect(crashPromptAllowed(conn({ mode: 'demo' }))).toBe(true)
    expect(crashPromptAllowed(conn({ mode: 'browser' }))).toBe(false)
    expect(crashPromptAllowed(conn({ mode: 'remote' }))).toBe(false)
    expect(crashPromptAllowed(conn({ mode: 'cloud' }))).toBe(false)
    expect(crashPromptAllowed(conn({ mode: 'demo', cloud: true }))).toBe(false)
    expect(crashPromptAllowed(conn({ mode: 'demo', remote: { role: 'owner' } as never }))).toBe(
      false,
    )
    expect(crashPromptAllowed(null)).toBe(false)
  })
})

describe('sendNotice', () => {
  it('thanks after a send', () => {
    expect(sendNotice({ sent: true })).toMatchObject({ tone: 'ok' })
  })
  it('says quietly that it stays on this PC, for every reason', () => {
    for (const reason of ['relay_too_old', 'rate_limited', 'offline', undefined]) {
      const n = sendNotice(reason ? { sent: false, reason } : { sent: false })
      expect(n.tone).toBe('info')
      expect(n.message).toContain('stays on this PC')
    }
  })
})
