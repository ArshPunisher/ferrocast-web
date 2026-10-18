import { expect, test, type Page } from '@playwright/test'
import { fault, open } from './helpers'

// Auto-replies on the Bot page (free, local): starters, Try it, errors the engine sends
// back (422 pattern, 413 reply), order, offline, and a 375 px phone.

async function openBot(page: Page) {
  await open(page, 'bot')
  await expect(page.getByRole('heading', { name: 'Auto-replies' })).toBeVisible()
}

const dialog = (page: Page) => page.getByRole('dialog')

test('a starter becomes a rule: Try it shows the reply, save, switch off', async ({ page }) => {
  await openBot(page)
  const panel = page.locator('#autoreplies')
  await expect(panel.getByText('Answer the questions chat asks every stream.')).toBeVisible()
  await panel.getByRole('button', { name: /Chat says “discord”/ }).click()
  const d = dialog(page)
  await expect(d.getByLabel('Words')).toHaveValue('discord')
  // The sample message already matches.
  const result = d.locator('[aria-live="polite"]')
  await expect(result).toContainText('Matches')
  await expect(result).toContainText('Join the Discord: discord.gg/yourcode')
  await d.getByLabel('Bot replies').fill('Come hang out, {user}: discord.gg/nova')
  await expect(result).toContainText('Come hang out, viewer: discord.gg/nova')
  await d.getByLabel('Try it').fill('discordant vibes')
  await expect(result).toContainText('No match')
  // Insert puts a variable at the caret.
  await d.getByLabel('Bot replies').fill('Playing ')
  await d.getByRole('button', { name: /Insert/ }).click()
  await page.getByRole('menuitem', { name: /\{game\}/ }).click()
  await expect(d.getByLabel('Bot replies')).toHaveValue('Playing {game}')
  await d.getByRole('button', { name: 'Save' }).click()
  await expect(dialog(page)).toBeHidden()
  await expect(panel.getByRole('button', { name: 'Discord link', exact: true })).toBeVisible()
  await expect(panel.getByText('Word: discord')).toBeVisible()
  const sw = panel.getByRole('switch', { name: 'Discord link on' })
  await expect(sw).toHaveAttribute('aria-checked', 'true')
  await sw.click()
  await expect(sw).toHaveAttribute('aria-checked', 'false')
})

test('a broken pattern and a long reply get clear messages under the field', async ({ page }) => {
  await openBot(page)
  await page.locator('#autoreplies').getByRole('button', { name: 'Start from scratch' }).click()
  const d = dialog(page)
  await d.locator('label', { hasText: /^Pattern$/ }).click()
  await d.getByRole('textbox', { name: 'Pattern' }).fill('what (game')
  await d.getByLabel('Bot replies').fill('It is {game}')
  await d.getByRole('button', { name: 'Save' }).click()
  await expect(d.getByRole('alert').filter({ hasText: /pattern has a problem/ })).toBeVisible()
  await d.getByRole('textbox', { name: 'Pattern' }).fill('(what|which) game')
  await d.getByLabel('Bot replies').fill('x'.repeat(501))
  await expect(d.getByText('501/500')).toBeVisible()
  await d.getByRole('button', { name: 'Save' }).click()
  await expect(d.getByRole('alert').filter({ hasText: /501 characters is too long/ })).toBeVisible()
  await d.getByLabel('Bot replies').fill('It is {game}')
  await d.getByRole('button', { name: 'Save' }).click()
  await expect(dialog(page)).toBeHidden()
  await expect(page.locator('#autoreplies').getByText('Pattern: (what|which) game')).toBeVisible()
})

test('rules can be reordered (first match wins)', async ({ page }) => {
  await openBot(page)
  const panel = page.locator('#autoreplies')
  await panel.getByRole('button', { name: /Chat says “discord”/ }).click()
  await dialog(page).getByRole('button', { name: 'Save' }).click()
  await expect(dialog(page)).toBeHidden()
  await panel.getByRole('button', { name: 'New auto-reply' }).click()
  await dialog(page).getByLabel('Words').fill('what game')
  await dialog(page).getByLabel('Bot replies').fill('We are on {game}')
  await dialog(page).getByRole('button', { name: 'Save' }).click()
  await expect(dialog(page)).toBeHidden()
  const names = panel.locator('ol > li').locator('button.font-bold')
  await expect(names).toHaveText(['Discord link', 'what game'])
  await panel.getByRole('button', { name: 'Move what game up' }).click()
  await expect(names).toHaveText(['what game', 'Discord link'])
  // Saved in the engine's order (the demo engine here).
  await expect
    .poll(() => page.evaluate(() => window.__ferrocastDemo?.autoReplies.rules.map((r) => r.name)))
    .toEqual(['what game', 'Discord link'])
})

test('a failed load says what happened and retries', async ({ page }) => {
  await open(page, 'home')
  await fault(page, {
    path: '/api/v1/autoreplies',
    method: 'GET',
    status: 500,
    code: 'internal',
    message: 'Something went wrong inside Ferrocast.',
    hint: 'Try again.',
    times: 20,
  })
  await page.evaluate(() => (location.hash = '#/bot'))
  const alert = page.locator('#autoreplies').getByRole('alert')
  await expect(alert).toContainText('Something went wrong inside Ferrocast.')
  await page.evaluate(() => window.__ferrocastDemo?.clearFaults())
  await alert.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByText('Answer the questions chat asks every stream.')).toBeVisible()
})

test.describe('on a 375 px phone', () => {
  test.use({ viewport: { width: 375, height: 812 } })
  test('the section and the dialog fit', async ({ page }) => {
    await openBot(page)
    const overflow = () =>
      page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(await overflow()).toBeLessThanOrEqual(0)
    await page
      .locator('#autoreplies')
      .getByRole('button', { name: /Chat says “what game”/ })
      .click()
    const d = dialog(page)
    await expect(d.locator('[aria-live="polite"]')).toContainText('Matches')
    await d.locator('summary').click()
    await expect(d.getByRole('button', { name: 'Kick' })).toBeVisible()
    expect(await overflow()).toBeLessThanOrEqual(0)
    await d.getByRole('button', { name: 'Save' }).click()
    await expect(dialog(page)).toBeHidden()
    expect(await overflow()).toBeLessThanOrEqual(0)
  })
})
