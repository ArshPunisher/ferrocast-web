import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { FerroClient } from '@ferrocast/api'
import { DEMO_TOKEN, DemoEngine, type DemoOptions } from '@ferrocast/api/demo'
import { currentToasts, dismissToast } from '@ferrocast/ui'
import { useLive } from '../lib/store'
import { Onboarding } from './Onboarding'

let root: Root | null = null
let engine: DemoEngine | null = null

async function cleanupMount() {
  await act(async () => root?.unmount())
  root = null
  engine?.dispose()
  engine = null
  document.body.innerHTML = ''
  useLive.setState({ conn: null, connectors: null })
  currentToasts().forEach((t) => dismissToast(t.id))
}

afterEach(cleanupMount)

async function waitFor(fn: () => boolean, timeoutMs = 4000, onFail?: () => string): Promise<void> {
  const start = Date.now()
  while (!fn()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out waiting for condition${onFail ? `: ${onFail()}` : ''}`)
    }
    await act(async () => {
      await new Promise((r) => setTimeout(r, 25))
    })
  }
}

async function mountOnboarding(opts: DemoOptions = { studioEngine: true }, demo = true) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  engine = new DemoEngine({ autoplay: false, latencyMs: 0, setupDone: false, ...opts })
  const client = new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch })
  useLive.setState({ conn: { client } as never })
  const host = document.body.appendChild(document.createElement('div'))
  const onDone = vi.fn()
  root = createRoot(host)
  await act(async () => {
    root!.render(<Onboarding demo={demo} onDone={onDone} />)
  })
  return { host, engine, client, onDone }
}

function buttonByText(rootEl: HTMLElement, text: string | RegExp): HTMLButtonElement | undefined {
  return [...rootEl.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
    typeof text === 'string' ? b.textContent?.trim() === text : text.test(b.textContent ?? ''),
  )
}

function clickRadio(rootEl: HTMLElement, labelText: string) {
  const label = [...rootEl.querySelectorAll<HTMLLabelElement>('label')].find((l) =>
    l.textContent?.includes(labelText),
  )
  const input = label?.querySelector<HTMLInputElement>('input[type="radio"]')
  if (!input) throw new Error(`Missing radio option: ${labelText}`)
  input.click()
}

describe('Onboarding first-run import and camera/mic check', () => {
  it('starts at Import with OBS Studio, Streamlabs, and Start fresh choices and shows 5 steps', async () => {
    const { host } = await mountOnboarding({ studioEngine: true })
    expect(host.querySelector('h1')?.textContent).toMatch(/Bring your scenes/i)
    const steps = host.querySelectorAll('ol[aria-label="Setup progress"] > li')
    expect(steps).toHaveLength(5)
    expect(steps[0]?.textContent).toContain('Import')
    expect(steps[1]?.textContent).toContain('Camera & mic')
  })

  it('previews OBS collection with counts and skipped reasons, imports, and undoes back cleanly', async () => {
    const { host, client } = await mountOnboarding({ studioEngine: true })

    await act(async () => clickRadio(host, 'Import from OBS Studio'))
    await waitFor(() => host.textContent?.includes('Main Streaming Setup') ?? false)
    // Preview details should show scenes, sources, web conversions, and reasons what cannot come across
    await waitFor(() => host.textContent?.includes('NDI Studio Cam') ?? false)
    expect(host.textContent).toContain('4')
    expect(host.textContent).toContain('9')
    expect(host.textContent).toContain('Uses NDI')
    expect(host.textContent).toContain('Legacy VST')

    const importBtn = buttonByText(host, /^Import /)
    expect(importBtn).toBeDefined()
    await act(async () => importBtn!.click())
    await waitFor(
      () => /Imported .*Main Streaming Setup/.test(host.textContent ?? ''),
      4000,
      () => host.textContent ?? '',
    )

    // Shelf should now have the imported collection active
    const shelfBeforeUndo = await client.request<{ current: string; list: { id: string }[] }>(
      'GET',
      '/api/v1/studio/engine/library/collections',
    )
    expect(shelfBeforeUndo.current).not.toBe('untitled')

    // Undo / Start over switches back and removes the imported collection
    const undoBtn = buttonByText(host, /Undo and start over/i)
    expect(undoBtn).toBeDefined()
    await act(async () => undoBtn!.click())
    await waitFor(() => host.textContent?.includes('Import undone') ?? false)

    const shelfAfterUndo = await client.request<{ current: string; list: { id: string }[] }>(
      'GET',
      '/api/v1/studio/engine/library/collections',
    )
    expect(shelfAfterUndo.current).toBe('untitled')
    expect(shelfAfterUndo.list).toHaveLength(1)
  })

  it('previews Streamlabs collection including device resets and handles empty/broken/huge states', async () => {
    // Rich Streamlabs preview
    const { host: h1 } = await mountOnboarding({ studioEngine: true })
    await act(async () => clickRadio(h1, 'Import from Streamlabs'))
    await waitFor(() => h1.textContent?.includes('Streamlabs Neon Pack') ?? false)
    await waitFor(() => h1.textContent?.includes('StreamCam') ?? false)
    expect(h1.textContent).toContain('Shure SM7B')
    expect(h1.textContent).toContain('Spin Wheel Widget')
    await cleanupMount()

    // Empty OBS fixture folder
    const { host: hEmpty } = await mountOnboarding({ studioEngine: { obsPreset: 'empty' } })
    await act(async () => clickRadio(hEmpty, 'Import from OBS Studio'))
    await waitFor(
      () => hEmpty.textContent?.includes('No OBS Studio scene collections found') ?? false,
    )
    await cleanupMount()

    // Broken JSON preview shows describeError message + recovery action
    const { host: hBroken } = await mountOnboarding({ studioEngine: { obsPreset: 'broken' } })
    await act(async () => clickRadio(hBroken, 'Import from OBS Studio'))
    await waitFor(() => hBroken.textContent?.includes('JSON is damaged') ?? false)
    expect(buttonByText(hBroken, /Start fresh instead/i)).toBeDefined()
    await cleanupMount()

    // Huge collection preview truncates cleanly
    const { host: hHuge } = await mountOnboarding({ studioEngine: { obsPreset: 'huge' } })
    await act(async () => clickRadio(hHuge, 'Import from OBS Studio'))
    await waitFor(() => hHuge.textContent?.includes('Mega Broadcast Archive') ?? false)
    await waitFor(() => hHuge.textContent?.includes('108 more') ?? false)
  })

  it('handles import failure fault cleanly without corrupting state', async () => {
    const { host, engine: eng } = await mountOnboarding({ studioEngine: true })
    eng.addFault({
      path: '/api/v1/studio/engine/obs-collections/import',
      status: 500,
      message: 'Disk full while saving scenes.',
    })
    await act(async () => clickRadio(host, 'Import from OBS Studio'))
    await waitFor(() => host.textContent?.includes('NDI Studio Cam') ?? false)
    await act(async () => buttonByText(host, /^Import /)!.click())
    await waitFor(
      () => host.textContent?.includes('Disk full while saving scenes.') ?? false,
      4000,
      () => host.textContent ?? '',
    )
    expect(host.textContent).not.toMatch(/Imported .*Main Streaming Setup/)
  })

  it('runs Camera & mic check with preview, live mic meter verdict, Clean up my mic, and no-camera state', async () => {
    const { host, client } = await mountOnboarding({
      studioEngine: { hasCamera: true, hasMic: true, micPreset: 'quiet' },
    })
    // Advance past Start fresh
    await act(async () => buttonByText(host, 'Continue')!.click())
    await waitFor(
      () => (host.querySelector('h1')?.textContent ?? '').includes('Camera and mic check'),
      4000,
      () => host.textContent ?? '',
    )

    // Camera preview loads
    await waitFor(
      () => host.querySelector('img[alt*="FaceTime"]') !== null,
      4000,
      () => host.innerHTML,
    )
    // Live mic meter polls >= 10 quiet samples then shows verdict + gain tip before Clean up my mic
    await waitFor(
      () => host.textContent?.includes('raise it by') ?? false,
      6000,
      () => host.textContent ?? '',
    )

    const cleanBtn = buttonByText(host, /Clean up my mic/i)
    expect(cleanBtn).toBeDefined()
    await act(async () => cleanBtn!.click())
    await waitFor(() => host.textContent?.includes('Mic cleaned up') ?? false)

    const filters = await client.request<{ kind: string }[]>(
      'GET',
      '/api/v1/studio/engine/sources/Mic/filters',
    )
    expect(filters.map((f) => f.kind)).toContain('gain_filter')
    expect(filters[0]?.kind).toBe('gain_filter')

    await cleanupMount()

    // No camera detected still lets user proceed smoothly
    const { host: hNoCam } = await mountOnboarding({
      studioEngine: { hasCamera: false, hasMic: false },
    })
    await act(async () => buttonByText(hNoCam, 'Continue')!.click())
    await waitFor(() => hNoCam.textContent?.includes('No camera detected') ?? false)
    expect(hNoCam.textContent).toContain('No microphone detected')
    expect(buttonByText(hNoCam, 'Continue')?.disabled).toBe(false)
  })

  it('gracefully falls back when Studio engine is unavailable and moves focus on step transitions', async () => {
    const { host } = await mountOnboarding({ studioEngine: false })
    await act(async () => clickRadio(host, 'Import from OBS Studio'))
    await waitFor(
      () =>
        host.textContent?.includes('Scene import runs inside the Ferrocast desktop app') ?? false,
      4000,
      () => host.textContent ?? '',
    )
    const fallbackBtn = buttonByText(host, /Start fresh instead/i)
    expect(fallbackBtn).toBeDefined()
    await act(async () => fallbackBtn!.click())
    await waitFor(
      () => (host.querySelector('h1')?.textContent ?? '').includes('Camera and mic check'),
      4000,
      () => host.textContent ?? '',
    )
    await waitFor(
      () => document.activeElement === host.querySelector('h1'),
      2000,
      () => document.activeElement?.outerHTML ?? 'none',
    )
    await waitFor(
      () => host.textContent?.includes('Desktop audio filters run in the Ferrocast app') ?? false,
      4000,
      () => host.textContent ?? '',
    )
  })
})
