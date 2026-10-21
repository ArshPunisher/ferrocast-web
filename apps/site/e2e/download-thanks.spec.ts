import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// Clicking a download leads to that file's thank-you page, which starts the real file's
// download itself and shows how to install it. The real release files are never fetched:
// GitHub's download URLs answer with a tiny attachment.

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
    kind: 'mac',
    link: '.os[data-os="mac"] .get a',
    step: /Open Anyway/,
  },
  {
    name: 'Windows',
    kind: 'windows',
    link: '.os[data-os="windows"] .get a',
    step: /More info, then Run anyway/,
  },
  {
    name: 'Linux AppImage',
    kind: 'appimage',
    link: '.os[data-os="linux"] .get a',
    step: /chmod \+x \S+\.AppImage/,
  },
  {
    name: 'Linux .deb',
    kind: 'deb',
    link: '.os[data-os="linux"] .more a[data-dl-kind="deb"]',
    step: /sudo apt install \.\/\S+\.deb/,
  },
  {
    name: 'Linux .rpm',
    kind: 'rpm',
    link: '.os[data-os="linux"] .more a[data-dl-kind="rpm"]',
    step: /sudo dnf install \.\/\S+\.rpm/,
  },
]

const heading = (page: Page) =>
  page.getByRole('heading', { level: 1, name: 'Thanks for downloading Ferrocast' })

test.describe('download thank-you page', () => {
  for (const c of cases) {
    test(`${c.name}: the button opens thanks and the right file downloads`, async ({ page }) => {
      await fakeDownloads(page)
      await page.goto('/download/')
      const link = page.locator(c.link)
      test.skip((await link.count()) === 0, `no ${c.name} file in the published release`)
      const file = await link.getAttribute('data-file')
      expect(file).toMatch(/^https:\/\/github\.com\/.+\/releases\/download\//)
      await expect(link).toHaveAttribute('href', `/download/thanks/${c.kind}/`)

      const download = page.waitForEvent('download')
      await link.click()
      await expect(page).toHaveURL(new RegExp(`/download/thanks/${c.kind}/$`))
      // The thank-you page starts the very file the button stood for.
      expect((await download).url()).toBe(file)

      await expect(heading(page)).toBeVisible()
      await expect(heading(page)).toBeFocused()
      const name = decodeURIComponent(file!.split('/').pop()!)
      await expect(page.locator('.lede')).toContainText(name)
      await expect(page.getByRole('status')).toHaveText('Your download has started.')
      await expect(page.locator('.steps')).toContainText(c.step)
      await expect(page.locator('.steps')).toContainText(/Connect Twitch, YouTube or Kick/)
      await expect(page.getByRole('link', { name: 'Download again' })).toHaveAttribute(
        'href',
        file!,
      )
      await expect(page.getByRole('link', { name: 'Read the setup guide' })).toHaveAttribute(
        'href',
        '/docs/getting-started/#connect',
      )
      await expect(page.getByRole('link', { name: 'ask us' })).toHaveAttribute('href', '/contact/')
      await expect(page.locator('[data-bot] svg')).toHaveAttribute('data-mood', 'cheer')

      // Back to every download.
      await page.getByRole('link', { name: 'All downloads' }).click()
      await expect(page).toHaveURL(/\/download\/$/)
    })
  }

  test('a reload does not download the file a second time', async ({ page }) => {
    await fakeDownloads(page)
    await page.goto('/download/')
    const link = page.locator('.os .get a[data-beta-download]').first()
    test.skip((await link.count()) === 0, 'no release files published')
    const file = await link.getAttribute('data-file')
    const first = page.waitForEvent('download')
    await link.click()
    await first
    let again = 0
    page.on('download', () => again++)
    await page.reload()
    await expect(heading(page)).toBeVisible()
    await page.waitForTimeout(1200)
    expect(again).toBe(0)
    // "Download again" still does.
    const retry = page.waitForEvent('download')
    await page.getByRole('link', { name: 'Download again' }).click()
    expect((await retry).url()).toBe(file)
  })

  test('without JavaScript the page still thanks and starts the download', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false })
    const page = await context.newPage()
    await fakeDownloads(page)
    await page.goto('/download/')
    const link = page.locator('.os .get a[data-beta-download]').first()
    test.skip((await link.count()) === 0, 'no release files published')
    const file = await link.getAttribute('data-file')
    const download = page.waitForEvent('download')
    await link.click()
    await expect(heading(page)).toBeVisible()
    expect((await download).url()).toBe(file)
    await context.close()
  })

  test('is kept out of search: noindex, no canonical, not in the sitemap', async ({
    page,
    request,
  }) => {
    await fakeDownloads(page)
    await page.goto('/download/')
    const href = await page.locator('.os .get a[data-beta-download]').first().getAttribute('href')
    test.skip(!href, 'no release files published')
    await page.goto(href!)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0)
    const map = await (await request.get('/sitemap-0.xml')).text()
    expect(map).not.toContain('/download/thanks/')
  })

  test('no axe problems, light and dark, with reduced motion', async ({ page }) => {
    await fakeDownloads(page)
    await page.goto('/download/')
    const href = await page.locator('.os .get a[data-beta-download]').first().getAttribute('href')
    test.skip(!href, 'no release files published')
    for (const scheme of ['dark', 'light'] as const) {
      await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: scheme })
      await page.goto(href!)
      await expect(heading(page)).toBeFocused()
      const r = await new AxeBuilder({ page })
        .include('main')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
      expect(
        r.violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map((v) => v.id),
      ).toEqual([])
    }
  })

  test('fits a 375 px phone', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await fakeDownloads(page)
    await page.goto('/download/')
    const link = page.locator('.os[data-os="linux"] .more a[data-dl-kind="rpm"]')
    test.skip((await link.count()) === 0, 'no .rpm file published')
    await link.click()
    await expect(heading(page)).toBeInViewport()
    await expect(page.getByRole('link', { name: 'Download again' })).toBeInViewport()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
