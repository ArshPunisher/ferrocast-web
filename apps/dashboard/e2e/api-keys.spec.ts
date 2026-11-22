import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { open } from './helpers'

const section = (page: Page) => page.locator('#api-keys')

async function noSideScroll(page: Page): Promise<void> {
  const wide = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(wide).toBe(false)
}

test.describe('Local API keys in Settings › Advanced', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('creates a scoped key, shows secret once, lists without secret, and revokes', async ({
    page,
  }) => {
    await open(page, 'settings/api-keys', 'autoplay=0&latency=0')
    await expect(page.locator('#s-advanced')).toBeVisible()
    const p = section(page)
    await expect(p).toBeVisible()

    const list = p.getByRole('list', { name: 'Local API keys' })
    await expect(list.locator('li')).toHaveCount(2)
    await expect(list).toContainText('Stream Deck XL')
    await expect(p.getByRole('list', { name: 'Recent API key activity' })).toContainText(
      'POST /test',
    )

    // Create dialog + validation
    await p.getByRole('button', { name: 'Create API key' }).click()
    const dialog = page.getByRole('dialog', { name: 'Create local API key' })
    await expect(dialog).toBeVisible()

    await dialog.getByLabel('Key name').fill('Playwright Deck')
    await dialog.getByLabel('Alerts').check()
    await dialog.getByLabel('Expiration').selectOption('30d')
    await dialog.getByRole('button', { name: 'Create key' }).click()

    // One-time secret view
    const once = page.getByTestId('api-key-once')
    await expect(once).toBeVisible()
    const secretBox = once.getByRole('textbox', { name: 'Generated API key secret' })
    const secret = await secretBox.inputValue()
    expect(secret).toMatch(/^fc_key_[0-9a-f]{64}$/)
    await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click()
    await expect(once).toHaveCount(0)

    // Listed key shows prefix & scopes, never the full secret
    await expect(list.locator('li')).toHaveCount(3)
    const row = list.locator('li').filter({ hasText: 'Playwright Deck' })
    await expect(row).toContainText(secret.slice(0, 15))
    await expect(row).not.toContainText(secret)
    await expect(row).toContainText('Alerts')

    // Revoke confirmation
    await row.getByRole('button', { name: 'Revoke Playwright Deck' }).click()
    const revokeDialog = page.getByRole('dialog', { name: 'Revoke Playwright Deck?' })
    await expect(revokeDialog).toContainText('401 Unauthorized')
    await revokeDialog.getByRole('button', { name: 'Revoke key' }).click()
    await expect(row).toContainText('Revoked')

    // Accessibility check
    const a11y = await new AxeBuilder({ page }).include('#api-keys').analyze()
    expect(a11y.violations).toEqual([])
    await noSideScroll(page)
  })
})

test.describe('Local API keys at 375 px mobile', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('renders key list, create dialog, and secret copy view cleanly without overflow', async ({
    page,
  }) => {
    await open(page, 'settings/api-keys', 'autoplay=0&latency=0')
    const p = section(page)
    await expect(p).toBeVisible()
    await noSideScroll(page)

    const createBtn = p.getByRole('button', { name: 'Create API key' })
    const btnBox = await createBtn.boundingBox()
    expect(btnBox && btnBox.x >= 0 && btnBox.x + btnBox.width <= 375).toBe(true)

    await createBtn.click()
    const dialog = page.getByRole('dialog', { name: 'Create local API key' })
    await expect(dialog).toBeVisible()
    await dialog.getByLabel('Key name').fill('Mobile Key')
    await dialog.getByRole('button', { name: 'Create key' }).click()

    await expect(page.getByTestId('api-key-once')).toBeVisible()
    await noSideScroll(page)
    const a11y = await new AxeBuilder({ page }).include('dialog[open]').analyze()
    expect(a11y.violations).toEqual([])
  })
})
