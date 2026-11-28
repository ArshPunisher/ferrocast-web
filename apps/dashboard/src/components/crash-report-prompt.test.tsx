import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  ApiError,
  type NoReport,
  type PendingReport,
  type SendReportResult,
  type WaitingReport,
} from '@ferrocast/api'
import { Toaster, currentToasts, dismissToast } from '@ferrocast/ui'
import { useLive } from '../lib/store'
import { CrashReportPrompt } from './crash-report-prompt'

let root: Root | null = null

const XSS = '<img src=x onerror=alert(1)>'
const none: NoReport = { pending: false, kind: null, created_ms: null, preview_text: null }
const waiting: WaitingReport = {
  pending: true,
  kind: 'crash',
  created_ms: 1_700_000_000_000,
  preview_text: `panic at main.rs:1\n${XSS}\nline 3`,
}

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  if (!HTMLDialogElement.prototype.showModal)
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute('open', '')
    }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
})

afterEach(async () => {
  currentToasts().forEach((t) => dismissToast(t.id))
  if (root) {
    const r = root
    root = null
    await act(async () => r.unmount())
  }
  document.body.innerHTML = ''
  localStorage.clear()
  useLive.setState({ conn: null })
  vi.useRealTimers()
  vi.restoreAllMocks()
})

interface Setup {
  /** One answer for every look, or a list: the nth look gets the nth (the last repeats). */
  pending?: PendingReport | Error | (PendingReport | Error)[]
  setting?: 'ask' | 'always' | 'never' | undefined
  send?: SendReportResult | Error
  mode?: string
}

async function mount(o: Setup = {}) {
  const calls: string[] = []
  const bodies: unknown[] = []
  const saved: unknown[] = []
  let looks = 0
  const client = {
    request: vi.fn(async (method: string, path: string, body?: unknown) => {
      calls.push(`${method} ${path}`)
      if (path.endsWith('/send')) {
        bodies.push(body)
        const r = o.send ?? { sent: true }
        if (r instanceof Error) throw r
        return r
      }
      if (method === 'DELETE') return undefined
      const seq = Array.isArray(o.pending) ? o.pending : [o.pending ?? waiting]
      const p = seq[Math.min(looks, seq.length - 1)]!
      looks += 1
      if (p instanceof Error) throw p
      return p
    }),
    settings: vi.fn(async () => ({
      theme: 'system',
      ...('setting' in o ? { crash_reports: o.setting } : { crash_reports: 'ask' }),
    })),
    // Only the consent is ever saved from here, on its own.
    saveCrashReports: vi.fn(async (value: unknown) => {
      saved.push({ crash_reports: value })
      return { crash_reports: value }
    }),
  }
  useLive.setState({ conn: { mode: o.mode ?? 'desktop', client } as never })
  const el = document.body.appendChild(document.createElement('div'))
  root = createRoot(el)
  await act(async () => {
    root!.render(
      <>
        <CrashReportPrompt />
        <Toaster />
      </>,
    )
  })
  // The check runs in a microtask chain.
  await act(async () => {
    if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(0)
    else await new Promise((r) => setTimeout(r, 0))
  })
  return { el, client, calls, bodies, saved, looks: () => looks }
}

const dialog = () => document.querySelector('dialog[open]')
const button = (name: string) =>
  [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === name) as
    HTMLButtonElement | undefined
const click = async (el: Element | undefined) => {
  await act(async () => {
    ;(el as HTMLElement).click()
    await new Promise((r) => setTimeout(r, 0))
  })
}

describe('CrashReportPrompt', () => {
  it('shows once for a waiting report, with the words, and never again for the same one', async () => {
    await mount()
    expect(dialog()).not.toBeNull()
    expect(dialog()?.textContent).toContain('Ferrocast closed unexpectedly')
    expect(dialog()?.textContent).toContain(
      'Send a report to help fix it? Stream keys, passwords, tokens and emails are removed first.',
    )
    expect(button('Send')).toBeDefined()
    expect(button('Don’t send')).toBeDefined()

    // Same report, mounted again (a reload): nothing.
    await act(async () => root!.unmount())
    root = null
    document.body.innerHTML = ''
    await mount()
    expect(dialog()).toBeNull()
  })

  it('asks again for a newer report', async () => {
    await mount()
    expect(dialog()).not.toBeNull()
    await act(async () => root!.unmount())
    root = null
    document.body.innerHTML = ''
    await mount({ pending: { ...waiting, created_ms: waiting.created_ms + 5000, kind: 'hang' } })
    expect(dialog()?.textContent).toContain('Ferrocast stopped responding')
  })

  it('shows nothing when no report waits, or the setting is always or never', async () => {
    await mount({ pending: none })
    expect(dialog()).toBeNull()
    await act(async () => root!.unmount())
    root = null
    document.body.innerHTML = ''
    await mount({ setting: 'always' })
    expect(dialog()).toBeNull()
    await act(async () => root!.unmount())
    root = null
    document.body.innerHTML = ''
    await mount({ setting: 'never' })
    expect(dialog()).toBeNull()
  })

  it('treats a missing setting (an older engine) as ask', async () => {
    await mount({ setting: undefined })
    expect(dialog()).not.toBeNull()
  })

  it('stays quiet when the engine has no reports (404)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await mount({ pending: new ApiError(404, 'not_found', 'Not found.') })
    expect(dialog()).toBeNull()
    expect(warn).not.toHaveBeenCalled()
  })

  it('never asks on a phone, a linked browser or cloud mode', async () => {
    for (const mode of ['remote', 'browser', 'cloud']) {
      const { calls } = await mount({ mode })
      expect(dialog()).toBeNull()
      expect(calls).toEqual([])
      await act(async () => root!.unmount())
      root = null
      document.body.innerHTML = ''
    }
  })

  it('shows the report as plain text, never as HTML', async () => {
    await mount()
    const pre = document.querySelector('[data-testid="crash-report-text"]') as HTMLElement
    expect(pre.tagName).toBe('PRE')
    expect(pre.textContent).toContain(XSS)
    expect(pre.querySelector('img')).toBeNull()
    expect(document.querySelector('dialog img')).toBeNull()
  })

  it('Send sends, thanks, and closes', async () => {
    const { calls } = await mount()
    await click(button('Send'))
    expect(calls).toContain('POST /api/v1/diagnostics/pending-report/send')
    expect(dialog()).toBeNull()
    expect(currentToasts().map((t) => t.message)).toContain('Report sent. Thank you.')
  })

  it('sends the created_ms of the report that was shown', async () => {
    const { bodies } = await mount()
    await click(button('Send'))
    expect(bodies).toEqual([{ created_ms: waiting.created_ms }])
  })

  it('a 409 (another report waits now) is quiet and asks about the newer report', async () => {
    const newer: WaitingReport = { ...waiting, kind: 'hang', created_ms: waiting.created_ms + 9000 }
    const { bodies, looks } = await mount({
      pending: [waiting, newer],
      send: new ApiError(409, 'conflict', 'A different crash report is waiting now.'),
    })
    await click(button('Send'))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    // Nothing said, nothing stays "on this PC": the person is asked about the newer one.
    expect(currentToasts()).toEqual([])
    expect(bodies).toEqual([{ created_ms: waiting.created_ms }])
    expect(looks()).toBe(2)
    expect(dialog()?.textContent).toContain('Ferrocast stopped responding')
  })

  it('a send with nothing waiting any more (404) closes without a word', async () => {
    await mount({ send: new ApiError(404, 'no_pending_report', 'No crash report is waiting.') })
    await click(button('Send'))
    expect(dialog()).toBeNull()
    expect(currentToasts()).toEqual([])
  })

  it('looks again when the engine has not built the report yet', async () => {
    const { looks } = await mount({ pending: [none, waiting] })
    expect(dialog()).toBeNull()
    expect(looks()).toBe(1)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 2100))
    })
    expect(looks()).toBe(2)
    expect(dialog()?.textContent).toContain('Ferrocast closed unexpectedly')
  })

  describe('the short look-again window', () => {
    const tick = (ms: number) =>
      act(async () => {
        await vi.advanceTimersByTimeAsync(ms)
      })
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    })
    const setHidden = (hidden: boolean) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
    }
    afterEach(() => {
      Reflect.deleteProperty(document, 'hidden')
    })

    it('looks every 2 s for 30 s, one look at a time, then stops', async () => {
      const { looks } = await mount({ pending: none })
      expect(looks()).toBe(1)
      await tick(1999)
      expect(looks()).toBe(1)
      await tick(1)
      expect(looks()).toBe(2)
      await tick(60_000)
      expect(looks()).toBe(16)
      await tick(60_000)
      expect(looks()).toBe(16)
      expect(dialog()).toBeNull()
    })

    it('stops at the first report it finds', async () => {
      const { looks } = await mount({ pending: [none, none, waiting] })
      await tick(4000)
      expect(looks()).toBe(3)
      expect(dialog()).not.toBeNull()
      await tick(30_000)
      expect(looks()).toBe(3)
    })

    it('keeps looking through a failed look, and stops for good on 404 or 403', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const flaky = await mount({
        pending: [new ApiError(503, 'unavailable', 'Starting.'), waiting],
      })
      await tick(2000)
      expect(flaky.looks()).toBe(2)
      expect(dialog()).not.toBeNull()
      expect(warn).toHaveBeenCalledTimes(1)
      await act(async () => root!.unmount())
      root = null
      document.body.innerHTML = ''
      localStorage.clear()
      const gone = await mount({ pending: new ApiError(403, 'forbidden', 'No.') })
      await tick(20_000)
      expect(gone.looks()).toBe(1)
    })

    it('does not look while the window is hidden, and looks as soon as it is shown', async () => {
      setHidden(true)
      const { looks } = await mount({ pending: [none, waiting] })
      await tick(20_000)
      expect(looks()).toBe(0)
      setHidden(false)
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'))
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(looks()).toBe(1)
      await tick(2000)
      expect(looks()).toBe(2)
      expect(dialog()).not.toBeNull()
    })
  })

  it.each(['relay_too_old', 'rate_limited', 'offline'])(
    'a send that stays on this PC (%s) says so quietly',
    async (reason) => {
      await mount({ send: { sent: false, reason } })
      await click(button('Send'))
      const t = currentToasts()
      expect(t.some((x) => x.message === 'The report stays on this PC.' && x.tone === 'info')).toBe(
        true,
      )
      expect(t.some((x) => x.tone === 'error')).toBe(false)
      expect(dialog()).toBeNull()
    },
  )

  it('a failed send keeps it on this PC and says why', async () => {
    await mount({
      send: new ApiError(502, 'relay_unreachable', 'Ferrocast couldn’t reach its server.'),
    })
    await click(button('Send'))
    const t = currentToasts().find((x) => x.message === 'The report stays on this PC.')
    expect(t?.hint).toContain('couldn’t reach')
  })

  it('Always send saves the setting, then sends', async () => {
    const { saved, calls } = await mount()
    const box = document.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(box.checked).toBe(false)
    await click(box)
    expect(box.checked).toBe(true)
    await click(button('Send'))
    expect(saved).toEqual([{ crash_reports: 'always' }])
    expect(calls).toContain('POST /api/v1/diagnostics/pending-report/send')
  })

  it('Always send tells an open Settings page to reload its copy', async () => {
    const heard = vi.fn()
    window.addEventListener('fc-crash-reports-change', heard)
    await mount()
    await click(document.querySelector('input[type="checkbox"]') ?? undefined)
    await click(button('Send'))
    window.removeEventListener('fc-crash-reports-change', heard)
    expect(heard).toHaveBeenCalledTimes(1)
  })

  it('Send can’t be pressed while Don’t send is running', async () => {
    let release: () => void = () => {}
    const { client } = await mount()
    client.request.mockImplementationOnce(
      () => new Promise((r) => (release = () => r(undefined))) as never,
    )
    await act(async () => {
      button('Don’t send')!.click()
    })
    expect(button('Send')!.disabled).toBe(true)
    await act(async () => {
      release()
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(dialog()).toBeNull()
  })

  it('Don’t send discards the report and sends nothing', async () => {
    const { calls, saved } = await mount()
    await click(button('Don’t send'))
    expect(calls).toContain('DELETE /api/v1/diagnostics/pending-report')
    expect(calls.some((c) => c.endsWith('/send'))).toBe(false)
    expect(saved).toEqual([])
    expect(dialog()).toBeNull()
  })

  it('Escape closes without sending or discarding', async () => {
    const { calls } = await mount()
    await act(async () => {
      dialog()!.dispatchEvent(new Event('cancel', { cancelable: true }))
    })
    expect(dialog()).toBeNull()
    expect(calls.some((c) => c.endsWith('/send') || c.startsWith('DELETE'))).toBe(false)
  })

  it('waits while another dialog is open, then opens', async () => {
    const other = document.body.appendChild(document.createElement('dialog'))
    other.setAttribute('open', '')
    await mount()
    expect(document.querySelectorAll('dialog[open]').length).toBe(1)
    expect(document.body.textContent).not.toContain('Ferrocast closed unexpectedly')
    other.remove()
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1700))
    })
    expect(dialog()?.textContent).toContain('Ferrocast closed unexpectedly')
  })
})
