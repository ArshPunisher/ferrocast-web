import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { open } from './helpers'

const shots = process.env.FC_SHOTS

function snap(page: Page, name: string) {
  if (!shots) return Promise.resolve()
  mkdirSync(shots, { recursive: true })
  return page.screenshot({ path: join(shots, name) })
}

async function openStudioAudio(page: Page, narrow = false) {
  await page.addInitScript(() => {
    localStorage.setItem('fc-golive-picture', 'ferrocast')
    localStorage.removeItem('fc-studio-standby-scene')
  })
  await open(page, 'studio', 'autoplay=0&latency=0&studioEngine=1')
  await page.getByRole('button', { name: 'Start the Studio' }).click()
  await page.locator('[data-canvas-box]').waitFor({ state: 'visible', timeout: 10_000 })
  if (narrow) {
    await page
      .getByRole('radiogroup', { name: 'Panel' })
      .getByText('Audio', { exact: true })
      .click()
  }
  const audio = page.getByRole('region', { name: 'Audio' })
  await expect(audio).toBeVisible()
  return audio
}

test.describe('audio mixer row menu Remove (#1)', () => {
  test('removes and undoes a global device via row ... menu at 1280x800', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    const audio = await openStudioAudio(page)

    await expect(audio.getByRole('button', { name: 'More for Desktop Audio' })).toBeVisible()
    await audio.getByRole('button', { name: 'More for Desktop Audio' }).click()

    const menu = page.getByRole('menu', { name: 'Desktop Audio' })
    await expect(menu).toBeVisible()
    const removeItem = menu.getByRole('menuitem', { name: 'Remove' })
    await expect(removeItem).toBeVisible()
    await expect(removeItem).toHaveClass(/text-danger/)
    await snap(page, 'mixer-remove-menu-1280.png')

    await removeItem.click()
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Remove Desktop Audio from every scene?')
    await snap(page, 'mixer-remove-confirm-1280.png')

    await dialog.getByRole('button', { name: 'Remove' }).click()
    await expect(audio.getByRole('button', { name: 'More for Desktop Audio' })).toHaveCount(0)

    const undoBtn = page.getByRole('button', { name: 'Undo' }).first()
    await expect(undoBtn).toBeVisible()
    await snap(page, 'mixer-remove-undo-toast-1280.png')
    await undoBtn.click()
    await expect(audio.getByRole('button', { name: 'More for Desktop Audio' })).toBeVisible()
  })

  test('removes and confirms cleanly at 375x812 without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    const audio = await openStudioAudio(page, true)

    await audio.getByRole('button', { name: 'More for Desktop Audio' }).click()
    const menu = page.getByRole('menu', { name: 'Desktop Audio' })
    await menu.getByRole('menuitem', { name: 'Remove' }).click()

    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
    await snap(page, 'mixer-remove-confirm-375.png')

    await dialog.getByRole('button', { name: 'Remove' }).click()
    await expect(audio.getByRole('button', { name: 'More for Desktop Audio' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Undo' }).first().click()
    await expect(audio.getByRole('button', { name: 'More for Desktop Audio' })).toBeVisible()
  })
})
