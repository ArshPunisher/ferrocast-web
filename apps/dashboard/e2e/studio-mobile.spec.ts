import { expect, test } from '@playwright/test'
import { open } from './helpers'

test.use({ viewport: { width: 375, height: 812 } })

for (const s of ['studio/show', 'studio/info', 'studio/obs', 'studio/moments', 'bot', 'home'])
  test(`${s} fits a 375 px phone`, async ({ page }) => {
    await open(page, s)
    await page.waitForTimeout(400)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })

test('Start show works on a phone', async ({ page }) => {
  await open(page, 'home')
  await page.getByRole('button', { name: 'Start show' }).click()
  await page
    .getByRole('dialog', { name: 'Start show' })
    .getByRole('button', { name: 'Start show' })
    .click()
  await expect(page.getByText('Show started: counting down to the live scene.')).toBeVisible()
})
