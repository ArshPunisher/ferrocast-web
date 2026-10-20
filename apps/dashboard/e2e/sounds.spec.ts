// The built-in sounds: the grouped picker that plays a sound as you move through it, the
// one-click suggested sounds, new alerts that start with a sound, and old ids that keep
// playing (the sound board's option C, owner, 20 Oct 2026).

import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { open } from './helpers'

/** Counts the sound files the page fetched. */
function mp3s(page: Page): string[] {
  const seen: string[] = []
  page.on('request', (r) => {
    if (r.url().endsWith('.mp3')) seen.push(r.url().split('/').pop() ?? '')
  })
  return seen
}

const picker = (page: Page) => page.getByTestId('sound-picker')
const selected = (page: Page) => picker(page).locator('[role=option][aria-selected=true]')

test.describe('built-in sounds', () => {
  test('a new design starts with each event’s suggested sound', async ({ page }) => {
    await open(page, 'designs/alerts')
    await page.getByRole('button', { name: 'Start from scratch' }).click()
    await expect(page).toHaveURL(/#\/designer\/d/)
    await page.getByRole('tab', { name: 'Sound' }).click()
    const expectSound = async (event: string, sound: string) => {
      await page.getByRole('combobox', { name: 'Event' }).selectOption({ label: event })
      await expect(selected(page)).toContainText(sound)
    }
    await expectSound('Follow', 'Glint')
    await expectSound('Sub', 'Cascade')
    await expectSound('Gift', 'Bloom')
    await expectSound('Tip', 'Tally')
    await expectSound('Raid', 'Lift')
    await expectSound('Redeem', 'Pebble')
  })

  test('the picker is grouped, plays as the arrow keys move, and Enter picks', async ({ page }) => {
    const heard = mp3s(page)
    await open(page, 'designs/alerts')
    await page
      .locator('[aria-live="polite"]')
      .getByRole('article', { name: 'Molten plate', exact: true })
      .getByRole('button', { name: 'Duplicate & customise' })
      .click()
    await page.getByRole('tab', { name: 'Sound' }).click()
    const lb = picker(page)
    for (const g of ['Crystal', 'Felt', 'Classic'])
      await expect(lb.getByText(g, { exact: true })).toBeVisible()
    await expect(lb.getByRole('option')).toHaveCount(18)
    // Saved before 1.1 with Chime: shows (and plays) Glint.
    await expect(selected(page)).toContainText('Glint')
    await lb.focus()
    await page.keyboard.press('ArrowDown')
    await expect(lb).toHaveAttribute('aria-activedescendant', /-3$/)
    await expect.poll(() => heard.some((f) => f.startsWith('cascade'))).toBe(true)
    await page.keyboard.press('Enter')
    await expect(selected(page)).toContainText('Cascade')
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await expect(selected(page)).toContainText('Sparkle classic')
    await expect.poll(() => heard.some((f) => f.startsWith('sparkle_classic'))).toBe(true)
    // Hovering rests, then plays.
    await lb.getByRole('option', { name: /Kalimba/ }).hover()
    await expect.poll(() => heard.some((f) => f.startsWith('kalimba'))).toBe(true)
  })

  test('“Use suggested sounds” sets every event in one click, and undo puts them back', async ({
    page,
  }) => {
    await open(page, 'designs/alerts')
    await page
      .locator('[aria-live="polite"]')
      .getByRole('article', { name: 'Molten plate', exact: true })
      .getByRole('button', { name: 'Duplicate & customise' })
      .click()
    await page.getByRole('tab', { name: 'Sound' }).click()
    await page.getByRole('combobox', { name: 'Event' }).selectOption({ label: 'Raid' })
    await expect(selected(page)).toContainText('Glint')
    await page.getByRole('button', { name: 'Use suggested sounds' }).click()
    await expect(page.getByText('Each event has its suggested sound now.')).toBeVisible()
    await expect(selected(page)).toContainText('Lift')
    await page.getByRole('combobox', { name: 'Event' }).selectOption({ label: 'Follow' })
    await expect(selected(page)).toContainText('Glint')
    await page.getByRole('combobox', { name: 'Event' }).selectOption({ label: 'Sub' })
    await expect(selected(page)).toContainText('Cascade')
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(selected(page)).toContainText('Glint')
  })

  test('a new install’s alert rules start with a built-in sound', async ({ page }) => {
    const heard = mp3s(page)
    await open(page, 'alerts')
    await page
      .getByRole('link', { name: /Follows/ })
      .first()
      .click()
    const sound = page.getByRole('combobox', { name: 'Sound' })
    await expect(sound).toHaveValue('builtin:glint')
    // Crystal, Felt and Classic, then the streamer's own files.
    await expect(sound.locator('optgroup')).toHaveCount(4)
    await expect(sound.locator('optgroup').last()).toHaveAttribute('label', 'Your sounds')
    await page.getByRole('button', { name: 'Play Glint' }).click()
    await expect.poll(() => heard.some((f) => f.startsWith('glint'))).toBe(true)
    await sound.selectOption({ label: 'Hearth' })
    await expect(page.getByRole('button', { name: 'Play Hearth' })).toBeVisible()
  })

  test('has no accessibility violations in the picker', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium')
    await open(page, 'designs/alerts')
    await page.getByRole('button', { name: 'Start from scratch' }).click()
    await page.getByRole('tab', { name: 'Sound' }).click()
    await expect(picker(page)).toBeVisible()
    const r = await new AxeBuilder({ page }).include('[data-testid=sound-picker]').analyze()
    expect(r.violations).toEqual([])
  })
})
