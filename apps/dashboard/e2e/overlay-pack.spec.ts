import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { mountStudioWithOverlayDemo, runImportFlow } from './overlay-pack-mock'

test.describe('overlay pack import (1280px desktop)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('picks, previews, imports, displays overlays & Google Fonts, and undoes cleanly', async ({
    page,
  }) => {
    const { consoleErrors, setAllowExpectedUploadReject } = await mountStudioWithOverlayDemo(page)
    await runImportFlow(page, setAllowExpectedUploadReject)
    expect(consoleErrors).toEqual([])
  })

  for (const scheme of ['dark', 'light'] as const) {
    test(`dialogs pass axe WCAG checks (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await mountStudioWithOverlayDemo(page)
      await page.goto('./#/studio/golive')
      await page.getByRole('button', { name: 'scene collection: Main Show' }).click()
      await page.getByRole('menuitem', { name: /Import a theme pack/ }).click()
      await expect(page.getByRole('dialog', { name: 'Import a theme pack' })).toBeVisible()
      const r = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual(
        [],
      )
    })
  }
})
