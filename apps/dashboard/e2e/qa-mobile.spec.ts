import { expect, test } from '@playwright/test'
import { open, pastSetupQuestions } from './helpers'

test.use({ viewport: { width: 375, height: 812 } })

test('first run: the last step (Connect) fits a 375 px phone', async ({ page }) => {
  await open(page, 'home', 'firstrun&autoplay=0&latency=0')
  await pastSetupQuestions(page)
  await expect(page.getByRole('button', { name: 'Skip for now' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Bring your commands and points' })).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})
