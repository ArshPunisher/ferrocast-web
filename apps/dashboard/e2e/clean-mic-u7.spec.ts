import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { open } from './helpers'

test.describe('Clean up my mic tile (U7)', () => {
  test('renders as one compact bordered tile with button on right at desktop, even Voice segments, and done status in tile', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem('fc-golive-picture', 'ferrocast')
      localStorage.removeItem('fc-studio-standby-scene')
    })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await open(page, 'studio', 'autoplay=0&latency=0&studioEngine=1')
    await page.getByRole('button', { name: 'Start the Studio' }).click()
    await page.locator('[data-canvas-box]').waitFor({ state: 'visible', timeout: 10000 })

    await page
      .getByRole('region', { name: /Sources in/ })
      .getByRole('button', { name: 'Mic', exact: true })
      .click()
    await page.getByRole('button', { name: 'Settings of Mic' }).click()
    const drawer = page.getByRole('complementary', { name: 'Mic settings' })
    await expect(drawer).toBeVisible()
    await drawer.getByRole('tab', { name: 'Sound' }).click()

    const tile = page.getByTestId('clean-mic-tile')
    await expect(tile).toBeVisible()
    const btn = tile.getByRole('button', { name: /Clean up my mic/ })
    await expect(btn).toBeVisible()

    const layout = await page.evaluate(() => {
      const card = document.querySelector('[data-testid="clean-mic-tile"]') as HTMLElement | null
      if (!card) throw new Error('missing tile')
      const button = Array.from(card.querySelectorAll('button')).find((b) =>
        /Clean up my mic/.test(b.textContent ?? ''),
      )
      const hint = card.querySelector('[aria-live="polite"]') as HTMLElement | null
      const voice = card.querySelector('[role="radiogroup"][aria-label="Voice"]')
      const opts = voice ? Array.from(voice.querySelectorAll('label')) : []
      if (!button || !hint || opts.length !== 3) throw new Error('missing tile children')
      const cs = getComputedStyle(card)
      const cR = card.getBoundingClientRect()
      const bR = button.getBoundingClientRect()
      const hR = hint.getBoundingClientRect()
      const widths = opts.map((o) => o.getBoundingClientRect().width)
      return {
        border: parseFloat(cs.borderTopWidth),
        radius: parseFloat(cs.borderTopLeftRadius),
        btnOnRight: bR.left > hR.left + 20 && bR.right >= cR.right - 24,
        sameBand: Math.abs(bR.top - hR.top) < 40,
        minSeg: Math.min(...widths),
        maxSeg: Math.max(...widths),
      }
    })

    expect(layout.border, 'tile border').toBeGreaterThanOrEqual(1)
    expect(layout.radius, 'tile radius').toBeGreaterThanOrEqual(10)
    expect(layout.btnOnRight, 'button aligned on right side of tile').toBe(true)
    expect(
      layout.sameBand,
      'button shares top band with title/hint instead of empty lower row',
    ).toBe(true)
    expect(layout.maxSeg - layout.minSeg, 'Voice segments have equal width').toBeLessThanOrEqual(2)

    await btn.click()
    await expect(tile.getByText('Mic cleaned up')).toBeVisible()

    const lightAxe = await new AxeBuilder({ page })
      .include('[data-testid="clean-mic-tile"]')
      .analyze()
    expect(lightAxe.violations).toEqual([])
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'slate'))
    await page.waitForTimeout(100)
    const darkAxe = await new AxeBuilder({ page })
      .include('[data-testid="clean-mic-tile"]')
      .analyze()
    expect(darkAxe.violations).toEqual([])
  })

  test('stacks Clean up my mic under text cleanly at 375px with zero overflow', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await open(page, 'home', 'firstrun&autoplay=0&latency=0')
    await page.getByText('Import from OBS Studio', { exact: true }).click()
    await page.getByRole('button', { name: /Import “Main Streaming Setup”/ }).click()
    await page.getByRole('button', { name: 'Continue to camera and mic check' }).click()
    await expect(page.getByRole('heading', { name: 'Camera and mic check' })).toBeVisible()
    const tile = page.getByTestId('clean-mic-tile')
    await expect(tile).toBeVisible()
    const btn = tile.getByRole('button', { name: /Clean up my mic/ })
    await expect(btn).toBeVisible()

    const stacked = await page.evaluate(() => {
      const card = document.querySelector('[data-testid="clean-mic-tile"]') as HTMLElement
      const button = Array.from(card.querySelectorAll('button')).find((b) =>
        /Clean up my mic/.test(b.textContent ?? ''),
      )!
      const hint = card.querySelector('[aria-live="polite"]') as HTMLElement
      return {
        btnBelowHint: button.getBoundingClientRect().top >= hint.getBoundingClientRect().bottom - 1,
        noOverflow: document.documentElement.scrollWidth <= window.innerWidth,
      }
    })
    expect(stacked.btnBelowHint, 'button stacks below hint at 375px').toBe(true)
    expect(stacked.noOverflow, 'zero sideways scroll at 375px').toBe(true)
  })
})
