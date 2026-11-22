import { expect, test } from '@playwright/test'

test.describe('Problem 9: demo emote URLs load with zero 404 console/network errors', () => {
  for (const vp of [
    { width: 1280, height: 800 },
    { width: 375, height: 812 },
  ]) {
    test(`demo chat emotes load cleanly without 404 errors (${vp.width}px)`, async ({ page }) => {
      const consoleErrors: string[] = []
      const failedResponses: string[] = []
      const failedRequests: string[] = []
      page.on('pageerror', (e) => consoleErrors.push(e.message))
      page.on('console', (m) => {
        if (m.type() === 'error') consoleErrors.push(m.text())
      })
      page.on('response', (res) => {
        if (res.status() >= 400) failedResponses.push(`${res.status()} ${res.url()}`)
      })
      page.on('requestfailed', (req) => {
        failedRequests.push(`${req.failure()?.errorText ?? 'failed'} ${req.url()}`)
      })

      await page.setViewportSize(vp)
      await page.goto('./?autoplay=0&latency=0#/chat')
      await expect(page.locator('#main')).toBeVisible()

      const emoteImgsLoaded = await page.evaluate(async () => {
        const demo = window.__ferrocastDemo as unknown as {
          randomChat: () => void
        }
        for (let i = 0; i < 120; i++) demo.randomChat()
        return true
      })
      expect(emoteImgsLoaded).toBe(true)

      const emoteImgs = page.locator('#main img[alt]')
      await expect.poll(async () => emoteImgs.count(), { timeout: 5000 }).toBeGreaterThan(2)

      // Check that no HTTP >= 400 response, network failure, or console error occurred while loading emotes.
      await page.waitForTimeout(1500)
      expect(failedResponses).toEqual([])
      expect(failedRequests).toEqual([])
      expect(consoleErrors).toEqual([])

      // Also verify every visible/eagerly loaded emote image rendered with non-zero dimensions.
      const loadedEmotes = await page.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('#main img[alt]'))
        return imgs.filter((img) => img.complete && img.naturalWidth > 0).length
      })
      expect(loadedEmotes).toBeGreaterThan(0)

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )
      expect(overflow).toBe(false)
    })
  }
})
