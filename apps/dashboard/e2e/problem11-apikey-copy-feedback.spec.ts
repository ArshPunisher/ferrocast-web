import { expect, test } from '@playwright/test'
import { open } from './helpers'

test.describe('Problem 11.6: API key Copy key button shows inline Copied feedback', () => {
  for (const vp of [
    { width: 1280, height: 800 },
    { width: 375, height: 812 },
  ]) {
    test(`clicking Copy key updates button text to Copied (${vp.width}px)`, async ({
      page,
      context,
      browserName,
    }) => {
      // Playwright's WebKit has no clipboard permissions to grant (it throws on the names); a
      // click is a user gesture, so WebKit lets the page write to the clipboard without one.
      if (browserName !== 'webkit')
        await context.grantPermissions(['clipboard-read', 'clipboard-write'])
      await page.setViewportSize(vp)
      await open(page, 'settings/advanced')

      await page.getByRole('button', { name: 'Create API key' }).click()
      const dialog = page.getByRole('dialog', { name: 'Create local API key' })
      await expect(dialog).toBeVisible()
      await dialog.getByLabel('Key name').fill('Deck Integration')
      await dialog.getByRole('button', { name: 'Create key' }).click()

      const savedDialog = page.getByRole('dialog', { name: 'Save your new API key' })
      await expect(savedDialog).toBeVisible()
      const copyBtn = savedDialog.getByRole('button', { name: 'Copy key' })
      await expect(copyBtn).toBeVisible()
      await copyBtn.click()

      await expect(savedDialog.getByRole('button', { name: 'Copied' })).toBeVisible()
      await expect(savedDialog.getByRole('button', { name: 'Copy key' })).toHaveCount(0)

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )
      expect(overflow).toBe(false)
    })
  }
})
