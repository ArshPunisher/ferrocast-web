import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { settled } from './helpers'

test.describe('Start show & Your platforms tile redesign (U3)', () => {
  test('Start show dialog renders bordered check tiles, status words, real action buttons, and calm summary in light & dark', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('./?autoplay=0&latency=0#/home')
    await page.getByRole('button', { name: 'Start show' }).click()
    const dialog = page.getByRole('dialog', { name: 'Start show' })
    await expect(dialog).toBeVisible()

    const tiles = dialog.locator('[data-preflight-tile]')
    await expect(tiles.first()).toBeVisible({ timeout: 5000 })
    const count = await tiles.count()
    expect(count).toBeGreaterThanOrEqual(2)

    await expect(dialog.locator('[data-preflight-summary]')).toBeVisible()
    // Route-navigation fixes in pre-flight stay real <a> links styled as buttons.
    const fixLink = dialog.getByRole('link', { name: /Open Accounts|Discord settings/i }).first()
    await expect(fixLink).toBeVisible()
    await expect(fixLink).toHaveAttribute('href', /#\/settings\//)

    await page.emulateMedia({ reducedMotion: 'reduce' })
    await settled(page)
    const lightAxe = await new AxeBuilder({ page }).include('dialog[open]').analyze()
    expect(lightAxe.violations).toEqual([])

    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'slate'))
    await settled(page)
    const darkAxe = await new AxeBuilder({ page }).include('dialog[open]').analyze()
    expect(darkAxe.violations).toEqual([])
  })

  test('Your platforms dialog uses bordered tiles, real action buttons, keeps drag/switches/upload toggles, and works at 1440 and 375', async ({
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

    await page.getByRole('button', { name: 'Manage platforms' }).click()
    const dialog = page.getByRole('dialog', { name: 'Your platforms' })
    await expect(dialog).toBeVisible()

    // Only the dialog title uses heading "Your platforms" (no duplicate nested Panel heading).
    await expect(dialog.getByRole('heading', { name: 'Your platforms' })).toHaveCount(1)

    const tiles = dialog.locator('[data-platform-tile]')
    await expect(tiles).toHaveCount(4)
    await expect(
      dialog.getByRole('button', { name: 'Move Twitch: arrow up or down' }),
    ).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Test connection to Twitch' })).toBeVisible()
    await expect(dialog.getByRole('switch', { name: 'Stream to Twitch' })).toBeChecked()
    await expect(dialog.getByRole('switch', { name: 'Upload protection' })).toBeChecked()
    await expect(dialog.getByRole('switch', { name: 'Auto quality' })).toBeChecked()

    // Keyboard reorder still works cleanly.
    const grip = dialog.getByRole('button', { name: 'Move YouTube: arrow up or down' })
    await grip.focus()
    await page.keyboard.press('ArrowUp')
    await expect(tiles.first()).toContainText('YouTube')

    await settled(page)
    const lightAxe = await new AxeBuilder({ page }).include('dialog[open]').analyze()
    expect(lightAxe.violations).toEqual([])
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'slate'))
    await settled(page)
    const darkAxe = await new AxeBuilder({ page }).include('dialog[open]').analyze()
    expect(darkAxe.violations).toEqual([])

    // 375 px phone check inside both dialogs: zero sideways overflow and ReachLine indent 0.
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'linen'))
    await page.setViewportSize({ width: 375, height: 812 })
    await settled(page)
    await page
      .getByRole('radiogroup', { name: 'Panel' })
      .getByText('Go live to', { exact: true })
      .click()
    await page.getByRole('button', { name: 'Manage platforms' }).click()
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Test connection to YouTube', exact: true }).click()
    const reachStatus = dialog.locator('[data-platform-tile]').first().locator('[role="status"]')
    await expect(reachStatus).toBeVisible()
    const reachPadLeft = await reachStatus.evaluate((el) =>
      parseFloat(getComputedStyle(el).paddingLeft),
    )
    expect(reachPadLeft, 'ReachLine left indent is 0 at 375 px').toBe(0)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)

    await page.goto('./?autoplay=0&latency=0#/home')
    await page.getByRole('button', { name: 'Start show' }).click()
    await expect(page.getByRole('dialog', { name: 'Start show' })).toBeVisible()
    await settled(page)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
  })
})
