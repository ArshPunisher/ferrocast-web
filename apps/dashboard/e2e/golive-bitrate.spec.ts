import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { settled } from './helpers'

test.describe('Bitrate caps, separate encodes, and Settings platform readouts', () => {
  test('Studio settings, Go live to, and Your platforms show real per-platform bitrates when Max (12 Mbps) is picked', async ({
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

    // Select Max (12.0 Mbps) in Studio settings -> Stream quality and open More options.
    await page.getByRole('button', { name: 'Studio settings' }).first().click()
    const settingsDialog = page.getByRole('dialog', { name: 'Studio settings' })
    await expect(settingsDialog).toBeVisible()
    await settingsDialog.getByRole('radio', { name: /Max/i }).click()

    // Concise 1-line summary under Stream quality without scary shared-cap copy.
    await expect(settingsDialog.getByRole('status')).toContainText(
      'Twitch 6 · YouTube 12 · Kick 8 Mbps',
    )
    await expect(settingsDialog.getByText(/Will send 6\.0 Mbps/)).toHaveCount(0)

    // EXTRA 17: concise per-platform readout next to Bitrate inside More options + (i) detail.
    await settingsDialog.getByText('More options', { exact: true }).click()
    await expect(settingsDialog.getByText('Twitch 6 · YouTube 12 · Kick 8 Mbps').nth(1)).toBeVisible()
    await settingsDialog.getByRole('button', { name: 'About bitrate per platform' }).click()
    await expect(settingsDialog.locator('div.fixed[data-over-preview="true"]')).toContainText(
      /Twitch takes at most 6 Mbps/,
    )

    // Light & dark accessibility inside Studio settings.
    await settled(page)
    const settingsLightAxe = await new AxeBuilder({ page }).include('dialog[open]').analyze()
    expect(settingsLightAxe.violations).toEqual([])
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'slate'))
    await settled(page)
    const settingsDarkAxe = await new AxeBuilder({ page }).include('dialog[open]').analyze()
    expect(settingsDarkAxe.violations).toEqual([])
    await page.evaluate(() => document.documentElement.removeAttribute('data-theme'))

    await settingsDialog.getByRole('button', { name: 'Save' }).click()
    await expect(settingsDialog).toBeHidden()

    // Go live to dock shows YouTube keeping 12 Mbps while Twitch/Kick get their own capped rates.
    const dock = page.getByRole('region', { name: 'Go live to' })
    const dockTwitch = dock
      .locator('li')
      .filter({ has: page.locator('b', { hasText: /^Twitch$/ }) })
    const dockYt = dock.locator('li').filter({ has: page.locator('b', { hasText: /^YouTube$/ }) })
    const dockKick = dock.locator('li').filter({ has: page.locator('b', { hasText: /^Kick$/ }) })
    await expect(dockYt.getByText('12 Mbps', { exact: true })).toBeVisible()
    await expect(dockYt.getByText(/Same stream as Twitch/)).toHaveCount(0)
    await expect(dockTwitch.getByText('6.2 Mbps', { exact: true })).toBeVisible()
    await expect(dockKick.getByText('8.2 Mbps', { exact: true })).toBeVisible()

    // Your platforms modal shows individual rates and exact separate-encode upload sum.
    await page.getByRole('button', { name: 'Manage platforms' }).click()
    const platforms = page.getByRole('dialog', { name: 'Your platforms' })
    await expect(platforms).toBeVisible()
    const platYt = platforms
      .locator('li')
      .filter({ has: page.locator('b', { hasText: /^YouTube$/ }) })
    await expect(platYt.getByText('12 Mbps', { exact: true })).toBeVisible()
    await expect(platforms.getByText('Capped at 6,000 kbps for Twitch')).toBeVisible()
    await expect(platforms.getByText('Capped at 8,000 kbps for Kick')).toBeVisible()
    await expect(
      platforms.getByText(/^6\.2 Mbps \+ 12 Mbps \+ 8\.2 Mbps = 26\.4 Mbps upload$/),
    ).toBeVisible()
    await platforms.getByRole('button', { name: 'Why upload adds up' }).click()
    await expect(platforms.locator('div.fixed[data-over-preview="true"]')).toContainText(
      /Ferrocast sends each ticked platform its own stream rate/,
    )

    // Light & dark accessibility inside Your platforms.
    await settled(page)
    const lightAxe = await new AxeBuilder({ page }).include('dialog[open]').analyze()
    expect(lightAxe.violations).toEqual([])
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'slate'))
    await settled(page)
    const darkAxe = await new AxeBuilder({ page }).include('dialog[open]').analyze()
    expect(darkAxe.violations).toEqual([])

    // Turning Twitch off removes Twitch from upload without disturbing YouTube's 12 Mbps.
    await platforms.getByRole('switch', { name: 'Stream to Twitch' }).click()
    await expect(platYt.getByText('12 Mbps', { exact: true })).toBeVisible()
    await expect(
      platforms.getByText(/^12 Mbps \+ 8\.2 Mbps = 20\.2 Mbps upload$/),
    ).toBeVisible()
  })

  test('Settings Bitrate breakdown and Your platforms have no horizontal scroll at 375 px', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.addInitScript(() => {
      localStorage.setItem('fc-golive-picture', 'ferrocast')
      localStorage.removeItem('fc-studio-standby-scene')
    })
    await page.goto('./?autoplay=0&latency=0&studioEngine=1#/studio')
    await page.getByRole('button', { name: 'Start the Studio' }).click()
    await expect(page.locator('[data-canvas-box]')).toBeVisible({ timeout: 10_000 })
    await settled(page)

    await page.getByRole('button', { name: 'Studio settings' }).first().click()
    const settingsDialog = page.getByRole('dialog', { name: 'Studio settings' })
    await expect(settingsDialog).toBeVisible()
    await settingsDialog.getByRole('radio', { name: /Max/i }).click()
    await settingsDialog.getByText('More options', { exact: true }).click()
    await expect(settingsDialog.getByText('Twitch 6 · YouTube 12 Mbps').first()).toBeVisible()
    await expect(
      settingsDialog.getByRole('button', { name: 'About bitrate per platform' }),
    ).toBeVisible()
    await settled(page)
    const settingsOverflow = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth > window.innerWidth,
      dialog: (() => {
        const d = document.querySelector('dialog[open]')
        return d ? d.scrollWidth > d.clientWidth + 1 : true
      })(),
    }))
    expect(settingsOverflow).toEqual({ page: false, dialog: false })
    await settingsDialog.getByRole('button', { name: 'Save' }).click()
    await expect(settingsDialog).toBeHidden()

    await page
      .getByRole('radiogroup', { name: 'Panel' })
      .getByText('Go live to', { exact: true })
      .click()
    await page.getByRole('button', { name: 'Manage platforms' }).click()
    const platforms = page.getByRole('dialog', { name: 'Your platforms' })
    await expect(platforms).toBeVisible()
    await expect(platforms.getByText('Capped at 6,000 kbps for Twitch')).toBeVisible()
    await expect(
      platforms.getByText('6.2 Mbps + 12 Mbps = 18.2 Mbps upload', { exact: true }),
    ).toBeVisible()
    await settled(page)

    const platformsOverflow = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth > window.innerWidth,
      dialog: (() => {
        const d = document.querySelector('dialog[open]')
        return d ? d.scrollWidth > d.clientWidth + 1 : true
      })(),
    }))
    expect(platformsOverflow).toEqual({ page: false, dialog: false })
  })
})
