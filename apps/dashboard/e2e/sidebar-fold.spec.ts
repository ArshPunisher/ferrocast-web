import { expect, test } from '@playwright/test'
import { open } from './helpers'

// The sidebar starts folded to icons and its logo opens and closes it (owner's pick "A joined",
// 10 Nov); the choice is remembered. Folded, every link keeps its name and the account opens it.
test.describe('sidebar fold', () => {
  test.skip(({ isMobile }) => !!isMobile, 'Phones use the tab bar.')
  test.use({ viewport: { width: 1280, height: 860 } })

  test('the logo opens and folds the sidebar, and it is remembered', async ({ page }) => {
    await open(page, 'home')
    const side = page.getByRole('complementary', { name: 'Sidebar' })
    const logo = side.getByRole('button', { name: 'Show the menu' })
    await expect(logo).toHaveAttribute('aria-expanded', 'false')
    // Folded: icons only, names for tooltips and screen readers.
    const chat = side.getByRole('link', { name: 'Chat' })
    await expect(chat).toHaveAttribute('title', 'Chat')
    await expect(page.getByTestId('account-bar')).toHaveCount(0)
    await expect.poll(async () => (await side.boundingBox())?.width ?? 0).toBeLessThan(64)

    await logo.click()
    const hide = side.getByRole('button', { name: 'Hide the menu' })
    await expect(hide).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByTestId('account-bar')).toBeVisible()
    await expect
      .poll(async () => (await side.boundingBox())?.width ?? 0)
      .toBeGreaterThanOrEqual(240)
    // The page moves over with it.
    await expect
      .poll(async () => Math.round((await page.locator('#main').boundingBox())?.x ?? 0))
      .toBeGreaterThanOrEqual(240)

    await page.reload()
    await expect(side.getByRole('button', { name: 'Hide the menu' })).toBeVisible()
    await side.getByRole('button', { name: 'Hide the menu' }).click()
    await expect(side.getByRole('button', { name: 'Show the menu' })).toBeVisible()
    await page.reload()
    await expect(side.getByRole('button', { name: 'Show the menu' })).toBeVisible()
  })

  test('folded, the account button opens the sidebar', async ({ page }) => {
    await open(page, 'home')
    const side = page.getByRole('complementary', { name: 'Sidebar' })
    await side.getByRole('button', { name: 'Sign in and Pro' }).click()
    await expect(page.getByTestId('account-bar')).toBeVisible()
  })
})
