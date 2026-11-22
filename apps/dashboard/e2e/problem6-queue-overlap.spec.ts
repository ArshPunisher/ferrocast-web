import { expect, test } from '@playwright/test'
import { open } from './helpers'

test.describe('Problem 6: Home Alert queue empty state never overlaps Playing now card', () => {
  for (const vp of [
    { width: 1280, height: 800 },
    { width: 375, height: 812 },
  ]) {
    test(`transitioning from Nothing playing to Playing now never overlaps (${vp.width}px)`, async ({
      page,
    }) => {
      await page.setViewportSize(vp)
      await open(page, 'home')

      const queueRegion = page.locator('section[aria-labelledby="queue-title"]')
      await expect(queueRegion).toBeVisible()
      await expect(queueRegion.getByText('Nothing playing')).toBeVisible()

      // Watch mutations inside Alert queue to catch simultaneous Nothing playing + Playing now overlap.
      await page.evaluate(() => {
        const host = document.querySelector('section[aria-labelledby="queue-title"]')!
        ;(window as unknown as { __queueOverlap?: boolean }).__queueOverlap = false
        const check = () => {
          const text = host.textContent ?? ''
          if (text.includes('Nothing playing') && text.includes('Playing now')) {
            ;(window as unknown as { __queueOverlap?: boolean }).__queueOverlap = true
          }
        }
        const mo = new MutationObserver(check)
        mo.observe(host, { childList: true, subtree: true, characterData: true })
        ;(window as unknown as { __queueObserver?: MutationObserver }).__queueObserver = mo
      })

      await page.getByRole('button', { name: 'Test alert' }).click()
      await page.getByRole('menuitem', { name: 'Follow' }).click()

      await expect(queueRegion.getByText('Playing now')).toBeVisible({ timeout: 5000 })
      await expect(queueRegion.getByText('Nothing playing')).toBeHidden()

      const overlapped = await page.evaluate(() => {
        ;(window as unknown as { __queueObserver?: MutationObserver }).__queueObserver?.disconnect()
        return Boolean((window as unknown as { __queueOverlap?: boolean }).__queueOverlap)
      })
      expect(overlapped).toBe(false)
    })
  }
})
