import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { settled } from './helpers'

test.describe('Bitrate caps and shared stream explanations (U2)', () => {
  test('Stream quality, Go live to, and Your platforms explain Twitch 6 Mbps cap clearly when Max (12 Mbps) is picked', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.addInitScript(() => {
      localStorage.setItem('fc-golive-picture', 'ferrocast')
      localStorage.removeItem('fc-studio-standby-scene')
    })
    await page.goto('./?autoplay=0&latency=0&studioEngine=1#/studio')
    await page.getByRole('button', { name: 'Start the Studio' }).click()
    await expect(page.locator('[data-canvas-box]')).toBeVisible({ timeout: 10_000 })
    await settled(page)

    // Turn Kick on so Twitch, YouTube, and Kick are all enabled (3 places).
    await page.getByRole('switch', { name: 'Go live on Kick' }).click()

    // Select Max (12.0 Mbps) in Studio settings -> Stream quality and save.
    await page.getByRole('button', { name: 'Studio settings' }).first().click()
    const settingsDialog = page.getByRole('dialog', { name: 'Studio settings' })
    await expect(settingsDialog).toBeVisible()
    await settingsDialog.getByRole('radio', { name: /Max/i }).click()

    // (a) Honest cap explanation appears directly under Stream quality.
    await expect(
      settingsDialog.getByText(
        /Sending 6\.0 Mbps right now\. Twitch takes at most 6 Mbps.*Turn Twitch.*off to send 12 Mbps\./,
      ),
    ).toBeVisible()

    await settingsDialog.getByRole('button', { name: 'Save' }).click()
    await expect(settingsDialog).toBeHidden()

    // (b) Go live to dock shows what each row gets and explains YouTube shares Twitch's 6.0 Mbps stream.
    const dock = page.getByRole('region', { name: 'Go live to' })
    const dockTwitch = dock
      .locator('li')
      .filter({ has: page.locator('b', { hasText: /^Twitch$/ }) })
    const dockYt = dock.locator('li').filter({ has: page.locator('b', { hasText: /^YouTube$/ }) })
    await expect(dockYt.getByText('Same stream as Twitch: 6.0 Mbps')).toBeVisible()
    await expect(dockTwitch.getByText('6.0 Mbps', { exact: true })).toBeVisible()
    await expect(dockYt.getByText('6.0 Mbps', { exact: true })).toBeVisible()

    // (b, c) Your platforms modal shows row rates, YouTube explanation, and "3 places x ... = ... upload".
    await page.getByRole('button', { name: 'Manage platforms' }).click()
    const platforms = page.getByRole('dialog', { name: 'Your platforms' })
    await expect(platforms).toBeVisible()
    const platYt = platforms
      .locator('li')
      .filter({ has: page.locator('b', { hasText: /^YouTube$/ }) })
    await expect(platYt.getByText('Same stream as Twitch: 6.0 Mbps')).toBeVisible()
    await expect(platforms.getByText(/^3 places x 6\.2 Mbps = 18 Mbps upload$/)).toBeVisible()
    await platforms.getByRole('button', { name: 'About YouTube stream rate' }).click()
    await expect(platforms.getByText(/Ferrocast sends one shared main picture/)).toBeVisible()

    // Light & dark accessibility inside Your platforms.
    await settled(page)
    const lightAxe = await new AxeBuilder({ page }).include('dialog[open]').analyze()
    expect(lightAxe.violations).toEqual([])
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'slate'))
    await settled(page)
    const darkAxe = await new AxeBuilder({ page }).include('dialog[open]').analyze()
    expect(darkAxe.violations).toEqual([])

    // Turning Twitch off lifts the 6 Mbps cap down to Kick's 8 Mbps cap.
    await platforms.getByRole('switch', { name: 'Stream to Twitch' }).click()
    await expect(platYt.getByText('Same stream as Kick: 8.0 Mbps')).toBeVisible()
  })

  test('Stream quality and Your platforms have no horizontal scroll at 375 px', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.addInitScript(() => {
      localStorage.setItem('fc-golive-picture', 'ferrocast')
      localStorage.removeItem('fc-studio-standby-scene')
    })
    await page.goto('./?autoplay=0&latency=0&studioEngine=1#/studio/golive')
    await expect(page.locator('#main')).toBeVisible()
    await settled(page)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    )
    expect(overflow).toBe(false)
  })
})
