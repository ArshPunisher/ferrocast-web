import { expect, test, type Page } from '@playwright/test'
import { demo, open } from './helpers'

/** The YouTube row in Settings > Accounts, with the demo's YouTube signed out first. */
async function youtubeRow(page: Page) {
  await open(page, 'settings/accounts')
  await demo(page, `(d) => d.disconnect('youtube')`)
  const row = page.getByRole('listitem').filter({ hasText: 'Chat, Super Chats and memberships' })
  await expect(row.getByRole('button', { name: 'Connect' })).toBeVisible()
  return row
}

test.describe('connecting YouTube', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      // Stands in for the browser: records what the dashboard asked to open.
      const w = window as unknown as { opened: string[] }
      w.opened = []
      window.open = ((u?: string | URL) => {
        w.opened.push(String(u))
        return null
      }) as typeof window.open
    })
  })

  test('opens the sign-in page by itself and offers the link to copy', async ({ page }) => {
    const row = await youtubeRow(page)
    await row.getByRole('button', { name: 'Connect' }).click()
    const dialog = page.getByRole('dialog', { name: 'Connect YouTube', exact: true })
    await expect(dialog).toBeVisible()
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { opened: string[] }).opened))
      .toEqual(['https://accounts.google.com/o/oauth2/v2/auth'])
    await expect(dialog.getByRole('link', { name: 'Open the sign-in page' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Copy link' })).toBeVisible()
  })

  test('says so when the desktop app could not open the browser', async ({ page }) => {
    const row = await youtubeRow(page)
    await row.getByRole('button', { name: 'Connect' }).click()
    const dialog = page.getByRole('dialog', { name: 'Connect YouTube', exact: true })
    await expect(dialog).toBeVisible()
    await demo(
      page,
      `(d) => d.broadcastLive({ v: 1, type: 'notice', data: { key: 'browser', level: 'warn', message: "Ferrocast couldn't open your browser. Try again in a moment, or open your browser first." } })`,
    )
    await expect(dialog.getByRole('alert')).toHaveText(
      'Your browser didn’t open. Copy the link and paste it into your browser.',
    )
    await expect(dialog.getByRole('link', { name: 'Open the sign-in page' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Copy link' })).toBeVisible()
  })
})
