import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { open } from './helpers'

// A theme into OBS in the demo engine (24 Oct picks 1A, 2B, 4, 5A, 6A, 7): Use with "Set it
// up in OBS too", untick a screen, the checklist, Make it yours, the card, and Take it out.

async function useFirstTheme(page: Page) {
  await open(page, 'designs/themes')
  await page.getByRole('button', { name: 'Use theme' }).first().click()
  return page.getByRole('dialog')
}

async function serious(page: Page) {
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    // Overlay previews are the stream's own art, animating (checked in the overlays package).
    .exclude('[data-overlay-preview]')
    .analyze()
  return r.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map(
      (v) =>
        `${v.id}: ${v.nodes
          .map((n) => n.target.join(' '))
          .slice(0, 3)
          .join(', ')}`,
    )
}

test.describe('theme in OBS', () => {
  test('one click puts it in OBS, made yours, then taken out', async ({ page }) => {
    const dialog = await useFirstTheme(page)
    await expect(dialog.getByRole('switch', { name: 'Set it up in OBS too' })).toBeChecked()
    await dialog.getByRole('button', { name: 'Ending', pressed: true }).click()
    await expect(dialog.getByRole('button', { name: 'Add 4 scenes to OBS' })).toBeVisible()
    await dialog.getByRole('button', { name: 'Add 4 scenes to OBS' }).click()

    const done = page.getByRole('dialog', { name: /is in OBS$/ })
    await expect(done.getByRole('list', { name: 'What happened' })).toBeVisible()
    await expect(done.getByText('Start show’s scenes')).toBeVisible()
    await done.getByRole('button', { name: 'Make it yours' }).click()

    const mine = page.getByRole('dialog', { name: /^Make .* yours$/ })
    await mine.getByRole('button', { name: 'Colour #ff4fa3' }).click()
    await mine.getByPlaceholder('yourname…').fill('novaplays')
    await mine.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Saved. OBS shows it now.')).toBeVisible()

    await page.evaluate(() => (location.hash = '#/studio/obs'))
    const card = page.locator('#theme-in-obs')
    await expect(card.getByText(/\(mine\)$/)).toBeVisible()
    await expect(card.getByText('4 scenes in OBS')).toBeVisible()
    await card.getByRole('button', { name: 'Take it out' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Take it out' }).click()
    await expect(page.getByText('Taken out of OBS.')).toBeVisible()
    await expect(card.getByText('None yet.')).toBeVisible()
  })

  test('Advanced lists every screen; a bad pick is explained', async ({ page }) => {
    const dialog = await useFirstTheme(page)
    await dialog.getByRole('radio', { name: 'Advanced' }).check({ force: true })
    const inGame = dialog.getByRole('combobox', { name: 'In game: under it' })
    await expect(inGame).toHaveValue('Gameplay')
    await dialog.getByRole('combobox', { name: /Starting soon: Start show/ }).selectOption('live')
    await expect(dialog.getByRole('alert')).toContainText('only one screen')
    await expect(dialog.getByRole('button', { name: /Add 5 scenes/ })).toBeDisabled()
    await dialog
      .getByRole('combobox', { name: /Starting soon: Start show/ })
      .selectOption('starting')
    await expect(dialog.getByRole('button', { name: /Add 5 scenes/ })).toBeEnabled()
    await dialog.getByRole('radio', { name: 'Simple' }).check({ force: true })
  })

  test('without OBS the switch says why and Use works as before', async ({ page }) => {
    await open(page, 'settings/obs')
    const obs = page.locator('#s-obs')
    await obs.getByRole('spinbutton', { name: 'Port' }).fill('4999')
    await obs.getByRole('button', { name: 'Connect OBS' }).click()
    await page.evaluate(() => (location.hash = '#/designs/themes'))
    await page.getByRole('button', { name: 'Use theme' }).first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('switch', { name: 'Set it up in OBS too' })).toBeDisabled()
    await dialog.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByRole('dialog').getByText('Put it on')).toBeVisible()
  })

  for (const scheme of ['dark', 'light'] as const)
    test(`the dialogs have no serious accessibility problems (${scheme})`, async ({ page }) => {
      // Two scans over live previews: slow in WebKit when other tests run alongside.
      test.setTimeout(90_000)
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      const dialog = await useFirstTheme(page)
      await expect(dialog.getByRole('button', { name: /Add 5 scenes/ })).toBeVisible()
      expect(await serious(page)).toEqual([])
      await dialog.getByRole('button', { name: /Add 5 scenes/ }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Make it yours' }).click()
      await expect(page.getByRole('dialog', { name: /yours$/ })).toBeVisible()
      expect(await serious(page)).toEqual([])
    })

  test('an (i) shows its text on hover and on tap, and Escape closes it', async ({ page }) => {
    await open(page, 'studio/golive')
    const tip = page.locator('#golive-platforms header').getByRole('button', { name: 'More info' })
    await tip.hover()
    const bubble = page.locator('body > div.fixed[aria-hidden]')
    await expect(bubble).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(bubble).toHaveCount(0)
    await tip.click()
    await expect(bubble).toBeVisible()
    await page.mouse.click(5, 5)
    await expect(bubble).toHaveCount(0)
  })
})
