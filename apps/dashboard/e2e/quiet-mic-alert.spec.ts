import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { open, settled } from './helpers'

const shots = process.env.FC_SHOTS

function snap(page: Page, name: string) {
  if (!shots) return Promise.resolve()
  mkdirSync(shots, { recursive: true })
  return page.screenshot({ path: join(shots, name) })
}

async function openRunningStudio(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height })
  await page.addInitScript(() => {
    localStorage.setItem('fc-golive-picture', 'ferrocast')
    localStorage.removeItem('fc-studio-standby-scene')
  })
  await open(page, 'studio', 'autoplay=0&latency=0&studioEngine=1')
  await page.getByRole('button', { name: 'Start the Studio' }).click()
  await page.locator('[data-canvas-box]').waitFor({ state: 'visible', timeout: 10_000 })
  await settled(page)
}

async function emitQuietMicAlert(page: Page, message = 'Mic sounds quiet.'): Promise<boolean> {
  return page.evaluate((msg) => {
    const d = window.__ferrocastDemo
    if (!d) throw new Error('missing demo engine')
    return d.emitLiveAlert({
      id: 'mic:quiet:Mic',
      level: 'warn',
      message: msg,
      detail: 'No gain was changed. Tap +6 dB to boost it, or move closer to the mic.',
      cleared: false,
      source: 'Mic',
      action: 'gain_up',
      dismiss: 'quiet_ok',
    })
  }, message)
}

test.describe('Quiet-mic warning toast, +6 dB boost cap, and stream dismiss (#9)', () => {
  test('shows clear copy and detail, boosts filter without exceeding 0 dB fader, and dismisses for the stream', async ({
    page,
  }) => {
    await openRunningStudio(page, 1280, 800)

    expect(await emitQuietMicAlert(page)).toBe(true)
    const region = page.getByRole('region', { name: 'Notifications' })
    await expect(region.getByText('Mic sounds quiet.')).toBeVisible()
    await expect(region.getByRole('button', { name: '+6 dB' })).toBeVisible()
    await expect(region.getByRole('button', { name: 'Dismiss' })).toBeVisible()

    // Open (i) detail and capture desktop screenshot.
    await region.getByRole('button', { name: 'More about this message' }).click()
    await expect(
      page.getByText('No gain was changed. Tap +6 dB to boost it, or move closer to the mic.'),
    ).toBeVisible()
    await settled(page)
    await snap(page, 'quiet-mic-alert-1280.png')

    // Click +6 dB -> adds Raise a quiet mic filter at +6 dB without pushing fader above 0 dB.
    await region.getByRole('button', { name: '+6 dB' }).click()
    await expect(region.getByText('Raised Mic by +6 dB (now +6 dB total).')).toBeVisible()

    // Verify Mic fader stayed at 0 dB and Raise a quiet mic filter was added.
    const micState = await page.evaluate(async () => {
      const d = window.__ferrocastDemo!
      const h = { Authorization: 'Bearer demo-session' }
      const audioRes = await d.fetch('/api/v1/studio/engine/scenes/Main/audio', { headers: h })
      const audio = (await audioRes.json()) as Array<{ name: string; volume_db: number }>
      const filtersRes = await d.fetch('/api/v1/studio/engine/sources/Mic/filters', { headers: h })
      const filters = (await filtersRes.json()) as Array<{ name: string; kind: string }>
      const settingsRes = await d.fetch(
        '/api/v1/studio/engine/sources/Mic/filters/Raise%20a%20quiet%20mic/settings',
        { headers: h },
      )
      const settings = (await settingsRes.json()) as { db?: number }
      return {
        volumeDb: audio.find((a) => a.name === 'Mic')?.volume_db ?? null,
        firstFilter: filters[0]?.name ?? null,
        gainDb: settings.db ?? null,
      }
    })
    expect(micState).toEqual({ volumeDb: 0, firstFilter: 'Raise a quiet mic', gainDb: 6 })

    // Re-emit alert and click Dismiss -> clears toast and prevents re-emission for this stream.
    expect(await emitQuietMicAlert(page)).toBe(true)
    await expect(region.getByRole('button', { name: 'Dismiss' })).toBeVisible()
    await region.getByRole('button', { name: 'Dismiss' }).click()
    await expect(region.getByText('Won’t ask again this stream.')).toBeVisible()

    // Simulated re-emit stays silenced.
    expect(await emitQuietMicAlert(page)).toBe(false)
    await expect(region.getByText('Mic sounds quiet.')).toHaveCount(0)
  })

  test('fits 375x812 without overflow and silences on toast close ×', async ({ page }) => {
    await openRunningStudio(page, 375, 812)

    expect(await emitQuietMicAlert(page)).toBe(true)
    const region = page.getByRole('region', { name: 'Notifications' })
    const toast = region.locator('[role="status"], [role="alert"]').first()
    await expect(toast).toBeVisible()
    await expect(toast.getByRole('button', { name: '+6 dB' })).toBeVisible()
    await expect(toast.getByRole('button', { name: 'Dismiss' })).toBeVisible()

    await settled(page)
    const box = await toast.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(375)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
    await snap(page, 'quiet-mic-alert-375.png')

    // Closing via toast × also silences mic:quiet for the rest of the stream without re-opening a toast.
    await toast.getByRole('button', { name: 'Close notification' }).click()
    await expect(region.getByText('Mic sounds quiet.')).toHaveCount(0)
    expect(await emitQuietMicAlert(page)).toBe(false)
    await expect(region.getByText('Mic sounds quiet.')).toHaveCount(0)
  })
})
