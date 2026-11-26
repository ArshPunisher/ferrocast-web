import { expect, test } from '@playwright/test'
import { open, settled } from './helpers'

test.describe('Overlay editor Backspace and Delete layer removal', () => {
  test('desktop 1280x800: Backspace and Delete remove selected widget without triggering leave dialog, and Cmd/Ctrl+Z undoes', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await open(page, 'overlays/ov-main')
    await settled(page)

    const goalBtn = page.getByRole('button', { name: /Goal widget/ }).first()
    await expect(goalBtn).toBeVisible()
    await goalBtn.click()
    await expect(goalBtn).toHaveAttribute('aria-pressed', 'true')

    // Backspace removes Goal as one undo step, keeps URL, and never pops the leave dialog.
    await page.keyboard.press('Backspace')
    await expect(page.getByRole('button', { name: /Goal widget/ })).toHaveCount(0)
    await expect(page).toHaveURL(/#\/overlays\/ov-main$/)
    await expect(page.getByRole('dialog', { name: 'Save your layout first?' })).toHaveCount(0)
    await expect(
      page.getByText('Unsaved layout. Your stream keeps the old one until you save.'),
    ).toBeVisible()

    // Undo restores Goal at its previous position/size.
    await page.keyboard.press('ControlOrMeta+z')
    await expect(page.getByRole('button', { name: /Goal widget/ })).toHaveCount(1)

    // Delete also removes the selected layer cleanly.
    await page
      .getByRole('button', { name: /Goal widget/ })
      .first()
      .click()
    await page.keyboard.press('Delete')
    await expect(page.getByRole('button', { name: /Goal widget/ })).toHaveCount(0)

    // Clicking Back to overlays while dirty still opens the leave guard dialog.
    await page.getByRole('link', { name: 'Back to overlays' }).click()
    await expect(page.getByRole('dialog', { name: 'Save your layout first?' })).toBeVisible()
    await page.getByRole('dialog').getByRole('button', { name: 'Stay' }).click()
  })

  test('desktop 1280x800: Backspace in Text input edits characters without deleting the layer, and locked layers stay protected', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await open(page, 'overlays/ov-main')
    await settled(page)

    await page
      .getByRole('toolbar', { name: 'Canvas' })
      .getByRole('button', {
        name: 'Text',
        exact: true,
      })
      .click()
    const textLayer = page.getByRole('button', { name: /^Text: Your text here layer at/ }).first()
    await expect(textLayer).toBeVisible()

    const textField = page.getByLabel('Text', { exact: true })
    await textField.click()
    await textField.press('End')
    await textField.press('Backspace')
    await expect(textField).toHaveValue('Your text her')
    await expect(page.getByRole('button', { name: /^Text: Your text her layer at/ })).toHaveCount(1)

    // Lock the text layer via Layers list, select it on canvas, press Backspace -> stays + toast.
    const row = page
      .getByRole('list', { name: 'Layers, top first' })
      .getByRole('listitem')
      .filter({ hasText: 'Text: Your text her' })
    await row.hover()
    await page.getByRole('button', { name: 'Lock Text: Your text her' }).click()
    await page
      .getByRole('button', { name: /^Text: Your text her layer at/ })
      .first()
      .click()
    await page.keyboard.press('Backspace')
    await expect(page.getByRole('button', { name: /^Text: Your text her layer at/ })).toHaveCount(1)
    await expect(page.getByText('Unlock this layer to remove it.')).toBeVisible()
    await expect(page).toHaveURL(/#\/overlays\/ov-main$/)
  })

  test('mobile 375x812: Delete removes selected layer cleanly without overflow or leave dialog', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await open(page, 'overlays/ov-main')
    await settled(page)

    const goalBtn = page.getByRole('button', { name: /Goal widget/ }).first()
    await goalBtn.scrollIntoViewIfNeeded()
    await goalBtn.click()
    await page.keyboard.press('Delete')
    await expect(page.getByRole('button', { name: /Goal widget/ })).toHaveCount(0)
    await expect(page).toHaveURL(/#\/overlays\/ov-main$/)
    await expect(page.getByRole('dialog', { name: 'Save your layout first?' })).toHaveCount(0)

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    )
    expect(overflow).toBe(false)
  })
})
