import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { open } from './helpers'

test('Settings → import from StreamElements: preview, keep, report', async ({ page }) => {
  await open(page, 'settings/data')
  await page.getByRole('link', { name: 'From StreamElements or Streamlabs' }).click()
  await expect(page.getByRole('heading', { name: 'Bring your setup' })).toBeVisible()
  const preview = page.getByRole('button', { name: 'Preview' })
  await expect(preview).toBeDisabled()
  await page.getByRole('button', { name: 'Use the demo’s sample token' }).click()
  await preview.click()
  const heading = page.getByRole('heading', { name: 'What will come over' })
  await expect(heading).toBeFocused()
  await expect(page.getByText('From NovaPlays on StreamElements')).toBeVisible()
  await expect(page.getByText('Overlays and their widgets')).toBeVisible()
  await expect(
    page.getByRole('radiogroup', { name: 'When something is already in Ferrocast' }),
  ).toBeVisible()
  // The token isn't kept on screen after the preview.
  await expect(page.getByLabel('StreamElements JWT token')).toHaveValue('')
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Import finished' })).toBeFocused()
  await expect(page.getByText(/added/).first()).toBeVisible()
  await page.getByRole('button', { name: 'Open Bot' }).click()
  await expect(page.getByText('!schedule').first()).toBeVisible()
})

test('a rejected token shows the fix inline', async ({ page }) => {
  await open(page, 'import')
  const field = page.getByLabel('StreamElements JWT token')
  await field.fill('eyJhbGciOiJIUzI1NiJ9.eyJ4IjoxfQ.c2lnbmF0dXJlexpired')
  await field.press('Enter')
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('didn’t accept that token')
  await expect(alert).toContainText('Show secrets')
  await field.fill('not-a-jwt-at-all')
  await page.getByRole('button', { name: 'Preview' }).click()
  await expect(page.getByRole('alert')).toContainText('doesn’t look like a StreamElements JWT')
})

test('Streamlabs: a bad file names the row and column, a good one previews', async ({ page }) => {
  await open(page, 'import/streamlabs')
  const points = page.getByLabel('Points export')
  await points.setInputFiles({
    name: 'Currency.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Name,Points\nsam,lots\n'),
  })
  await page.getByRole('button', { name: 'Preview' }).click()
  await expect(page.getByRole('alert')).toContainText('row 2, column "Points"')
  await points.setInputFiles({
    name: 'Currency.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Name,Rank,Points,Hours\nsam,Viewer,1500,12\n'),
  })
  await page.getByLabel('These viewers watch you on').selectOption('kick')
  await page.getByRole('button', { name: 'Preview' }).click()
  await expect(page.getByRole('heading', { name: 'What will come over' })).toBeVisible()
  await expect(page.getByText('Paid when they show up')).toBeVisible()
  await expect(page.getByText('Commands and timers', { exact: true })).toBeVisible()
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(
    r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id),
  ).toEqual([])
})

test('Streamlabs: YouTube names alone are listed as needing a match', async ({ page }) => {
  await open(page, 'import/streamlabs')
  await page.getByLabel('Points export').setInputFiles({
    name: 'Currency.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Name,Points\nAna Plays,40\n'),
  })
  await page.getByLabel('These viewers watch you on').selectOption('youtube')
  await expect(page.getByText('YouTube names aren’t unique, so without a Channel ID')).toBeVisible()
  await page.getByRole('button', { name: 'Preview' }).click()
  await expect(page.getByText('Need a match', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  await expect(page.getByText(/1 need a match/)).toBeVisible()
})

test('Streamlabs: changing the platform or a file after Preview drops the old preview', async ({
  page,
}) => {
  await open(page, 'import/streamlabs')
  await page.getByLabel('Points export').setInputFiles({
    name: 'Currency.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Name,Rank,Points,Hours\nsam,Viewer,1500,12\n'),
  })
  await page.getByLabel('These viewers watch you on').selectOption('kick')
  await page.getByRole('button', { name: 'Preview' }).click()
  const heading = page.getByRole('heading', { name: 'What will come over' })
  await expect(heading).toBeVisible()
  // a preview made for Kick must never be applied as Twitch
  await page.getByLabel('These viewers watch you on').selectOption('twitch')
  await expect(heading).toHaveCount(0)
  await page.getByRole('button', { name: 'Preview' }).click()
  await expect(heading).toBeVisible()
  await page.getByLabel('Points export').setInputFiles({
    name: 'Currency2.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Name,Rank,Points,Hours\nalex,Viewer,20,1\n'),
  })
  await expect(heading).toHaveCount(0)
})
