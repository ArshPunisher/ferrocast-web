import { expect, test, type Page } from '@playwright/test'
import { demo, open } from './helpers'

function statValue(page: Page, label: 'Watching now' | 'Peak') {
  return page.locator('dt', { hasText: label }).locator('..').locator('dd')
}

async function injectViewer(page: Page, platform: 'twitch' | 'youtube' | 'kick', count: number) {
  await demo(page, `d => d.inject({ type: 'viewer_count', count: ${count} }, '${platform}')`)
}

async function injectOffline(page: Page, platform: 'twitch' | 'youtube' | 'kick') {
  await demo(page, `d => d.inject({ type: 'stream_offline' }, '${platform}')`)
}

test.describe('home viewer counts and monotonic peak', () => {
  test('live-updates Watching now, preserves Peak on drops, and clears offline platforms on desktop', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await open(page)
    await expect(statValue(page, 'Watching now')).toBeVisible()

    await injectViewer(page, 'twitch', 500)
    await injectViewer(page, 'youtube', 250)
    await injectViewer(page, 'kick', 100)
    await expect(statValue(page, 'Watching now')).toHaveText('850')
    await expect(statValue(page, 'Peak')).toHaveText('850')

    // Viewer counts fluctuate downward; Watching now drops while Peak stays 850.
    await injectViewer(page, 'twitch', 200)
    await expect(statValue(page, 'Watching now')).toHaveText('550')
    await expect(statValue(page, 'Peak')).toHaveText('850')

    // One platform goes offline; Watching now drops by its count while Peak remains 850.
    await injectOffline(page, 'youtube')
    await expect(statValue(page, 'Watching now')).toHaveText('300')
    await expect(statValue(page, 'Peak')).toHaveText('850')

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('renders viewer counts and monotonic peak cleanly at 375px width', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await open(page)
    await expect(statValue(page, 'Watching now')).toBeVisible()

    await injectViewer(page, 'twitch', 500)
    await injectViewer(page, 'youtube', 200)
    await injectViewer(page, 'kick', 100)
    await expect(statValue(page, 'Watching now')).toHaveText('800')
    await expect(statValue(page, 'Peak')).toHaveText('800')

    await injectViewer(page, 'twitch', 200)
    await injectOffline(page, 'kick')
    await expect(statValue(page, 'Watching now')).toHaveText('400')
    await expect(statValue(page, 'Peak')).toHaveText('800')

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
