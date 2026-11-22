import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { open } from './helpers'

test.describe('Community Theme Store (R37)', () => {
  test('browses, searches, filters categories, inspects creator page and local perf score', async ({
    page,
  }) => {
    await open(page, 'store', 'autoplay=0&latency=0')
    await expect(page.getByRole('heading', { name: 'Community Store', level: 1 })).toBeVisible()

    // Shows catalog items, read-only stats, and local perf pill.
    const aurora = page.getByTestId('store-card-aurora-pulse')
    await expect(aurora).toBeVisible()
    await expect(aurora.getByText(/\/100 ·/)).toBeVisible()
    await expect(aurora.getByText(/installs/)).toBeVisible()

    // Category filter & search.
    // The rail's rows carry their counts ("Alerts 1").
    const cats = page.getByRole('group', { name: 'Store categories' })
    await cats.getByRole('button', { name: /^Alerts\b/ }).click()
    await expect(page.getByTestId('store-card-arcade-ticker-alert')).toBeVisible()
    await expect(page.getByTestId('store-card-aurora-pulse')).toHaveCount(0)

    await cats.getByRole('button', { name: /^All\b/ }).click()
    await page.getByLabel('Search Community Store').fill('shader')
    await expect(page.getByTestId('store-card-soft-dimmer-shader')).toBeVisible()
    await expect(page.getByTestId('store-card-aurora-pulse')).toHaveCount(0)
    await page.getByLabel('Search Community Store').fill('')

    // Creator page navigation + back.
    await page
      .getByTestId('store-card-aurora-pulse')
      .getByRole('button', { name: /Mira Atelier/ })
      .click()
    await expect(page.getByTestId('store-creator-page')).toBeVisible()
    await expect(page.getByText('@miraatelier')).toBeVisible()
    await page.getByRole('button', { name: 'Back to Community Store' }).click()
    await expect(page.getByTestId('store-card-aurora-pulse')).toBeVisible()
  })

  test('ferrocast:// link opens confirmation dialog first, installs only on confirmation, and supports Undo/Update/Uninstall', async ({
    page,
  }) => {
    await open(page, 'store', 'autoplay=0&latency=0')
    await expect(page.getByTestId('store-card-aurora-pulse')).toBeVisible()

    // Open ferrocast:// link via hash routing -> MUST ask before installing!
    await page.evaluate(() => {
      window.location.hash = `#/store?link=${encodeURIComponent('ferrocast://store/install/aurora-pulse')}`
    })
    const dlg = page.getByTestId('ferrocast-link-dialog')
    await expect(dlg).toBeVisible()
    await expect(dlg.getByText('Install “Aurora Pulse”?')).toBeVisible()
    // Cancelling installs nothing.
    await dlg.getByRole('button', { name: 'Cancel' }).click()
    await expect(dlg).toBeHidden()
    await expect(page.getByTestId('installed-row-aurora-pulse')).toHaveCount(0)

    // Reopen and test malicious ferrocast:// URI via UI input.
    await page.getByRole('button', { name: 'Open ferrocast:// link' }).click()
    await page
      .getByLabel('Ferrocast install URI')
      .fill('ferrocast://store/install/../../etc/passwd')
    await dlg.getByRole('button', { name: 'Inspect', exact: true }).click()
    await expect(dlg.getByRole('alert')).toBeVisible()

    // Valid link + Confirm & Install -> installs & enables One-click Undo.
    await page.getByLabel('Ferrocast install URI').fill('ferrocast://store/install/aurora-pulse')
    await dlg.getByRole('button', { name: 'Inspect', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Confirm & Install' })).toBeVisible()
    await page.getByRole('button', { name: 'Confirm & Install' }).click()
    await expect(page.getByTestId('installed-row-aurora-pulse')).toBeVisible()

    // Simulate catalog update and verify Update -> Undo -> Uninstall -> Undo cleanly.
    await page.evaluate(() => {
      window.__ferrocastDemo?.bumpStoreItemVersion('aurora-pulse', '1.3.0')
    })
    await page.getByRole('button', { name: 'Refresh catalog' }).click()
    await expect(
      page.getByTestId('store-card-aurora-pulse').getByRole('button', { name: 'Update to 1.3.0' }),
    ).toBeVisible()
    await page
      .getByTestId('store-card-aurora-pulse')
      .getByRole('button', { name: 'Update to 1.3.0' })
      .click()
    await expect(page.getByTestId('installed-row-aurora-pulse').getByText('v1.3.0')).toBeVisible()

    // One-click Undo update reverts back to v1.2.0.
    await page.getByTestId('store-undo-bar').getByRole('button', { name: 'Undo' }).click()
    await expect(page.getByTestId('installed-row-aurora-pulse').getByText('v1.2.0')).toBeVisible()

    // Tampered/bad signature catalog error shows error while installed item remains removable.
    await page.evaluate(() => {
      window.__ferrocastDemo?.setStoreFault('bad_signature')
    })
    await page.getByRole('button', { name: 'Refresh catalog' }).click()
    await expect(page.getByText(/signature isn’t valid/)).toBeVisible()
    await expect(page.getByTestId('installed-row-aurora-pulse')).toBeVisible()
    await page
      .getByTestId('installed-row-aurora-pulse')
      .getByRole('button', { name: 'Uninstall' })
      .click()
    await expect(page.getByTestId('installed-row-aurora-pulse')).toHaveCount(0)

    // Clear fault.
    await page.evaluate(() => {
      window.__ferrocastDemo?.setStoreFault(null)
    })
  })

  test('renders cleanly at 375px mobile width and supports keyboard + Escape close', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await open(page, 'store', 'autoplay=0&latency=0')
    await expect(page.getByTestId('store-card-arcade-ticker-alert')).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(overflow).toBe(false)

    // Detail dialog opens & closes with Escape cleanly, showing sandbox badge.
    await page
      .getByTestId('store-card-arcade-ticker-alert')
      .getByRole('button', { name: 'Preview' })
      .click()
    await expect(page.getByTestId('store-item-detail')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('store-item-detail')).toBeHidden()
  })

  test('store passes axe accessibility checks at 1280px and 375px', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
    await open(page, 'store', 'autoplay=0&latency=0')
    await expect(page.getByTestId('store-card-aurora-pulse')).toBeVisible()
    const desktopAxe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .exclude('[data-overlay-preview]')
      .analyze()
    expect(
      desktopAxe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    ).toEqual([])

    await page.setViewportSize({ width: 375, height: 812 })
    const mobileAxe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .exclude('[data-overlay-preview]')
      .analyze()
    expect(
      mobileAxe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    ).toEqual([])
  })

  test('an unknown creator or item says so, with a way back', async ({ page }) => {
    await open(page, 'store/creator/nobody', 'autoplay=0&latency=0')
    await expect(page.getByText('That creator isn’t in the Store.')).toBeVisible()
    await page.getByRole('link', { name: 'Back to the Store' }).click()
    await expect(page.getByTestId('store-card-aurora-pulse')).toBeVisible()
    await open(page, 'store/item/nothing', 'autoplay=0&latency=0')
    await expect(page.getByText(/That item isn’t in the Store/)).toBeVisible()
  })

  test.describe('what the Store screen shows stays true', () => {
    const link = (page: import('@playwright/test').Page, uri: string) =>
      page.evaluate((u) => {
        window.location.hash = `#/store?link=${encodeURIComponent(u)}`
      }, uri)

    const installViaLink = async (page: import('@playwright/test').Page, id: string) => {
      await link(page, `ferrocast://store/install/${id}`)
      await page.getByRole('button', { name: 'Confirm & Install' }).click()
      await expect(page.getByTestId(`installed-row-${id}`)).toBeVisible()
    }

    test('the search box narrows the Installed list too', async ({ page }) => {
      await open(page, 'store', 'autoplay=0&latency=0')
      await installViaLink(page, 'aurora-pulse')
      await installViaLink(page, 'foundry-goal-widget')
      await page.getByRole('button', { name: /^Installed/ }).click()
      await expect(page.getByTestId('installed-row-aurora-pulse')).toBeVisible()
      await expect(page.getByTestId('installed-row-foundry-goal-widget')).toBeVisible()
      await page.getByLabel('Search Community Store').fill('aurora')
      await expect(page.getByTestId('installed-row-aurora-pulse')).toBeVisible()
      await expect(page.getByTestId('installed-row-foundry-goal-widget')).toHaveCount(0)
      await page.getByLabel('Search Community Store').fill('zzzz')
      await expect(page.getByText(/No installed items match/)).toBeVisible()
    })

    test('View details on an item link closes the link dialog', async ({ page }) => {
      await open(page, 'store', 'autoplay=0&latency=0')
      await link(page, 'ferrocast://store/item/intermission-slate')
      await page.getByRole('button', { name: 'View details' }).click()
      await expect(page.getByTestId('store-item-detail')).toBeVisible()
      await expect(page.getByTestId('ferrocast-link-dialog')).toHaveCount(0)
    })

    test('a catalog that failed to reload no longer offers Uninstall for what was removed', async ({
      page,
    }) => {
      await open(page, 'store', 'autoplay=0&latency=0')
      await installViaLink(page, 'aurora-pulse')
      await page.evaluate(() => window.__ferrocastDemo?.setStoreFault('bad_signature'))
      await page.getByRole('button', { name: 'Refresh catalog' }).click()
      await expect(page.getByText(/signature isn’t valid/)).toBeVisible()
      await page
        .getByTestId('installed-row-aurora-pulse')
        .getByRole('button', { name: 'Uninstall' })
        .click()
      await expect(page.getByTestId('installed-row-aurora-pulse')).toHaveCount(0)
      await page.evaluate(() => {
        window.location.hash = '#/store/item/aurora-pulse'
      })
      const detail = page.getByTestId('store-item-detail')
      await expect(detail).toBeVisible()
      await expect(detail.getByRole('button', { name: 'Uninstall' })).toHaveCount(0)
      await expect(detail.getByRole('button', { name: 'Install package' })).toBeVisible()
      await page.evaluate(() => window.__ferrocastDemo?.setStoreFault(null))
    })

    test('a link result that arrives after the dialog was closed is not shown', async ({
      page,
    }) => {
      await open(page, 'store', 'autoplay=0&latency=350')
      await expect(page.getByTestId('store-card-aurora-pulse')).toBeVisible()
      await link(page, 'ferrocast://store/install/aurora-pulse')
      await expect(page.getByTestId('ferrocast-link-dialog')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('ferrocast-link-dialog')).toHaveCount(0)
      await page.getByRole('button', { name: 'Open ferrocast:// link' }).click()
      await expect(page.getByTestId('ferrocast-link-dialog')).toBeVisible()
      await page.waitForTimeout(1200)
      await expect(page.getByText('Install “Aurora Pulse”?')).toHaveCount(0)
    })

    test('editing the link while it is being looked up drops the old lookup', async ({ page }) => {
      await open(page, 'store', 'autoplay=0&latency=350')
      await expect(page.getByTestId('store-card-aurora-pulse')).toBeVisible()
      await link(page, 'ferrocast://store/install/aurora-pulse')
      const input = page.getByLabel('Ferrocast install URI')
      await expect(input).toBeVisible()
      await input.fill('ferrocast://store/install/foundry-goal-widget')
      await page.waitForTimeout(1200)
      await expect(page.getByText('Install “Aurora Pulse”?')).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Confirm & Install' })).toHaveCount(0)
    })

    test('a finished install does not close a link dialog opened meanwhile', async ({ page }) => {
      await open(page, 'store', 'autoplay=0&latency=350')
      await expect(page.getByTestId('store-card-aurora-pulse')).toBeVisible()
      await link(page, 'ferrocast://store/install/aurora-pulse')
      await page.getByRole('button', { name: 'Confirm & Install' }).click()
      await link(page, 'ferrocast://store/install/foundry-goal-widget')
      await expect(page.getByTestId('installed-row-aurora-pulse')).toBeVisible()
      await expect(page.getByText('Install “Foundry Segmented Goal”?')).toBeVisible()
      await expect(page.getByTestId('ferrocast-link-dialog')).toBeVisible()
    })

    test('the color controls have their own names', async ({ page }) => {
      await open(page, 'store/item/arcade-ticker-alert', 'autoplay=0&latency=0')
      const detail = page.getByTestId('store-item-detail')
      await expect(detail).toBeVisible()
      const pickers = detail.locator('input[type="color"]')
      if ((await pickers.count()) === 0) test.skip(true, 'this item has no color field')
      await expect(pickers.first()).toHaveAccessibleName(/\S/)
      const text = detail.locator('input[type="color"] + input').first()
      const a = await pickers.first().evaluate((el) => (el as HTMLInputElement).labels?.length ?? 0)
      expect(a).toBeLessThanOrEqual(1)
      await expect(text).toHaveAccessibleName(/value/i)
    })
  })
})
