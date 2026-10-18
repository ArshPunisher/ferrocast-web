import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { fault, open } from './helpers'

// Pro stream history (`#/history`) on the demo's year of streams.
const PRO = 'autoplay=0&latency=0&pro=active&pro_features=on'
const panel = (page: Page) => page.locator('#history')
const tile = (page: Page, name: string) =>
  page
    .getByTestId('history-tiles')
    .locator('div', { has: page.getByText(name, { exact: true }) })
    .locator('dd')

test.describe('Stream history', () => {
  test('shows the numbers, the charts and every stream', async ({ page }) => {
    await open(page, 'history', PRO)
    const p = panel(page)
    await expect(p.getByTestId('history-tiles')).toBeVisible()
    await expect(p.getByRole('img', { name: /Average viewers per stream day/ })).toBeVisible()
    await expect(p.getByRole('img', { name: /Streams per week/ })).toBeVisible()
    await expect(p.getByRole('img', { name: /Streams by platform/ })).toBeVisible()
    // The charts' numbers are also tables for screen readers.
    await expect(p.locator('table caption', { hasText: 'Streams per week' })).toHaveCount(1)
    const fourWeeks = Number((await tile(page, 'Streams').textContent())?.replace(/,/g, ''))
    expect(fourWeeks).toBeGreaterThan(5)
    const rows = p.getByTestId('history-table').locator('tbody tr')
    await expect(rows).toHaveCount(Math.min(fourWeeks, 25))

    await p.getByRole('radio', { name: '1 year' }).check({ force: true })
    await expect
      .poll(async () => Number((await tile(page, 'Streams').textContent())?.replace(/,/g, '')))
      .toBeGreaterThan(fourWeeks * 6)
    await p.getByRole('button', { name: /Show all/ }).click()
    expect(await rows.count()).toBeGreaterThan(100)
    await expect(p.getByRole('button', { name: 'Show fewer' })).toBeVisible()
  })

  test('exports a CSV', async ({ page }) => {
    await open(page, 'history', PRO)
    await expect(panel(page).getByTestId('history-tiles')).toBeVisible()
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      panel(page).getByRole('button', { name: 'Export CSV' }).click(),
    ])
    expect(download.suggestedFilename()).toBe('ferrocast-history.csv')
    await expect(page.getByText('History saved as a CSV file.')).toBeVisible()
  })

  test('the first stream: a plain empty state', async ({ page }) => {
    await open(page, 'history', `${PRO}&history=empty`)
    await expect(page.getByText('Your first stream will show up here after it ends.')).toBeVisible()
    await expect(panel(page).getByRole('button', { name: 'Export CSV' })).toBeDisabled()
  })

  test('402 from the relay says what to do', async ({ page }) => {
    await open(page, 'home', PRO)
    await fault(page, {
      path: '/api/v1/pro/history',
      status: 402,
      code: 'pro_required',
      message: 'This runs on Ferrocast’s servers and is part of Pro.',
      hint: 'See Settings › Pro. Everything free in Ferrocast stays free.',
      times: 1,
    })
    await page.evaluate(() => (location.hash = '#/history'))
    const alert = panel(page).getByRole('alert')
    await expect(alert).toContainText('part of Pro')
    await expect(alert).toContainText('Settings › Pro')
    await alert.getByRole('button', { name: 'Try again' }).click()
    await expect(panel(page).getByTestId('history-tiles')).toBeVisible()
  })

  test('offline says so, and comes back', async ({ page }) => {
    await open(page, 'home', PRO)
    await page.evaluate(() => window.__ferrocastDemo?.setOffline(true))
    await page.evaluate(() => (location.hash = '#/history'))
    // Pro's own check fails offline too: nothing Pro shows (R-01), never a crash.
    await expect(page.getByRole('heading', { name: 'Stream history' })).toBeVisible()
    await page.evaluate(() => window.__ferrocastDemo?.setOffline(false))
    await page.reload()
    await expect(panel(page).getByTestId('history-tiles')).toBeVisible()
  })

  test('is in the menu for Pro', async ({ page, isMobile }) => {
    await open(page, 'home', PRO)
    if (isMobile) await page.getByRole('button', { name: 'More' }).click()
    await page.getByRole('link', { name: 'History' }).click()
    await expect(page).toHaveURL(/#\/history$/)
    await expect(page.getByRole('heading', { name: 'Stream history' })).toBeVisible()
    if (!isMobile)
      await expect(page.getByRole('link', { name: 'History' })).toHaveAttribute(
        'aria-current',
        'page',
      )
  })

  test('has no accessibility violations', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium')
    await open(page, 'history', PRO)
    await expect(panel(page).getByTestId('history-tiles')).toBeVisible()
    const r = await new AxeBuilder({ page }).include('#history').analyze()
    expect(r.violations).toEqual([])
  })
})

test.describe('Stream history at 375 px', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('fits the phone width; the table scrolls in its own box', async ({ page }) => {
    await open(page, 'history', PRO)
    await expect(panel(page).getByTestId('history-tiles')).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(overflow).toBe(false)
    const region = panel(page).getByRole('region', { name: 'Streams', exact: true })
    const scrolls = await region.evaluate((el) => el.scrollWidth > el.clientWidth)
    expect(scrolls).toBe(true)
  })
})
