import { expect, test } from '@playwright/test'
import { open } from './helpers'

// The update channel follows the installed build: Settings › Updates shows it, no switch.
test('Updates shows the channel as a read-only line', async ({ page }) => {
  await open(page, 'settings', 'autoplay=0&latency=0')
  const card = page.locator('#s-updates')
  await expect(card).toContainText('Stable version: you get stable updates only.')
  await expect(card.getByRole('radiogroup')).toHaveCount(0)
  await expect(card.getByText('Channel', { exact: true })).toHaveCount(0)
})
