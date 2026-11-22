import { expect, test } from '@playwright/test'
import { open } from './helpers'

test.describe('Problem 10: Custom HTML preview must not emit CSP console errors', () => {
  for (const vp of [
    { width: 1280, height: 800 },
    { width: 375, height: 812 },
  ]) {
    test(`refused custom HTML (onerror, script, blocked src) produces zero CSP/console errors (${vp.width}px)`, async ({
      page,
    }) => {
      const consoleErrors: string[] = []
      const pageErrors: string[] = []
      page.on('console', (m) => {
        if (m.type() === 'error') consoleErrors.push(m.text())
      })
      page.on('pageerror', (e) => pageErrors.push(e.message))

      await page.setViewportSize(vp)
      await open(page, 'alerts/follow')

      await page.getByRole('button', { name: /^Custom HTML, CSS and schema/ }).click()
      await page.getByRole('switch', { name: 'Use custom HTML & CSS' }).click()
      const htmlBox = page.getByLabel('Custom HTML', { exact: true })
      await expect(htmlBox).toBeVisible()

      await htmlBox.fill('<img src="x" onerror="alert(2)">')
      await page.waitForTimeout(300)
      await htmlBox.fill(
        '<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" onerror="alert(2)">',
      )
      await page.waitForTimeout(300)
      await htmlBox.fill('<script>alert(1)</script><p>{name}</p>')
      await page.waitForTimeout(300)

      await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
      await expect(
        page
          .getByRole('alert')
          .filter({ hasText: /can't use/i })
          .first(),
      ).toBeVisible()

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )
      expect(overflow).toBe(false)
      expect(pageErrors).toEqual([])
      expect(consoleErrors).toEqual([])
    })
  }
})
