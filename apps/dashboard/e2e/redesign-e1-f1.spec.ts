import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { open } from './helpers'

async function assertNoOverflow(page: Page, width: number) {
  const metrics = await page.evaluate(() => {
    const doc = document.documentElement
    const topbar = document.querySelector('[data-testid="topbar"]')
    const strip = document.querySelector('ul[aria-label="Connections"]')
    return {
      docScrollW: doc.scrollWidth,
      innerW: window.innerWidth,
      topbarScrollW: topbar ? topbar.scrollWidth : 0,
      topbarClientW: topbar ? topbar.clientWidth : 0,
      stripScrollW: strip ? strip.scrollWidth : 0,
      stripClientW: strip ? strip.clientWidth : 0,
    }
  })

  expect(metrics.docScrollW, `doc scrollWidth at ${width}px`).toBeLessThanOrEqual(metrics.innerW)
  expect(metrics.docScrollW, `doc scrollWidth <= viewport ${width}px`).toBeLessThanOrEqual(width)
  expect(metrics.topbarClientW, `topbar rendered at ${width}px`).toBeGreaterThan(0)
  expect(
    metrics.topbarScrollW,
    `topbar scrollWidth <= clientWidth at ${width}px`,
  ).toBeLessThanOrEqual(metrics.topbarClientW)
  if (metrics.stripClientW > 0) {
    expect(
      metrics.stripScrollW,
      `strip scrollWidth <= clientWidth at ${width}px`,
    ).toBeLessThanOrEqual(metrics.stripClientW)
  }

  const panic = page.getByRole('button', { name: /^Panic/ })
  await expect(panic).toBeVisible()
  const panicBox = await panic.boundingBox()
  expect(panicBox).not.toBeNull()
  expect(panicBox!.x).toBeGreaterThanOrEqual(0)
  expect(panicBox!.x + panicBox!.width).toBeLessThanOrEqual(width + 0.5)
}

test.describe('F1 Top Bar responsive degrade and zero horizontal overflow', () => {
  for (const vp of [
    { width: 2560, height: 1080, expectedMode: 'full' },
    { width: 1440, height: 900, expectedMode: 'full' },
    { width: 1280, height: 800, expectedMode: 'full' },
    { width: 1024, height: 768, expectedMode: 'full' },
    { width: 820, height: 800, expectedMode: 'icons' },
    { width: 375, height: 812, expectedMode: 'overflow' },
  ] as const) {
    test(`fits ${vp.width}px cleanly (${vp.expectedMode}) with zero horizontal scroll`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await open(page, 'chat')
      const strip = page.getByRole('list', { name: 'Connections' })
      await expect(strip).toBeVisible()
      await expect(strip).toHaveAttribute('data-strip-mode', vp.expectedMode)
      await assertNoOverflow(page, vp.width)

      if (vp.expectedMode === 'full') {
        await expect(strip.getByRole('link', { name: /^Twitch: Connected/ })).toContainText(
          'Twitch',
        )
        await expect(page.getByTestId('connections-overflow')).toHaveCount(0)
      } else if (vp.expectedMode === 'icons') {
        await expect(strip.getByRole('link')).toHaveCount(4)
        await expect(page.getByTestId('connections-overflow')).toHaveCount(0)
      } else {
        await expect(strip.getByRole('link')).toHaveCount(1)
        await expect(page.getByTestId('connections-overflow')).toHaveText('+3')
      }
    })
  }

  test('overflow +N popover opens cleanly at 375px, supports Escape/focus return, and navigates', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    // Disconnect Kick first so the +3 trigger carries an attention state.
    await open(page, 'settings/accounts')
    const kickRow = page.locator('#settings-accounts').getByRole('listitem').filter({
      hasText: 'Kick',
    })
    await kickRow.getByRole('button', { name: 'Disconnect' }).click()
    await page
      .getByRole('dialog', { name: 'Disconnect Kick?' })
      .getByRole('button', {
        name: 'Disconnect Kick',
      })
      .click()
    await expect(page.getByText('Kick disconnected.')).toBeVisible()

    await page.goto('./?autoplay=0&latency=0#/chat')
    const trigger = page.getByTestId('connections-overflow')
    await expect(trigger).toBeVisible()
    await expect(trigger).toHaveAttribute('aria-label', /3 other connections, attention needed/)
    await assertNoOverflow(page, 375)

    await trigger.click()
    const popover = page.getByTestId('connections-overflow-popover')
    await expect(popover).toBeVisible()
    await expect(popover.getByRole('link', { name: /YouTube/ })).toBeVisible()
    await expect(popover.getByRole('link', { name: /Kick/ })).toContainText('Not connected')
    await expect(popover.getByRole('link', { name: /OBS/ })).toContainText('Connected')

    const popBox = await popover.boundingBox()
    expect(popBox).not.toBeNull()
    expect(popBox!.x).toBeGreaterThanOrEqual(0)
    expect(popBox!.x + popBox!.width).toBeLessThanOrEqual(375)
    await assertNoOverflow(page, 375)

    // Escape closes and returns focus to +3 button.
    await page.keyboard.press('Escape')
    await expect(popover).toBeHidden()
    await expect(trigger).toBeFocused()

    // Reopen and follow a link to Settings -> Accounts.
    await trigger.click()
    await popover.getByRole('link', { name: /YouTube/ }).click()
    await expect(popover).toBeHidden()
    await expect(page).toHaveURL(/#\/settings\/accounts$/)
  })

  test('Panic stays reachable and works at 375px and 1024px with unfolded sidebar', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await open(page, 'home')
    const panicMobile = page.getByRole('button', { name: /^Panic/ })
    await expect(panicMobile).toBeVisible()
    await panicMobile.click()
    await expect(panicMobile).toHaveAttribute('aria-pressed', 'true')
    await assertNoOverflow(page, 375)

    await page.setViewportSize({ width: 1024, height: 768 })
    await page.getByRole('button', { name: 'Show the menu' }).click()
    await assertNoOverflow(page, 1024)
  })
})

test.describe('E1 Chat + Events full-height resizable dual-pane', () => {
  for (const vp of [
    { width: 1440, height: 900 },
    { width: 1280, height: 800 },
    { width: 1024, height: 768 },
  ] as const) {
    test(`edge-to-edge full-height split and 44px headers at ${vp.width}px`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await open(page, 'chat')
      await assertNoOverflow(page, vp.width)

      const chatHeader = page.getByTestId('chat-pane-header')
      const eventsHeader = page.getByTestId('events-pane-header')
      const chatPane = page.locator('section[aria-labelledby="chat-title"]')
      const eventsPane = page.getByTestId('chat-events-pane')
      const splitter = page.getByTestId('chat-events-splitter')

      await expect(chatHeader).toBeVisible()
      await expect(eventsHeader).toBeVisible()
      await expect(splitter).toBeVisible()

      const chBox = await chatHeader.boundingBox()
      const ehBox = await eventsHeader.boundingBox()
      const cBox = await chatPane.boundingBox()
      const eBox = await eventsPane.boundingBox()
      expect(chBox && ehBox && cBox && eBox).toBeTruthy()

      // Compact 44px headers.
      expect(Math.round(chBox!.height)).toBe(44)
      expect(Math.round(ehBox!.height)).toBe(44)

      // Full-height Events column matching Chat height (no floating mini box) and edge-to-edge width.
      expect(Math.abs(cBox!.height - eBox!.height)).toBeLessThanOrEqual(2)
      expect(eBox!.height).toBeGreaterThan(vp.height - 140)
      expect(eBox!.x + eBox!.width).toBeGreaterThan(vp.width - 30)

      // Zero vertical page scroll.
      const vOverflow = await page.evaluate(
        () => document.documentElement.scrollHeight - window.innerHeight,
      )
      expect(vOverflow).toBeLessThanOrEqual(1)
    })
  }

  test('draggable splitter resizes Chat and Events, supports keyboard, and persists', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, 'chat')

    const splitter = page.getByTestId('chat-events-splitter')
    const eventsPane = page.getByTestId('chat-events-pane')
    const before = await eventsPane.boundingBox()
    const spBox = await splitter.boundingBox()
    expect(before && spBox).toBeTruthy()

    // Drag splitter 100px left to widen Events.
    const cx = spBox!.x + spBox!.width / 2
    const cy = spBox!.y + spBox!.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx - 100, cy, { steps: 6 })
    await page.mouse.up()

    const afterDrag = await eventsPane.boundingBox()
    expect(afterDrag!.width).toBeGreaterThan(before!.width + 80)

    // Keyboard resize: Shift+ArrowRight narrows by 48px, ArrowLeft widens by 16px.
    await splitter.focus()
    const valBeforeKey = Number(await splitter.getAttribute('aria-valuenow'))
    await splitter.press('Shift+ArrowRight')
    await expect(splitter).toHaveAttribute('aria-valuenow', String(valBeforeKey - 48))
    await splitter.press('ArrowLeft')
    await expect(splitter).toHaveAttribute('aria-valuenow', String(valBeforeKey - 32))

    // Width persists across reload.
    await page.reload()
    await expect(splitter).toHaveAttribute('aria-valuenow', String(valBeforeKey - 32))

    // Double click resets to default width (352px at 1440px).
    await splitter.dblclick()
    await expect(splitter).toHaveAttribute('aria-valuenow', '352')
  })

  test('events filter and queue pause control update the live queue footer', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await open(page, 'chat')

    const footer = page.getByTestId('events-queue-footer')
    await expect(footer).toContainText('Alert queue active')
    await expect(footer).toContainText(/\d+ waiting/)

    await page.getByRole('button', { name: 'Pause queue' }).click()
    await expect(footer).toContainText('Alert queue paused')
    await page.getByRole('button', { name: 'Resume queue' }).click()
    await expect(footer).toContainText('Alert queue active')

    const filter = page.getByLabel('Filter events')
    await filter.selectOption('rewards')
    const emptyReset = page.getByRole('button', { name: 'Show all events' })
    if (await emptyReset.isVisible()) {
      await emptyReset.click()
      await expect(filter).toHaveValue('all')
    }
  })

  test('narrow width (375px) switches Events into a tab cleanly with zero overflow', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await open(page, 'chat')
    await expect(page.getByTestId('chat-events-splitter')).toHaveCount(0)

    const viewTabs = page.getByRole('radiogroup', { name: 'View' })
    await expect(viewTabs).toBeVisible()
    await assertNoOverflow(page, 375)

    await viewTabs.getByText('Events', { exact: true }).click()
    const footer = page.getByTestId('events-queue-footer')
    await expect(footer).toBeVisible()
    await expect(footer).toContainText('Alert queue active')
    await assertNoOverflow(page, 375)
  })

  test('passes axe accessibility in light and dark at 1440px and 375px', async ({ page }) => {
    for (const scheme of ['light', 'dark'] as const) {
      for (const vp of [
        { width: 1440, height: 900 },
        { width: 375, height: 812 },
      ]) {
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
        await page.setViewportSize(vp)
        await open(page, 'chat')
        if (vp.width === 375) {
          await page.getByTestId('connections-overflow').click()
          await expect(page.getByTestId('connections-overflow-popover')).toBeVisible()
        }
        const res = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze()
        const bad = res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
        expect(
          bad.map(
            (v) =>
              `${v.id} [${scheme}/${vp.width}]: ${v.nodes.map((n) => `${n.html} :: ${n.failureSummary ?? ''}`).join(' | ')}`,
          ),
        ).toEqual([])
      }
    }
  })
})
