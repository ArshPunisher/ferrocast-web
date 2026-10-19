import { afterEach, describe, expect, it } from 'vitest'
import {
  WEEKLY_EMAIL_CONFIRMS_PER_DAY,
  addressHint,
  looksLikeEmail,
  nextReportAt,
  reportSchedule,
  weeklyEmailApi,
} from '../src/weekly-email'
import { remoteAllowed } from '../src/remote'
import { NO_PRO_FEATURES } from '../src/pro'
import { DemoEngine, DEMO_TOKEN } from '../src/demo'
import { FerroClient } from '../src/client'
import { ApiError } from '../src/errors'

describe('weekly email helpers', () => {
  it('checks addresses like the relay', () => {
    for (const ok of ['asha@gmail.com', ' a.b+c@mail.co.in ', 'x@y.co'])
      expect(looksLikeEmail(ok), ok).toBe(true)
    for (const bad of [
      '',
      'asha',
      'asha@',
      '@gmail.com',
      'a b@c.com',
      'a@b',
      'a@@b.com',
      'a@.com',
      'a@b.',
    ])
      expect(looksLikeEmail(bad), bad).toBe(false)
  })

  it('hints an address the way the relay does', () => {
    expect(addressHint('asha@Gmail.com')).toBe('a•••@gmail.com')
    expect(addressHint('Ä@x.de')).toBe('Ä•••@x.de')
  })

  // Finding: the card showed the relay's UTC weekday; a Monday 04:00 UTC report is Sunday
  // evening in Los Angeles.
  it('shows the day and time in the viewer’s own time zone', () => {
    const mon0400 = Date.UTC(2026, 9, 19, 4) // Mon 19 Oct 2026 04:00 UTC
    expect(
      reportSchedule({ day: 'Monday', next_at: mon0400 }, 0, 'America/Los_Angeles')?.weekday,
    ).toBe('Sunday')
    expect(reportSchedule({ day: 'Monday', next_at: mon0400 }, 0, 'Asia/Kolkata')?.weekday).toBe(
      'Monday',
    )
    // Without next_at (no address yet), from the relay's day.
    const sat = Date.UTC(2026, 9, 17, 12)
    expect(nextReportAt('Monday', sat)).toBe(mon0400)
    expect(nextReportAt('Monday', mon0400)).toBe(mon0400 + 7 * 86_400_000)
    expect(nextReportAt('Funday', sat)).toBeNull()
    expect(
      reportSchedule({ day: 'Monday', next_at: null }, sat, 'America/Los_Angeles')?.weekday,
    ).toBe('Sunday')
  })

  it('is a feature flag that starts off', () => {
    expect(NO_PRO_FEATURES.weekly_email).toBe(false)
  })

  it('an owner phone may look but not change it; a mod never', () => {
    expect(remoteAllowed('owner', 'GET', '/pro/history/email')).toBe(true)
    expect(remoteAllowed('owner', 'PUT', '/pro/history/email')).toBe(false)
    expect(remoteAllowed('owner', 'DELETE', '/pro/history/email')).toBe(false)
    expect(remoteAllowed('owner', 'GET', '/pro/history')).toBe(false)
    expect(remoteAllowed('mod', 'GET', '/pro/history/email')).toBe(false)
  })
})

describe('weekly email in the demo', () => {
  let engine: DemoEngine | null = null
  afterEach(() => {
    engine?.dispose()
    engine = null
  })
  const setup = (active: boolean, features = true) => {
    engine = new DemoEngine({
      autoplay: false,
      latencyMs: 0,
      pro: { salesOpen: true, active, features },
    })
    const c = new FerroClient({
      base: 'http://127.0.0.1:47820',
      token: DEMO_TOKEN,
      fetch: engine.fetch,
      sleep: async () => {},
    })
    return { c, api: weeklyEmailApi(c), engine }
  }
  const fails = async (p: Promise<unknown>) => {
    const e = await p.then(
      () => null,
      (x: unknown) => x,
    )
    expect(e).toBeInstanceOf(ApiError)
    return e as ApiError
  }

  it('needs Pro, and the feature on this relay', async () => {
    expect((await fails(setup(false).api.get())).status).toBe(402)
    engine?.dispose()
    const e = await fails(setup(true, false).api.get())
    expect([e.status, e.code]).toEqual([503, 'mail_unavailable'])
    expect(e.hint).toBeTruthy()
  })

  it('saves, waits for the confirm, turns on and stops', async () => {
    const { api, engine } = setup(true)
    expect((await api.get()).status).toBe('none')
    const bad = await fails(api.save('not-an-address'))
    expect([bad.status, bad.code]).toEqual([422, 'invalid_email'])
    expect(bad.hint).toContain('typos')
    const v = await api.save('Asha@Gmail.com')
    expect(v.status).toBe('pending')
    expect(v.address_hint).toBe('A•••@gmail.com')
    expect(v.expires_at).toBeGreaterThan(Date.now())
    engine.setWeeklyEmail({ confirm: true })
    const on = await api.get()
    expect(on.status).toBe('on')
    expect(on.next_at).toBeGreaterThan(Date.now())
    const dup = await fails(api.save('asha@gmail.com'))
    expect([dup.status, dup.code]).toEqual([409, 'already_on'])
    await api.stop()
    expect((await api.get()).status).toBe('none')
  })

  it('sends three confirm emails a day, then 429 with a wait', async () => {
    const { api } = setup(true)
    for (let i = 0; i < WEEKLY_EMAIL_CONFIRMS_PER_DAY; i++) await api.save('asha@gmail.com')
    const e = await fails(api.save('asha@gmail.com'))
    expect([e.status, e.code]).toEqual([429, 'mail_rate'])
    expect(e.hint).toContain('spam')
  })

  // Finding: saving a new address stopped the confirmed one at once.
  it('keeps the confirmed address on while a new one waits, then swaps', async () => {
    const { api, engine } = setup(true)
    engine.setWeeklyEmail({ status: 'on', address: 'asha@gmail.com' })
    const v = await api.save('new@example.com')
    expect([v.status, v.address_hint, v.pending_hint]).toEqual([
      'on',
      'a•••@gmail.com',
      'n•••@example.com',
    ])
    expect(v.expires_at).toBeGreaterThan(Date.now())
    engine.setWeeklyEmail({ confirm: true })
    const on = await api.get()
    expect([on.status, on.address_hint, on.pending_hint]).toEqual(['on', 'n•••@example.com', null])
    await api.save('third@example.com')
    await api.stop()
    expect(await api.get()).toMatchObject({ status: 'none', pending_hint: null })
  })

  it('says why it is paused, and survives an address it can’t show', async () => {
    const { api, engine } = setup(true)
    engine.setWeeklyEmail({ status: 'paused', pausedReason: 'unreadable', noHint: true })
    expect(await api.get()).toMatchObject({
      status: 'paused',
      paused_reason: 'unreadable',
      address_hint: null,
    })
  })

  it('shows a refused address as paused', async () => {
    const { api } = setup(true)
    const v = await api.save('bounce@example.com')
    expect([v.status, v.paused_reason]).toEqual(['paused', 'rejected'])
  })
})
