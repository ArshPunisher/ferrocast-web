import { expect, test, type Page } from '@playwright/test'
import { demo, open, openSidebar, settled } from './helpers'

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

    // Test fc://preview-live-resize equal seq active:false + trailing grace absorption (F2).
    await page.evaluate(() => {
      const w = window as unknown as { __previewPuts?: PreviewReqLog[] }
      if (w.__previewPuts) w.__previewPuts.length = 0
      window.dispatchEvent(
        new CustomEvent('fc://preview-live-resize', {
          detail: { active: true, reason: 'window', seq: 9, scale: 1 },
        }),
      )
      window.dispatchEvent(
        new CustomEvent('fc://preview-live-resize', {
          detail: { active: false, reason: 'window', seq: 9, scale: 1 },
        }),
      )
    })
    await page.waitForTimeout(180)
    await page.setViewportSize({ width: 1100, height: 690 })
    await page.waitForTimeout(50)
    const graceCheck = await page.evaluate(() => {
      const w = window as unknown as { __previewPuts?: PreviewReqLog[] }
      const canvas = document.querySelector<HTMLElement>('[data-canvas-box]')
      const hiddenPuts = (w.__previewPuts ?? []).filter((p) => p.rect?.opacity === 0).length
      return {
        hiddenPuts,
        hasStill: Boolean(canvas?.style.backgroundImage),
      }
    })
    expect(graceCheck.hiddenPuts).toBe(0)
    expect(graceCheck.hasStill).toBe(false)

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

  test('restores divider drag on 900px unmount and avoids overflow in 375px Studio Mode (F7, F16)', async ({
    page,
  }) => {
    await openDesktopStudio(page, 1024, 700)
    await settled(page)

    const ws = page.locator('[data-dock-ws]')
    const initialLw = await ws.evaluate((el) =>
      getComputedStyle(el).getPropertyValue('--fc-lw').trim(),
    )
    const sep = page.getByRole('separator', { name: 'Resize the left panels' })
    const box = (await sep.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + 80, box.y + box.height / 2, { steps: 6 })
    await page.waitForTimeout(30)

    // Crossing below 900px mid-drag unmounts the Divider cleanly: restores committed CSS var, userSelect, and live preview.
    await page.setViewportSize({ width: 820, height: 680 })
    await page.waitForTimeout(160)
    await page.mouse.up()
    const afterAbort = await ws.evaluate((el) => ({
      lw: el.style.getPropertyValue('--fc-lw').trim(),
      userSelect: document.body.style.userSelect,
    }))
    expect(afterAbort.lw).toBe(initialLw)
    expect(afterAbort.userSelect).toBe('')

    // F16: Studio Mode wraps SwitchBar cleanly at 375px without horizontal overflow.
    await page.setViewportSize({ width: 1280, height: 800 })
    const studioBtn = page.getByRole('button', { name: /Studio Mode/i })
    await expect(studioBtn).toBeVisible()
    await studioBtn.click()
    await expect(page.locator('[data-studio-stage]')).toBeVisible()

    await page.setViewportSize({ width: 375, height: 812 })
    await page.waitForTimeout(60)
    const studio375 = await page.evaluate(() => {
      const st = document.querySelector<HTMLElement>('[data-studio-stage]')!
      const swapBtn = document.querySelector<HTMLElement>(
        'button[aria-label="Swap the preview and what\'s on air"]',
      )
      const fig = st.querySelector('figure')!
      const sb = swapBtn?.closest('div')
      const stR = st.getBoundingClientRect()
      const figR = fig.getBoundingClientRect()
      const sbR = sb?.getBoundingClientRect()
      return {
        scrollW: document.documentElement.scrollWidth,
        innerW: window.innerWidth,
        hasSwap: Boolean(swapBtn),
        stageH: stR.height,
        figInsideStage: figR.top >= stR.top - 1 && figR.bottom <= (sbR?.top ?? stR.bottom) + 1,
        barInsideStage: sbR ? sbR.bottom <= stR.bottom + 1 : false,
      }
    })
    expect(studio375.hasSwap).toBe(true)
    expect(studio375.scrollW).toBeLessThanOrEqual(studio375.innerW + 1)
    expect(studio375.stageH).toBeGreaterThanOrEqual(240)
    expect(studio375.figInsideStage).toBe(true)
    expect(studio375.barInsideStage).toBe(true)
  })
})

const WHOLE_APP_VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 1024, height: 600 },
  { width: 900, height: 700 },
  { width: 375, height: 812 },
] as const

const SCREEN_GROUP_CORE = [
  'home',
  'studio/golive',
  'studio/vertical',
  'chat',
  'alerts',
  'alerts/sub',
  'overlays',
  'overlays/ov-main',
] as const

const SCREEN_GROUP_SECONDARY = [
  'designs',
  'designer/builtin.neon-sign',
  'store',
  'moderation',
  'bot',
  'community',
  'recap',
  'tips',
  'history',
  'plans',
  'account',
  'settings/appearance',
  'import',
] as const

async function sweepScreensAtViewports(page: Page, routes: readonly string[]) {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))

  await openSidebar(page)
  await page.setViewportSize(WHOLE_APP_VIEWPORTS[0])
  await open(page, routes[0]!, 'autoplay=0&latency=0&studioEngine=1')

  for (const route of routes) {
    await page.evaluate((r) => {
      location.hash = `#/${r}`
    }, route)
    await expect(page.locator('#main')).toBeVisible()
    // Allow lazy route chunk & initial data fetch to settle cleanly before sizing assertions.
    await expect(page.locator('#main')).not.toHaveText(/^\s*$/)
    await settled(page)

    for (const vp of WHOLE_APP_VIEWPORTS) {
      await page.setViewportSize(vp)
      await page.waitForTimeout(50)

      const metrics = await page.evaluate(() => ({
        scrollW: document.documentElement.scrollWidth,
        innerW: window.innerWidth,
        scrollH: document.documentElement.scrollHeight,
        innerH: window.innerHeight,
        mainText: (document.getElementById('main')?.textContent ?? '').trim().length,
      }))

      expect(
        metrics.mainText,
        `${route} at ${vp.width}x${vp.height} rendered empty`,
      ).toBeGreaterThan(0)
      expect(
        metrics.scrollW,
        `${route} horizontal overflow at ${vp.width}x${vp.height}`,
      ).toBeLessThanOrEqual(metrics.innerW + 1)

      if (
        vp.width >= 1024 &&
        (route === 'alerts/sub' || route === 'chat' || route === 'overlays/ov-main')
      ) {
        expect(
          metrics.scrollH,
          `${route} outer vertical overflow at ${vp.width}x${vp.height}`,
        ).toBeLessThanOrEqual(metrics.innerH + 2)
      }
    }
  }

  expect(errors, 'unexpected pageerror during screen resize sweep').toEqual([])
}

test.describe('Whole-app S3 stability sweep across main screens', () => {
  test.skip(({ isMobile }) => !!isMobile, 'Desktop resize sweep tests desktop + phone breakpoints.')

  test('core & editor screens remain overflow-free at 1280x800, 1024x600, 900x700, 375x812', async ({
    page,
  }) => {
    test.setTimeout(60_000)
    await sweepScreensAtViewports(page, SCREEN_GROUP_CORE)
  })

  test('creation, community, plans, settings & import screens remain overflow-free at all 4 viewports', async ({
    page,
  }) => {
    test.setTimeout(60_000)
    await sweepScreensAtViewports(page, SCREEN_GROUP_SECONDARY)
  })

  test('banners, sticky headers, StageView width, Chat 1024px continuity, DockHandle drag & dialog scroll-lock', async ({
    page,
  }) => {
    test.setTimeout(60_000)
    await openSidebar(page)
    await page.addInitScript(() => localStorage.setItem('fc-golive-picture', 'ferrocast'))
    await page.setViewportSize({ width: 1280, height: 800 })
    await open(page, 'studio/golive', 'autoplay=0&latency=0&studioEngine=1')
    await page.getByRole('button', { name: 'Start the Studio' }).click()
    await expect(page.locator('footer[aria-label="Studio status"]')).toBeVisible()

    // Inject a persistent warning banner so --fc-banners is active alongside StudioStatusBar (--fc-statusbar).
    await demo(
      page,
      "(d) => d.broadcastLive({ v: 1, type: 'notice', data: { key: 's3-banner', level: 'warn', message: 'Encoder bandwidth notice for viewport check.' } })",
    )
    await expect(page.locator('[data-banners-wrap="true"]')).toContainText(
      'Encoder bandwidth notice',
    )

    // 1. Alerts, Chat, OverlayEditor clear both banner and bottom Studio statusbar.
    for (const r of ['alerts/sub', 'chat', 'overlays/ov-main'] as const) {
      await page.evaluate((hash) => {
        location.hash = `#/${hash}`
      }, r)
      await settled(page)
      const fit = await page.evaluate(() => {
        const sb = document.querySelector('footer[aria-label="Studio status"]')
        const ed =
          document.querySelector('[data-testid="alert-editor"]') ??
          document.querySelector('[data-testid="chat-pane-header"]')?.parentElement
            ?.parentElement ??
          document.querySelector('#main > div')
        return {
          scrollH: document.documentElement.scrollHeight,
          innerH: window.innerHeight,
          sbTop: sb ? sb.getBoundingClientRect().top : window.innerHeight,
          edBottom: ed ? ed.getBoundingClientRect().bottom : 0,
        }
      })
      expect(fit.scrollH, `${r} with banner+statusbar fits 1280x800`).toBeLessThanOrEqual(
        fit.innerH + 2,
      )
      expect(fit.edBottom, `${r} clears Studio statusbar`).toBeLessThanOrEqual(fit.sbTop + 2)
    }

    // 2. Settings, Designs, Store sticky chrome clears sticky <header> on scroll and Studio statusbar at rest.
    await page.evaluate(() => {
      location.hash = '#/settings/appearance'
    })
    await expect(page.getByRole('navigation', { name: 'Settings sections' })).toBeVisible()
    const settingsAtRest = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="Settings sections"]')!
      const sb = document.querySelector('footer[aria-label="Studio status"]')!
      return {
        navBottom: nav.getBoundingClientRect().bottom,
        sbTop: sb.getBoundingClientRect().top,
      }
    })
    expect(settingsAtRest.navBottom).toBeLessThanOrEqual(settingsAtRest.sbTop + 1)

    await page.evaluate(() => window.scrollTo(0, 600))
    const settingsSticky = await page.evaluate(() => {
      const hdr = document.querySelector('header')!
      const nav = document.querySelector('nav[aria-label="Settings sections"]')!
      return {
        headerBottom: hdr.getBoundingClientRect().bottom,
        navTop: nav.getBoundingClientRect().top,
      }
    })
    expect(settingsSticky.navTop).toBeGreaterThanOrEqual(settingsSticky.headerBottom - 1)

    for (const [route, selector] of [
      ['designs', 'aside[aria-label="Filters"]'],
      ['store', 'aside[aria-label="Store filters"]'],
    ] as const) {
      await page.evaluate((r) => {
        location.hash = `#/${r}`
      }, route)
      await expect(page.locator(selector)).toBeVisible()
      await page.evaluate(() => window.scrollTo(0, 500))
      const stickyCheck = await page.evaluate((sel) => {
        const hdr = document.querySelector('header')!
        const side = document.querySelector(sel)!
        return {
          headerBottom: hdr.getBoundingClientRect().bottom,
          sideTop: side.getBoundingClientRect().top,
        }
      }, selector)
      expect(stickyCheck.sideTop, `${route} sticky filter clears header`).toBeGreaterThanOrEqual(
        stickyCheck.headerBottom - 1,
      )
    }

    // 3. Designer StageView keeps healthy preview width at 1024x600 with unfolded sidebar; GuidedView clears header at 375px.
    await page.evaluate(() => {
      localStorage.setItem('fc.designer.view', 'stage')
      location.hash = '#/designer/builtin.neon-sign'
    })
    await page.setViewportSize({ width: 1024, height: 600 })
    await expect(page.locator('figure[aria-label*="alert preview"]')).toBeVisible()
    const stageWidth = await page
      .locator('figure[aria-label*="alert preview"]')
      .evaluate((el) => el.getBoundingClientRect().width)
    expect(stageWidth).toBeGreaterThanOrEqual(360)

    await page.evaluate(() => {
      localStorage.setItem('fc.designer.view', 'guided')
      location.hash = '#/designer/builtin.neon-sign'
    })
    await page.reload()
    await page.setViewportSize({ width: 375, height: 812 })
    await expect(page.locator('aside[aria-label="Preview"]')).toBeVisible()
    await page.evaluate(() => window.scrollTo(0, 320))
    const guidedPos = await page.evaluate(() => {
      const hdr = document.querySelector('header')!
      const aside = document.querySelector('aside[aria-label="Preview"]')!
      return {
        headerBottom: hdr.getBoundingClientRect().bottom,
        asideTop: aside.getBoundingClientRect().top,
      }
    })
    expect(guidedPos.asideTop).toBeGreaterThanOrEqual(guidedPos.headerBottom - 1)

    // 4. Chat stays mounted (preserves composer DOM node, typed text & focus) across 1024px.
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.evaluate(() => {
      location.hash = '#/chat'
    })
    const composer = page.getByRole('textbox', { name: 'Message' })
    await expect(composer).toBeVisible()
    await composer.focus()
    await composer.fill('persist across 1024px resize')
    await page.evaluate(() => {
      ;(window as unknown as { __composerEl?: Element | null }).__composerEl =
        document.activeElement
    })
    for (const vp of [
      { width: 900, height: 700 },
      { width: 1024, height: 600 },
      { width: 1280, height: 800 },
    ]) {
      await page.setViewportSize(vp)
      await page.waitForTimeout(40)
      const preserved = await page.evaluate(() => {
        const w = window as unknown as { __composerEl?: HTMLInputElement | null }
        return {
          sameNode: document.activeElement === w.__composerEl,
          value: w.__composerEl?.value ?? '',
        }
      })
      expect(preserved.sameNode, `composer remounted at ${vp.width}px`).toBe(true)
      expect(preserved.value).toBe('persist across 1024px resize')
    }

    // 5. Alerts DockHandle writes localStorage once on mouseup, not mid-drag.
    await page.evaluate(() => {
      location.hash = '#/alerts/sub'
    })
    await expect(page.getByTestId('alert-editor')).toBeVisible()
    await page.evaluate(() => {
      const w = window as unknown as { __dockWrites?: number }
      w.__dockWrites = 0
      const orig = Storage.prototype.setItem
      Storage.prototype.setItem = function (k: string, v: string) {
        if (k === 'fc-alerts-dock-left') w.__dockWrites = (w.__dockWrites ?? 0) + 1
        return orig.call(this, k, v)
      }
    })
    const leftHandle = page.locator('[data-dock-handle="left"]')
    const hBox = (await leftHandle.boundingBox())!
    await page.mouse.move(hBox.x + hBox.width / 2, hBox.y + hBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(hBox.x + 50, hBox.y + hBox.height / 2, { steps: 8 })
    await page.waitForTimeout(40)
    const midDockWrites = await page.evaluate(
      () => (window as unknown as { __dockWrites?: number }).__dockWrites ?? 0,
    )
    expect(midDockWrites).toBe(0)
    await page.mouse.up()
    await page.waitForTimeout(40)
    const endDockWrites = await page.evaluate(
      () => (window as unknown as { __dockWrites?: number }).__dockWrites ?? 0,
    )
    expect(endDockWrites).toBe(1)

    // 6. Opening a Dialog uses data-scroll-lock without mutating html.style.
    await page.evaluate(() => {
      location.hash = '#/overlays'
    })
    await page.getByRole('button', { name: 'New overlay' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    const scrollLock = await page.evaluate(() => ({
      lock: document.documentElement.dataset.scrollLock,
      inlineOverflow: document.documentElement.style.overflow,
      inlineGutter: document.documentElement.style.scrollbarGutter,
    }))
    expect(scrollLock.lock).toBe('true')
    expect(scrollLock.inlineOverflow).toBe('')
    expect(scrollLock.inlineGutter).toBe('')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
  })
})
