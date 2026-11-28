import { afterEach, describe, expect, it, vi } from 'vitest'
import { crashReportTitle, crashReportsApi, isCrashReportsSetting } from '../src/crash-reports'
import { OWNER_HIDDEN_SETTINGS, remoteAllowed } from '../src/remote'
import { DemoEngine, DEMO_TOKEN } from '../src/demo'
import { FerroClient } from '../src/client'
import { ApiError } from '../src/errors'

describe('crash report helpers', () => {
  it('knows the three settings', () => {
    for (const v of ['ask', 'always', 'never']) expect(isCrashReportsSetting(v)).toBe(true)
    for (const v of ['', 'sometimes', null, undefined, true])
      expect(isCrashReportsSetting(v)).toBe(false)
  })
  it('words the title for what happened', () => {
    expect(crashReportTitle('crash')).toBe('Ferrocast closed unexpectedly')
    expect(crashReportTitle('unclean_exit')).toBe('Ferrocast closed unexpectedly')
    expect(crashReportTitle('hang')).toBe('Ferrocast stopped responding')
    expect(crashReportTitle('error')).toBe('Ferrocast hit a serious problem')
    expect(crashReportTitle('future_kind')).toBe('Ferrocast had a problem')
  })
  it('is PC only: a phone never reaches the routes, nor the Privacy settings', () => {
    for (const role of ['owner', 'mod'] as const) {
      expect(remoteAllowed(role, 'GET', '/diagnostics/pending-report')).toBe(false)
      expect(remoteAllowed(role, 'POST', '/diagnostics/pending-report/send')).toBe(false)
      expect(remoteAllowed(role, 'DELETE', '/diagnostics/pending-report')).toBe(false)
    }
    expect(OWNER_HIDDEN_SETTINGS).toContain('privacy')
  })
})

describe('crash reports in the demo', () => {
  let engine: DemoEngine | null = null
  afterEach(() => {
    engine?.dispose()
    engine = null
  })
  const setup = () => {
    engine = new DemoEngine({ autoplay: false, latencyMs: 0 })
    const c = new FerroClient({
      base: 'http://127.0.0.1:47820',
      token: DEMO_TOKEN,
      fetch: engine.fetch,
    })
    return { engine, c, api: crashReportsApi(c) }
  }

  it('has nothing waiting at first, and the setting is ask', async () => {
    const { c, api } = setup()
    // The engine's answer when nothing waits: 200 with nulls, never a 404.
    expect(await api.pending()).toEqual({
      pending: false,
      kind: null,
      created_ms: null,
      preview_text: null,
    })
    expect((await c.settings()).crash_reports).toBe('ask')
  })

  it('shows the report only after a while, like the engine building it after start', async () => {
    const { engine, api } = setup()
    const real = Date.now()
    let now = real
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => now)
    try {
      engine.setCrashReport({ pending: 'crash', appearsAfterMs: 60_000 })
      expect((await api.pending()).pending).toBe(false)
      now = real + 61_000
      expect((await api.pending()).pending).toBe(true)
      expect(engine.crashReports.looks).toBe(2)
    } finally {
      spy.mockRestore()
    }
  })

  it('sends the created_ms in the body, and refuses another report with a 409', async () => {
    const { engine, api } = setup()
    engine.setCrashReport({ pending: 'crash', createdMs: 5000 })
    await expect(api.send(4000)).rejects.toMatchObject({ status: 409, code: 'conflict' })
    expect(engine.crashReports.sends).toBe(0)
    expect(engine.crashReports.waiting).toBe(true)
    // Naming none sends whatever waits (the engine's own rule), with a body or without one.
    expect(await api.send()).toEqual({ sent: true })
    expect(engine.crashReports.lastSendCreatedMs).toBeNull()
  })

  it('shows the waiting report, and Send clears it', async () => {
    const { engine, api } = setup()
    engine.setCrashReport({ pending: 'crash' })
    const p = await api.pending()
    expect(p).toMatchObject({ pending: true, kind: 'crash', created_ms: 1_700_000_000_000 })
    expect(p.preview_text?.length).toBeGreaterThan(20)
    expect(await api.send(1_700_000_000_000)).toEqual({ sent: true })
    expect(engine.crashReports.lastSendCreatedMs).toBe(1_700_000_000_000)
    expect((await api.pending()).pending).toBe(false)
  })

  it('keeps it on this PC when the relay is old or the limit is hit', async () => {
    const { engine, api } = setup()
    engine.setCrashReport({ pending: 'error', send: 'old' })
    expect(await api.send()).toEqual({ sent: false, reason: 'relay_too_old' })
    engine.setCrashReport({ send: 'limited' })
    expect(await api.send()).toEqual({ sent: false, reason: 'rate_limited' })
    engine.setCrashReport({ send: 'other' })
    expect(await api.send()).toEqual({ sent: false, reason: 'relay_unavailable' })
    expect((await api.pending()).pending).toBe(true)
  })

  it('a send with no body at all sends whatever waits', async () => {
    const { engine, c } = setup()
    engine.setCrashReport({ pending: 'crash' })
    expect(await c.request('POST', '/api/v1/diagnostics/pending-report/send')).toEqual({
      sent: true,
    })
    expect(engine.crashReports.lastSendCreatedMs).toBeNull()
  })

  it('Delete removes it; Send with nothing waiting is a 404', async () => {
    const { engine, api } = setup()
    engine.setCrashReport({ pending: 'hang' })
    await api.discard()
    expect((await api.pending()).pending).toBe(false)
    await expect(api.send(1)).rejects.toMatchObject({
      status: 404,
      code: 'no_pending_report',
    } satisfies Partial<ApiError>)
  })

  it('saves the setting and refuses a value it doesn’t know', async () => {
    const { c } = setup()
    const s = await c.settings()
    expect((await c.saveSettings({ ...s, crash_reports: 'never' })).crash_reports).toBe('never')
    await expect(
      c.saveSettings({ ...s, crash_reports: 'sometimes' as never }),
    ).rejects.toMatchObject({ status: 400 })
  })
})
