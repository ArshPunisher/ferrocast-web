import { expect, test, type Page } from '@playwright/test'
import { open } from './helpers'

// Settings › Automations on the demo engine (API.md "Automations").

const page$ = (page: Page) => page.locator('#s-automations')
const toasts = (page: Page) => page.getByRole('region', { name: 'Notifications' })

test('adds, tests, switches off and removes a rule', async ({ page }) => {
  await open(page, 'settings/automations', 'autoplay=0&latency=0')
  const p = page$(page)
  await expect(p.getByRole('heading', { name: 'Automations', exact: true })).toBeVisible()
  // The demo's sample: its when and steps in a few words.
  await expect(p.getByText('Clip it')).toBeVisible()
  await expect(p.getByText('!clip in chat')).toBeVisible()
  // A new one: a raid of 10+ switches scene, waits, says thanks.
  await p.getByRole('button', { name: 'New rule' }).click()
  const d = page.getByRole('dialog', { name: 'New rule' })
  await d.getByLabel('Name', { exact: true }).fill('Raid party')
  await d.getByLabel('What sets it off', { exact: true }).selectOption('raid')
  await d.getByLabel('Smallest raid', { exact: true }).fill('10')
  await d.getByLabel('Step 1', { exact: true }).selectOption('scene')
  await d.getByLabel('Scene', { exact: true }).fill('Party')
  await d.getByRole('button', { name: 'Add step' }).click()
  await d.getByLabel('Step 2', { exact: true }).selectOption('wait')
  await d.getByRole('button', { name: 'Add step' }).click()
  await d.getByLabel('Step 3', { exact: true }).selectOption('chat')
  await d.getByLabel('Message', { exact: true }).fill('Welcome raiders, thanks {name}!')
  // Order can change.
  await d.getByRole('button', { name: 'Move step 3 up' }).click()
  await expect(d.getByLabel('Step 2', { exact: true })).toHaveValue('chat')
  await d.getByRole('button', { name: 'Save' }).click()
  await expect(toasts(page).getByText('Raid party added.')).toBeVisible()
  await expect(p.getByText('A raid of 10+')).toBeVisible()
  await expect(p.getByText(/Scene “Party” · Chat · Wait 5 s/)).toBeVisible()
  // Test runs it now.
  await p.getByRole('button', { name: 'Test Raid party' }).click()
  await expect(toasts(page).getByText('Raid party ran.')).toBeVisible()
  // Off, then remove (asks once).
  const sw = p.getByRole('switch', { name: 'Raid party on' })
  await sw.click()
  await expect(sw).toHaveAttribute('aria-checked', 'false')
  await p.getByRole('button', { name: 'Remove Raid party' }).click()
  await p.getByRole('button', { name: 'Sure? Remove Raid party' }).click()
  await expect(toasts(page).getByText('Raid party removed.')).toBeVisible()
  await expect(p.getByRole('switch')).toHaveCount(1)
})

test('a rule that isn’t whole says what’s missing and isn’t saved', async ({ page }) => {
  await open(page, 'settings/automations', 'autoplay=0&latency=0')
  const p = page$(page)
  await expect(p.getByText('Clip it')).toBeVisible()
  await p.getByRole('button', { name: 'Edit Clip it' }).click()
  const d = page.getByRole('dialog', { name: 'Edit “Clip it”' })
  await d.getByLabel('Name', { exact: true }).fill('')
  await d.getByRole('button', { name: 'Save' }).click()
  await expect(d.getByRole('alert')).toHaveText('Give it a name.')
  await d.getByLabel('Name', { exact: true }).fill('Clip it')
  await d.getByRole('button', { name: 'Remove step 1' }).click()
  await d.getByRole('button', { name: 'Remove step 1' }).click()
  await d.getByRole('button', { name: 'Save' }).click()
  await expect(d.getByRole('alert')).toHaveText('Add a step.')
  await d.getByRole('button', { name: 'Cancel' }).click()
  await expect(p.getByText(/Save the replay · Chat/)).toBeVisible()
})

test('fits a 375 px phone, with its editor', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await open(page, 'settings/automations', 'autoplay=0&latency=0')
  await expect(page$(page).getByText('Clip it')).toBeVisible()
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  expect(await overflow()).toBeLessThanOrEqual(0)
  await page$(page).getByRole('button', { name: 'Edit Clip it' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(await overflow()).toBeLessThanOrEqual(0)
})

test('the wait can be typed digit by digit', async ({ page }) => {
  await open(page, 'settings/automations', 'autoplay=0&latency=0')
  await page$(page).getByRole('button', { name: 'Edit Clip it' }).click()
  const box = page.getByLabel('Seconds before it can run again', { exact: true })
  await box.fill('')
  await box.pressSequentially('10')
  await expect(box).toHaveValue('10')
  await box.fill('1')
  await box.blur()
  await expect(box).toHaveValue('3')
})
