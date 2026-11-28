import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ApiError, type PendingReport, type SendReportResult } from '@ferrocast/api'
import { Toaster, currentToasts, dismissToast } from '@ferrocast/ui'
import { useLive } from '../lib/store'
import { CrashReportPrompt } from './crash-report-prompt'

let root: Root | null = null

const XSS = '<img src=x onerror=alert(1)>'
const waiting: PendingReport = {
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
  vi.restoreAllMocks()
})

interface Setup {
  pending?: PendingReport | Error
  setting?: 'ask' | 'always' | 'never' | undefined
  send?: SendReportResult | Error
  mode?: string
}

async function mount(o: Setup = {}) {
  const calls: string[] = []
  const saved: unknown[] = []
  const client = {
    request: vi.fn(async (method: string, path: string) => {
      calls.push(`${method} ${path}`)
      if (path.endsWith('/send')) {
        const r = o.send ?? { sent: true }
        if (r instanceof Error) throw r
        return r
      }
      if (method === 'DELETE') return undefined
      const p = o.pending ?? waiting
      if (p instanceof Error) throw p
      return p
    }),
    settings: vi.fn(async () => ({
      theme: 'system',
      ...('setting' in o ? { crash_reports: o.setting } : { crash_reports: 'ask' }),
    })),
    saveSettings: vi.fn(async (s: unknown) => {
      saved.push(s)
      return s
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
    await new Promise((r) => setTimeout(r, 0))
  })
  return { el, client, calls, saved }
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
      'Send a report to help fix it? It has no stream keys, passwords or emails.',
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
    await mount({ pending: { ...waiting, pending: false } })
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
    expect(saved).toEqual([{ theme: 'system', crash_reports: 'always' }])
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
