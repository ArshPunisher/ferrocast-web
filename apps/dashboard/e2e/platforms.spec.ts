import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { open } from './helpers'

// Phase 3 #24 in the demo engine: Facebook as an account, X / Instagram / Facebook servers
// pasted from their own apps, and the stream schedule (never a go-live).

const panel = (page: Page, name: string) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name, exact: true }) })

test.describe('more platforms', () => {
  test('Facebook can be connected from Settings, Accounts', async ({ page }) => {
    await open(page, 'settings')
    const row = page
      .getByRole('listitem')
      .filter({ hasText: 'Comments on your Page’s live videos' })
    await expect(row.getByRole('button', { name: 'Connect' })).toBeVisible()
  })

  test('a server pasted from Instagram is named and added', async ({ page }) => {
    await open(page, 'studio/golive')
    await page
      .getByRole('button', { name: /Add a destination|Add a server/ })
      .first()
      .click()
    const dialog = page.getByRole('dialog', { name: 'Add a destination' })
    await dialog.getByRole('button', { name: 'Instagram' }).click()
    await expect(dialog.getByLabel('Name')).toHaveValue('Instagram')
    await dialog.getByLabel('Server').fill('rtmps://live-upload.example:443/rtmp/')
    await dialog.getByLabel('Stream key').fill('pasted-key-123')
    // The button says what is being added.
    await dialog.getByRole('button', { name: 'Add Instagram' }).click()
    await expect(page.getByText('Instagram added.')).toBeVisible()
  })

  test('the schedule plans a stream, says what each platform did, and removes it', async ({
    page,
  }) => {
    await open(page, 'studio/golive')
    // Planned streams is no longer under the Go live column; click the Schedule tab instead.
    await expect(page.getByRole('heading', { name: 'Planned streams' })).toHaveCount(0)
    const sectionTabs = page.getByRole('radiogroup', { name: 'Studio section' })
    await sectionTabs.getByText('Schedule').click()
    await expect(page).toHaveURL(/#\/studio\/schedule/)
    const p = panel(page, 'Planned streams')
    await expect(p.getByText('Nothing planned.')).toBeVisible()
    await expect(p.getByText('Ferrocast never goes live by itself')).toBeVisible()
    await p.getByRole('button', { name: 'Plan a stream' }).click()
    const dialog = page.getByRole('dialog', { name: 'Plan a stream' })
    // Nothing typed: the button waits.
    await expect(dialog.getByRole('button', { name: 'Plan it' })).toBeDisabled()
    await dialog.getByLabel('Title').fill('Friday ranked grind')
    await dialog.getByRole('button', { name: 'Facebook' }).click()
    await dialog.getByRole('button', { name: 'Plan it' }).click()
    await expect(page.getByText('Planned. You’ll get a reminder')).toBeVisible()
    await expect(p.getByText('Friday ranked grind')).toBeVisible()
    await expect(p.getByText('YouTube', { exact: true })).toBeVisible()
    await expect(p.getByText(/Connect Facebook in Settings/)).toBeVisible()
    // Planning never starts a stream.
    await sectionTabs.getByText('Go live').click()
    await expect(page.getByRole('switch', { name: 'Stream to Kick' })).toBeVisible()
    await sectionTabs.getByText('Schedule').click()
    // A broadcast was made on YouTube: removing the plan asks first, and says it stays there.
    await p.getByRole('button', { name: 'Remove Friday ranked grind' }).click()
    const ask = page.getByRole('alertdialog', { name: 'Remove Friday ranked grind?' })
    await expect(ask.getByText(/stays there/)).toBeVisible()
    await ask.getByRole('button', { name: 'Keep' }).click()
    await expect(p.getByText('Friday ranked grind')).toBeVisible()
    await p.getByRole('button', { name: 'Remove Friday ranked grind' }).click()
    await page
      .getByRole('alertdialog', { name: 'Remove Friday ranked grind?' })
      .getByRole('button', { name: 'Remove' })
      .click()
    await expect(p.getByText('Nothing planned.')).toBeVisible()
  })

  test('a start time in the past is refused with the field named', async ({ page }) => {
    await open(page, 'studio/schedule')
    const p = panel(page, 'Planned streams')
    await p.getByRole('button', { name: 'Plan a stream' }).click()
    const dialog = page.getByRole('dialog', { name: 'Plan a stream' })
    await dialog.getByLabel('Title').fill('Too late')
    await dialog.getByLabel('Starts').fill('2020-01-01T10:00')
    await dialog.getByRole('button', { name: 'Plan it' }).click()
    await expect(dialog.getByText('pick a time in the future.')).toBeVisible()
  })

  test('the plan dialog works at 375 px and has no axe violations', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await open(page, 'studio/schedule')
    const scheduleTab = page.getByRole('radio', { name: 'Schedule' })
    await expect(scheduleTab).toBeVisible()
    await page.getByRole('button', { name: 'Plan a stream' }).click()
    const dialog = page.getByRole('dialog', { name: 'Plan a stream' })
    await expect(dialog.getByRole('button', { name: 'Plan it' })).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    )
    expect(overflow).toBe(false)
    const r = await new AxeBuilder({ page }).include('dialog').analyze()
    expect(r.violations).toEqual([])
  })
})
