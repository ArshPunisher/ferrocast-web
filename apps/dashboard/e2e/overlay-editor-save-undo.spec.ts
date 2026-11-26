import { expect, test } from '@playwright/test'
import { open, settled } from './helpers'

test.describe('Overlay editor preserves undo stack after Save (Extra bug #9)', () => {
  test('desktop 1280x800: Save keeps Undo enabled and restores pre-save edits with Unsaved bar', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await open(page, 'overlays/ov-main')
    await settled(page)

    const statusBar = page.getByTestId('overlay-status-bar')
    const undoBtn = page.getByRole('button', { name: 'Undo' })
    const redoBtn = page.getByRole('button', { name: 'Redo' })

    await expect(undoBtn).toBeDisabled()
    await expect(statusBar).toContainText('Saved')

    // Edit 1: remove Goal layer.
    await page
      .getByRole('button', { name: /Goal widget/ })
      .first()
      .click()
    await page.keyboard.press('Delete')
    await expect(page.getByRole('button', { name: /Goal widget/ })).toHaveCount(0)

    // Edit 2: add Text layer.
    await page
      .getByRole('toolbar', { name: 'Canvas' })
      .getByRole('button', { name: 'Text', exact: true })
      .click()
    await expect(page.getByRole('button', { name: /^Text: Your text here layer at/ })).toHaveCount(
      1,
    )
    await expect(undoBtn).toBeEnabled()

    // Save: clears Unsaved state AND keeps Undo stack intact.
    await statusBar.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Overlay saved. Your stream updates by itself.')).toBeVisible()
    await expect(statusBar).toContainText('Saved')
    await expect(statusBar.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0)
    await expect(undoBtn).toBeEnabled()

    // Undo after Save: removes Text layer and shows Unsaved bar against saved server state.
    await page.keyboard.press('ControlOrMeta+z')
    await expect(page.getByRole('button', { name: /^Text: Your text here layer at/ })).toHaveCount(
      0,
    )
    await expect(statusBar).toContainText('Unsaved layout.')
    await expect(redoBtn).toBeEnabled()

    // Second Undo: restores Goal layer too.
    await undoBtn.click()
    await expect(page.getByRole('button', { name: /Goal widget/ })).toHaveCount(1)

    // Redo twice: returns to the saved layout and clears Unsaved bar again.
    await redoBtn.click()
    await redoBtn.click()
    await expect(page.getByRole('button', { name: /^Text: Your text here layer at/ })).toHaveCount(
      1,
    )
    await expect(statusBar).toContainText('Saved')
  })

  test('mobile 375x812: Save keeps Undo enabled and restores previous layout cleanly', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await open(page, 'overlays/ov-main')
    await settled(page)

    const statusBar = page.getByTestId('overlay-status-bar')
    const undoBtn = page.getByRole('button', { name: 'Undo' })

    await page
      .getByRole('toolbar', { name: 'Canvas' })
      .getByRole('button', { name: 'Text', exact: true })
      .click()
    await expect(page.getByRole('button', { name: /^Text: Your text here layer at/ })).toHaveCount(
      1,
    )

    await statusBar.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Overlay saved. Your stream updates by itself.')).toBeVisible()
    await expect(undoBtn).toBeEnabled()

    await undoBtn.click()
    await expect(page.getByRole('button', { name: /^Text: Your text here layer at/ })).toHaveCount(
      0,
    )
    await expect(statusBar).toContainText('Unsaved layout.')
  })
})
