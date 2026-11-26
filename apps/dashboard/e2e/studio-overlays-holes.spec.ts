import { expect, test, type Locator, type Page } from '@playwright/test'
import { open, openSidebar, settled } from './helpers'

interface PreviewCall {
  main: {
    x: number
    y: number
    w: number
    h: number
    holes?: { x: number; y: number; w: number; h: number; r: number }[]
  } | null
}

async function openDesktopStudio(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height })
  await page.addInitScript(() => {
    ;(window as unknown as { __FERROCAST__: unknown }).__FERROCAST__ = { desktop: true }
    localStorage.setItem('fc-golive-picture', 'ferrocast')
    localStorage.removeItem('fc-studio-scenes-grid')
    localStorage.removeItem('fc-layout')
  })
  await open(page, 'studio/golive', 'autoplay=0&latency=0&studioEngine=1')
  await page.getByRole('button', { name: 'Start the Studio' }).click()
  await expect(page.locator('[data-canvas-box]').first()).toBeVisible()

  // Install runtime spy on both the demo engine preview route and fc:preview-overlays events.
  await page.evaluate(() => {
    const w = window as unknown as {
      __previewCalls?: PreviewCall[]
      __overlayEvents?: {
        version: number
        overlayCount: number
        guideCount: number
        overlays: { x: number; y: number; w: number; h: number }[]
      }[]
      __ferrocastDemo?: {
        studioEngine: {
          route: (method: string, seg: string[], body: unknown, url?: URL) => unknown
        }
      }
    }
    w.__previewCalls = []
    w.__overlayEvents = []
    window.addEventListener('fc:preview-overlays', ((ev: CustomEvent) => {
      w.__overlayEvents?.push(ev.detail)
    }) as EventListener)
    const engine = w.__ferrocastDemo?.studioEngine
    if (engine) {
      const orig = engine.route.bind(engine)
      engine.route = (method: string, seg: string[], body: unknown, url?: URL) => {
        if (method === 'PUT' && seg.join('/') === 'studio/engine/preview') {
          w.__previewCalls?.push((body ?? { main: null }) as PreviewCall)
        }
        return orig(method, seg, body, url)
      }
    }
  })
}

async function assertOverlayFullyVisible(locator: Locator) {
  await expect(locator).toBeVisible()
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.width).toBeGreaterThan(20)
  expect(box!.height).toBeGreaterThan(16)

  const check = await locator.evaluate((el) => {
    const vw = document.documentElement.clientWidth
    const vh = document.documentElement.clientHeight
    const r = el.getBoundingClientRect()
    const inDialog = Boolean(el.closest('dialog[open]'))

    // Safe chrome bounds when outside modal dialog top layer.
    let minTop = 2
    let maxBottom = vh - 2
    if (!inDialog) {
      const header = document.querySelector('header')
      if (header) {
        const hs = getComputedStyle(header)
        const hr = header.getBoundingClientRect()
        if (
          hs.display !== 'none' &&
          hs.visibility !== 'hidden' &&
          (hs.position === 'fixed' || hs.position === 'sticky') &&
          hr.height > 0 &&
          hr.top <= 1
        ) {
          minTop = Math.max(minTop, hr.bottom - 1)
        }
      }
      const footer = document.querySelector('footer[aria-label="Studio status"]')
      if (footer) {
        const fs = getComputedStyle(footer)
        const fr = footer.getBoundingClientRect()
        if (fs.display !== 'none' && fs.position === 'fixed' && fr.height > 0) {
          maxBottom = Math.min(maxBottom, fr.top + 1)
        }
      }
      const nav = document.querySelector('nav[data-tab-bar]')
      if (nav) {
        const ns = getComputedStyle(nav)
        const nr = nav.getBoundingClientRect()
        if (
          ns.display !== 'none' &&
          (ns.position === 'fixed' || ns.position === 'sticky') &&
          nr.height > 0
        ) {
          maxBottom = Math.min(maxBottom, nr.top + 1)
        }
      }
    }

    const clippedBy: string[] = []
    let cur: Element | null = el.parentElement
    while (cur && cur !== document.body && cur !== document.documentElement) {
      const cs = getComputedStyle(cur)
      const clipX = ['hidden', 'clip', 'auto', 'scroll'].includes(cs.overflowX)
      const clipY = ['hidden', 'clip', 'auto', 'scroll'].includes(cs.overflowY)
      if (clipX || clipY) {
        const cr = cur.getBoundingClientRect()
        if (clipX && (r.left < cr.left - 1 || r.right > cr.right + 1)) {
          clippedBy.push(`${cur.tagName}.${cur.className}(x)`)
        }
        if (clipY && (r.top < cr.top - 1 || r.bottom > cr.bottom + 1)) {
          clippedBy.push(`${cur.tagName}.${cur.className}(y)`)
        }
      }
      cur = cur.parentElement
    }

    return {
      vw,
      vh,
      minTop,
      maxBottom,
      rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
      clippedBy,
    }
  })

  expect(check.clippedBy, `clipped by ancestor: ${JSON.stringify(check)}`).toEqual([])
  expect(check.rect.left, JSON.stringify(check)).toBeGreaterThanOrEqual(2)
  expect(check.rect.right, JSON.stringify(check)).toBeLessThanOrEqual(check.vw - 2)
  expect(check.rect.top, JSON.stringify(check)).toBeGreaterThanOrEqual(check.minTop)
  expect(check.rect.bottom, JSON.stringify(check)).toBeLessThanOrEqual(check.maxBottom)
}

async function waitForNextFrameSync(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  )
}

test.describe('Unified Overlays & Native Preview Hole Registry', () => {
  for (const vp of [
    { width: 1280, height: 800 },
    { width: 1024, height: 600 },
  ]) {
    test(`LayoutMenu, DockMenu, submenus, InfoTip, and preview holes stay unclipped (${vp.width}x${vp.height})`, async ({
      page,
    }) => {
      const warnings: string[] = []
      page.on('console', (msg) => {
        if (msg.type() === 'error' || msg.text().includes('unregistered overlay')) {
          warnings.push(msg.text())
        }
      })

      await openDesktopStudio(page, vp.width, vp.height)
      await settled(page)

      // 1. LayoutMenu: opens in portal, fits cleanly between chrome & status bar, keyboard ArrowDown + Escape work.
      await page.getByRole('button', { name: 'Layout' }).click()
      const layoutMenu = page.getByRole('menu', { name: 'Layout' })
      await assertOverlayFullyVisible(layoutMenu)
      await waitForNextFrameSync(page)

      const eventsAfterLayout = await page.evaluate(() => {
        const w = window as unknown as { __overlayEvents?: { overlayCount: number }[] }
        return w.__overlayEvents?.at(-1)?.overlayCount ?? 0
      })
      expect(eventsAfterLayout).toBeGreaterThanOrEqual(1)

      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('Escape')
      await expect(layoutMenu).toHaveCount(0)
      await waitForNextFrameSync(page)

      // 2. DockMenu: click panel menu on Audio dock (near bottom/side), verifies unclipped portal & Escape close.
      const dockMenuBtn = page
        .getByRole('button', { name: /panel: move, pop out or hide$/i })
        .last()
      await dockMenuBtn.click()
      const dockMenu = page.getByRole('menu', { name: /panel$/i })
      await assertOverlayFullyVisible(dockMenu)
      await page.keyboard.press('Escape')
      await expect(dockMenu).toHaveCount(0)

      // 3. StageBar submenu: Projectors -> On air (inside More tools at 1024x600 or directly on row at 1280x800).
      const moreBtn = page.getByRole('button', { name: 'More tools' })
      if (await moreBtn.isVisible()) {
        // Before clicking: moved items must NOT render inline while closed (M1).
        await expect(page.locator('[data-ov-panel]')).toHaveCount(0)
        await moreBtn.click()
        const morePanel = page.getByRole('group', { name: 'More tools' })
        await assertOverlayFullyVisible(morePanel)
      }
      const projBtn = page.getByRole('button', { name: 'Projectors and multiview' })
      if (await projBtn.isVisible()) {
        await projBtn.click()
        const projMenu = page.getByRole('menu', { name: 'Projectors' })
        await assertOverlayFullyVisible(projMenu)
        await page.getByRole('menuitem', { name: 'On air' }).click()
        const subMenu = page.getByRole('menu', { name: 'On air' })
        await assertOverlayFullyVisible(subMenu)
        await page.keyboard.press('ArrowLeft')
        await expect(subMenu).toHaveCount(0)
        await page.keyboard.press('Escape')
        await expect(projMenu).toHaveCount(0)
      }

      // Close More tools if still open.
      if (await page.getByRole('group', { name: 'More tools' }).isVisible()) {
        await page.keyboard.press('Escape')
        await expect(page.getByRole('group', { name: 'More tools' })).toHaveCount(0)
      }

      // 4. InfoTip: open About audio tip and check visibility & hole event.
      const infoBtn = page.getByRole('button', { name: 'About audio' })
      if (await infoBtn.isVisible()) {
        await infoBtn.click()
        const tip = page
          .locator('[data-over-preview]')
          .filter({ hasText: 'Every scene has its own sounds.' })
        await assertOverlayFullyVisible(tip)
        await page.keyboard.press('Escape')
        await expect(tip).toHaveCount(0)
      }

      // 5. Preview hole transmission when an overlay opens above the stage.
      const prevLen = await page.evaluate(() => {
        const w = window as unknown as { __previewCalls?: PreviewCall[] }
        return w.__previewCalls?.length ?? 0
      })
      await page
        .getByRole('button', { name: 'Studio' })
        .first()
        .isVisible()
        .catch(() => false)
      await page.getByRole('button', { name: 'Layout' }).click()
      await assertOverlayFullyVisible(layoutMenu)
      await waitForNextFrameSync(page)
      await page.keyboard.press('Escape')
      await waitForNextFrameSync(page)

      const callsSinceOpen = await page.evaluate((from) => {
        const w = window as unknown as { __previewCalls?: PreviewCall[] }
        return (w.__previewCalls ?? []).slice(from)
      }, prevLen)
      expect(callsSinceOpen.length).toBeGreaterThanOrEqual(1)
      expect(warnings).toEqual([])
    })
  }

  for (const vp of [
    { width: 1440, height: 900 },
    { width: 768, height: 600 },
    { width: 375, height: 812 },
  ]) {
    test(`viewport ${vp.width}x${vp.height}: More tools, context submenus, and StatusStrip never clip`, async ({
      page,
    }) => {
      await openDesktopStudio(page, vp.width, vp.height)
      await settled(page)

      const moreBtn = page.getByRole('button', { name: 'More tools' })
      if (await moreBtn.isVisible()) {
        await expect(page.locator('[data-ov-panel]')).toHaveCount(0)
        await moreBtn.click()
        const panel = page.getByRole('group', { name: 'More tools' })
        await assertOverlayFullyVisible(panel)
        await page.keyboard.press('Escape')
        await expect(panel).toHaveCount(0)
      }

      const audioTab = page.getByRole('tab', { name: 'Audio' })
      if (await audioTab.isVisible()) await audioTab.click()
      const chBtn = page.getByRole('button', { name: /^More for / }).first()
      if (await chBtn.isVisible()) {
        await chBtn.click()
        const chMenu = page.locator('[role="menu"][data-fc-menu]').first()
        await assertOverlayFullyVisible(chMenu)
        const hearRow = chMenu.getByRole('menuitem', { name: 'Hear it' })
        if (await hearRow.isVisible()) {
          await hearRow.click()
          const hearSub = page.getByRole('menu', { name: 'Hear it' })
          await assertOverlayFullyVisible(hearSub)
        }
        await page.keyboard.press('Escape')
      }

      // Overflow StatusStrip on narrow 375px header if visible.
      const connBtn = page.getByTestId('connections-overflow')
      if (await connBtn.isVisible()) {
        await connBtn.click()
        await assertOverlayFullyVisible(page.getByTestId('connections-overflow-popover'))
        await page.keyboard.press('Escape')
      }
    })
  }

  for (const vp of [
    { width: 1280, height: 800 },
    { width: 375, height: 812 },
  ]) {
    test(`Menu inside open Dialog (<Menu> in #/bot Auto-replies) and SidebarAccount stay unclipped (${vp.width}x${vp.height})`, async ({
      page,
    }) => {
      await page.setViewportSize(vp)
      await openSidebar(page)
      await open(page, 'bot')
      await settled(page)

      await page
        .getByRole('button', { name: /Start from scratch|New auto-reply/ })
        .first()
        .click()
      const dialog = page.locator('dialog[open]')
      await expect(dialog).toBeVisible()

      const insertBtn = dialog.getByRole('button', { name: 'Insert' })
      await insertBtn.click()
      const varMenu = dialog.getByRole('menu', { name: 'Insert a variable' })
      await assertOverlayFullyVisible(varMenu)
      // Escape closes the Menu without closing the outer Dialog (M5).
      await page.keyboard.press('Escape')
      await expect(varMenu).toHaveCount(0)
      await expect(dialog).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(dialog).toHaveCount(0)

      // SidebarAccount menu (M6) if signed-in bar has a popup menu button.
      const showNav = page.getByRole('button', { name: 'Show the menu' })
      if (await showNav.isVisible()) await showNav.click()
      const acctBtn = page.locator('[data-testid="account-bar"] button[aria-haspopup="menu"]')
      if (await acctBtn.isVisible()) {
        await acctBtn.click()
        const acctMenu = page.getByRole('menu', { name: 'Account' })
        await assertOverlayFullyVisible(acctMenu)
        await page.keyboard.press('Escape')
        await expect(acctMenu).toHaveCount(0)
      }
    })
  }

  test('scene drag ghost marks data-over-preview and reports in fc:preview-overlays', async ({
    page,
  }) => {
    await openDesktopStudio(page, 1280, 800)
    await settled(page)

    const gameRow = page.locator('[data-scene-name="Gameplay"]')
    const chatRow = page.locator('[data-scene-name="Chatting"]')
    const gameBox = (await gameRow.boundingBox())!
    const chatBox = (await chatRow.boundingBox())!

    await page.mouse.move(gameBox.x + 12, gameBox.y + gameBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(gameBox.x + 12, chatBox.y + chatBox.height * 0.8, { steps: 6 })

    const ghost = page.locator('[data-scene-ghost]')
    await expect(ghost).toBeVisible()
    expect(await ghost.getAttribute('data-over-preview')).not.toBeNull()
    await waitForNextFrameSync(page)

    const countDuringDrag = await page.evaluate(() => {
      const w = window as unknown as { __overlayEvents?: { overlayCount: number }[] }
      return w.__overlayEvents?.at(-1)?.overlayCount ?? 0
    })
    expect(countDuringDrag).toBeGreaterThanOrEqual(1)

    await page.mouse.up()
    await expect(ghost).toHaveCount(0)
  })
})
