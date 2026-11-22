import { expect, test } from '@playwright/test'

test.describe('Problem 11.5: Onboarding Spark light contrast and skipped badge spacing', () => {
  for (const vp of [
    { width: 1280, height: 800 },
    { width: 375, height: 812 },
  ]) {
    test(`SparkField uses light ink in High contrast and skipped items keep badge space (${vp.width}px)`, async ({
      page,
    }) => {
      await page.setViewportSize(vp)
      await page.goto('./?autoplay=0&latency=0&firstrun=1&studioEngine=1')
      await expect(page.getByRole('heading', { name: /Bring your scenes/i })).toBeVisible()

      await page.getByText('Import from OBS Studio').click()
      await expect(page.getByText('What cannot come across', { exact: false })).toBeVisible()

      // Every skipped list item must separate category badge text from item name with whitespace.
      const listItems = await page
        .locator('ul li')
        .evaluateAll((els) =>
          els
            .map((el) => el.textContent ?? '')
            .filter(
              (t) => t.includes('Uses NDI') || t.includes('Legacy VST') || t.includes('GameHook'),
            ),
        )
      expect(listItems.length).toBeGreaterThan(0)
      for (const txt of listItems) {
        expect(txt).toMatch(/^(Source|Plugin|Filter)\s+/)
      }

      if (vp.width >= 1024) {
        const spark = page.locator('canvas[aria-label*="Ferrocast Spark"]')
        await expect(spark).toBeVisible()
        await page.evaluate(() => {
          document.documentElement.dataset.theme = 'contrast'
          window.dispatchEvent(new Event('fc-theme-change'))
        })
        await expect(spark).toHaveAttribute('data-tone', 'light')
      }

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )
      expect(overflow).toBe(false)
    })
  }
})
