import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { open } from './helpers'

const shots = process.env.FC_SHOTS

function snap(page: Page, name: string) {
  if (!shots) return Promise.resolve()
  mkdirSync(shots, { recursive: true })
  return page.screenshot({ path: join(shots, name) })
}

async function openMicDrawer(page: Page, narrow = false) {
  await page.addInitScript(() => {
    localStorage.setItem('fc-golive-picture', 'ferrocast')
    localStorage.removeItem('fc-studio-standby-scene')
  })
  await open(page, 'studio', 'autoplay=0&latency=0&studioEngine=1')
  await page.getByRole('button', { name: 'Start the Studio' }).click()
  await page.locator('[data-canvas-box]').waitFor({ state: 'visible', timeout: 10_000 })
  if (narrow) {
    await page
      .getByRole('radiogroup', { name: 'Panel' })
      .getByText('Sources', { exact: true })
      .click()
  }
  await page
    .getByRole('region', { name: /Sources in/ })
    .getByRole('button', { name: 'Mic', exact: true })
    .click()
  await page.getByRole('button', { name: 'Settings of Mic' }).click()
  const drawer = page.getByRole('complementary', { name: 'Mic settings' })
  await expect(drawer).toBeVisible()
  await drawer.getByRole('tab', { name: 'Sound' }).click()
  return drawer
}

test.describe('Clean mic expander, safe update, and Auto boost (#2, #3)', () => {
  test('configures Auto boost before & after cleanup, orders Quiet between words before compressor, and supports safe Update cleanup', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    const drawer = await openMicDrawer(page)
    const tile = drawer.getByTestId('clean-mic-tile')
    const sw = tile.getByRole('switch', { name: 'Auto boost' })

    await expect(sw).toHaveAttribute('aria-checked', 'true')
    await snap(page, 'cleanmic-before-1280.png')

    // Turn Auto boost OFF before cleanup, then Clean up my mic.
    await sw.click()
    await expect(sw).toHaveAttribute('aria-checked', 'false')
    await tile.getByRole('button', { name: /Clean up my mic/ }).click()
    await expect(tile.getByText('Mic cleaned up')).toBeVisible()
    await expect(sw).toHaveAttribute('aria-checked', 'false')

    // Verify filter chain places Quiet between words before Even out loud moments and Boost after = 0 dB.
    await drawer.getByRole('tab', { name: 'Filters' }).click()
    const expanderHeading = drawer.getByText('Quiet between words', { exact: true })
    const compHeading = drawer.getByText('Even out loud moments', { exact: true })
    await expect(expanderHeading).toBeVisible()
    await expect(compHeading).toBeVisible()

    const expBox = await expanderHeading.boundingBox()
    const compBox = await compHeading.boundingBox()
    expect(expBox !== null && compBox !== null && expBox.y < compBox.y).toBe(true)

    await compHeading.click()
    await drawer.getByRole('button', { name: 'More settings for Even out loud moments' }).click()
    const boostInput = drawer.getByRole('slider', { name: 'Boost after' })
    await expect(boostInput).toHaveValue('0')
    await snap(page, 'cleanmic-filters-0db-1280.png')

    // Toggle Auto boost ON afterwards -> sets compressor Boost after to +9 dB.
    await drawer.getByRole('tab', { name: 'Sound' }).click()
    await sw.click()
    await expect(sw).toHaveAttribute('aria-checked', 'true')

    await drawer.getByRole('tab', { name: 'Filters' }).click()
    await drawer.getByText('Even out loud moments', { exact: true }).click()
    await drawer.getByRole('button', { name: 'More settings for Even out loud moments' }).click()
    await expect(drawer.getByRole('slider', { name: 'Boost after' })).toHaveValue('9')

    // Simulate legacy 3-filter user by deleting Quiet between words -> Sound shows safe Update cleanup prompt without duplicate Clean up my mic button.
    await drawer.getByRole('button', { name: 'Remove Quiet between words' }).click()
    await expect(drawer.getByText('Quiet between words', { exact: true })).toHaveCount(0)

    await drawer.getByRole('tab', { name: 'Sound' }).click()
    await expect(tile.getByRole('button', { name: 'Update cleanup' })).toBeVisible()
    await expect(tile.getByRole('button', { name: 'Keep current' })).toBeVisible()
    await expect(tile.getByRole('button', { name: /Clean up my mic/ })).toHaveCount(0)
    await snap(page, 'cleanmic-update-offer-1280.png')

    // Keep current resolves cleanly to Mic cleaned up without leaving Clean up my mic stuck.
    await tile.getByRole('button', { name: 'Keep current' }).click()
    await expect(tile.getByRole('button', { name: 'Update cleanup' })).toHaveCount(0)
    await expect(tile.getByText('Mic cleaned up')).toBeVisible()

    // Clear skip state so we also exercise the Update cleanup path.
    await page.evaluate(() => localStorage.removeItem('fc-cleanmic-v2-skip'))
    await drawer.getByRole('tab', { name: 'Filters' }).click()
    await drawer.getByRole('tab', { name: 'Sound' }).click()
    await expect(tile.getByRole('button', { name: 'Update cleanup' })).toBeVisible()
    await tile.getByRole('button', { name: 'Update cleanup' }).click()
    await expect(tile.getByRole('button', { name: 'Update cleanup' })).toHaveCount(0)
    await expect(tile.getByText('Mic cleaned up')).toBeVisible()

    await drawer.getByRole('tab', { name: 'Filters' }).click()
    await expect(drawer.getByText('Quiet between words', { exact: true })).toBeVisible()
  })

  test('renders Auto boost and Clean up my mic cleanly at 375x812 with zero overflow', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    const drawer = await openMicDrawer(page, true)
    const tile = drawer.getByTestId('clean-mic-tile')
    const sw = tile.getByRole('switch', { name: 'Auto boost' })

    await expect(sw).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
    await snap(page, 'cleanmic-auto-boost-375.png')

    await sw.click()
    await tile.getByRole('button', { name: /Clean up my mic/ }).click()
    await expect(tile.getByText('Mic cleaned up')).toBeVisible()
    await expect(sw).toHaveAttribute('aria-checked', 'false')
    await snap(page, 'cleanmic-done-375.png')
  })
})
