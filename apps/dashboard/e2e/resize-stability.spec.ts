import { expect, test, type Page } from '@playwright/test'
import { open, openSidebar } from './helpers'

interface PreviewReqLog {
  method: string
  path: string
  rect: { x: number; y: number; w: number; h: number; opacity?: number } | null
}

async function openDesktopStudio(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height })
  await page.addInitScript(() => {
    ;(window as unknown as { __FERROCAST__: unknown }).__FERROCAST__ = { desktop: true }
    localStorage.setItem('fc-golive-picture', 'ferrocast')
    localStorage.removeItem('fc-studio-scenes-grid')
    localStorage.removeItem('fc-studio-layout')
  })
  await open(page, 'studio/golive', 'autoplay=0&latency=0&studioEngine=1')
  await page.getByRole('button', { name: 'Start the Studio' }).click()
  await expect(page.locator('[data-canvas-box]').first()).toBeVisible()

  await page.evaluate(() => {
    const w = window as unknown as {
      __previewPuts?: PreviewReqLog[]
      __ferrocastDemo?: {
        studioEngine: {
          route: (method: string, seg: string[], body: unknown, url?: URL) => unknown
        }
      }
    }
    w.__previewPuts = []
    const orig = w.__ferrocastDemo?.studioEngine.route
    if (orig && w.__ferrocastDemo) {
      w.__ferrocastDemo.studioEngine.route = function (
        method: string,
        seg: string[],
        body: unknown,
        url?: URL,
      ) {
        if (method === 'PUT' && seg.join('/') === 'studio/engine/preview') {
          const payload = (body ?? {}) as { rect?: PreviewReqLog['rect'] }
          w.__previewPuts?.push({ method, path: seg.join('/'), rect: payload.rect ?? null })
        }
        return orig.call(this, method, seg, body, url)
      }
    }
  })
}

test.describe('Studio CSS layout and resize stability', () => {
  test.skip(({ isMobile }) => !!isMobile, 'Desktop resize sweep tests desktop + phone breakpoints.')

  test('keeps PreviewBox mounted across 900px and 640px with compact desktop stack and instant fold', async ({
    page,
  }) => {
    await openSidebar(page)
    await openDesktopStudio(page, 1440, 900)

    await page.evaluate(() => {
      const w = window as unknown as { __stageEl?: Element | null }
      w.__stageEl = document.querySelector('[data-canvas-box]')
    })

    // Studio sidebar fold is instant (no 300ms slide on Studio).
    const side = page.getByRole('complementary', { name: 'Sidebar' })
    const foldBtn = side.getByRole('button', { name: /Hide the menu|Show the menu/ })
    const td = await side.evaluate((el) => getComputedStyle(el).transitionDuration)
    expect(td === '0s' || td === '0ms').toBe(true)
    await foldBtn.click()
    await expect(side.getByRole('button', { name: 'Show the menu' })).toBeVisible()
    await foldBtn.click()

    for (const [vw, vh] of [
      [1440, 900],
      [1200, 780],
      [1024, 700],
      [890, 650],
      [768, 600],
      [375, 812],
      [1440, 900],
    ] as const) {
      await page.setViewportSize({ width: vw, height: vh })
      await page.waitForTimeout(60)

      const state = await page.evaluate(() => {
        const w = window as unknown as { __stageEl?: Element | null }
        const cur = document.querySelector('[data-canvas-box]')
        const ws = document.querySelector<HTMLElement>('[data-dock-ws]')
        return {
          sameStage: Boolean(cur && cur === w.__stageEl),
          inlineHeight: ws?.style.height ?? '',
          scrollW: document.documentElement.scrollWidth,
          innerW: window.innerWidth,
          scrollH: document.documentElement.scrollHeight,
          innerH: window.innerHeight,
        }
      })

      expect(state.sameStage).toBe(true)
      expect(state.inlineHeight).toBe('')
      expect(state.scrollW).toBeLessThanOrEqual(state.innerW + 1)

      if (vw >= 1024) {
        expect(state.scrollH).toBeLessThanOrEqual(state.innerH + 2)
      }

      if (vw < 900 && vw >= 640) {
        await expect(page.getByRole('radiogroup', { name: 'Panel' })).toHaveCount(0)
        for (const id of ['scenes', 'sources', 'audio', 'golive']) {
          const box = await page.locator(`[data-dock="${id}"]`).boundingBox()
          expect(box).not.toBeNull()
          expect(box!.height).toBeGreaterThan(40)
        }
      }

      if (vw < 640) {
        const switcher = page.getByRole('radiogroup', { name: 'Panel' })
        await expect(switcher).toBeVisible()
        await switcher.getByText('Audio', { exact: true }).click()
        await expect(page.locator('[data-dock="audio"]')).toBeVisible()
      }
    }
  })

  test('coalesces divider drag writes and honors fc://preview-live-resize and fc://scale-changed', async ({
    page,
  }) => {
    await openDesktopStudio(page, 1280, 800)

    await page.evaluate(() => {
      const w = window as unknown as { __layoutWrites?: number }
      w.__layoutWrites = 0
      const orig = Storage.prototype.setItem
      Storage.prototype.setItem = function (k: string, v: string) {
        if (k === 'fc-studio-layout') w.__layoutWrites = (w.__layoutWrites ?? 0) + 1
        return orig.call(this, k, v)
      }
      if (w as { __previewPuts?: PreviewReqLog[] }) {
        ;(w as { __previewPuts: PreviewReqLog[] }).__previewPuts = []
      }
    })

    const sep = page.getByRole('separator', { name: 'Resize the left panels' })
    const box = (await sep.boundingBox())!
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2

    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + 60, cy, { steps: 10 })
    await page.waitForTimeout(40)

    const midWrites = await page.evaluate(() => {
      const w = window as unknown as { __layoutWrites?: number }
      return w.__layoutWrites ?? 0
    })
    expect(midWrites).toBe(0)

    await page.mouse.up()
    await page.waitForTimeout(50)

    const endWrites = await page.evaluate(() => {
      const w = window as unknown as { __layoutWrites?: number }
      return w.__layoutWrites ?? 0
    })
    expect(endWrites).toBe(1)

    // Test fc://preview-live-resize freeze (0 PUTs while active) -> restore (1 PUT on active:false).
    await page.evaluate(() => {
      const w = window as unknown as { __previewPuts?: PreviewReqLog[] }
      if (w.__previewPuts) w.__previewPuts.length = 0
      window.dispatchEvent(
        new CustomEvent('fc://preview-live-resize', {
          detail: { active: true, reason: 'window', seq: 1, scale: 1 },
        }),
      )
    })

    await page.setViewportSize({ width: 1120, height: 700 })
    await page.waitForTimeout(60)
    const duringResize = await page.evaluate(() => {
      const w = window as unknown as { __previewPuts?: PreviewReqLog[] }
      const canvas = document.querySelector<HTMLElement>('[data-canvas-box]')
      return {
        puts: w.__previewPuts?.length ?? -1,
        hasStill: Boolean(canvas?.style.backgroundImage),
      }
    })
    expect(duringResize.puts).toBe(0)
    expect(duringResize.hasStill).toBe(true)

    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('fc://preview-live-resize', {
          detail: { active: false, reason: 'window', seq: 2, scale: 1 },
        }),
      )
    })
    await page.waitForTimeout(60)
    const afterResize = await page.evaluate(() => {
      const w = window as unknown as { __previewPuts?: PreviewReqLog[] }
      return w.__previewPuts?.length ?? 0
    })
    expect(afterResize).toBe(1)

    // Test fc://scale-changed triggers 1 atomic resync.
    await page.evaluate(() => {
      const w = window as unknown as { __previewPuts?: PreviewReqLog[] }
      if (w.__previewPuts) w.__previewPuts.length = 0
      window.dispatchEvent(
        new CustomEvent('fc://scale-changed', {
          detail: { scale: 2, previousScale: 1, display: 'Retina' },
        }),
      )
    })
    await page.waitForTimeout(60)
    const afterScale = await page.evaluate(() => {
      const w = window as unknown as { __previewPuts?: PreviewReqLog[] }
      return w.__previewPuts?.length ?? 0
    })
    expect(afterScale).toBe(1)
  })
})
