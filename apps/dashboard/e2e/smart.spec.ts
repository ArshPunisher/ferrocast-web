import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { open } from './helpers'

// Pro smart features on the demo engine (API.md §4 "Smart features"): smart moderation on
// the Moderation page, smart replies on the Bot page, the written recap. Never "AI".
const PRO = 'autoplay=0&latency=0&pro=active&pro_features=on'

test.describe('Smart features', () => {
  test('smart moderation: suggestions, apply, undo, dismiss', async ({ page }) => {
    await open(page, 'moderation', PRO)
    const p = page.locator('#smart-moderation')
    await expect(p.getByRole('heading', { name: 'Smart moderation' })).toBeVisible()
    await expect(p).not.toContainText(/\bAI\b/)
    const items = p.getByTestId('smart-suggestion')
    await expect(items).toHaveCount(3)
    // The one done on its own can be undone.
    const auto = items.filter({ hasText: 'raxxor_99' })
    await expect(auto).toContainText('on its own')
    await auto.getByRole('button', { name: 'Undo' }).click()
    await expect(page.getByText('Timeout lifted.')).toBeVisible()
    await expect(auto).toHaveAttribute('data-state', 'undone')
    // A suggested delete, applied: a delete can't be undone, so no Undo.
    const spam = items.filter({ hasText: 'freefollows_now' })
    await spam.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(spam).toHaveAttribute('data-state', 'done')
    await expect(spam.getByRole('button', { name: 'Undo' })).toHaveCount(0)
    const banter = items.filter({ hasText: 'Ankit R' })
    await banter.getByRole('button', { name: 'Dismiss' }).click()
    await expect(banter).toHaveAttribute('data-state', 'dismissed')
    // The mode.
    await p.getByRole('radio', { name: 'Act on clear cases' }).check({ force: true })
    await expect(p.getByLabel('Automatic timeout')).toBeVisible()
  })

  test('smart replies need the facts approved', async ({ page }) => {
    await open(page, 'bot', PRO)
    const p = page.locator('#smart-replies')
    await expect(p.getByRole('heading', { name: 'Smart replies' })).toBeVisible()
    await p.getByRole('switch', { name: 'Answer questions in chat' }).click()
    await expect(p.getByText('Replies start once you approve the facts.')).toBeVisible()
    await p
      .getByLabel('Facts the bot may use')
      .fill('Live daily at 9pm IST. Discord: discord.gg/kabirlive.')
    await p.getByRole('button', { name: 'Save and approve' }).click()
    await expect(page.getByText('Approved. Smart replies use exactly this text.')).toBeVisible()
    await expect(p.getByText('Approved', { exact: true })).toBeVisible()
    await expect(p.getByText('kab stream hoti hai?', { exact: false })).toBeVisible()
  })

  test('without Pro: one calm line', async ({ page }) => {
    await open(page, 'moderation', 'autoplay=0&latency=0&pro=open&pro_features=on')
    const p = page.locator('#smart-moderation')
    await expect(p.getByTestId('pro-line')).toContainText('part of Pro')
    await expect(p.getByTestId('smart-suggestion')).toHaveCount(0)
  })

  test('has no accessibility violations', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium')
    await open(page, 'moderation', PRO)
    await expect(
      page.locator('#smart-moderation').getByTestId('smart-suggestion').first(),
    ).toBeVisible()
    const r = await new AxeBuilder({ page }).include('#smart-moderation').analyze()
    expect(r.violations).toEqual([])
  })
})
