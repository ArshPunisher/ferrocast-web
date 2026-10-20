import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// Clicking a download: the button says "Starting download…", the file still downloads from
// the link's own href, then a thank-you panel shows that file's install steps. The real
// release files are never fetched: GitHub's download URLs answer with a tiny attachment.

const fakeDownloads = (page: Page) =>
  page.context().route('https://github.com/**/releases/download/**', (route) =>
    route.fulfill({
      status: 200,
      headers: {
        'content-type': 'application/octet-stream',
        'content-disposition': 'attachment; filename="ferrocast-test.bin"',
      },
      body: 'not the real app',
    }),
  )

const cases = [
  {
    name: 'macOS',
    link: '.os[data-os="mac"] .get a',
    step: /Drag Ferrocast into your Applications/,
  },
  { name: 'Windows', link: '.os[data-os="windows"] .get a', step: /More info, then Run anyway/ },
  { name: 'Linux AppImage', link: '.os[data-os="linux"] .get a', step: /chmod \+x \S+\.AppImage/ },
  {
    name: 'Linux .deb',
    link: '.os[data-os="linux"] .more a[data-dl-kind="deb"]',
    step: /sudo apt install \.\/\S+\.deb/,
  },
  {
    name: 'Linux .rpm',
    link: '.os[data-os="linux"] .more a[data-dl-kind="rpm"]',
    step: /sudo dnf install \.\/\S+\.rpm/,
  },
]

test.describe('download feedback', () => {
  for (const c of cases) {
    test(`${c.name}: loader, the real download, then thanks`, async ({ page }) => {
      await fakeDownloads(page)
      await page.goto('/download/')
      const link = page.locator(c.link)
      test.skip((await link.count()) === 0, `no ${c.name} file in the published release`)
      const href = await link.getAttribute('href')
      expect(href).toMatch(/^https:\/\/github\.com\/.+\/releases\/download\//)

      const download = page.waitForEvent('download')
      await link.click()
      // The click is heard at once, inside the button.
      await expect(link).toHaveAttribute('data-state', 'starting')
      await expect(link.locator('.dl-busy')).toBeVisible()
      await expect(link).toHaveAccessibleName(/^Starting/)
      await expect(page.getByRole('status')).toContainText(/Starting your .+ download/)
      // The browser still downloads from the link's own URL.
      expect((await download).url()).toBe(href)

      const heading = page.getByRole('heading', { name: 'Thanks for downloading Ferrocast' })
      await expect(heading).toBeVisible()
      await expect(heading).toBeFocused()
      await expect(page.locator('.oses')).toBeHidden()
      await expect(page.getByRole('status')).toHaveText('Download started.')
      const steps = page.locator('[data-dl-steps]:visible')
      await expect(steps).toHaveCount(1)
      await expect(steps).toContainText(c.step)
      await expect(steps.locator('li').first()).toBeVisible()
      await expect(page.locator('[data-dl-thanks] [data-bot] svg')).toHaveAttribute(
        'data-mood',
        'cheer',
      )
      await expect(page.getByRole('link', { name: 'Try again' })).toHaveAttribute('href', href!)
      await expect(page.getByRole('link', { name: 'Read the setup guide' })).toHaveAttribute(
        'href',
        '/docs/getting-started/#connect',
      )

      // Back to the cards, with focus on the download that was used.
      await page.getByRole('button', { name: 'All downloads' }).click()
      await expect(heading).toBeHidden()
      await expect(page.locator('.oses')).toBeVisible()
      await expect(link).toBeFocused()
      await expect(link).not.toHaveAttribute('data-state', 'starting')
    })
  }

  test('Try again downloads the same file again', async ({ page }) => {
    await fakeDownloads(page)
    await page.goto('/download/')
    const link = page.locator('.os .get a[data-beta-download]').first()
    test.skip((await link.count()) === 0, 'no release files published')
    await link.click()
    const retry = page.locator('[data-dl-retry]')
    await expect(retry).toHaveAccessibleName('Try again')
    const again = page.waitForEvent('download')
    await retry.click()
    await expect(retry).toHaveAttribute('data-state', 'starting')
    await expect(retry).toHaveAccessibleName('Starting…')
    expect((await again).url()).toBe(await link.getAttribute('href'))
  })

  test('a modified click is left to the browser: no loader, no panel', async ({ page }) => {
    await fakeDownloads(page)
    await page.goto('/download/')
    const link = page.locator('.os .get a[data-beta-download]').first()
    test.skip((await link.count()) === 0, 'no release files published')
    await link.click({ modifiers: ['ControlOrMeta'] })
    await link.click({ button: 'middle' })
    await page.waitForTimeout(1400)
    await expect(link).not.toHaveAttribute('data-state', 'starting')
    await expect(page.locator('[data-dl-thanks]')).toBeHidden()
  })

  test('reduced motion: the same flow, and no axe problems on the panel', async ({ page }) => {
    for (const scheme of ['dark', 'light'] as const) {
      await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: scheme })
      await fakeDownloads(page)
      await page.goto('/download/')
      const link = page.locator('.os .get a[data-beta-download]').first()
      test.skip((await link.count()) === 0, 'no release files published')
      await link.click()
      const heading = page.getByRole('heading', { name: 'Thanks for downloading Ferrocast' })
      await expect(heading).toBeFocused()
      const r = await new AxeBuilder({ page })
        .include('[data-dl-thanks]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
      expect(
        r.violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map((v) => v.id),
      ).toEqual([])
    }
  })

  test('the thank-you panel fits a 375 px phone', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await fakeDownloads(page)
    await page.goto('/download/')
    const link = page.locator('.os[data-os="linux"] .more a[data-dl-kind="rpm"]')
    test.skip((await link.count()) === 0, 'no .rpm file published')
    await link.click()
    await expect(
      page.getByRole('heading', { name: 'Thanks for downloading Ferrocast' }),
    ).toBeInViewport()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
