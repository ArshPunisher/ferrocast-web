import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { fault, open } from './helpers'

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

  test('fits Voice segmented control ("Clear podcast") inside 375px SourcePanel without clipping or overflow', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem('fc-golive-picture', 'ferrocast')
      localStorage.removeItem('fc-studio-standby-scene')
    })
    await page.setViewportSize({ width: 375, height: 812 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await open(page, 'studio', 'autoplay=0&latency=0&studioEngine=1')
    await page.getByRole('button', { name: 'Start the Studio' }).click()
    await page.locator('[data-canvas-box]').waitFor({ state: 'visible', timeout: 10000 })

    await page
      .getByRole('radiogroup', { name: 'Panel' })
      .getByText('Sources', { exact: true })
      .click()
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

    const checkVoiceSeg = async (vp: { width: number; height: number }) => {
      await page.setViewportSize(vp)
      const seg = await page.evaluate(() => {
        const voice = document.querySelector('[role="radiogroup"][aria-label="Voice"]')
        const drawerEl = document.querySelector('[aria-label="Mic settings"]')
        if (!voice || !drawerEl) throw new Error('missing Voice segmented or drawer')
        const gR = voice.getBoundingClientRect()
        const dR = drawerEl.getBoundingClientRect()
        const opts = Array.from(voice.querySelectorAll('label')).map((el) => {
          const r = el.getBoundingClientRect()
          return {
            text: el.textContent?.trim() ?? '',
            scrollW: Math.ceil(el.scrollWidth),
            clientW: Math.floor(el.clientWidth),
            left: r.left,
            right: r.right,
            width: r.width,
            height: r.height,
          }
        })
        return {
          pageOverflow: document.documentElement.scrollWidth > window.innerWidth,
          groupInsideDrawer: gR.left >= dR.left - 1 && gR.right <= dR.right + 1,
          groupNoScroll: voice.scrollWidth <= voice.clientWidth + 1,
          opts,
        }
      })

      expect(seg.pageOverflow, `zero horizontal overflow at ${vp.width}px`).toBe(false)
      expect(
        seg.groupInsideDrawer,
        `Voice radiogroup fits inside SourcePanel drawer at ${vp.width}px`,
      ).toBe(true)
      expect(
        seg.groupNoScroll,
        `Voice radiogroup does not horizontally clip at ${vp.width}px`,
      ).toBe(true)
      expect(seg.opts).toHaveLength(3)
      for (let i = 0; i < seg.opts.length; i++) {
        const o = seg.opts[i]!
        expect(
          o.scrollW,
          `${o.text} text must not clip horizontally at ${vp.width}px`,
        ).toBeLessThanOrEqual(o.clientW + 1)
        if (i > 0) {
          expect(
            o.left,
            `${o.text} must not overlap previous segment at ${vp.width}px`,
          ).toBeGreaterThanOrEqual(seg.opts[i - 1]!.right - 1)
        }
      }
      const minW = Math.min(...seg.opts.map((o) => o.width))
      const maxW = Math.max(...seg.opts.map((o) => o.width))
      expect(maxW - minW, `Voice segments remain equal width at ${vp.width}px`).toBeLessThanOrEqual(
        2,
      )
    }

    await checkVoiceSeg({ width: 375, height: 812 })
    await checkVoiceSeg({ width: 320, height: 812 })
  })

  test('wraps filter read error message with a compact Try again button that fits 375px and recovers on retry', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem('fc-golive-picture', 'ferrocast')
      localStorage.removeItem('fc-studio-standby-scene')
    })
    await page.setViewportSize({ width: 375, height: 812 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await open(page, 'studio', 'autoplay=0&latency=0&studioEngine=1')
    await page.getByRole('button', { name: 'Start the Studio' }).click()
    await page.locator('[data-canvas-box]').waitFor({ state: 'visible', timeout: 10000 })

    await fault(page, {
      method: 'GET',
      path: '/api/v1/studio/engine/sources/Mic/filters',
      status: 500,
      code: 'engine_error',
      message: 'Failed to read filters',
    })

    await page
      .getByRole('radiogroup', { name: 'Panel' })
      .getByText('Sources', { exact: true })
      .click()
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
    await expect(tile.getByText('Couldn’t read your mic’s filters.')).toBeVisible()
    const retryBtn = tile.getByRole('button', { name: 'Try again', exact: true })
    await expect(retryBtn).toBeVisible()

    const fit = await page.evaluate(() => {
      const card = document.querySelector('[data-testid="clean-mic-tile"]') as HTMLElement | null
      if (!card) throw new Error('missing tile')
      const btn = Array.from(card.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Try again',
      )
      if (!btn) throw new Error('missing Try again button')
      const cR = card.getBoundingClientRect()
      const bR = btn.getBoundingClientRect()
      return {
        pageOverflow: document.documentElement.scrollWidth > window.innerWidth,
        btnFitsTile: bR.left >= cR.left - 1 && bR.right <= cR.right + 1,
        btnNoScroll: btn.scrollWidth <= btn.clientWidth + 1,
      }
    })
    expect(fit.pageOverflow, 'zero page overflow at 375px').toBe(false)
    expect(fit.btnFitsTile, 'Try again button fits inside tile at 375px').toBe(true)
    expect(fit.btnNoScroll, 'Try again button text does not clip').toBe(true)

    await page.evaluate(() => window.__ferrocastDemo?.clearFaults())
    await retryBtn.click()
    await expect(tile.getByRole('button', { name: /Clean up my mic/ })).toBeVisible()
  })
})
