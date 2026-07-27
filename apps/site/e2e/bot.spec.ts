import { expect, test } from '@playwright/test'

// Sparky on the Download page: decorative, eyes follow the cursor, moods react.
const pupil = (page: import('@playwright/test').Page) =>
  page.locator('[data-bot] .pupil').first().getAttribute('transform')

test('Sparky is decorative and his eyes follow the cursor', async ({ page }) => {
  await page.goto('/download/')
  const svg = page.locator('[data-bot] svg')
  await expect(svg).toHaveAttribute('aria-hidden', 'true')
  const box = (await svg.boundingBox())!
  await page.mouse.move(box.x - 300, box.y + box.height * 0.4)
  await page.waitForTimeout(500)
  const left = await pupil(page)
  await page.mouse.move(Math.min(box.x + box.width + 120, 1430), box.y + box.height * 0.4)
  await page.waitForTimeout(500)
  const right = await pupil(page)
  const x = (t: string | null) => Number(/translate\(([-\d.]+)/.exec(t ?? '')?.[1])
  expect(x(left)).toBeLessThan(-3)
  expect(x(right)).toBeGreaterThan(3)
})

test('Sparky gets excited over a download, and giggles when clicked', async ({ page }) => {
  await page.goto('/download/')
  const svg = page.locator('[data-bot] svg')
  await page.locator('.os').first().hover()
  await expect(svg).toHaveAttribute('data-mood', 'excited')
  await page.mouse.move(5, 600)
  await expect(svg).not.toHaveAttribute('data-mood', 'excited')
  await svg.click()
  await expect(svg).toHaveAttribute('data-mood', 'giggle')
  // keyboard focus on a download link counts too
  await page.locator('.notify-actions a').first().focus()
  await expect(svg).toHaveAttribute('data-mood', 'excited')
})

test('the 3D icon and its pause button are gone from the Download page', async ({ page }) => {
  await page.goto('/download/')
  await expect(page.locator('[data-station], .st-pause')).toHaveCount(0)
})
