import { expect, test } from '@playwright/test'

test.describe('Problem 11.1: Studio More tools popup buttons have visible text labels', () => {
  for (const vp of [
    { width: 1280, height: 800 },
    { width: 375, height: 812 },
  ]) {
    test(`every button inside More tools shows a readable label (${vp.width}px)`, async ({
      page,
    }) => {
      await page.setViewportSize(vp)
      await page.addInitScript(() => {
        localStorage.setItem('fc-golive-picture', 'ferrocast')
      })
      await page.goto('./?autoplay=0&latency=0&studioEngine=1#/studio')
      await expect(page.locator('#main')).toBeVisible()
      await page.getByRole('button', { name: 'Start the Studio' }).click()

      const moreBtn = page.getByRole('button', { name: 'More tools' })
      await expect(moreBtn).toBeVisible()
      await moreBtn.click()

      const panel = page.getByRole('group', { name: 'More tools' })
      await expect(panel).toBeVisible()

      const unlabeled = await panel.evaluate((el) => {
        return Array.from(el.querySelectorAll<HTMLButtonElement>('button'))
          .filter((btn) => {
            const style = getComputedStyle(btn)
            if (style.display === 'none' || style.visibility === 'hidden') return false
            return (btn.textContent ?? '').trim().length === 0
          })
          .map((btn) => btn.getAttribute('aria-label') || '(no aria-label)')
      })
      expect(unlabeled).toEqual([])

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )
      expect(overflow).toBe(false)
    })
  }
})
