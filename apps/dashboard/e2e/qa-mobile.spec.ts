import { expect, test } from '@playwright/test'
import { open } from './helpers'

test.use({ viewport: { width: 375, height: 812 } })

test('first run: the look preview fits a 375 px phone as one picture', async ({ page }) => {
  await open(page, 'home', 'firstrun&autoplay=0&latency=0')
  await page.getByRole('button', { name: 'Skip for now' }).click()
  const stage = page.getByRole('figure', { name: /Preview of the .+ look/ })
  await expect(stage).toBeVisible()
  // The stage is laid out at desktop width and scaled down, so the name never splits.
  const scale = await stage.evaluate((el) => {
    const host = el.querySelector<HTMLElement>('[style*="scale"]')
    return host ? new DOMMatrix(getComputedStyle(host).transform).a : 1
  })
  expect(scale).toBeLessThan(1)
  expect(scale).toBeGreaterThan(0.4)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})
