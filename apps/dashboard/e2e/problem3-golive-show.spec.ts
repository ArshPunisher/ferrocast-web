import { expect, test } from '@playwright/test'
import { settled } from './helpers'

test.describe('Problem 3: Go live, Show Studio copy, OBS stream stop, and Status bar', () => {
  test('Ferrocast mode Go live updates button, ticks Studio status bar, and Show uses Studio copy (1280x800)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    const failed422: string[] = []
    page.on('response', (res) => {
      if (res.status() === 422 && res.url().includes('/studio/engine/stream')) {
        failed422.push(`${res.status()} ${res.url()}`)
      }
    })

    await page.addInitScript(() => {
      localStorage.setItem('fc-golive-picture', 'ferrocast')
    })
    await page.goto('./?autoplay=0&latency=0&studioEngine=1#/studio')
    await expect(page.locator('#main')).toBeVisible()

    const startBtn = page.getByRole('button', { name: 'Start the Studio' })
    await expect(startBtn).toBeVisible()
    await startBtn.click()
    await expect(page.getByRole('region', { name: 'Scenes' })).toBeVisible({ timeout: 10_000 })
    await settled(page)

    const goLiveBtn = page.getByRole('button', { name: 'Go live', exact: true })
    await expect(goLiveBtn).toBeEnabled()
    await goLiveBtn.click()

    const goLiveAnyway = page.getByRole('button', { name: 'Go live anyway' })
    if (await goLiveAnyway.isVisible({ timeout: 1500 }).catch(() => false)) {
      await goLiveAnyway.click()
    }

    // Immediate feedback on the desk Go live button (LIVE + Show countdown).
    const livePill = page.getByRole('button', { name: /End stream/i })
    await expect(livePill).toBeVisible({ timeout: 5000 })
    await expect(livePill.locator('[data-countdown]')).toBeVisible()

    // Studio status footer reflects active LIVE state and advancing timer (> 00:00:00).
    const statusFooter = page.locator('footer[aria-label="Studio status"]')
    await expect(statusFooter).toBeVisible()
    await expect(statusFooter).toContainText('LIVE')
    await expect(statusFooter).not.toContainText('Live00:00:00', { timeout: 6000 })
    await expect(statusFooter).toContainText(/LIVE00:00:0[1-9]/, { timeout: 6000 })

    // Switch to Show tab: Studio copy (no OBS) and Start/Stop streaming without 422.
    await page
      .getByRole('radiogroup', { name: 'Studio section' })
      .locator('label')
      .filter({ hasText: /^Show/ })
      .click()
    const showPanel = page.getByRole('region', { name: 'Show' })
    await expect(showPanel).toBeVisible()
    await expect(showPanel).toContainText('The Studio is streaming')
    await expect(showPanel).not.toContainText(/\bOBS\b/)

    const stopStreamBtn = showPanel.getByRole('button', { name: 'Stop streaming', exact: true })
    await expect(stopStreamBtn).toBeVisible()
    await stopStreamBtn.click()
    await page
      .getByRole('dialog', { name: 'Stop streaming?' })
      .getByRole('button', { name: 'Stop streaming', exact: true })
      .click()

    const startStreamBtn = showPanel.getByRole('button', { name: 'Start streaming', exact: true })
    await expect(startStreamBtn).toBeVisible({ timeout: 5000 })
    await startStreamBtn.click()
    await expect(stopStreamBtn).toBeVisible({ timeout: 5000 })
    expect(failed422).toEqual([])
  })

  for (const vp of [
    { width: 1280, height: 800 },
    { width: 375, height: 812 },
  ]) {
    test(`OBS mode lets user stop active OBS stream before Point OBS at Ferrocast (${vp.width}px)`, async ({
      page,
    }) => {
      await page.setViewportSize(vp)
      await page.addInitScript(() => {
        localStorage.setItem('fc-golive-picture', 'obs')
      })
      await page.goto('./?autoplay=0&latency=0&studioEngine=1#/studio/golive')
      await expect(page.locator('#main')).toBeVisible()

      const setup = page.locator('#golive-setup')
      await expect(setup).toBeVisible()
      await expect(setup.getByText('Stop streaming in OBS first.')).toBeVisible()
      await expect(setup.getByRole('button', { name: 'Point OBS at Ferrocast' })).toBeDisabled()

      const stopObsBtn = setup.getByRole('button', { name: 'Stop streaming in OBS' })
      await expect(stopObsBtn).toBeVisible()
      await stopObsBtn.click()

      await expect(setup.getByRole('button', { name: 'Point OBS at Ferrocast' })).toBeEnabled({
        timeout: 5000,
      })

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )
      expect(overflow).toBe(false)
    })
  }
})
