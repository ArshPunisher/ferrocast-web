import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { open, settled } from './helpers'

const shots = process.env.FC_SHOTS

function snap(page: Page, name: string) {
  if (!shots) return Promise.resolve()
  mkdirSync(shots, { recursive: true })
  return page.screenshot({ path: join(shots, name) })
}

test.describe('Polls native capabilities, Twitch reconnect, and No timer', () => {
  test('reconnects Twitch inline from Poll card, runs No timer poll, and restores untimed preset on Ask again', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, 'community', 'autoplay=0&latency=0&twitchPollScopeMissing=1')

    const pollCard = page.locator('#community-polls')
    const strip = pollCard.getByLabel('Platform poll modes', { exact: true })
    await expect(strip).toBeVisible()
    await expect(strip.getByRole('button', { name: 'Reconnect' })).toBeVisible()
    await settled(page)
    await snap(page, 'polls-reconnect-1440.png')

    // Click Reconnect -> dialog stays open while approving, then refreshes capability strip.
    await strip.getByRole('button', { name: 'Reconnect' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('FRRO-4821')
    await page.waitForTimeout(1200)
    await expect(dialog).toContainText('FRRO-4821')

    // DemoEngine completes Twitch device flow after 4.5s, closes dialog in 900ms, and upgrades Twitch to Native.
    await expect(dialog).toBeHidden({ timeout: 10_000 })
    await expect(strip.getByRole('button', { name: 'Reconnect' })).toBeHidden()
    await expect(strip).toContainText('Native')
    await pollCard.scrollIntoViewIfNeeded()
    await settled(page)
    await snap(page, 'polls-compose-1440.png')

    // Select No timer, fill question + preset, start poll.
    await pollCard.getByRole('radiogroup', { name: 'How long' }).getByText('No timer').click()
    await pollCard.getByLabel('Question').fill('Stay on this boss?')
    await pollCard.getByRole('button', { name: 'Yes or no' }).click()
    await pollCard.getByRole('button', { name: 'Start poll' }).click()

    await expect(pollCard.getByText('Stay on this boss?')).toBeVisible()
    await expect(pollCard.getByText('No timer')).toBeVisible()
    await expect(pollCard.getByText('Live', { exact: true })).toBeVisible()
    await expect(pollCard.getByText(/[1-9]\d*\s+votes?/)).toBeVisible({ timeout: 10_000 })
    await pollCard.scrollIntoViewIfNeeded()
    await settled(page)
    await snap(page, 'polls-live-untimed-1440.png')

    await pollCard.getByRole('button', { name: 'End now' }).click()
    await expect(pollCard.getByText('Closed', { exact: true })).toBeVisible()
    await expect(pollCard.getByText('Winner')).toBeVisible()
    await pollCard.scrollIntoViewIfNeeded()
    await settled(page)
    await snap(page, 'polls-closed-1440.png')

    // Ask again preserves No timer.
    await pollCard.getByRole('button', { name: 'Ask again' }).click()
    const noTimerRadio = pollCard
      .getByRole('radiogroup', { name: 'How long' })
      .getByRole('radio', { name: 'No timer' })
    await expect(noTimerRadio).toBeChecked()
  })

  test('fits 375 px mobile viewport without horizontal overflow across compose, live, and closed states', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await open(page, 'community', 'autoplay=0&latency=0&twitchPollScopeMissing=1')

    const pollCard = page.locator('#community-polls')
    await expect(pollCard.getByLabel('Platform poll modes', { exact: true })).toBeVisible()
    await settled(page)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await snap(page, 'polls-compose-375.png')

    await pollCard.getByRole('radiogroup', { name: 'How long' }).getByText('No timer').click()
    await pollCard.getByLabel('Question').fill('Quick vote?')
    await pollCard.getByRole('button', { name: 'Yes or no' }).click()
    await pollCard.getByRole('button', { name: 'Start poll' }).click()

    await expect(pollCard.getByText('Quick vote?')).toBeVisible()
    await expect(pollCard.getByText('No timer')).toBeVisible()
    await settled(page)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await snap(page, 'polls-live-375.png')

    await pollCard.getByRole('button', { name: 'End now' }).click()
    await expect(pollCard.getByRole('button', { name: 'Ask again' })).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
  })
})
