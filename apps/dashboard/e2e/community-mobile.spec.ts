import { expect, test } from '@playwright/test'
import { open } from './helpers'

test.use({ viewport: { width: 375, height: 812 } })

const fits = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

test('a poll can be started and ended on a 375 px phone', async ({ page }) => {
  await open(page, 'community')
  const p = page.locator('#community-polls')
  await p.getByLabel('Question').fill('Which map next?')
  await p.getByRole('button', { name: 'Yes or no' }).tap()
  await p.getByRole('button', { name: 'Start poll' }).tap()
  await expect(p.getByText('Live', { exact: true })).toBeVisible()
  expect(await fits(page)).toBeLessThanOrEqual(0)
  await p.getByRole('button', { name: 'End now' }).tap()
  await expect(p.getByText('Closed', { exact: true })).toBeVisible()
})

test('a giveaway error fits on a phone', async ({ page }) => {
  await open(page, 'community')
  const g = page.locator('#community-giveaway')
  await g.getByLabel('Cost in points').fill('-1')
  await g.getByRole('button', { name: 'Start giveaway' }).tap()
  await expect(g.getByRole('alert')).toBeVisible()
  expect(await fits(page)).toBeLessThanOrEqual(0)
})

test('the recap and its Copy button fit on a phone', async ({ page }) => {
  await open(page, 'recap')
  await expect(page.getByRole('heading', { name: 'Stream recap', level: 1 })).toBeVisible()
  const copy = page.getByRole('button', { name: 'Copy', exact: true })
  await copy.scrollIntoViewIfNeeded()
  await expect(copy).toBeInViewport({ ratio: 1 })
  expect(await fits(page)).toBeLessThanOrEqual(0)
})
