import { expect, test, type Page } from '@playwright/test'
import { open } from './helpers'

const tile = (page: Page, name: string) =>
  page.locator('[aria-live="polite"]').getByRole('article', { name, exact: true })

async function useFerrocastStudio(page: Page) {
  await page.addInitScript(() => {
    ;(window as unknown as { __FERROCAST__: unknown }).__FERROCAST__ = { desktop: true }
    localStorage.setItem('fc-golive-picture', 'ferrocast')
  })
}

async function startStudio(page: Page) {
  await open(page, 'studio/golive', 'autoplay=0&latency=0&studioEngine=1')
  await page.getByRole('button', { name: 'Start the Studio' }).click()
  await expect(page.locator('[data-canvas-box]').first()).toBeVisible()
}

test.describe('partial theme import (Group D)', () => {
  test('ticks only selected screens into Studio and detects already added screens on re-import', async ({
    page,
  }) => {
    await useFerrocastStudio(page)
    await startStudio(page)
    await page.evaluate(() => (location.hash = '#/designs/themes'))
    await expect(page.getByRole('heading', { name: 'Designs', level: 1 })).toBeVisible()

    await tile(page, 'Lo-fi loft').getByRole('button', { name: 'Use theme' }).click()
    const dialog = page.getByRole('dialog', { name: 'Use Lo-fi loft' })
    await expect(dialog.getByText('Screens (5 of 5)')).toBeVisible()
    await expect(dialog.getByRole('switch', { name: 'Set it up in the Studio' })).toBeChecked()

    // Untick three screens, leaving Starting soon and Ending.
    await dialog.getByRole('button', { name: 'In game', pressed: true }).click()
    await dialog.getByRole('button', { name: 'Just chatting', pressed: true }).click()
    await dialog.getByRole('button', { name: 'Be right back', pressed: true }).click()
    await expect(dialog.getByText('Screens (2 of 5)')).toBeVisible()

    await dialog.getByRole('button', { name: 'Next' }).click()
    await expect(dialog.getByRole('button', { name: 'Make 2 overlays' })).toBeVisible()
    await dialog.getByRole('button', { name: 'Make 2 overlays' }).click()

    await expect(page.getByText(/2 scenes made in the Studio/)).toBeVisible()
    await expect(page).toHaveURL(/#\/studio/)

    const scenesTab = page.getByRole('tab', { name: 'Scenes' })
    if (await scenesTab.isVisible()) await scenesTab.click()

    // Only the two ticked scenes were added to Studio (and matched to the right overlays).
    await expect(page.getByRole('button', { name: /Lo-fi loft · Starting soon/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Lo-fi loft · Ending/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Lo-fi loft · Just chatting/ })).toHaveCount(0)

    // Re-open Lo-fi loft: Starting soon and Ending now show "Already added" and default unticked.
    await page.evaluate(() => (location.hash = '#/designs/themes'))
    await tile(page, 'Lo-fi loft').getByRole('button', { name: 'Use theme' }).click()
    const dialog2 = page.getByRole('dialog', { name: 'Use Lo-fi loft' })
    await expect(dialog2.getByText('Already added')).toHaveCount(2)
    await expect(dialog2.getByText('Screens (3 of 5)')).toBeVisible()
    await expect(dialog2.getByRole('button', { name: 'Starting soon' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    await expect(dialog2.getByRole('button', { name: 'Ending' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    await expect(dialog2.getByRole('button', { name: 'Just chatting' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    // Manually ticking an already-added screen displays the duplicate notice.
    await dialog2.getByRole('button', { name: 'Ending' }).click()
    await expect(dialog2.getByText(/Already-added screens will be created/)).toBeVisible()
    await dialog2.getByRole('button', { name: 'Ending' }).click()

    await dialog2.getByRole('switch', { name: 'Set it up in the Studio' }).click()
    await dialog2.getByRole('button', { name: 'Next' }).click()
    await dialog2.getByRole('button', { name: 'Make 3 overlays' }).click()

    await expect(page).toHaveURL(/#\/overlays$/)
    await expect(page.getByText('In game (Lo-fi loft)')).toHaveCount(1)
    await expect(page.getByText('Starting soon (Lo-fi loft)')).toHaveCount(1)
    await expect(page.getByText('Ending (Lo-fi loft)')).toHaveCount(1)
  })

  test('supports alert-style-only import via Select none', async ({ page }) => {
    await useFerrocastStudio(page)
    await open(page, 'designs')

    await tile(page, 'Forge').getByRole('button', { name: 'Use theme' }).click()
    const dialog = page.getByRole('dialog', { name: 'Use Forge' })
    await dialog.getByRole('button', { name: 'Select none' }).click()
    await expect(dialog.getByText('Screens (0 of 5)')).toBeVisible()

    const useAlert = dialog.getByRole('button', { name: 'Use alert style' })
    await expect(useAlert).toBeEnabled()
    await dialog.getByRole('switch', { name: 'Use its alert style' }).click()
    await expect(useAlert).toBeDisabled()
    await dialog.getByRole('switch', { name: 'Use its alert style' }).click()
    await expect(useAlert).toBeEnabled()

    await useAlert.click()
    await expect(page.getByText(/Forge’s alert style now plays your alerts/)).toBeVisible()

    // No Forge screen overlays should have been created.
    await page.evaluate(() => (location.hash = '#/overlays'))
    await expect(page.getByText(/\(Forge\)/)).toHaveCount(0)
  })

  test('Use just this screen from ThemeSheet and One part copy into existing overlay', async ({
    page,
  }) => {
    await useFerrocastStudio(page)
    await open(page, 'designs')

    // Preview Forge and switch to Ending, then click "Use just this screen".
    await tile(page, 'Forge').getByRole('button', { name: 'Preview' }).click()
    const sheet = page.getByRole('dialog', { name: 'Forge' })
    await sheet.getByRole('tab', { name: 'Ending' }).click()
    await sheet.getByRole('button', { name: 'Use just this screen' }).click()

    const useDialog = page.getByRole('dialog', { name: 'Use Forge' })
    await expect(useDialog.getByText('Screens (1 of 5)')).toBeVisible()
    await expect(useDialog.getByRole('button', { name: 'Ending', pressed: true })).toBeVisible()
    await expect(useDialog.getByRole('button', { name: 'Starting soon' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    await useDialog.getByRole('switch', { name: 'Set it up in the Studio' }).click()
    await useDialog.getByRole('button', { name: 'Next' }).click()
    await useDialog.getByRole('button', { name: 'Make 1 overlay' }).click()
    await expect(page).toHaveURL(/#\/overlays\//)
    await expect(page.getByText('Ending (Forge)')).toBeVisible()

    // Switch back to Designs and test "One part" mode adding a widget into an existing overlay.
    await page.evaluate(() => (location.hash = '#/designs/themes'))
    await tile(page, 'Lo-fi loft').getByRole('button', { name: 'Use theme' }).click()
    const partDialog = page.getByRole('dialog', { name: 'Use Lo-fi loft' })
    await partDialog.getByRole('radio', { name: 'One part' }).check({ force: true })
    await partDialog.getByLabel('Add to overlay').selectOption({ index: 1 })
    await partDialog.getByRole('button', { name: 'Add part' }).click()
    await expect(page).toHaveURL(/#\/overlays\//)
    await expect(page.getByText(/added to/)).toBeVisible()
  })

  test('layout stays fit without horizontal overflow at 375 px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await useFerrocastStudio(page)
    await open(page, 'designs')

    await tile(page, 'Lo-fi loft').getByRole('button', { name: 'Preview' }).click()
    const sheet = page.getByRole('dialog', { name: 'Lo-fi loft' })
    await expect(sheet.getByRole('button', { name: 'Use just this screen' })).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true)

    await sheet.getByRole('button', { name: 'Use just this screen' }).click()
    const dialog = page.getByRole('dialog', { name: 'Use Lo-fi loft' })
    await expect(dialog.getByText('Screens (1 of 5)')).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true)
  })
})
