import { expect, test } from '@playwright/test'
import { open } from './helpers'

// The visible update flow (demo engine): the sidebar offers it, the dialog shows what's new,
// Update now downloads with progress, then Restart to finish. Never while live.
test('sidebar update: notes, progress, restart; blocked while live', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 })
  await open(page, 'home', 'autoplay=0&latency=0')
  const nav = page.locator('aside').getByTestId('update-nav')
  await expect(nav).toContainText('Update available')
  await nav.click()
  const dialog = page.getByTestId('update-dialog')
  await expect(dialog).toContainText('What’s new')
  await expect(dialog.getByRole('listitem').first()).toBeVisible()
  // The demo stream is live and "never update while live" is on.
  await expect(page.getByRole('button', { name: 'Update now' })).toBeDisabled()
  await expect(page.getByText('You’re live, so it waits until your stream ends.')).toBeVisible()
  await page.keyboard.press('Escape')

  await open(page, 'settings/updates', 'autoplay=0&latency=0')
  const card = page.locator('#s-updates')
  await card.getByRole('switch', { name: 'Never update while I’m live' }).click()
  await card.getByRole('button', { name: 'Check for updates' }).click()
  await expect(card.getByTestId('update-status')).toContainText('is out')
  await expect(card).toContainText('Last checked just now')
  await card.getByRole('button', { name: 'See what’s new' }).click()
  // The page behind the dialog can't scroll (the app's WebKit scrolls it otherwise).
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('hidden')
  await page.getByRole('button', { name: 'Update now' }).click()
  await expect(page.getByRole('progressbar', { name: 'Download' })).toBeVisible()
  await expect(page.locator('aside').getByTestId('update-nav')).toContainText('Downloading')
  const restart = page.getByRole('dialog').getByRole('button', { name: 'Restart to finish' })
  await expect(restart).toBeEnabled({ timeout: 15_000 })
  await restart.click()
  await expect(page.locator('aside').getByTestId('update-nav')).toHaveCount(0, { timeout: 5_000 })
  // Closing the dialog gives the page its scrolling back.
  await page.keyboard.press('Escape')
  await expect.poll(() => page.evaluate(() => document.documentElement.style.overflow)).toBe('')
})

test('phone: the update is in More, and the dialog fits 375 px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await open(page, 'home', 'autoplay=0&latency=0')
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByLabel('More').getByTestId('update-nav').click()
  await expect(page.getByTestId('update-dialog')).toBeVisible()
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  )
  expect(overflow).toBe(false)
})
