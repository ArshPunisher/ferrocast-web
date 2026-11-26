import { expect, test } from '@playwright/test'
import { open, settled } from './helpers'

test.describe('Overlays validation and unique widget IDs (Extra bugs #5, #6)', () => {
  test('desktop 1280x800: blocks whitespace-only overlay rename and trims valid names', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await open(page, 'overlays')
    await settled(page)

    await page
      .getByRole('button', { name: /^More for / })
      .first()
      .click()
    await page.getByRole('menuitem', { name: 'Rename', exact: true }).click()

    const dialog = page.getByRole('dialog', { name: 'Rename overlay' })
    const input = dialog.getByLabel('Name')
    const saveBtn = dialog.getByRole('button', { name: 'Save', exact: true })

    await input.fill('')
    await expect(saveBtn).toBeDisabled()

    await input.fill('   ')
    await expect(saveBtn).toBeDisabled()
    await input.press('Enter')
    await expect(dialog).toContainText('Give it a name')

    await input.fill('  Stream Stage  ')
    await expect(saveBtn).toBeEnabled()
    await saveBtn.click()

    await expect(page.getByText('Renamed.')).toBeVisible()
    await expect(dialog).toBeHidden()
    await expect(page.getByText('Stream Stage', { exact: true }).first()).toBeVisible()
  })

  test('desktop 1280x800: rapid layer additions and duplicates stay independent', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await open(page, 'overlays/ov-main')
    await settled(page)

    const textBtn = page
      .getByRole('toolbar', { name: 'Canvas' })
      .getByRole('button', { name: 'Text', exact: true })
    await textBtn.click()
    await textBtn.click()

    const dupBtn = page.getByRole('button', { name: 'Duplicate', exact: true })
    await dupBtn.click()
    await dupBtn.click()

    const textLayers = page.getByRole('button', { name: /^Text: Your text here layer at/ })
    await expect(textLayers).toHaveCount(4)

    await page.keyboard.press('Delete')
    await expect(textLayers).toHaveCount(3)
  })

  test('mobile 375x812: overlay rename dialog rejects whitespace without horizontal overflow', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await open(page, 'overlays')
    await settled(page)

    await page
      .getByRole('button', { name: /^More for / })
      .first()
      .click()
    await page.getByRole('menuitem', { name: 'Rename', exact: true }).click()

    const dialog = page.getByRole('dialog', { name: 'Rename overlay' })
    const input = dialog.getByLabel('Name')
    const saveBtn = dialog.getByRole('button', { name: 'Save', exact: true })

    await input.fill('   ')
    await expect(saveBtn).toBeDisabled()

    await input.fill('  Mobile Stage  ')
    await expect(saveBtn).toBeEnabled()
    await saveBtn.click()

    await expect(page.getByText('Renamed.')).toBeVisible()
    await expect(page.getByText('Mobile Stage', { exact: true }).first()).toBeVisible()

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
  })
})
