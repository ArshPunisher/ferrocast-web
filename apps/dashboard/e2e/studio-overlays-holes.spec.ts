import { expect, test, type Locator, type Page } from '@playwright/test'
import { open, openSidebar, settled } from './helpers'

interface PreviewSlotCall {
  x: number
  y: number
  w: number
  h: number
  opacity?: number
  holes?: { x: number; y: number; w: number; h: number; r: number }[]
}

interface PreviewCall {
  rect: PreviewSlotCall | null
  program?: PreviewSlotCall | null
  vertical?: PreviewSlotCall | null
}

async function openDesktopStudio(
  page: Page,
  width: number,
  height: number,
  seedLayout?: Record<string, unknown>,
) {
  await page.setViewportSize({ width, height })
  await page.addInitScript(
    (layoutJson: string | null) => {
      ;(window as unknown as { __FERROCAST__: unknown }).__FERROCAST__ = { desktop: true }
      localStorage.setItem('fc-golive-picture', 'ferrocast')
      localStorage.removeItem('fc-studio-scenes-grid')
      if (layoutJson) localStorage.setItem('fc-studio-layout', layoutJson)
      else localStorage.removeItem('fc-studio-layout')
    },
    seedLayout ? JSON.stringify(seedLayout) : null,
  )
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
          w.__previewCalls?.push((body ?? { rect: null }) as PreviewCall)
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
      const header =
        document.querySelector('header[data-app-header]') ?? document.querySelector('header')
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
    const stopAt = inDialog ? el.closest('dialog[open]') : null
    let cur: Element | null = el.parentElement
    while (cur && cur !== stopAt && cur !== document.body && cur !== document.documentElement) {
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
        if (msg.type() === 'error' || msg.text().includes('without PreviewOverlayRegistry')) {
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

      // 4. InfoTip: open About audio tip and check visibility, <=300px cap (F4), & hole event.
      const infoBtn = page.getByRole('button', { name: 'About audio' })
      if (await infoBtn.isVisible()) {
        // The pointer is still where the last click left it. Linux WebKit re-hovers whatever
        // lands under a resting pointer after a layout change, which opens that control's
        // tip over the button we click next. Park the pointer and let any such tip close.
        await page.mouse.move(0, 0)
        await expect(page.getByRole('tooltip')).toHaveCount(0)
        await infoBtn.click()
        const tip = page
          .locator('[data-over-preview]')
          .filter({ hasText: 'Every scene has its own sounds.' })
        await assertOverlayFullyVisible(tip)
        const tipBox = await tip.boundingBox()
        expect(tipBox).not.toBeNull()
        expect(tipBox!.width).toBeLessThanOrEqual(300)
        await page.keyboard.press('Escape')
        await expect(tip).toHaveCount(0)
      }

      // 5. Preview hole transmission when a centered overlay Dialog opens above the stage and clears on close.
      const addSourceBtn = page.getByRole('button', { name: /^Add a source to / })
      await expect(addSourceBtn).toBeVisible()
      const prevLen = await page.evaluate(() => {
        const w = window as unknown as { __previewCalls?: PreviewCall[] }
        return w.__previewCalls?.length ?? 0
      })
      await addSourceBtn.click()
      const dialog = page.locator('dialog[open]')
      await expect(dialog).toBeVisible()
      const card = dialog.locator('[data-over-preview]').first()
      await assertOverlayFullyVisible(card)
      await waitForNextFrameSync(page)

      const stageBoxRect = (await page.locator('[data-stage-bg]').first().boundingBox())!
      const cardRect = (await card.boundingBox())!
      const callsWhileOpen = await page.evaluate((from) => {
        const w = window as unknown as { __previewCalls?: PreviewCall[] }
        return (w.__previewCalls ?? []).slice(from)
      }, prevLen)
      const lastOpenCall = callsWhileOpen.at(-1)
      expect(lastOpenCall?.rect).toBeTruthy()
      const overlap = {
        left: Math.max(0, cardRect.x - stageBoxRect.x),
        top: Math.max(0, cardRect.y - stageBoxRect.y),
        right: Math.min(stageBoxRect.width, cardRect.x - stageBoxRect.x + cardRect.width),
        bottom: Math.min(stageBoxRect.height, cardRect.y - stageBoxRect.y + cardRect.height),
      }
      const openHoles = lastOpenCall?.rect?.holes ?? []
      expect(
        openHoles.some(
          (h) =>
            h.x <= overlap.left + 4 &&
            h.y <= overlap.top + 4 &&
            h.x + h.w >= overlap.right - 4 &&
            h.y + h.h >= overlap.bottom - 4,
        ),
        `expected stage hole covering dialog intersection ${JSON.stringify({ overlap, openHoles })}`,
      ).toBe(true)

      const beforeCloseLen = await page.evaluate(() => {
        const w = window as unknown as { __previewCalls?: PreviewCall[] }
        return w.__previewCalls?.length ?? 0
      })
      await page.keyboard.press('Escape')
      await expect(dialog).toHaveCount(0)
      await waitForNextFrameSync(page)
      const callsAfterClose = await page.evaluate((from) => {
        const w = window as unknown as { __previewCalls?: PreviewCall[] }
        return (w.__previewCalls ?? []).slice(from)
      }, beforeCloseLen)
      expect(callsAfterClose.length).toBeGreaterThanOrEqual(1)
      const closedHoles = callsAfterClose.at(-1)?.rect?.holes ?? []
      expect(
        closedHoles.some(
          (h) =>
            h.x <= overlap.left + 4 &&
            h.y <= overlap.top + 4 &&
            h.x + h.w >= overlap.right - 4 &&
            h.y + h.h >= overlap.bottom - 4,
        ),
      ).toBe(false)
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
        const panelBox = await panel.boundingBox()
        expect(panelBox).not.toBeNull()
        expect(panelBox!.width).toBeLessThanOrEqual(320)
        const panelOverflow = await panel.evaluate((el) => el.scrollWidth > el.clientWidth + 1)
        expect(panelOverflow).toBe(false)
        await page.keyboard.press('Escape')
        await expect(panel).toHaveCount(0)
      }

      const audioTab = page
        .locator('label')
        .filter({ hasText: /^Audio$/ })
        .or(page.getByRole('tab', { name: 'Audio' }))
      if (await audioTab.first().isVisible()) await audioTab.first().click()
      const chBtn = page.getByRole('button', { name: /^More for / }).first()
      await chBtn.scrollIntoViewIfNeeded()
      await chBtn.click({ force: true })
      const chMenu = page.locator('[role="menu"][data-fc-menu]').first()
      await assertOverlayFullyVisible(chMenu)
      const hearRow = chMenu.getByRole('menuitem', { name: 'Hear it' })
      if (await hearRow.isVisible()) {
        await hearRow.click()
        const hearSub = page.getByRole('menu', { name: 'Hear it' })
        await assertOverlayFullyVisible(hearSub)
      }
      await page.keyboard.press('Escape')

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

  test('More tools moves keyboard focus, Escape keeps panel open above closed MenuList, and Shift+Tab restores trigger focus (F3)', async ({
    page,
  }) => {
    await openDesktopStudio(page, 1024, 600)
    await settled(page)

    const moreBtn = page.getByRole('button', { name: 'More tools' })
    await expect(moreBtn).toBeVisible()
    await moreBtn.click()
    const morePanel = page.getByRole('group', { name: 'More tools' })
    await assertOverlayFullyVisible(morePanel)

    const focusedInside = await morePanel.evaluate((el) => el.contains(document.activeElement))
    expect(focusedInside).toBe(true)

    const projBtn = page.getByRole('button', { name: 'Projectors and multiview' })
    if (await projBtn.isVisible()) {
      await projBtn.click()
      const projMenu = page.getByRole('menu', { name: 'Projectors' })
      await assertOverlayFullyVisible(projMenu)
      await page.keyboard.press('Escape')
      await expect(projMenu).toHaveCount(0)
      await assertOverlayFullyVisible(morePanel)
    }

    const firstFocusable = morePanel.locator('button:not(:disabled), [tabindex="0"]').first()
    await firstFocusable.focus()
    await page.keyboard.press('Shift+Tab')
    await expect(morePanel).toHaveCount(0)
    const backOnTrigger = await moreBtn.evaluate((btn) => document.activeElement === btn)
    expect(backOnTrigger).toBe(true)
  })

  test('dynamic dialog height growth updates fc:preview-overlays via ResizeObserver (F1)', async ({
    page,
  }) => {
    await openDesktopStudio(page, 1280, 800)
    await settled(page)

    await page.getByRole('button', { name: 'Layout' }).click()
    await page.getByRole('menuitem', { name: /Add a web panel/ }).click()
    const dialog = page.locator('dialog[open]')
    const card = dialog.locator('[data-over-preview]').first()
    await assertOverlayFullyVisible(card)
    await waitForNextFrameSync(page)

    const initialH = (await card.boundingBox())!.height
    expect(initialH).toBeLessThan(500)
    await card.evaluate((el) => {
      const filler = document.createElement('div')
      filler.dataset.testGrowth = '1'
      filler.style.height = '180px'
      filler.style.flexShrink = '0'
      el.appendChild(filler)
    })
    await waitForNextFrameSync(page)

    const grownH = (await card.boundingBox())!.height
    expect(grownH).toBeGreaterThanOrEqual(initialH + 100)
    await expect
      .poll(async () => {
        return await page.evaluate((minH) => {
          const w = window as unknown as {
            __overlayEvents?: { overlays: { h: number }[] }[]
          }
          const list = w.__overlayEvents?.at(-1)?.overlays ?? []
          return list.find((o) => o.h >= minH + 100)?.h ?? null
        }, initialH)
      })
      .not.toBeNull()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  })

  test('phone float stays below preview and Panel switcher at 375px (F11)', async ({ page }) => {
    await openDesktopStudio(page, 375, 812, {
      left: ['scenes', 'sources'],
      right: ['golive'],
      bottom: ['audio'],
      float: { chat: { x: 80, y: 80, w: 300, h: 220 } },
      hidden: ['events'],
      mob: 'chat',
      lw: 240,
      rw: 240,
      bh: 200,
      w: { scenes: 1, sources: 1, audio: 1, golive: 1 },
      locked: false,
      preset: null,
      webs: [],
    })
    await settled(page)

    const stageBox = (await page.locator('[data-stage]').boundingBox())!
    const switcherBox = (await page.getByRole('radiogroup', { name: 'Panel' }).boundingBox())!
    const floatDockBox = (await page.locator('[data-dock="chat"]').boundingBox())!
    expect(stageBox.y + stageBox.height).toBeLessThanOrEqual(switcherBox.y + 4)
    expect(switcherBox.y + switcherBox.height).toBeLessThanOrEqual(floatDockBox.y + 4)
  })
})
